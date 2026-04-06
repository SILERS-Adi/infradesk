import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database, Server, CheckCircle, XCircle, Loader2, Shield, ChevronRight, ChevronLeft,
  WifiOff, AlertTriangle, FolderOpen, Clock, HardDrive, Cloud, Lock, Mail,
  Calendar, Copy, Check, Play, Trash2, Settings,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../api/client';
import { agentsApi } from '../../../api/agents';
import { backupApi } from '../../../api/backup';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';

/* ── Types ────────────────────────────────────────────────────────── */

interface DetectedDb {
  type: string;
  port: number | null;
  host: string;
  status: string;
  instance?: string;
  note?: string;
}

interface ScanResult {
  databases: DetectedDb[];
  services: { name: string; display_name?: string; running: boolean }[];
  hostname: string;
}

interface TestResult {
  success: boolean;
  databases?: string[];
  error?: string;
  type?: string;
}

type SourceType = 'sql' | 'folder';
type Step = 'source' | 'scan' | 'credentials' | 'databases' | 'destinations' | 'schedule' | 'notifications' | 'options' | 'summary' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'source', label: 'Źródło' },
  { key: 'scan', label: 'Wykrywanie' },
  { key: 'credentials', label: 'Połączenie' },
  { key: 'databases', label: 'Bazy danych' },
  { key: 'destinations', label: 'Cel zapisu' },
  { key: 'schedule', label: 'Harmonogram' },
  { key: 'notifications', label: 'Powiadomienia' },
  { key: 'options', label: 'Opcje' },
  { key: 'summary', label: 'Podsumowanie' },
];

/* ── DB type config ───────────────────────────────────────────────── */

const DB_COLORS: Record<string, string> = {
  MSSQL: '#CC2927', MySQL: '#00758F', PostgreSQL: '#336791', MongoDB: '#4DB33D', FOLDER: '#3B82F6',
};
const DB_LABELS: Record<string, string> = {
  MSSQL: 'Microsoft SQL Server', MySQL: 'MySQL', PostgreSQL: 'PostgreSQL', MongoDB: 'MongoDB',
};

/* ── Schedule presets ─────────────────────────────────────────────── */

const SCHEDULE_PRESETS = [
  { value: '0 * * * *', label: 'Co godzinę', desc: 'Pełna ochrona, duże obciążenie' },
  { value: '0 */6 * * *', label: 'Co 6 godzin', desc: 'Dobry balans ochrony i wydajności' },
  { value: '0 */12 * * *', label: 'Co 12 godzin', desc: 'Backup rano i wieczorem' },
  { value: '0 2 * * *', label: 'Codziennie', desc: 'Standardowy backup nocny' },
  { value: '0 2 * * 1-5', label: 'Dni robocze', desc: 'Pon-Pt o 02:00' },
  { value: '0 0 * * 0', label: 'Co tydzień', desc: 'Niedzielna kopia tygodniowa' },
];

/* ── Styles ───────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
  background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tm)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
};

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        className="relative w-10 h-[22px] rounded-full transition-colors cursor-pointer"
        style={{ background: value ? 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' : 'var(--border)' }}
        onClick={() => onChange(!value)}
      >
        <div className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform" style={{ left: value ? 22 : 3 }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--t)' }}>{label}</span>
    </label>
  );
}

/* ── Progress Bar ─────────────────────────────────────────────────── */

