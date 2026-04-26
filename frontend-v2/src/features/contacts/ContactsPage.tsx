import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Users, Mail, Phone, Star, X, Loader2, Search, Trash2, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  position: string | null;
  clientWorkspaceId: string | null;
  isMainContact: boolean;
  tags: string[];
  notes: string | null;
}

interface ClientRow {
  client: { id: string; name: string; slug: string };
}

export function ContactsPage() {
  const navigate = useNavigate();
  const [view, setView] = useViewPreference('contacts', 'visual');
  const [showCreate, setShowCreate] = useState(false);
  const [clientFilter, setClientFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['contacts', clientFilter, search],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (clientFilter) params.clientWorkspaceId = clientFilter;
      if (search) params.search = search;
      return (await api.get('/contacts', { params })).data;
    },
  });

  const { data: clients } = useQuery<{ clients: ClientRow[] }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
  });

  const contacts = data?.contacts ?? [];

  function handleAdd() {
    if (view === 'visual') setShowCreate(true);
    else navigate('/contacts/new');
  }

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Kontakty</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {contacts.length > 0 ? `${contacts.length} ${contacts.length === 1 ? 'kontakt' : 'kontaktów'}` : 'Brak kontaktów'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Dodaj kontakt</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-xs">
          <Search className="absolute left-3 top-[2vh] text-tx3" style={{ width: 14, height: 14 }} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Szukaj po imieniu, mailu, telefonie…" />
        </div>
        <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="max-w-xs">
          <option value="">Wszyscy klienci</option>
          {(clients?.clients ?? []).map((c) => (
            <option key={c.client.id} value={c.client.id}>{c.client.name}</option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : contacts.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak kontaktów</p>
          <p className="text-[13px] text-tx3 mb-4">Dodaj pierwsze osoby kontaktowe do klientów.</p>
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Dodaj pierwszy kontakt</Button>
        </Card>
      ) : view === 'visual' ? (
        <ContactsGrid contacts={contacts} clients={clients?.clients ?? []} />
      ) : (
        <ContactsTable contacts={contacts} clients={clients?.clients ?? []} />
      )}

      {showCreate && <CreateContactModal clients={clients?.clients ?? []} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export function ContactNewPage() {
  const navigate = useNavigate();
  const { data: clients } = useQuery<{ clients: ClientRow[] }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
  });
  return (
    <div className="max-w-3xl mx-auto space-y-4 anim-up">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-tx3 text-sm hover:text-tx press"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>
      <h1 className="text-[22px] font-bold text-tx">Nowy kontakt</h1>
      <CreateContactModal variant="page" clients={clients?.clients ?? []} onClose={() => navigate('/crm')} />
    </div>
  );
}

function ContactsGrid({ contacts, clients }: { contacts: Contact[]; clients: ClientRow[] }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/contacts/${id}`)).data,
    onSuccess: () => { toast.success('Usunięty'); qc.invalidateQueries({ queryKey: ['contacts'] }); },
  });
  const clientName = (id: string | null) => id ? clients.find((c) => c.client.id === id)?.client.name ?? '—' : '—';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {contacts.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
              >
                {c.firstName[0]}{c.lastName[0]}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-tx">{c.firstName} {c.lastName}</p>
                {c.position && <p className="text-[11px] text-tx3">{c.position}</p>}
              </div>
            </div>
            {c.isMainContact && <Badge variant="accent" className="text-[9px]"><Star className="h-2.5 w-2.5" fill="currentColor" /> Główny</Badge>}
          </div>
          <p className="text-[11px] text-tx3 mb-2">{clientName(c.clientWorkspaceId)}</p>
          <div className="space-y-1">
            {c.email && <div className="flex items-center gap-2 text-[12px] text-tx2"><Mail className="h-3 w-3 text-tx3" /> {c.email}</div>}
            {c.phone && <div className="flex items-center gap-2 text-[12px] text-tx2"><Phone className="h-3 w-3 text-tx3" /> {c.phone}</div>}
            {c.mobile && <div className="flex items-center gap-2 text-[12px] text-tx2"><Phone className="h-3 w-3 text-tx3" /> {c.mobile} <Badge variant="neutral" className="text-[9px]">kom.</Badge></div>}
          </div>
          {c.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-bd">
              {c.tags.map((t) => <Badge key={t} variant="neutral" className="text-[9px]">{t}</Badge>)}
            </div>
          )}
          <button
            type="button"
            onClick={() => { if (confirm(`Usunąć ${c.firstName} ${c.lastName}?`)) del.mutate(c.id); }}
            className="absolute top-3 right-3 p-1.5 rounded-[6px] text-tx3 hover:text-er hover:bg-er-l press opacity-0 group-hover:opacity-100 transition-opacity"
            title="Usuń"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </Card>
      ))}
    </div>
  );
}

function ContactsTable({ contacts, clients }: { contacts: Contact[]; clients: ClientRow[] }) {
  const clientName = (id: string | null) => id ? clients.find((c) => c.client.id === id)?.client.name ?? '—' : '—';
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
          <tr>
            <th className="px-4 py-2.5 font-bold">Osoba</th>
            <th className="px-4 py-2.5 font-bold">Firma</th>
            <th className="px-4 py-2.5 font-bold">Stanowisko</th>
            <th className="px-4 py-2.5 font-bold">Email</th>
            <th className="px-4 py-2.5 font-bold">Telefon</th>
            <th className="px-4 py-2.5 font-bold">Tagi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {contacts.map((c) => (
            <tr key={c.id} className="hover:bg-sf-h">
              <td className="px-4 py-3 text-tx font-medium">
                {c.firstName} {c.lastName}
                {c.isMainContact && <Star className="inline h-3 w-3 ml-1.5" style={{ color: 'var(--pri)' }} fill="currentColor" />}
              </td>
              <td className="px-4 py-3 text-tx2">{clientName(c.clientWorkspaceId)}</td>
              <td className="px-4 py-3 text-tx3">{c.position ?? '—'}</td>
              <td className="px-4 py-3 text-tx3 text-[12px]">{c.email ?? '—'}</td>
              <td className="px-4 py-3 text-tx3 text-[12px]">{c.phone ?? c.mobile ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {c.tags.slice(0, 3).map((t) => <Badge key={t} variant="neutral" className="text-[9px]">{t}</Badge>)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const schema = z.object({
  firstName: z.string().min(1, 'Imię wymagane').max(100),
  lastName: z.string().min(1, 'Nazwisko wymagane').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  position: z.string().optional(),
  clientWorkspaceId: z.string().optional(),
  isMainContact: z.boolean().default(false),
  notes: z.string().optional(),
  tags: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export function CreateContactModal({ clients, onClose, variant = 'modal', clientWorkspaceIdPrefill }: { clients: ClientRow[]; onClose: () => void; variant?: 'modal' | 'page'; clientWorkspaceIdPrefill?: string }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: clientWorkspaceIdPrefill ? { clientWorkspaceId: clientWorkspaceIdPrefill } : undefined,
  });

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      const payload: Record<string, unknown> = { ...data };
      if (data.tags) payload.tags = data.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (!data.email) delete payload.email;
      if (!data.clientWorkspaceId) delete payload.clientWorkspaceId;
      return (await api.post('/contacts', payload)).data;
    },
    onSuccess: () => { toast.success('Kontakt dodany'); qc.invalidateQueries({ queryKey: ['contacts'] }); onClose(); },
    onError: () => toast.error('Błąd'),
  });

  const formBody = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Imię *</label>
          <Input {...register('firstName')} />
          {errors.firstName && <p className="text-[11px] text-er mt-1">{errors.firstName.message}</p>}
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwisko *</label>
          <Input {...register('lastName')} />
          {errors.lastName && <p className="text-[11px] text-er mt-1">{errors.lastName.message}</p>}
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-tx3 mb-1">Klient (firma)</label>
        <Select {...register('clientWorkspaceId')}>
          <option value="">—</option>
          {clients.map((c) => <option key={c.client.id} value={c.client.id}>{c.client.name}</option>)}
        </Select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-tx3 mb-1">Stanowisko</label>
        <Input {...register('position')} placeholder="np. Dyrektor, Księgowa, IT" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Email</label>
          <Input type="email" {...register('email')} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Telefon</label>
          <Input {...register('phone')} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-tx3 mb-1">Tagi (po przecinku)</label>
        <Input {...register('tags')} placeholder="VIP, Decydent, Księgowość" />
      </div>
      <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer">
        <input type="checkbox" {...register('isMainContact')} className="accent-[color:var(--pri)]" />
        <Star className="h-3 w-3" />
        Oznacz jako główny kontakt (jeden na firmę)
      </label>
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Utwórz'}
      </Button>
    </>
  );

  if (variant === 'page') {
    return (
      <Card className="p-0 overflow-hidden">
        <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          {formBody}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
            {actions}
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowy kontakt</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            {formBody}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
              {actions}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
