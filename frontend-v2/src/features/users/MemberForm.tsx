import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X, Loader2, CheckCircle2, AlertCircle, Shield, User as UserIcon, Eye, ChevronLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionTreeEditor, type Override } from './components/PermissionTreeEditor';
import { PermissionSchemas } from './components/PermissionSchemas';

type AccountType = 'ADMIN' | 'USER';
type AccessScope = 'FULL' | 'RESTRICTED';
type Variant = 'modal' | 'page';

interface Props {
  onClose: () => void;
  variant?: Variant;
}

export function MemberForm(props: Props) {
  return <MemberFormCore variant="modal" {...props} />;
}

export function MemberFormCore({ onClose, variant = 'modal' }: Props) {
  const qc = useQueryClient();
  const nav = useNavigate();

  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'found' | 'not_found'>('idle');
  const [foundUser, setFoundUser] = useState<{ id: string; firstName: string; lastName: string; avatarUrl?: string | null } | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const [accountType, setAccountType] = useState<AccountType>('USER');
  const [accessScope, setAccessScope] = useState<AccessScope>('FULL');
  const [overrides, setOverrides] = useState<Override[]>([]);

  // Workspace context
  const wsQ = useQuery<{ workspace: { type: string; name: string } }>({
    queryKey: ['workspace', 'current'],
    queryFn: async () => (await api.get('/workspaces/current')).data,
  });
  const wsType = wsQ.data?.workspace.type ?? 'MSP';
  const isMsp = wsType === 'MSP' || wsType === 'INTERNAL_IT';
  const isClient = wsType === 'CLIENT';

  // Live email lookup
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setEmailStatus('idle');
      setFoundUser(null);
      return;
    }
    setEmailStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const r = await api.get('/users/search', { params: { email } });
        if (r.data.user) {
          setEmailStatus('found');
          setFoundUser(r.data.user);
          setFirstName(r.data.user.firstName ?? '');
          setLastName(r.data.user.lastName ?? '');
          setPhone(r.data.user.phone ?? '');
        } else {
          setEmailStatus('not_found');
          setFoundUser(null);
        }
      } catch {
        setEmailStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [email]);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!email || !firstName || !lastName) throw new Error('Wypełnij email, imię i nazwisko');
      const role = accountType === 'ADMIN' ? 'ADMIN' : 'MEMBER';
      const scope = accessScope === 'RESTRICTED' ? 'SCOPED' : 'FULL';

      // Map overrides (tree nodeId + FULL/VIEW/NONE) → PermissionOverride (moduleKey + NONE/VIEW/EDIT/DELETE)
      const backendOverrides = overrides.map((o) => ({
        moduleKey: leafModuleKey(o.nodeId),
        level: mapLevel(o.level),
      })).filter((o) => o.moduleKey);

      const invite = await api.post('/memberships/invite', {
        email, firstName, lastName, role, scope,
        phone: phone || undefined,
      });
      const membershipId = invite.data?.membership?.id;

      // If restricted, write overrides
      if (scope === 'SCOPED' && membershipId && backendOverrides.length > 0) {
        await api.put(`/permissions/${membershipId}/overrides`, { overrides: backendOverrides });
      }
      return invite.data;
    },
    onSuccess: () => {
      toast.success('Użytkownik zaproszony');
      qc.invalidateQueries({ queryKey: ['memberships'] });
      if (variant === 'page') nav('/users');
      else onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Błąd';
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? msg);
    },
  });

  const canSubmit = email && firstName && lastName && emailStatus !== 'checking';

  const body = (
    <div style={variant === 'modal' ? { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '20px 24px' } : { padding: '24px' }}
      className="space-y-5"
    >
      {/* EMAIL z live lookup */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 block mb-1">Email użytkownika *</label>
        <div className="relative">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="jan@firma.pl" autoFocus className="pr-10" />
          {emailStatus === 'checking' && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tx3 animate-spin" />
          )}
          {emailStatus === 'found' && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ok" />
          )}
          {emailStatus === 'not_found' && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-wn" />
          )}
        </div>
        {emailStatus === 'found' && foundUser && (
          <p className="text-[11px] text-ok mt-1">
            ✓ Znaleziono w InfraDesk: <strong>{foundUser.firstName} {foundUser.lastName}</strong> — dodamy go do tego workspace
          </p>
        )}
        {emailStatus === 'not_found' && (
          <p className="text-[11px] text-wn mt-1">
            Nowy użytkownik — zostanie utworzony i dostanie email z zaproszeniem
          </p>
        )}
      </div>

      {/* Imię + Nazwisko + Telefon */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Imię *</label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={emailStatus === 'found'} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Nazwisko *</label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={emailStatus === 'found'} />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-1">Telefon</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="501 234 567"
          disabled={emailStatus === 'found'} />
      </div>

      {/* TYP KONTA */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 block mb-2">Typ konta</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button"
            onClick={() => { setAccountType('ADMIN'); setAccessScope('FULL'); }}
            className="p-3 rounded-[var(--r-s)] border text-left transition-colors"
            style={{
              borderColor: accountType === 'ADMIN' ? '#8B5CF6' : 'var(--bd)',
              background: accountType === 'ADMIN' ? 'rgba(139,92,246,0.08)' : 'transparent',
            }}
          >
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" style={{ color: accountType === 'ADMIN' ? '#8B5CF6' : 'var(--tx3)' }} />
              <span className="text-[13px] font-semibold" style={{ color: accountType === 'ADMIN' ? '#8B5CF6' : 'var(--tx)' }}>
                Administrator
              </span>
            </div>
            <div className="text-[11px] text-tx3 mt-1">
              Pełny dostęp do firmy, zarządzanie użytkownikami i ustawieniami
            </div>
          </button>
          <button type="button"
            onClick={() => setAccountType('USER')}
            className="p-3 rounded-[var(--r-s)] border text-left transition-colors"
            style={{
              borderColor: accountType === 'USER' ? 'var(--pri)' : 'var(--bd)',
              background: accountType === 'USER' ? 'var(--pri-l)' : 'transparent',
            }}
          >
            <div className="flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" style={{ color: accountType === 'USER' ? 'var(--pri)' : 'var(--tx3)' }} />
              <span className="text-[13px] font-semibold" style={{ color: accountType === 'USER' ? 'var(--pri)' : 'var(--tx)' }}>
                {isMsp ? 'Członek zespołu' : isClient ? 'Pracownik firmy' : 'Użytkownik'}
              </span>
            </div>
            <div className="text-[11px] text-tx3 mt-1">
              {isMsp ? 'Technik/pracownik — dostęp wg zakresu uprawnień' : isClient ? 'Portal klienta, własne zgłoszenia i hasła' : 'Dostęp do wybranych modułów'}
            </div>
          </button>
        </div>
      </div>

      {/* Komunikat dla Admin */}
      {accountType === 'ADMIN' && (
        <div className="p-3 rounded-[var(--r-s)]" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <p className="text-[12px] text-tx2">
            <strong style={{ color: '#8B5CF6' }}>Administrator</strong> ma pełny dostęp do wszystkich modułów, użytkowników, ustawień i danych firmy. Nie trzeba konfigurować drzewa uprawnień.
          </p>
        </div>
      )}

      {/* ZAKRES DOSTĘPU (tylko USER) */}
      {accountType === 'USER' && (
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 block mb-2">Zakres dostępu</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAccessScope('FULL')}
              className="p-3 rounded-[var(--r-s)] border text-left transition-colors"
              style={{
                borderColor: accessScope === 'FULL' ? 'var(--ok)' : 'var(--bd)',
                background: accessScope === 'FULL' ? 'var(--ok-l)' : 'transparent',
              }}
            >
              <div className="text-[13px] font-semibold" style={{ color: accessScope === 'FULL' ? 'var(--ok)' : 'var(--tx)' }}>Pełny dostęp</div>
              <div className="text-[11px] text-tx3 mt-1">Dostęp do wszystkich modułów (bez admina firmy)</div>
            </button>
            <button type="button" onClick={() => setAccessScope('RESTRICTED')}
              className="p-3 rounded-[var(--r-s)] border text-left transition-colors"
              style={{
                borderColor: accessScope === 'RESTRICTED' ? 'var(--wn)' : 'var(--bd)',
                background: accessScope === 'RESTRICTED' ? 'var(--wn-l)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-1.5">
                <Eye className="h-3 w-3" style={{ color: accessScope === 'RESTRICTED' ? 'var(--wn)' : 'var(--tx3)' }} />
                <span className="text-[13px] font-semibold" style={{ color: accessScope === 'RESTRICTED' ? 'var(--wn)' : 'var(--tx)' }}>Spersonalizowany</span>
              </div>
              <div className="text-[11px] text-tx3 mt-1">Dostęp ustawiany indywidualnie per moduł</div>
            </button>
          </div>
        </div>
      )}

      {/* DRZEWO UPRAWNIEŃ + SCHEMATY (gdy Restricted) */}
      {accountType === 'USER' && accessScope === 'RESTRICTED' && (
        <div className="space-y-3">
          <PermissionSchemas currentOverrides={overrides} onApply={setOverrides} />
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 block mb-2">Drzewo uprawnień</label>
            <PermissionTreeEditor overrides={overrides} onChange={setOverrides} />
            <p className="text-[10px] text-tx3 mt-2">
              Podmoduły dziedziczą poziom nadrzędny (ikonka „dz."). Nadpisz ręcznie dla konkretnych podmodułów.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const header = (
    <div className="flex items-center justify-between border-b border-bd px-6 py-4" style={{ flexShrink: 0 }}>
      <div className="flex items-center gap-2">
        {variant === 'page' && (
          <button type="button" onClick={() => nav('/users')} className="p-1.5 rounded hover:bg-sf-h text-tx3" title="Wróć">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="text-[16px] font-bold text-tx">Zaproś użytkownika</h2>
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

  const footer = (
    <div className="flex items-center justify-end gap-2 border-t border-bd bg-sf-h px-6 py-3" style={{ flexShrink: 0 }}>
      <Button variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button onClick={() => submitMut.mutate()} disabled={!canSubmit || submitMut.isPending}>
        {submitMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Zapraszanie…</> : 'Zaproś'}
      </Button>
    </div>
  );

  if (variant === 'page') {
    return (
      <div className="max-w-[52rem] mx-auto" style={{
        background: 'var(--sf)', border: '1px solid var(--bd)',
        borderRadius: 'var(--r-xl)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', minHeight: '70vh',
      }}>
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
        <Dialog.Content style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 50, width: 'min(96vw, 44rem)', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--sf)', border: '1px solid var(--bd)',
          borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh4)', overflow: 'hidden',
        }}>
          <Dialog.Title className="sr-only">Zaproś użytkownika</Dialog.Title>
          {header}
          {body}
          {footer}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Map tree level (FULL/VIEW/NONE) to PermissionOverride level (NONE/VIEW/EDIT/DELETE)
function mapLevel(level: 'FULL' | 'VIEW' | 'NONE'): 'NONE' | 'VIEW' | 'EDIT' | 'DELETE' {
  if (level === 'FULL') return 'EDIT';
  if (level === 'VIEW') return 'VIEW';
  return 'NONE';
}

// Map tree nodeId (e.g. "service-desk.tickets") to module key (e.g. "tickets")
function leafModuleKey(nodeId: string): string {
  // Prosta reguła: ostatni segment po ostatniej kropce = moduleKey
  const parts = nodeId.split('.');
  return parts[parts.length - 1]!;
}

export function MemberFormPage() {
  const nav = useNavigate();
  return <MemberFormCore variant="page" onClose={() => nav('/users')} />;
}
