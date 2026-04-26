/**
 * JPK eksport — Jednolity Plik Kontrolny
 * Generowanie JPK_FA (faktury sprzedaży) w formacie XML
 */
import { useState, useEffect } from 'react';
import { Download, FileText, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { fmtPLN } from './utils';

interface JpkPreview {
  dateFrom: string;
  dateTo: string;
  count: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  documents: Array<{
    id: string;
    number: string;
    issuedAt: string;
    contractorName: string;
    contractorNip: string | null;
    totalNet: number;
    totalVat: number;
    totalGross: number;
    status: string;
  }>;
}

function firstDayOfMonth(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastDayOfMonth(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function prevMonth(): { from: string; to: string } {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return { from: firstDayOfMonth(d), to: lastDayOfMonth(d) };
}

export function JpkExportPage() {
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(lastDayOfMonth());
  const [preview, setPreview] = useState<JpkPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const { data } = await api.get(`/invoicing/jpk/fa/preview?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      setPreview(data);
    } catch { toast.error('Nie udało się załadować podglądu'); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadPreview(); /* eslint-disable-next-line */ }, []);

  async function downloadJpk() {
    setDownloading(true);
    try {
      const response = await api.get(`/invoicing/jpk/fa?dateFrom=${dateFrom}&dateTo=${dateTo}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JPK_FA_${dateFrom.replace(/-/g, '')}_${dateTo.replace(/-/g, '')}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Plik JPK_FA pobrany');
    } catch {
      toast.error('Nie udało się wygenerować pliku');
    } finally { setDownloading(false); }
  }

  function setPreset(preset: 'this_month' | 'last_month' | 'this_quarter' | 'this_year') {
    if (preset === 'this_month') {
      setDateFrom(firstDayOfMonth());
      setDateTo(lastDayOfMonth());
    } else if (preset === 'last_month') {
      const { from, to } = prevMonth();
      setDateFrom(from);
      setDateTo(to);
    } else if (preset === 'this_quarter') {
      const d = new Date();
      const q = Math.floor(d.getMonth() / 3);
      setDateFrom(new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10));
      setDateTo(new Date(d.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10));
    } else if (preset === 'this_year') {
      const y = new Date().getFullYear();
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-12-31`);
    }
  }

  return (
    <>
      <PageHeader
        title="JPK — Jednolity Plik Kontrolny"
        subtitle="Eksport ewidencji faktur sprzedaży do urzędu skarbowego"
        back="/invoicing"
      />

      <div style={{ padding: '0 24px 40px', maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Info ── */}
        <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', gap: 12 }}>
          <AlertCircle size={18} style={{ color: '#818CF8', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: 'var(--ts)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--t)' }}>JPK_FA (wariant 3)</strong> — ewidencja faktur sprzedaży VAT zgodna ze schematem Ministerstwa Finansów.
            Plik XML przekażesz na <a href="https://www.podatki.gov.pl/pit/jpk" target="_blank" rel="noopener noreferrer" style={{ color: '#818CF8' }}>e-Deklaracje</a> lub przekażesz księgowemu.
          </div>
        </div>

        {/* ── Zakres dat ── */}
        <Card title="Zakres dat">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Button size="sm" variant="secondary" onClick={() => setPreset('this_month')}>Bieżący miesiąc</Button>
            <Button size="sm" variant="secondary" onClick={() => setPreset('last_month')}>Poprzedni miesiąc</Button>
            <Button size="sm" variant="secondary" onClick={() => setPreset('this_quarter')}>Bieżący kwartał</Button>
            <Button size="sm" variant="secondary" onClick={() => setPreset('this_year')}>Bieżący rok</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 14, alignItems: 'flex-end' }}>
            <Input label="Data od" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <Input label="Data do" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <Button variant="primary" onClick={loadPreview} loading={loading} icon={<Calendar size={14} />}>Pokaż</Button>
          </div>
        </Card>

        {/* ── Podgląd ── */}
        {preview && (
          <>
            <Card title={`Podsumowanie (${preview.dateFrom} — ${preview.dateTo})`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Liczba faktur</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)' }}>{preview.count}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Razem netto</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ts)' }}>{fmtPLN(preview.totalNet)} zł</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Razem VAT</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ts)' }}>{fmtPLN(preview.totalVat)} zł</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Razem brutto</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#818CF8' }}>{fmtPLN(preview.totalGross)} zł</div>
                </div>
              </div>
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--tm)' }}>
                  {preview.count === 0 ? '⚠️ Brak faktur w wybranym okresie' : `Zostaną uwzględnione tylko faktury o statusie: wystawiona, wysłana, zapłacona, częściowo zapłacona`}
                </div>
                <Button variant="primary" icon={downloading ? <Loader2 size={14} className="spinning" /> : <Download size={14} />}
                  onClick={downloadJpk} disabled={downloading || preview.count === 0}>
                  {downloading ? 'Generuję...' : 'Pobierz JPK_FA.xml'}
                </Button>
              </div>
            </Card>

            {/* Lista dokumentów */}
            {preview.documents.length > 0 && (
              <Card title={`Dokumenty w JPK (${preview.documents.length})`} noPadding>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                        {['Numer', 'Data', 'Kontrahent', 'NIP', 'Netto', 'VAT', 'Brutto'].map((h, i) => (
                          <th key={i} style={{ padding: '10px 14px', textAlign: ['Netto', 'VAT', 'Brutto'].includes(h) ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.documents.map(d => (
                        <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--t)', fontFamily: 'monospace', fontSize: 11 }}>{d.number}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ts)' }}>{d.issuedAt.slice(0, 10)}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ts)', fontWeight: 500 }}>{d.contractorName}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--td)', fontFamily: 'monospace', fontSize: 11 }}>{d.contractorNip || '—'}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ts)', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPLN(d.totalNet)}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--ts)', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPLN(d.totalVat)}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--t)', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{fmtPLN(d.totalGross)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Instrukcja */}
        <Card title="Jak wysłać JPK_FA do urzędu skarbowego?">
          <ol style={{ fontSize: 12, color: 'var(--ts)', lineHeight: 1.8, paddingLeft: 20 }}>
            <li>Pobierz plik <strong>JPK_FA.xml</strong> klikając przycisk powyżej</li>
            <li>Wejdź na stronę <a href="https://e-mikrofirma.mf.gov.pl/" target="_blank" rel="noopener" style={{ color: '#818CF8' }}>e-mikrofirma</a> lub użyj aplikacji <strong>e-Deklaracje</strong></li>
            <li>Zaloguj się profilem zaufanym, e-dowodem lub podpisem kwalifikowanym</li>
            <li>Wybierz <strong>"Wyślij plik JPK"</strong> i załącz pobrany XML</li>
            <li>Podpisz i wyślij — dostaniesz UPO (Urzędowe Poświadczenie Odbioru)</li>
          </ol>
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--hover-bg)', fontSize: 11, color: 'var(--tm)' }}>
            💡 <strong>Uwaga:</strong> JPK_FA wysyłasz <strong>na żądanie</strong> urzędu skarbowego (nie co miesiąc). JPK_V7M/V7K (ewidencja VAT z deklaracją) wysyłasz co miesiąc — ten eksport będzie dodany wkrótce.
          </div>
        </Card>
      </div>
    </>
  );
}
