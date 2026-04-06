import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save, Loader2 } from 'lucide-react';
import { superadminApi } from '../../api/superadmin';

export default function SAConfigPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ['sa-config'], queryFn: superadminApi.getConfig });
  const [form, setForm] = useState<any>(null);

  useEffect(() => { if (config && !form) setForm({ ...config }); }, [config]);

  if (isLoading || !form) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-red-400" /></div>;

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    try { await superadminApi.updateConfig(form); qc.invalidateQueries({ queryKey: ['sa-config'] }); toast.success('Zapisano'); }
    catch { toast.error('Błąd'); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Stawki & Płatności</h1>

      <Card title="Stawki pomocy zdalnej">
        <div className="grid grid-cols-3 gap-4">
          <F label="Cena bazowa (zł)" value={form.remoteHelpBasePrice} onChange={v => set('remoteHelpBasePrice', Number(v))} type="number" />
          <F label="Stawka godzinowa (zł/h)" value={form.remoteHelpHourlyRate} onChange={v => set('remoteHelpHourlyRate', Number(v))} type="number" />
          <F label="Waluta" value={form.remoteHelpCurrency} onChange={v => set('remoteHelpCurrency', v)} />
        </div>
      </Card>

      <Card title="Bramka płatności (mBank / imoje)">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <F label="Gateway" value={form.paymentGateway} onChange={v => set('paymentGateway', v)} />
            <F label="Merchant ID" value={form.paymentMerchantId || ''} onChange={v => set('paymentMerchantId', v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="Service ID" value={form.paymentServiceId || ''} onChange={v => set('paymentServiceId', v)} />
            <F label="API Key" value={form.paymentApiKey || ''} onChange={v => set('paymentApiKey', v)} type="password" />
          </div>
          <Tog label="Płatności włączone" value={form.paymentEnabled} onChange={v => set('paymentEnabled', v)} />
        </div>
      </Card>

      <Card title="Google Drive — kopie zapasowe w chmurze">
        <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: '#60A5FA' }}>Jak uzyskac klucze? (jednorazowa konfiguracja, 5 minut)</p>
          <ol className="text-[11px] space-y-1.5" style={{ color: 'var(--tm)', paddingLeft: 16, listStyleType: 'decimal' }}>
            <li>
              Otworz{' '}
              <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer"
                className="font-semibold underline" style={{ color: '#60A5FA' }}>
                Google Cloud Console — nowy projekt
              </a>
              {' '}i nadaj mu nazwe np. "InfraDesk Backup"
            </li>
            <li>
              Wlacz Google Drive API:{' '}
              <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer"
                className="font-semibold underline" style={{ color: '#60A5FA' }}>
                Kliknij tutaj i nacisnij "Wlacz"
              </a>
            </li>
            <li>
              Przejdz do{' '}
              <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer"
                className="font-semibold underline" style={{ color: '#60A5FA' }}>
                Ekran zgody OAuth
              </a>
              {' '}— wybierz typ "Zewnetrzny", wpisz nazwe aplikacji i swoj email, reszta domyslna, zapisz
            </li>
            <li>
              Przejdz do{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                className="font-semibold underline" style={{ color: '#60A5FA' }}>
                Dane logowania
              </a>
              {' '}— kliknij "+ Utworz dane logowania" → "Identyfikator klienta OAuth"
            </li>
            <li>Typ aplikacji: <strong>Aplikacja internetowa</strong></li>
            <li>
              W "Autoryzowane identyfikatory URI przekierowania" dodaj:<br />
              <code className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--hover-bg)', color: '#60A5FA', userSelect: 'all' }}>
                https://infradesk.pl/api/backup/google/callback
              </code>
            </li>
            <li>Kliknij "Utworz" — skopiuj <strong>Client ID</strong> i <strong>Client Secret</strong> i wklej ponizej</li>
          </ol>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <F label="Client ID" value={form.googleClientId || ''} onChange={v => set('googleClientId', v)} />
          <F label="Client Secret" value={form.googleClientSecret || ''} onChange={v => set('googleClientSecret', v)} type="password" />
        </div>
        {form.googleClientId && form.googleClientSecret && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold" style={{ color: '#4ADE80' }}>
            <div className="w-2 h-2 rounded-full bg-emerald-400" /> Skonfigurowano — klienci moga uzywac Google Drive w kopii zapasowej
          </div>
        )}
      </Card>

      <Card title="Ogólne">
        <div className="grid grid-cols-3 gap-4">
          <F label="Nazwa platformy" value={form.platformName} onChange={v => set('platformName', v)} />
          <F label="Email wsparcia" value={form.supportEmail || ''} onChange={v => set('supportEmail', v)} />
          <F label="Telefon wsparcia" value={form.supportPhone || ''} onChange={v => set('supportPhone', v)} />
        </div>
      </Card>

      <button onClick={save} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(145deg, #DC2626, #991B1B)', boxShadow: '0 2px 12px rgba(220,38,38,0.2)' }}>
        <Save className="h-4 w-4" /> Zapisz
      </button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--ts)' }}>{title}</h3>
      {children}
    </div>
  );
}
function F({ label, value, onChange, type = 'text' }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>{label}</label>
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none"
        style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
    </div>
  );
}
function Tog({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-all"
      style={{ background: value ? 'rgba(34,197,94,0.1)' : 'var(--hover-bg)', border: value ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)', color: value ? '#4ADE80' : 'var(--ts)' }}>
      <div className={`w-3 h-3 rounded-full ${value ? 'bg-emerald-400' : 'bg-[var(--td)]'}`} /> {label}
    </button>
  );
}
