import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X, ChevronLeft, ChevronRight, Wrench, Package, Phone as PhoneIcon, Plus,
  Check, Loader2, Building2, MapPin, Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const MODAL_SHELL: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 50,
  width: 'min(96vw, 44rem)',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--sf)',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--r-xl)',
  boxShadow: 'var(--sh4)',
  overflow: 'hidden',
};
const MODAL_BODY: React.CSSProperties = { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '20px 24px' };

interface ClientRow {
  relationId: string;
  client: { id: string; name: string; slug: string; isActive: boolean };
}
interface LocationRow { id: string; name: string; city: string | null; clientWorkspaceId?: string | null }
interface DeviceRow { id: string; name: string; hostname: string | null; location: { id: string; name: string } | null }
interface MemberRow {
  id: string; role: string; status: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

interface OrderItem { name: string; description?: string; quantity: number; unitNet: number }
type CrmType = 'PHONE' | 'MEETING' | 'EMAIL' | 'QUOTE';
interface CrmAct {
  type: CrmType;
  title?: string;
  notes?: string;
  scheduledAt?: string;
  followUpRequired: boolean;
  followUpAt?: string;
  billable: boolean;
  quoteValueNet?: number;
}

export function NewTicketModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);

  // Etap 1 — klient + lokalizacja
  const [clientWorkspaceId, setClientWorkspaceId] = useState('');
  const [locationId, setLocationId] = useState('');

  // Master fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [dueAt, setDueAt] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');

  // Komponenty
  const [enableService, setEnableService] = useState(true);
  const [enableOrder, setEnableOrder] = useState(false);
  const [enableCrm, setEnableCrm] = useState(false);

  // Service fields
  const [serviceMode, setServiceMode] = useState<'ONSITE' | 'REMOTE'>('ONSITE');
  const [deviceId, setDeviceId] = useState('');
  const [freeTextSubject, setFreeTextSubject] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');

  // Order fields
  const [orderItems, setOrderItems] = useState<OrderItem[]>([{ name: '', quantity: 1, unitNet: 0 }]);
  const [orderSupplier, setOrderSupplier] = useState('');
  const [orderExpected, setOrderExpected] = useState('');

  // CRM fields — multi-select typ z własnymi polami
  const [crmActs, setCrmActs] = useState<Record<CrmType, CrmAct | null>>({
    PHONE: null, MEETING: null, EMAIL: null, QUOTE: null,
  });

  const clientsQ = useQuery<{ clients: ClientRow[] }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
    staleTime: 60_000,
  });
  const locationsQ = useQuery<{ locations: LocationRow[] }>({
    queryKey: ['locations', 'list'],
    queryFn: async () => (await api.get('/locations')).data,
    staleTime: 60_000,
  });
  const devicesQ = useQuery<{ devices: DeviceRow[] }>({
    queryKey: ['devices', 'list'],
    queryFn: async () => (await api.get('/devices')).data,
    staleTime: 60_000,
  });
  const membersQ = useQuery<{ memberships: MemberRow[] }>({
    queryKey: ['memberships'],
    queryFn: async () => (await api.get('/memberships')).data,
    staleTime: 60_000,
  });

  const clients = clientsQ.data?.clients ?? [];
  const locations = locationsQ.data?.locations ?? [];
  const devices = devicesQ.data?.devices ?? [];
  const members = (membersQ.data?.memberships ?? []).filter((m) => m.status === 'ACTIVE');

  // Filtruj lokalizacje po kliencie (jeśli backend serwuje clientWorkspaceId — inaczej pokaż wszystkie)
  const filteredLocations = useMemo(() => {
    if (!clientWorkspaceId) return locations;
    const withCw = locations.filter((l) => l.clientWorkspaceId === clientWorkspaceId);
    return withCw.length > 0 ? withCw : locations;
  }, [locations, clientWorkspaceId]);

  // Urządzenia filtrowane przez lokalizację (jeśli wybrana)
  const filteredDevices = useMemo(() => {
    if (!locationId) return devices;
    return devices.filter((d) => d.location?.id === locationId);
  }, [devices, locationId]);

  const canGoNext = !!clientWorkspaceId || clients.length === 0;

  function addOrderItem() {
    setOrderItems([...orderItems, { name: '', quantity: 1, unitNet: 0 }]);
  }
  function updateOrderItem(i: number, patch: Partial<OrderItem>) {
    setOrderItems(orderItems.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  function removeOrderItem(i: number) {
    setOrderItems(orderItems.filter((_, idx) => idx !== i));
  }

  function toggleCrm(type: CrmType) {
    setCrmActs((prev) => ({
      ...prev,
      [type]: prev[type] ? null : {
        type,
        followUpRequired: false,
        billable: type === 'QUOTE' ? true : false,
      },
    }));
  }
  function updateCrm(type: CrmType, patch: Partial<CrmAct>) {
    setCrmActs((prev) => {
      const existing = prev[type];
      if (!existing) return prev;
      return { ...prev, [type]: { ...existing, ...patch } };
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const components: Record<string, unknown> = {};
      if (enableService) {
        components.service = {
          serviceMode,
          deviceId: deviceId || undefined,
          freeTextSubject: freeTextSubject || undefined,
          assignedToUserId: assignedToUserId || undefined,
        };
      }
      if (enableOrder) {
        const items = orderItems.filter((it) => it.name.trim().length > 0);
        if (items.length === 0) throw new Error('Dodaj co najmniej jedną pozycję zamówienia');
        components.order = {
          items,
          supplierName: orderSupplier || undefined,
          expectedDeliveryDate: orderExpected ? new Date(orderExpected).toISOString() : undefined,
        };
      }
      if (enableCrm) {
        const activities = Object.values(crmActs).filter((a): a is CrmAct => a !== null).map((a) => ({
          ...a,
          scheduledAt: a.scheduledAt ? new Date(a.scheduledAt).toISOString() : undefined,
          followUpAt: a.followUpAt ? new Date(a.followUpAt).toISOString() : undefined,
        }));
        if (activities.length === 0) throw new Error('Wybierz co najmniej jedną aktywność CRM');
        components.crm = { activities };
      }
      if (!enableService && !enableOrder && !enableCrm) {
        throw new Error('Wybierz przynajmniej jeden typ zgłoszenia');
      }

      const payload = {
        clientWorkspaceId: clientWorkspaceId || undefined,
        locationId: locationId || undefined,
        title,
        description,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        source: 'MANUAL',
        requesterName: requesterName || undefined,
        requesterEmail: requesterEmail || undefined,
        requesterPhone: requesterPhone || undefined,
        components,
      };
      return (await api.post('/tickets', payload)).data;
    },
    onSuccess: () => {
      toast.success('Zgłoszenie utworzone');
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Błąd';
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? msg);
    },
  });

  const canSubmit = title.length >= 3 && description.length > 0 && (enableService || enableOrder || enableCrm);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL}>
          <div className="flex items-center justify-between border-b border-bd px-6 py-4" style={{ flexShrink: 0 }}>
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              Nowe zgłoszenie
              <span className="text-[11px] text-tx3 font-normal">krok {step}/2</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>

          {/* Step indicator */}
          <div className="px-6 py-3 border-b border-bd bg-sf-h flex items-center gap-3" style={{ flexShrink: 0 }}>
            <StepDot n={1} active={step === 1} done={step > 1} label="Klient i lokalizacja" />
            <div className="flex-1 h-px bg-bd" />
            <StepDot n={2} active={step === 2} done={false} label="Czego dotyczy" />
          </div>

          <div style={MODAL_BODY}>
            {step === 1 && (
              <Step1
                clients={clients}
                locations={filteredLocations}
                clientWorkspaceId={clientWorkspaceId}
                setClientWorkspaceId={setClientWorkspaceId}
                locationId={locationId}
                setLocationId={setLocationId}
              />
            )}
            {step === 2 && (
              <Step2
                title={title} setTitle={setTitle}
                description={description} setDescription={setDescription}
                priority={priority} setPriority={setPriority}
                dueAt={dueAt} setDueAt={setDueAt}
                requesterName={requesterName} setRequesterName={setRequesterName}
                requesterEmail={requesterEmail} setRequesterEmail={setRequesterEmail}
                requesterPhone={requesterPhone} setRequesterPhone={setRequesterPhone}
                enableService={enableService} setEnableService={setEnableService}
                enableOrder={enableOrder} setEnableOrder={setEnableOrder}
                enableCrm={enableCrm} setEnableCrm={setEnableCrm}
                serviceMode={serviceMode} setServiceMode={setServiceMode}
                deviceId={deviceId} setDeviceId={setDeviceId}
                freeTextSubject={freeTextSubject} setFreeTextSubject={setFreeTextSubject}
                assignedToUserId={assignedToUserId} setAssignedToUserId={setAssignedToUserId}
                devices={filteredDevices}
                members={members}
                orderItems={orderItems}
                addOrderItem={addOrderItem}
                updateOrderItem={updateOrderItem}
                removeOrderItem={removeOrderItem}
                orderSupplier={orderSupplier} setOrderSupplier={setOrderSupplier}
                orderExpected={orderExpected} setOrderExpected={setOrderExpected}
                crmActs={crmActs}
                toggleCrm={toggleCrm}
                updateCrm={updateCrm}
              />
            )}
          </div>

          <div className="px-6 py-3 border-t border-bd flex items-center justify-between gap-2 bg-sf-h" style={{ flexShrink: 0 }}>
            {step === 1 ? (
              <>
                <Button variant="ghost" onClick={onClose}>Anuluj</Button>
                <Button onClick={() => setStep(2)} disabled={!canGoNext}>
                  Dalej <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4" /> Wstecz
                </Button>
                <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
                  {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Tworzenie…</> : <>Utwórz zgłoszenie <Check className="h-4 w-4" /></>}
                </Button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
        style={{
          background: done ? 'var(--ok)' : active ? 'var(--pri)' : 'var(--sf2)',
          color: done || active ? '#fff' : 'var(--tx3)',
          border: active ? '2px solid var(--pri)' : '1px solid var(--bd)',
        }}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </div>
      <span className={`text-[12px] ${active ? 'text-tx font-medium' : 'text-tx3'}`}>{label}</span>
    </div>
  );
}

