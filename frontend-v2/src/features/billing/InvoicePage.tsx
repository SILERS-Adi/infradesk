// Pojedyncza faktura VAT — widok drukowalny (Ctrl+P → PDF).
// P1.17/D4: po confirmed payment webhook automatycznie tworzy Invoice +
// InvoiceItem. Tu klient ją widzi i pobiera (drukuje do PDF z przeglądarki).
//
// KSeF (2026-07): post-MVP — fields w bazie już są (ksefXml/ksefStatus).

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Printer, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface InvoiceItemDto {
  id: string;
  name: string;
  quantity: number;
  unitNet: number;
  vatRate: number;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  unit: string;
}

interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  type: 'VAT' | 'PROFORMA' | 'CORRECTIVE';
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  sellerName: string;
  sellerTaxId: string | null;
  sellerAddress: string;
  buyerName: string;
  buyerTaxId: string | null;
  buyerAddress: string;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  currency: string;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  paymentMethod: string | null;
  paidAt: string | null;
  paidAmount: number | null;
  notes: string | null;
  items: InvoiceItemDto[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(n: number, currency = 'PLN'): string {
  return `${n.toFixed(2)} ${currency}`;
}

export function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery<{ invoice: InvoiceDto }>({
    queryKey: ['billing', 'invoices', id],
    queryFn: async () => (await api.get(`/billing/invoices/${id}`)).data,
    enabled: !!id,
  });

  // Set document title for print
  useEffect(() => {
    if (!data?.invoice) return undefined;
    const orig = document.title;
    document.title = `Faktura ${data.invoice.invoiceNumber}`;
    return () => { document.title = orig; };
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-tx3" />
      </div>
    );
  }
  if (error || !data?.invoice) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <p className="text-tx2 mb-4">Faktura nie znaleziona albo brak dostępu.</p>
        <Link to="/billing" className="text-pri underline">Powrót do rozliczeń</Link>
      </div>
    );
  }

  const inv = data.invoice;

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Non-print top bar */}
      <div className="print:hidden border-b border-bd bg-sf">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between gap-3">
          <Link to="/billing" className="text-[13px] text-tx2 hover:text-pri flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Rozliczenia
          </Link>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="h-4 w-4" /> Drukuj / Zapisz jako PDF
          </Button>
        </div>
      </div>

      {/* Printable area */}
      <div className="max-w-3xl mx-auto px-8 py-10 font-[system-ui] text-[12px]" style={{ color: '#111' }}>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">
              {inv.type === 'PROFORMA' ? 'Faktura proforma' : inv.type === 'CORRECTIVE' ? 'Faktura korygująca' : 'Faktura VAT'}
            </h1>
            <p className="text-[16px] font-mono mt-1">{inv.invoiceNumber}</p>
          </div>
          <div className="text-right text-[11px]">
            <p>Data wystawienia: <strong>{formatDate(inv.issueDate)}</strong></p>
            <p>Data sprzedaży: <strong>{formatDate(inv.saleDate)}</strong></p>
            <p>Termin płatności: <strong>{formatDate(inv.dueDate)}</strong></p>
            {inv.paidAt && (
              <p className="mt-1" style={{ color: '#16a34a' }}>Opłacono: <strong>{formatDate(inv.paidAt)}</strong></p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8 text-[11px]">
          <div>
            <p className="font-bold uppercase tracking-wider text-[10px] mb-2" style={{ color: '#666' }}>Sprzedawca</p>
            <p className="font-semibold">{inv.sellerName}</p>
            {inv.sellerTaxId && <p>NIP: {inv.sellerTaxId}</p>}
            <p className="whitespace-pre-line">{inv.sellerAddress}</p>
          </div>
          <div>
            <p className="font-bold uppercase tracking-wider text-[10px] mb-2" style={{ color: '#666' }}>Nabywca</p>
            <p className="font-semibold">{inv.buyerName}</p>
            {inv.buyerTaxId && <p>NIP: {inv.buyerTaxId}</p>}
            <p className="whitespace-pre-line">{inv.buyerAddress}</p>
          </div>
        </div>

        <table className="w-full text-[11px] border-collapse mb-6" style={{ border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th className="text-left p-2 border" style={{ borderColor: '#ddd' }}>Lp.</th>
              <th className="text-left p-2 border" style={{ borderColor: '#ddd' }}>Nazwa</th>
              <th className="text-right p-2 border" style={{ borderColor: '#ddd' }}>Ilość</th>
              <th className="text-right p-2 border" style={{ borderColor: '#ddd' }}>Cena netto</th>
              <th className="text-right p-2 border" style={{ borderColor: '#ddd' }}>VAT %</th>
              <th className="text-right p-2 border" style={{ borderColor: '#ddd' }}>Netto</th>
              <th className="text-right p-2 border" style={{ borderColor: '#ddd' }}>VAT</th>
              <th className="text-right p-2 border" style={{ borderColor: '#ddd' }}>Brutto</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((item, idx) => (
              <tr key={item.id}>
                <td className="p-2 border" style={{ borderColor: '#ddd' }}>{idx + 1}</td>
                <td className="p-2 border" style={{ borderColor: '#ddd' }}>{item.name}</td>
                <td className="p-2 border text-right" style={{ borderColor: '#ddd' }}>{item.quantity} {item.unit}</td>
                <td className="p-2 border text-right" style={{ borderColor: '#ddd' }}>{formatMoney(item.unitNet, inv.currency)}</td>
                <td className="p-2 border text-right" style={{ borderColor: '#ddd' }}>{item.vatRate}%</td>
                <td className="p-2 border text-right" style={{ borderColor: '#ddd' }}>{formatMoney(item.netTotal, inv.currency)}</td>
                <td className="p-2 border text-right" style={{ borderColor: '#ddd' }}>{formatMoney(item.vatTotal, inv.currency)}</td>
                <td className="p-2 border text-right font-semibold" style={{ borderColor: '#ddd' }}>{formatMoney(item.grossTotal, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-8">
          <table className="text-[12px]">
            <tbody>
              <tr><td className="pr-6 py-1 text-right" style={{ color: '#666' }}>Razem netto:</td><td className="text-right font-semibold">{formatMoney(inv.netTotal, inv.currency)}</td></tr>
              <tr><td className="pr-6 py-1 text-right" style={{ color: '#666' }}>Razem VAT:</td><td className="text-right font-semibold">{formatMoney(inv.vatTotal, inv.currency)}</td></tr>
              <tr style={{ borderTop: '2px solid #111' }}>
                <td className="pr-6 py-2 text-right font-bold text-[14px]">Do zapłaty:</td>
                <td className="text-right font-bold text-[14px]">{formatMoney(inv.grossTotal, inv.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {inv.paidAt && (
          <div className="p-3 mb-6 text-[11px]" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
            <strong>Zapłacono</strong> {formatMoney(inv.paidAmount ?? inv.grossTotal, inv.currency)} — {formatDate(inv.paidAt)} ({inv.paymentMethod ?? 'transfer'}).
          </div>
        )}

        {inv.notes && (
          <div className="text-[11px] mt-6" style={{ color: '#666' }}>
            <p className="font-bold mb-1">Uwagi:</p>
            <p className="whitespace-pre-line">{inv.notes}</p>
          </div>
        )}

        <div className="text-[10px] mt-12 pt-6" style={{ borderTop: '1px solid #ddd', color: '#999' }}>
          <p>Faktura wystawiona automatycznie. Pytania księgowe: biuro@silers.pl</p>
        </div>
      </div>

      <style>{`@media print { body { background: white !important; } @page { margin: 1cm; } }`}</style>
    </div>
  );
}

export default InvoicePage;
