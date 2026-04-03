import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Check, Plus, X, Search, Building2,
  MapPin, User, Phone, MessageCircle, UserCheck, Wrench, ShoppingCart,
  PhoneCall, Mail, Users, CalendarDays, FileText, Loader2, CheckCircle2,
  Trash2, Link as LinkIcon, Camera, Bot, ChevronDown, Monitor, Car,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { ticketsApi } from '../../api/tickets';
import { ordersApi } from '../../api/orders';
import { crmApi } from '../../api/crm';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { usersApi } from '../../api/users';
import { useClientSearch } from '../../hooks/useClientSearch';
import apiClient from '../../api/client';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import type { Client, TicketPriority, CrmActivityType } from '../../types';

const selectCls = "w-full text-[13px] rounded-xl px-3 py-2.5 focus:outline-none appearance-none";
const selectStyle: React.CSSProperties = { background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', WebkitAppearance: 'none' };
const optionStyle: React.CSSProperties = { background: '#0E1425', color: 'rgba(255,255,255,0.85)' };
const labelCls = "block text-[11px] font-semibold uppercase tracking-[0.08em] mb-2";
const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.4)' };

/* ── Types ───────────────────────────────────────────────────────────────── */
type WizardStep = 'priority' | 'client' | 'location' | 'user' | 'source' | 'type_select' | 'service_form' | 'order_form' | 'crm_form' | 'done';
type RecordType = 'SERVICE' | 'ORDER' | 'CRM';
type Source = 'IN_PERSON' | 'PHONE' | 'MESSAGE';

interface OrderItemDraft {
  name: string; link: string; price: string; quantity: number; imageUrl: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultClientId?: string;
  defaultLocationId?: string;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 14,
  ...extra,
});