function Step1({
  clients, locations, clientWorkspaceId, setClientWorkspaceId, locationId, setLocationId,
}: {
  clients: ClientRow[]; locations: LocationRow[];
  clientWorkspaceId: string; setClientWorkspaceId: (v: string) => void;
  locationId: string; setLocationId: (v: string) => void;
}) {
  const activeClients = clients.filter((c) => c.client.isActive);
  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 block mb-2 flex items-center gap-2">
          <Building2 className="h-3 w-3" /> Klient *
        </label>
        <select
          value={clientWorkspaceId}
          onChange={(e) => { setClientWorkspaceId(e.target.value); setLocationId(''); }}
          className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
        >
          <option value="">— wybierz klienta —</option>
          {activeClients.map((c) => (
            <option key={c.client.id} value={c.client.id}>{c.client.name} ({c.client.slug}.infradesk.pl)</option>
          ))}
        </select>
        {activeClients.length === 0 && (
          <p className="text-[11px] text-tx3 mt-2">
            Brak klientów. Dodaj pierwszego w zakładce Klienci → Firmy klientów.
          </p>
        )}
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 block mb-2 flex items-center gap-2">
          <MapPin className="h-3 w-3" /> Lokalizacja
        </label>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
        >
          <option value="">— dowolna / nie dotyczy —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}{l.city ? `, ${l.city}` : ''}</option>
          ))}
        </select>
        <p className="text-[11px] text-tx3 mt-2">
          Lokalizacja służy do filtrowania urządzeń w kolejnym kroku.
        </p>
      </div>
    </div>
  );
}

