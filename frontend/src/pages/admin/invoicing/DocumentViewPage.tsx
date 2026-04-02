import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { Link } from 'react-router-dom';
import {
  Download, Printer, Mail, Copy, Trash2, Edit3,
  CreditCard, RotateCcw, Building2, User, Calendar, Banknote,
} from 'lucide-react';
import api from '../../../api/client';
import type { Document } from './types';
import { STATUS_MAP, DOC_TITLES, PAYMENT_METHODS } from './constants';
import { fmtPLN, downloadBlob } from './utils';
import toast from 'react-hot-toast';

function InfoBlock({ icon: Icon, label, children }: { icon: typeof Building2; label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export function DocumentViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/invoicing/documents/${id}`);
      setDoc(data);
    } catch {
      toast.error('Nie udało się pobrać dokumentu');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const downloadPdf = async () => {
    if (!doc) return;
    setActionLoading('pdf');
    try {
      const { data } = await api.get(`/invoicing/documents/${doc.id}/pdf`, { responseType: 'blob' });
      downloadBlob(data, `${doc.number.replace(/\//g, '_')}.pdf`);
    } catch {
      toast.error('Nie udało się pobrać PDF');
    } finally {
      setActionLoading('');
    }
  };

  const printDoc = async () => {
    if (!doc) return;
    setActionLoading('print');
    try {
      const { data } = await api.get(`/invoicing/documents/${doc.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const w = window.open(url);
      if (w) w.onload = () => w.print();
    } catch {
      toast.error('Nie udało się otworzyć dokumentu');
    } finally {
      setActionLoading('');
    }
  };

  const duplicateDoc = async () => {
    if (!doc) return;
    setActionLoading('duplicate');
    try {
      const { data } = await api.post(`/invoicing/documents/${doc.id}/duplicate`);
      toast.success('Dokument zduplikowany');
      navigate(`/invoicing/documents/${data.id}`);
    } catch {
      toast.error('Nie udało się zduplikować dokumentu');
    } finally {
      setActionLoading('');
    }
  };

  const deleteDoc = async () => {
    if (!doc) return;
    if (!confirm('Czy na pewno chcesz usunąć ten dokument?')) return;
    setActionLoading('delete');
    try {
      await api.delete(`/invoicing/documents/${doc.id}`);
      toast.success('Dokument usunięty');
      navigate('/invoicing/documents');
    } catch {
      toast.error('Można usunąć tylko dokumenty ze statusem Szkic.');
    } finally {
      setActionLoading('');
    }
  };

  const correctDoc = async () => {
    if (!doc) return;
    setActionLoading('correct');
    try {
      const { data } = await api.post(`/invoicing/documents/${doc.id}/correct`, {
        items: doc.items.map((i) => ({
          name: i.name, unit: i.unit, quantity: i.quantity,
          unit_price_net: i.unit_price_net, vat_rate: i.vat_rate,
          discount_percent: i.discount_percent,
        })),
      });
      toast.success('Korekta utworzona');
      navigate(`/invoicing/documents/${data.id}`);
    } catch {
      toast.error('Korekta możliwa tylko dla faktur sprzedaży/zakupu.');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!doc) {
    return (
      <>
        <PageHeader title="Dokument" back="/invoicing/documents" />
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--tm)', fontSize: 15 }}>Dokument nie został znaleziony</p>
          <Button variant="secondary" onClick={() => navigate('/invoicing/documents')}>Wróć do listy</Button>
        </div>
      </>
    );
  }

  const sb = STATUS_MAP[doc.status] || STATUS_MAP.draft;
  const vatSummary: Record<string, { net: number; vat: number; gross: number }> = {};
  for (const item of doc.items) {
    if (!vatSummary[item.vat_rate]) vatSummary[item.vat_rate] = { net: 0, vat: 0, gross: 0 };
    vatSummary[item.vat_rate].net += item.net_value;
    vatSummary[item.vat_rate].vat += item.vat_value;
    vatSummary[item.vat_rate].gross += item.gross_value;
  }

  return (
    <>
      <PageHeader
        title={DOC_TITLES[doc.type] || 'Dokument'}
        subtitle={doc.number}
        back="/invoicing/documents"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/invoicing/documents/${doc.id}/edit`} style={{ textDecoration: 'none' }}>
              <Button size="sm" variant="secondary" icon={<Edit3 size={14} />}>Edytuj</Button>
            </Link>
            <Button size="sm" loading={actionLoading === 'pdf'} onClick={downloadPdf} icon={<Download size={14} />}>PDF</Button>
            <Button size="sm" variant="secondary" loading={actionLoading === 'print'} onClick={printDoc} icon={<Printer size={14} />}>Drukuj</Button>
            <Button size="sm" variant="secondary" onClick={() => toast('Funkcja w przygotowaniu')} icon={<Mail size={14} />}>Email</Button>
          </div>
        }
      />

      <div style={{ padding: '0 24px 24px', maxWidth: 1100 }}>
        {/* Status badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Badge color={sb.color}>{sb.label}</Badge>
          {doc.ksef_number && <Badge color="purple">KSeF: {doc.ksef_number}</Badge>}
          {doc.split_payment && <Badge color="yellow">MPP</Badge>}
          {doc.reverse_charge && <Badge color="blue">Odwrotne obciążenie</Badge>}
        </div>

        {/* Two columns: parties + payment */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <Card noPadding>
            <div style={{ padding: '20px 24px' }}>
              <InfoBlock icon={Building2} label="Sprzedawca">
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)' }}>{doc.seller_name}</div>
                {doc.seller_nip && <div>NIP: {doc.seller_nip}</div>}
                {doc.seller_street && <div>{doc.seller_street}</div>}
                {(doc.seller_zip || doc.seller_city) && <div>{doc.seller_zip} {doc.seller_city}</div>}
              </InfoBlock>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 16px' }} />
              <InfoBlock icon={User} label="Nabywca">
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)' }}>{doc.buyer_name}</div>
                {doc.buyer_nip && <div>NIP: {doc.buyer_nip}</div>}
                {doc.buyer_street && <div>{doc.buyer_street}</div>}
                {(doc.buyer_zip || doc.buyer_city) && <div>{doc.buyer_zip} {doc.buyer_city}</div>}
              </InfoBlock>
            </div>
          </Card>

          <Card noPadding>
            <div style={{ padding: '20px 24px' }}>
              <InfoBlock icon={Calendar} label="Daty">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                  <span style={{ color: 'var(--tm)' }}>Data wystawienia:</span>
                  <span style={{ fontWeight: 600 }}>{doc.issue_date}</span>
                  {doc.sale_date && <><span style={{ color: 'var(--tm)' }}>Data sprzedaży:</span><span style={{ fontWeight: 600 }}>{doc.sale_date}</span></>}
                  {doc.due_date && <><span style={{ color: 'var(--tm)' }}>Termin płatności:</span><span style={{ fontWeight: 600, color: doc.status === 'overdue' ? '#F87171' : 'inherit' }}>{doc.due_date}</span></>}
                </div>
              </InfoBlock>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 16px' }} />
              <InfoBlock icon={Banknote} label="Płatność">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                  <span style={{ color: 'var(--tm)' }}>Metoda:</span>
                  <span style={{ fontWeight: 600 }}>{PAYMENT_METHODS[doc.payment_method] || doc.payment_method}</span>
                  <span style={{ color: 'var(--tm)' }}>Waluta:</span>
                  <span style={{ fontWeight: 600 }}>{doc.currency}</span>
                  <span style={{ color: 'var(--tm)' }}>Zapłacono:</span>
                  <span style={{ fontWeight: 600, color: doc.paid_amount >= doc.gross_total ? '#4ADE80' : '#FBBF24' }}>{fmtPLN(doc.paid_amount)} zł</span>
                  <span style={{ color: 'var(--tm)' }}>Pozostało:</span>
                  <span style={{ fontWeight: 600, color: (doc.gross_total - doc.paid_amount) > 0 ? '#F87171' : '#4ADE80' }}>{fmtPLN(Math.max(0, doc.gross_total - doc.paid_amount))} zł</span>
                </div>
              </InfoBlock>
              {doc.seller_bank_account && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 16px' }} />
                  <InfoBlock icon={CreditCard} label="Konto bankowe">
                    <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 14, letterSpacing: '0.05em' }}>{doc.seller_bank_account}</div>
                    {doc.seller_bank_name && <div style={{ color: 'var(--tm)', marginTop: 2 }}>{doc.seller_bank_name}</div>}
                  </InfoBlock>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Items table */}
        <Card noPadding>
          <div style={{ padding: '16px 20px 0', fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>Pozycje dokumentu</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Lp', 'Nazwa', 'Jm', 'Ilość', 'Cena netto', 'Rabat', 'Netto', 'Stawka', 'VAT', 'Brutto'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 700, color: 'var(--td)', textAlign: ['Lp', 'Nazwa', 'Jm', 'Stawka'].includes(h) ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--tm)' }}>{item.position}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
                      {item.name}
                      {item.pkwiu && <span style={{ color: 'var(--tm)', fontWeight: 400 }}> ({item.pkwiu})</span>}
                      {item.gtu && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4 }}>{item.gtu}</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--tm)' }}>{item.unit}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtPLN(item.unit_price_net)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--tm)', textAlign: 'right' }}>{item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtPLN(item.net_value)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--tm)' }}>{item.vat_rate}%</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtPLN(item.vat_value)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right' }}>{fmtPLN(item.gross_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* VAT summary + Total */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, margin: '20px 0' }}>
          <Card noPadding>
            <div style={{ padding: '16px 20px 0', fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>Podsumowanie VAT</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Stawka', 'Netto', 'VAT', 'Brutto'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)', textAlign: h === 'Stawka' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(vatSummary).map(([rate, vals]) => (
                  <tr key={rate} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{rate}%</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtPLN(vals.net)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtPLN(vals.vat)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right' }}>{fmtPLN(vals.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card noPadding>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--tm)' }}>Netto:</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ts)' }}>{fmtPLN(doc.net_total)} {doc.currency}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--tm)' }}>VAT:</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ts)' }}>{fmtPLN(doc.vat_total)} {doc.currency}</span>
              </div>
              <div style={{ height: 2, background: 'var(--cta)', borderRadius: 2, margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>DO ZAPŁATY:</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.02em' }}>{fmtPLN(doc.gross_total)} {doc.currency}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Notes */}
        {(doc.notes || doc.internal_notes) && (
          <div style={{ display: 'grid', gridTemplateColumns: doc.internal_notes ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
            {doc.notes && (
              <Card title="Uwagi">
                <div style={{ fontSize: 13, color: 'var(--ts)', whiteSpace: 'pre-wrap' }}>{doc.notes}</div>
              </Card>
            )}
            {doc.internal_notes && (
              <Card title="Notatki wewnętrzne">
                <div style={{ fontSize: 13, color: 'var(--ts)', whiteSpace: 'pre-wrap' }}>{doc.internal_notes}</div>
              </Card>
            )}
          </div>
        )}

        {/* Action bar */}
        <Card noPadding>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={downloadPdf} loading={actionLoading === 'pdf'} icon={<Download size={14} />}>PDF</Button>
            <Button size="sm" variant="secondary" onClick={printDoc} loading={actionLoading === 'print'} icon={<Printer size={14} />}>Drukuj</Button>
            <Button size="sm" variant="secondary" onClick={() => toast('Funkcja w przygotowaniu')} icon={<Mail size={14} />}>Wyślij email</Button>
            <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
            {doc.type.includes('invoice') && (
              <Button size="sm" variant="secondary" onClick={correctDoc} loading={actionLoading === 'correct'} icon={<RotateCcw size={14} />}>Korekta</Button>
            )}
            <Button size="sm" variant="secondary" onClick={duplicateDoc} loading={actionLoading === 'duplicate'} icon={<Copy size={14} />}>Duplikat</Button>
            <Button size="sm" variant="secondary" onClick={() => toast('Funkcja w przygotowaniu')} icon={<CreditCard size={14} />}>Dodaj płatność</Button>
            <div style={{ marginLeft: 'auto' }}>
              <Button size="sm" variant="danger" onClick={deleteDoc} loading={actionLoading === 'delete'} icon={<Trash2 size={14} />}>Usuń</Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
