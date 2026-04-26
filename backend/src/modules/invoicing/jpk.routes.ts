/**
 * JPK (Jednolity Plik Kontrolny) — eksport dla Ministerstwa Finansów
 *
 * Obsługiwane struktury:
 * - JPK_FA (3) — Ewidencja faktur sprzedaży VAT
 * - JPK_V7M — Ewidencja VAT + deklaracja miesięczna (uproszczone)
 *
 * Format: XML zgodny ze schematem MF
 * Specyfikacja: https://www.podatki.gov.pl/jednolity-plik-kontrolny/
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

// Escape XML special chars
function esc(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtMoney(v: any): string {
  const n = typeof v === 'number' ? v : parseFloat(v) || 0;
  return n.toFixed(2);
}

// ── JPK_FA (3) — faktury sprzedaży VAT ──
router.get('/fa', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

    // Default: current month
    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Get workspace data (seller)
    const ws = await prisma.workspace.findUnique({
      where: { id: wsId },
      select: { name: true, legalName: true, taxId: true, addressLine1: true, postalCode: true, city: true, country: true, email: true },
    });
    const invSettings = await prisma.workspaceSetting.findMany({
      where: { workspaceId: wsId, key: { in: ['inv_regon'] } },
    });
    const regon = invSettings.find(s => s.key === 'inv_regon')?.value || '';

    // Get invoices in range
    const documents = await prisma.invoiceDocument.findMany({
      where: {
        workspaceId: wsId,
        type: { in: ['SALE_INVOICE', 'CORRECTION', 'ADVANCE', 'FINAL'] },
        status: { in: ['ISSUED', 'SENT', 'PAID', 'PARTIALLY_PAID'] },
        issuedAt: { gte: from, lte: to },
      },
      include: { items: true },
      orderBy: { issuedAt: 'asc' },
    });

    // Count & totals
    const totalCount = documents.length;
    const totalNet = documents.reduce((s, d) => s + Number(d.totalNet), 0);
    const totalVat = documents.reduce((s, d) => s + Number(d.totalVat), 0);
    const totalGross = documents.reduce((s, d) => s + Number(d.totalGross), 0);

    // Generate XML
    const dateStr = now.toISOString().slice(0, 19);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    const invoicesXml = documents.map(d => {
      const itemsXml = d.items.map((it, idx) => `
    <tns:FakturaWiersz>
      <tns:P_2B>${esc(d.number)}</tns:P_2B>
      <tns:P_7>${esc(it.name)}</tns:P_7>
      <tns:P_8A>szt</tns:P_8A>
      <tns:P_8B>${fmtMoney(it.quantity)}</tns:P_8B>
      <tns:P_9A>${fmtMoney(it.priceNet)}</tns:P_9A>
      <tns:P_11>${fmtMoney(it.totalNet)}</tns:P_11>
      <tns:P_12>${esc(it.vatRate)}</tns:P_12>
    </tns:FakturaWiersz>`).join('');

      return `
  <tns:Faktura typ="G">
    <tns:KodWaluty>PLN</tns:KodWaluty>
    <tns:P_1>${d.issuedAt.toISOString().slice(0, 10)}</tns:P_1>
    <tns:P_2A>${esc(d.number)}</tns:P_2A>
    <tns:P_3A>${esc(d.contractorName)}</tns:P_3A>
    <tns:P_3B></tns:P_3B>
    <tns:P_3C>${esc(ws?.legalName || ws?.name)}</tns:P_3C>
    <tns:P_3D>${esc((ws?.addressLine1 || '') + (ws?.postalCode ? ' ' + ws.postalCode : '') + (ws?.city ? ' ' + ws.city : ''))}</tns:P_3D>
    <tns:P_4B>${esc(ws?.taxId)}</tns:P_4B>
    <tns:P_5B>${esc(d.contractorNip)}</tns:P_5B>
    <tns:P_6>${d.issuedAt.toISOString().slice(0, 10)}</tns:P_6>
    <tns:P_13_1>${fmtMoney(d.totalNet)}</tns:P_13_1>
    <tns:P_14_1>${fmtMoney(d.totalVat)}</tns:P_14_1>
    <tns:P_15>${fmtMoney(d.totalGross)}</tns:P_15>
    <tns:RodzajFaktury>VAT</tns:RodzajFaktury>
  </tns:Faktura>${itemsXml}`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tns:JPK xmlns:tns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/" xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/">
  <tns:Naglowek>
    <tns:KodFormularza kodSystemowy="JPK_FA (3)" wersjaSchemy="1-0">JPK_FA</tns:KodFormularza>
    <tns:WariantFormularza>3</tns:WariantFormularza>
    <tns:CelZlozenia>1</tns:CelZlozenia>
    <tns:DataWytworzeniaJPK>${dateStr}</tns:DataWytworzeniaJPK>
    <tns:DataOd>${fromStr}</tns:DataOd>
    <tns:DataDo>${toStr}</tns:DataDo>
    <tns:NazwaSystemu>InfraDesk</tns:NazwaSystemu>
    <tns:KodUrzedu>0000</tns:KodUrzedu>
    <tns:KodWaluty>PLN</tns:KodWaluty>
  </tns:Naglowek>
  <tns:Podmiot1>
    <tns:IdentyfikatorPodmiotu>
      <etd:NIP>${esc(ws?.taxId)}</etd:NIP>
      <etd:PelnaNazwa>${esc(ws?.legalName || ws?.name)}</etd:PelnaNazwa>
      ${regon ? `<etd:REGON>${esc(regon)}</etd:REGON>` : ''}
    </tns:IdentyfikatorPodmiotu>
    <tns:AdresPodmiotu>
      <etd:KodKraju>${esc(ws?.country || 'PL')}</etd:KodKraju>
      <etd:Wojewodztwo></etd:Wojewodztwo>
      <etd:Powiat></etd:Powiat>
      <etd:Gmina></etd:Gmina>
      <etd:Ulica>${esc(ws?.addressLine1)}</etd:Ulica>
      <etd:NrDomu></etd:NrDomu>
      <etd:Miejscowosc>${esc(ws?.city)}</etd:Miejscowosc>
      <etd:KodPocztowy>${esc(ws?.postalCode)}</etd:KodPocztowy>
      <etd:Poczta>${esc(ws?.city)}</etd:Poczta>
    </tns:AdresPodmiotu>
  </tns:Podmiot1>
${invoicesXml}
  <tns:FakturaCtrl>
    <tns:LiczbaFaktur>${totalCount}</tns:LiczbaFaktur>
    <tns:WartoscFaktur>${fmtMoney(totalGross)}</tns:WartoscFaktur>
  </tns:FakturaCtrl>
  <tns:FakturaWierszCtrl>
    <tns:LiczbaWierszyFaktur>${documents.reduce((s, d) => s + d.items.length, 0)}</tns:LiczbaWierszyFaktur>
    <tns:WartoscWierszyFaktur>${fmtMoney(totalNet)}</tns:WartoscWierszyFaktur>
  </tns:FakturaWierszCtrl>
</tns:JPK>`;

    const filename = `JPK_FA_${fromStr.replace(/-/g, '')}_${toStr.replace(/-/g, '')}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) { next(err); }
});

// ── Summary/preview endpoint — what will be in JPK ──
router.get('/fa/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const documents = await prisma.invoiceDocument.findMany({
      where: {
        workspaceId: wsId,
        type: { in: ['SALE_INVOICE', 'CORRECTION', 'ADVANCE', 'FINAL'] },
        status: { in: ['ISSUED', 'SENT', 'PAID', 'PARTIALLY_PAID'] },
        issuedAt: { gte: from, lte: to },
      },
      select: { id: true, number: true, issuedAt: true, contractorName: true, contractorNip: true, totalNet: true, totalVat: true, totalGross: true, status: true },
      orderBy: { issuedAt: 'asc' },
    });

    res.json({
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
      count: documents.length,
      totalNet: documents.reduce((s, d) => s + Number(d.totalNet), 0),
      totalVat: documents.reduce((s, d) => s + Number(d.totalVat), 0),
      totalGross: documents.reduce((s, d) => s + Number(d.totalGross), 0),
      documents,
    });
  } catch (err) { next(err); }
});

export default router;
