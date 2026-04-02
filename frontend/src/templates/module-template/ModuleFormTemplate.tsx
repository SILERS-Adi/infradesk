/**
 * IDS 1.0 — Module Form Template
 *
 * USE WHEN: Create or edit page (e.g. /invoicing/documents/new, /service/tickets/new)
 * PATTERN:  PageHeader (back) → Card sections → Editable items table → Sticky footer
 *
 * Key decisions:
 * - max-width 920px, centered
 * - Each logical section in its own Card with title
 * - Grid layout inside cards: 1fr 1fr (2 cols desktop, stacks on mobile)
 * - Sticky footer with Cancel / Save Draft / Submit
 * - Validation: inline errors + Alert summary at top
 * - Uses IDS Input, Select, Textarea components
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Send, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';

// ── Replace with your form data shape ──
interface FormData {
  title: string;
  category: string;
  date: string;
  description: string;
  items: { name: string; quantity: number; price: number }[];
}

const EMPTY_ITEM = { name: '', quantity: 1, price: 0 };

const CATEGORY_OPTIONS = [
  { value: 'a', label: 'Kategoria A' },
  { value: 'b', label: 'Kategoria B' },
  { value: 'c', label: 'Kategoria C' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function ModuleFormTemplate() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('a');
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  // ── Item management ──
  function updateItem(idx: number, field: string, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }
  function addItem() { setItems(prev => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Computed totals ──
  const total = items.reduce((s, i) => s + i.quantity * i.price, 0);

  // ── Validation ──
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Nazwa jest wymagana';
    if (!date) e.date = 'Data jest wymagana';
    if (items.every(i => !i.name.trim())) e.items = 'Dodaj przynajmniej jedną pozycję';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ──
  async function handleSubmit(draft: boolean) {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        date,
        description: description.trim() || undefined,
        status: draft ? 'DRAFT' : 'ACTIVE',
        items: items.filter(i => i.name.trim()).map(i => ({
          name: i.name.trim(),
          quantity: i.quantity,
          price: i.price,
          total: parseFloat((i.quantity * i.price).toFixed(2)),
        })),
        total: parseFloat(total.toFixed(2)),
      };

      // Replace with real API call:
      // const { data } = await api.post('/module/items', payload);
      // navigate(`../items/${data.id}`);
      console.log('Payload:', payload);
      toast.success(draft ? 'Szkic zapisany' : 'Element utworzony');
      navigate('..');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udało się zapisać');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* ── PAGE HEADER ──
          Forms always have back button. No actions in header (actions are in footer). */}
      <PageHeader
        title="Nowy element"
        subtitle="Wypełnij formularz i zapisz"
        back=".."
      />

      {/* ── FORM CONTENT ──
          max-width 920px, centered. Bottom padding 120px for sticky footer clearance. */}
      <div style={{ padding: '0 24px 120px', maxWidth: 920, margin: '0 auto' }}>

        {/* ── VALIDATION ERRORS SUMMARY ──
            Show Alert at top when errors exist. Disappears when all fixed. */}
        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Alert type="error" title="Popraw błędy w formularzu">
              {Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}
            </Alert>
          </div>
        )}

        {/* ── SECTION 1: Basic data ──
            Card with title. Grid inside: 2 columns on desktop. */}
        <Card title="Dane podstawowe">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input
              label="Nazwa"
              placeholder="np. Zamówienie #001"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setErrors(prev => { const { title: _, ...rest } = prev; return rest; }); }}
              error={errors.title}
            />
            <Select
              label="Kategoria"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <Input
              label="Data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={errors.date}
            />
          </div>
        </Card>

        {/* ── SECTION 2: Items table ──
            Card with noPadding for flush table. Editable rows.
            "Add item" button + running total below table. */}
        <div style={{ marginTop: 20 }}>
          <Card title="Pozycje" noPadding>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Nazwa', 'Ilość', 'Cena', 'Suma', ''].map(h => (
                      <th key={h} style={{
                        padding: '10px 12px', fontSize: 10, fontWeight: 700, color: 'var(--td)',
                        textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)',
                        textAlign: ['Ilość', 'Cena', 'Suma'].includes(h) ? 'right' : 'left',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', minWidth: 200 }}>
                        <input placeholder="Nazwa pozycji" value={item.name}
                          onChange={(e) => updateItem(idx, 'name', e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none' }}
                        />
                      </td>
                      <td style={{ padding: '8px 6px', width: 80 }}>
                        <input type="number" min={1} value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '8px 6px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '8px 6px', width: 110 }}>
                        <input type="number" min={0} step={0.01} value={item.price}
                          onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '8px 6px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {(item.quantity * item.price).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                      </td>
                      <td style={{ padding: '8px 6px', width: 40 }}>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} type="button"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#F87171'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--tm)'; }}
                          ><Trash2 size={15} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
              <button onClick={addItem} type="button"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-g)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              ><Plus size={14} /> Dodaj pozycję</button>
              <span style={{ fontSize: 13, color: 'var(--tm)' }}>
                Suma: <strong style={{ color: 'var(--t)', fontSize: 15 }}>{total.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</strong>
              </span>
            </div>
            {errors.items && <div style={{ padding: '0 16px 12px' }}><p style={{ fontSize: 11, color: '#F87171' }}>{errors.items}</p></div>}
          </Card>
        </div>

        {/* ── SECTION 3: Notes ──  */}
        <div style={{ marginTop: 20 }}>
          <Card title="Uwagi">
            <Textarea label="Notatki" placeholder="Opcjonalny komentarz" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Card>
        </div>
      </div>

      {/* ── STICKY FOOTER ──
          Fixed at bottom. Cancel on left, save actions on right.
          Always: [Cancel/Ghost] ... [Save Draft/Secondary] [Submit/Primary] */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
      }}>
        <Button variant="ghost" onClick={() => navigate('..')} disabled={saving}>Anuluj</Button>
        <Button variant="secondary" icon={<Save size={14} />} onClick={() => handleSubmit(true)} loading={saving}>Zapisz szkic</Button>
        <Button variant="primary" icon={<Send size={14} />} onClick={() => handleSubmit(false)} loading={saving}>Utwórz</Button>
      </div>
    </>
  );
}
