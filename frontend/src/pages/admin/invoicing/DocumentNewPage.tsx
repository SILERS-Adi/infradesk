import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, FileText, Search, Loader2, ChevronDown, ChevronUp, Building2, User, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { fmtPLN } from './utils';
import { ProductPicker } from './components/ProductPicker';
import { PurchaseImportModal } from './components/PurchaseImportModal';

// ── Types ──

interface LineItem {
  name: string;
  unit: string;
  quantity: number;
  priceNet: number;
  vatRate: string;
  discount: number;
}

interface PartyData {
  name: string;
  nip: string;
  regon: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  bankAccount: string;
}

const EMPTY_PARTY: PartyData = { name: '', nip: '', regon: '', street: '', postalCode: '', city: '', country: 'PL', email: '', phone: '', bankAccount: '' };
const EMPTY_ITEM: LineItem = { name: '', unit: 'szt', quantity: 1, priceNet: 0, vatRate: '23', discount: 0 };

// Typy dokumentów pogrupowane w kategorie (jak u konkurencji)
const TYPE_GROUPS: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
  {
    label: 'Sprzedaż',
    options: [
      { value: 'SALE_INVOICE', label: 'Faktura VAT' },
      { value: 'PROFORMA', label: 'Faktura proforma' },
      { value: 'ADVANCE', label: 'Faktura zaliczkowa' },
      { value: 'FINAL', label: 'Faktura końcowa' },
      { value: 'CORRECTION', label: 'Faktura korygująca' },
      { value: 'RECEIPT', label: 'Paragon' },
      { value: 'VAT_MARGIN', label: 'Faktura VAT marża' },
      { value: 'BILL', label: 'Rachunek (dla nievatowców)' },
    ],
  },
  {
    label: 'Zakup',
    options: [
      { value: 'PURCHASE_INVOICE', label: 'Faktura zakupu' },
    ],
  },
  {
    label: 'Zagranica / UE',
    options: [
      { value: 'WDT', label: 'Faktura WDT (dostawa UE)' },
      { value: 'WNT', label: 'Faktura WNT (nabycie UE)' },
      { value: 'EXPORT', label: 'Faktura eksportowa' },
      { value: 'IMPORT', label: 'Faktura importowa' },
    ],
  },
  {
    label: 'Magazyn',
    options: [
      { value: 'WZ', label: 'WZ — Wydanie zewnętrzne' },
      { value: 'PZ', label: 'PZ — Przyjęcie zewnętrzne' },
      { value: 'MM', label: 'MM — Przesunięcie międzymagazynowe' },
    ],
  },
  {
    label: 'Kasa',
    options: [
      { value: 'KP', label: 'KP — Dowód wpłaty' },
      { value: 'KW', label: 'KW — Dowód wypłaty' },
    ],
  },
  {
    label: 'Oferty i zamówienia',
    options: [
      { value: 'ESTIMATE', label: 'Oferta / wycena' },
      { value: 'ORDER', label: 'Zamówienie' },
    ],
  },
  {
    label: 'Noty',
    options: [
      { value: 'ACCOUNTING_NOTE', label: 'Nota księgowa' },
      { value: 'CORRECTION_NOTE', label: 'Nota korygująca' },
    ],
  },
];

// Flat lookup for labels
const TYPE_LABEL_MAP: Record<string, string> = {};
for (const g of TYPE_GROUPS) for (const o of g.options) TYPE_LABEL_MAP[o.value] = o.label;

