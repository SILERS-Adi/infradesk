import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LinkIcon, Plus, Check, X, Ban, Monitor, Shield, Eye, Wrench,
  Link2, Copy, Loader2, ChevronDown,
} from 'lucide-react';
import { partnersApi, Partnership } from '../../../api/partners';

const ROLE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  VIEWER: { label: 'Podgląd', icon: Eye, color: 'text-blue-400' },
  REMOTE_SUPPORT: { label: 'Zdalna pomoc', icon: Wrench, color: 'text-amber-400' },
  FULL_MANAGEMENT: { label: 'Pełne zarządzanie', icon: Shield, color: 'text-emerald-400' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Oczekuje', color: 'bg-amber-500/10 text-amber-400' },
  ACTIVE: { label: 'Aktywne', color: 'bg-emerald-500/10 text-emerald-400' },
  REJECTED: { label: 'Odrzucone', color: 'bg-red-500/10 text-red-400' },
  REVOKED: { label: 'Cofnięte', color: 'bg-zinc-500/10 text-zinc-400' },
};

export default function PartnersPage() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [showGuest, setShowGuest] = useState(false);
  const [slug, setSlug] = useState('');
  const [role, setRole] = useState('REMOTE_SUPPORT');
  const [guestLabel, setGuestLabel] = useState('');
  const [guestHours, setGuestHours] = useState(24);

  const { data, isLoading } = useQuery({
    queryKey: ['partnerships'],
    queryFn: partnersApi.list,
  });

  const { data: guestLinks } = useQuery({
    queryKey: ['guest-links'],
    queryFn: partnersApi.listGuestLinks,
  });

  const inviteMut = useMutation({
    mutationFn: () => partnersApi.invite({ partnerSlug: slug, role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partnerships'] }); toast.success('Zaproszenie wysłane'); setShowInvite(false); setSlug(''); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Błąd'),
  });

  const respondMut = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => partnersApi.respond(id, accept),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partnerships'] }); toast.success('Zaktualizowano'); },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => partnersApi.update(id, { status: 'REVOKED' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partnerships'] }); toast.success('Partnerstwo cofnięte'); },
  });

  const guestMut = useMutation({
    mutationFn: () => partnersApi.createGuestLink({ label: guestLabel, expiresInHours: guestHours }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['guest-links'] });
      navigator.clipboard.writeText(`${window.location.origin}/guest/${data.token}`);
      toast.success('Link skopiowany do schowka');
      setShowGuest(false); setGuestLabel('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Błąd'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  const asOwner = data?.asOwner || [];
  const asPartner = data?.asPartner || [];
  const pendingIncoming = asPartner.filter(p => p.status === 'PENDING');

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/10 flex items-center justify-center">
            <LinkIcon className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Partnerzy</h1>
            <p className="text-sm text-zinc-400">Zarządzaj dostępem firm zewnętrznych do infrastruktury</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGuest(true)} className="flex items-center gap-2 px-4 py-2 bg-[#131B2E] text-zinc-300 rounded-xl text-sm hover:bg-[#1E293B] border border-[#1E293B]">
            <Link2 className="h-4 w-4" /> Link jednorazowy
          </button>
          <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm hover:bg-violet-700">
            <Plus className="h-4 w-4" /> Dodaj partnera
          </button>
        </div>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-6">
          <h3 className="text-sm font-medium text-white mb-3">Zaproś firmę IT jako partnera</h3>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex items-center">
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} placeholder="slug-firmy"
                className="flex-1 px-3 py-2 bg-[#131B2E] border border-[#1E293B] rounded-l-lg text-white text-sm focus:border-violet-500 focus:outline-none" />
              <span className="px-2 py-2 bg-[#1E293B] border border-[#1E293B] rounded-r-lg text-zinc-400 text-xs">.infradesk.pl</span>
            </div>
            <select value={role} onChange={e => setRole(e.target.value)} className="px-3 py-2 bg-[#131B2E] border border-[#1E293B] rounded-lg text-white text-sm focus:outline-none">
              <option value="VIEWER">Podgląd</option>
              <option value="REMOTE_SUPPORT">Zdalna pomoc</option>
              <option value="FULL_MANAGEMENT">Pełne zarządzanie</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => inviteMut.mutate()} disabled={!slug || inviteMut.isPending}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm disabled:opacity-50">
              {inviteMut.isPending ? 'Wysyłam...' : 'Wyślij zaproszenie'}
            </button>
            <button onClick={() => { setShowInvite(false); setSlug(''); }} className="px-3 py-2 text-zinc-400 hover:text-white text-sm">Anuluj</button>
          </div>
        </div>
      )}

      {/* Guest link form */}
      {showGuest && (
        <div className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-6">
          <h3 className="text-sm font-medium text-white mb-3">Jednorazowy link dostępu</h3>
          <p className="text-xs text-zinc-500 mb-3">Link wygaśnie automatycznie. Osoba nie musi mieć konta.</p>
          <div className="flex gap-3">
            <input value={guestLabel} onChange={e => setGuestLabel(e.target.value)} placeholder="Opis (np. Serwisant kamer)"
              className="flex-1 px-3 py-2 bg-[#131B2E] border border-[#1E293B] rounded-lg text-white text-sm focus:outline-none" />
            <select value={guestHours} onChange={e => setGuestHours(Number(e.target.value))} className="px-3 py-2 bg-[#131B2E] border border-[#1E293B] rounded-lg text-white text-sm focus:outline-none">
              <option value={1}>1 godzina</option>
              <option value={4}>4 godziny</option>
              <option value={24}>24 godziny</option>
              <option value={72}>3 dni</option>
              <option value={168}>7 dni</option>
            </select>
            <button onClick={() => guestMut.mutate()} disabled={!guestLabel || guestMut.isPending}
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm disabled:opacity-50">
              {guestMut.isPending ? 'Tworzę...' : 'Generuj link'}
            </button>
            <button onClick={() => setShowGuest(false)} className="px-3 py-2 text-zinc-400 hover:text-white text-sm">Anuluj</button>
          </div>
        </div>
      )}

      {/* Pending incoming invitations */}
      {pendingIncoming.length > 0 && (
        <div className="bg-amber-500/5 rounded-xl border border-amber-500/20 p-4">
          <h3 className="text-sm font-medium text-amber-400 mb-3">Zaproszenia od klientów ({pendingIncoming.length})</h3>
          {pendingIncoming.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-[#060B1A] rounded-lg p-3 mb-2 last:mb-0">
              <div>
                <span className="text-white text-sm font-medium">{p.ownerTenant?.name}</span>
                <span className="text-zinc-500 text-xs ml-2">chce dodać Cię jako partnera</span>
                <RoleBadge role={p.role} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => respondMut.mutate({ id: p.id, accept: true })}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-600/30">
                  <Check className="h-3 w-3" /> Akceptuj
                </button>
                <button onClick={() => respondMut.mutate({ id: p.id, accept: false })}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg text-xs hover:bg-red-600/30">
                  <X className="h-3 w-3" /> Odrzuć
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My partners (as owner — I gave access) */}
      {asOwner.length > 0 && (
        <Section title="Moi partnerzy IT" subtitle="Firmy którym udostępniłeś infrastrukturę">
          {asOwner.map(p => (
            <PartnerRow key={p.id} p={p} direction="owner" onRevoke={() => revokeMut.mutate(p.id)} />
          ))}
        </Section>
      )}

      {/* Clients I support (as partner — they gave me access) */}
      {asPartner.filter(p => p.status === 'ACTIVE').length > 0 && (
        <Section title="Klienci partnerów" subtitle="Firmy które dały Ci dostęp do swojej infrastruktury">
          {asPartner.filter(p => p.status === 'ACTIVE').map(p => (
            <PartnerRow key={p.id} p={p} direction="partner" />
          ))}
        </Section>
      )}

      {/* Guest links */}
      {(guestLinks?.length ?? 0) > 0 && (
        <Section title="Linki jednorazowe" subtitle="Tymczasowy dostęp bez konta">
          {guestLinks!.map(g => {
            const expired = new Date(g.expiresAt) < new Date();
            return (
              <div key={g.id} className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link2 className={`h-4 w-4 ${expired ? 'text-zinc-600' : 'text-cyan-400'}`} />
                  <div>
                    <span className={`text-sm ${expired ? 'text-zinc-500' : 'text-white'}`}>{g.label}</span>
                    <span className="text-xs text-zinc-500 ml-2">
                      {expired ? 'Wygasł' : `do ${new Date(g.expiresAt).toLocaleString('pl-PL')}`}
                    </span>
                    {g.usedAt && <span className="text-xs text-emerald-400 ml-2">Użyty</span>}
                  </div>
                </div>
                {!expired && (
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/guest/${g.token}`); toast.success('Link skopiowany'); }}
                    className="p-1.5 hover:bg-white/5 rounded-lg"><Copy className="h-4 w-4 text-zinc-400" /></button>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {asOwner.length === 0 && asPartner.length === 0 && (
        <div className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-12 text-center">
          <LinkIcon className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">Nie masz jeszcze partnerów</p>
          <p className="text-xs text-zinc-500 mt-1">Dodaj firmę IT jako partnera lub poczekaj aż klient Cię zaprosi</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 mb-3">{subtitle}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const r = ROLE_LABELS[role] || ROLE_LABELS.VIEWER;
  const Icon = r.icon;
  return (
    <span className={`inline-flex items-center gap-1 ml-2 text-xs ${r.color}`}>
      <Icon className="h-3 w-3" /> {r.label}
    </span>
  );
}

function PartnerRow({ p, direction, onRevoke }: { p: Partnership; direction: 'owner' | 'partner'; onRevoke?: () => void }) {
  const name = direction === 'owner' ? p.partnerTenant?.name : p.ownerTenant?.name;
  const slug = direction === 'owner' ? p.partnerTenant?.slug : p.ownerTenant?.slug;
  const st = STATUS_LABELS[p.status] || STATUS_LABELS.REVOKED;

  return (
    <div className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-600/10 flex items-center justify-center">
          <LinkIcon className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium">{name || p.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
            <RoleBadge role={p.role} />
          </div>
          <span className="text-xs text-zinc-500">{slug}.infradesk.pl</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {p._count && (
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            <Monitor className="h-3 w-3" /> {p._count.sharedDevices}
          </span>
        )}
        {p.status === 'ACTIVE' && onRevoke && (
          <button onClick={onRevoke} className="p-1.5 hover:bg-red-600/10 rounded-lg" title="Cofnij">
            <Ban className="h-4 w-4 text-zinc-500 hover:text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
}