const PRIORITIES: { value: TicketPriority; label: string; color: string; bg: string }[] = [
  { value: 'LOW',      label: 'Niski',      color: '#60A5FA', bg: 'rgba(96,165,250,0.1)' },
  { value: 'MEDIUM',   label: 'Średni',     color: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
  { value: 'HIGH',     label: 'Wysoki',     color: '#FB923C', bg: 'rgba(251,146,60,0.1)' },
  { value: 'CRITICAL', label: 'Krytyczny',  color: '#F87171', bg: 'rgba(248,113,113,0.1)' },
];

const SOURCES: { value: Source; label: string; icon: React.ReactNode }[] = [
  { value: 'IN_PERSON', label: 'Osobiście', icon: <UserCheck className="h-5 w-5" /> },
  { value: 'PHONE',     label: 'Telefon',   icon: <Phone className="h-5 w-5" /> },
  { value: 'MESSAGE',   label: 'Wiadomość', icon: <MessageCircle className="h-5 w-5" /> },
];

const RECORD_TYPES: { value: RecordType; label: string; desc: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { value: 'SERVICE', label: 'Usługa serwisowa',     desc: 'Zgłoszenie serwisowe, incydent, naprawa', icon: <Wrench className="h-6 w-6" />,       color: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
  { value: 'ORDER',   label: 'Towar / Zamówienie',   desc: 'Zamówienie sprzętu, wycena, zakup',      icon: <ShoppingCart className="h-6 w-6" />, color: '#22D3EE', bg: 'rgba(34,211,238,0.08)' },
  { value: 'CRM',     label: 'CRM',                  desc: 'Telefon, spotkanie, email, oferta',      icon: <Users className="h-6 w-6" />,        color: '#FB923C', bg: 'rgba(251,146,60,0.08)' },
];

const CRM_TYPES: { value: CrmActivityType; label: string; icon: React.ReactNode }[] = [
  { value: 'PHONE',   label: 'Telefon',   icon: <PhoneCall className="h-5 w-5" /> },
  { value: 'MEETING', label: 'Spotkanie', icon: <CalendarDays className="h-5 w-5" /> },
  { value: 'EMAIL',   label: 'E-mail',    icon: <Mail className="h-5 w-5" /> },
  { value: 'QUOTE',   label: 'Oferta',    icon: <FileText className="h-5 w-5" /> },
];

const emptyItem = (): OrderItemDraft => ({ name: '', link: '', price: '', quantity: 1, imageUrl: '' });

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════════════ */
export function UnifiedTicketWizard({ open, onClose, onSuccess, defaultClientId, defaultLocationId }: Props) {
  const qc = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>('priority');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [locationId, setLocationId] = useState(defaultLocationId ?? '');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [source, setSource] = useState<Source | ''>('');
  const [selectedTypes, setSelectedTypes] = useState<Set<RecordType>>(new Set());

  // Service
  const [svcTitle, setSvcTitle] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcDeviceIds, setSvcDeviceIds] = useState<string[]>([]);
  const [svcAssignedTo, setSvcAssignedTo] = useState('');
  const [svcDueAt, setSvcDueAt] = useState('');
  const [svcBilled, setSvcBilled] = useState(false);
  const [svcMode, setSvcMode] = useState<'REMOTE' | 'ONSITE' | ''>('');

  // Order
  const [orderItems, setOrderItems] = useState<OrderItemDraft[]>([emptyItem()]);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderAssignedTo, setOrderAssignedTo] = useState('');
  const [expandedItemIdx, setExpandedItemIdx] = useState(0);

  // CRM
  const [crmType, setCrmType] = useState<CrmActivityType | ''>('');
  const [crmNotes, setCrmNotes] = useState('');
  const [crmContact, setCrmContact] = useState('');
  const [crmSubject, setCrmSubject] = useState('');
  const [crmPlace, setCrmPlace] = useState('');
  const [crmParticipants, setCrmParticipants] = useState('');
  const [crmQuoteDesc, setCrmQuoteDesc] = useState('');
  const [crmQuoteValue, setCrmQuoteValue] = useState('');
  const [crmAssignedTo, setCrmAssignedTo] = useState('');
  const [crmFollowUp, setCrmFollowUp] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<{ url: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // New location inline
  const [showNewLoc, setShowNewLoc] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocCity, setNewLocCity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New user inline
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserFirst, setNewUserFirst] = useState('');
  const [newUserLast, setNewUserLast] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');

  // New device inline (service form)
  const [showNewDevice, setShowNewDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceIp, setNewDeviceIp] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────
  const clientId = selectedClient?.id ?? defaultClientId ?? '';
  const { clients: searchResults, isLoading: searchLoading } = useClientSearch(clientSearch, step === 'client');
  const { data: defaultClientData } = useQuery({
    queryKey: ['client-detail', defaultClientId],
    queryFn: () => clientsApi.getOne(defaultClientId!),
    enabled: !!defaultClientId && !selectedClient,
  });
  // In workspace model, locations/devices/users are workspace-scoped (X-Workspace-Id header)
  const { data: locations = [] } = useQuery({
    queryKey: ['locations-wizard'],
    queryFn: () => locationsApi.getAll(),
  });
  const { data: devices = [] } = useQuery({
    queryKey: ['devices-wizard'],
    queryFn: () => devicesApi.getAll(),
    enabled: selectedTypes.has('SERVICE'),
  });
  const { data: clientUsers = [] } = useQuery({
    queryKey: ['users-wizard'],
    queryFn: () => usersApi.getAll(),
    enabled: !!clientId,
  });
  const { data: staffUsers = [] } = useQuery({
    queryKey: ['staff-users'],
    queryFn: () => usersApi.getAll(),
    select: d => d.filter(u => (u as any).role === 'ADMIN' || (u as any).role === 'TECHNICIAN'),
  });

  // Set default client if provided
  useEffect(() => {
    if (defaultClientData && !selectedClient) setSelectedClient(defaultClientData);
  }, [defaultClientData, selectedClient]);

  // Auto-select location if only one
  useEffect(() => {
    if (locations.length === 1 && !locationId) setLocationId(locations[0].id);
  }, [locations, locationId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('priority'); setPriority('MEDIUM'); setSelectedClient(null); setClientSearch('');
      setLocationId(defaultLocationId ?? ''); setSelectedUserIds([]); setSource('');
      setSelectedTypes(new Set()); setSvcTitle(''); setSvcDesc(''); setSvcDeviceIds([]);
      setSvcAssignedTo(''); setSvcDueAt(''); setSvcBilled(false); setSvcMode('');
      setOrderItems([emptyItem()]); setOrderNotes(''); setOrderAssignedTo(''); setExpandedItemIdx(0);
      setCrmType(''); setCrmNotes(''); setCrmContact(''); setCrmSubject('');
      setCrmPlace(''); setCrmParticipants(''); setCrmQuoteDesc(''); setCrmQuoteValue('');
      setCrmAssignedTo(''); setCrmFollowUp(false); setShowNewLoc(false); setSubmitting(false);
      setAttachments([]); setUploading(false);
      setShowNewUser(false); setNewUserFirst(''); setNewUserLast(''); setNewUserEmail(''); setNewUserPhone('');
      setShowNewDevice(false); setNewDeviceName(''); setNewDeviceIp('');
    }
  }, [open, defaultLocationId]);

  // ── Step navigation ────────────────────────────────────────────────────
  const getSteps = useCallback((): WizardStep[] => {
    const s: WizardStep[] = ['priority'];
    // Client step skipped — in workspace model, client = workspace (already selected)
    s.push('location', 'user', 'source', 'type_select');
    if (selectedTypes.has('SERVICE')) s.push('service_form');
    if (selectedTypes.has('ORDER')) s.push('order_form');
    if (selectedTypes.has('CRM')) s.push('crm_form');
    return s;
  }, [defaultClientId, selectedTypes]);

  const steps = getSteps();
  const stepIdx = steps.indexOf(step);
  const isLast = stepIdx === steps.length - 1;

  const canNext = (): boolean => {
    switch (step) {
      case 'priority': return !!priority;
      case 'client': return !!selectedClient;
      case 'location': return !!locationId;
      case 'user': return true; // optional
      case 'source': return !!source;
      case 'type_select': return selectedTypes.size > 0;
      case 'service_form': return !!svcTitle.trim();
      case 'order_form': return orderItems.some(i => i.name.trim());
      case 'crm_form': return !!crmType;
      default: return false;
    }
  };

  const goNext = () => {
    if (isLast) {
      handleSubmit();
    } else {
      const next = steps[stepIdx + 1];
      if (next) setStep(next);
    }
  };
  const goBack = () => { if (stepIdx > 0) setStep(steps[stepIdx - 1]); };

  // ── Upload attachment ────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await apiClient.post<{ url: string; filename: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setAttachments(prev => [...prev, { url: data.url, filename: data.filename || file.name }]);
      }
      toast.success('Załącznik dodany');
    } catch { toast.error('Błąd uploadu'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  // ── Create location inline ────────────────────────────────────────────
  const createLocMutation = useMutation({
    mutationFn: () => locationsApi.create({ clientId, name: newLocName, city: newLocCity }),
    onSuccess: (loc) => {
      setLocationId(loc.id);
      setShowNewLoc(false);
      setNewLocName(''); setNewLocCity('');
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Lokalizacja dodana');
    },
    onError: () => toast.error('Błąd tworzenia lokalizacji'),
  });

  // ── Create user inline ────────────────────────────────────────────────
  const createUserMutation = useMutation({
    mutationFn: () => usersApi.create({
      firstName: newUserFirst,
      lastName: newUserLast,
      email: newUserEmail,
      phone: newUserPhone || undefined,
      password: Math.random().toString(36).slice(-10) + 'A1!',
    } as any),
    onSuccess: (user) => {
      setSelectedUserIds(prev => [...prev, user.id]);
      setShowNewUser(false);
      setNewUserFirst(''); setNewUserLast(''); setNewUserEmail(''); setNewUserPhone('');
      qc.invalidateQueries({ queryKey: ['users', { clientId }] });
      toast.success('Użytkownik dodany');
    },
    onError: () => toast.error('Błąd tworzenia użytkownika'),
  });

  // ── Create device inline ──────────────────────────────────────────────
  const createDeviceMutation = useMutation({
    mutationFn: () => devicesApi.create({
      name: newDeviceName,
      ipAddress: newDeviceIp || undefined,
      clientId,
      locationId: locationId || undefined,
    } as any),
    onSuccess: (device) => {
      setSvcDeviceIds([device.id]);
      setShowNewDevice(false);
      setNewDeviceName(''); setNewDeviceIp('');
      qc.invalidateQueries({ queryKey: ['devices', { clientId }] });
      toast.success('Urządzenie dodane');
    },
    onError: () => toast.error('Błąd tworzenia urządzenia'),
  });

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const promises: Promise<unknown>[] = [];

      if (selectedTypes.has('SERVICE')) {
        // Create ticket first, then assign separately (backend creates task on assign)
        const ticketPromise = ticketsApi.create({
          clientId, locationId,
          deviceId: svcDeviceIds[0] || undefined,
          type: 'INCIDENT' as any,
          priority,
          source: (source || 'INTERNAL') as any,
          title: svcTitle,
          description: svcDesc || svcTitle,
          dueAt: svcDueAt ? new Date(svcDueAt).toISOString() : undefined,
          billedInContract: svcBilled,
          serviceMode: svcMode || undefined,
        } as any).then(async (ticket: any) => {
          // Assign after creation (backend auto-creates task + changes status to ASSIGNED)
          if (svcAssignedTo) {
            await ticketsApi.assign(ticket.id, svcAssignedTo, svcMode || undefined);
          }
          // Add attachments as comments if any
          if (attachments.length > 0) {
            const attachText = attachments.map(a => `[Załącznik: ${a.filename}](${a.url})`).join('\n');
            await ticketsApi.addComment(ticket.id, `Załączniki:\n${attachText}`, false);
          }
          return ticket;
        });
        promises.push(ticketPromise);
      }

      if (selectedTypes.has('ORDER')) {
        promises.push(ordersApi.create({
          clientId,
          assignedToUserId: orderAssignedTo || undefined,
          notes: orderNotes || undefined,
          items: orderItems.filter(i => i.name.trim()).map(i => ({
            name: i.name,
            price: i.price ? parseFloat(i.price) : undefined,
            quantity: i.quantity,
            link: i.link || undefined,
            addToInventory: false,
          })),
        }));
      }

      if (selectedTypes.has('CRM') && crmType) {
        const crmPayload: Record<string, unknown> = {
          clientId,
          type: crmType,
          notes: crmNotes || undefined,
          assignedToUserId: crmAssignedTo || undefined,
          followUpRequired: crmFollowUp,
        };
        if (crmType === 'PHONE') crmPayload.contactPerson = crmContact || undefined;
        if (crmType === 'EMAIL') crmPayload.subject = crmSubject || undefined;
        if (crmType === 'MEETING') { crmPayload.meetingPlace = crmPlace || undefined; crmPayload.participants = crmParticipants || undefined; }
        if (crmType === 'QUOTE') { crmPayload.quoteDescription = crmQuoteDesc || undefined; crmPayload.quoteValue = crmQuoteValue ? parseFloat(crmQuoteValue) : undefined; crmPayload.quoteStatus = 'NEW'; }
        promises.push(crmApi.create(crmPayload as any));
      }

      await Promise.all(promises);
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['dashboard-tasks'] });
      setStep('done');
    } catch (err) {
      toast.error('Błąd zapisu zgłoszenia');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // ── Selection card helper ──────────────────────────────────────────────
  const Card = ({ selected, onClick, children, color, bg }: { selected: boolean; onClick: () => void; children: React.ReactNode; color?: string; bg?: string }) => (
    <button onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-[14px] text-left transition-all duration-200 active:scale-[0.98] w-full"
      style={{
        background: selected ? (bg ?? 'rgba(139,92,246,0.1)') : 'rgba(255,255,255,0.02)',
        border: `1.5px solid ${selected ? (color ?? '#A78BFA') + '40' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: selected ? `0 0 16px ${(color ?? '#A78BFA')}15` : 'none',
      }}>
      {children}
    </button>
  );

  // ── Toggle switch helper ───────────────────────────────────────────────
  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button onClick={onChange} type="button"
      className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ background: checked ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)' }}>
      <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  );

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div className="relative w-full max-w-[580px] max-h-[90vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{ background: 'rgba(14,20,38,0.97)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <h2 className="text-[15px] font-semibold text-white/85">Nowe zgłoszenie</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {step === 'done' ? 'Gotowe' : `Krok ${stepIdx + 1} z ${steps.length}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {step !== 'done' && (
              <div className="flex gap-1">
                {steps.map((s, i) => (
                  <div key={s} className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: i === stepIdx ? 20 : 6,
                      background: i < stepIdx ? '#A78BFA' : i === stepIdx ? 'linear-gradient(90deg, #6D28D9, #2563EB)' : 'rgba(255,255,255,0.1)',
                    }} />
                ))}
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/25 hover:text-white/50 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">

          {/* DONE */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <CheckCircle2 className="h-8 w-8" style={{ color: '#4ADE80' }} />
              </div>
              <p className="text-[16px] font-semibold text-white/90">Zgłoszenie utworzone!</p>
              <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {[...selectedTypes].map(t => t === 'SERVICE' ? 'Usługa serwisowa' : t === 'ORDER' ? 'Zamówienie' : 'CRM').join(' + ')}
              </p>
              <button onClick={() => { onSuccess(); onClose(); }}
                className="mt-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                Gotowe
              </button>
            </div>
          )}

          {/* PRIORITY */}
          {step === 'priority' && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-white/70 mb-4">Priorytet zgłoszenia</p>
              <div className="grid grid-cols-2 gap-3">
                {PRIORITIES.map(p => (
                  <Card key={p.value} selected={priority === p.value} onClick={() => setPriority(p.value)} color={p.color} bg={p.bg}>
                    <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                    <span className="text-[14px] font-semibold" style={{ color: priority === p.value ? p.color : 'rgba(255,255,255,0.6)' }}>{p.label}</span>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* CLIENT */}
          {step === 'client' && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-white/70 mb-2">Wybierz klienta</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
                <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                  placeholder="Szukaj firmy..."
                  className="w-full pl-9 pr-3 py-2.5 text-[13px] rounded-xl focus:outline-none placeholder:text-white/20"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
              </div>
              {selectedClient && (
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" style={{ color: '#A78BFA' }} />
                    <span className="text-[13px] font-semibold" style={{ color: '#A78BFA' }}>{selectedClient.name}</span>
                  </div>
                  <button onClick={() => setSelectedClient(null)} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
                </div>
              )}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {searchResults.map(c => (
                  <button key={c.id} onClick={() => { setSelectedClient(c); setLocationId(''); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-white/[0.03]"
                    style={glass()}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>{c.name.slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-white/80 truncate">{c.name}</p>
                      {c.city && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.city}</p>}
                    </div>
                  </button>
                ))}
                {searchLoading && <p className="text-[12px] text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Szukam...</p>}
              </div>
            </div>
          )}

          {/* LOCATION */}
          {step === 'location' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-semibold text-white/70">Lokalizacja</p>
                <button onClick={() => setShowNewLoc(!showNewLoc)}
                  className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
                  style={{ color: '#A78BFA' }}>
                  <Plus className="h-3.5 w-3.5" /> Nowa
                </button>
              </div>
              {showNewLoc && (
                <div className="p-4 rounded-xl space-y-3" style={glass()}>
                  <Input label="Nazwa lokalizacji *" value={newLocName} onChange={e => setNewLocName(e.target.value)} placeholder="np. Biuro główne" />
                  <Input label="Miasto" value={newLocCity} onChange={e => setNewLocCity(e.target.value)} placeholder="np. Warszawa" />
                  <button onClick={() => newLocName.trim() && createLocMutation.mutate()}
                    disabled={!newLocName.trim() || createLocMutation.isPending}
                    className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                    {createLocMutation.isPending ? 'Tworzę...' : 'Dodaj lokalizację'}
                  </button>
                </div>
              )}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {locations.map(loc => (
                  <Card key={loc.id} selected={locationId === loc.id} onClick={() => setLocationId(loc.id)}>
                    <MapPin className="h-4 w-4 flex-shrink-0" style={{ color: locationId === loc.id ? '#A78BFA' : 'rgba(255,255,255,0.3)' }} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-white/80 truncate">{loc.name}</p>
                      {loc.city && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{loc.city}</p>}
                    </div>
                  </Card>
                ))}
                {locations.length === 0 && !showNewLoc && (
                  <p className="text-[12px] text-center py-6" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak lokalizacji — dodaj nową</p>
                )}
              </div>
            </div>
          )}

          {/* USER (optional) */}
          {step === 'user' && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-white/70 mb-2">Osoba zgłaszająca (opcjonalnie)</p>
              <Card selected={selectedUserIds.length === 0} onClick={() => setSelectedUserIds([])}>
                <User className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Pomiń — nie wybieraj</span>
              </Card>
              {clientUsers.map(u => (
                <Card key={u.id} selected={selectedUserIds.includes(u.id)} onClick={() => setSelectedUserIds(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id])}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                    {u.firstName[0]}{u.lastName[0]}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-white/80">{u.firstName} {u.lastName}</p>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{u.email}</p>
                  </div>
                </Card>
              ))}

              {/* Inline new user form */}
              {!showNewUser ? (
                <button onClick={() => setShowNewUser(true)}
                  className="flex items-center gap-2 w-full p-3 rounded-xl text-left transition-colors hover:bg-white/[0.03]"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <Plus className="h-4 w-4" style={{ color: '#A78BFA' }} />
                  <span className="text-[12px] font-semibold" style={{ color: '#A78BFA' }}>Dodaj nowego użytkownika</span>
                </button>
              ) : (
                <div className="p-4 rounded-xl space-y-3" style={glass()}>
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Nowy użytkownik</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Input label="Imię *" value={newUserFirst} onChange={e => setNewUserFirst(e.target.value)} placeholder="Jan" />
                    <Input label="Nazwisko *" value={newUserLast} onChange={e => setNewUserLast(e.target.value)} placeholder="Kowalski" />
                  </div>
                  <Input label="Email *" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="jan@firma.pl" />
                  <Input label="Telefon" value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} placeholder="+48 500 000 000" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      if (newUserFirst.trim() && newUserLast.trim() && newUserEmail.trim()) createUserMutation.mutate();
                    }}
                      disabled={!newUserFirst.trim() || !newUserLast.trim() || !newUserEmail.trim() || createUserMutation.isPending}
                      className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                      {createUserMutation.isPending ? 'Tworzę...' : 'Zapisz'}
                    </button>
                    <button onClick={() => { setShowNewUser(false); setNewUserFirst(''); setNewUserLast(''); setNewUserEmail(''); setNewUserPhone(''); }}
                      className="px-4 py-2 rounded-xl text-[12px] font-medium transition-colors"
                      style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)' }}>
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SOURCE */}
          {step === 'source' && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-white/70 mb-4">Sposób zgłoszenia</p>
              {SOURCES.map(s => (
                <Card key={s.value} selected={source === s.value} onClick={() => setSource(s.value)}>
                  <div style={{ color: source === s.value ? '#A78BFA' : 'rgba(255,255,255,0.3)' }}>{s.icon}</div>
                  <span className="text-[14px] font-medium" style={{ color: source === s.value ? '#A78BFA' : 'rgba(255,255,255,0.6)' }}>{s.label}</span>
                </Card>
              ))}
            </div>
          )}

          {/* TYPE SELECT (multi) */}
          {step === 'type_select' && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-white/70 mb-4">Czego dotyczy zgłoszenie?</p>
              <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Możesz wybrać kilka</p>
              {RECORD_TYPES.map(t => {
                const selected = selectedTypes.has(t.value);
                return (
                  <button key={t.value}
                    onClick={() => setSelectedTypes(prev => {
                      const next = new Set(prev);
                      next.has(t.value) ? next.delete(t.value) : next.add(t.value);
                      return next;
                    })}
                    className="w-full flex items-center gap-4 p-4 rounded-[14px] text-left transition-all duration-200 active:scale-[0.98]"
                    style={{
                      background: selected ? t.bg : 'rgba(255,255,255,0.02)',
                      border: `1.5px solid ${selected ? t.color + '40' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: selected ? t.color + '20' : 'rgba(255,255,255,0.04)', color: selected ? t.color : 'rgba(255,255,255,0.25)' }}>
                      {t.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold" style={{ color: selected ? t.color : 'rgba(255,255,255,0.6)' }}>{t.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all ${selected ? 'border-transparent' : ''}`}
                      style={{ background: selected ? t.color : 'transparent', borderColor: selected ? t.color : 'rgba(255,255,255,0.15)' }}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* SERVICE FORM */}
          {step === 'service_form' && (
            <div className="space-y-4">
              <p className="text-[13px] font-semibold text-white/70 mb-2">Usługa serwisowa</p>

              {/* Tryb serwisu */}
              <div>
                <label className={labelCls} style={labelStyle}>Tryb realizacji</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={() => setSvcMode('REMOTE')}
                    className="flex items-center gap-3 p-3.5 rounded-[14px] text-left transition-all duration-200 active:scale-[0.98]"
                    style={{
                      background: svcMode === 'REMOTE' ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.02)',
                      border: `1.5px solid ${svcMode === 'REMOTE' ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                    <Monitor className="h-5 w-5" style={{ color: svcMode === 'REMOTE' ? '#60A5FA' : 'rgba(255,255,255,0.25)' }} />
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: svcMode === 'REMOTE' ? '#60A5FA' : 'rgba(255,255,255,0.5)' }}>Serwis zdalny</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>RustDesk / zdalny pulpit</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => setSvcMode('ONSITE')}
                    className="flex items-center gap-3 p-3.5 rounded-[14px] text-left transition-all duration-200 active:scale-[0.98]"
                    style={{
                      background: svcMode === 'ONSITE' ? 'rgba(251,146,60,0.1)' : 'rgba(255,255,255,0.02)',
                      border: `1.5px solid ${svcMode === 'ONSITE' ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                    <Car className="h-5 w-5" style={{ color: svcMode === 'ONSITE' ? '#FB923C' : 'rgba(255,255,255,0.25)' }} />
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: svcMode === 'ONSITE' ? '#FB923C' : 'rgba(255,255,255,0.5)' }}>Serwis u klienta</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Dojazd do klienta</p>
                    </div>
                  </button>
                </div>
              </div>

              <Input label="Temat *" value={svcTitle} onChange={e => setSvcTitle(e.target.value)} placeholder="Np. Nie działa drukarka" />
              <Textarea label="Opis" value={svcDesc} onChange={e => setSvcDesc(e.target.value)} placeholder="Szczegóły problemu..." rows={3} />
              <div>
                <label className={labelCls} style={labelStyle}>Urządzenie</label>
                <select className={selectCls} style={selectStyle} value={svcDeviceIds[0] ?? ''} onChange={e => setSvcDeviceIds(e.target.value ? [e.target.value] : [])}>
                  <option value="" style={optionStyle}>— brak —</option>
                  {devices.map(d => <option key={d.id} value={d.id} style={optionStyle}>{d.name} {d.ipAddress ? `(${d.ipAddress})` : ''}</option>)}
                </select>

                {/* Inline new device */}
                {!showNewDevice ? (
                  <button onClick={() => setShowNewDevice(true)}
                    className="flex items-center gap-2 mt-2 text-[11px] font-semibold transition-colors"
                    style={{ color: '#A78BFA' }}>
                    <Plus className="h-3.5 w-3.5" /> Dodaj urządzenie
                  </button>
                ) : (
                  <div className="p-4 mt-2 rounded-xl space-y-3" style={glass()}>
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Nowe urządzenie</p>
                    <Input label="Nazwa *" value={newDeviceName} onChange={e => setNewDeviceName(e.target.value)} placeholder="Np. Drukarka HP" />
                    <Input label="Adres IP (opcjonalnie)" value={newDeviceIp} onChange={e => setNewDeviceIp(e.target.value)} placeholder="192.168.1.100" />
                    <div className="flex items-center gap-2">
                      <button onClick={() => { if (newDeviceName.trim()) createDeviceMutation.mutate(); }}
                        disabled={!newDeviceName.trim() || createDeviceMutation.isPending}
                        className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                        {createDeviceMutation.isPending ? 'Tworzę...' : 'Zapisz'}
                      </button>
                      <button onClick={() => { setShowNewDevice(false); setNewDeviceName(''); setNewDeviceIp(''); }}
                        className="px-4 py-2 rounded-xl text-[12px] font-medium transition-colors"
                        style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)' }}>
                        Anuluj
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Przypisz do pracownika</label>
                <select className={selectCls} style={selectStyle} value={svcAssignedTo} onChange={e => setSvcAssignedTo(e.target.value)}>
                  <option value="" style={optionStyle}>— nie przydzielaj —</option>
                  {staffUsers.map(u => <option key={u.id} value={u.id} style={optionStyle}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Termin (opcjonalnie)" type="datetime-local" value={svcDueAt} onChange={e => setSvcDueAt(e.target.value)} />
                <div className="flex items-center gap-3 pt-7">
                  <ToggleSwitch checked={svcBilled} onChange={() => setSvcBilled(!svcBilled)} />
                  <label className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>W ramach umowy</label>
                </div>
              </div>

              {/* Załączniki */}
              <div>
                <label className={labelCls} style={labelStyle}>Załączniki</label>
                <div className="space-y-2">
                  {attachments.map((a, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl" style={glass()}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-violet-400 hover:underline truncate">{a.filename}</a>
                      <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-white/20 hover:text-red-400 ml-2">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.03]"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <Plus className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                    <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{uploading ? 'Przesyłam...' : 'Dodaj zdjęcie, PDF...'}</span>
                    <input type="file" accept="image/*,.pdf" multiple className="sr-only" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ORDER FORM */}
          {step === 'order_form' && (
            <div className="space-y-4">
              <p className="text-[13px] font-semibold text-white/70 mb-2">Towar / Zamówienie</p>

              {orderItems.map((item, i) => {
                const isExpanded = expandedItemIdx === i;
                return (
                  <div key={i} className="rounded-xl overflow-hidden" style={glass()}>
                    {/* Collapsed header — always visible */}
                    <button
                      type="button"
                      onClick={() => setExpandedItemIdx(i)}
                      className="w-full flex items-center justify-between p-3 text-left"
                      style={{ borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold uppercase flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>Pozycja {i + 1}{!isExpanded && item.name ? ':' : ''}</span>
                        {!isExpanded && item.name && (
                          <span className="text-[12px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>{item.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {orderItems.length > 1 && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setOrderItems(prev => prev.filter((_, j) => j !== i)); if (expandedItemIdx >= orderItems.length - 1) setExpandedItemIdx(Math.max(0, orderItems.length - 2)); }} className="text-white/20 hover:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ color: 'rgba(255,255,255,0.25)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }} />
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="p-3 space-y-2.5">
                        <Input label="Nazwa towaru *" value={item.name}
                          onChange={e => setOrderItems(prev => prev.map((it, j) => j === i ? { ...it, name: e.target.value } : it))} placeholder="Np. Toner HP 305A" />
                        <div className="grid grid-cols-2 gap-2.5">
                          <Input label="Cena (zł)" type="number" value={item.price}
                            onChange={e => setOrderItems(prev => prev.map((it, j) => j === i ? { ...it, price: e.target.value } : it))} placeholder="0.00" />
                          <Input label="Ilość" type="number" value={String(item.quantity)}
                            onChange={e => setOrderItems(prev => prev.map((it, j) => j === i ? { ...it, quantity: parseInt(e.target.value) || 1 } : it))} />
                        </div>
                        <Input label="Link (opcjonalnie)" value={item.link}
                          onChange={e => setOrderItems(prev => prev.map((it, j) => j === i ? { ...it, link: e.target.value } : it))} placeholder="https://..." />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add item button at BOTTOM */}
              <button onClick={() => { setOrderItems(prev => [...prev, emptyItem()]); setExpandedItemIdx(orderItems.length); }}
                className="flex items-center gap-2 w-full p-3 rounded-xl text-left transition-colors hover:bg-white/[0.03]"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <Plus className="h-4 w-4" style={{ color: '#22D3EE' }} />
                <span className="text-[12px] font-semibold" style={{ color: '#22D3EE' }}>Dodaj pozycję</span>
              </button>

              <Textarea label="Notatki" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Dodatkowe uwagi..." rows={2} />
              <div>
                <label className={labelCls} style={labelStyle}>Przypisz do pracownika</label>
                <select className={selectCls} style={selectStyle} value={orderAssignedTo} onChange={e => setOrderAssignedTo(e.target.value)}>
                  <option value="" style={optionStyle}>— nie przydzielaj —</option>
                  {staffUsers.map(u => <option key={u.id} value={u.id} style={optionStyle}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* CRM FORM */}
          {step === 'crm_form' && (
            <div className="space-y-4">
              <p className="text-[13px] font-semibold text-white/70 mb-2">CRM — rodzaj aktywności</p>
              <div className="grid grid-cols-2 gap-2.5">
                {CRM_TYPES.map(ct => (
                  <Card key={ct.value} selected={crmType === ct.value} onClick={() => setCrmType(ct.value)}>
                    <div style={{ color: crmType === ct.value ? '#FB923C' : 'rgba(255,255,255,0.3)' }}>{ct.icon}</div>
                    <span className="text-[13px] font-medium" style={{ color: crmType === ct.value ? '#FB923C' : 'rgba(255,255,255,0.5)' }}>{ct.label}</span>
                  </Card>
                ))}
              </div>
              {crmType && (
                <div className="space-y-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {crmType === 'PHONE' && <Input label="Osoba kontaktowa" value={crmContact} onChange={e => setCrmContact(e.target.value)} placeholder="Jan Kowalski" />}
                  {crmType === 'EMAIL' && <Input label="Temat *" value={crmSubject} onChange={e => setCrmSubject(e.target.value)} placeholder="Temat wiadomości" />}
                  {crmType === 'MEETING' && (<>
                    <Input label="Miejsce" value={crmPlace} onChange={e => setCrmPlace(e.target.value)} placeholder="Biuro / online" />
                    <Input label="Uczestnicy" value={crmParticipants} onChange={e => setCrmParticipants(e.target.value)} placeholder="Jan, Anna" />
                  </>)}
                  {crmType === 'QUOTE' && (<>
                    <Input label="Opis oferty *" value={crmQuoteDesc} onChange={e => setCrmQuoteDesc(e.target.value)} placeholder="Np. Wycena serwera" />
                    <Input label="Wartość (zł)" type="number" value={crmQuoteValue} onChange={e => setCrmQuoteValue(e.target.value)} placeholder="0.00" />
                  </>)}
                  <Textarea label="Notatki" value={crmNotes} onChange={e => setCrmNotes(e.target.value)} placeholder="Dodatkowe informacje..." rows={2} />
                  <div>
                    <label className={labelCls} style={labelStyle}>Przypisz</label>
                    <select className={selectCls} style={selectStyle} value={crmAssignedTo} onChange={e => setCrmAssignedTo(e.target.value)}>
                      <option value="" style={optionStyle}>— brak —</option>
                      {staffUsers.map(u => <option key={u.id} value={u.id} style={optionStyle}>{u.firstName} {u.lastName}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>Wymaga follow-up</span>
                    <ToggleSwitch checked={crmFollowUp} onChange={() => setCrmFollowUp(!crmFollowUp)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        {step !== 'done' && (
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button onClick={stepIdx > 0 ? goBack : onClose}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all active:scale-[0.97]"
              style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <ChevronLeft className="h-3.5 w-3.5" />
              {stepIdx > 0 ? 'Wstecz' : 'Anuluj'}
            </button>
            <button onClick={goNext} disabled={!canNext() || submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 10px rgba(79,140,255,0.18)' }}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isLast ? (
                <><Check className="h-3.5 w-3.5" /> Zapisz</>
              ) : (
                <>Dalej <ChevronRight className="h-3.5 w-3.5" /></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
