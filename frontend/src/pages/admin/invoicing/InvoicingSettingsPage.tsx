/**
 * Ustawienia modułu fakturowania
 * Wzorowane na: Fakturownia, wFirma, inFakt, Subiekt123
 *
 * Sekcje:
 * 1. Dane firmy (sprzedawca)
 * 2. Konta bankowe
 * 3. Numeracja dokumentów
 * 4. Domyślne ustawienia
 * 5. Adnotacje i stopka
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Plus, Trash2, Building2, CreditCard, Hash, Settings2, FileText, Loader2, Warehouse, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';

interface BankAccount {
  name: string;
  bankName: string;
  accountNumber: string;
  swift: string;
  currency: string;
  isDefault: boolean;
}

interface InvoicingSettings {
  company: {
    name: string; nip: string; regon: string; krs: string;
    courtRegistry: string; shareCapital: string;
    email: string; phone: string;
    street: string; postalCode: string; city: string; country: string;
    logoUrl: string;
  };
  bankAccounts: BankAccount[];
  numbering: {
    pattern: string;
    reset: string;
    nextNumber: number;
  };
  defaults: {
    paymentDays: number;
    paymentMethod: string;
    currency: string;
    placeOfIssue: string;
  };
  annotations: {
    splitPayment: boolean;
    cashMethod: boolean;
    reverseCharge: boolean;
    footerNote: string;
  };
  modules: {
    useWarehouse: boolean;
    useCash: boolean;
  };
  warehouses: Warehouse[];
}

interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  isDefault: boolean;
}

const PAYMENT_METHODS = [
  { value: 'przelew', label: 'Przelew bankowy' },
  { value: 'gotowka', label: 'Gotówka' },
  { value: 'karta', label: 'Karta płatnicza' },
  { value: 'blik', label: 'BLIK' },
  { value: 'kompensata', label: 'Kompensata' },
  { value: 'za_pobraniem', label: 'Za pobraniem' },
];

const RESET_OPTIONS = [
  { value: 'monthly', label: 'Miesięcznie (reset co miesiąc)' },
  { value: 'yearly', label: 'Rocznie (reset co rok)' },
  { value: 'never', label: 'Ciągła (bez resetu)' },
];

const NUMBERING_PATTERNS = [
  { value: '{prefix}/{nr-m}/{mm}/{yyyy}', label: 'FV/1/04/2026 (nr/miesiąc/rok)' },
  { value: '{prefix}/{nr}/{yyyy}', label: 'FV/1/2026 (nr/rok)' },
  { value: '{prefix}/{nr-m}/{mm}/{yy}', label: 'FV/1/04/26 (nr/miesiąc/rok krótki)' },
  { value: '{prefix}-{nr}-{mm}-{yyyy}', label: 'FV-1-04-2026 (z myślnikami)' },
  { value: '{nr}/{mm}/{yyyy}', label: '1/04/2026 (bez prefixu)' },
];

const PAYMENT_DAYS_OPTIONS = [
  { value: '7', label: '7 dni' },
  { value: '14', label: '14 dni' },
  { value: '21', label: '21 dni' },
  { value: '30', label: '30 dni' },
  { value: '45', label: '45 dni' },
  { value: '60', label: '60 dni' },
  { value: '90', label: '90 dni' },
];

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99,102,241,0.08)', color: '#818CF8',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', cursor: 'pointer' }}>
      <span style={{ fontSize: 13, color: 'var(--ts)' }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{
        width: 40, height: 22, borderRadius: 11, padding: 2,
        background: value ? '#6366F1' : 'var(--hover-bg)', border: '1px solid var(--border)',
        transition: 'background .2s', cursor: 'pointer',
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transform: value ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </label>
  );
}

export function InvoicingSettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery<InvoicingSettings>({
    queryKey: ['invoicing-settings'],
    queryFn: () => api.get('/invoicing/settings').then(r => r.data),
  });

  const [form, setForm] = useState<InvoicingSettings | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: (data: InvoicingSettings) => api.put('/invoicing/settings', data),
    onSuccess: () => {
      toast.success('Ustawienia zapisane');
      qc.invalidateQueries({ queryKey: ['invoicing-settings'] });
    },
    onError: () => toast.error('Błąd zapisu ustawień'),
  });

  if (isLoading || !form) {
    return (
      <>
        <PageHeader title="Ustawienia fakturowania" back="/invoicing" />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 className="spinning" size={24} style={{ color: 'var(--tm)' }} />
        </div>
      </>
    );
  }

  const setCompany = (k: string, v: string) => setForm(prev => prev ? { ...prev, company: { ...prev.company, [k]: v } } : prev);
  const setNumbering = (k: string, v: any) => setForm(prev => prev ? { ...prev, numbering: { ...prev.numbering, [k]: v } } : prev);
  const setDefaults = (k: string, v: any) => setForm(prev => prev ? { ...prev, defaults: { ...prev.defaults, [k]: v } } : prev);
  const setAnnotations = (k: string, v: any) => setForm(prev => prev ? { ...prev, annotations: { ...prev.annotations, [k]: v } } : prev);
  const setModules = (k: string, v: any) => setForm(prev => prev ? { ...prev, modules: { ...(prev.modules || { useWarehouse: false, useCash: true }), [k]: v } } : prev);

  function addWarehouse() {
    setForm(prev => prev ? {
      ...prev,
      warehouses: [...(prev.warehouses || []), {
        id: crypto.randomUUID?.() || Date.now().toString(),
        name: '', code: '', address: '',
        isDefault: !(prev.warehouses || []).length,
      }],
    } : prev);
  }
  function updateWarehouse(idx: number, field: keyof Warehouse, value: any) {
    setForm(prev => {
      if (!prev) return prev;
      const warehouses = [...(prev.warehouses || [])];
      warehouses[idx] = { ...warehouses[idx], [field]: value };
      if (field === 'isDefault' && value) {
        warehouses.forEach((w, i) => { if (i !== idx) w.isDefault = false; });
      }
      return { ...prev, warehouses };
    });
  }
  function removeWarehouse(idx: number) {
    setForm(prev => prev ? { ...prev, warehouses: (prev.warehouses || []).filter((_, i) => i !== idx) } : prev);
  }

  // Bank accounts management
  function addBankAccount() {
    setForm(prev => prev ? {
      ...prev,
      bankAccounts: [...prev.bankAccounts, { name: '', bankName: '', accountNumber: '', swift: '', currency: 'PLN', isDefault: prev.bankAccounts.length === 0 }],
    } : prev);
  }
  function updateBankAccount(idx: number, field: keyof BankAccount, value: any) {
    setForm(prev => {
      if (!prev) return prev;
      const accounts = [...prev.bankAccounts];
      accounts[idx] = { ...accounts[idx], [field]: value };
      // If setting as default, unset others
      if (field === 'isDefault' && value === true) {
        accounts.forEach((a, i) => { if (i !== idx) a.isDefault = false; });
      }
      return { ...prev, bankAccounts: accounts };
    });
  }
  function removeBankAccount(idx: number) {
    setForm(prev => prev ? { ...prev, bankAccounts: prev.bankAccounts.filter((_, i) => i !== idx) } : prev);
  }

  return (
    <>
      <PageHeader
        title="Ustawienia fakturowania"
        subtitle="Dane firmy, konta bankowe, numeracja, domyślne ustawienia"
        back="/invoicing"
        actions={
          <Button variant="primary" icon={<Save size={14} />} onClick={() => saveMutation.mutate(form)} loading={saveMutation.isPending}>
            Zapisz ustawienia
          </Button>
        }
      />

      <div style={{ padding: '0 24px 80px', maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ══ 0. Moduły (warianty) ══ */}
        <Card>
          <SectionTitle icon={<Settings2 size={18} />} title="Moduły fakturowania" subtitle="Włącz/wyłącz funkcjonalności — system dopasuje się do Twoich potrzeb" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: form.modules?.useWarehouse ? 'rgba(99,102,241,0.04)' : 'transparent', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: form.modules?.useWarehouse ? 'rgba(99,102,241,0.12)' : 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: form.modules?.useWarehouse ? '#818CF8' : 'var(--td)' }}>
                <Warehouse size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Moduł magazynowy</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>Dokumenty WZ, PZ, MM oraz stany magazynowe produktów. Wyłącz jeśli używasz tylko fakturowania.</div>
              </div>
              <Toggle value={!!form.modules?.useWarehouse} onChange={v => setModules('useWarehouse', v)} label="" />
            </div>

            <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: (form.modules?.useCash ?? true) ? 'rgba(99,102,241,0.04)' : 'transparent', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: (form.modules?.useCash ?? true) ? 'rgba(99,102,241,0.12)' : 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: (form.modules?.useCash ?? true) ? '#818CF8' : 'var(--td)' }}>
                <Wallet size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Moduł kasowy</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>Dokumenty KP (wpłata) i KW (wypłata) — ewidencja gotówki.</div>
              </div>
              <Toggle value={form.modules?.useCash ?? true} onChange={v => setModules('useCash', v)} label="" />
            </div>
          </div>

          {/* Lista magazynów — widoczna tylko jeśli moduł włączony */}
          {form.modules?.useWarehouse && (
            <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Warehouse size={13} /> Twoje magazyny
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>Dodaj jeden lub więcej magazynów (np. główny, sklep, serwis)</div>
                </div>
                <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={addWarehouse}>Dodaj magazyn</Button>
              </div>

              {(form.warehouses || []).length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--td)' }}>
                  Brak magazynów — kliknij "Dodaj magazyn"
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(form.warehouses || []).map((w, idx) => (
                    <div key={w.id} style={{ padding: 12, borderRadius: 8, background: 'var(--bg-card, var(--bg2))', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 8 }}>
                        <div style={{ flex: 2 }}>
                          <Input label="Nazwa *" placeholder="np. Magazyn główny" value={w.name} onChange={e => updateWarehouse(idx, 'name', e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Input label="Kod" placeholder="MG-01" value={w.code} onChange={e => updateWarehouse(idx, 'code', e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!w.isDefault && (
                            <button type="button" onClick={() => updateWarehouse(idx, 'isDefault', true)} style={{
                              padding: '7px 10px', fontSize: 10, fontWeight: 600, borderRadius: 8,
                              border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
                            }}>Domyślny</button>
                          )}
                          <button type="button" onClick={() => removeWarehouse(idx)} style={{
                            padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)',
                            background: 'transparent', color: '#F87171', cursor: 'pointer', display: 'flex', alignItems: 'center',
                          }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <Input label="Adres" placeholder="ul. Magazynowa 5, 00-000 Warszawa" value={w.address} onChange={e => updateWarehouse(idx, 'address', e.target.value)} />
                      {w.isDefault && (
                        <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', color: '#818CF8', display: 'inline-block' }}>DOMYŚLNY</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ══ 1. Dane firmy ══ */}
        <Card>
          <SectionTitle icon={<Building2 size={18} />} title="Dane firmy (sprzedawca)" subtitle="Te dane pojawią się na każdym wystawionym dokumencie" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="Nazwa firmy / Imię i nazwisko" value={form.company.name} onChange={e => setCompany('name', e.target.value)} />
            <Input label="NIP" value={form.company.nip} onChange={e => setCompany('nip', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 12 }}>
            <Input label="REGON" value={form.company.regon} onChange={e => setCompany('regon', e.target.value)} />
            <Input label="KRS" placeholder="Opcjonalne" value={form.company.krs} onChange={e => setCompany('krs', e.target.value)} />
            <Input label="Sąd rejestrowy" placeholder="Opcjonalne" value={form.company.courtRegistry} onChange={e => setCompany('courtRegistry', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginTop: 12 }}>
            <Input label="Ulica i numer" value={form.company.street} onChange={e => setCompany('street', e.target.value)} />
            <Input label="Kod pocztowy" value={form.company.postalCode} onChange={e => setCompany('postalCode', e.target.value)} />
            <Input label="Miasto" value={form.company.city} onChange={e => setCompany('city', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
            <Input label="Email" value={form.company.email} onChange={e => setCompany('email', e.target.value)} />
            <Input label="Telefon" value={form.company.phone} onChange={e => setCompany('phone', e.target.value)} />
          </div>
        </Card>

        {/* ══ 2. Konta bankowe ══ */}
        <Card>
          <SectionTitle icon={<CreditCard size={18} />} title="Konta bankowe" subtitle="Konta wyświetlane na fakturach — możesz dodać wiele" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {form.bankAccounts.map((acc, idx) => (
              <div key={idx} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: acc.isDefault ? 'rgba(99,102,241,0.04)' : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ts)' }}>Konto {idx + 1}</span>
                    {acc.isDefault && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', color: '#818CF8' }}>DOMYŚLNE</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!acc.isDefault && (
                      <button type="button" onClick={() => updateBankAccount(idx, 'isDefault', true)}
                        style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        Ustaw domyślne
                      </button>
                    )}
                    <button type="button" onClick={() => removeBankAccount(idx)}
                      style={{ color: 'var(--td)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Input label="Nazwa konta" placeholder="np. Firmowe PLN" value={acc.name} onChange={e => updateBankAccount(idx, 'name', e.target.value)} />
                  <Input label="Nazwa banku" placeholder="np. mBank" value={acc.bankName} onChange={e => updateBankAccount(idx, 'bankName', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                  <Input label="Numer konta (IBAN)" placeholder="PL 00 0000 0000 0000 0000 0000 0000" value={acc.accountNumber} onChange={e => updateBankAccount(idx, 'accountNumber', e.target.value)} />
                  <Input label="SWIFT/BIC" placeholder="Opcjonalne" value={acc.swift} onChange={e => updateBankAccount(idx, 'swift', e.target.value)} />
                  <Input label="Waluta" placeholder="PLN" value={acc.currency} onChange={e => updateBankAccount(idx, 'currency', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" icon={<Plus size={14} />} onClick={addBankAccount}>Dodaj konto bankowe</Button>
          </div>
        </Card>

        {/* ══ 3. Numeracja ══ */}
        <Card>
          <SectionTitle icon={<Hash size={18} />} title="Numeracja dokumentów" subtitle="Format i sposób numerowania faktur" />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <Select label="Wzorzec numeracji" options={NUMBERING_PATTERNS} value={form.numbering.pattern} onChange={e => setNumbering('pattern', e.target.value)} />
            <Select label="Reset numeracji" options={RESET_OPTIONS} value={form.numbering.reset} onChange={e => setNumbering('reset', e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Input label="Następny numer" type="number" value={form.numbering.nextNumber} onChange={e => setNumbering('nextNumber', parseInt(e.target.value) || 1)} hint="Zmień jeśli chcesz kontynuować numerację od konkretnego numeru" />
          </div>
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--hover-bg)', fontSize: 11, color: 'var(--tm)' }}>
            Podgląd: <strong style={{ color: 'var(--t)' }}>FV/{form.numbering.nextNumber}/{String(new Date().getMonth() + 1).padStart(2, '0')}/{new Date().getFullYear()}</strong>
          </div>
        </Card>

        {/* ══ 4. Domyślne ustawienia ══ */}
        <Card>
          <SectionTitle icon={<Settings2 size={18} />} title="Domyślne ustawienia" subtitle="Wartości domyślne dla nowych dokumentów" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <Select label="Termin płatności" options={PAYMENT_DAYS_OPTIONS} value={String(form.defaults.paymentDays)} onChange={e => setDefaults('paymentDays', parseInt(e.target.value))} />
            <Select label="Sposób płatności" options={PAYMENT_METHODS} value={form.defaults.paymentMethod} onChange={e => setDefaults('paymentMethod', e.target.value)} />
            <Input label="Waluta" value={form.defaults.currency} onChange={e => setDefaults('currency', e.target.value)} />
            <Input label="Miejsce wystawienia" placeholder="np. Garwolin" value={form.defaults.placeOfIssue} onChange={e => setDefaults('placeOfIssue', e.target.value)} />
          </div>
        </Card>

        {/* ══ 5. Adnotacje ══ */}
        <Card>
          <SectionTitle icon={<FileText size={18} />} title="Adnotacje i stopka" subtitle="Obowiązkowe oznaczenia i tekst na dole faktury" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 12, paddingBottom: 4 }}>
            <Toggle value={form.annotations.splitPayment} onChange={v => setAnnotations('splitPayment', v)} label='Mechanizm podzielonej płatności (MPP) — obowiązkowe dla faktur >15 000 zł' />
            <Toggle value={form.annotations.cashMethod} onChange={v => setAnnotations('cashMethod', v)} label='Metoda kasowa — jeśli rozliczasz VAT metodą kasową' />
            <Toggle value={form.annotations.reverseCharge} onChange={v => setAnnotations('reverseCharge', v)} label='Odwrotne obciążenie — nabywca rozlicza VAT' />
          </div>
          <Textarea label="Stopka na fakturze" placeholder="np. Wpisz dodatkowy tekst który pojawi się na dole każdej faktury" value={form.annotations.footerNote} onChange={e => setAnnotations('footerNote', e.target.value)} />
        </Card>
      </div>
    </>
  );
}
