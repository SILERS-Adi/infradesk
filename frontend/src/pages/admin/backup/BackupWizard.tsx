import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Server, CheckCircle, XCircle, Loader2, Shield, ChevronRight, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../api/client';
import { operatorApi } from '../../../api/operator';
import { agentsApi } from '../../../api/agents';
import { backupApi } from '../../../api/backup';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';

interface ScanResult {
  databases: { type: string; port: number; host: string; status: string }[];
  services: { name: string; running: boolean }[];
  hostname: string;
}

interface TestResult {
  success: boolean;
  databases?: string[];
  error?: string;
  type?: string;
}

type Step = 'select-agent' | 'scan' | 'credentials' | 'configure' | 'done';

const SCHEDULE_OPTIONS = [
  { value: '0 2 * * *', label: 'Codziennie o 02:00' },
  { value: '0 */6 * * *', label: 'Co 6 godzin' },
  { value: '0 */12 * * *', label: 'Co 12 godzin' },
  { value: '0 0 * * 0', label: 'Co niedzielę o 00:00' },
];

export default function BackupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { wsType } = useWorkspaceContext();
  const [step, setStep] = useState<Step>('select-agent');
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedDb, setSelectedDb] = useState<any>(null);
  const [credentials, setCredentials] = useState({ user: '', password: '', database: '' });
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [dbList, setDbList] = useState<string[]>([]);
  const [selectedDbs, setSelectedDbs] = useState<string[]>([]);
  const [schedule, setSchedule] = useState('0 2 * * *');
  const [backupName, setBackupName] = useState('');

  // Fetch agents
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAll(),
    enabled: open,
  });

  const onlineAgents = agents.filter((a: any) => {
    const ls = a.lastSeen ? Date.now() - new Date(a.lastSeen).getTime() : Infinity;
    return a.status === 'ACTIVE' && ls < 5 * 60 * 1000;
  });

  // Scan databases command
  const scanMut = useMutation({
    mutationFn: (agentId: string) =>
      apiClient.post(`/agent/${agentId}/command`, { command: 'scan_databases' }).then(r => r.data.data),
    onSuccess: (data) => { setScanResult(data); setStep('scan'); },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? 'Błąd skanowania';
      toast.error(msg);
    },
  });

  // Test connection command
  const testMut = useMutation({
    mutationFn: () =>
      apiClient.post(`/agent/${selectedAgent.id}/command`, {
        command: 'test_db_connection',
        payload: {
          type: selectedDb.type,
          host: selectedDb.host,
          port: selectedDb.port,
          user: credentials.user,
          password: credentials.password,
          database: credentials.database || undefined,
        },
      }).then(r => r.data.data),
    onSuccess: (data: TestResult) => {
      setTestResult(data);
      if (data.success && data.databases) {
        setDbList(data.databases);
        setSelectedDbs(data.databases);
      }
    },
    onError: () => toast.error('Błąd testu połączenia'),
  });

  // Create backup config
  const createMut = useMutation({
    mutationFn: () => backupApi.create({
      name: backupName || `Backup ${selectedDb.type} — ${selectedAgent.hostname}`,
      type: selectedDb.type.startsWith('SQL') ? selectedDb.type : `SQL_${selectedDb.type.toUpperCase()}` as any,
      enabled: true,
      sqlHost: selectedDb.host,
      sqlPort: selectedDb.port,
      sqlUser: credentials.user,
      sqlPassEnc: credentials.password,
      sqlDatabases: selectedDbs.join(', '),
      cronSchedule: schedule,
      retentionDays: 30,
      agentRegId: selectedAgent.id,
    }),
    onSuccess: () => {
      setStep('done');
      qc.invalidateQueries({ queryKey: ['backup-configs'] });
    },
    onError: () => toast.error('Błąd tworzenia konfiguracji'),
  });

  const reset = () => {
    setStep('select-agent');
    setSelectedAgent(null);
    setScanResult(null);
    setSelectedDb(null);
    setCredentials({ user: '', password: '', database: '' });
    setTestResult(null);
    setDbList([]);
    setSelectedDbs([]);
    setBackupName('');
    onClose();
  };

  return (
    <Modal open={open} onClose={reset} title="Wizard kopii zapasowej" size="lg" noPadding>
      <div style={{ minHeight: 400 }}>

        {/* Security badge */}
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', background: 'rgba(34,197,94,0.04)' }}>
          <Shield size={14} color="#22C55E" />
          <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>Szyfrowane połączenie</span>
          <span style={{ fontSize: 11, color: 'var(--td)' }}>— dane logowania nie są przechowywane w przeglądarce</span>
        </div>

        <div style={{ padding: 24 }}>

          {/* ── Step 1: Select Agent ── */}
          {step === 'select-agent' && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Wybierz asystenta</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>Wskaż maszynę, na której chcesz skonfigurować backup</p>

              {onlineAgents.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <WifiOff size={32} color="var(--td)" style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: 'var(--tm)' }}>Brak asystentów online</p>
                  <p style={{ fontSize: 11, color: 'var(--td)' }}>Upewnij się, że Asystent Business jest uruchomiony na maszynie klienta</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {onlineAgents.map((agent: any) => (
                    <button
                      key={agent.id}
                      onClick={() => { setSelectedAgent(agent); scanMut.mutate(agent.id); }}
                      disabled={scanMut.isPending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                        borderRadius: 12, border: '1px solid var(--border)', background: 'transparent',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Server size={16} color="#22C55E" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{agent.hostname}</div>
                        <div style={{ fontSize: 11, color: 'var(--td)' }}>{agent.ipAddress ?? 'Online'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />
                        <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600 }}>Online</span>
                      </div>
                      {scanMut.isPending && selectedAgent?.id === agent.id && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />}
                      {!scanMut.isPending && <ChevronRight size={16} color="var(--td)" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Scan Results ── */}
          {step === 'scan' && scanResult && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Wykryte bazy danych</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>na maszynie <strong>{scanResult.hostname}</strong></p>

              {scanResult.databases.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <AlertTriangle size={32} color="#F59E0B" style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: 'var(--tm)' }}>Nie wykryto żadnych baz danych</p>
                  <p style={{ fontSize: 11, color: 'var(--td)' }}>Upewnij się, że serwer baz danych jest uruchomiony</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {scanResult.databases.map((db, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedDb(db); setStep('credentials'); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                        borderRadius: 12, border: '1px solid var(--border)', background: 'transparent',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Database size={16} color="#A78BFA" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{db.type}</div>
                        <div style={{ fontSize: 11, color: 'var(--td)' }}>{db.host}:{db.port}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.1)', color: '#22C55E' }}>Aktywna</span>
                      <ChevronRight size={16} color="var(--td)" />
                    </button>
                  ))}
                </div>
              )}

              {scanResult.services.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', marginBottom: 8 }}>Usługi baz danych</p>
                  {scanResult.services.map((svc, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--tm)', padding: '4px 0' }}>
                      {svc.running ? '🟢' : '🔴'} {svc.name}
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setStep('select-agent')} style={{ marginTop: 16, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                ← Zmień asystenta
              </button>
            </div>
          )}

          {/* ── Step 3: Credentials + Test ── */}
          {step === 'credentials' && selectedDb && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Połączenie z {selectedDb.type}</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>{selectedDb.host}:{selectedDb.port}</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Użytkownik</label>
                  <input className="input" value={credentials.user} onChange={e => setCredentials(c => ({ ...c, user: e.target.value }))} placeholder="root" />
                </div>
                <div>
                  <label style={labelStyle}>Hasło</label>
                  <input className="input" type="password" value={credentials.password} onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))} placeholder="********" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <Button onClick={() => testMut.mutate()} loading={testMut.isPending} disabled={!credentials.user}>
                  Test połączenia
                </Button>
              </div>

              {/* Test result */}
              {testResult && (
                <div style={{
                  padding: '14px 18px', borderRadius: 12, marginBottom: 16,
                  background: testResult.success ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${testResult.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: testResult.success ? 8 : 0 }}>
                    {testResult.success ? <CheckCircle size={16} color="#22C55E" /> : <XCircle size={16} color="#EF4444" />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: testResult.success ? '#22C55E' : '#EF4444' }}>
                      {testResult.success ? 'Połączenie udane!' : 'Błąd połączenia'}
                    </span>
                  </div>
                  {testResult.error && <p style={{ fontSize: 12, color: '#F87171', margin: 0 }}>{testResult.error}</p>}
                  {testResult.success && dbList.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--tm)', marginBottom: 6 }}>Znalezione bazy ({dbList.length}):</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {dbList.map(db => {
                          const selected = selectedDbs.includes(db);
                          return (
                            <button key={db} onClick={() => setSelectedDbs(prev => selected ? prev.filter(d => d !== db) : [...prev, db])}
                              style={{
                                fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: 'none',
                                background: selected ? 'rgba(139,92,246,0.15)' : 'var(--hover-bg)',
                                color: selected ? '#A78BFA' : 'var(--tm)', fontWeight: selected ? 600 : 400,
                              }}>
                              {selected ? '☑' : '☐'} {db}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {testResult?.success && (
                <Button onClick={() => setStep('configure')}>
                  Dalej — konfiguracja <ChevronRight size={14} />
                </Button>
              )}

              <button onClick={() => { setStep('scan'); setTestResult(null); }} style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'block' }}>
                ← Wróć do wyboru bazy
              </button>
            </div>
          )}

          {/* ── Step 4: Configure ── */}
          {step === 'configure' && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Konfiguracja backupu</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>
                {selectedDb.type} — {selectedDbs.length} baz — {selectedAgent.hostname}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Nazwa backupu</label>
                  <input className="input" value={backupName} onChange={e => setBackupName(e.target.value)}
                    placeholder={`Backup ${selectedDb.type} — ${selectedAgent.hostname}`} />
                </div>
                <div>
                  <label style={labelStyle}>Harmonogram</label>
                  <select className="input" value={schedule} onChange={e => setSchedule(e.target.value)}>
                    {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ padding: 14, borderRadius: 10, background: 'var(--hover-bg)', fontSize: 12, color: 'var(--tm)' }}>
                  <strong style={{ color: 'var(--t)' }}>Podsumowanie:</strong><br />
                  Asystent: {selectedAgent.hostname}<br />
                  Baza: {selectedDb.type} ({selectedDb.host}:{selectedDb.port})<br />
                  Bazy danych: {selectedDbs.join(', ')}<br />
                  Użytkownik: {credentials.user}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setStep('credentials')}>Wstecz</Button>
                <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>
                  Utwórz konfigurację backupu
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <CheckCircle size={48} color="#22C55E" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', margin: '0 0 8px' }}>Backup skonfigurowany!</h3>
              <p style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 24 }}>
                Asystent automatycznie zacznie robić kopie wg harmonogramu
              </p>
              <Button onClick={reset}>Zamknij</Button>
            </div>
          )}

        </div>
      </div>
    </Modal>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tm)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
};
