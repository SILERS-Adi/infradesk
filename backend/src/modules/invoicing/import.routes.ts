/**
 * Import kontrahentów/produktów z CSV
 * Format CSV: UTF-8, przecinek, pierwszy wiersz = nagłówki
 *
 * Kontrahenci: name,nip,regon,email,phone,address,postalCode,city,country
 * Produkty: name,sku,ean,pkwiu,unit,priceNet,vatRate,category
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Parse CSV — supports comma, semicolon, tab + basic quoted values
function parseCsv(content: string): Record<string, string>[] {
  const text = content.replace(/^\uFEFF/, ''); // strip BOM
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
  const firstLine = lines[0];
  const delim = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';

  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (inQuote && row[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === delim && !inQuote) {
        result.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

// ── Import contractors ──
router.post('/contractors', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Brak pliku CSV' }); return; }
    const wsId = req.workspaceId!;
    const rows = parseCsv(req.file.buffer.toString('utf8'));

    if (rows.length === 0) { res.status(400).json({ error: 'Plik jest pusty lub niepoprawny' }); return; }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const name = row.name || row.nazwa || '';
      if (!name.trim()) { skipped++; continue; }

      const nip = (row.nip || '').replace(/[-\s]/g, '') || null;

      try {
        // Check if exists by NIP or name
        const existing = await prisma.invoicingContractor.findFirst({
          where: {
            workspaceId: wsId,
            OR: [
              nip ? { nip } : undefined,
              { name },
            ].filter(Boolean) as any,
          },
        });

        const data: any = {
          name: name.trim(),
          nip: nip || undefined,
          regon: row.regon || undefined,
          krs: row.krs || undefined,
          email: row.email || undefined,
          phone: row.phone || row.telefon || undefined,
          address: row.address || row.adres || row.ulica || undefined,
          postalCode: row.postalcode || row['kod pocztowy'] || row.zip || undefined,
          city: row.city || row.miasto || undefined,
          country: row.country || row.kraj || 'PL',
          bankName: row.bankname || row['nazwa banku'] || undefined,
          bankAccount: row.bankaccount || row.konto || row.iban || undefined,
          notes: row.notes || row.uwagi || undefined,
        };

        if (existing) {
          await prisma.invoicingContractor.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.invoicingContractor.create({ data: { ...data, workspaceId: wsId } });
          created++;
        }
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`);
        skipped++;
      }
    }

    res.json({ total: rows.length, created, updated, skipped, errors: errors.slice(0, 10) });
  } catch (err) { next(err); }
});

// ── Import products ──
router.post('/products', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Brak pliku CSV' }); return; }
    const wsId = req.workspaceId!;
    const rows = parseCsv(req.file.buffer.toString('utf8'));

    if (rows.length === 0) { res.status(400).json({ error: 'Plik jest pusty lub niepoprawny' }); return; }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const name = row.name || row.nazwa || '';
      if (!name.trim()) { skipped++; continue; }

      try {
        const sku = row.sku || row.kod || null;
        const existing = sku
          ? await prisma.invoicingProduct.findFirst({ where: { workspaceId: wsId, OR: [{ sku }, { name }] as any } })
          : await prisma.invoicingProduct.findFirst({ where: { workspaceId: wsId, name } });

        const data: any = {
          name: name.trim(),
          sku: sku || undefined,
          ean: row.ean || row.barcode || undefined,
          pkwiu: row.pkwiu || undefined,
          productType: row.producttype || row.type || row.typ || 'product',
          category: row.category || row.kategoria || undefined,
          unit: row.unit || row.jednostka || 'szt',
          priceNet: parseFloat((row.pricenet || row.cena || row.price || '0').replace(',', '.')) || 0,
          vatRate: row.vatrate || row.vat || row.stawka || '23',
          notes: row.notes || row.uwagi || undefined,
        };

        if (existing) {
          await prisma.invoicingProduct.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.invoicingProduct.create({ data: { ...data, workspaceId: wsId } });
          created++;
        }
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`);
        skipped++;
      }
    }

    res.json({ total: rows.length, created, updated, skipped, errors: errors.slice(0, 10) });
  } catch (err) { next(err); }
});

// ── Download CSV templates ──
router.get('/template/contractors', (_req, res) => {
  const csv = 'name,nip,regon,email,phone,address,postalCode,city,country,bankName,bankAccount,notes\n' +
    '"Firma Przykładowa Sp. z o.o.",1234567890,123456789,biuro@firma.pl,+48500000000,"ul. Testowa 1",00-000,Warszawa,PL,"mBank","PL00 1140 0000 0000 0000 0000 0000","Stały klient"\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kontrahenci_szablon.csv"');
  res.send('\uFEFF' + csv);
});

router.get('/template/products', (_req, res) => {
  const csv = 'name,sku,ean,pkwiu,unit,priceNet,vatRate,category,notes\n' +
    '"Usługa serwisowa IT",SRV-IT-001,,62.02.30.0,godz,150.00,23,it_services,"Wsparcie 1 godzina"\n' +
    '"Licencja Windows 11 Pro",WIN-11-PRO,,,szt,599.00,23,software,\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="produkty_szablon.csv"');
  res.send('\uFEFF' + csv);
});

export default router;
