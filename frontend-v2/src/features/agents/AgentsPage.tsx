import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Zap, CheckCircle2, XCircle, Clock, Monitor,
  X, Loader2, Wifi, WifiOff,
  Power, RefreshCw, Download, Gauge, Package,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { cn, formatRelativePl } from '@/lib/utils';

interface AgentReg {
  id: string;
  hostname: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'INACTIVE';
  agentVersion: string | null;
  lastSeen: string | null;
  manufacturer: string | null;
  model: string | null;
  osName: string | null;
  osVersion: string | null;
  companyName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  createdAt: string;
  deviceId: string | null;
}

export function AgentsPage() {
  const [tab, setTab] = useState<'PENDING' | 'ACTIVE' | 'INACTIVE'>('PENDING');
  const [approvingAgent, setApprovingAgent] = useState<AgentReg | null>(null);

  const { data, isLoading } = useQuery<{ agents: AgentReg[] }>({
    queryKey: ['agents', tab],
    queryFn: async () => (await api.get('/agents/admin', { params: { status: tab } })).data,
    refetchInterval: 30_000,
  });

  const agents = data?.agents ?? [];
  const now = Date.now();
  const isOnline = (lastSeen: string | null) => lastSeen ? (now - new Date(lastSeen).getTime() < 5 * 60_000) : false;

  return (
    <div className="space-y-5 anim-up">
      <div>
        <h1 className="text-[22px] font-bold text-tx">Asystenci</h1>
        <p className="text-[13px] text-tx2 mt-0.5">Desktop agenty zainstalowane na komputerach klientów</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-bd">
        {([
          { id: 'PENDING', label: 'Oczekujące', icon: Clock },
          { id: 'ACTIVE', label: 'Aktywne', icon: CheckCircle2 },
          { id: 'INACTIVE', label: 'Nieaktywne', icon: WifiOff },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold transition-colors border-b-2',
              tab === t.id ? 'text-tx' : 'text-tx3 hover:text-tx2',
            )}
            style={tab === t.id ? { borderColor: 'var(--pri)' } : { borderColor: 'transparent' }}
          >
            <t.icon className="h-3 w-3" /> {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : agents.length === 0 ? (
        <Card className="p-10 text-center">
          <Zap className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak asystentów w tym stanie</p>
          <p className="text-[13px] text-tx3">
            {tab === 'PENDING' && 'Nowy agent pojawi się tu po zainstalowaniu na komputerze klienta.'}
            {tab === 'ACTIVE' && 'Żadne agenty nie są aktualnie aktywne.'}
            {tab === 'INACTIVE' && 'Brak nieaktywnych agentów.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
          {agents.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center"
                    style={{ background: a.status === 'ACTIVE' ? 'var(--ok-l)' : a.status === 'PENDING' ? 'var(--wn-l)' : 'var(--sf-h)' }}
                  >
                    <Monitor style={{ width: 18, height: 18, color: a.status === 'ACTIVE' ? 'var(--ok)' : a.status === 'PENDING' ? 'var(--wn)' : 'var(--tx3)' }} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-tx">{a.hostname}</h3>
                    <p className="text-[11px] text-tx3">{a.model ?? a.manufacturer ?? 'nieznany'}</p>
                  </div>
                </div>
                {a.status === 'ACTIVE' && (
                  isOnline(a.lastSeen) ? <Badge variant="success"><Wifi className="h-2.5 w-2.5" /> Online</Badge>
                    : <Badge variant="neutral"><WifiOff className="h-2.5 w-2.5" /> Offline</Badge>
                )}
                {a.status === 'PENDING' && <Badge variant="warning">Oczekuje</Badge>}
              </div>
              <div className="text-[11px] text-tx3 space-y-0.5 mb-3">
                {a.osName && <p>{a.osName} {a.osVersion ?? ''}</p>}
                {a.agentVersion && <p>Agent v{a.agentVersion}</p>}
                {a.lastSeen && <p>Ostatnio: {formatRelativePl(a.lastSeen)}</p>}
                {a.status === 'PENDING' && a.companyName && (
                  <p className="pt-2 mt-2 border-t border-bd text-tx2">
                    {a.companyName}{a.contactFirstName && ` · ${a.contactFirstName} ${a.contactLastName}`}
                    {a.contactEmail && <><br /><span className="text-tx3">{a.contactEmail}</span></>}
                  </p>
                )}
              </div>
              {a.status === 'PENDING' && (
                <div className="flex items-center gap-2 pt-3 border-t border-bd">
                  <Button size="sm" variant="success" className="flex-1" onClick={() => setApprovingAgent(a)}>
                    <CheckCircle2 className="h-3 w-3" /> Zatwierdź
                  </Button>
                  <RejectButton id={a.id} />
                </div>
              )}
              {a.status === 'ACTIVE' && a.deviceId && (
                <AgentActionBar agent={a} online={isOnline(a.lastSeen)} />
              )}
            </Card>
          ))}
        </div>
      )}

      {approvingAgent && <ApproveAgentModal agent={approvingAgent} onClose={() => setApprovingAgent(null)} />}
    </div>
  );
}

function RejectButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const reject = useMutation({
    mutationFn: async () => (await api.post(`/agents/admin/${id}/reject`)).data,
    onSuccess: () => { toast.success('Odrzucone'); qc.invalidateQueries({ queryKey: ['agents'] }); },
  });
  return (
    <Button size="sm" variant="danger" onClick={() => reject.mutate()} disabled={reject.isPending} title="Odrzuć">
      <XCircle className="h-3 w-3" />
    </Button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Agent action bar — push commands via V2 WS bridge (wake/reboot/update/...)
// ════════════════════════════════════════════════════════════════════════════

type PushCommandType =
  | 'windows_update' | 'restart_service' | 'system_reboot'
  | 'install_software';

function AgentActionBar({ agent, online }: { agent: AgentReg; online: boolean }) {
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);

  const wake = useMutation({
    mutationFn: async () => (await api.post(`/agents/admin/${agent.id}/wake`)).data,
    onSuccess: (d: { relayAgents: number }) => toast.success(`WoL wysłany (relay: ${d.relayAgents})`),
    onError: (err: unknown) => toast.error(agentErrorText(err)),
  });

  const speedtest = useMutation({
    mutationFn: async () => (await api.post(`/agents/admin/${agent.id}/run-speedtest`)).data,
    onSuccess: (d: { result?: { download_mbps?: number; upload_mbps?: number; ping_ms?: number } }) => {
      const r = d.result;
      if (r?.download_mbps != null) {
        toast.success(`↓ ${r.download_mbps?.toFixed(1)} Mb/s  ↑ ${r.upload_mbps?.toFixed(1)} Mb/s  ${r.ping_ms?.toFixed(0)} ms`);
      } else {
        toast.success('Speedtest zakończony');
      }
    },
    onError: (err: unknown) => toast.error(agentErrorText(err)),
  });

  const push = useMutation({
    mutationFn: async (v: { type: PushCommandType; payload?: Record<string, unknown> }) =>
      (await api.post(`/agents/admin/${agent.id}/push-command`, v)).data,
    onSuccess: (_d, v) => toast.success(`Wysłano: ${v.type}`),
    onError: (err: unknown) => toast.error(agentErrorText(err)),
  });

  const reboot = () => {
    if (!confirm(`Zrestartować ${agent.hostname} za 60s?`)) return;
    push.mutate({ type: 'system_reboot', payload: { delay: 60 } });
  };
  const winUpdate = () => push.mutate({ type: 'windows_update' });

  return (
    <div className="pt-3 border-t border-bd space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="ghost" title="Wake-on-LAN (relay przez inny agent w LAN)"
                onClick={() => wake.mutate()} disabled={wake.isPending}>
          <Power className="h-3 w-3" /> Wake
        </Button>
        <Button size="sm" variant="ghost" title="Speedtest" disabled={!online || speedtest.isPending}
                onClick={() => speedtest.mutate()}>
          {speedtest.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />} Speedtest
        </Button>
        <Button size="sm" variant="ghost" title="Restart komputera" disabled={!online || push.isPending} onClick={reboot}>
          <RefreshCw className="h-3 w-3" /> Reboot
        </Button>
        <Button size="sm" variant="ghost" title="Windows Update" disabled={!online || push.isPending} onClick={winUpdate}>
          <Download className="h-3 w-3" /> Win Update
        </Button>
        <Button size="sm" variant="ghost" title="Restart usługi" disabled={!online || push.isPending}
                onClick={() => setServiceModalOpen(true)}>
          <RefreshCw className="h-3 w-3" /> Usługa…
        </Button>
        <Button size="sm" variant="ghost" title="Zainstaluj program" disabled={!online || push.isPending}
                onClick={() => setInstallModalOpen(true)}>
          <Package className="h-3 w-3" /> Instaluj…
        </Button>
      </div>
      {!online && (
        <p className="text-[10px] text-tx3 italic">Agent offline — akcje wymagające WS są wyłączone (Wake działa)</p>
      )}

      {serviceModalOpen && (
        <SimpleInputModal
          title="Restart usługi Windows"
          label="Nazwa usługi (np. MSSQLSERVER)"
          placeholder="MSSQLSERVER"
          submitLabel="Restart"
          onClose={() => setServiceModalOpen(false)}
          onSubmit={(value) => {
            push.mutate({ type: 'restart_service', payload: { serviceName: value } });
            setServiceModalOpen(false);
          }}
        />
      )}
      {installModalOpen && (
        <SimpleInputModal
          title="Zainstaluj program"
          label="ID pakietu winget (np. Mozilla.Firefox)"
          placeholder="Mozilla.Firefox"
          submitLabel="Instaluj"
          onClose={() => setInstallModalOpen(false)}
          onSubmit={(value) => {
            push.mutate({ type: 'install_software', payload: { package: value } });
            setInstallModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function agentErrorText(err: unknown): string {
  const ax = err as { response?: { data?: { error?: string; message?: string; code?: string }; status?: number } };
  const data = ax.response?.data;
  if (data?.code === 'agent_offline') return 'Agent jest offline';
  if (data?.code === 'agent_timeout') return 'Agent nie odpowiedział w czasie';
  return data?.error ?? data?.message ?? 'Błąd';
}

function SimpleInputModal({
  title, label, placeholder, submitLabel, onClose, onSubmit,
}: {
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-md -translate-x-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
            <Dialog.Title className="text-[16px] font-bold text-tx">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form
            className="px-6 py-5 space-y-4"
            onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
          >
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">{label}</label>
              <Input placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
              <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
              <Button type="submit" variant="primary" disabled={!value.trim()}>{submitLabel}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const approveSchema = z.object({
  deviceName: z.string().min(1, 'Nazwa wymagana'),
  locationId: z.string().uuid('Wybierz lokalizację'),
  category: z.enum(['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER']).default('WORKSTATION'),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});
type AForm = z.infer<typeof approveSchema>;

interface Location { id: string; name: string }

function ApproveAgentModal({ agent, onClose }: { agent: AgentReg; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: locs } = useQuery<{ locations: Location[] }>({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AForm>({
    resolver: zodResolver(approveSchema),
    defaultValues: { deviceName: agent.hostname.toLowerCase(), category: 'WORKSTATION', criticality: 'MEDIUM' },
  });

  const approve = useMutation({
    mutationFn: async (data: AForm) => (await api.post(`/agents/admin/${agent.id}/approve`, data)).data,
    onSuccess: () => { toast.success('Agent zatwierdzony — urządzenie utworzone'); qc.invalidateQueries({ queryKey: ['agents'] }); qc.invalidateQueries({ queryKey: ['devices'] }); onClose(); },
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
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
            <Dialog.Title className="text-[16px] font-bold text-tx">Zatwierdź agenta</Dialog.Title>
            <Dialog.Close asChild><button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <div className="px-6 py-5 space-y-4">
            <Card className="p-3">
              <div className="text-[11px] text-tx3 space-y-0.5">
                <p className="text-tx font-semibold">{agent.hostname}</p>
                <p>{agent.manufacturer ?? '—'} {agent.model ?? ''}</p>
                <p>{agent.osName ?? '—'} {agent.osVersion ?? ''}</p>
                {agent.companyName && <p className="pt-1 mt-1 border-t border-bd">{agent.companyName}</p>}
              </div>
            </Card>

            <form className="space-y-4" onSubmit={handleSubmit((d) => approve.mutate(d))}>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa urządzenia *</label>
                <Input {...register('deviceName')} />
                {errors.deviceName && <p className="text-[11px] text-er mt-1">{errors.deviceName.message}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Lokalizacja *</label>
                <Select {...register('locationId')}>
                  <option value="">—</option>
                  {(locs?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
                {errors.locationId && <p className="text-[11px] text-er mt-1">{errors.locationId.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Kategoria</label>
                  <Select {...register('category')}>
                    <option value="WORKSTATION">Komputer</option>
                    <option value="SERVER">Serwer</option>
                    <option value="PRINTER">Drukarka</option>
                    <option value="OTHER">Inne</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Priorytet</label>
                  <Select {...register('criticality')}>
                    <option value="LOW">Niski</option>
                    <option value="MEDIUM">Średni</option>
                    <option value="HIGH">Wysoki</option>
                    <option value="CRITICAL">Krytyczny</option>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
                <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                <Button type="submit" variant="success" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Zatwierdź</>}
                </Button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