function StepProgress({ current, steps }: { current: Step; steps: typeof STEPS }) {
  const idx = steps.findIndex(s => s.key === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: done ? '#22C55E' : active ? 'var(--accent)' : 'var(--hover-bg)',
                color: done || active ? '#fff' : 'var(--td)',
                border: active ? 'none' : done ? 'none' : '1px solid var(--border)',
              }}>
                {done ? <Check style={{ width: 12, height: 12 }} /> : i + 1}
              </div>
              <span style={{
                fontSize: 11, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                color: active ? 'var(--t)' : done ? '#22C55E' : 'var(--td)',
              }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, margin: '0 10px', background: done ? '#22C55E' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Option Card ──────────────────────────────────────────────────── */

function OptionCard({ icon, title, desc, onClick, color, selected, disabled }: {
  icon: React.ReactNode; title: string; desc: string; onClick: () => void;
  color?: string; selected?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
        borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%',
        border: selected ? `2px solid ${color || 'var(--accent)'}` : '1px solid var(--border)',
        background: selected ? `${color || 'var(--accent)'}08` : 'transparent',
        opacity: disabled ? 0.4 : 1, transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!disabled && !selected) { e.currentTarget.style.borderColor = color || 'var(--accent)'; e.currentTarget.style.background = 'var(--hover-bg)'; } }}
      onMouseLeave={e => { if (!disabled && !selected) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; } }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color || 'var(--accent)'}15`, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--td)', marginTop: 2 }}>{desc}</div>
      </div>
      <ChevronRight size={16} color="var(--td)" />
    </button>
  );
}

/* ── Summary Row ──────────────────────────────────────────────────── */

function SumRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--td)', flexShrink: 0 }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', width: 120, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--t)', flex: 1 }}>{value}</div>
    </div>
  );
}

/* ── Main Wizard ──────────────────────────────────────────────────── */

export default function BackupWizard({ open, onClose, companyFilter }: { open: boolean; onClose: () => void; companyFilter?: string }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('source');
  const [sourceType, setSourceType] = useState<SourceType>('sql');

  // Agent
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedDb, setSelectedDb] = useState<DetectedDb | null>(null);

  // Credentials
  const [authMode, setAuthMode] = useState<'sql' | 'windows'>('sql');
  const [creds, setCreds] = useState({ user: '', password: '' });
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [dbList, setDbList] = useState<string[]>([]);
  const [selectedDbs, setSelectedDbs] = useState<string[]>([]);

  // Folder
  const [folderPath, setFolderPath] = useState('');

  // Schedule
  const [schedule, setSchedule] = useState('0 2 * * *');
  const [runNow, setRunNow] = useState(false);

  // Destination
  const [backupName, setBackupName] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);
  const [encrypt, setEncrypt] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [useInfradeskCloud, setUseInfradeskCloud] = useState(false);
  const [useGdrive, setUseGdrive] = useState(false);
  const [gdriveFolder, setGdriveFolder] = useState('');
  const [useFtp, setUseFtp] = useState(false);
  const [ftpHost, setFtpHost] = useState('');
  const [ftpPort, setFtpPort] = useState('');
  const [ftpUser, setFtpUser] = useState('');
  const [ftpPass, setFtpPass] = useState('');
  const [ftpPath, setFtpPath] = useState('');
  const [gdriveEmail, setGdriveEmail] = useState('');
  const [gdriveRefreshToken, setGdriveRefreshToken] = useState('');
  const [notifyEmailSuccess, setNotifyEmailSuccess] = useState('');
  const [notifyEmailFailure, setNotifyEmailFailure] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);

  // Fetch agents
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAll(),
    enabled: open,
  });

  const activeAgents = agents.filter((a: any) =>
    a.status === 'ACTIVE' && (!companyFilter || a.workspaceId === companyFilter)
  );
  const isOnline = (a: any) => {
    const ls = a.lastSeen ? Date.now() - new Date(a.lastSeen).getTime() : Infinity;
    return ls < 5 * 60 * 1000;
  };

  // Scan
  const scanMut = useMutation({
    mutationFn: (agentId: string) =>
      apiClient.post(`/agent/${agentId}/command`, { command: 'scan_databases' }).then(r => r.data.data),
    onSuccess: (data) => { setScanResult(data); setStep('scan'); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Błąd skanowania — agent nie odpowiada'),
  });

  // Test connection
  const testMut = useMutation({
    mutationFn: () =>
      apiClient.post(`/agent/${selectedAgent.id}/command`, {
        command: 'test_db_connection',
        payload: {
          type: selectedDb!.type,
          host: selectedDb!.host,
          port: selectedDb!.port,
          instance: selectedDb!.instance || undefined,
          user: authMode === 'windows' ? undefined : creds.user,
          password: authMode === 'windows' ? undefined : creds.password,
          authMode: selectedDb!.type === 'MSSQL' ? authMode : undefined,
        },
      }).then(r => r.data.data),
    onSuccess: (data: TestResult) => {
      setTestResult(data);
      if (data.success && data.databases) {
        setDbList(data.databases);
        setSelectedDbs(data.databases);
      }
    },
    onError: () => toast.error('Agent nie odpowiedział na test połączenia'),
  });

  // Create config
  const createMut = useMutation({
    mutationFn: () => {
      const isFolder = sourceType === 'folder';
      const dbType = isFolder ? 'FOLDER' : (selectedDb!.type.startsWith('SQL_') ? selectedDb!.type : `SQL_${selectedDb!.type.toUpperCase()}`);
      return backupApi.create({
        name: backupName || `Backup ${isFolder ? 'Folder' : selectedDb!.type} — ${selectedAgent.hostname}`,
        type: dbType as any,
        enabled: true,
        sqlHost: isFolder ? undefined : selectedDb!.host,
        sqlPort: isFolder ? undefined : (selectedDb!.port ?? undefined),
        sqlUser: isFolder ? undefined : (authMode === 'windows' ? undefined : creds.user),
        sqlPassEnc: isFolder ? undefined : (authMode === 'windows' ? undefined : creds.password),
        sqlDatabases: isFolder ? undefined : selectedDbs.join(', '),
        folderPath: isFolder ? folderPath : undefined,
        useInfradeskCloud: useInfradeskCloud || undefined,
        localBackupPath: localPath || undefined,
        googleDriveFolder: useGdrive ? gdriveFolder : undefined,
        googleDriveRefreshToken: useGdrive ? gdriveRefreshToken : undefined,
        googleDriveEmail: useGdrive ? gdriveEmail : undefined,
        ftpHost: useFtp ? ftpHost : undefined,
        ftpPort: useFtp && ftpPort ? Number(ftpPort) : undefined,
        ftpUser: useFtp ? ftpUser : undefined,
        ftpPassEnc: useFtp ? ftpPass : undefined,
        ftpPath: useFtp ? ftpPath : undefined,
        notifyEmail: [notifyEmailSuccess, notifyEmailFailure].filter(Boolean).join(', ') || undefined,
        cronSchedule: schedule,
        retentionDays,
        encryptBackups: encrypt,
        agentRegId: selectedAgent.id,
      });
    },
    onSuccess: async (data) => {
      qc.invalidateQueries({ queryKey: ['backup-configs'] });
      if (runNow && data?.id) {
        try { await backupApi.runNow(data.id); } catch {}
      }
      setStep('done');
    },
    onError: () => toast.error('Błąd tworzenia konfiguracji'),
  });

  // Generate encryption key
  const genKey = () => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const key = btoa(String.fromCharCode(...arr));
    setEncryptionKey(key);
    return key;
  };

  const copyKey = () => {
    navigator.clipboard.writeText(encryptionKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const scheduleLabel = SCHEDULE_PRESETS.find(s => s.value === schedule)?.label || schedule;

  const reset = () => {
    setStep('source');
    setSourceType('sql');
    setAuthMode('sql');
    setSelectedAgent(null);
    setScanResult(null);
    setSelectedDb(null);
    setCreds({ user: '', password: '' });
    setTestResult(null);
    setDbList([]);
    setSelectedDbs([]);
    setFolderPath('');
    setSchedule('0 2 * * *');
    setRunNow(false);
    setBackupName('');
    setRetentionDays(30);
    setEncrypt(true);
    setEncryptionKey('');
    setLocalPath('');
    setUseInfradeskCloud(false);
    setUseGdrive(false);
    setGdriveFolder('');
    setUseFtp(false);
    setFtpHost(''); setFtpPort(''); setFtpUser(''); setFtpPass(''); setFtpPath('');
    setNotifyEmailSuccess('');
    setNotifyEmailFailure('');
    onClose();
  };

  const stepsForType = sourceType === 'folder'
    ? STEPS.filter(s => s.key !== 'credentials' && s.key !== 'databases')
    : STEPS;

  // Google Drive auth — popup flow z postMessage callback
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'gdrive_auth') {
        try {
          const { email, refreshToken } = JSON.parse(e.data.payload);
          setGdriveEmail(email);
          setGdriveRefreshToken(refreshToken);
          setUseGdrive(true);
          toast.success(`Połączono z Google Drive jako ${email}`);
        } catch {}
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGdriveAuth = async () => {
    try {
      const { url } = await backupApi.getGoogleAuthUrl();
      window.open(url, 'gdrive_auth', 'width=500,height=700');
    } catch (err: any) {
      if (err?.response?.status === 400 || err?.response?.data?.error?.includes?.('Google')) {
        window.open('/superadmin/pricing', '_blank');
        toast.error('Google Drive API nie skonfigurowane — otwieram ustawienia');
      } else {
        toast.error(err?.response?.data?.error || 'Błąd połączenia z Google Drive');
      }
    }
  };

  return (
    <Modal open={open} onClose={reset} title="Kreator kopii zapasowej" size="xl" noPadding>
      <div style={{ minHeight: 460 }}>

        {/* Step progress */}
        {step !== 'done' && <StepProgress current={step} steps={stepsForType} />}

        {/* Security badge */}
        <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', background: 'rgba(34,197,94,0.03)' }}>
          <Shield size={13} color="#22C55E" />
          <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600 }}>Szyfrowane połączenie</span>
          <span style={{ fontSize: 10, color: 'var(--td)' }}>— dane logowania szyfrowane AES-256, nie przechowywane w przeglądarce</span>
        </div>

        <div style={{ padding: 24 }}>

          {/* ═══ Step 1: Source ═══════════════════════════════════════ */}
          {step === 'source' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Co chcesz zabezpieczyć?</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>Wybierz typ danych do kopii zapasowej</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <OptionCard
                  icon={<Database size={18} color="#8B5CF6" />}
                  title="Baza danych SQL"
                  desc="MySQL, PostgreSQL, Microsoft SQL Server — automatyczne wykrywanie"
                  color="#8B5CF6"
                  selected={sourceType === 'sql'}
                  onClick={() => setSourceType('sql')}
                />
                <OptionCard
                  icon={<FolderOpen size={18} color="#3B82F6" />}
                  title="Folder / Pliki"
                  desc="Kopia zapasowa dowolnego katalogu z kompresją ZIP"
                  color="#3B82F6"
                  selected={sourceType === 'folder'}
                  onClick={() => setSourceType('folder')}
                />
              </div>

              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 10 }}>Wybierz maszynę</h4>

              {activeAgents.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', borderRadius: 14, border: '1px solid var(--border)' }}>
                  <WifiOff size={32} color="var(--td)" style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: 'var(--tm)' }}>Brak zarejestrowanych asystentów</p>
                  <p style={{ fontSize: 11, color: 'var(--td)' }}>Zainstaluj Asystent Business na maszynie klienta</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeAgents.map((agent: any) => {
                    const online = isOnline(agent);
                    return (
                      <button
                        key={agent.id}
                        onClick={() => {
                          setSelectedAgent(agent);
                          if (sourceType === 'sql') {
                            scanMut.mutate(agent.id);
                          } else {
                            setStep('scan');
                          }
                        }}
                        disabled={scanMut.isPending}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                          borderRadius: 12, border: '1px solid var(--border)', background: 'transparent',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                          opacity: online ? 1 : 0.7,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--hover-bg)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Server size={16} color={online ? '#22C55E' : '#F59E0B'} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{agent.hostname}</div>
                          <div style={{ fontSize: 10, color: 'var(--td)' }}>
                            {agent.ipAddress} · v{agent.appVersion || '?'}
                            {!online && ' · Ostatnio widziany: ' + (agent.lastSeen ? new Date(agent.lastSeen).toLocaleString('pl') : 'nigdy')}
                          </div>
                        </div>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#22C55E' : '#F59E0B' }} />
                        {scanMut.isPending && selectedAgent?.id === agent.id
                          ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                          : <ChevronRight size={14} color="var(--td)" />
                        }
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ Step 2: Scan Results / Folder ════════════════════════ */}
          {step === 'scan' && sourceType === 'sql' && scanResult && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Wykryte bazy danych</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>
                Maszyna: <strong>{scanResult.hostname}</strong> ({selectedAgent?.ipAddress})
              </p>

              {scanResult.databases.length === 0 && scanResult.services.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', borderRadius: 14, border: '1px solid var(--border)' }}>
                  <AlertTriangle size={32} color="#F59E0B" style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: 'var(--tm)', fontWeight: 600 }}>Nie wykryto żadnych baz danych</p>
                  <p style={{ fontSize: 11, color: 'var(--td)', marginTop: 4 }}>Sprawdź czy serwer baz danych jest uruchomiony i nasłuchuje na standardowym porcie</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {scanResult.databases.map((db, i) => {
                    const color = DB_COLORS[db.type] || '#8B5CF6';
                    const label = DB_LABELS[db.type] || db.type;
                    return (
                      <button
                        key={i}
                        onClick={() => { setSelectedDb(db); setStep('credentials'); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                          borderRadius: 14, border: '1px solid var(--border)', background: 'transparent',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}08`; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{
                          width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${color}12`,
                        }}>
                          <Database size={18} color={color} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>
                            {label}
                            {db.instance && <span style={{ fontSize: 12, color, marginLeft: 6 }}>\{db.instance}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--td)', marginTop: 2 }}>
                            {db.host}{db.port ? `:${db.port}` : ''}
                            {db.note === 'named_pipes_only' && ' · Named Pipes'}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                          background: `${color}12`, color,
                        }}>
                          Aktywna
                        </span>
                        <ChevronRight size={16} color="var(--td)" />
                      </button>
                    );
                  })}
                </div>
              )}

              {scanResult.services.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Usługi baz danych
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {scanResult.services.map((svc, i) => (
                      <span key={i} style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        background: svc.running ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        color: svc.running ? '#22C55E' : '#EF4444',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                        {svc.display_name || svc.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setStep('source')} style={{ marginTop: 20, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronLeft size={14} /> Zmień źródło
              </button>
            </div>
          )}

          {step === 'scan' && sourceType === 'folder' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Ścieżka folderu</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>
                Maszyna: <strong>{selectedAgent?.hostname}</strong> — podaj ścieżkę do folderu
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Ścieżka na maszynie klienta</label>
                <input style={inputStyle} value={folderPath} onChange={e => setFolderPath(e.target.value)}
                  placeholder="np. C:\Dane\Firma lub D:\Subiekt\Backup" autoFocus />
                <p style={{ fontSize: 10, color: 'var(--td)', marginTop: 4 }}>
                  Agent utworzy skompresowaną kopię ZIP tego katalogu wg harmonogramu
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setStep('source')} icon={<ChevronLeft size={14} />}>Wstecz</Button>
                <Button onClick={() => setStep('destinations')} disabled={!folderPath.trim()} icon={<ChevronRight size={14} />}>
                  Dalej — cel zapisu
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Step 3: Credentials + Test ═══════════════════════════ */}
          {step === 'credentials' && selectedDb && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>
                Połączenie z {DB_LABELS[selectedDb.type] || selectedDb.type}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>
                {selectedDb.host}{selectedDb.port ? `:${selectedDb.port}` : ''}
                {selectedDb.instance && ` \\ ${selectedDb.instance}`}
              </p>

              {/* Auth mode selector — only for MSSQL */}
              {selectedDb.type === 'MSSQL' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Tryb autentykacji</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([['sql', 'SQL Server', 'Logowanie kontem SQL (sa)'], ['windows', 'Windows', 'Uwierzytelnianie kontem Windows (Trusted)']] as const).map(([mode, title, desc]) => (
                      <button key={mode} onClick={() => {
                        setAuthMode(mode);
                        if (mode === 'windows') setCreds({ user: '', password: '' });
                      }}
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                          border: authMode === mode ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: authMode === mode ? 'rgba(99,102,241,0.06)' : 'transparent',
                          transition: 'all 0.1s',
                        }}
                        onMouseEnter={e => { if (authMode !== mode) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                        onMouseLeave={e => { if (authMode !== mode) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: authMode === mode ? 'var(--accent)' : 'var(--t)' }}>{title}</div>
                        <div style={{ fontSize: 10, color: 'var(--td)', marginTop: 2 }}>{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Credentials fields — hidden for Windows auth */}
              {(selectedDb.type !== 'MSSQL' || authMode === 'sql') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Użytkownik</label>
                    <input style={inputStyle} value={creds.user} onChange={e => setCreds(c => ({ ...c, user: e.target.value }))}
                      placeholder={selectedDb.type === 'MSSQL' ? 'sa' : selectedDb.type === 'PostgreSQL' ? 'postgres' : 'root'} autoFocus />
                  </div>
                  <div>
                    <label style={labelStyle}>Hasło</label>
                    <input style={inputStyle} type="password" value={creds.password}
                      onChange={e => setCreds(c => ({ ...c, password: e.target.value }))} placeholder="••••••••" />
                  </div>
                </div>
              )}

              {authMode === 'windows' && selectedDb.type === 'MSSQL' && (
                <div style={{
                  padding: '12px 16px', borderRadius: 12, marginBottom: 16,
                  background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)',
                }}>
                  <p style={{ fontSize: 12, color: '#60A5FA', margin: 0 }}>
                    Asystent użyje konta Windows, na którym działa — upewnij się, że ma uprawnienia do bazy danych
                  </p>
                </div>
              )}

              <Button onClick={() => testMut.mutate()} loading={testMut.isPending}
                disabled={authMode === 'sql' && !creds.user}
                icon={<Database size={14} />} style={{ marginBottom: 16 }}>
                Testuj połączenie
              </Button>

              {/* Test result */}
              {testResult && (
                <div style={{
                  padding: '14px 18px', borderRadius: 14, marginBottom: 16,
                  background: testResult.success ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                  border: `1px solid ${testResult.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {testResult.success ? <CheckCircle size={16} color="#22C55E" /> : <XCircle size={16} color="#EF4444" />}
                    <span style={{ fontSize: 13, fontWeight: 700, color: testResult.success ? '#22C55E' : '#EF4444' }}>
                      {testResult.success ? `Połączenie udane — wykryto ${dbList.length} baz danych` : 'Błąd połączenia'}
                    </span>
                  </div>
                  {testResult.error && <p style={{ fontSize: 12, color: '#F87171', margin: '4px 0 0' }}>{testResult.error}</p>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => { setStep('scan'); setTestResult(null); }} icon={<ChevronLeft size={14} />}>
                  Wstecz
                </Button>
                {testResult?.success && dbList.length > 0 && (
                  <Button onClick={() => setStep('databases')} icon={<ChevronRight size={14} />}>
                    Dalej — wybór baz danych
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ═══ Step 4: Databases — wybór baz danych ════════════════ */}
          {step === 'databases' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Wybierz bazy danych</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 16px' }}>
                Zaznacz które bazy danych mają być backupowane ({selectedDbs.length} z {dbList.length} wybranych)
              </p>

              {/* Quick select buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => setSelectedDbs([...dbList])}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)',
                    transition: 'all 0.1s',
                  }}>
                  Zaznacz wszystkie
                </button>
                <button onClick={() => {
                  const system = ['master', 'tempdb', 'model', 'msdb', 'information_schema', 'performance_schema', 'mysql', 'sys', 'postgres', 'template0', 'template1'];
                  setSelectedDbs(dbList.filter(db => !system.includes(db.toLowerCase())));
                }}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)',
                    transition: 'all 0.1s',
                  }}>
                  Tylko użytkownika (bez systemowych)
                </button>
                <button onClick={() => setSelectedDbs([])}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--td)',
                    transition: 'all 0.1s',
                  }}>
                  Odznacz wszystkie
                </button>
              </div>

              {/* Database list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20, maxHeight: 280, overflowY: 'auto' }}>
                {dbList.map(db => {
                  const sel = selectedDbs.includes(db);
                  const system = ['master', 'tempdb', 'model', 'msdb', 'information_schema', 'performance_schema', 'mysql', 'sys', 'postgres', 'template0', 'template1'];
                  const isSystem = system.includes(db.toLowerCase());
                  return (
                    <button key={db} onClick={() => setSelectedDbs(prev => sel ? prev.filter(d => d !== db) : [...prev, db])}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        border: sel ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)',
                        background: sel ? 'rgba(139,92,246,0.06)' : 'transparent',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: sel ? '2px solid #8B5CF6' : '2px solid var(--border)',
                        background: sel ? '#8B5CF6' : 'transparent',
                        transition: 'all 0.1s', flexShrink: 0,
                      }}>
                        {sel && <Check size={12} color="#fff" />}
                      </div>
                      <Database size={14} color={sel ? '#8B5CF6' : 'var(--td)'} />
                      <span style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? 'var(--t)' : 'var(--tm)' }}>{db}</span>
                      {isSystem && (
                        <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#F59E0B', marginLeft: 'auto' }}>
                          SYSTEMOWA
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setStep('credentials')} icon={<ChevronLeft size={14} />}>Wstecz</Button>
                <Button onClick={() => setStep('destinations')} disabled={selectedDbs.length === 0} icon={<ChevronRight size={14} />}>
                  Dalej — cel zapisu
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Step 5: Schedule ═════════════════════════════════════ */}
          {step === 'schedule' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Harmonogram backupu</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>Jak często agent ma tworzyć kopię zapasową?</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {SCHEDULE_PRESETS.map(s => (
                  <button key={s.value} onClick={() => setSchedule(s.value)}
                    style={{
                      padding: '12px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                      border: schedule === s.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: schedule === s.value ? 'rgba(99,102,241,0.06)' : 'transparent',
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { if (schedule !== s.value) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { if (schedule !== s.value) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: schedule === s.value ? 'var(--accent)' : 'var(--t)' }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--td)', marginTop: 2 }}>{s.desc}</div>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <Button variant="secondary" onClick={() => setStep('destinations')} icon={<ChevronLeft size={14} />}>
                  Wstecz
                </Button>
                <Button onClick={() => setStep('notifications')} icon={<ChevronRight size={14} />}>
                  Dalej — powiadomienia
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Step 5: Destinations — Cel zapisu ═════════════════════ */}
          {step === 'destinations' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Gdzie zapisywać kopie?</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>Wybierz jedno lub więcej miejsc docelowych. Można łączyć np. folder lokalny + Google Drive.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* ── 0. InfraDesk Cloud ── */}
                <div style={{
                  padding: 16, borderRadius: 14,
                  border: useInfradeskCloud ? '2px solid #6366F1' : '1px solid var(--border)',
                  background: useInfradeskCloud ? 'linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(139,92,246,0.04) 100%)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.15) 100%)',
                    }}>
                      <Shield size={16} color="#6366F1" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
                        InfraDesk Cloud
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 8, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', verticalAlign: 'middle' }}>
                          ZALECANE
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--td)' }}>Bezpieczne przechowywanie na serwerach InfraDesk — bez konfiguracji</div>
                    </div>
                    <Toggle value={useInfradeskCloud} onChange={setUseInfradeskCloud} label="" />
                  </div>
                  {useInfradeskCloud && (
                    <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)' }}>
                      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--tm)' }}>
                        <span>Szyfrowanie AES-256</span>
                        <span>Automatyczna retencja</span>
                        <span>Przywracanie 1-klik</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 1. Local / Network ── */}
                <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: localPath ? 10 : 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <HardDrive size={16} color="#3B82F6" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Folder lokalny lub sieciowy</div>
                      <div style={{ fontSize: 10, color: 'var(--td)' }}>Dysk lokalny, sieciowy (UNC), zamapowany dysk</div>
                    </div>
                  </div>
                  <input style={inputStyle} value={localPath} onChange={e => setLocalPath(e.target.value)}
                    placeholder="C:\Backups\InfraDesk  lub  \\serwer\backup$\firma" />
                  <p style={{ fontSize: 10, color: 'var(--td)', marginTop: 4 }}>Pozostaw puste aby użyć domyślnego folderu agenta</p>
                </div>

                {/* ── 2. Google Drive ── */}
                <div style={{ padding: 16, borderRadius: 14, border: useGdrive ? '2px solid #22C55E' : '1px solid var(--border)', background: useGdrive ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Cloud size={16} color="#22C55E" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Google Drive</div>
                      <div style={{ fontSize: 10, color: 'var(--td)' }}>Automatyczny upload kopii do chmury Google</div>
                    </div>
                    <Toggle value={useGdrive} onChange={setUseGdrive} label="" />
                  </div>

                  {useGdrive && !gdriveEmail && (
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--tm)', marginBottom: 10 }}>
                        Kliknij przycisk — otworzy sie okno logowania Google. Po zalogowaniu autoryzacja wykona sie automatycznie.
                      </p>
                      <Button size="sm" onClick={handleGdriveAuth} icon={<Cloud size={12} />}>
                        Zaloguj sie do Google Drive
                      </Button>
                    </div>
                  )}

                  {useGdrive && gdriveEmail && (
                    <div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
                        background: 'rgba(34,197,94,0.08)', marginBottom: 10,
                      }}>
                        <CheckCircle size={16} color="#22C55E" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#22C55E' }}>Połączono jako {gdriveEmail}</span>
                        <button onClick={() => { setGdriveEmail(''); setGdriveRefreshToken(''); }}
                          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--td)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Rozłącz
                        </button>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', marginBottom: 4, display: 'block' }}>
                          Folder docelowy na Google Drive (ID)
                        </label>
                        <input style={inputStyle} value={gdriveFolder} onChange={e => setGdriveFolder(e.target.value)}
                          placeholder="ID folderu (z URL po /folders/) — zostaw puste dla głównego" />
                        <p style={{ fontSize: 10, color: 'var(--td)', marginTop: 4 }}>
                          Otwórz folder na Google Drive → ID to tekst po <code>/folders/</code> w URL.{' '}
                          <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 600 }}>
                            Otwórz Google Drive ↗
                          </a>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 3. FTP / SFTP ── */}
                <div style={{ padding: 16, borderRadius: 14, border: useFtp ? '2px solid #8B5CF6' : '1px solid var(--border)', background: useFtp ? 'rgba(139,92,246,0.03)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: useFtp ? 10 : 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Server size={16} color="#8B5CF6" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>FTP / SFTP</div>
                      <div style={{ fontSize: 10, color: 'var(--td)' }}>Upload na zdalny serwer FTP lub SFTP</div>
                    </div>
                    <Toggle value={useFtp} onChange={setUseFtp} label="" />
                  </div>

                  {useFtp && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', marginBottom: 4, display: 'block' }}>Host</label>
                        <input style={inputStyle} value={ftpHost} onChange={e => setFtpHost(e.target.value)} placeholder="ftp.firma.pl" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', marginBottom: 4, display: 'block' }}>Port</label>
                        <input style={inputStyle} type="number" value={ftpPort} onChange={e => setFtpPort(e.target.value)} placeholder="21 (FTP) / 22 (SFTP)" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', marginBottom: 4, display: 'block' }}>Użytkownik</label>
                        <input style={inputStyle} value={ftpUser} onChange={e => setFtpUser(e.target.value)} placeholder="backup_user" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', marginBottom: 4, display: 'block' }}>Hasło</label>
                        <input style={inputStyle} type="password" value={ftpPass} onChange={e => setFtpPass(e.target.value)} placeholder="••••••••" />
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', marginBottom: 4, display: 'block' }}>Ścieżka zdalna</label>
                        <input style={inputStyle} value={ftpPath} onChange={e => setFtpPath(e.target.value)} placeholder="/backups/firma/" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setStep(sourceType === 'folder' ? 'scan' : 'databases')} icon={<ChevronLeft size={14} />}>Wstecz</Button>
                <Button onClick={() => setStep('schedule')} icon={<ChevronRight size={14} />}>Dalej — harmonogram</Button>
              </div>
            </div>
          )}

          {/* ═══ Step 7: Notifications ═════════════════════════════════ */}
          {step === 'notifications' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Powiadomienia email</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>Kto ma otrzymać powiadomienie o statusie backupu? (opcjonalnie)</p>

              {/* Failure email — highlighted, most important */}
              <div style={{ padding: 16, borderRadius: 14, border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <XCircle size={16} color="#EF4444" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Przy błędzie backupu</div>
                    <div style={{ fontSize: 10, color: '#EF4444' }}>Zalecane — natychmiastowa informacja o problemach</div>
                  </div>
                </div>
                <input style={inputStyle} type="email" value={notifyEmailFailure} onChange={e => setNotifyEmailFailure(e.target.value)}
                  placeholder="admin@firma.pl" />
              </div>

              {/* Success email */}
              <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--border)', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={16} color="#22C55E" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Przy udanym backupie</div>
                    <div style={{ fontSize: 10, color: 'var(--td)' }}>Opcjonalnie — potwierdzenie po każdej kopii</div>
                  </div>
                </div>
                <input style={inputStyle} type="email" value={notifyEmailSuccess} onChange={e => setNotifyEmailSuccess(e.target.value)}
                  placeholder="admin@firma.pl (opcjonalnie)" />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setStep('schedule')} icon={<ChevronLeft size={14} />}>Wstecz</Button>
                <Button onClick={() => setStep('options')} icon={<ChevronRight size={14} />}>Dalej — opcje</Button>
              </div>
            </div>
          )}

          {/* ═══ Step 8: Options ═══════════════════════════════════════ */}
          {step === 'options' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Opcje backupu</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>Nazwa, szyfrowanie i retencja</p>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Nazwa konfiguracji</label>
                <input style={inputStyle} value={backupName} onChange={e => setBackupName(e.target.value)}
                  placeholder={sourceType === 'folder'
                    ? `Backup Folder — ${selectedAgent?.hostname}`
                    : `Backup ${selectedDb?.type}${selectedDb?.instance ? ' ' + selectedDb.instance : ''} — ${selectedAgent?.hostname}`
                  } />
              </div>

              {/* Encryption */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, padding: 16, borderRadius: 14, border: '1px solid var(--border)' }}>
                <Toggle value={encrypt} onChange={v => {
                  setEncrypt(v);
                  if (v && !encryptionKey) genKey();
                }} label="Szyfrowanie kopii AES-256" />

                {encrypt && (
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lock size={10} /> Klucz szyfrowania
                      <span style={{ color: 'var(--td)', fontWeight: 400, textTransform: 'none' }}>— zachowaj w bezpiecznym miejscu!</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }} value={encryptionKey}
                        onChange={e => setEncryptionKey(e.target.value)} readOnly />
                      <button onClick={copyKey} title="Kopiuj" style={{
                        padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)',
                        background: keyCopied ? 'rgba(34,197,94,0.1)' : 'var(--hover-bg)',
                        color: keyCopied ? '#22C55E' : 'var(--tm)', cursor: 'pointer',
                      }}>
                        {keyCopied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button onClick={genKey} title="Generuj nowy" style={{
                        padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--hover-bg)', color: 'var(--tm)', cursor: 'pointer', fontSize: 11,
                      }}>
                        Nowy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Retention */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Retencja — przechowuj kopie przez</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={1} max={365} value={retentionDays}
                    onChange={e => setRetentionDays(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" min={1} max={365} value={retentionDays}
                      onChange={e => setRetentionDays(Number(e.target.value))}
                      style={{ ...inputStyle, width: 55, textAlign: 'center', padding: '6px 8px' }} />
                    <span style={{ fontSize: 11, color: 'var(--td)' }}>dni</span>
                  </div>
                </div>
              </div>

              <Toggle value={runNow} onChange={setRunNow} label="Uruchom pierwszy backup natychmiast po utworzeniu" />

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <Button variant="secondary" onClick={() => setStep('notifications')} icon={<ChevronLeft size={14} />}>Wstecz</Button>
                <Button onClick={() => setStep('summary')} icon={<ChevronRight size={14} />}>Dalej — podsumowanie</Button>
              </div>
            </div>
          )}

          {/* ═══ Step 7: Summary ══════════════════════════════════════ */}
          {step === 'summary' && (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px' }}>Podsumowanie konfiguracji</h3>
              <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 20px' }}>Sprawdź i zatwierdź konfigurację backupu</p>

              <div style={{ borderRadius: 14, border: '1px solid var(--border)', padding: '4px 18px', marginBottom: 20 }}>
                <SumRow icon={<Server size={14} />} label="Agent" value={selectedAgent?.hostname || '—'} />
                <SumRow icon={<Database size={14} />} label="Źródło"
                  value={sourceType === 'folder'
                    ? `Folder: ${folderPath}`
                    : `${selectedDb?.type}${selectedDb?.instance ? ' \\ ' + selectedDb.instance : ''} — ${selectedDb?.host}${selectedDb?.port ? ':' + selectedDb.port : ''}`
                  }
                />
                {sourceType === 'sql' && (
                  <SumRow icon={<HardDrive size={14} />} label="Bazy danych" value={selectedDbs.join(', ')} />
                )}
                <SumRow icon={<Clock size={14} />} label="Harmonogram" value={scheduleLabel} />
                <SumRow icon={<Calendar size={14} />} label="Retencja" value={`${retentionDays} dni`} />
                <SumRow icon={<Lock size={14} />} label="Szyfrowanie" value={encrypt ? 'AES-256 ✓' : 'Wyłączone'} />
                {useInfradeskCloud && <SumRow icon={<Shield size={14} />} label="InfraDesk Cloud" value="Serwery InfraDesk — szyfrowane" />}
                {localPath && <SumRow icon={<HardDrive size={14} />} label="Folder zapisu" value={localPath} />}
                {useGdrive && <SumRow icon={<Cloud size={14} />} label="Google Drive" value={gdriveEmail ? `${gdriveEmail} · ${gdriveFolder || 'główny folder'}` : gdriveFolder || '—'} />}
                {useFtp && <SumRow icon={<Server size={14} />} label="FTP/SFTP" value={`${ftpHost}:${ftpPort || '21'} → ${ftpPath || '/'}`} />}
                {notifyEmailFailure && <SumRow icon={<Mail size={14} />} label="Alert przy błędzie" value={notifyEmailFailure} />}
                {notifyEmailSuccess && <SumRow icon={<Mail size={14} />} label="Info przy sukcesie" value={notifyEmailSuccess} />}
                {runNow && <SumRow icon={<Play size={14} />} label="Pierwszy backup" value="Natychmiast po utworzeniu" />}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setStep('options')} icon={<ChevronLeft size={14} />}>Wstecz</Button>
                <Button onClick={() => createMut.mutate()} loading={createMut.isPending}
                  icon={<CheckCircle size={14} />} style={{ flex: 1 }}>
                  Utwórz konfigurację backupu
                </Button>
              </div>
            </div>
          )}

          {/* ═══ Done ═════════════════════════════════════════════════ */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
                background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle size={36} color="#22C55E" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', margin: '0 0 8px' }}>
                Backup skonfigurowany!
              </h3>
              <p style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 8, maxWidth: 360, margin: '0 auto 24px' }}>
                Agent <strong>{selectedAgent?.hostname}</strong> automatycznie wykona kopię zapasową
                zgodnie z harmonogramem: <strong>{scheduleLabel}</strong>
              </p>
              {runNow && (
                <p style={{ fontSize: 12, color: '#22C55E', marginBottom: 16 }}>
                  ✓ Pierwszy backup został uruchomiony
                </p>
              )}
              <Button onClick={reset}>Zamknij</Button>
            </div>
          )}

        </div>
      </div>
    </Modal>
  );
}
