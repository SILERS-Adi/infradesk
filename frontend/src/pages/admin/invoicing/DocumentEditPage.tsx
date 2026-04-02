/**
 * IDS 1.0 — Edit Document (ModuleFormTemplate)
 * Loads existing document from GET /api/invoicing/documents/:id
 * Saves via PUT /api/invoicing/documents/:id
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { fmtPLN } from './utils';
import { ContractorPicker } from './components/ContractorPicker';
import { ProductPicker } from './components/ProductPicker';

interface LineItem {
  name: string;
  quantity: number;
  priceNet: number;
  vatRate: string;
}

const EMPTY_ITEM: LineItem = { name: '', quantity: 1, priceNet: 0, vatRate: '23' };

const TYPE_OPTIONS = [
  { value: 'SALE_INVOICE', label: 'Faktura VAT' },
  { value: 'PROFORMA', label: 'Faktura proforma' },
  { value: 'ADVANCE', label: 'Faktura zaliczkowa' },
  { value: 'FINAL', label: 'Faktura końcowa' },
  { value: 'RECEIPT', label: 'Paragon' },
  { value: 'PURCHASE_INVOICE', label: 'Faktura zakupu' },
];

const VAT_OPTIONS = [
  { value: '23', label: '23%' },
  { value: '8', label: '8%' },
  { value: '5', label: '5%' },
  { value: '0', label: '0%' },
  { value: 'zw', label: 'zw.' },
];

function calcItemNet(item: LineItem) { return item.quantity * item.priceNet; }
function calcItemVat(item: LineItem) {
  if (item.vatRate === 'zw') return 0;
  return calcItemNet(item) * (parseFloat(item.vatRate) / 100);
}
function calcItemGross(item: LineItem) { return calcItemNet(item) + calcItemVat(item); }

export function DocumentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [docNumber, setDocNumber] = useState('');

  // Form state
  const [type, setType] = useState('SALE_INVOICE');
  const [number, setNumber] = useState('');
  const [contractorName, setContractorName] = useState('');
  const [contractorNip, setContractorNip] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

  // Load existing document
  const loadDoc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/invoicing/documents/${id}`);
      setDocNumber(data.number);
      setType(data.type?.toUpperCase() || 'SALE_INVOICE');
      setNumber(data.number || '');
      setContractorName(data.buyer_name || '');
      setContractorNip(data.buyer_nip || '');
      setIssuedAt(data.issue_date || '');
      setDueDate(data.due_date || '');
      setNotes(data.notes || '');
      setStatus(data.status || '');
      if (data.items && data.items.length > 0) {
        setItems(data.items.map((it: any) => ({
          name: it.name || '',
          quantity: it.quantity || 1,
          priceNet: it.unit_price_net || 0,
          vatRate: it.vat_rate || '23',
        })));
      }
    } catch {
      toast.error('Nie udalo sie pobrac dokumentu');
      navigate('/invoicing/documents');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  // Derived totals
  const totalNet = items.reduce((s, i) => s + calcItemNet(i), 0);
  const totalVat = items.reduce((s, i) => s + calcItemVat(i), 0);
  const totalGross = totalNet + totalVat;

  // Item management
  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }
  function addItem() { setItems(prev => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // Validation
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!number.trim()) e.number = 'Numer dokumentu jest wymagany';
    if (!contractorName.trim()) e.contractorName = 'Nazwa kontrahenta jest wymagana';
    if (!issuedAt) e.issuedAt = 'Data wystawienia jest wymagana';
    if (items.every(i => !i.name.trim())) e.items = 'Dodaj przynajmniej jedna pozycje z nazwa';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Submit
  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        number: number.trim(),
        type,
        contractorName: contractorName.trim(),
        contractorNip: contractorNip.trim() || undefined,
        totalNet: parseFloat(totalNet.toFixed(2)),
        totalVat: parseFloat(totalVat.toFixed(2)),
        totalGross: parseFloat(totalGross.toFixed(2)),
        issuedAt,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        items: items.filter(i => i.name.trim()).map(i => ({
          name: i.name.trim(),
          quantity: i.quantity,
          priceNet: i.priceNet,
          vatRate: i.vatRate,
          totalNet: parseFloat(calcItemNet(i).toFixed(2)),
          totalVat: parseFloat(calcItemVat(i).toFixed(2)),
          totalGross: parseFloat(calcItemGross(i).toFixed(2)),
        })),
      };

      await api.put(`/invoicing/documents/${id}`, payload);
      toast.success('Dokument zapisany');
      navigate(`/invoicing/documents/${id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udalo sie zapisac dokumentu');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Edytuj dokument" back="/invoicing/documents" />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Edytuj ${docNumber}`}
        subtitle="Zmien dane dokumentu i zapisz"
        back={`/invoicing/documents/${id}`}
      />

      <div style={{ padding: '0 24px 120px', maxWidth: 920, margin: '0 auto' }}>

        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Alert type="error" title="Popraw bledy w formularzu">
              {Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}
            </Alert>
          </div>
        )}

        <Card title="Dane podstawowe">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Select label="Typ dokumentu" options={TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
            <Input label="Numer dokumentu" value={number}
              onChange={(e) => { setNumber(e.target.value); setErrors(prev => { const { number: _, ...rest } = prev; return rest; }); }}
              error={errors.number} />
            <Input label="Data wystawienia" type="date" value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)} error={errors.issuedAt} />
            <Input label="Termin platnosci" type="date" value={dueDate}
              onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </Card>

        <div style={{ marginTop: 20 }}>
          <Card title="Kontrahent">
            <ContractorPicker onSelect={(c) => {
              setContractorName(c.name);
              setContractorNip(c.nip);
              setErrors(prev => { const { contractorName: _, ...rest } = prev; return rest; });
            }} />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <Input label="Nazwa kontrahenta" value={contractorName}
                onChange={(e) => { setContractorName(e.target.value); setErrors(prev => { const { contractorName: _, ...rest } = prev; return rest; }); }}
                error={errors.contractorName} />
              <Input label="NIP" value={contractorNip} onChange={(e) => setContractorNip(e.target.value)} />
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title="Pozycje dokumentu" noPadding>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Nazwa', 'Ilosc', 'Cena netto', 'VAT', 'Netto', 'Brutto', ''].map(h => (
                      <th key={h} style={{
                        padding: '10px 12px', fontSize: 10, fontWeight: 700,
                        color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em',
                        textAlign: ['Ilosc', 'Cena netto', 'Netto', 'Brutto'].includes(h) ? 'right' : 'left',
                        background: 'var(--hover-bg)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', minWidth: 220 }}>
                        <ProductPicker
                          value={item.name}
                          onTextChange={(text) => updateItem(idx, 'name', text)}
                          onSelect={(p) => {
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, name: p.name, priceNet: p.priceNet, vatRate: p.vatRate } : it));
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px 6px', width: 80 }}>
                        <input type="number" min={1} step={1} value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '8px 6px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px 6px', width: 110 }}>
                        <input type="number" min={0} step={0.01} value={item.priceNet}
                          onChange={(e) => updateItem(idx, 'priceNet', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '8px 6px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px 6px', width: 80 }}>
                        <select value={item.vatRate} onChange={(e) => updateItem(idx, 'vatRate', e.target.value)}
                          style={{ width: '100%', padding: '8px 4px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', appearance: 'none', textAlign: 'center' }}>
                          {VAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ts)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtPLN(calcItemNet(item))}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtPLN(calcItemGross(item))}</td>
                      <td style={{ padding: '8px 6px', width: 40 }}>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} type="button"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#F87171'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--tm)'; }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
              <button onClick={addItem} type="button"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)', transition: 'var(--trf)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-g)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                <Plus size={14} /> Dodaj pozycje
              </button>
              <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                <span style={{ color: 'var(--tm)' }}>Netto: <strong style={{ color: 'var(--ts)' }}>{fmtPLN(totalNet)}</strong></span>
                <span style={{ color: 'var(--tm)' }}>VAT: <strong style={{ color: 'var(--ts)' }}>{fmtPLN(totalVat)}</strong></span>
                <span style={{ color: 'var(--tm)' }}>Brutto: <strong style={{ color: 'var(--t)', fontSize: 15 }}>{fmtPLN(totalGross)} zl</strong></span>
              </div>
            </div>

            {errors.items && <div style={{ padding: '0 16px 12px' }}><p style={{ fontSize: 11, color: '#F87171' }}>{errors.items}</p></div>}
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title="Uwagi">
            <Textarea label="Notatki na dokumencie" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
      }}>
        <Button variant="ghost" onClick={() => navigate(`/invoicing/documents/${id}`)} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>Zapisz zmiany</Button>
      </div>
    </>
  );
}
