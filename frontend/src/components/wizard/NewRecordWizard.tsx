// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Mic, MicOff, Star, Search, ChevronRight, ChevronLeft, Plus, Trash2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../api/tickets';
import { ordersApi } from '../../api/orders';
import { delegationsApi } from '../../api/delegations';
import { favoritesApi } from '../../api/favorites';
import { aiApi } from '../../api/ai';
import { locationsApi } from '../../api/locations';
import { usersApi } from '../../api/users';
import { getErrorMessage } from '../../utils/helpers';

type RecordType = 'SERVICE' | 'ORDER' | 'DELEGATION' | 'OTHER';
type ChannelType = 'PHONE' | 'MESSAGE' | 'IN_PERSON';

interface WizardData {
  // Common
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  reporterName: string;
  reporterPhone: string;
  channel: ChannelType | '';
  type: RecordType | '';
  // Service ticket
  deviceId: string;
  deviceName: string;
  title: string;
  description: string;
  priority: TicketPriority;
  dueAt: string;
  billedInContract: boolean;
  assignedToUserId: string;
  // Order
  orderItems: { name: string; price: string; quantity: number; link: string; addToInventory: boolean }[];
  orderNotes: string;
  // Delegation
  delegationTitle: string;
  delegationDescription: string;
  delegationScheduledAt: string;
  delegationAssignedToUserId: string;
  // Other
  otherTitle: string;
  otherDescription: string;
  otherPriority: TicketPriority;
}

