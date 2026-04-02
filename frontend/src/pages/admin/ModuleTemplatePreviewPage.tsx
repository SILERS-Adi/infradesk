/**
 * IDS 1.0 — Module Template Preview
 *
 * Strona demonstracyjna pokazująca wszystkie wzorce modułowe IDS 1.0.
 * Dostępna pod: /ids-preview
 * Nie jest funkcją biznesową — służy do oceny standardu UI.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, ArrowUpRight, AlertTriangle, BarChart3, Plus, Eye, Trash2,
  Edit3, Download, Copy, Save, Send, Search, FileText, Users, Package,
  Building2, Calendar, CreditCard, Info, CheckCircle2, Shield,
} from 'lucide-react';

// IDS Components
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { KpiCard } from '../../components/ui/KpiCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { Alert } from '../../components/ui/Alert';
import { Switch } from '../../components/ui/Switch';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';

// Template components
import { SectionCard } from '../../templates/module-template/components/SectionCard';

// ── Section divider ──
function SectionDivider({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div id={id} style={{ padding: '40px 0 16px', borderBottom: '2px solid var(--accent)', marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        IDS 1.0 TEMPLATE
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.02em' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--tm)', marginTop: 4 }}>{description}</div>
    </div>
  );
}

// ── Mock data ──
interface MockItem {
  id: string;
  number: string;
  contractor: string;
  net: number;
  gross: number;
  status: string;
  date: string;
}

const MOCK_LIST: MockItem[] = [
  { id: '1', number: 'FV/2026/04/001', contractor: 'TechNova Sp. z o.o.', net: 10000, gross: 12300, status: 'paid', date: '2026-04-01' },
  { id: '2', number: 'FV/2026/04/002', contractor: 'DataStream S.A.', net: 5600, gross: 6888, status: 'issued', date: '2026-04-02' },
  { id: '3', number: 'PF/2026/04/001', contractor: 'CloudBase Sp. z o.o.', net: 890, gross: 1094.70, status: 'draft', date: '2026-04-02' },
  { id: '4', number: 'FV/2026/03/015', contractor: 'NetSolutions Sp. z o.o.', net: 3200, gross: 3936, status: 'overdue', date: '2026-03-15' },
  { id: '5', number: 'FK/2026/04/001', contractor: 'TechNova Sp. z o.o.', net: -500, gross: -615, status: 'issued', date: '2026-04-03' },
];

const STATUS_MAP: Record<string, { label: string; color: 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' }> = {
  draft: { label: 'Szkic', color: 'gray' },
  issued: { label: 'Wystawiona', color: 'blue' },
  paid: { label: 'Zapłacona', color: 'green' },
  overdue: { label: 'Przeterminowana', color: 'red' },
  sent: { label: 'Wysłana', color: 'purple' },
  partially_paid: { label: 'Częściowo', color: 'yellow' },
};

const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Navigation sidebar for preview ──
const NAV_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'list', label: 'Lista' },
  { id: 'detail', label: 'Szczegóły' },
  { id: 'form', label: 'Formularz' },
  { id: 'components', label: 'Komponenty' },
  { id: 'empty', label: 'Empty States' },
];

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════

export default function ModuleTemplatePreviewPage() {
  // Theme toggle for preview
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', previewTheme);
    return () => { /* don't restore — user can toggle */ };
  }, [previewTheme]);

  // Form demo state
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('a');
  const [formDate, setFormDate] = useState('2026-04-02');
  const [formNotes, setFormNotes] = useState('');
  const [formSwitch1, setFormSwitch1] = useState(true);
  const [formSwitch2, setFormSwitch2] = useState(false);

  // List demo state
  const [listSearch, setListSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listFilter, setListFilter] = useState('');

  // Modal demo
  const [modalOpen, setModalOpen] = useState(false);

  // Filtered list
  const filtered = MOCK_LIST.filter(item => {
    if (listSearch && !item.contractor.toLowerCase().includes(listSearch.toLowerCase()) && !item.number.toLowerCase().includes(listSearch.toLowerCase())) return false;
    if (listFilter && item.status !== listFilter) return false;
    return true;
  });

  // DataTable columns
  const columns: Column<MockItem>[] = [
    {
      key: 'number', header: 'Numer',
      render: (row) => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{row.number}</span>,
    },
    { key: 'contractor', header: 'Kontrahent' },
    {
      key: 'net', header: 'Netto',
      render: (row) => <span style={{ textAlign: 'right', display: 'block' }}>{fmt(row.net)}</span>,
    },
    {
      key: 'gross', header: 'Brutto',
      render: (row) => <span style={{ fontWeight: 600, textAlign: 'right', display: 'block' }}>{fmt(row.gross)} zł</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (row) => {
        const s = STATUS_MAP[row.status] || STATUS_MAP.draft;
        return <Badge color={s.color}>{s.label}</Badge>;
      },
    },
    {
      key: 'date', header: 'Data',
      render: (row) => <span style={{ color: 'var(--tm)' }}>{row.date}</span>,
    },
    {
      key: 'actions', header: '',
      render: () => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 4, display: 'flex' }}><Eye size={15} /></button>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }}><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="IDS 1.0 — Module Template Preview"
        subtitle="Podgląd standardowych wzorców dla modułów InfraDesk"
      />

      <div style={{ padding: '0 24px 60px' }}>

        {/* ── Theme toggle + Quick nav ── */}
        <Card noPadding>
          <div style={{ padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, marginRight: 12, padding: '4px', borderRadius: 'var(--rs)', background: 'var(--hover-bg)' }}>
              <button onClick={() => setPreviewTheme('dark')} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: previewTheme === 'dark' ? 'var(--accent)' : 'transparent',
                color: previewTheme === 'dark' ? '#fff' : 'var(--tm)',
              }}>Dark</button>
              <button onClick={() => setPreviewTheme('light')} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: previewTheme === 'light' ? 'var(--accent)' : 'transparent',
                color: previewTheme === 'light' ? '#fff' : 'var(--tm)',
              }}>Light</button>
            </div>
            {NAV_SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} style={{
                padding: '6px 14px', borderRadius: 'var(--rs)', border: '1px solid var(--border)',
                background: 'var(--hover-bg)', color: 'var(--ts)', fontSize: 12, fontWeight: 600,
                textDecoration: 'none', transition: 'var(--trf)',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--ts)'; }}
              >{s.label}</a>
            ))}
          </div>
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            1. DASHBOARD TEMPLATE
           ══════════════════════════════════════════════════════════════ */}
        <SectionDivider id="dashboard" title="Dashboard Template" description="Landing page modułu — KPI strip, recent items, status breakdown" />

        {/* KPI Strip */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Obroty brutto" value="123 456,78 zł" sub="+12% vs poprzedni miesiąc" icon={<TrendingUp size={20} color="#fff" />} color="var(--accent)" />
          <KpiCard label="Netto" value="100 000,00 zł" icon={<ArrowUpRight size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="Zaległe" value="3" icon={<AlertTriangle size={20} color="#fff" />} color="#F87171" />
          <KpiCard label="Dokumentów" value="47" icon={<BarChart3 size={20} color="#fff" />} color="#60A5FA" />
        </div>

        {/* Dashboard grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <Card title="Ostatnie dokumenty" noPadding>
            {MOCK_LIST.slice(0, 3).map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{item.number}</div>
                  <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{item.contractor}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ts)' }}>{fmt(item.gross)} zł</div>
                  <Badge color={STATUS_MAP[item.status]?.color || 'gray'}>{STATUS_MAP[item.status]?.label || item.status}</Badge>
                </div>
              </div>
            ))}
          </Card>

          <Card title="Status dokumentów">
            {Object.entries(STATUS_MAP).slice(0, 4).map(([key, s]) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <Badge color={s.color}>{s.label}</Badge>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{Math.floor(Math.random() * 20) + 1}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            2. LIST TEMPLATE
           ══════════════════════════════════════════════════════════════ */}
        <SectionDivider id="list" title="List Template" description="Toolbar (search + filtry) → DataTable → Pagination" />

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={listSearch} onChange={setListSearch} placeholder="Szukaj dokumentów..." />
          <select value={listFilter} onChange={(e) => setListFilter(e.target.value)}
            style={{
              padding: '9px 32px 9px 12px', borderRadius: 'var(--rs)',
              border: '1px solid var(--border)', background: 'var(--hover-bg)',
              color: 'var(--t)', fontSize: 13, outline: 'none', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
            }}>
            <option value="">Wszystkie statusy</option>
            <option value="draft">Szkic</option>
            <option value="issued">Wystawiona</option>
            <option value="paid">Zapłacona</option>
            <option value="overdue">Przeterminowana</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--tm)' }}>{filtered.length} dokumentów</span>
            <Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowy dokument</Button>
          </div>
        </div>

        {/* DataTable */}
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(row) => row.id}
          emptyTitle="Brak dokumentów"
          emptyDescription="Zmień filtry lub utwórz nowy dokument."
        />

        {/* Pagination */}
        <Card noPadding>
          <Pagination page={listPage} total={127} perPage={50} onPageChange={setListPage} />
        </Card>

        {/* ══════════════════════════════════════════════════════════════
            3. DETAIL TEMPLATE
           ══════════════════════════════════════════════════════════════ */}
        <SectionDivider id="detail" title="Detail Template" description="Badges → Info grid (2 kolumny) → Items table → Action bar" />

        {/* Status badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Badge color="green">Zapłacona</Badge>
          <Badge color="purple">KSeF: 1234567</Badge>
          <Badge color="yellow">MPP</Badge>
        </div>

        {/* Two-column info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <SectionCard icon={Building2} label="Sprzedawca">
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)' }}>Silers Sp. z o.o.</div>
            <div>NIP: 1234567890</div>
            <div>ul. Testowa 1</div>
            <div>00-001 Warszawa</div>
            <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Nabywca</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)' }}>TechNova Sp. z o.o.</div>
            <div>NIP: 9876543210</div>
            <div>ul. Innowacji 5, 02-100 Kraków</div>
          </SectionCard>

          <SectionCard icon={Calendar} label="Daty i płatność">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              <span style={{ color: 'var(--tm)' }}>Data wystawienia:</span>
              <span style={{ fontWeight: 600 }}>2026-04-01</span>
              <span style={{ color: 'var(--tm)' }}>Termin płatności:</span>
              <span style={{ fontWeight: 600 }}>2026-04-15</span>
              <span style={{ color: 'var(--tm)' }}>Metoda:</span>
              <span style={{ fontWeight: 600 }}>Przelew bankowy</span>
              <span style={{ color: 'var(--tm)' }}>Zapłacono:</span>
              <span style={{ fontWeight: 600, color: '#4ADE80' }}>12 300,00 zł</span>
              <span style={{ color: 'var(--tm)' }}>Pozostało:</span>
              <span style={{ fontWeight: 600, color: '#4ADE80' }}>0,00 zł</span>
            </div>
          </SectionCard>
        </div>

        {/* Items table */}
        <Card title="Pozycje dokumentu" noPadding>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Lp', 'Nazwa', 'Ilość', 'Cena netto', 'VAT', 'Brutto'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)',
                      textAlign: ['Ilość', 'Cena netto', 'VAT', 'Brutto'].includes(h) ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--tm)' }}>1</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Usługa IT — wsparcie techniczne</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>10</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>1 000,00</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--tm)', textAlign: 'right' }}>2 300,00</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right' }}>12 300,00</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--tm)' }}>2</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Licencja Microsoft 365</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>5</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>89,00</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--tm)', textAlign: 'right' }}>102,35</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right' }}>547,35</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Action bar */}
        <div style={{ marginTop: 20 }}>
          <Card noPadding>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button size="sm" icon={<Download size={14} />}>PDF</Button>
              <Button size="sm" variant="secondary" icon={<Copy size={14} />}>Duplikuj</Button>
              <Button size="sm" variant="secondary" icon={<Edit3 size={14} />}>Edytuj</Button>
              <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
              <Button size="sm" variant="secondary" icon={<CreditCard size={14} />}>Dodaj płatność</Button>
              <div style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="danger" icon={<Trash2 size={14} />}>Usuń</Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            4. FORM TEMPLATE
           ══════════════════════════════════════════════════════════════ */}
        <SectionDivider id="form" title="Form Template" description="Card sekcje → Grid inputów → Editable table → Sticky footer (symulacja)" />

        <Alert type="info" title="Sticky footer">
          W prawdziwym formularzu footer jest fixed na dole ekranu. Tutaj jest pokazany inline dla demonstracji.
        </Alert>

        <div style={{ maxWidth: 920, marginTop: 20 }}>
          {/* Section 1 */}
          <Card title="Dane podstawowe">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Nazwa" placeholder="np. Zamówienie #001" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} error={formTitle === '' ? undefined : undefined} />
              <Select label="Kategoria" options={[{ value: 'a', label: 'Faktura VAT' }, { value: 'b', label: 'Proforma' }, { value: 'c', label: 'Korekta' }]} value={formCategory} onChange={(e) => setFormCategory(e.target.value)} />
              <Input label="Data wystawienia" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              <Input label="Termin płatności" type="date" value="2026-04-16" onChange={() => {}} />
            </div>
          </Card>

          <div style={{ marginTop: 20 }}>
            <Card title="Kontrahent">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                <Input label="Nazwa kontrahenta" placeholder="np. Firma XYZ Sp. z o.o." value="TechNova Sp. z o.o." onChange={() => {}} />
                <Input label="NIP" placeholder="np. 1234567890" value="1234567890" onChange={() => {}} />
              </div>
            </Card>
          </div>

          <div style={{ marginTop: 20 }}>
            <Card title="Uwagi">
              <Textarea label="Notatki na dokumencie" placeholder="np. Płatność przelewem na konto podane na fakturze" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </Card>
          </div>

          {/* Simulated sticky footer */}
          <div style={{
            marginTop: 20, padding: '14px 20px', borderRadius: 'var(--rs)',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
          }}>
            <Button variant="ghost">Anuluj</Button>
            <Button variant="secondary" icon={<Save size={14} />}>Zapisz szkic</Button>
            <Button variant="primary" icon={<Send size={14} />}>Wystaw dokument</Button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            5. COMPONENTS SHOWCASE
           ══════════════════════════════════════════════════════════════ */}
        <SectionDivider id="components" title="Komponenty IDS 1.0" description="Przegląd wszystkich dostępnych komponentów foundation" />

        {/* Buttons */}
        <Card title="Button — warianty i rozmiary">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <Button size="sm" variant="primary">Small</Button>
            <Button size="md" variant="primary">Medium</Button>
            <Button size="lg" variant="primary">Large</Button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" icon={<Plus size={14} />}>Z ikoną</Button>
            <Button variant="primary" loading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </Card>

        {/* Badges */}
        <div style={{ marginTop: 20 }}>
          <Card title="Badge — paleta kolorów">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge color="gray">Gray</Badge>
              <Badge color="blue">Blue</Badge>
              <Badge color="green">Green</Badge>
              <Badge color="yellow">Yellow</Badge>
              <Badge color="orange">Orange</Badge>
              <Badge color="red">Red</Badge>
              <Badge color="indigo">Indigo</Badge>
              <Badge color="purple">Purple</Badge>
              <Badge color="pink">Pink</Badge>
            </div>
          </Card>
        </div>

        {/* Alerts */}
        <div style={{ marginTop: 20 }}>
          <Card title="Alert — 4 typy">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Alert type="info" title="Informacja">To jest komunikat informacyjny.</Alert>
              <Alert type="success" title="Sukces">Operacja zakończona pomyślnie.</Alert>
              <Alert type="warning" title="Uwaga">Sprawdź dane przed kontynuacją.</Alert>
              <Alert type="error" title="Błąd">Nie udało się zapisać dokumentu.</Alert>
            </div>
          </Card>
        </div>

        {/* Switch */}
        <div style={{ marginTop: 20 }}>
          <Card title="Switch — toggle z opisem">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Switch checked={formSwitch1} onChange={setFormSwitch1} label="Włączone powiadomienia" description="Otrzymuj emaile o zmianach statusu dokumentów." />
              <Switch checked={formSwitch2} onChange={setFormSwitch2} label="Tryb zaawansowany" description="Pokaż dodatkowe pola w formularzach." />
              <Switch checked={false} onChange={() => {}} label="Wyłączony switch" description="Ten toggle jest disabled." disabled />
            </div>
          </Card>
        </div>

        {/* Modal */}
        <div style={{ marginTop: 20 }}>
          <Card title="Modal — dialog">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Otwórz modal</Button>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Przykładowy dialog" size="md"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>Anuluj</Button>
                  <Button variant="primary" onClick={() => setModalOpen(false)}>Potwierdź</Button>
                </>
              }>
              <p style={{ fontSize: 13, color: 'var(--ts)', margin: 0, lineHeight: 1.6 }}>
                To jest przykładowy modal IDS 1.0. Używaj go do potwierdzeń, formularzy inline i szybkich akcji.
                Rozmiary: sm (380px), md (440px), lg (520px), xl (600px), 2xl (680px).
              </p>
            </Modal>
          </Card>
        </div>

        {/* Input error state */}
        <div style={{ marginTop: 20 }}>
          <Card title="Input — stany">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Input label="Normalny" placeholder="Wpisz tekst..." value="" onChange={() => {}} />
              <Input label="Z błędem" placeholder="Wpisz tekst..." value="zła wartość" onChange={() => {}} error="To pole jest niepoprawne" />
              <Input label="Z podpowiedzią" placeholder="Wpisz tekst..." value="" onChange={() => {}} hint="Format: XX-XXX" />
            </div>
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            6. EMPTY STATES
           ══════════════════════════════════════════════════════════════ */}
        <SectionDivider id="empty" title="Empty State Patterns" description="3 standardowe wzorce pustego stanu" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          <Card title="Brak danych" noPadding>
            <EmptyState
              icon={<FileText style={{ width: 22, height: 22, color: 'var(--td)' }} />}
              title="Brak dokumentów"
              description="Utwórz pierwszy dokument."
              action={<Button variant="primary" size="sm" icon={<Plus size={14} />}>Utwórz</Button>}
            />
          </Card>
          <Card title="Brak wyników" noPadding>
            <EmptyState
              icon={<Search style={{ width: 22, height: 22, color: 'var(--td)' }} />}
              title="Brak wyników"
              description="Zmień kryteria wyszukiwania."
              action={<Button variant="secondary" size="sm">Wyczyść filtry</Button>}
            />
          </Card>
          <Card title="Brak dostępu" noPadding>
            <EmptyState
              icon={<Shield style={{ width: 22, height: 22, color: 'var(--accent)' }} />}
              title="Brak dostępu"
              description="Skontaktuj się z administratorem."
            />
          </Card>
        </div>

        {/* ── Footer note ── */}
        <div style={{ marginTop: 40, padding: 20, textAlign: 'center', color: 'var(--td)', fontSize: 12 }}>
          IDS 1.0 — InfraDesk Design System · Module Template Preview · v1.0
        </div>
      </div>
    </>
  );
}