// ── DocType Picker — dropdown z ulubionymi + rozwijanie reszty ──
function DocTypePicker({ value, onChange, useWarehouse = false, useCash = true }: { value: string; onChange: (v: string) => void; useWarehouse?: boolean; useCash?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('inv_doctype_favorites') || '["SALE_INVOICE","PROFORMA"]'); } catch { return ['SALE_INVOICE', 'PROFORMA']; }
  });

  function measure() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }

  function openDropdown() {
    measure();
    setOpen(true);
    setShowAll(false);
  }

  // Re-measure on scroll/resize
  useEffect(() => {
    if (!open) return;
    const handler = () => measure();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  function toggleFavorite(v: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = favorites.includes(v) ? favorites.filter(x => x !== v) : [...favorites, v];
    setFavorites(next);
    localStorage.setItem('inv_doctype_favorites', JSON.stringify(next));
  }

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  // Favorite options (in favorite order)
  const favOptions = favorites
    .map(v => {
      for (const g of TYPE_GROUPS) {
        const o = g.options.find(opt => opt.value === v);
        if (o) return o;
      }
      return null;
    })
    .filter(Boolean) as Array<{ value: string; label: string }>;

  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginBottom: 6 }}>Typ dokumentu</label>
      <button ref={btnRef} type="button" onClick={() => open ? setOpen(false) : openDropdown()} style={{
        width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 'var(--rs)',
        border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)',
        outline: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 500 }}>{TYPE_LABEL_MAP[value] || 'Wybierz typ...'}</span>
        <ChevronDown size={14} style={{ color: 'var(--td)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {open && rect && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 9999,
            background: '#0F1628', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 10,
            maxHeight: 'min(560px, calc(100vh - ' + (rect.top + 20) + 'px))', overflowY: 'auto',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
          }} className="doctype-dropdown">
            {/* Favorites section */}
            {favOptions.length > 0 && (
              <>
                <div style={{ padding: '12px 16px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#FBBF24', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Star size={11} fill="#FBBF24" /> Ulubione
                </div>
                {favOptions.map(o => (
                  <DocTypeItem key={`fav-${o.value}`} option={o} selected={value === o.value} favorite={true}
                    onSelect={() => select(o.value)} onToggleFav={e => toggleFavorite(o.value, e)} />
                ))}
              </>
            )}

            {/* "Więcej..." expand button */}
            {!showAll && (
              <button type="button" onClick={() => setShowAll(true)} style={{
                width: '100%', padding: '12px 16px', fontSize: 12, fontWeight: 600,
                background: 'transparent', border: 'none', borderTop: favOptions.length > 0 ? '1px solid rgba(148,163,184,0.1)' : 'none',
                color: 'var(--accent-s, #818CF8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'background .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(129,140,248,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                Więcej typów... <ChevronDown size={14} />
              </button>
            )}

            {/* Full list — expanded */}
            {showAll && (
              <>
                {TYPE_GROUPS.filter(g => {
                  if (g.label === 'Magazyn' && !useWarehouse) return false;
                  if (g.label === 'Kasa' && !useCash) return false;
                  return true;
                }).map(group => (
                  <div key={group.label}>
                    <div style={{
                      padding: '12px 16px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.1em', color: '#818CF8',
                      borderTop: '1px solid rgba(148,163,184,0.1)',
                      background: 'rgba(99,102,241,0.05)',
                    }}>
                      {group.label}
                    </div>
                    {group.options.map(o => (
                      <DocTypeItem key={o.value} option={o} selected={value === o.value} favorite={favorites.includes(o.value)}
                        onSelect={() => select(o.value)} onToggleFav={e => toggleFavorite(o.value, e)} />
                    ))}
                  </div>
                ))}
                <button type="button" onClick={() => setShowAll(false)} style={{
                  width: '100%', padding: '10px 16px', fontSize: 11, fontWeight: 500,
                  background: 'transparent', border: 'none', borderTop: '1px solid rgba(148,163,184,0.1)',
                  color: 'var(--td)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  Zwiń <ChevronUp size={12} />
                </button>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function DocTypeItem({ option, selected, favorite, onSelect, onToggleFav }: {
  option: { value: string; label: string };
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFav: (e: React.MouseEvent) => void;
}) {
  return (
    <div onClick={onSelect} style={{
      padding: '8px 14px', fontSize: 12, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: selected ? 'var(--accent-g)' : 'transparent',
      color: selected ? 'var(--accent-s, var(--accent))' : 'var(--ts)',
      fontWeight: selected ? 600 : 500,
      transition: 'background .12s',
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--hover-bg)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}>
      <span>{option.label}</span>
      <button type="button" onClick={onToggleFav} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex',
        color: favorite ? '#FBBF24' : 'var(--td)', opacity: favorite ? 1 : 0.4,
        transition: 'opacity .15s',
      }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = favorite ? '1' : '0.4'}>
        <Star size={12} fill={favorite ? '#FBBF24' : 'none'} />
      </button>
    </div>
  );
}

const VAT_OPTIONS = [
  { value: '23', label: '23%' },
  { value: '8', label: '8%' },
  { value: '5', label: '5%' },
  { value: '0', label: '0%' },
  { value: 'zw', label: 'zw.' },
  { value: 'np', label: 'np.' },
];

const UNIT_OPTIONS = ['szt', 'godz', 'mies', 'kpl', 'mb', 'kg', 'l', 'usł', 'm²', 'm³'];

const PAYMENT_OPTIONS = [
  { value: 'przelew', label: 'Przelew' },
  { value: 'gotowka', label: 'Gotówka' },
  { value: 'karta', label: 'Karta płatnicza' },
  { value: 'blik', label: 'BLIK' },
  { value: 'kompensata', label: 'Kompensata' },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

function calcNet(item: LineItem) {
  const net = item.quantity * item.priceNet;
  return item.discount > 0 ? net * (1 - item.discount / 100) : net;
}
function calcVat(item: LineItem) {
  if (item.vatRate === 'zw' || item.vatRate === 'np') return 0;
  return calcNet(item) * (parseFloat(item.vatRate) / 100);
}
function calcGross(item: LineItem) { return calcNet(item) + calcVat(item); }

// ── Party Section (Nabywca / Odbiorca / Płatnik) ──

function PartySection({ label, data, onChange, onGusLookup, gusLoading, showToggle, isCompany, onToggleCompany, collapsible, defaultOpen = true }: {
  label: string;
  data: PartyData;
  onChange: (d: PartyData) => void;
  onGusLookup?: () => void;
  gusLoading?: boolean;
  showToggle?: boolean;
  isCompany?: boolean;
  onToggleCompany?: (v: boolean) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const set = (k: keyof PartyData, v: string) => onChange({ ...data, [k]: v });

  if (collapsible && !open) {
    return (
      <button onClick={() => setOpen(true)} type="button" style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
        border: '1px dashed var(--border)', borderRadius: 10, background: 'transparent',
        color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%',
      }}>
        <Plus size={14} /> Dodaj {label.toLowerCase()}
      </button>
    );
  }

  return (
    <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>{label}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {showToggle && onToggleCompany && (
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button type="button" onClick={() => onToggleCompany(true)} style={{
                padding: '4px 12px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: isCompany ? 'var(--accent)' : 'transparent', color: isCompany ? '#fff' : 'var(--td)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}><Building2 size={10} /> Firma</button>
              <button type="button" onClick={() => onToggleCompany(false)} style={{
                padding: '4px 12px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: !isCompany ? 'var(--accent)' : 'transparent', color: !isCompany ? '#fff' : 'var(--td)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}><User size={10} /> Osoba</button>
            </div>
          )}
          {collapsible && (
            <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--td)', cursor: 'pointer' }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* GUS lookup */}
      {isCompany && onGusLookup && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: '0 0 180px' }}>
            <Input label="NIP" placeholder="Wpisz NIP" value={data.nip} onChange={e => set('nip', e.target.value)} />
          </div>
          <Button variant="primary" size="sm" icon={gusLoading ? <Loader2 size={12} className="spinning" /> : <Search size={12} />}
            onClick={onGusLookup} disabled={gusLoading || data.nip.replace(/[-\s]/g, '').length < 10}>
            {gusLoading ? 'Szukam...' : 'Pobierz z GUS'}
          </Button>
        </div>
      )}

      {/* Search existing contractors */}
      <ContractorSearch onSelect={(c) => onChange({ ...data, name: c.name, nip: c.nip || '', street: c.address || '', city: c.city || '', email: c.email || '', phone: c.phone || '' })} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        <Input label={isCompany ? "Nazwa firmy *" : "Imię i nazwisko *"} placeholder={isCompany ? "np. Firma Sp. z o.o." : "np. Jan Kowalski"} value={data.name} onChange={e => set('name', e.target.value)} />
        {isCompany ? (
          <Input label="REGON" placeholder="np. 123456789" value={data.regon} onChange={e => set('regon', e.target.value)} />
        ) : (
          <Input label="NIP (opcjonalnie)" placeholder="np. 1234567890" value={data.nip} onChange={e => set('nip', e.target.value)} />
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginTop: 8 }}>
        <Input label="Ulica i numer" placeholder="np. ul. Testowa 1/2" value={data.street} onChange={e => set('street', e.target.value)} />
        <Input label="Kod pocztowy" placeholder="00-000" value={data.postalCode} onChange={e => set('postalCode', e.target.value)} />
        <Input label="Miasto" placeholder="np. Warszawa" value={data.city} onChange={e => set('city', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        <Input label="Email" placeholder="biuro@firma.pl" value={data.email} onChange={e => set('email', e.target.value)} />
        <Input label="Telefon" placeholder="+48 500 000 000" value={data.phone} onChange={e => set('phone', e.target.value)} />
      </div>
    </div>
  );
}

// ── Contractor Search (inline) ──

function ContractorSearch({ onSelect }: { onSelect: (c: any) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/invoicing/contractors?search=${encodeURIComponent(q)}&per_page=5`);
        setResults(data.items || data || []);
        setShow(true);
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        placeholder="Wyszukaj kontrahenta z bazy..."
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        style={{
          width: '100%', padding: '8px 12px', fontSize: 12, borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none',
        }}
      />
      {show && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map((c: any) => (
            <div key={c.id} onMouseDown={() => { onSelect(c); setQ(''); setShow(false); }}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--t)', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-g)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              {c.nip && <div style={{ fontSize: 10, color: 'var(--td)' }}>NIP: {c.nip}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function DocumentNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load invoicing settings for defaults
  const [bankAccountDisplay, setBankAccountDisplay] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState('');
  const [bankAccounts, setBankAccounts] = useState<{name: string; accountNumber: string}[]>([]);
  const [useWarehouse, setUseWarehouse] = useState(false);
  const [useCash, setUseCash] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    api.get('/invoicing/settings').then(({ data }) => {
      if (data.defaults) {
        setPaymentMethod(data.defaults.paymentMethod || 'przelew');
        setPlaceOfIssue(data.defaults.placeOfIssue || '');
        if (data.defaults.paymentDays) {
          setDueDate(addDays(data.defaults.paymentDays));
        }
      }
      if (data.bankAccounts?.length) {
        setBankAccounts(data.bankAccounts);
        const def = data.bankAccounts.find((a: any) => a.isDefault) || data.bankAccounts[0];
        if (def) {
          setSelectedBankAccount(def.accountNumber);
          setBankAccountDisplay(`${def.bankName ? def.bankName + ' ' : ''}${def.accountNumber}`);
        }
      }
      if (data.modules) {
        setUseWarehouse(!!data.modules.useWarehouse);
        setUseCash(data.modules.useCash !== false);
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  // Document metadata
  const [type, setType] = useState('SALE_INVOICE');
  const [number, setNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState(todayStr());
  const [saleDate, setSaleDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(addDays(14));
  const [paymentMethod, setPaymentMethod] = useState('przelew');
  const [placeOfIssue, setPlaceOfIssue] = useState('');
  const [notes, setNotes] = useState('');

  // Parties
  const [buyerIsCompany, setBuyerIsCompany] = useState(true);
  const [buyer, setBuyer] = useState<PartyData>({ ...EMPTY_PARTY });
  const [showRecipient, setShowRecipient] = useState(false);
  const [recipient, setRecipient] = useState<PartyData>({ ...EMPTY_PARTY });
  const [gusLoading, setGusLoading] = useState(false);

  // Line items
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

  // Totals
  const totalNet = items.reduce((s, i) => s + calcNet(i), 0);
  const totalVat = items.reduce((s, i) => s + calcVat(i), 0);
  const totalGross = totalNet + totalVat;

  function handleImportPurchase(data: any) {
    if (data.number) setNumber(data.number);
    if (data.issueDate) setIssuedAt(data.issueDate);
    if (data.dueDate) setDueDate(data.dueDate);
    if (data.sellerName) setBuyer(prev => ({ ...prev, name: data.sellerName }));
    if (data.sellerNip) setBuyer(prev => ({ ...prev, nip: data.sellerNip }));
    // For purchase invoice, "buyer" in our system = seller in the doc (we are receiving)
    // So map sellerName/sellerNip to buyer fields
    if (data.totalGross) {
      // Set as single line item with calculated VAT
      const gross = data.totalGross;
      const net = data.totalNet || gross / 1.23;
      const vat = data.totalVat || (gross - net);
      const vatRate = vat > 0 ? Math.round((vat / net) * 100).toString() : '23';
      setItems([{
        name: `Zakup wg faktury ${data.number || ''}`,
        unit: 'szt', quantity: 1, priceNet: parseFloat(net.toFixed(2)),
        vatRate: ['23', '8', '5', '0'].includes(vatRate) ? vatRate : '23',
        discount: 0,
      }]);
    }
  }

  // GUS lookup for buyer
  async function gusLookupBuyer() {
    const cleanNip = buyer.nip.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(cleanNip)) { toast.error('Wpisz poprawny NIP (10 cyfr)'); return; }
    setGusLoading(true);
    try {
      const { data } = await api.get(`/invoicing/contractors/nip-lookup/${cleanNip}`);
      setBuyer(prev => ({
        ...prev,
        name: data.name || prev.name,
        nip: data.nip || prev.nip,
        regon: data.regon || prev.regon,
        street: data.street || prev.street,
        city: data.city || prev.city,
        postalCode: data.postalCode || prev.postalCode,
      }));
      if (data.isPersonName) {
        toast('Pobrano dane. Nazwa może zawierać tylko imię i nazwisko — popraw na pełną nazwę firmy.', { icon: '⚠️', duration: 6000 });
      } else {
        toast.success(`Pobrano: ${data.name}`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udało się pobrać danych');
    } finally {
      setGusLoading(false);
    }
  }

  // Item management
  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  // Validation
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!buyer.name.trim()) e.buyer = 'Nabywca jest wymagany';
    if (!issuedAt) e.issuedAt = 'Data wystawienia jest wymagana';
    const validItems = items.filter(i => i.name.trim());
    if (validItems.length === 0) e.items = 'Dodaj przynajmniej jedną pozycję';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Submit
  async function handleSubmit(status: 'DRAFT' | 'ISSUED') {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        number: number.trim() || undefined, // empty = auto-generate
        type,
        status,
        contractorName: buyer.name.trim(),
        contractorNip: buyer.nip.trim() || undefined,
        totalNet: parseFloat(totalNet.toFixed(2)),
        totalVat: parseFloat(totalVat.toFixed(2)),
        totalGross: parseFloat(totalGross.toFixed(2)),
        issuedAt,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        items: items.filter(i => i.name.trim()).map(i => ({
          name: i.name.trim(),
          quantity: i.quantity,
          unit: i.unit,
          priceNet: i.priceNet,
          vatRate: i.vatRate,
          totalNet: parseFloat(calcNet(i).toFixed(2)),
          totalVat: parseFloat(calcVat(i).toFixed(2)),
          totalGross: parseFloat(calcGross(i).toFixed(2)),
        })),
      };

      const { data } = await api.post('/invoicing/documents', payload);
      toast.success(status === 'DRAFT' ? 'Szkic zapisany' : 'Dokument wystawiony');
      navigate(`/invoicing/documents/${data.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udało się zapisać');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 6px', fontSize: 13, borderRadius: 'var(--rs)',
    border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)',
    outline: 'none', textAlign: 'right',
  };

  return (
    <>
      <PageHeader title="Nowy dokument" subtitle="Utwórz fakturę, proformę lub inny dokument" back="/invoicing/documents" />

      <div style={{ padding: '0 24px 120px', maxWidth: 960, margin: '0 auto' }}>

        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Alert type="error" title="Popraw błędy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert>
          </div>
        )}

        {/* ── Import dla faktur zakupu ── */}
        {type === 'PURCHASE_INVOICE' && (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>📥 Wczytaj fakturę zakupu</div>
              <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>Skan / zdjęcie / PDF (OCR), XML lub plik EPP — automatyczne uzupełnienie pól</div>
            </div>
            <Button variant="primary" icon={<Search size={14} />} onClick={() => setShowImportModal(true)}>
              Wczytaj plik
            </Button>
          </div>
        )}

        {/* ── Typ + metadane ── */}
        <Card title="Dane dokumentu">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <DocTypePicker value={type} onChange={setType} useWarehouse={useWarehouse} useCash={useCash} />
            <Input label="Numer (puste = auto)" placeholder="np. FV/1/04/2026" value={number} onChange={e => setNumber(e.target.value)} hint="Zostaw puste — system ponumeruje automatycznie" />
            <Select label="Sposób płatności" options={PAYMENT_OPTIONS} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} />
          </div>
          {/* Bank account selection */}
          {bankAccounts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Select
                label="Konto bankowe"
                options={bankAccounts.map(a => ({ value: a.accountNumber, label: `${a.name ? a.name + ' — ' : ''}${a.accountNumber}` }))}
                value={selectedBankAccount}
                onChange={e => {
                  setSelectedBankAccount(e.target.value);
                  const acc = bankAccounts.find(a => a.accountNumber === e.target.value);
                  setBankAccountDisplay(acc ? `${(acc as any).bankName ? (acc as any).bankName + ' ' : ''}${acc.accountNumber}` : '');
                }}
              />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 12 }}>
            <Input label="Data wystawienia" type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} />
            <Input label="Data sprzedaży" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
            <Input label="Termin płatności" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            <Input label="Miejsce wystawienia" placeholder="np. Warszawa" value={placeOfIssue} onChange={e => setPlaceOfIssue(e.target.value)} />
          </div>
        </Card>

        {/* ── Nabywca ── */}
        <div style={{ marginTop: 20 }}>
          <PartySection
            label="Nabywca"
            data={buyer}
            onChange={setBuyer}
            onGusLookup={gusLookupBuyer}
            gusLoading={gusLoading}
            showToggle
            isCompany={buyerIsCompany}
            onToggleCompany={setBuyerIsCompany}
          />
        </div>

        {/* ── Odbiorca (opcjonalny) ── */}
        <div style={{ marginTop: 12 }}>
          <PartySection
            label="Odbiorca"
            data={recipient}
            onChange={setRecipient}
            collapsible
            defaultOpen={false}
          />
        </div>

        {/* ── Pozycje ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Pozycje dokumentu" noPadding>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Lp.', 'Nazwa towaru / usługi', 'Jm.', 'Ilość', 'Cena netto', 'Rabat %', 'VAT', 'Netto', 'Brutto', ''].map((h, i) => (
                      <th key={i} style={{
                        padding: '10px 8px', fontSize: 9, fontWeight: 700,
                        color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em',
                        textAlign: ['Ilość', 'Cena netto', 'Rabat %', 'Netto', 'Brutto'].includes(h) ? 'right' : h === 'Lp.' ? 'center' : 'left',
                        background: 'var(--hover-bg)', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', textAlign: 'center', fontSize: 11, color: 'var(--td)', width: 35 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 6px', minWidth: 200 }}>
                        <ProductPicker
                          value={item.name}
                          onTextChange={(text) => updateItem(idx, 'name', text)}
                          onSelect={(p) => {
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, name: p.name, priceNet: p.priceNet, vatRate: p.vatRate, unit: (p as any).unit || 'szt' } : it));
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px 4px', width: 60 }}>
                        <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          style={{ ...inputStyle, textAlign: 'center', padding: '8px 2px' }}>
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 4px', width: 70 }}>
                        <input type="number" min={0.01} step={0.01} value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} style={inputStyle} />
                      </td>
                      <td style={{ padding: '8px 4px', width: 100 }}>
                        <input type="number" min={0} step={0.01} value={item.priceNet}
                          onChange={e => updateItem(idx, 'priceNet', parseFloat(e.target.value) || 0)} style={inputStyle} />
                      </td>
                      <td style={{ padding: '8px 4px', width: 65 }}>
                        <input type="number" min={0} max={100} step={1} value={item.discount}
                          onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)} style={inputStyle} />
                      </td>
                      <td style={{ padding: '8px 4px', width: 70 }}>
                        <select value={item.vatRate} onChange={e => updateItem(idx, 'vatRate', e.target.value)}
                          style={{ ...inputStyle, textAlign: 'center', appearance: 'none' }}>
                          {VAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 8px', fontSize: 12, color: 'var(--ts)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtPLN(calcNet(item))}
                      </td>
                      <td style={{ padding: '8px 8px', fontSize: 12, fontWeight: 600, color: 'var(--t)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtPLN(calcGross(item))}
                      </td>
                      <td style={{ padding: '8px 4px', width: 35 }}>
                        {items.length > 1 && (
                          <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} type="button"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#F87171'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--tm)'; }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])} type="button" style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--rs)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)',
              }}>
                <Plus size={14} /> Dodaj pozycję
              </button>
              <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                <span style={{ color: 'var(--tm)' }}>Netto: <strong style={{ color: 'var(--ts)' }}>{fmtPLN(totalNet)}</strong></span>
                <span style={{ color: 'var(--tm)' }}>VAT: <strong style={{ color: 'var(--ts)' }}>{fmtPLN(totalVat)}</strong></span>
                <span style={{ color: 'var(--tm)' }}>Brutto: <strong style={{ color: 'var(--t)', fontSize: 15 }}>{fmtPLN(totalGross)}</strong></span>
              </div>
            </div>

            {errors.items && <div style={{ padding: '0 16px 12px' }}><p style={{ fontSize: 11, color: '#F87171' }}>{errors.items}</p></div>}
          </Card>
        </div>

        {/* ── Uwagi ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Uwagi">
            <Textarea label="Notatki na dokumencie" placeholder="np. Płatność przelewem na konto podane na fakturze" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
      }}>
        <Button variant="ghost" onClick={() => navigate('/invoicing/documents')} disabled={saving}>Anuluj</Button>
        <Button variant="secondary" icon={<Save size={14} />} onClick={() => handleSubmit('DRAFT')} loading={saving}>Zapisz szkic</Button>
        <Button variant="primary" icon={<FileText size={14} />} onClick={() => handleSubmit('ISSUED')} loading={saving}>Wystaw dokument</Button>
      </div>

      {showImportModal && (
        <PurchaseImportModal onClose={() => setShowImportModal(false)} onImport={handleImportPurchase} />
      )}
    </>
  );
}
