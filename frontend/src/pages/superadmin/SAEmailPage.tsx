import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save, Send, Loader2 } from 'lucide-react';
import { superadminApi } from '../../api/superadmin';

export default function SAEmailPage() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ['sa-config'], queryFn: superadminApi.getConfig });
  const [form, setForm] = useState<any>(null);
  const [testEmail, setTestEmail] = useState('');

  useEffect(() => { if (config && !form) setForm({ ...config }); }, [config]);

  if (isLoading || !form) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-red-400" /></div>;

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    try { await superadminApi.updateConfig(form); qc.invalidateQueries({ queryKey: ['sa-config'] }); toast.success('Zapisano'); }
    catch { toast.error('Błąd'); }
  };
  const sendTest = async (type: 'notify' | 'alert') => {
    if (!testEmail) { toast.error('Wpisz email'); return; }
    try { await superadminApi.testEmail(type, testEmail); toast.success(`Test wysłany na ${testEmail}`); }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Konfiguracja email</h1>

      <Card title="Powiadomienia" desc="Potwierdzenia, powiadomienia o zgłoszeniach, resetowanie haseł">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <F label="SMTP Host" value={form.notifySmtpHost || ''} onChange={v => set('notifySmtpHost', v)} />
            <F label="Port" value={form.notifySmtpPort || 587} onChange={v => set('notifySmtpPort', Number(v))} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="Login" value={form.notifySmtpUser || ''} onChange={v => set('notifySmtpUser', v)} />
            <F label="Hasło" value={form.notifySmtpPass || ''} onChange={v => set('notifySmtpPass', v)} type="password" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="Adres nadawcy" value={form.notifySmtpFrom || ''} onChange={v => set('notifySmtpFrom', v)} />
            <F label="Nazwa nadawcy" value={form.notifySmtpFromName || ''} onChange={v => set('notifySmtpFromName', v)} />
          </div>
        </div>
      </Card>

      <Card title="Alerty" desc="Alerty o problemach, krytyczne zdarzenia, niski dysk, usługi zatrzymane">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <F label="SMTP Host" value={form.alertSmtpHost || ''} onChange={v => set('alertSmtpHost', v)} />
            <F label="Port" value={form.alertSmtpPort || 587} onChange={v => set('alertSmtpPort', Number(v))} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="Login" value={form.alertSmtpUser || ''} onChange={v => set('alertSmtpUser', v)} />
            <F label="Hasło" value={form.alertSmtpPass || ''} onChange={v => set('alertSmtpPass', v)} type="password" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="Adres nadawcy" value={form.alertSmtpFrom || ''} onChange={v => set('alertSmtpFrom', v)} />
            <F label="Nazwa nadawcy" value={form.alertSmtpFromName || ''} onChange={v => set('alertSmtpFromName', v)} />
          </div>
        </div>
      </Card>

      <Card title="Test wysyłki">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>Adres testowy</label>
            <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@email.com"
              className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
          </div>
          <button onClick={() => sendTest('notify')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 flex-shrink-0">
            <Send className="h-3 w-3" /> Powiadomienie
          </button>
          <button onClick={() => sendTest('alert')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-red-600/15 text-red-400 hover:bg-red-600/25 flex-shrink-0">
            <Send className="h-3 w-3" /> Alert
          </button>
        </div>
      </Card>

      <button onClick={save} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(145deg, #DC2626, #991B1B)', boxShadow: '0 2px 12px rgba(220,38,38,0.2)' }}>
        <Save className="h-4 w-4" /> Zapisz konfigurację email
      </button>
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--ts)' }}>{title}</h3>
      {desc && <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--tm)' }}>{desc}</p>}
      {!desc && <div className="mb-4" />}
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
