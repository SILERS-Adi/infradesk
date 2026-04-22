import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus, Search, Server as ServerIcon, Monitor, Router, HardDrive, Printer, Camera,
  Smartphone, X, Loader2, QrCode,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface Device {
  id: string;
  name: string;
  hostname: string | null;
  category: string;
  criticality: string;
  status: string;
  ipAddress: string | null;
  macAddress: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  qrCodeValue: string;
  location: { id: string; name: string; city: string | null };
}

const CATEGORY_META: Record<string, { label: string; icon: typeof ServerIcon }> = {
  WORKSTATION: { label: 'Komputer', icon: Monitor },
  SERVER:      { label: 'Serwer',   icon: ServerIcon },
  ROUTER:      { label: 'Router',   icon: Router },
  SWITCH:      { label: 'Switch',   icon: Router },
  FIREWALL:    { label: 'Firewall', icon: Router },
  PRINTER:     { label: 'Drukarka', icon: Printer },
  SCANNER:     { label: 'Skaner',   icon: Printer },
  CCTV:        { label: 'Kamera',   icon: Camera },
  PHONE:       { label: 'Telefon',  icon: Smartphone },
  IOT:         { label: 'IoT',      icon: HardDrive },
  OTHER:       { label: 'Inne',     icon: HardDrive },
};

interface Location { id: string; name: string; city: string | null }

