import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Play, Pencil, Trash2, Database, FolderOpen,
  Clock, CheckCircle2, XCircle, Loader2, History, Power,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { backupApi, type BackupConfig, type BackupHistory } from '../../api/backup';
import { formatDateTime } from '../../utils/helpers';

const TYPE_LABELS: Record<string, string> = {
  SQL_MYSQL: 'MySQL',
  SQL_POSTGRES: 'PostgreSQL',
  SQL_MSSQL: 'MS SQL',
  FOLDER: 'Folder',
};

const TYPE_OPTIONS = [
  { value: 'SQL_MYSQL', label: 'MySQL' },
  { value: 'SQL_POSTGRES', label: 'PostgreSQL' },
  { value: 'SQL_MSSQL', label: 'MS SQL' },
  { value: 'FOLDER', label: 'Folder' },
];

const SCHEDULE_OPTIONS = [
  { value: '0 2 * * *', label: 'Codziennie 02:00' },
  { value: '0 */6 * * *', label: 'Co 6h' },
  { value: '0 */12 * * *', label: 'Co 12h' },
  { value: '0 0 * * 0', label: 'Co niedzielę 00:00' },
];

const SCHEDULE_LABELS: Record<string, string> = {
  '0 2 * * *': 'Codziennie 02:00',
  '0 */6 * * *': 'Co 6h',
  '0 */12 * * *': 'Co 12h',
  '0 0 * * 0': 'Co niedzielę 00:00',
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-xs" style={{ color: 'var(--tm)' }}>--</span>;

  const map: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    SUCCESS: {
      bg: 'rgba(34,197,94,0.12)',
      color: '#4ADE80',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    FAILED: {
      bg: 'rgba(239,68,68,0.12)',
      color: '#F87171',
      icon: <XCircle className="h-3 w-3" />,
    },
    RUNNING: {
      bg: 'rgba(59,130,246,0.12)',
      color: '#60A5FA',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
  };

  const s = map[status] ?? { bg: 'var(--border)', color: 'var(--ts)', icon: null };

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      {s.icon}
      {status}
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  const isSql = type.startsWith('SQL');
  return (
    <div
      className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
      style={{
        background: isSql ? 'rgba(139,92,246,0.12)' : 'rgba(59,130,246,0.12)',
      }}
    >
      {isSql
        ? <Database className="h-[18px] w-[18px]" style={{ color: '#A78BFA' }} />
        : <FolderOpen className="h-[18px] w-[18px]" style={{ color: '#60A5FA' }} />
      }
    </div>
  );
}

const emptyForm: Partial<BackupConfig> = {
  name: '',
  type: 'SQL_MYSQL',
  enabled: true,
  sqlHost: '',
  sqlPort: 3306,
  sqlUser: '',
  sqlPassEnc: '',
  sqlDatabases: '',
  folderPath: '',
  googleDriveFolder: '',
  cronSchedule: '0 2 * * *',
  retentionDays: 30,
  encryptBackups: false,
  encryptionKey: '',
  agentRegId: '',
  clientId: '',
};

function BackupFormModal({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config?: BackupConfig | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!config;
  const [form, setForm] = useState<Partial<BackupConfig>>(config ?? { ...emptyForm });

  const set = (key: string, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const isSql = form.type?.startsWith('SQL');

  const mutation = useMutation({
    mutationFn: () =>
      isEdit ? backupApi.update(config!.id, form) : backupApi.create(form),
    onSuccess: () => {
      toast.success(isEdit ? 'Konfiguracja zaktualizowana' : 'Konfiguracja utworzona');
      qc.invalidateQueries({ queryKey: ['backup-configs'] });
      onClose();
    },
    onError: () => toast.error('Nie udało się zapisać konfiguracji'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edytuj konfigurację' : 'Nowa konfiguracja backupu'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Anuluj</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            {isEdit ? 'Zapisz' : 'Utwórz'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nazwa"
            placeholder="np. Backup bazy klienta X"
            value={form.name ?? ''}
            onChange={e => set('name', e.target.value)}
          />
          <Select
            label="Typ"
            options={TYPE_OPTIONS}
            value={form.type ?? 'SQL_MYSQL'}
            onChange={e => set('type', e.target.value)}
          />
        </div>

        {isSql && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Host"
                placeholder="localhost"
                value={form.sqlHost ?? ''}
                onChange={e => set('sqlHost', e.target.value)}
              />
              <Input
                label="Port"
                type="number"
                placeholder={form.type === 'SQL_POSTGRES' ? '5432' : form.type === 'SQL_MSSQL' ? '1433' : '3306'}
                value={form.sqlPort ?? ''}
                onChange={e => set('sqlPort', Number(e.target.value))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Użytkownik"
                placeholder="root"
                value={form.sqlUser ?? ''}
                onChange={e => set('sqlUser', e.target.value)}
              />
              <Input
                label="Hasło"
                type="password"
                placeholder="********"
                value={form.sqlPassEnc ?? ''}
                onChange={e => set('sqlPassEnc', e.target.value)}
              />
            </div>
            <Input
              label="Bazy danych"
              placeholder="db1, db2 (oddziel przecinkami lub * dla wszystkich)"
              value={form.sqlDatabases ?? ''}
              onChange={e => set('sqlDatabases', e.target.value)}
              hint="Podaj nazwy baz oddzielone przecinkami lub * aby zbackupować wszystkie"
            />
          </>
        )}

        {!isSql && (
          <Input
            label="Ścieżka folderu"
            placeholder="C:\Data\Backup"
            value={form.folderPath ?? ''}
            onChange={e => set('folderPath', e.target.value)}
          />
        )}

        <div
          className="rounded-xl p-4 space-y-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--tm)' }}>
            Ustawienia ogólne
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Google Drive Folder ID"
              placeholder="np. 1a2B3c..."
              value={form.googleDriveFolder ?? ''}
              onChange={e => set('googleDriveFolder', e.target.value)}
            />
            <Select
              label="Harmonogram"
              options={SCHEDULE_OPTIONS}
              value={form.cronSchedule ?? '0 2 * * *'}
              onChange={e => set('cronSchedule', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Przechowywanie (dni)"
              type="number"
              value={form.retentionDays ?? 30}
              onChange={e => set('retentionDays', Number(e.target.value))}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--tm)' }}>
                Szyfrowanie
              </label>
              <label className="flex items-center gap-3 cursor-pointer py-2.5">
                <div
                  className="relative w-10 h-[22px] rounded-full transition-colors cursor-pointer"
                  style={{
                    background: form.encryptBackups ? 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' : 'var(--border)',
                  }}
                  onClick={() => set('encryptBackups', !form.encryptBackups)}
                >
                  <div
                    className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform"
                    style={{ left: form.encryptBackups ? '22px' : '3px' }}
                  />
                </div>
                <span className="text-sm" style={{ color: 'var(--ts)' }}>
                  {form.encryptBackups ? 'Włączone' : 'Wyłączone'}
                </span>
              </label>
            </div>
          </div>
          {form.encryptBackups && (
            <Input
              label="Klucz szyfrowania"
              type="password"
              placeholder="Klucz AES-256"
              value={form.encryptionKey ?? ''}
              onChange={e => set('encryptionKey', e.target.value)}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Agent Reg ID"
            placeholder="ID agenta"
            value={form.agentRegId ?? ''}
            onChange={e => set('agentRegId', e.target.value)}
          />
          <Input
            label="Client ID"
            placeholder="ID klienta"
            value={form.clientId ?? ''}
            onChange={e => set('clientId', e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

function HistoryModal({ open, onClose, configId, configName }: {
  open: boolean;
  onClose: () => void;
  configId: string;
  configName: string;
}) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['backup-history', configId],
    queryFn: () => backupApi.getHistory(configId),
    enabled: open,
  });

  function formatSize(bytes?: number) {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return (
    <Modal open={open} onClose={onClose} title={`Historia: ${configName}`} size="xl" noPadding>
      <div className="overflow-y-auto max-h-[60vh]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--tm)' }} />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--tm)' }}>
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Brak historii</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tm)' }}>Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tm)' }}>Start</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tm)' }}>Koniec</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tm)' }}>Rozmiar</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tm)' }}>Plik</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-5 py-3"><StatusBadge status={h.status} /></td>
                  <td className="px-5 py-3" style={{ color: 'var(--ts)' }}>{formatDateTime(h.startedAt)}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--ts)' }}>{h.completedAt ? formatDateTime(h.completedAt) : '--'}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--ts)' }}>{formatSize(h.sizeBytes)}</td>
                  <td className="px-5 py-3 max-w-[200px] truncate" style={{ color: 'var(--ts)' }}>{h.fileName ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

export function BackupPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editConfig, setEditConfig] = useState<BackupConfig | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [historyConfig, setHistoryConfig] = useState<{ id: string; name: string } | null>(null);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['backup-configs'],
    queryFn: () => backupApi.getConfigs(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => backupApi.delete(id),
    onSuccess: () => {
      toast.success('Konfiguracja usunięta');
      qc.invalidateQueries({ queryKey: ['backup-configs'] });
      setDeleteId(null);
    },
    onError: () => toast.error('Nie udało się usunąć'),
  });

  const runNowMutation = useMutation({
    mutationFn: (id: string) => backupApi.runNow(id),
    onSuccess: () => {
      toast.success('Backup uruchomiony');
      qc.invalidateQueries({ queryKey: ['backup-configs'] });
    },
    onError: () => toast.error('Nie udało się uruchomić backupu'),
  });

  const openEdit = (cfg: BackupConfig) => {
    setEditConfig(cfg);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditConfig(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditConfig(null);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Kopie zapasowe"
        subtitle="Zarządzanie konfiguracjami backupów baz danych i folderów"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Dodaj konfigurację
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--tm)' }} />
        </div>
      ) : configs.length === 0 ? (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-20"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <Database className="h-10 w-10 mb-3" style={{ color: 'var(--td)' }} />
          <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak konfiguracji backupów</p>
          <p className="text-xs mt-1" style={{ color: 'var(--td)' }}>Kliknij "Dodaj konfigurację" aby rozpocząć</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(cfg => (
            <div
              key={cfg.id}
              className="rounded-2xl p-5 transition-colors hover:bg-white/[0.01]"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-start gap-4">
                <TypeIcon type={cfg.type} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-[14px] font-semibold text-white/90 truncate">{cfg.name}</h3>
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md flex-shrink-0"
                      style={{ background: 'var(--hover-bg)', color: 'var(--ts)' }}
                    >
                      {TYPE_LABELS[cfg.type] ?? cfg.type}
                    </span>
                    {!cfg.enabled && (
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md flex-shrink-0"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}
                      >
                        Wyłączony
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]" style={{ color: 'var(--tm)' }}>
                    {cfg.agent?.hostname && (
                      <span className="flex items-center gap-1.5">
                        <Power className="h-3 w-3" />
                        {cfg.agent.hostname}
                      </span>
                    )}
                    {cfg.client?.name && (
                      <span>{cfg.client.name}</span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {SCHEDULE_LABELS[cfg.cronSchedule] ?? cfg.cronSchedule}
                    </span>
                    {cfg.lastRunAt && (
                      <span>Ostatnio: {formatDateTime(cfg.lastRunAt)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={cfg.lastStatus} />

                  <button
                    onClick={() => setHistoryConfig({ id: cfg.id, name: cfg.name })}
                    className="p-2 rounded-lg transition-colors hover:bg-white/[0.05]"
                    style={{ color: 'var(--tm)' }}
                    title="Historia"
                  >
                    <History className="h-4 w-4" />
                  </button>

                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Play className="h-3.5 w-3.5" />}
                    onClick={() => runNowMutation.mutate(cfg.id)}
                    loading={runNowMutation.isPending}
                  >
                    Uruchom teraz
                  </Button>

                  <button
                    onClick={() => openEdit(cfg)}
                    className="p-2 rounded-lg transition-colors hover:bg-white/[0.05]"
                    style={{ color: 'var(--tm)' }}
                    title="Edytuj"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => setDeleteId(cfg.id)}
                    className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: 'var(--td)' }}
                    title="Usuń"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <BackupFormModal
          open={showForm}
          onClose={closeForm}
          config={editConfig}
        />
      )}

      {historyConfig && (
        <HistoryModal
          open={!!historyConfig}
          onClose={() => setHistoryConfig(null)}
          configId={historyConfig.id}
          configName={historyConfig.name}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Usuń konfigurację"
        message="Czy na pewno chcesz usunąć tę konfigurację backupu? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
