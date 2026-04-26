/**
 * Import faktury zakupu z różnych źródeł:
 * 1. Skan/zdjęcie (JPG/PNG) — OCR via external API
 * 2. PDF — extraction of text
 * 3. EPP (Subiekt/Insert) — parser formatu komunikacji handlowej
 * 4. XML (Fakturownia/wFirma export)
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';

const router = Router();
router.use(authenticate, requireWorkspace);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ── Pattern matching do wyciągania danych z tekstu ──

function extractInvoiceData(text: string): any {
  const result: any = {};

  // Normalize whitespace
  const t = text.replace(/\s+/g, ' ').trim();

  // Numer faktury (różne formaty: FV/123/2026, F/2026/01/001, FV 1/2026 itd.)
  const numberPatterns = [
    /(?:faktura|nr|numer)[:\s]*([A-Z]{1,5}[-\/]?\d{1,5}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /(?:faktura|nr|numer)[:\s]*(FV[\/\s]?\d+[\/\s]?\d+[\/\s]?\d+)/i,
    /\b([A-Z]{2,4}[\/]?\d+[\/]\d+[\/]\d{4})\b/,
  ];
  for (const p of numberPatterns) {
    const m = t.match(p);
    if (m) { result.number = m[1]; break; }
  }

  // NIP sprzedawcy (10 cyfr, często z separatorami)
  const nipPatterns = [
    /NIP[:\s]*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})/g,
    /NIP[:\s]*(\d{10})/g,
  ];
  const nips: string[] = [];
  for (const p of nipPatterns) {
    let m;
    while ((m = p.exec(t)) !== null) {
      const nip = m[1].replace(/[-\s]/g, '');
      if (/^\d{10}$/.test(nip) && !nips.includes(nip)) nips.push(nip);
    }
  }
  if (nips.length >= 1) result.sellerNip = nips[0]; // pierwszy NIP = sprzedawca
  if (nips.length >= 2) result.buyerNip = nips[1];

  // Data wystawienia/sprzedaży (format 2026-04-14, 14.04.2026, 14/04/2026)
  const datePatterns = [
    /(?:data[\s\w]*wystawienia|wystawiono)[:\s]*(\d{4}[-\.\/]\d{2}[-\.\/]\d{2})/i,
    /(?:data[\s\w]*wystawienia|wystawiono)[:\s]*(\d{2}[-\.\/]\d{2}[-\.\/]\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{2}\.\d{2}\.\d{4})/,
  ];
  for (const p of datePatterns) {
    const m = t.match(p);
    if (m) {
      const d = m[1];
      // Normalize to YYYY-MM-DD
      if (/^\d{4}[-\.\/]\d{2}[-\.\/]\d{2}$/.test(d)) {
        result.issueDate = d.replace(/[\.\/]/g, '-');
      } else if (/^\d{2}[-\.\/]\d{2}[-\.\/]\d{4}$/.test(d)) {
        const parts = d.replace(/[\.\/]/g, '-').split('-');
        result.issueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      break;
    }
  }

  // Termin płatności
  const dueDatePatterns = [
    /(?:termin[\s\w]*p[ła]atno[śs]ci|do zap[ła]aty do|p[ła]atne do)[:\s]*(\d{4}-\d{2}-\d{2})/i,
    /(?:termin[\s\w]*p[ła]atno[śs]ci|do zap[ła]aty do|p[ła]atne do)[:\s]*(\d{2}\.\d{2}\.\d{4})/i,
  ];
  for (const p of dueDatePatterns) {
    const m = t.match(p);
    if (m) {
      const d = m[1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) result.dueDate = d;
      else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
        const parts = d.split('.');
        result.dueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      break;
    }
  }

  // Kwota do zapłaty (brutto) — szuka "do zapłaty: XXX,XX zł"
  const amountPatterns = [
    /(?:do zap[ła]aty|razem brutto|kwota brutto|suma brutto|[łl]?[aą]cznie)[:\s]+(\d[\d\s]*[,.]?\d{0,2})\s*(?:z[łl]|PLN)?/i,
    /(?:brutto)[:\s]+(\d[\d\s]*[,.]?\d{0,2})/i,
  ];
  for (const p of amountPatterns) {
    const m = t.match(p);
    if (m) {
      const amount = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(amount) && amount > 0) {
        result.totalGross = amount;
        break;
      }
    }
  }

  // Nazwa sprzedawcy — szuka słów przed NIP albo po "Sprzedawca:" / "Wystawca:"
  const sellerNamePatterns = [
    /(?:sprzedawca|wystawca|sprzeda[żj][ąa]cy)[:\s]+([A-ZŁĄĆĘÓŚŻŹŃ][^,\n]{5,80}?)(?=\s+NIP|\s+ul\.|\s*,)/i,
  ];
  for (const p of sellerNamePatterns) {
    const m = t.match(p);
    if (m) { result.sellerName = m[1].trim(); break; }
  }

  return result;
}

// ── OCR endpoint (JPG/PNG/PDF) ──
router.post('/scan', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Brak pliku' }); return; }

    const mimetype = req.file.mimetype;
    let text = '';

    // Try to extract text via OCR.space API (free tier, no key needed for basic)
    try {
      const fd = new FormData();
      const blob = new Blob([req.file.buffer], { type: mimetype });
      fd.append('file', blob, req.file.originalname);
      fd.append('language', 'pol');
      fd.append('isTable', 'true');
      fd.append('scale', 'true');
      fd.append('OCREngine', '2');

      const ocrResp = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { 'apikey': process.env.OCR_SPACE_KEY || 'helloworld' }, // free demo key
        body: fd,
        signal: AbortSignal.timeout(60000),
      });

      if (ocrResp.ok) {
        const data: any = await ocrResp.json();
        if (data?.ParsedResults?.length > 0) {
          text = data.ParsedResults.map((r: any) => r.ParsedText).join('\n');
        }
        if (data?.IsErroredOnProcessing) {
          res.status(500).json({ error: 'Błąd OCR: ' + (data.ErrorMessage?.[0] || 'nieznany') });
          return;
        }
      } else {
        res.status(500).json({ error: 'Błąd OCR API (status ' + ocrResp.status + ')' });
        return;
      }
    } catch (e: any) {
      res.status(500).json({ error: 'Nie udało się przetworzyć pliku: ' + e.message });
      return;
    }

    if (!text) {
      res.status(400).json({ error: 'Nie wykryto tekstu na zdjęciu. Spróbuj lepszej jakości lub PDF.' });
      return;
    }

    // Extract invoice data from OCR text
    const extracted = extractInvoiceData(text);
    res.json({
      rawText: text.slice(0, 3000), // first 3k chars for debug
      extracted,
      confidence: Object.keys(extracted).length >= 3 ? 'high' : Object.keys(extracted).length >= 1 ? 'medium' : 'low',
    });
  } catch (err) { next(err); }
});

// ── XML import (Fakturownia format) ──
router.post('/xml', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Brak pliku' }); return; }
    const xml = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');

    const get = (tag: string, source = xml) => {
      const m = source.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };

    const result: any = {
      number: get('number') || get('numer') || get('Numer'),
      issueDate: get('issue_date') || get('issued') || get('DataWystawienia') || get('P_1'),
      dueDate: get('due_date') || get('payment_to') || get('P_6'),
      sellerName: get('seller_name') || get('Nazwa') || get('P_3C'),
      sellerNip: get('seller_tax_no') || get('NIP') || get('P_4B'),
      buyerName: get('buyer_name') || get('P_3A'),
      buyerNip: get('buyer_tax_no') || get('P_5B'),
      totalNet: parseFloat(get('net_total') || get('P_13_1') || '0'),
      totalVat: parseFloat(get('vat_total') || get('P_14_1') || '0'),
      totalGross: parseFloat(get('gross_total') || get('P_15') || '0'),
    };

    res.json({ extracted: result, confidence: result.number ? 'high' : 'low' });
  } catch (err) { next(err); }
});

// ── EPP import (Subiekt/Insert format) ──
router.post('/epp', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Brak pliku' }); return; }
    const text = req.file.buffer.toString('cp1250'); // EPP używa Windows-1250

    // EPP format: "INFO"...\n"NAGLOWEK"...\n"ZAWARTOSC"...
    const lines = text.split(/\r?\n/);
    const documents: any[] = [];
    let currentDoc: any = null;

    for (const line of lines) {
      const parts = line.split(',').map(p => p.replace(/^"|"$/g, ''));
      const type = parts[0];

      if (type === 'NAGLOWEK') {
        if (currentDoc) documents.push(currentDoc);
        currentDoc = {
          number: parts[2] || parts[1],
          issueDate: parts[7] || parts[8],
          buyerName: parts[10],
          buyerNip: parts[11]?.replace(/[-\s]/g, ''),
          totalNet: parseFloat(parts[20] || '0'),
          totalGross: parseFloat(parts[22] || '0'),
        };
      }
    }
    if (currentDoc) documents.push(currentDoc);

    res.json({ documents, count: documents.length });
  } catch (err) { next(err); }
});

export default router;