const EMPTY_DATA: WizardData = {
  clientId: '', clientName: '', locationId: '', locationName: '',
  reporterName: '', reporterPhone: '', channel: '', type: '',
  deviceId: '', deviceName: '', title: '', description: '',
  priority: 'MEDIUM', dueAt: '', billedInContract: false, assignedToUserId: '',
  orderItems: [{ name: '', price: '', quantity: 1, link: '', addToInventory: false }],
  orderNotes: '',
  delegationTitle: '', delegationDescription: '', delegationScheduledAt: '', delegationAssignedToUserId: '',
  otherTitle: '', otherDescription: '', otherPriority: 'MEDIUM',
};

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'LOW', label: 'Niski', color: 'border-gray-300 text-gray-600' },
  { value: 'MEDIUM', label: 'Średni', color: 'border-blue-300 text-blue-600' },
  { value: 'HIGH', label: 'Wysoki', color: 'border-orange-300 text-orange-600' },
  { value: 'CRITICAL', label: 'Krytyczny', color: 'border-red-300 text-red-600' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewRecordWizard({ open, onClose, onSuccess }: Props) {
  const qc = useQueryClient();
  const [data, setData] = useState<WizardData>(EMPTY_DATA);
  const [step, setStep] = useState(0);
  const [clientSearch, setClientSearch] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  // Inline new client form
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', taxId: '', city: '', phone: '', email: '' });

  // Inline new location form
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', city: '', addressLine1: '' });

  const set = (patch: Partial<WizardData>) => setData(prev => ({ ...prev, ...patch }));

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-all'],
    queryFn: () => clientsApi.getAll(),
    enabled: open,
  });

  const { data: favoriteIds = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => favoritesApi.getFavoriteIds(),
    enabled: open,
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => usersApi.getAll({ role: 'TECHNICIAN' }),
    enabled: open,
  });

  const { data: adminUsers = [] } = useQuery({
    queryKey: ['users-admin'],
    queryFn: () => usersApi.getAll({ role: 'ADMIN' }),
    enabled: open,
  });

  const allStaff = [...staffUsers, ...adminUsers].filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i);

  const { data: clientLocations = [] } = useQuery({
    queryKey: ['locations', { clientId: data.clientId }],
    queryFn: () => locationsApi.getAll({ clientId: data.clientId }),
    enabled: open && !!data.clientId,
  });

  const { data: clientContacts = [] } = useQuery({
    queryKey: ['users-client', data.clientId],
    queryFn: () => usersApi.getAll({ clientId: data.clientId }),
    enabled: open && !!data.clientId,
  });

  // Auto-select location when client has exactly one
  useEffect(() => {
    if (clientLocations.length === 1 && !data.locationId) {
      set({ locationId: clientLocations[0].id, locationName: clientLocations[0].name });
    }
  }, [clientLocations, data.locationId]);

  const selectedClient = clients.find((c: Client) => c.id === data.clientId);

  const toggleFavMutation = useMutation({
    mutationFn: (id: string) => favoritesApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const createClientMutation = useMutation({
    mutationFn: () => clientsApi.create({ name: newClient.name.trim(), taxId: newClient.taxId || undefined, city: newClient.city || undefined, phone: newClient.phone || undefined, email: newClient.email || undefined }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['clients-all'] });
      set({ clientId: created.id, clientName: created.name, locationId: '', locationName: '' });
      setNewClient({ name: '', taxId: '', city: '', phone: '', email: '' });
      setShowNewClient(false);
      toast.success('Klient dodany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const createLocationMutation = useMutation({
    mutationFn: () => locationsApi.create({ name: newLocation.name.trim(), city: newLocation.city || undefined, addressLine1: newLocation.addressLine1 || undefined, clientId: data.clientId }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['locations', { clientId: data.clientId }] });
      set({ locationId: created.id, locationName: created.name });
      setNewLocation({ name: '', city: '', addressLine1: '' });
      setShowNewLocation(false);
      toast.success('Siedziba dodana');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const sourceMap: Record<ChannelType, string> = {
        PHONE: 'PHONE', MESSAGE: 'MESSAGE', IN_PERSON: 'IN_PERSON',
      };
      const source = (data.channel ? sourceMap[data.channel as ChannelType] : 'INTERNAL') as any;

      if (data.type === 'SERVICE') {
        return ticketsApi.create({
          clientId: data.clientId,
          locationId: data.locationId,
          deviceId: data.deviceId || undefined,
          type: 'INCIDENT',
          priority: data.priority,
          source,
          title: data.title,
          description: data.description,
          dueAt: data.dueAt || undefined,
          billedInContract: data.billedInContract,
          assignedToUserId: data.assignedToUserId || undefined,
          reporterName: data.reporterName || undefined,
          reporterPhone: data.reporterPhone || undefined,
        } as any);
      } else if (data.type === 'ORDER') {
        return ordersApi.create({
          clientId: data.clientId,
          assignedToUserId: data.assignedToUserId || undefined,
          notes: data.orderNotes || undefined,
          items: data.orderItems.filter(i => i.name.trim()).map(i => ({
            name: i.name, price: i.price ? parseFloat(i.price) : undefined,
            quantity: i.quantity, link: i.link || undefined, addToInventory: i.addToInventory,
          })),
        });
      } else if (data.type === 'DELEGATION') {
        return delegationsApi.create({
          clientId: data.clientId,
          assignedToUserId: data.delegationAssignedToUserId || undefined,
          title: data.delegationTitle,
          description: data.delegationDescription || undefined,
          scheduledAt: data.delegationScheduledAt || undefined,
        });
      } else {
        return ticketsApi.create({
          clientId: data.clientId, locationId: data.locationId,
          type: 'OTHER', priority: data.otherPriority, source,
          title: data.otherTitle, description: data.otherDescription,
          assignedToUserId: data.assignedToUserId || undefined,
          reporterName: data.reporterName || undefined,
          reporterPhone: data.reporterPhone || undefined,
        } as any);
      }
    },
    onSuccess: () => {
      toast.success('Zapisano!');
      qc.invalidateQueries({ queryKey: ['tickets-all'] });
      qc.invalidateQueries({ queryKey: ['orders-all'] });
      qc.invalidateQueries({ queryKey: ['delegations-all'] });
      onSuccess();
      handleClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const voiceMutation = useMutation({
    mutationFn: (transcript: string) => aiApi.parseVoice(transcript),
    onSuccess: (parsed) => {
      if (parsed.type) set({ type: parsed.type });
      if (parsed.title) set({ title: parsed.title, delegationTitle: parsed.title, otherTitle: parsed.title });
      if (parsed.description) set({ description: parsed.description, delegationDescription: parsed.description, otherDescription: parsed.description });
      if (parsed.priority) set({ priority: parsed.priority as TicketPriority });
      if (parsed.clientName) {
        const found = clients.find((c: Client) => c.name.toLowerCase().includes(parsed.clientName!.toLowerCase()));
        if (found) {
          set({ clientId: found.id, clientName: found.name, locationId: '', locationName: '' });
        } else {
          setClientSearch(parsed.clientName);
        }
      }
      if (parsed.assigneeName) {
        const found = allStaff.find(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(parsed.assigneeName!.toLowerCase()));
        if (found) set({ assignedToUserId: found.id });
      }
      toast.success('Dane wypełnione głosowo!');
    },
    onError: () => toast.error('Błąd przetwarzania głosu'),
  });

  const handleClose = () => {
    setData(EMPTY_DATA);
    setStep(0);
    setClientSearch('');
    setVoiceTranscript('');
    setShowNewClient(false);
    setShowNewLocation(false);
    setNewClient({ name: '', taxId: '', city: '', phone: '', email: '' });
    setNewLocation({ name: '', city: '', addressLine1: '' });
    onClose();
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Przeglądarka nie obsługuje rozpoznawania mowy'); return; }
    const r = new SR();
    r.lang = 'pl-PL';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setVoiceTranscript(t);
      voiceMutation.mutate(t);
    };
    r.onend = () => setIsListening(false);
    r.onerror = () => { setIsListening(false); toast.error('Błąd mikrofonu'); };
    recognitionRef.current = r;
    r.start();
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  // Filtered & sorted clients
  const q = clientSearch.toLowerCase();
  const filtered = clients.filter((c: Client) =>
    !q || c.name.toLowerCase().includes(q) ||
    (c.taxId || '').toLowerCase().includes(q) ||
    (c.city || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q) ||
    (c.email || '').toLowerCase().includes(q)
  ).sort((a: Client, b: Client) => {
    const af = favoriteIds.includes(a.id) ? 0 : 1;
    const bf = favoriteIds.includes(b.id) ? 0 : 1;
    return af - bf || a.name.localeCompare(b.name);
  });

  // Step computation
  const getSteps = () => {
    const base = ['Klient', 'Lokalizacja', 'Kontakt', 'Kanał', 'Typ'];
    if (!data.type) return base;
    const typeStep = data.type === 'SERVICE' ? 'Usługa serwisowa'
      : data.type === 'ORDER' ? 'Zamówienie'
      : data.type === 'DELEGATION' ? 'Delegacja'
      : 'Inne';
    return [...base, typeStep];
  };
  const steps = getSteps();
  const maxStep = steps.length - 1;

  const canNext = () => {
    if (step === 0) return !!data.clientId;
    if (step === 1) return !!data.locationId;
    if (step === 2) return true; // reporter optional
    if (step === 3) return !!data.channel;
    if (step === 4) return !!data.type;
    if (step === 5) {
      if (data.type === 'SERVICE') return !!(data.title && data.description);
      if (data.type === 'ORDER') return data.orderItems.some(i => i.name.trim());
      if (data.type === 'DELEGATION') return !!data.delegationTitle;
      if (data.type === 'OTHER') return !!data.otherTitle;
    }
    return true;
  };

  if (!open) return null;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Nowe zgłoszenie</h2>
          <div className="flex items-center gap-2">
            {/* Voice button */}
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={voiceMutation.isPending}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isListening ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isListening ? 'Słucham...' : 'Głos'}
            </button>
            {voiceTranscript && (
              <span className="text-xs text-gray-400 max-w-xs truncate">"{voiceTranscript}"</span>
            )}
            <button onClick={handleClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-colors ${
                  i < step ? 'bg-indigo-600 text-white' : i === step ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : 'bg-gray-200 text-gray-500'
                }`}>
                  {i < step ? '✓' : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className={`h-0.5 flex-1 transition-colors ${i < step ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex mt-1">
            {steps.map((s, i) => (
              <div key={i} className="flex-1 text-center">
                <span className={`text-[10px] font-medium ${i === step ? 'text-indigo-600' : 'text-gray-400'}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* STEP 0: CLIENT */}
          {step === 0 && (
            <div>
              {!showNewClient ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-500">Wybierz klienta</p>
                    <button
                      onClick={() => setShowNewClient(true)}
                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <Plus className="h-4 w-4" /> Nowy klient
                    </button>
                  </div>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      autoFocus
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      placeholder="Szukaj po nazwie, NIP, mieście, telefonie..."
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {filtered.slice(0, 20).map((c: Client) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          set({ clientId: c.id, clientName: c.name, locationId: '', locationName: '' });
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          data.clientId === c.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); toggleFavMutation.mutate(c.id); }}
                          className="flex-shrink-0 p-1 rounded hover:bg-gray-100"
                        >
                          <Star className={`h-4 w-4 ${favoriteIds.includes(c.id) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{c.name}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {[c.city, c.taxId, c.phone].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        {favoriteIds.includes(c.id) && (
                          <span className="text-xs text-yellow-600 font-medium flex-shrink-0">★ ulubiony</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-800">Nowy klient</p>
                    <button onClick={() => setShowNewClient(false)} className="text-xs text-gray-400 hover:text-gray-600">← Wróć do listy</button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nazwa firmy *</label>
                    <input value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
                      placeholder="np. Firma ABC Sp. z o.o."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">NIP</label>
                      <input value={newClient.taxId} onChange={e => setNewClient(p => ({ ...p, taxId: e.target.value }))}
                        placeholder="0000000000"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Miasto</label>
                      <input value={newClient.city} onChange={e => setNewClient(p => ({ ...p, city: e.target.value }))}
                        placeholder="np. Warszawa"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
                      <input value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))}
                        placeholder="600 000 000"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                      <input value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))}
                        placeholder="biuro@firma.pl"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <button
                    onClick={() => createClientMutation.mutate()}
                    disabled={!newClient.name.trim() || createClientMutation.isPending}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createClientMutation.isPending ? 'Zapisywanie...' : 'Dodaj klienta'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: LOCATION */}
          {step === 1 && (
            <div>
              {!showNewLocation ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-500">Siedziba klienta: <strong>{data.clientName}</strong></p>
                    <button
                      onClick={() => setShowNewLocation(true)}
                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <Plus className="h-4 w-4" /> Nowa siedziba
                    </button>
                  </div>
                  {clientLocations.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Brak siedzib — dodaj pierwszą klikając "Nowa siedziba"</p>
                  ) : (
                    <div className="space-y-2">
                      {clientLocations.map((loc: any) => (
                        <button
                          key={loc.id}
                          onClick={() => set({ locationId: loc.id, locationName: loc.name })}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                            data.locationId === loc.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div>
                            <div className="font-medium text-gray-900">{loc.name}</div>
                            <div className="text-xs text-gray-500">{[loc.city, loc.addressLine1].filter(Boolean).join(', ')}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-800">Nowa siedziba</p>
                    <button onClick={() => setShowNewLocation(false)} className="text-xs text-gray-400 hover:text-gray-600">← Wróć do listy</button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nazwa siedziby *</label>
                    <input value={newLocation.name} onChange={e => setNewLocation(p => ({ ...p, name: e.target.value }))}
                      placeholder="np. Biuro główne, Oddział Kraków"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Miasto</label>
                      <input value={newLocation.city} onChange={e => setNewLocation(p => ({ ...p, city: e.target.value }))}
                        placeholder="np. Kraków"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Adres</label>
                      <input value={newLocation.addressLine1} onChange={e => setNewLocation(p => ({ ...p, addressLine1: e.target.value }))}
                        placeholder="ul. Przykładowa 1"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <button
                    onClick={() => createLocationMutation.mutate()}
                    disabled={!newLocation.name.trim() || createLocationMutation.isPending}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createLocationMutation.isPending ? 'Zapisywanie...' : 'Dodaj siedzibę'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: REPORTER (contact person) */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Osoba zgłaszająca ze strony: <strong>{data.clientName}</strong></p>
              {/* Pick from existing contacts */}
              {clientContacts.length > 0 && (
                <div className="space-y-2 mb-2">
                  {clientContacts.map((u: any) => {
                    const fullName = `${u.firstName} ${u.lastName}`.trim();
                    const isSelected = data.reporterName === fullName && data.reporterPhone === (u.phone || '');
                    return (
                      <button
                        key={u.id}
                        onClick={() => set({ reporterName: fullName, reporterPhone: u.phone || '' })}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {(u.firstName?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{fullName}</div>
                          <div className="text-xs text-gray-500">{[u.email, u.phone].filter(Boolean).join(' · ')}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Manual entry */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400 mb-2">{clientContacts.length > 0 ? 'Lub wpisz ręcznie:' : 'Wpisz dane kontaktowe:'}</p>
                <div className="space-y-2">
                  <input
                    value={data.reporterName}
                    onChange={e => set({ reporterName: e.target.value })}
                    placeholder="Imię i nazwisko"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    value={data.reporterPhone}
                    onChange={e => set({ reporterPhone: e.target.value })}
                    placeholder="Telefon kontaktowy"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">Krok opcjonalny — możesz pominąć</p>
            </div>
          )}

          {/* STEP 3: CHANNEL */}
          {step === 3 && (
            <div>
              <p className="text-sm text-gray-500 mb-4">Jak klient się skontaktował?</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'PHONE' as ChannelType, label: 'Telefon', icon: '📞' },
                  { value: 'MESSAGE' as ChannelType, label: 'Wiadomość', icon: '💬' },
                  { value: 'IN_PERSON' as ChannelType, label: 'Osobiście', icon: '🤝' },
                ].map(ch => (
                  <button
                    key={ch.value}
                    onClick={() => set({ channel: ch.value })}
                    className={`flex flex-col items-center gap-3 py-6 rounded-2xl border-2 transition-all ${
                      data.channel === ch.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-3xl">{ch.icon}</span>
                    <span className="font-semibold text-gray-800">{ch.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: TYPE */}
          {step === 4 && (
            <div>
              <p className="text-sm text-gray-500 mb-4">Co możemy dla Ciebie zrobić?</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'SERVICE' as RecordType, label: 'Usługa serwisowa', icon: '🔧', desc: 'Naprawa, instalacja, konserwacja' },
                  { value: 'ORDER' as RecordType, label: 'Zamówienie towaru', icon: '🛒', desc: 'Zakup sprzętu lub materiałów' },
                  { value: 'DELEGATION' as RecordType, label: 'Delegacja', icon: '✈️', desc: 'Wyjazd, spotkanie z klientem' },
                  { value: 'OTHER' as RecordType, label: 'Inne', icon: '📝', desc: 'Pozostałe sprawy' },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => set({ type: t.value })}
                    className={`flex flex-col items-center gap-2 py-5 px-4 rounded-2xl border-2 transition-all text-center ${
                      data.type === t.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-3xl">{t.icon}</span>
                    <span className="font-bold text-gray-800 text-sm">{t.label}</span>
                    <span className="text-xs text-gray-500">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: SERVICE TICKET */}
          {step === 5 && data.type === 'SERVICE' && (
            <div className="space-y-4">
              {/* Reporter section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Osoba zgłaszająca</label>
                  {!showNewLocation && (
                    <button
                      onClick={() => setShowNewLocation(true)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <Plus className="h-3 w-3" /> Nowy kontakt
                    </button>
                  )}
                </div>
                {showNewLocation ? (
                  <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-600">Nowy kontakt</span>
                      <button onClick={() => setShowNewLocation(false)} className="text-xs text-gray-400 hover:text-gray-600">← Anuluj</button>
                    </div>
                    <input value={newLocation.name} onChange={e => setNewLocation(p => ({ ...p, name: e.target.value }))}
                      placeholder="Imię i nazwisko *"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <input value={newLocation.city} onChange={e => setNewLocation(p => ({ ...p, city: e.target.value }))}
                      placeholder="Telefon"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button
                      onClick={() => {
                        if (newLocation.name.trim()) {
                          set({ reporterName: newLocation.name.trim(), reporterPhone: newLocation.city.trim() });
                          setNewLocation({ name: '', city: '', addressLine1: '' });
                          setShowNewLocation(false);
                        }
                      }}
                      disabled={!newLocation.name.trim()}
                      className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Wybierz
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {clientContacts.length > 0 ? (
                      clientContacts.map((u: any) => {
                        const fullName = `${u.firstName} ${u.lastName}`.trim();
                        const phone = u.phone || '';
                        const isSelected = data.reporterName === fullName;
                        return (
                          <button key={u.id}
                            onClick={() => set({ reporterName: fullName, reporterPhone: phone })}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                              isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {(u.firstName?.[0] || '?').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">{fullName}</div>
                              {phone && <div className="text-xs text-gray-500">{phone}</div>}
                            </div>
                            {isSelected && <span className="text-xs text-indigo-600 font-medium">✓</span>}
                          </button>
                        );
                      })
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={data.reporterName} onChange={e => set({ reporterName: e.target.value })}
                          placeholder="Imię i nazwisko"
                          className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <input value={data.reporterPhone} onChange={e => set({ reporterPhone: e.target.value })}
                          placeholder="Telefon"
                          className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tytuł <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  value={data.title}
                  onChange={e => set({ title: e.target.value })}
                  placeholder="Krótki opis problemu"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opis <span className="text-red-500">*</span></label>
                <textarea
                  value={data.description}
                  onChange={e => set({ description: e.target.value })}
                  placeholder="Szczegółowy opis zgłoszenia..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priorytet</label>
                <div className="grid grid-cols-4 gap-2">
                  {PRIORITY_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => set({ priority: p.value })}
                      className={`py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        data.priority === p.value ? `${p.color} bg-gray-50 border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Termin realizacji</label>
                  <input
                    type="datetime-local"
                    value={data.dueAt}
                    onChange={e => set({ dueAt: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Przydziel pracownika</label>
                  <select
                    value={data.assignedToUserId}
                    onChange={e => set({ assignedToUserId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Oczekujące —</option>
                    {allStaff.map(u => (
                      <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.billedInContract}
                  onChange={e => set({ billedInContract: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm text-gray-700">W ramach umowy serwisowej</span>
              </label>
            </div>
          )}

          {/* STEP 5: ORDER */}
          {step === 5 && data.type === 'ORDER' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">Pozycje zamówienia</p>
              {data.orderItems.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500">Pozycja {idx + 1}</span>
                    {data.orderItems.length > 1 && (
                      <button
                        onClick={() => set({ orderItems: data.orderItems.filter((_, i) => i !== idx) })}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <input
                    value={item.name}
                    onChange={e => {
                      const items = [...data.orderItems];
                      items[idx] = { ...items[idx], name: e.target.value };
                      set({ orderItems: items });
                    }}
                    placeholder="Nazwa produktu *"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={item.price}
                      onChange={e => {
                        const items = [...data.orderItems];
                        items[idx] = { ...items[idx], price: e.target.value };
                        set({ orderItems: items });
                      }}
                      placeholder="Cena (zł)"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={e => {
                        const items = [...data.orderItems];
                        items[idx] = { ...items[idx], quantity: parseInt(e.target.value) || 1 };
                        set({ orderItems: items });
                      }}
                      placeholder="Ilość"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex items-center gap-1.5 px-2">
                      <input
                        type="checkbox"
                        id={`inv-${idx}`}
                        checked={item.addToInventory}
                        onChange={e => {
                          const items = [...data.orderItems];
                          items[idx] = { ...items[idx], addToInventory: e.target.checked };
                          set({ orderItems: items });
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                      />
                      <label htmlFor={`inv-${idx}`} className="text-xs text-gray-600 cursor-pointer">Inwentarz</label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={item.link}
                      onChange={e => {
                        const items = [...data.orderItems];
                        items[idx] = { ...items[idx], link: e.target.value };
                        set({ orderItems: items });
                      }}
                      placeholder="Link (opcjonalnie)"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={() => set({ orderItems: [...data.orderItems, { name: '', price: '', quantity: 1, link: '', addToInventory: false }] })}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="h-4 w-4" /> Dodaj pozycję
              </button>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notatki</label>
                <textarea
                  value={data.orderNotes}
                  onChange={e => set({ orderNotes: e.target.value })}
                  placeholder="Dodatkowe uwagi..."
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* STEP 5: DELEGATION */}
          {step === 5 && data.type === 'DELEGATION' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tytuł / cel delegacji <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  value={data.delegationTitle}
                  onChange={e => set({ delegationTitle: e.target.value })}
                  placeholder="np. Spotkanie ofertowe"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
                <textarea
                  value={data.delegationDescription}
                  onChange={e => set({ delegationDescription: e.target.value })}
                  placeholder="Szczegóły delegacji..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data i godzina</label>
                  <input
                    type="datetime-local"
                    value={data.delegationScheduledAt}
                    onChange={e => set({ delegationScheduledAt: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Przydziel pracownika</label>
                  <select
                    value={data.delegationAssignedToUserId}
                    onChange={e => set({ delegationAssignedToUserId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Wybierz —</option>
                    {allStaff.map(u => (
                      <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: OTHER */}
          {step === 5 && data.type === 'OTHER' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tytuł <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  value={data.otherTitle}
                  onChange={e => set({ otherTitle: e.target.value })}
                  placeholder="Temat sprawy"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
                <textarea
                  value={data.otherDescription}
                  onChange={e => set({ otherDescription: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priorytet</label>
                <div className="grid grid-cols-4 gap-2">
                  {PRIORITY_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => set({ otherPriority: p.value })}
                      className={`py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        data.otherPriority === p.value ? `${p.color} bg-gray-50 border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Przydziel pracownika</label>
                <select
                  value={data.assignedToUserId}
                  onChange={e => set({ assignedToUserId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Oczekujące —</option>
                  {allStaff.map(u => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" /> Wstecz
          </button>

          <span className="text-xs text-gray-400">{step + 1} / {steps.length}</span>

          {step < maxStep ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Dalej <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={!canNext() || submitMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitMutation.isPending ? 'Zapisuję...' : '✓ Zapisz'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