function Step2(props: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; setPriority: (v: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') => void;
  dueAt: string; setDueAt: (v: string) => void;
  requesterName: string; setRequesterName: (v: string) => void;
  requesterEmail: string; setRequesterEmail: (v: string) => void;
  requesterPhone: string; setRequesterPhone: (v: string) => void;
  enableService: boolean; setEnableService: (v: boolean) => void;
  enableOrder: boolean; setEnableOrder: (v: boolean) => void;
  enableCrm: boolean; setEnableCrm: (v: boolean) => void;
  serviceMode: 'ONSITE' | 'REMOTE'; setServiceMode: (v: 'ONSITE' | 'REMOTE') => void;
  deviceId: string; setDeviceId: (v: string) => void;
  freeTextSubject: string; setFreeTextSubject: (v: string) => void;
  assignedToUserId: string; setAssignedToUserId: (v: string) => void;
  devices: DeviceRow[]; members: MemberRow[];
  orderItems: OrderItem[];
  addOrderItem: () => void;
  updateOrderItem: (i: number, patch: Partial<OrderItem>) => void;
  removeOrderItem: (i: number) => void;
  orderSupplier: string; setOrderSupplier: (v: string) => void;
  orderExpected: string; setOrderExpected: (v: string) => void;
  crmActs: Record<CrmType, CrmAct | null>;
  toggleCrm: (t: CrmType) => void;
  updateCrm: (t: CrmType, patch: Partial<CrmAct>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-1">Tytuł *</label>
        <Input placeholder="np. Drukarka nie drukuje / Zamówienie SSD / Telefon ws. umowy" value={props.title} onChange={(e) => props.setTitle(e.target.value)} />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-1">Opis *</label>
        <textarea
          rows={3}
          className="w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[13px] text-tx placeholder:text-tx3"
          placeholder="Co się dzieje? Co trzeba zrobić?"
          value={props.description} onChange={(e) => props.setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Priorytet</label>
          <select value={props.priority} onChange={(e) => props.setPriority(e.target.value as typeof props.priority)}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
            <option value="LOW">Niski</option>
            <option value="MEDIUM">Średni</option>
            <option value="HIGH">Wysoki</option>
            <option value="CRITICAL">Krytyczny</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Termin</label>
          <Input type="datetime-local" value={props.dueAt} onChange={(e) => props.setDueAt(e.target.value)} />
        </div>
      </div>

      {/* 3 KARTY komponentów */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2">Czego dotyczy zgłoszenie? (można wybrać kilka)</div>
        <div className="space-y-2">
          <ComponentCard
            icon={Wrench}
            title="Usługa serwisowa"
            desc="Zgłoszenie serwisowe, incydent, naprawa"
            color="var(--pri)"
            enabled={props.enableService}
            onToggle={() => props.setEnableService(!props.enableService)}
          >
            {props.enableService && (
              <ServiceFields {...props} />
            )}
          </ComponentCard>

          <ComponentCard
            icon={Package}
            title="Towar / Zamówienie"
            desc="Zamówienie sprzętu, wycena, zakup"
            color="var(--in)"
            enabled={props.enableOrder}
            onToggle={() => props.setEnableOrder(!props.enableOrder)}
          >
            {props.enableOrder && <OrderFields {...props} />}
          </ComponentCard>

          <ComponentCard
            icon={PhoneIcon}
            title="CRM"
            desc="Telefon, spotkanie, e-mail, oferta"
            color="var(--wn)"
            enabled={props.enableCrm}
            onToggle={() => props.setEnableCrm(!props.enableCrm)}
          >
            {props.enableCrm && <CrmFields crmActs={props.crmActs} toggleCrm={props.toggleCrm} updateCrm={props.updateCrm} />}
          </ComponentCard>
        </div>
      </div>

      {/* Zgłaszający */}
      <details className="border-t border-bd pt-4">
        <summary className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 cursor-pointer select-none">
          Zgłaszający (opcjonalne — gdy kontakt nie ma konta)
        </summary>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Imię i nazwisko</label>
            <Input value={props.requesterName} onChange={(e) => props.setRequesterName(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Email</label>
            <Input type="email" value={props.requesterEmail} onChange={(e) => props.setRequesterEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Telefon</label>
            <Input value={props.requesterPhone} onChange={(e) => props.setRequesterPhone(e.target.value)} />
          </div>
        </div>
      </details>
    </div>
  );
}

function ComponentCard({
  icon: Icon, title, desc, color, enabled, onToggle, children,
}: {
  icon: typeof Wrench; title: string; desc: string; color: string;
  enabled: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--r-s)] border overflow-hidden"
      style={{
        borderColor: enabled ? color : 'var(--bd)',
        background: enabled ? `color-mix(in srgb, ${color} 6%, transparent)` : 'transparent',
      }}
    >
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 p-3 text-left">
        <div
          className="w-6 h-6 rounded-[4px] flex items-center justify-center shrink-0"
          style={{
            background: enabled ? color : 'transparent',
            border: `1.5px solid ${enabled ? color : 'var(--bd)'}`,
          }}
        >
          {enabled && <Check className="h-3.5 w-3.5 text-white" />}
        </div>
        <div
          className="w-8 h-8 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-tx">{title}</div>
          <div className="text-[11px] text-tx3">{desc}</div>
        </div>
      </button>
      {children && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: color }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ServiceFields(p: {
  serviceMode: 'ONSITE' | 'REMOTE'; setServiceMode: (v: 'ONSITE' | 'REMOTE') => void;
  deviceId: string; setDeviceId: (v: string) => void;
  freeTextSubject: string; setFreeTextSubject: (v: string) => void;
  assignedToUserId: string; setAssignedToUserId: (v: string) => void;
  devices: DeviceRow[]; members: MemberRow[];
}) {
  return (
    <>
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-1">Typ serwisu</label>
        <div className="grid grid-cols-2 gap-2">
          {(['ONSITE', 'REMOTE'] as const).map((m) => (
            <button key={m} type="button"
              onClick={() => p.setServiceMode(m)}
              className="p-2 rounded-[var(--r-s)] border text-[12px] text-center"
              style={{
                borderColor: p.serviceMode === m ? 'var(--pri)' : 'var(--bd)',
                background: p.serviceMode === m ? 'var(--pri-l)' : 'transparent',
                color: p.serviceMode === m ? 'var(--pri)' : 'var(--tx2)',
              }}
            >
              {m === 'ONSITE' ? 'Serwis u klienta' : 'Serwis zdalny'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Urządzenie</label>
          <select value={p.deviceId} onChange={(e) => p.setDeviceId(e.target.value)}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
            <option value="">— nie dotyczy urządzenia —</option>
            {p.devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.hostname ? ` (${d.hostname})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Przypisz do technika</label>
          <select value={p.assignedToUserId} onChange={(e) => p.setAssignedToUserId(e.target.value)}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
            <option value="">— nie przypisuj (zostanie w Nowych) —</option>
            {p.members.map((m) => {
              const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email;
              return <option key={m.user.id} value={m.user.id}>{name}</option>;
            })}
          </select>
        </div>
      </div>
      {!p.deviceId && (
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">
            Czego dotyczy (gdy brak urządzenia na liście)
          </label>
          <Input
            placeholder="np. Kamera IP przy wejściu od tyłu, 3. piętro"
            value={p.freeTextSubject}
            onChange={(e) => p.setFreeTextSubject(e.target.value)}
          />
        </div>
      )}
    </>
  );
}

function OrderFields(p: {
  orderItems: OrderItem[];
  addOrderItem: () => void;
  updateOrderItem: (i: number, patch: Partial<OrderItem>) => void;
  removeOrderItem: (i: number) => void;
  orderSupplier: string; setOrderSupplier: (v: string) => void;
  orderExpected: string; setOrderExpected: (v: string) => void;
}) {
  const total = p.orderItems.reduce((s, it) => s + (Number(it.unitNet) || 0) * (Number(it.quantity) || 0), 0);
  return (
    <>
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-2">Pozycje</label>
        <div className="space-y-2">
          {p.orderItems.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-6">
                <Input placeholder="Nazwa (np. SSD 500GB NVMe)" value={it.name}
                  onChange={(e) => p.updateOrderItem(i, { name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Input type="number" min={1} placeholder="ilość" value={it.quantity}
                  onChange={(e) => p.updateOrderItem(i, { quantity: Number(e.target.value) || 1 })} />
              </div>
              <div className="col-span-3">
                <Input type="number" step="0.01" placeholder="cena netto" value={it.unitNet}
                  onChange={(e) => p.updateOrderItem(i, { unitNet: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-1">
                <button type="button" onClick={() => p.removeOrderItem(i)}
                  className="h-10 w-full rounded-[var(--r-s)] text-tx3 hover:bg-er-l hover:text-er">
                  <Trash2 className="h-3.5 w-3.5 mx-auto" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={p.addOrderItem}
          className="mt-2 inline-flex items-center gap-1 text-[12px] text-pri hover:underline">
          <Plus className="h-3 w-3" /> Dodaj pozycję
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Dostawca</label>
          <Input placeholder="np. x-kom, Morele, Action" value={p.orderSupplier}
            onChange={(e) => p.setOrderSupplier(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Termin dostarczenia</label>
          <Input type="date" value={p.orderExpected} onChange={(e) => p.setOrderExpected(e.target.value)} />
        </div>
      </div>
      <div className="text-[12px] text-tx2 text-right">
        Suma netto: <strong>{total.toFixed(2)} PLN</strong>
      </div>
    </>
  );
}

function CrmFields({
  crmActs, toggleCrm, updateCrm,
}: {
  crmActs: Record<CrmType, CrmAct | null>;
  toggleCrm: (t: CrmType) => void;
  updateCrm: (t: CrmType, patch: Partial<CrmAct>) => void;
}) {
  const TYPES: { type: CrmType; label: string }[] = [
    { type: 'PHONE', label: 'Telefon' },
    { type: 'MEETING', label: 'Spotkanie' },
    { type: 'EMAIL', label: 'E-mail' },
    { type: 'QUOTE', label: 'Oferta' },
  ];
  return (
    <>
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-2">Rodzaj aktywności (można wybrać kilka)</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(({ type, label }) => {
            const active = crmActs[type] !== null;
            return (
              <button key={type} type="button" onClick={() => toggleCrm(type)}
                className="p-2 rounded-[var(--r-s)] border text-[12px] text-center"
                style={{
                  borderColor: active ? 'var(--wn)' : 'var(--bd)',
                  background: active ? 'var(--wn-l)' : 'transparent',
                  color: active ? 'var(--wn)' : 'var(--tx2)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {TYPES.map(({ type, label }) => {
        const act = crmActs[type];
        if (!act) return null;
        return (
          <div key={type} className="pt-3 border-t border-bd space-y-2">
            <div className="text-[11px] font-bold text-wn">{label}</div>
            <Input placeholder={`Tytuł / temat (${label.toLowerCase()})`} value={act.title ?? ''}
              onChange={(e) => updateCrm(type, { title: e.target.value })} />
            <textarea rows={2} placeholder="Notatka" value={act.notes ?? ''}
              onChange={(e) => updateCrm(type, { notes: e.target.value })}
              className="w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[12px]" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-tx3 block mb-1">Data</label>
                <Input type="datetime-local" value={act.scheduledAt ?? ''}
                  onChange={(e) => updateCrm(type, { scheduledAt: e.target.value })} />
              </div>
              {type === 'QUOTE' && (
                <div>
                  <label className="text-[10px] text-tx3 block mb-1">Wartość netto (PLN)</label>
                  <Input type="number" step="0.01" value={act.quoteValueNet ?? ''}
                    onChange={(e) => updateCrm(type, { quoteValueNet: Number(e.target.value) || undefined })} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap text-[12px]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={act.followUpRequired}
                  onChange={(e) => updateCrm(type, { followUpRequired: e.target.checked })} />
                Wymagany follow-up
              </label>
              {act.followUpRequired && (
                <Input type="datetime-local" value={act.followUpAt ?? ''}
                  onChange={(e) => updateCrm(type, { followUpAt: e.target.value })}
                  className="max-w-[200px]" />
              )}
              <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                <input type="checkbox" checked={act.billable}
                  onChange={(e) => updateCrm(type, { billable: e.target.checked })} />
                Bilowane
              </label>
            </div>
          </div>
        );
      })}
    </>
  );
}