export function DevicesPage() {
  const [view, setView] = useViewPreference('devices', 'visual');
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [qrDevice, setQrDevice] = useState<Device | null>(null);

  const { data, isLoading } = useQuery<{ devices: Device[] }>({
    queryKey: ['devices', search, locationFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (locationFilter) params.locationId = locationFilter;
      return (await api.get('/devices', { params })).data;
    },
  });

  const { data: locs } = useQuery<{ locations: Location[] }>({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });

  const devices = data?.devices ?? [];

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Urządzenia</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {devices.length > 0 ? `${devices.length} ${devices.length === 1 ? 'urządzenie' : 'urządzeń'}` : 'Brak urządzeń'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Dodaj</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" style={{ width: 14, height: 14 }} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Szukaj po nazwie, hostname, IP, SN…" />
        </div>
        <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="max-w-xs">
          <option value="">Wszystkie lokalizacje</option>
          {(locs?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : devices.length === 0 ? (
        <Card className="p-10 text-center">
          <ServerIcon className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak urządzeń</p>
          <p className="text-[13px] text-tx3 mb-4">Dodaj pierwsze urządzenie albo zatwierdź agenta (który je auto-doda).</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Dodaj urządzenie</Button>
        </Card>
      ) : view === 'visual' ? (
        <DevicesGrid devices={devices} onQr={setQrDevice} />
      ) : (
        <DevicesTable devices={devices} onQr={setQrDevice} />
      )}

      {showCreate && <CreateDeviceModal locations={locs?.locations ?? []} onClose={() => setShowCreate(false)} />}
      {qrDevice && <QrCodeDialog device={qrDevice} onClose={() => setQrDevice(null)} />}
    </div>
  );
}

function DevicesGrid({ devices, onQr }: { devices: Device[]; onQr: (d: Device) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {devices.map((d) => {
        const meta = CATEGORY_META[d.category] ?? CATEGORY_META.OTHER!;
        const isActive = d.status === 'ACTIVE';
        return (
          <Card key={d.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center"
                  style={{ background: isActive ? 'var(--ok-l)' : 'var(--sf-h)' }}
                >
                  <meta.icon style={{ width: 18, height: 18, color: isActive ? 'var(--ok)' : 'var(--tx3)' }} />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-tx">{d.name}</h3>
                  {d.hostname && <p className="text-[11px] text-tx3 font-mono">{d.hostname}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onQr(d)}
                className="p-1.5 rounded-[6px] text-tx3 hover:text-pri hover:bg-sf-h press"
                title="QR kod"
              >
                <QrCode className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant="neutral">{meta.label}</Badge>
              <PriorityDot priority={d.criticality} withLabel />
              <Badge variant={d.status === 'ACTIVE' ? 'success' : d.status === 'DECOMMISSIONED' ? 'danger' : 'neutral'}>
                {d.status === 'ACTIVE' ? 'Aktywne' : d.status === 'INACTIVE' ? 'Nieaktywne' : 'Wycofane'}
              </Badge>
            </div>
            <div className="text-[11px] text-tx3 space-y-0.5">
              {d.location && <p>📍 {d.location.name}{d.location.city && ` · ${d.location.city}`}</p>}
              {d.ipAddress && <p className="font-mono">IP: {d.ipAddress}</p>}
              {d.operatingSystem && <p>{d.operatingSystem} {d.osVersion ?? ''}</p>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DevicesTable({ devices, onQr }: { devices: Device[]; onQr: (d: Device) => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
          <tr>
            <th className="px-4 py-2.5 font-bold">Nazwa</th>
            <th className="px-4 py-2.5 font-bold">Hostname</th>
            <th className="px-4 py-2.5 font-bold">Kategoria</th>
            <th className="px-4 py-2.5 font-bold">Priorytet</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
            <th className="px-4 py-2.5 font-bold">IP</th>
            <th className="px-4 py-2.5 font-bold">OS</th>
            <th className="px-4 py-2.5 font-bold">Lokalizacja</th>
            <th className="px-4 py-2.5 font-bold"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {devices.map((d) => (
            <tr key={d.id} className="hover:bg-sf-h">
              <td className="px-4 py-3 text-tx font-medium">{d.name}</td>
              <td className="px-4 py-3 text-tx3 font-mono text-[11px]">{d.hostname ?? '—'}</td>
              <td className="px-4 py-3 text-tx2">{CATEGORY_META[d.category]?.label ?? d.category}</td>
              <td className="px-4 py-3"><PriorityDot priority={d.criticality} withLabel /></td>
              <td className="px-4 py-3"><Badge variant={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status}</Badge></td>
              <td className="px-4 py-3 text-tx3 font-mono text-[11px]">{d.ipAddress ?? '—'}</td>
              <td className="px-4 py-3 text-tx3 text-[11px]">{d.operatingSystem ?? '—'}</td>
              <td className="px-4 py-3 text-tx3">{d.location?.name ?? '—'}</td>
              <td className="px-4 py-3">
                <button onClick={() => onQr(d)} className="text-tx3 hover:text-pri press"><QrCode className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const deviceSchema = z.object({
  name: z.string().min(1, 'Nazwa wymagana'),
  locationId: z.string().uuid('Wybierz lokalizację'),
  hostname: z.string().optional(),
  category: z.enum(['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER']),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  serialNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  operatingSystem: z.string().optional(),
  description: z.string().optional(),
});
type DForm = z.infer<typeof deviceSchema>;

function CreateDeviceModal({ locations, onClose }: { locations: Location[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<DForm>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { category: 'WORKSTATION', criticality: 'MEDIUM' },
  });

  const mutation = useMutation({
    mutationFn: async (data: DForm) => (await api.post('/devices', data)).data,
    onSuccess: () => { toast.success('Urządzenie dodane'); qc.invalidateQueries({ queryKey: ['devices'] }); onClose(); },
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
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowe urządzenie</Dialog.Title>
            <Dialog.Close asChild><button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
                <Input {...register('name')} placeholder="np. srv-prod-01" />
                {errors.name && <p className="text-[11px] text-er mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Hostname</label>
                <Input {...register('hostname')} placeholder="LAPTOP-ANNA-K" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Lokalizacja *</label>
              <Select {...register('locationId')}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} {l.city && `(${l.city})`}</option>)}
              </Select>
              {errors.locationId && <p className="text-[11px] text-er mt-1">{errors.locationId.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Kategoria</label>
                <Select {...register('category')}>
                  {Object.entries(CATEGORY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Producent</label>
                <Input {...register('manufacturer')} placeholder="Dell" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Model</label>
                <Input {...register('model')} placeholder="Latitude 5530" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Serial</label>
                <Input {...register('serialNumber')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">IP</label>
                <Input {...register('ipAddress')} placeholder="192.168.1.10" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">MAC</label>
                <Input {...register('macAddress')} placeholder="AA:BB:CC:DD:EE:FF" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">System</label>
              <Input {...register('operatingSystem')} placeholder="Windows 11 Pro" />
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

function QrCodeDialog({ device, onClose }: { device: Device; onClose: () => void }) {
  // Generate QR as SVG URL via public API (Google Charts-free alt). For alpha we use img with google chart fallback.
  const qrValue = `https://v2.infradesk.pl/qr/${device.qrCodeValue}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrValue)}`;
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">{device.name}</Dialog.Title>
            <Dialog.Close asChild><button className="p-1.5 rounded-[6px] text-tx3 hover:bg-sf-h press"><X className="h-3.5 w-3.5" /></button></Dialog.Close>
          </div>
          <div className="p-6 text-center">
            <img src={qrUrl} alt="QR" className="mx-auto rounded-[var(--r-s)] border border-bd" />
            <p className="text-[11px] font-mono text-tx3 mt-3">{device.qrCodeValue}</p>
            <p className="text-[11px] text-tx3 mt-2">Wydrukuj i przyklej do urządzenia — skan otworzy szczegóły.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
