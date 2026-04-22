import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, MapPin, Phone, Mail, X, Loader2, Warehouse, Store, Home } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface Location {
  id: string;
  name: string;
  type: 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'HOME_OFFICE' | 'OTHER';
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  country: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  geofenceRadiusMeters: number;
  autoCheckInEnabled: boolean;
  requireQrConfirmation: boolean;
}

const TYPE_META: Record<string, { label: string; icon: typeof MapPin; color: string }> = {
  OFFICE:      { label: 'Biuro',     icon: MapPin,    color: 'var(--pri)' },
  WAREHOUSE:   { label: 'Magazyn',   icon: Warehouse, color: 'var(--wn)' },
  RETAIL:      { label: 'Sklep',     icon: Store,     color: 'var(--in)' },
  HOME_OFFICE: { label: 'Home office', icon: Home,    color: 'var(--ok)' },
  OTHER:       { label: 'Inne',      icon: MapPin,    color: 'var(--tx3)' },
};

export function LocationsPage() {
  const [view, setView] = useViewPreference('locations', 'visual');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ locations: Location[] }>({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });

  const locations = data?.locations ?? [];

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Lokalizacje</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {locations.length > 0 ? `${locations.length} ${locations.length === 1 ? 'lokalizacja' : 'lokalizacji'}` : 'Brak lokalizacji'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Dodaj</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : locations.length === 0 ? (
        <Card className="p-10 text-center">
          <MapPin className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak lokalizacji</p>
          <p className="text-[13px] text-tx3 mb-4">Dodaj pierwszy oddział, biuro albo magazyn. Geofence pozwala automatyczne uruchamiać sesje pracy.</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Dodaj pierwszą lokalizację</Button>
        </Card>
      ) : view === 'visual' ? (
        <LocationsGrid locations={locations} />
      ) : (
        <LocationsTable locations={locations} />
      )}

      {showCreate && <CreateLocationModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function LocationsGrid({ locations }: { locations: Location[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {locations.map((l) => {
        const meta = TYPE_META[l.type] ?? TYPE_META.OTHER!;
        return (
          <Card key={l.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center"
                  style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                >
                  <meta.icon style={{ width: 18, height: 18, color: meta.color }} />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-tx">{l.name}</h3>
                  <p className="text-[11px] text-tx3">{meta.label}</p>
                </div>
              </div>
              {l.gpsLat && l.gpsLon && l.autoCheckInEnabled && (
                <Badge variant="success" className="text-[9px]">Geofence {l.geofenceRadiusMeters}m</Badge>
              )}
            </div>
            <div className="space-y-1 text-[12px] text-tx2">
              <p>{l.addressLine1}</p>
              {l.addressLine2 && <p>{l.addressLine2}</p>}
              <p className="text-tx3">{l.postalCode} {l.city}, {l.country}</p>
            </div>
            {l.contactName && (
              <div className="mt-3 pt-3 border-t border-bd text-[11px] text-tx3 space-y-1">
                <p className="text-tx">{l.contactName}</p>
                {l.contactPhone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {l.contactPhone}</p>}
                {l.contactEmail && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {l.contactEmail}</p>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function LocationsTable({ locations }: { locations: Location[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
          <tr>
            <th className="px-4 py-2.5 font-bold">Nazwa</th>
            <th className="px-4 py-2.5 font-bold">Typ</th>
            <th className="px-4 py-2.5 font-bold">Adres</th>
            <th className="px-4 py-2.5 font-bold">Miasto</th>
            <th className="px-4 py-2.5 font-bold">Kontakt</th>
            <th className="px-4 py-2.5 font-bold">GPS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {locations.map((l) => (
            <tr key={l.id} className="hover:bg-sf-h">
              <td className="px-4 py-3 text-tx font-medium">{l.name}</td>
              <td className="px-4 py-3"><Badge variant="neutral">{TYPE_META[l.type]?.label ?? l.type}</Badge></td>
              <td className="px-4 py-3 text-tx2">{l.addressLine1}</td>
              <td className="px-4 py-3 text-tx3">{l.postalCode} {l.city}</td>
              <td className="px-4 py-3 text-tx3">{l.contactName ?? '—'}</td>
              <td className="px-4 py-3">
                {l.gpsLat && l.gpsLon ? <Badge variant="success" className="text-[9px]">✓ {l.geofenceRadiusMeters}m</Badge> : <span className="text-tx3">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const schema = z.object({
  name: z.string().min(1, 'Nazwa wymagana').max(120),
  type: z.enum(['OFFICE', 'WAREHOUSE', 'RETAIL', 'HOME_OFFICE', 'OTHER']).default('OFFICE'),
  addressLine1: z.string().min(1, 'Adres wymagany'),
  addressLine2: z.string().optional(),
  postalCode: z.string().min(1, 'Kod wymagany'),
  city: z.string().min(1, 'Miasto wymagane'),
  country: z.string().length(2).default('PL'),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  gpsLat: z.coerce.number().min(-90).max(90).optional(),
  gpsLon: z.coerce.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.coerce.number().int().min(10).max(5000).default(100),
  autoCheckInEnabled: z.boolean().default(true),
  requireQrConfirmation: z.boolean().default(false),
});
type Form = z.infer<typeof schema>;

function CreateLocationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'OFFICE', country: 'PL', geofenceRadiusMeters: 100, autoCheckInEnabled: true, requireQrConfirmation: false },
  });

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      const payload: Record<string, unknown> = { ...data };
      if (!data.contactEmail) delete payload.contactEmail;
      return (await api.post('/locations', payload)).data;
    },
    onSuccess: () => { toast.success('Lokalizacja dodana'); qc.invalidateQueries({ queryKey: ['locations'] }); onClose(); },
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
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowa lokalizacja</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
                <Input {...register('name')} placeholder="np. Biuro główne, Magazyn Osmolice" />
                {errors.name && <p className="text-[11px] text-er mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Typ</label>
                <Select {...register('type')}>
                  <option value="OFFICE">Biuro</option>
                  <option value="WAREHOUSE">Magazyn</option>
                  <option value="RETAIL">Sklep</option>
                  <option value="HOME_OFFICE">Home office</option>
                  <option value="OTHER">Inne</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Adres *</label>
              <Input {...register('addressLine1')} placeholder="ul. Przykładowa 10" />
              {errors.addressLine1 && <p className="text-[11px] text-er mt-1">{errors.addressLine1.message}</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Kod *</label>
                <Input {...register('postalCode')} placeholder="00-001" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Miasto *</label>
                <Input {...register('city')} placeholder="Warszawa" />
              </div>
            </div>

            <div className="border-t border-bd pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-3">Kontakt na miejscu</h3>
              <div className="space-y-3">
                <Input {...register('contactName')} placeholder="Imię i nazwisko" />
                <div className="grid grid-cols-2 gap-3">
                  <Input {...register('contactPhone')} placeholder="Telefon" />
                  <Input type="email" {...register('contactEmail')} placeholder="Email" />
                </div>
              </div>
            </div>

            <div className="border-t border-bd pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-3">GPS + Geofence (dla automatycznych sesji)</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Szerokość GPS (lat)</label>
                  <Input type="number" step="0.000001" {...register('gpsLat')} placeholder="52.229676" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Długość GPS (lon)</label>
                  <Input type="number" step="0.000001" {...register('gpsLon')} placeholder="21.012229" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Promień geofence (metry)</label>
                <Input type="number" {...register('geofenceRadiusMeters')} />
              </div>
              <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer mt-3">
                <input type="checkbox" {...register('autoCheckInEnabled')} className="accent-[color:var(--pri)]" />
                Auto-rozpoczęcie sesji gdy technik wjedzie w promień
              </label>
              <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer mt-2">
                <input type="checkbox" {...register('requireQrConfirmation')} className="accent-[color:var(--pri)]" />
                Wymagaj potwierdzenia QR (dla klientów high-security)
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
