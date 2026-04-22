import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus, HardDrive, Database, FolderOpen, Cloud, Play, X, Loader2, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl, formatDatePl } from '@/lib/utils';

interface BackupConfig {
  id: string;
  name: string;
  type: 'SQL_MYSQL' | 'SQL_POSTGRES' | 'SQL_MSSQL' | 'FOLDER';
  sqlHost: string | null;
  sqlDatabase: string | null;
  folderPath: string | null;
  useInfradeskCloud: boolean;
  googleDriveFolder: string | null;
  cronSchedule: string;
  retentionDays: number;
  encryptBackups: boolean;
  lastStatus: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'NEVER_RAN' | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  history: Array<{ id: string; status: string; startedAt: string; completedAt: string | null; sizeBytes: string | null; errorMessage: string | null }>;
  _count: { history: number };
}

const TYPE_META: Record<string, { label: string; icon: typeof Database; color: string }> = {
  SQL_MYSQL:    { label: 'MySQL',      icon: Database,   color: 'var(--in)' },
  SQL_POSTGRES: { label: 'PostgreSQL', icon: Database,   color: 'var(--in)' },
  SQL_MSSQL:    { label: 'MS SQL',     icon: Database,   color: 'var(--in)' },
  FOLDER:       { label: 'Folder',     icon: FolderOpen, color: 'var(--wn)' },
};

const STATUS_META: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  SUCCESS:   { label: 'OK',       variant: 'success' },
  FAILED:    { label: 'Błąd',     variant: 'danger' },
  RUNNING:   { label: 'W toku',   variant: 'warning' },
  NEVER_RAN: { label: 'Nowy',     variant: 'neutral' },
};

