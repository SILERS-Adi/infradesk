import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  Building2, Save, Upload, Trash2, Phone, Mail, UserRound, HeadphonesIcon,
  Users, Server, UsersRound, CreditCard, AlertTriangle, Search, Check, Palette,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface Workspace {
  id: string;
  slug: string;
  name: string;
  type: string;
  taxId: string | null;
  regon: string | null;
  krs: string | null;
  logoUrl: string | null;
  primaryColor: string;
  locale: string;
  timezone: string;
  currency: string;
  plan: string;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  createdAt: string;
}

type CompanyForm = {
  name: string;
  taxId: string;
  regon: string;
  krs: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
};

type ContactForm = {
  infolinia: string;
  biuroEmail: string;
  opiekunName: string;
  opiekunPhone: string;
  opiekunEmail: string;
};

// Preset brand colors (V2 tokens + curated swatches)
const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Blue',   hex: '#3b82f6' },
  { name: 'Teal',   hex: '#14b8a6' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Amber',  hex: '#f59e0b' },
  { name: 'Rose',   hex: '#f43f5e' },
  { name: 'Slate',  hex: '#64748b' },
];

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  TEAM: 'Team',
  BUSINESS: 'Business',
  ENTERPRISE: 'Enterprise',
};

function errMsg(e: unknown, fallback: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function isHex6(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

// ─────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────
export function MyCompanyPage() {
  const qc = useQueryClient();

  // Workspace data
  const wsQ = useQuery<{ workspace: Workspace }>({
    queryKey: ['workspace', 'current'],
    queryFn: async () => (await api.get<{ workspace: Workspace }>('/workspaces/current')).data,
  });
  const ws = wsQ.data?.workspace ?? null;

  // Stats (concurrent)
  const statsQs = useQueries({
    queries: [
      {
        queryKey: ['clients', 'count-self'],
        queryFn: async () => {
          const r = await api.get<{ clients?: unknown[] }>('/clients');
          return Array.isArray(r.data.clients) ? r.data.clients.length : 0;
        },
      },
      {
        queryKey: ['devices', 'count-self'],
        queryFn: async () => {
          const r = await api.get<{ devices?: unknown[] }>('/devices');
          return Array.isArray(r.data.devices) ? r.data.devices.length : 0;
        },
      },
      {
        queryKey: ['memberships', 'count-self'],
        queryFn: async () => {
          const r = await api.get<{ memberships?: { status: string }[] }>('/memberships');
          const list = Array.isArray(r.data.memberships) ? r.data.memberships : [];
          return list.filter((m) => m.status === 'ACTIVE').length;
        },
      },
    ],
  });
  const [clientsQ, devicesQ, membersQ] = statsQs;

  if (wsQ.isLoading) return <LoadingSkeleton />;
  if (!ws) return null;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-[var(--sp-4)]">
      <HeroSection workspace={ws} onUpdated={() => qc.invalidateQueries({ queryKey: ['workspace', 'current'] })} />

      <StatsSection
        clients={clientsQ.data ?? null}
        devices={devicesQ.data ?? null}
        members={membersQ.data ?? null}
        loading={clientsQ.isLoading || devicesQ.isLoading || membersQ.isLoading}
      />

      <CompanyDataSection workspace={ws} onSaved={() => qc.invalidateQueries({ queryKey: ['workspace', 'current'] })} />

      <ContactSection />

      <PlanSection workspace={ws} />

      <DangerZoneSection workspaceName={ws.name} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-[var(--sp-4)]">
      <SkeletonCard />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Section 1 — Hero: Logo + Branding + Color
// ─────────────────────────────────────────────────────────
function HeroSection({ workspace, onUpdated }: { workspace: Workspace; onUpdated: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [colorDraft, setColorDraft] = useState(workspace.primaryColor || '#8b5cf6');

  useEffect(() => { setColorDraft(workspace.primaryColor || '#8b5cf6'); }, [workspace.primaryColor]);

  const currentLogo = localLogoPreview ?? workspace.logoUrl ?? null;

  const uploadLogoMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('logo', file);
      const r = await api.post<{ workspace: { logoUrl: string } }>('/workspaces/current/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
    onSuccess: () => {
      toast.success('Logo zapisane');
      setLocalLogoPreview(null);
      qc.invalidateQueries({ queryKey: ['workspace', 'current'] });
      onUpdated();
    },
    onError: (e) => {
      toast.error(errMsg(e, 'Nie udało się wysłać logo'));
      setLocalLogoPreview(null);
    },
    onSettled: () => setUploading(false),
  });

  const removeLogoMut = useMutation({
    mutationFn: async () => api.delete('/workspaces/current/logo'),
    onSuccess: () => {
      toast.success('Logo usunięte');
      setLocalLogoPreview(null);
      qc.invalidateQueries({ queryKey: ['workspace', 'current'] });
      onUpdated();
    },
    onError: (e) => toast.error(errMsg(e, 'Błąd usuwania logo')),
  });

  const colorMut = useMutation({
    mutationFn: async (hex: string) => api.patch('/workspaces/current', { primaryColor: hex }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', 'current'] });
      onUpdated();
    },
    onError: (e) => toast.error(errMsg(e, 'Błąd zmiany koloru')),
  });

  const handleFile = (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error('Plik jest większy niż 2 MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(f.type)) {
      toast.error('Dozwolone: PNG, JPG, WebP, SVG');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setLocalLogoPreview((ev.target?.result as string) ?? null);
    reader.readAsDataURL(f);
    setUploading(true);
    uploadLogoMut.mutate(f);
  };

  const handleColorPick = (hex: string) => {
    if (!isHex6(hex)) return;
    setColorDraft(hex);
    colorMut.mutate(hex);
  };

  const heroBorderColor = isHex6(colorDraft) ? colorDraft : 'var(--pri)';

  return (
    <Card
      className="relative overflow-hidden p-[var(--sp-5)]"
      style={{
        borderColor: heroBorderColor,
        background: `linear-gradient(135deg, color-mix(in srgb, ${heroBorderColor} 8%, transparent) 0%, transparent 55%)`,
      }}
    >
      <div className="flex items-start gap-[var(--sp-4)] flex-wrap">
        {/* Logo area */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="group relative w-[120px] h-[120px] rounded-[var(--r-l)] border-2 border-dashed overflow-hidden flex items-center justify-center transition-all hover:scale-[1.02] disabled:opacity-60"
            style={{ borderColor: heroBorderColor, background: 'var(--sf2)' }}
            aria-label="Wgraj logo"
          >
            {currentLogo ? (
              <img src={currentLogo} alt="Logo firmy" className="w-full h-full object-contain" />
            ) : (
              <Building2 size={44} style={{ color: heroBorderColor, opacity: 0.6 }} />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-[11px] font-semibold flex items-center gap-1.5">
                <Upload size={14} />
                {currentLogo ? 'Zmień' : 'Wgraj'}
              </span>
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-white text-[11px]">Wysyłam...</span>
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-[11px] text-tx3 hover:text-tx underline-offset-2 hover:underline"
            >
              {currentLogo ? 'Zmień' : 'Wgraj logo'}
            </button>
            {workspace.logoUrl && (
              <>
                <span className="text-tx3 text-[11px]">·</span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Usunąć logo firmy?')) removeLogoMut.mutate();
                  }}
                  className="text-[11px] text-[var(--er)] hover:brightness-110"
                >
                  Usuń
                </button>
              </>
            )}
          </div>
          <p className="text-[10px] text-tx3 text-center">PNG, JPG, WebP, SVG · max 2MB</p>
        </div>

        {/* Right: name + badges + color picker */}
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[26px] font-black leading-tight text-tx">{workspace.name}</h1>
            <Badge variant="accent">{workspace.type}</Badge>
            <Badge variant="neutral">Plan {PLAN_LABELS[workspace.plan] ?? workspace.plan}</Badge>
          </div>
          <div className="text-[12px] text-tx3 mt-1">
            <code className="px-1.5 py-0.5 rounded bg-sf-h border border-bd">{workspace.slug}.infradesk.pl</code>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Palette size={14} style={{ color: heroBorderColor }} />
              <span className="text-[11px] uppercase tracking-wider text-tx3 font-bold">Kolor marki</span>
              {colorMut.isPending && <span className="text-[11px] text-tx3">zapisywanie...</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((c) => {
                const active = colorDraft.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => handleColorPick(c.hex)}
                    className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
                    style={{
                      background: c.hex,
                      borderColor: active ? 'var(--tx)' : 'transparent',
                      boxShadow: active ? `0 0 0 2px ${c.hex}` : undefined,
                    }}
                    aria-label={`Kolor ${c.name}`}
                    title={c.name}
                  >
                    {active && <Check size={14} className="text-white" />}
                  </button>
                );
              })}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="color"
                  value={isHex6(colorDraft) ? colorDraft : '#8b5cf6'}
                  onChange={(e) => setColorDraft(e.target.value)}
                  onBlur={(e) => handleColorPick(e.target.value)}
                  className="h-8 w-10 rounded cursor-pointer bg-transparent border border-bd"
                  title="Wybierz dowolny kolor"
                />
                <input
                  type="text"
                  value={colorDraft}
                  onChange={(e) => setColorDraft(e.target.value)}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (isHex6(v)) handleColorPick(v);
                    else setColorDraft(workspace.primaryColor || '#8b5cf6');
                  }}
                  placeholder="#RRGGBB"
                  maxLength={7}
                  className="h-8 w-24 rounded border border-bd bg-sf2 px-2 text-[12px] font-mono text-tx"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// Section 2 — Stats
// ─────────────────────────────────────────────────────────
function StatsSection({
  clients, devices, members, loading,
}: { clients: number | null; devices: number | null; members: number | null; loading: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <>
          <StatCard icon={Users} label="Klienci" value={clients ?? 0} accent="primary" />
          <StatCard icon={Server} label="Urządzenia" value={devices ?? 0} accent="success" />
          <StatCard icon={UsersRound} label="Członkowie zespołu" value={members ?? 0} accent="warning" />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Section 3 — Company data
// ─────────────────────────────────────────────────────────
function CompanyDataSection({ workspace, onSaved }: { workspace: Workspace; onSaved: () => void }) {
  const [ceidgLoading, setCeidgLoading] = useState(false);

  const { register, handleSubmit, reset, formState: { isDirty, isSubmitting }, setValue, watch } =
    useForm<CompanyForm>({
      defaultValues: {
        name: workspace.name ?? '',
        taxId: workspace.taxId ?? '',
        regon: workspace.regon ?? '',
        krs: workspace.krs ?? '',
        addressLine1: workspace.addressLine1 ?? '',
        postalCode: workspace.postalCode ?? '',
        city: workspace.city ?? '',
        country: workspace.country ?? 'PL',
        email: workspace.email ?? '',
        phone: workspace.phone ?? '',
        website: workspace.website ?? '',
      },
    });

  useEffect(() => {
    reset({
      name: workspace.name ?? '',
      taxId: workspace.taxId ?? '',
      regon: workspace.regon ?? '',
      krs: workspace.krs ?? '',
      addressLine1: workspace.addressLine1 ?? '',
      postalCode: workspace.postalCode ?? '',
      city: workspace.city ?? '',
      country: workspace.country ?? 'PL',
      email: workspace.email ?? '',
      phone: workspace.phone ?? '',
      website: workspace.website ?? '',
    });
  }, [workspace, reset]);

  const saveMut = useMutation({
    mutationFn: async (values: CompanyForm) => {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        const sv = typeof v === 'string' ? v.trim() : v;
        if (sv === '' || sv === null || sv === undefined) {
          if (['name', 'country'].includes(k)) continue; // required
          payload[k] = null;
        } else payload[k] = sv;
      }
      await api.patch('/workspaces/current', payload);
    },
    onSuccess: () => {
      toast.success('Zapisano dane firmy');
      onSaved();
    },
    onError: (e) => toast.error(errMsg(e, 'Błąd zapisu danych firmy')),
  });

  const fetchCeidg = async () => {
    const nip = (watch('taxId') ?? '').replace(/[^0-9]/g, '');
    if (nip.length !== 10) {
      toast.error('Wprowadź poprawny NIP (10 cyfr)');
      return;
    }
    setCeidgLoading(true);
    try {
      const r = await api.get<{
        found: boolean;
        data?: { name?: string; taxId?: string; regon?: string; addressLine1?: string; postalCode?: string; city?: string };
      }>('/clients/lookup/ceidg', { params: { nip } });
      if (!r.data.found || !r.data.data) {
        toast.error('Nie znaleziono firmy w CEIDG');
        return;
      }
      const d = r.data.data;
      if (d.name) setValue('name', d.name, { shouldDirty: true });
      if (d.regon) setValue('regon', d.regon, { shouldDirty: true });
      if (d.addressLine1) setValue('addressLine1', d.addressLine1, { shouldDirty: true });
      if (d.postalCode) setValue('postalCode', d.postalCode, { shouldDirty: true });
      if (d.city) setValue('city', d.city, { shouldDirty: true });
      toast.success('Pobrano dane z CEIDG');
    } catch (e) {
      toast.error(errMsg(e, 'Błąd pobierania z CEIDG'));
    } finally {
      setCeidgLoading(false);
    }
  };

  const canSave = isDirty && !isSubmitting && !saveMut.isPending;

  return (
    <Card className="p-[var(--sp-5)]">
      <SectionHeader
        title="Dane firmy"
        subtitle="Podstawowe informacje rejestrowe i kontaktowe Twojej organizacji"
      />
      <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
          <Field label="Nazwa firmy" required wide>
            <Input {...register('name', { required: true })} />
          </Field>
          <Field label="NIP">
            <div className="flex gap-2">
              <Input {...register('taxId')} placeholder="0000000000" maxLength={13} />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={fetchCeidg}
                disabled={ceidgLoading}
                className="shrink-0"
              >
                <Search size={14} />
                {ceidgLoading ? 'Szukam...' : 'CEIDG'}
              </Button>
            </div>
          </Field>
          <Field label="REGON"><Input {...register('regon')} /></Field>
          <Field label="KRS"><Input {...register('krs')} /></Field>
          <Field label="Ulica i numer" wide><Input {...register('addressLine1')} /></Field>
          <Field label="Kod pocztowy"><Input {...register('postalCode')} placeholder="00-000" /></Field>
          <Field label="Miasto"><Input {...register('city')} /></Field>
          <Field label="Kraj (ISO-2)">
            <Select {...register('country')}>
              <option value="PL">Polska</option>
              <option value="DE">Niemcy</option>
              <option value="CZ">Czechy</option>
              <option value="SK">Słowacja</option>
              <option value="UK">Wielka Brytania</option>
              <option value="US">USA</option>
            </Select>
          </Field>
          <Field label="Telefon"><Input {...register('phone')} /></Field>
          <Field label="Email"><Input type="email" {...register('email')} /></Field>
          <Field label="Website" wide><Input {...register('website')} placeholder="https://..." /></Field>
        </div>

        <div className="mt-[var(--sp-4)] flex justify-end">
          <Button type="submit" disabled={!canSave} className="gap-1.5">
            <Save size={14} />
            {saveMut.isPending ? 'Zapisywanie...' : 'Zapisz dane firmy'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// Section 4 — Public contact info (what clients see in portal)
// ─────────────────────────────────────────────────────────
function ContactSection() {
  const qc = useQueryClient();
  const contactQ = useQuery<{ value: ContactForm | null }>({
    queryKey: ['settings', 'contact'],
    queryFn: async () => (await api.get('/settings/contact')).data,
  });

  const defaults: ContactForm = {
    infolinia: '',
    biuroEmail: '',
    opiekunName: '',
    opiekunPhone: '',
    opiekunEmail: '',
  };

  const { register, handleSubmit, reset, formState: { isDirty, isSubmitting } } = useForm<ContactForm>({
    defaultValues: defaults,
  });

  useEffect(() => {
    if (contactQ.data) {
      reset({ ...defaults, ...(contactQ.data.value ?? {}) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactQ.data, reset]);

  const saveMut = useMutation({
    mutationFn: async (v: ContactForm) => api.put('/settings/contact', { value: v }),
    onSuccess: () => {
      toast.success('Dane kontaktowe zapisane');
      qc.invalidateQueries({ queryKey: ['settings', 'contact'] });
    },
    onError: (e) => toast.error(errMsg(e, 'Błąd zapisu')),
  });

  const canSave = isDirty && !isSubmitting && !saveMut.isPending;

  return (
    <Card className="p-[var(--sp-5)]">
      <SectionHeader
        title="Kontakt dla klientów"
        subtitle="Dane widoczne w portalu klienta — infolinia, email biura, opiekun handlowy"
      />
      {contactQ.isLoading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
            <Field label="Infolinia (publiczny telefon)" icon={<Phone size={12} />}>
              <Input {...register('infolinia')} placeholder="+48 ..." />
            </Field>
            <Field label="Email biura" icon={<Mail size={12} />}>
              <Input type="email" {...register('biuroEmail')} placeholder="biuro@..." />
            </Field>
            <Field label="Imię i nazwisko opiekuna" icon={<UserRound size={12} />} wide>
              <Input {...register('opiekunName')} />
            </Field>
            <Field label="Telefon opiekuna" icon={<HeadphonesIcon size={12} />}>
              <Input {...register('opiekunPhone')} />
            </Field>
            <Field label="Email opiekuna" icon={<Mail size={12} />}>
              <Input type="email" {...register('opiekunEmail')} />
            </Field>
          </div>
          <div className="mt-[var(--sp-4)] flex justify-end">
            <Button type="submit" disabled={!canSave} className="gap-1.5">
              <Save size={14} />
              {saveMut.isPending ? 'Zapisywanie...' : 'Zapisz kontakt'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// Section 5 — Plan & subscription
// ─────────────────────────────────────────────────────────
function PlanSection({ workspace }: { workspace: Workspace }) {
  const planLabel = PLAN_LABELS[workspace.plan] ?? workspace.plan;
  const started = workspace.planStartedAt ? new Date(workspace.planStartedAt).toLocaleDateString('pl-PL') : '—';
  const expires = workspace.planExpiresAt ? new Date(workspace.planExpiresAt).toLocaleDateString('pl-PL') : 'Bezterminowo';

  return (
    <Card className="p-[var(--sp-5)]">
      <SectionHeader
        title="Plan i subskrypcja"
        subtitle="Twój aktualny plan, daty rozliczeniowe oraz opcje zmiany"
      />
      <div className="mt-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4">
          <div
            className="w-11 h-11 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--pri) 12%, transparent)' }}
          >
            <CreditCard size={20} style={{ color: 'var(--pri)' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-black text-tx">{planLabel}</span>
              <Badge variant="accent">Aktywny</Badge>
            </div>
            <div className="text-[12px] text-tx3 mt-1">
              Rozpoczęty: <span className="text-tx2">{started}</span>
              <span className="mx-2">·</span>
              Wygasa: <span className="text-tx2">{expires}</span>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => toast('Strona cennika wkrótce', { icon: 'i' })}
        >
          Przejdź na wyższy plan
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// Section 6 — Danger zone
// ─────────────────────────────────────────────────────────
function DangerZoneSection({ workspaceName }: { workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');

  const typedOk = confirmName.trim() === workspaceName && confirmPhrase.trim().toUpperCase() === 'USUŃ';

  const deleteMut = useMutation({
    mutationFn: async () => api.delete('/workspaces/current'),
    onSuccess: () => toast.success('Żądanie usunięcia zostało przyjęte'),
    onError: (e) => toast.error(errMsg(e, 'Usuwanie firmy nie jest jeszcze zaimplementowane po stronie backendu')),
  });

  return (
    <Card
      className="p-[var(--sp-5)]"
      style={{ borderColor: 'var(--er-b)', background: 'color-mix(in srgb, var(--er) 3%, transparent)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
            style={{ background: 'var(--er-l)', border: '1px solid var(--er-b)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--er)' }} />
          </div>
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: 'var(--er)' }}>Strefa niebezpieczna</h2>
            <p className="text-[12px] text-tx3 mt-0.5">
              Trwałe operacje — usunięcie firmy, czyszczenie danych. Działania nieodwracalne.
            </p>
          </div>
        </div>
        <span className="text-[12px] text-tx3">{open ? 'Zwiń' : 'Rozwiń'}</span>
      </button>

      {open && (
        <div className="mt-5 p-4 rounded-[var(--r-s)] border" style={{ borderColor: 'var(--er-b)', background: 'var(--sf)' }}>
          <h3 className="text-[14px] font-semibold text-tx">Usuń firmę</h3>
          <p className="text-[12px] text-tx3 mt-1">
            Usunięcie firmy spowoduje utratę dostępu do wszystkich zgłoszeń, urządzeń i danych klientów.
            Aby potwierdzić, wpisz nazwę firmy oraz słowo <code className="px-1 bg-sf-h rounded">USUŃ</code>.
          </p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
            <Field label={`Wpisz: ${workspaceName}`}>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={workspaceName}
              />
            </Field>
            <Field label="Wpisz: USUŃ">
              <Input
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="USUŃ"
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="danger"
              disabled={!typedOk || deleteMut.isPending}
              onClick={() => {
                if (!typedOk) return;
                if (!confirm(`OSTATECZNE potwierdzenie — usunąć "${workspaceName}"?`)) return;
                deleteMut.mutate();
              }}
              className="gap-1.5"
            >
              <Trash2 size={14} />
              {deleteMut.isPending ? 'Usuwam...' : 'Usuń firmę na zawsze'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-bold text-tx">{title}</h2>
      {subtitle && <p className="text-[12px] text-tx3 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Field({
  label, children, wide, required, icon,
}: { label: string; children: React.ReactNode; wide?: boolean; required?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <label className="text-[11px] text-tx3 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
        {icon}
        {label}
        {required && <span className="text-[var(--er)]">*</span>}
      </label>
      {children}
    </div>
  );
}

// Suppress unused — reserved for memoized derived values (future)
void useMemo;
