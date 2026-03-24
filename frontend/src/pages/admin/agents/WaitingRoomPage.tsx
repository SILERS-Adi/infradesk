import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Monitor, Check, Trash2, Wifi, WifiOff, Clock, Download, ChevronDown, ChevronUp, Cpu, HardDrive, Network, Package, RefreshCw } from 'lucide-react';
import api from '../../../api/client';
import { agentsApi, AgentRegistration, InstalledSoftware, DiskInfo, NetworkIface } from '../../../api/agents';
import { sessionsApi, WorkSession } from '../../../api/sessions';
import { clientsApi } from '../../../api/clients';
import { devicesApi } from '../../../api/devices';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { FloatingSessionTimer } from '../../../components/ui/FloatingSessionTimer';
import { getErrorMessage } from '../../../utils/helpers';
import { clsx } from 'clsx';

function MetricBar({ value, label }: { value?: number; label: string }) {
  if (value == null) return null;
  const pct = Math.round(value);
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className="w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-medium">{pct}%</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 w-28 shrink-0">{label}</span>
      <span className="text-gray-800 font-medium break-all">{value}</span>
    </div>
  );
}

function ConnectButton({ regId, rustdeskId, hostname, onSessionStart }: {
  regId: string;
  rustdeskId: string;
  hostname?: string;
  onSessionStart: (session: WorkSession, hostname: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    setLoading(true);
    try {
      const [connectRes, session] = await Promise.all([
        api.post(`/agent/${regId}/connect`),
        sessionsApi.start(regId),
      ]);
      const { password } = connectRes.data;
      window.open(`rustdesk://connect/${rustdeskId}?password=${password}`, '_blank');
      onSessionStart(session, hostname ?? rustdeskId);
    } catch {
      toast.error('Błąd połączenia RustDesk');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={connect}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
    >
      <Monitor className="h-3.5 w-3.5" />
      {loading ? 'Łączenie...' : 'Połącz'}
    </button>
  );
}

function AgentRow({ reg, latestVersion, onApprove, onQuickApprove, onDelete, onSessionStart }: {
  reg: AgentRegistration;
  latestVersion?: string;
  onApprove: (reg: AgentRegistration) => void;
  onQuickApprove: (reg: AgentRegistration) => void;
  onDelete: (id: string) => void;
  onSessionStart: (session: WorkSession, hostname: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pushUpdateMutation = useMutation({
    mutationFn: () => agentsApi.pushUpdate(reg.id),
    onSuccess: () => toast.success('Komenda aktualizacji wysłana'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isOnline = reg.lastSeen
    ? new Date().getTime() - new Date(reg.lastSeen).getTime() < 2 * 60 * 1000
    : false;

  const uptime = reg.lastBootTime
    ? (() => {
        const diff = Math.floor((Date.now() - new Date(reg.lastBootTime).getTime()) / 1000);
        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        return d > 0 ? `${d}d ${h}h` : `${h}h`;
      })()
    : null;

  const filteredSoftware = (reg.installedSoftware ?? []).filter(s =>
    s.name.toLowerCase().includes(softwareSearch.toLowerCase()) ||
    (s.publisher ?? '').toLowerCase().includes(softwareSearch.toLowerCase())
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Nagłówek */}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            reg.status === 'ACTIVE' ? 'bg-emerald-100' : reg.status === 'PENDING' ? 'bg-amber-100' : 'bg-gray-100'
          )}>
            <Monitor className={clsx('h-5 w-5', reg.status === 'ACTIVE' ? 'text-emerald-600' : reg.status === 'PENDING' ? 'text-amber-600' : 'text-gray-400')} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-900 text-sm truncate">{reg.hostname ?? 'Nieznany komputer'}</p>
              {isOnline
                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><Wifi className="h-3 w-3" />Online</span>
                : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5"><WifiOff className="h-3 w-3" />Offline</span>
              }
              {reg.status === 'PENDING' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><Clock className="h-3 w-3" />Oczekuje</span>
              )}
              {reg.appVersion && (() => {
                const isOutdated = latestVersion && reg.appVersion !== latestVersion;
                return (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
                    isOutdated
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-gray-500 bg-gray-50 border-gray-200'
                  }`}>
                    v{reg.appVersion}{isOutdated ? ' ⚠ nieaktualna' : ''}
                  </span>
                );
              })()}
              {reg.client && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                  {reg.status === 'PENDING' && <Check className="h-3 w-3 text-emerald-500" />}
                  {reg.client.name}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {reg.ipAddress && <span>{reg.ipAddress} · </span>}
              {reg.osInfo && <span>{reg.osInfo} · </span>}
              {reg.currentUser && <span>👤 {reg.currentUser}</span>}
              {reg.domain && reg.domain !== reg.hostname && <span> · 🏢 {reg.domain}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {reg.status === 'PENDING' && (
              reg.clientId
                ? (
                  <Button size="sm" onClick={() => onQuickApprove(reg)} className="bg-emerald-600 hover:bg-emerald-700">
                    <Check className="h-4 w-4" />
                    Zatwierdź
                  </Button>
                )
                : (
                  <Button size="sm" onClick={() => onApprove(reg)}>
                    <Check className="h-4 w-4" />
                    Przypisz
                  </Button>
                )
            )}
            {reg.status === 'ACTIVE' && reg.rustdeskId && (
              <ConnectButton
                regId={reg.id}
                rustdeskId={reg.rustdeskId}
                hostname={reg.hostname}
                onSessionStart={onSessionStart}
              />
            )}
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Metryki bieżące */}
        <div className="space-y-1.5 pl-12">
          <MetricBar value={reg.cpuUsage} label="CPU" />
          <MetricBar value={reg.ramUsage} label="RAM" />
          {reg.diskTotal != null && reg.diskFree != null && reg.diskTotal > 0 && (
            <MetricBar value={(1 - reg.diskFree / reg.diskTotal) * 100} label="C:\\" />
          )}
        </div>
      </div>

      {/* Szczegóły rozwijane */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">

          {/* Sprzęt */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2"><Cpu className="h-3.5 w-3.5" />Sprzęt</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <InfoRow label="CPU" value={reg.cpuModel} />
              <InfoRow label="Rdzenie / wątki" value={reg.cpuCores != null ? `${reg.cpuCores} / ${reg.cpuThreads ?? '?'}` : null} />
              <InfoRow label="RAM całkowita" value={reg.ramTotalGb != null ? `${reg.ramTotalGb} GB` : null} />
              <InfoRow label="GPU" value={reg.gpuModel} />
              <InfoRow label="Płyta główna" value={reg.motherboard} />
              <InfoRow label="Nr seryjny" value={reg.serialNumber} />
              <InfoRow label="Windows" value={reg.windowsVersion} />
              <InfoRow label="Uptime" value={uptime} />
            </div>
          </div>

          {/* Dyski */}
          {(reg.diskInfo ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2"><HardDrive className="h-3.5 w-3.5" />Dyski</p>
              <div className="space-y-1.5">
                {(reg.diskInfo as DiskInfo[]).map(d => (
                  <div key={d.mountpoint} className="flex items-center gap-3 text-xs">
                    <span className="w-10 text-gray-500 shrink-0">{d.mountpoint}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={clsx('h-full rounded-full', d.usedPct > 90 ? 'bg-red-500' : d.usedPct > 70 ? 'bg-amber-400' : 'bg-emerald-500')} style={{ width: `${d.usedPct}%` }} />
                    </div>
                    <span className="text-gray-600 w-36 shrink-0">{d.freeGb.toFixed(1)} GB wolne / {d.totalGb.toFixed(1)} GB · {d.fstype}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sieć */}
          {(reg.networkIfaces ?? []).filter((i: NetworkIface) => i.ip).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2"><Network className="h-3.5 w-3.5" />Sieć</p>
              <div className="space-y-1">
                {(reg.networkIfaces as NetworkIface[]).filter(i => i.ip).map(i => (
                  <div key={i.name} className="flex gap-4 text-xs">
                    <span className={clsx('w-2 h-2 rounded-full mt-0.5 shrink-0', i.isUp ? 'bg-emerald-500' : 'bg-gray-300')} />
                    <span className="text-gray-500 w-40 truncate shrink-0">{i.name}</span>
                    <span className="text-gray-800 font-mono">{i.ip}</span>
                    {i.mac && <span className="text-gray-400 font-mono">{i.mac}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Zainstalowane programy */}
          {(reg.installedSoftware ?? []).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Programy ({reg.installedSoftware!.length})</p>
                <input
                  type="text"
                  placeholder="Szukaj..."
                  value={softwareSearch}
                  onChange={e => setSoftwareSearch(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-40 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                {filteredSoftware.map((s: InstalledSoftware, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-gray-50">
                    <span className="flex-1 text-gray-800 font-medium truncate">{s.name}</span>
                    {s.version && <span className="text-gray-400 shrink-0">{s.version}</span>}
                    {s.publisher && <span className="text-gray-400 shrink-0 hidden sm:block truncate max-w-[120px]">{s.publisher}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Akcje */}
          <div className="border-t border-gray-200 pt-3 flex items-center gap-2 flex-wrap">
            {reg.status === 'ACTIVE' && (
              <button
                onClick={() => pushUpdateMutation.mutate()}
                disabled={pushUpdateMutation.isPending}
                className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${pushUpdateMutation.isPending ? 'animate-spin' : ''}`} />
                Wyślij aktualizację
              </button>
            )}
            <div className="flex-1" />
            {confirmDelete ? (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700 flex-1 font-medium">Na pewno usunąć tego agenta?</p>
                <button
                  onClick={() => { onDelete(reg.id); setConfirmDelete(false); }}
                  className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Tak, usuń
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-white transition-colors"
                >
                  Anuluj
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Usuń agenta
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ApproveForm {
  clientId: string;
  deviceId?: string;
}

interface NewClientForm {
  name: string;
  taxId?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  postalCode?: string;
  city?: string;
}

function ApproveModal({ reg, onClose }: { reg: AgentRegistration; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  // Istniejący klient
  const { register: regExisting, handleSubmit: handleExisting, watch } = useForm<ApproveForm>({
    defaultValues: { clientId: reg.clientId ?? '', deviceId: '' },
  });
  const clientId = watch('clientId');

  // Nowy klient — pre-fill z danych rejestracji
  const { register: regNew, handleSubmit: handleNew } = useForm<NewClientForm>({
    defaultValues: {
      name:         reg.companyName ?? '',
      taxId:        reg.nip ?? '',
      phone:        reg.contactPhone ?? '',
      email:        reg.contactEmail ?? '',
    },
  });

  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.getAll() });
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', clientId],
    queryFn: () => devicesApi.getAll({ clientId }),
    enabled: !!clientId,
  });

  const successCb = () => {
    toast.success('Agent zatwierdzony');
    qc.invalidateQueries({ queryKey: ['agents'] });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['devices'] });
    onClose();
  };

  const existingMutation = useMutation({
    mutationFn: (d: ApproveForm) => agentsApi.approve(reg.id, d.clientId || undefined, d.deviceId || undefined),
    onSuccess: successCb,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const newClientMutation = useMutation({
    mutationFn: (d: NewClientForm) => agentsApi.approveNewClient(reg.id, d),
    onSuccess: successCb,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const inputCls = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900">Zatwierdź urządzenie</h2>

        {/* Info z rejestracji */}
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
          {reg.companyName && <div><span className="font-medium">Firma:</span> {reg.companyName}</div>}
          {(reg.contactFirstName || reg.contactLastName) && (
            <div><span className="font-medium">Kontakt:</span> {[reg.contactFirstName, reg.contactLastName].filter(Boolean).join(' ')}</div>
          )}
          {reg.contactEmail && <div><span className="font-medium">E-mail:</span> {reg.contactEmail}</div>}
          {reg.nip          && <div><span className="font-medium">NIP:</span> {reg.nip}</div>}
          <div className="border-t border-gray-200 pt-1 mt-1">
            {reg.hostname  && <div><span className="font-medium">Komputer:</span> {reg.hostname}</div>}
            {reg.ipAddress && <div><span className="font-medium">IP:</span> {reg.ipAddress}</div>}
          </div>
        </div>

        {/* Przełącznik trybu */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 py-2.5 transition-colors ${mode === 'existing' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Przypisz do istniejącej firmy
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 py-2.5 transition-colors ${mode === 'new' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Utwórz nową firmę
          </button>
        </div>

        {mode === 'existing' ? (
          <form onSubmit={handleExisting(d => existingMutation.mutate(d))} className="space-y-4">
            <Select
              label="Klient *"
              placeholder="Wybierz klienta z listy"
              options={clients.map(c => ({ value: c.id, label: c.name }))}
              {...regExisting('clientId', { required: true })}
            />
            {clientId && (
              <Select
                label="Urządzenie (opcjonalne)"
                placeholder="— auto-utwórz nowe —"
                options={[
                  { value: '', label: '— auto-utwórz nowe urządzenie —' },
                  ...devices.map((d: any) => ({ value: d.id, label: d.name })),
                ]}
                {...regExisting('deviceId')}
              />
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button>
              <Button type="submit" loading={existingMutation.isPending} disabled={!clientId}>Zatwierdź</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleNew(d => newClientMutation.mutate(d))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Nazwa firmy *</label>
                <input className={inputCls} placeholder="np. ACME Sp. z o.o." {...regNew('name', { required: true })} />
              </div>
              <div>
                <label className={labelCls}>NIP</label>
                <input className={inputCls} placeholder="0000000000" {...regNew('taxId')} />
              </div>
              <div>
                <label className={labelCls}>Telefon</label>
                <input className={inputCls} placeholder="+48 000 000 000" {...regNew('phone')} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>E-mail</label>
                <input className={inputCls} type="email" placeholder="firma@email.pl" {...regNew('email')} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Adres</label>
                <input className={inputCls} placeholder="ul. Przykładowa 1" {...regNew('addressLine1')} />
              </div>
              <div>
                <label className={labelCls}>Kod pocztowy</label>
                <input className={inputCls} placeholder="00-000" {...regNew('postalCode')} />
              </div>
              <div>
                <label className={labelCls}>Miasto</label>
                <input className={inputCls} placeholder="Warszawa" {...regNew('city')} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button>
              <Button type="submit" loading={newClientMutation.isPending}>Utwórz firmę i zatwierdź</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function WaitingRoomPage() {
  const qc = useQueryClient();
  const [approveTarget, setApproveTarget] = useState<AgentRegistration | null>(null);
  const [activeSession, setActiveSession] = useState<{ session: WorkSession; hostname: string } | null>(null);

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAll(),
    refetchInterval: 15_000,
  });

  const { data: latestVersion } = useQuery({
    queryKey: ['agent-version'],
    queryFn: () => fetch('/downloads/version.json').then(r => r.json()) as Promise<{ version: string }>,
    refetchInterval: 60_000,
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => { toast.success('Usunięto agenta'); qc.invalidateQueries({ queryKey: ['agents'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const quickApproveMutation = useMutation({
    mutationFn: (reg: AgentRegistration) =>
      agentsApi.approve(reg.id, undefined, undefined),
    onSuccess: () => {
      toast.success('Agent zatwierdzony — urządzenie dodane automatycznie');
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const pending = registrations.filter(r => r.status === 'PENDING');
  const active = registrations.filter(r => r.status === 'ACTIVE');

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenty systemowe</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-gray-500">Zarządzaj aplikacjami monitorującymi zainstalowanymi u klientów.</p>
            {latestVersion?.version && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5">
                Aktualna wersja: v{latestVersion.version}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href="/downloads/InfraDesk-Agent.zip"
            download
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            title="Zalecane — przeglądarka nie blokuje ZIP"
          >
            <Download className="h-4 w-4" />
            Pobierz (.zip)
          </a>
          <a
            href="/downloads/InfraDesk%20Agent.exe"
            download
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium px-3 py-2 rounded-xl transition-colors"
            title="Bezpośredni EXE — przeglądarka może ostrzec"
          >
            .exe
          </a>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Ładowanie...</p>}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Poczekalnia ({pending.length})
          </h2>
          {pending.map(reg => (
            <AgentRow
              key={reg.id}
              reg={reg}
              latestVersion={latestVersion?.version}
              onApprove={setApproveTarget}
              onQuickApprove={r => quickApproveMutation.mutate(r)}
              onDelete={id => deleteMutation.mutate(id)}
              onSessionStart={(s, h) => setActiveSession({ session: s, hostname: h })}
            />
          ))}
        </section>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Aktywne ({active.length})
          </h2>
          {active.map(reg => (
            <AgentRow
              key={reg.id}
              reg={reg}
              latestVersion={latestVersion?.version}
              onApprove={setApproveTarget}
              onQuickApprove={r => quickApproveMutation.mutate(r)}
              onDelete={id => deleteMutation.mutate(id)}
              onSessionStart={(s, h) => setActiveSession({ session: s, hostname: h })}
            />
          ))}
        </section>
      )}

      {!isLoading && registrations.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Monitor className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Brak agentów</p>
          <p className="text-sm mt-1">Zainstaluj aplikację na komputerach klientów, aby monitorować sprzęt.</p>
        </div>
      )}

      {approveTarget && (
        <ApproveModal reg={approveTarget} onClose={() => setApproveTarget(null)} />
      )}

      {activeSession && (
        <FloatingSessionTimer
          session={activeSession.session}
          hostname={activeSession.hostname}
          onEnded={() => setActiveSession(null)}
        />
      )}
    </div>
  );
}