function humanBytes(bytes: string | null): string {
  if (!bytes) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

export function BackupsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ configs: BackupConfig[] }>({
    queryKey: ['backups'],
    queryFn: async () => (await api.get('/backups')).data,
    refetchInterval: 60_000,
  });

  const runNow = useMutation({
    mutationFn: async (id: string) => (await api.post(`/backups/${id}/run-now`)).data,
    onSuccess: () => { toast.success('Backup zakolejkowany'); qc.invalidateQueries({ queryKey: ['backups'] }); },
  });

  const configs = data?.configs ?? [];
  const okCount = configs.filter((c) => c.lastStatus === 'SUCCESS').length;
  const failedCount = configs.filter((c) => c.lastStatus === 'FAILED').length;

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Kopie zapasowe</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {configs.length > 0 ? `${configs.length} ${configs.length === 1 ? 'konfiguracja' : 'konfiguracji'}` : 'Brak backupów'}
            {okCount > 0 && ` · ${okCount} OK`}
            {failedCount > 0 && ` · ${failedCount} Błąd`}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Nowy backup</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : configs.length === 0 ? (
        <Card className="p-10 text-center">
          <HardDrive className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak konfiguracji backupów</p>
          <p className="text-[13px] text-tx3 mb-4">Dodaj pierwszy backup — baza SQL lub folder. Możesz trzymać w InfraDesk Cloud, Google Drive, FTP albo lokalnie.</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Dodaj pierwszy backup</Button>
        </Card>
      ) : (
        <div className="space-y-3 stg">
          {configs.map((c) => {
            const meta = TYPE_META[c.type];
            const status = c.lastStatus ? STATUS_META[c.lastStatus] : null;
            const lastRun = c.history[0];
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start gap-4 flex-wrap">
                  <div
                    className="w-12 h-12 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                    style={{ background: `color-mix(in srgb, ${meta?.color ?? 'var(--tx3)'} 12%, transparent)` }}
                  >
                    {meta && <meta.icon style={{ width: 22, height: 22, color: meta.color }} />}
                  </div>
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-[14px] font-semibold text-tx">{c.name}</h3>
                      <Badge variant="neutral">{meta?.label ?? c.type}</Badge>
                      {status && <Badge variant={status.variant}>{status.label}</Badge>}
                      {c.encryptBackups && <Badge variant="accent" className="text-[9px]">🔒 Szyfrowany</Badge>}
                      {c.useInfradeskCloud && <Badge variant="accent" className="text-[9px]"><Cloud className="h-2.5 w-2.5" /> Cloud</Badge>}
                      {c.googleDriveFolder && <Badge variant="accent" className="text-[9px]">☁ GDrive</Badge>}
                    </div>
                    <div className="text-[11px] text-tx3 space-y-0.5">
                      {c.sqlHost && <p>{c.sqlDatabase}@{c.sqlHost}</p>}
                      {c.folderPath && <p className="font-mono">{c.folderPath}</p>}
                      <p>Harmonogram: <span className="font-mono">{c.cronSchedule}</span> · Retencja: {c.retentionDays} dni</p>
                      {c.lastRunAt && <p>Ostatnio: {formatRelativePl(c.lastRunAt)}</p>}
                      {c.history.length > 0 && lastRun && (
                        <p>
                          Ostatni przebieg: {humanBytes(lastRun.sizeBytes)} · {lastRun.completedAt ? `${Math.round((new Date(lastRun.completedAt).getTime() - new Date(lastRun.startedAt).getTime()) / 1000)}s` : 'w toku'}
                          {lastRun.errorMessage && <span className="text-er"> · {lastRun.errorMessage}</span>}
                        </p>
                      )}
                      <p>Historia: {c._count.history} przebiegów</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runNow.isPending || c.lastStatus === 'RUNNING'}
                      onClick={() => runNow.mutate(c.id)}
                    >
                      <Play className="h-3 w-3" /> Uruchom teraz
                    </Button>
                  </div>
                </div>
                {c.history.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-bd">
                    <div className="flex items-center gap-1">
                      {c.history.slice(0, 30).reverse().map((h) => (
                        <div
                          key={h.id}
                          className="h-6 w-2 rounded-sm"
                          title={`${formatDatePl(h.startedAt)} — ${h.status}${h.errorMessage ? ` (${h.errorMessage})` : ''}`}
                          style={{
                            background: h.status === 'SUCCESS' ? 'var(--ok)' : h.status === 'FAILED' ? 'var(--er)' : h.status === 'RUNNING' ? 'var(--wn)' : 'var(--sf-h)',
                            opacity: 0.8,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4" style={{ background: 'var(--wn-l)', border: '1px solid var(--wn-b)' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--wn)' }} />
          <div className="text-[12px] text-tx2">
            <strong className="text-tx">Worker uruchamiający backupy</strong> planowany w Sprint 6. Teraz „Uruchom teraz" tylko zakolejkowuje rekord (status RUNNING). Agent desktop wykona realny backup gdy worker zostanie wdrożony — wcześniej możesz kontfigurować, agent będzie wiedział co robić.
          </div>
        </div>
      </Card>

      {showCreate && <CreateBackupModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

const schema = z.object({
  name: z.string().min(1, 'Nazwa wymagana'),
  type: z.enum(['SQL_MYSQL', 'SQL_POSTGRES', 'SQL_MSSQL', 'FOLDER']),
  sqlHost: z.string().optional(),
  sqlPort: z.coerce.number().int().positive().optional(),
  sqlDatabase: z.string().optional(),
  sqlUsername: z.string().optional(),
  sqlPassword: z.string().optional(),
  folderPath: z.string().optional(),
  cronSchedule: z.string().default('0 2 * * *'),
  retentionDays: z.coerce.number().int().min(1).max(3650).default(30),
  useInfradeskCloud: z.boolean().default(true),
  googleDriveFolder: z.string().optional(),
  encryptBackups: z.boolean().default(true),
});
type Form = z.infer<typeof schema>;

function CreateBackupModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'SQL_POSTGRES', cronSchedule: '0 2 * * *', retentionDays: 30, useInfradeskCloud: true, encryptBackups: true },
  });

  const type = watch('type');
  const isSql = type?.startsWith('SQL');

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      const payload: Record<string, unknown> = { ...data };
      if (!data.sqlPassword) delete payload.sqlPassword;
      return (await api.post('/backups', payload)).data;
    },
    onSuccess: () => { toast.success('Backup skonfigurowany'); qc.invalidateQueries({ queryKey: ['backups'] }); onClose(); },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd');
    },
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] anim-scale max-h-[90vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowy backup</Dialog.Title>
            <Dialog.Close asChild><button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5 text-tx2">Nazwa</label>
              <Input {...register('name')} placeholder="np. Produkcja — baza klienta" />
              {errors.name && <p className="text-[11px] text-er mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5 text-tx2">Typ</label>
              <Select {...register('type')}>
                <option value="SQL_POSTGRES">PostgreSQL</option>
                <option value="SQL_MYSQL">MySQL</option>
                <option value="SQL_MSSQL">MS SQL Server</option>
                <option value="FOLDER">Folder (pliki)</option>
              </Select>
            </div>

            {isSql && (
              <div className="border-t border-bd pt-4 space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2">Połączenie do bazy</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Host</label>
                    <Input {...register('sqlHost')} placeholder="db.klient.pl" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Port</label>
                    <Input type="number" {...register('sqlPort')} placeholder="5432" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Baza</label>
                  <Input {...register('sqlDatabase')} placeholder="production_db" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Użytkownik</label>
                    <Input {...register('sqlUsername')} placeholder="backup_user" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Hasło</label>
                    <Input type="password" {...register('sqlPassword')} placeholder="zaszyfrujemy" />
                  </div>
                </div>
              </div>
            )}

            {!isSql && (
              <div className="border-t border-bd pt-4">
                <label className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5 text-tx2">Ścieżka folderu</label>
                <Input {...register('folderPath')} placeholder="C:\Dane albo /var/data" className="font-mono" />
              </div>
            )}

            <div className="border-t border-bd pt-4 space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2">Harmonogram</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Cron</label>
                  <Input {...register('cronSchedule')} placeholder="0 2 * * *" className="font-mono" />
                  <p className="text-[10px] text-tx3 mt-0.5">domyślnie codziennie o 2:00</p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Retencja (dni)</label>
                  <Input type="number" {...register('retentionDays')} />
                </div>
              </div>
            </div>

            <div className="border-t border-bd pt-4 space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2">Gdzie trzymamy kopie</h3>
              <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer">
                <input type="checkbox" {...register('useInfradeskCloud')} className="accent-[color:var(--pri)]" />
                <Cloud className="h-3 w-3" /> InfraDesk Cloud (zaszyfrowane, bezpieczne)
              </label>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Google Drive folder (opcjonalnie)</label>
                <Input {...register('googleDriveFolder')} placeholder="ID folderu Drive (OAuth w Sprint 6)" />
              </div>
              <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer">
                <input type="checkbox" {...register('encryptBackups')} className="accent-[color:var(--pri)]" />
                🔒 Szyfruj backupy przed wysłaniem
              </label>
            </div>
          </form>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button type="button" onClick={handleSubmit((d) => mutation.mutate(d))} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Utwórz'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
