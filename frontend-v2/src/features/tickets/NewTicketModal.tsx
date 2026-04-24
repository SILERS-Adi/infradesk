import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X, ChevronLeft, ChevronRight, Wrench, Package, Phone as PhoneIcon, Plus,
  Check, Loader2, Building2, MapPin, Trash2, Search, Link as LinkIcon, Image as ImageIcon,
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
  client: {
    id: string; name: string; slug: string; isActive: boolean;
    taxId?: string | null; city?: string | null; email?: string | null;
  };
}
interface LocationRow { id: string; name: string; city: string | null; clientWorkspaceId?: string | null }
interface DeviceRow { id: string; name: string; hostname: string | null; location: { id: string; name: string } | null }
interface MemberRow {
  id: string; role: string; status: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

interface OrderItem {
  name: string;
  description?: string;
  quantity: number;
  unitNet: number;
  linkUrl?: string;
  photoUrl?: string;
  withInstallation: boolean;
}
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

export function NewTicketModal(props: { onClose: () => void }) {
  return <TicketCreator variant="modal" {...props} />;
}

export function TicketCreator({ onClose, variant = 'modal' }: { onClose: () => void; variant?: 'modal' | 'page' }) {
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
  const [orderItems, setOrderItems] = useState<OrderItem[]>([{ name: '', quantity: 1, unitNet: 0, withInstallation: false }]);
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
    setOrderItems([...orderItems, { name: '', quantity: 1, unitNet: 0, withInstallation: false }]);
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

  const header = (
    <div className="flex items-center justify-between border-b border-bd px-6 py-4" style={{ flexShrink: 0 }}>
      <div className="text-[16px] font-bold text-tx flex items-center gap-2">
        Nowe zgłoszenie
        <span className="text-[11px] text-tx3 font-normal">krok {step}/2</span>
      </div>
      {variant === 'modal' ? (
        <Dialog.Close asChild>
          <button className="p-1.5 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button>
        </Dialog.Close>
      ) : (
        <button onClick={onClose} className="p-1.5 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button>
      )}
    </div>
  );

  const stepIndicator = (
    <div className="px-6 py-3 border-b border-bd bg-sf-h flex items-center gap-3" style={{ flexShrink: 0 }}>
      <StepDot n={1} active={step === 1} done={step > 1} label="Klient i lokalizacja" />
      <div className="flex-1 h-px bg-bd" />
      <StepDot n={2} active={step === 2} done={false} label="Czego dotyczy" />
    </div>
  );

  const step1Content = (
    <Step1
      clients={clients}
      locations={filteredLocations}
      clientWorkspaceId={clientWorkspaceId}
      setClientWorkspaceId={setClientWorkspaceId}
      locationId={locationId}
      setLocationId={setLocationId}
    />
  );
  const step2Content = (
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
      clientWorkspaceId={clientWorkspaceId}
      locationId={locationId}
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
  );

  const body = (
    <div style={variant === 'modal' ? MODAL_BODY : { padding: '24px', flex: '1 1 auto' }}>
      {variant === 'modal' ? (
        <>
          {step === 1 && step1Content}
          {step === 2 && step2Content}
        </>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-tx2 mb-4 pb-2 border-b border-bd">
              1. Klient i lokalizacja
            </h2>
            {step1Content}
          </section>
          <section>
            <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-tx2 mb-4 pb-2 border-b border-bd">
              2. Czego dotyczy zgłoszenie
            </h2>
            {step2Content}
          </section>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="px-6 py-3 border-t border-bd flex items-center justify-between gap-2 bg-sf-h" style={{ flexShrink: 0 }}>
      {variant === 'page' ? (
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || !canGoNext || mutation.isPending}>
            {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Tworzenie…</> : <>Utwórz zgłoszenie <Check className="h-4 w-4" /></>}
          </Button>
        </>
      ) : step === 1 ? (
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
  );

  if (variant === 'page') {
    return (
      <div
        style={{
          background: 'var(--sf)',
          border: '1px solid var(--bd)',
          borderRadius: 'var(--r-xl)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '70vh',
          overflow: 'hidden',
        }}
      >
        {header}
        {body}
        {footer}
      </div>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL}>
          <Dialog.Title className="sr-only">Nowe zgłoszenie</Dialog.Title>
          {header}
          {stepIndicator}
          {body}
          {footer}
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickLocationOpen, setQuickLocationOpen] = useState(false);
  const [search, setSearch] = useState('');
  const activeClients = clients.filter((c) => c.client.isActive);
  const selected = activeClients.find((c) => c.client.id === clientWorkspaceId);

  const filtered = useMemo(() => {
    if (!search.trim()) return activeClients;
    const q = search.toLowerCase();
    return activeClients.filter((c) =>
      c.client.name.toLowerCase().includes(q)
      || c.client.slug.toLowerCase().includes(q)
      || (c.client.taxId?.toLowerCase().includes(q) ?? false)
      || (c.client.city?.toLowerCase().includes(q) ?? false)
      || (c.client.email?.toLowerCase().includes(q) ?? false),
    );
  }, [activeClients, search]);

  return (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2 flex items-center gap-2">
          <Building2 className="h-3 w-3" /> Klient *
        </label>

        {selected ? (
          <div className="flex items-center gap-3 p-3 rounded-[var(--r-s)] border"
            style={{ borderColor: 'var(--pri)', background: 'var(--pri-l)' }}>
            <Building2 className="h-4 w-4 text-pri shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-tx truncate">{selected.client.name}</div>
              <div className="text-[11px] text-tx3 truncate">
                {selected.client.slug}.infradesk.pl
                {selected.client.taxId && ` · NIP ${selected.client.taxId}`}
                {selected.client.city && ` · ${selected.client.city}`}
              </div>
            </div>
            <button type="button" onClick={() => { setClientWorkspaceId(''); setLocationId(''); setSearch(''); }}
              className="text-[11px] text-tx3 hover:text-er px-2 py-1 rounded hover:bg-sf-h">
              zmień
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tx3" />
              <input
                type="text"
                placeholder="Szukaj po nazwie, NIP, mieście, subdomenie…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-10 rounded-[var(--r-s)] border border-bd bg-sf2 text-[13px] text-tx outline-none focus:border-pri"
                autoFocus
              />
            </div>
            <div className="mt-2 max-h-[280px] overflow-y-auto rounded-[var(--r-s)] border border-bd divide-y divide-bd">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-tx3">
                  Brak firm pasujących do „{search}"
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.client.id}
                    type="button"
                    onClick={() => { setClientWorkspaceId(c.client.id); setLocationId(''); }}
                    className="w-full flex items-center gap-3 p-2.5 hover:bg-sf-h text-left"
                  >
                    <Building2 className="h-4 w-4 text-tx3 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-tx truncate">{c.client.name}</div>
                      <div className="text-[10px] text-tx3 truncate">
                        {c.client.slug}.infradesk.pl
                        {c.client.taxId && ` · NIP ${c.client.taxId}`}
                        {c.client.city && ` · ${c.client.city}`}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setQuickCreateOpen(true)}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-[var(--r-s)] border border-dashed border-bd text-[12px] text-pri hover:bg-pri-l hover:border-pri"
            >
              <Plus className="h-3.5 w-3.5" /> Dodaj nową firmę
            </button>
          </>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 flex items-center gap-2">
            <MapPin className="h-3 w-3" /> Lokalizacja
          </label>
          {clientWorkspaceId && (
            <button type="button" onClick={() => setQuickLocationOpen(true)}
              className="text-[10px] text-pri hover:underline inline-flex items-center gap-0.5">
              <Plus className="h-2.5 w-2.5" /> Dodaj nową
            </button>
          )}
        </div>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
          disabled={!clientWorkspaceId}
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

      {quickCreateOpen && (
        <QuickCreateClientInline
          onClose={() => setQuickCreateOpen(false)}
          onCreated={(id) => {
            setClientWorkspaceId(id);
            setQuickCreateOpen(false);
          }}
          defaultName={search}
        />
      )}
      {quickLocationOpen && (
        <QuickCreateLocationInline
          onClose={() => setQuickLocationOpen(false)}
          onCreated={(id) => {
            setLocationId(id);
            setQuickLocationOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Szybkie dodanie firmy inline — tylko nazwa + NIP + miasto + osoba kontaktowa.
function QuickCreateClientInline({
  onClose, onCreated, defaultName,
}: { onClose: () => void; onCreated: (id: string) => void; defaultName: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState(defaultName);
  const [taxId, setTaxId] = useState('');
  const [city, setCity] = useState('');
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (name.trim().length < 2) return;
    if (!ownerEmail.trim() || !ownerFirstName.trim() || !ownerLastName.trim()) {
      toast.error('Wypełnij dane osoby kontaktowej (imię, nazwisko, email)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/clients', {
        name, taxId: taxId || undefined, city: city || undefined,
        ownerFirstName, ownerLastName, ownerEmail,
        billingType: 'HOURLY',
      });
      const id = res.data?.client?.id;
      if (!id) throw new Error('Brak ID w odpowiedzi');
      toast.success('Dodano firmę');
      qc.invalidateQueries({ queryKey: ['clients'] });
      onCreated(id);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd dodawania');
    } finally {
      setSubmitting(false);
    }
  }

  // Overlay-on-top + nested modal
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content
          style={{
            position: 'fixed', inset: 0, margin: 'auto', height: 'fit-content',
            zIndex: 61, width: 'min(92vw, 30rem)', maxHeight: '88vh',
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--sh4)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">Szybkie dodanie firmy</Dialog.Title>
            <Dialog.Close asChild><button className="p-1 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Nazwa firmy *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">NIP</label>
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="1234567890" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Miasto</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Warszawa" />
              </div>
            </div>
            <div className="pt-2 border-t border-bd">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2">Osoba kontaktowa *</div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <Input placeholder="Imię *" value={ownerFirstName} onChange={(e) => setOwnerFirstName(e.target.value)} />
                <Input placeholder="Nazwisko *" value={ownerLastName} onChange={(e) => setOwnerLastName(e.target.value)} />
              </div>
              <Input type="email" placeholder="Email *" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bd bg-sf-h">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={submit} disabled={submitting || name.trim().length < 2}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Dodawanie…</> : <>Dodaj firmę</>}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
  clientWorkspaceId: string;
  locationId: string;
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
  locationId: string;
}) {
  const [quickDeviceOpen, setQuickDeviceOpen] = useState(false);
  const [quickTechOpen, setQuickTechOpen] = useState(false);
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
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-tx3">Urządzenie</label>
            <button type="button" onClick={() => setQuickDeviceOpen(true)}
              className="text-[10px] text-pri hover:underline inline-flex items-center gap-0.5">
              <Plus className="h-2.5 w-2.5" /> Dodaj nowe
            </button>
          </div>
          <select value={p.deviceId} onChange={(e) => p.setDeviceId(e.target.value)}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
            <option value="">— nie dotyczy urządzenia —</option>
            {p.devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.hostname ? ` (${d.hostname})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-tx3">Przypisz do technika</label>
            <button type="button" onClick={() => setQuickTechOpen(true)}
              className="text-[10px] text-pri hover:underline inline-flex items-center gap-0.5">
              <Plus className="h-2.5 w-2.5" /> Zaproś nowego
            </button>
          </div>
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
      {quickDeviceOpen && (
        <QuickCreateDeviceInline
          locationId={p.locationId}
          onClose={() => setQuickDeviceOpen(false)}
          onCreated={(id) => { p.setDeviceId(id); setQuickDeviceOpen(false); }}
        />
      )}
      {quickTechOpen && (
        <QuickCreateTechnicianInline
          onClose={() => setQuickTechOpen(false)}
          onCreated={(userId) => { p.setAssignedToUserId(userId); setQuickTechOpen(false); }}
        />
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
        <div className="space-y-3">
          {p.orderItems.map((it, i) => (
            <div key={i} className="rounded-[var(--r-s)] border border-bd p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2 items-start">
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
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6 relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-tx3" />
                  <input type="url" placeholder="Link do produktu (https://…)"
                    value={it.linkUrl ?? ''}
                    onChange={(e) => p.updateOrderItem(i, { linkUrl: e.target.value })}
                    className="w-full pl-8 pr-3 h-9 rounded-[var(--r-s)] border border-bd bg-sf2 text-[12px]" />
                </div>
                <div className="col-span-6 relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-tx3" />
                  <input type="url" placeholder="URL zdjęcia (https://…)"
                    value={it.photoUrl ?? ''}
                    onChange={(e) => p.updateOrderItem(i, { photoUrl: e.target.value })}
                    className="w-full pl-8 pr-3 h-9 rounded-[var(--r-s)] border border-bd bg-sf2 text-[12px]" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={it.withInstallation}
                  onChange={(e) => p.updateOrderItem(i, { withInstallation: e.target.checked })} />
                <Wrench className="h-3 w-3 text-pri" />
                <span>Z montażem</span>
                {it.withInstallation && (
                  <span className="text-[10px] text-tx3">
                    → po dostawie auto-utworzy ticket na montaż (Sprint 6)
                  </span>
                )}
              </label>
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

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add: LOKALIZACJA
// ─────────────────────────────────────────────────────────────────────────────
function QuickCreateLocationInline({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'HOME_OFFICE' | 'OTHER'>('OFFICE');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim() || !addressLine1.trim() || !city.trim() || !postalCode.trim()) {
      toast.error('Wypełnij nazwę, ulicę, kod pocztowy i miasto');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/locations', { name, type, addressLine1, city, postalCode });
      const id = res.data?.location?.id;
      if (!id) throw new Error('Brak ID w odpowiedzi');
      toast.success('Dodano lokalizację');
      qc.invalidateQueries({ queryKey: ['locations'] });
      onCreated(id);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd dodawania');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content
          style={{
            position: 'fixed', inset: 0, margin: 'auto', height: 'fit-content',
            zIndex: 61, width: 'min(92vw, 30rem)', maxHeight: '88vh',
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--sh4)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">Szybkie dodanie lokalizacji</Dialog.Title>
            <Dialog.Close asChild><button className="p-1 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Nazwa lokalizacji *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Biuro główne, Magazyn centralny" autoFocus />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Typ</label>
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)}
                className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
                <option value="OFFICE">Biuro</option>
                <option value="WAREHOUSE">Magazyn</option>
                <option value="RETAIL">Sklep / punkt</option>
                <option value="HOME_OFFICE">Home office</option>
                <option value="OTHER">Inne</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Ulica i numer *</label>
              <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="ul. Przykładowa 12/3" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Kod pocztowy *</label>
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="00-000" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Miasto *</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Warszawa" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bd bg-sf-h">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Dodawanie…</> : <>Dodaj lokalizację</>}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add: URZĄDZENIE
// ─────────────────────────────────────────────────────────────────────────────
function QuickCreateDeviceInline({
  locationId, onClose, onCreated,
}: { locationId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'WORKSTATION' | 'SERVER' | 'ROUTER' | 'SWITCH' | 'FIREWALL' | 'PRINTER' | 'SCANNER' | 'CCTV' | 'PHONE' | 'IOT' | 'OTHER'>('WORKSTATION');
  const [hostname, setHostname] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const locsQ = useQuery<{ locations: LocationRow[] }>({
    queryKey: ['locations', 'list'],
    queryFn: async () => (await api.get('/locations')).data,
    staleTime: 60_000,
  });
  const [pickedLocationId, setPickedLocationId] = useState(locationId);

  async function submit() {
    if (!name.trim()) { toast.error('Podaj nazwę urządzenia'); return; }
    if (!pickedLocationId) { toast.error('Wybierz lokalizację urządzenia'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/devices', {
        name, category, locationId: pickedLocationId,
        hostname: hostname || undefined,
        ipAddress: ipAddress || undefined,
      });
      const id = res.data?.device?.id;
      if (!id) throw new Error('Brak ID w odpowiedzi');
      toast.success('Dodano urządzenie');
      qc.invalidateQueries({ queryKey: ['devices'] });
      onCreated(id);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd dodawania');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content
          style={{
            position: 'fixed', inset: 0, margin: 'auto', height: 'fit-content',
            zIndex: 61, width: 'min(92vw, 30rem)', maxHeight: '88vh',
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--sh4)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">Szybkie dodanie urządzenia</Dialog.Title>
            <Dialog.Close asChild><button className="p-1 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Nazwa *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Kamera-wejście, srv-dc-01, Drukarka-księgowość" autoFocus />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Kategoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}
                className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
                <option value="WORKSTATION">Stacja robocza</option>
                <option value="SERVER">Serwer</option>
                <option value="ROUTER">Router</option>
                <option value="SWITCH">Switch</option>
                <option value="FIREWALL">Firewall</option>
                <option value="PRINTER">Drukarka</option>
                <option value="SCANNER">Skaner</option>
                <option value="CCTV">Kamera / CCTV</option>
                <option value="PHONE">Telefon</option>
                <option value="IOT">IoT / inteligentne</option>
                <option value="OTHER">Inne</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Lokalizacja *</label>
              <select value={pickedLocationId} onChange={(e) => setPickedLocationId(e.target.value)}
                className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
                <option value="">— wybierz —</option>
                {(locsQ.data?.locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}{l.city ? `, ${l.city}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Hostname</label>
                <Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="DESKTOP-ABC" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">IP</label>
                <Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="192.168.1.100" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bd bg-sf-h">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Dodawanie…</> : <>Dodaj urządzenie</>}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add: TECHNIK (zaproszenie do workspace)
// ─────────────────────────────────────────────────────────────────────────────
function QuickCreateTechnicianInline({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (userId: string) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      toast.error('Wypełnij email, imię i nazwisko');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/memberships/invite', { email, firstName, lastName, role, scope: 'FULL' });
      const userId = res.data?.membership?.userId ?? res.data?.userId;
      if (!userId) throw new Error('Brak userId w odpowiedzi');
      toast.success('Zaproszenie wysłane');
      qc.invalidateQueries({ queryKey: ['memberships'] });
      onCreated(userId);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd zaproszenia');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content
          style={{
            position: 'fixed', inset: 0, margin: 'auto', height: 'fit-content',
            zIndex: 61, width: 'min(92vw, 28rem)', maxHeight: '88vh',
            background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--sh4)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">Zaproś technika</Dialog.Title>
            <Dialog.Close asChild><button className="p-1 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Email *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="technik@firma.pl" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Imię *</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Nazwisko *</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Rola</label>
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}
                className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
                <option value="MEMBER">Członek (technik)</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="text-[11px] text-tx3 bg-sf-h border border-bd rounded-[var(--r-s)] p-2">
              Osoba dostanie zaproszenie i zarejestruje się przed pierwszym logowaniem. Możesz już teraz wybrać ją jako technika.
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bd bg-sf-h">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Wysyłanie…</> : <>Zaproś</>}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
