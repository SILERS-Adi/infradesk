import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  Building2, User, ChevronLeft, X, CheckCircle2,
  Search, Loader2, Upload, ExternalLink, MapPin,
} from 'lucide-react';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { CityInput } from '../ui/CityInput';
import { getErrorMessage } from '../../utils/helpers';
import { useDebounce } from '../../hooks/useDebounce';
import type { Client } from '../../types';
import apiClient from '../../api/client';

// ── Step types ─────────────────────────────────────────────────────────────────
type Step = 'type' | 'identity' | 'contact' | 'address' | 'billing' | 'done';

// ── Nominatim ──────────────────────────────────────────────────────────────────
interface NominatimResult {
  display_name: string;
  address: {
    road?: string; house_number?: string; postcode?: string;
    city?: string; town?: string; village?: string;
  };
  extratags?: {
    phone?: string; 'contact:phone'?: string;
    email?: string; 'contact:email'?: string;
    website?: string; 'contact:website'?: string;
  };
}

function shortenCompanyName(name: string): string {
  let s = name
    .replace(/spółka z ograniczoną odpowiedzialnością/gi, 'Sp. z o.o.')
    .replace(/spółka akcyjna/gi, 'S.A.')
    .replace(/spółka komandytowa/gi, 'Sp.k.')
    .replace(/spółka jawna/gi, 'Sp.j.')
    .replace(/spółka partnerska/gi, 'Sp.p.')
    .replace(/spółka cywilna/gi, 'S.C.')
    .replace(/przedsiębiorstwo/gi, 'P.')
    .trim();
  if (s.length > 40) {
    const words = s.split(' ');
    let r = '';
    for (const w of words) {
      if ((r + ' ' + w).trim().length > 38) break;
      r = (r + ' ' + w).trim();
    }
    return r || s.slice(0, 38);
  }
  return s;
}

// ── Schemas ────────────────────────────────────────────────────────────────────
const identitySchema = z.object({
  clientType:   z.enum(['COMPANY', 'INDIVIDUAL']).default('COMPANY'),
  name:         z.string().optional(),
  firstName:    z.string().optional(),
  lastName:     z.string().optional(),
  legalName:    z.string().optional(),
  taxId:        z.string().optional(),
  status:       z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes:        z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.clientType === 'COMPANY' && !d.name?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['name'], message: 'Nazwa firmy jest wymagana' });
  }
  if (d.clientType === 'INDIVIDUAL') {
    if (!d.firstName?.trim()) ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'Imię jest wymagane' });
    if (!d.lastName?.trim())  ctx.addIssue({ code: 'custom', path: ['lastName'],  message: 'Nazwisko jest wymagane' });
  }
});

const contactSchema = z.object({
  email:   z.string().email('Podaj poprawny e-mail').optional().or(z.literal('')),
  phone:   z.string().optional(),
  website: z.string().optional(),
  logoUrl: z.string().optional(),
});

const addressSchema = z.object({
  addressLine1: z.string().optional(),
  postalCode:   z.string().optional(),
  city:         z.string().optional(),
  country:      z.string().optional(),
  createLocationFromAddress: z.boolean().default(false),
  locationName: z.string().optional(),
});

const billingSchema = z.object({
  billingType:                 z.enum(['HOURLY', 'CONTRACT']).default('HOURLY'),
  hourlyRate:                  z.string().optional(),
  billingIntervalMinutes:      z.string().optional(),
  contractHours:               z.string().optional(),
  contractMonthlyValue:        z.string().optional(),
  contractHourlyRateOverLimit: z.string().optional(),
  contractScope:               z.string().optional(),
  contractAttachmentUrl:       z.string().optional(),
  contractStartDate:           z.string().optional(),
});

type IdentityForm = z.infer<typeof identitySchema>;
type ContactForm  = z.infer<typeof contactSchema>;
type AddressForm  = z.infer<typeof addressSchema>;
type BillingForm  = z.infer<typeof billingSchema>;

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  client?: Client;
  onSuccess: () => void;
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────
export function ClientForm({ client, onSuccess, onCancel }: Props) {
  const isEdit = !!client;
  const qc = useQueryClient();

  // Wizard state
  const [step, setStep] = useState<Step>(isEdit ? 'identity' : 'type');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // NIP check state
  const [nipChecking, setNipChecking] = useState(false);
  const [nipStatus, setNipStatus] = useState<'ok' | 'taken' | null>(null);

  // Nominatim autocomplete
  const [nominatimResults, setNominatimResults] = useState<NominatimResult[]>([]);
  const [nominatimSearching, setNominatimSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // PDF upload
  const pdfRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Whether legalName was manually edited
  const legalNameTouched = useRef(false);

  // ── Forms ─────────────────────────────────────────────────────────────────────
  const identity = useForm<IdentityForm>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      clientType: (client?.clientType as 'COMPANY' | 'INDIVIDUAL') ?? 'COMPANY',
      name:       client?.name ?? '',
      firstName:  client?.firstName ?? '',
      lastName:   client?.lastName ?? '',
      legalName:  client?.legalName ?? '',
      taxId:      client?.taxId ?? '',
      status:     (client?.status as 'ACTIVE' | 'INACTIVE') ?? 'ACTIVE',
      notes:      client?.notes ?? '',
    },
  });

  const contact = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      email:   client?.email   ?? '',
      phone:   client?.phone   ?? '',
      website: client?.website ?? '',
      logoUrl: client?.logoUrl ?? '',
    },
  });

  const address = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      addressLine1: client?.addressLine1 ?? '',
      postalCode:   client?.postalCode   ?? '',
      city:         client?.city         ?? '',
      country:      client?.country      ?? 'PL',
      createLocationFromAddress: false,
      locationName: '',
    },
  });

  const billing = useForm<BillingForm>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      billingType:                 (client?.hasContract ? 'CONTRACT' : 'HOURLY') as 'HOURLY' | 'CONTRACT',
      hourlyRate:                  client?.hourlyRate?.toString() ?? '150',
      billingIntervalMinutes:      client?.billingIntervalMinutes?.toString() ?? '30',
      contractHours:               client?.contractHours?.toString() ?? '',
      contractMonthlyValue:        client?.contractMonthlyValue?.toString() ?? '',
      contractHourlyRateOverLimit: client?.contractHourlyRateOverLimit?.toString() ?? '',
      contractScope:               client?.contractScope ?? '',
      contractAttachmentUrl:       client?.contractAttachmentUrl ?? '',
      contractStartDate:           client?.contractStartDate?.slice(0, 10) ?? '',
    },
  });

  // Watch values
  const clientType  = identity.watch('clientType');
  const nameValue   = identity.watch('name');
  const taxId       = identity.watch('taxId');
  const logoUrl     = contact.watch('logoUrl');
  const attachUrl   = billing.watch('contractAttachmentUrl');
  const billingType = billing.watch('billingType');
  const addrLine1   = address.watch('addressLine1');
  const addrCity    = address.watch('city');
  const addrPostal  = address.watch('postalCode');
  const createLocFromAddr = address.watch('createLocationFromAddress');

  const debouncedTaxId = useDebounce(taxId ?? '', 600);
  const debouncedName  = useDebounce(nameValue ?? '', 1200);

  // NIP uniqueness check
  useEffect(() => {
    const nip = (debouncedTaxId ?? '').replace(/[\s-]/g, '');
    if (!nip || nip.length < 8) { setNipStatus(null); return; }
    setNipChecking(true);
    clientsApi.checkTaxId(nip, isEdit ? client?.id : undefined)
      .then(r => setNipStatus(r.exists ? 'taken' : 'ok'))
      .catch(() => setNipStatus(null))
      .finally(() => setNipChecking(false));
  }, [debouncedTaxId, isEdit, client?.id]);

  // Auto-fill legalName from name
  useEffect(() => {
    if (!isEdit && nameValue && clientType === 'COMPANY' && !legalNameTouched.current) {
      identity.setValue('legalName', shortenCompanyName(nameValue));
    }
  }, [nameValue, clientType, isEdit]);

  // Nominatim company search (auto + manual)
  const searchNominatim = (query: string) => {
    if (!query || query.length < 4) { setNominatimResults([]); setShowSuggestions(false); return; }
    setNominatimSearching(true);
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&extratags=1&countrycodes=pl`,
      { headers: { 'Accept-Language': 'pl', 'User-Agent': 'InfraDesk/1.0' } }
    )
      .then(r => r.json())
      .then((data: NominatimResult[]) => {
        const filtered = data.filter(d => d.address?.postcode || d.address?.city || d.address?.town);
        setNominatimResults(filtered.slice(0, 5));
        setShowSuggestions(filtered.length > 0);
        if (filtered.length === 0) toast('Brak wyników w OpenStreetMap', { icon: 'ℹ️' });
      })
      .catch(() => { setNominatimResults([]); setShowSuggestions(false); })
      .finally(() => setNominatimSearching(false));
  };

  // Auto Nominatim on company name change
  useEffect(() => {
    if (clientType === 'COMPANY' && step === 'identity' && debouncedName.length >= 4) {
      searchNominatim(debouncedName);
    }
  }, [debouncedName, clientType, step]);

  // ── Upload helpers ────────────────────────────────────────────────────────────
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await apiClient.post<{ url: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      contact.setValue('logoUrl', data.url);
      toast.success('Logo przesłane');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setUploading(false); if (logoRef.current) logoRef.current.value = ''; }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await apiClient.post<{ url: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      billing.setValue('contractAttachmentUrl', data.url);
      toast.success('Umowa przesłana');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setUploading(false); if (pdfRef.current) pdfRef.current.value = ''; }
  }

  // ── Final save ────────────────────────────────────────────────────────────────
  async function save() {
    if (nipStatus === 'taken') { toast.error('NIP już istnieje w bazie'); return; }
    setSaving(true);
    try {
      const id  = identity.getValues();
      const ct  = contact.getValues();
      const adr = address.getValues();
      const bil = billing.getValues();

      const finalName = id.clientType === 'INDIVIDUAL'
        ? `${id.lastName ?? ''} ${id.firstName ?? ''}`.trim()
        : id.name ?? '';

      const payload: Partial<Client> = {
        clientType:    id.clientType,
        name:          finalName,
        firstName:     id.clientType === 'INDIVIDUAL' ? (id.firstName || undefined) : undefined,
        lastName:      id.clientType === 'INDIVIDUAL' ? (id.lastName  || undefined) : undefined,
        legalName:     id.legalName  || undefined,
        taxId:         id.taxId      || undefined,
        status:        id.status,
        notes:         id.notes      || undefined,
        email:         ct.email      || undefined,
        phone:         ct.phone      || undefined,
        website:       ct.website    || undefined,
        logoUrl:       ct.logoUrl    || undefined,
        addressLine1:  adr.addressLine1 || undefined,
        postalCode:    adr.postalCode   || undefined,
        city:          adr.city         || undefined,
        country:       adr.country      || 'PL',
        hasContract:   bil.billingType === 'CONTRACT',
        billingIntervalMinutes: bil.billingIntervalMinutes ? parseInt(bil.billingIntervalMinutes) : 30,
        hourlyRate:    bil.billingType === 'HOURLY' && bil.hourlyRate ? parseFloat(bil.hourlyRate) : undefined,
        contractHours:               bil.billingType === 'CONTRACT' && bil.contractHours ? parseInt(bil.contractHours) : undefined,
        contractMonthlyValue:        bil.billingType === 'CONTRACT' && bil.contractMonthlyValue ? parseFloat(bil.contractMonthlyValue) : undefined,
        contractHourlyRateOverLimit: bil.billingType === 'CONTRACT' && bil.contractHourlyRateOverLimit ? parseFloat(bil.contractHourlyRateOverLimit) : undefined,
        contractScope:               bil.billingType === 'CONTRACT' ? (bil.contractScope || undefined) : undefined,
        contractAttachmentUrl:       bil.billingType === 'CONTRACT' ? (bil.contractAttachmentUrl || undefined) : undefined,
        contractStartDate:           bil.billingType === 'CONTRACT' && bil.contractStartDate ? bil.contractStartDate : undefined,
      };

      const saved = isEdit
        ? await clientsApi.update(client!.id, payload)
        : await clientsApi.create(payload);

      // Auto-create location from address
      if (!isEdit && adr.createLocationFromAddress && adr.addressLine1) {
        await locationsApi.create({
          clientId:    saved.id,
          name:        adr.locationName || 'Siedziba główna',
          type:        'Biuro',
          addressLine1: adr.addressLine1,
          postalCode:   adr.postalCode || '',
          city:         adr.city || '',
          country:      adr.country || 'PL',
        });
      }

      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success(isEdit ? 'Klient zaktualizowany' : 'Klient dodany');
      setStep('done');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Step navigation ───────────────────────────────────────────────────────────
  const STEPS: Step[] = isEdit
    ? ['identity', 'contact', 'address', 'billing']
    : ['type', 'identity', 'contact', 'address', 'billing'];

  const stepIdx = STEPS.indexOf(step === 'done' ? 'billing' : step);

  const goBack = () => {
    const idx = STEPS.indexOf(step as any);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const stepTitle: Record<Step, string> = {
    type:     'Typ klienta',
    identity: 'Dane podstawowe',
    contact:  'Kontakt',
    address:  'Adres',
    billing:  'Rozliczenia',
    done:     'Gotowe',
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          {step !== 'type' && step !== 'done' && !isEdit && (
            <button onClick={goBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {step === 'identity' && isEdit && (
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
              {(client?.name ?? '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? `Edytuj: ${client?.name ?? ''}` : 'Nowy klient'}
            </h2>
            {step !== 'done' && (
              <p className="text-xs text-gray-500">{stepTitle[step]}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {step !== 'done' && (
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div key={s} className={clsx(
                  'h-1.5 rounded-full transition-all',
                  i === stepIdx ? 'w-5 bg-indigo-600' : i < stepIdx ? 'w-1.5 bg-indigo-300' : 'w-1.5 bg-gray-200'
                )} />
              ))}
            </div>
          )}
          <button onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

        {/* ── DONE ──────────────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {isEdit ? 'Zaktualizowano!' : 'Klient dodany!'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {identity.getValues('clientType') === 'INDIVIDUAL'
                  ? `${identity.getValues('firstName')} ${identity.getValues('lastName')}`
                  : identity.getValues('name')
                }
              </p>
            </div>
            <button onClick={onSuccess}
              className="mt-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
              Gotowe
            </button>
          </div>
        )}

        {/* ── STEP: TYPE ────────────────────────────────────────────────────────── */}
        {step === 'type' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">Rodzaj klienta</p>
            <div className="grid grid-cols-1 gap-3">
              {([
                { value: 'COMPANY'    as const, label: 'Firma',           desc: 'Sp. z o.o., S.A., jednoosobowa działalność...', icon: '🏢' },
                { value: 'INDIVIDUAL' as const, label: 'Osoba prywatna',  desc: 'Klient indywidualny bez działalności',          icon: '👤' },
              ]).map(t => (
                <button key={t.value}
                  onClick={() => {
                    identity.setValue('clientType', t.value);
                    setStep('identity');
                  }}
                  className="flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                >
                  <span className="text-2xl flex-shrink-0">{t.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900">{t.label}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: IDENTITY ────────────────────────────────────────────────────── */}
        {step === 'identity' && (
          <form id="identity-form"
            onSubmit={identity.handleSubmit(() => setStep('contact'))}
            className="space-y-4"
          >
            {clientType === 'COMPANY' ? (
              <>
                {/* Company name + Nominatim lookup */}
                <div className="relative">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input
                        label="Nazwa firmy *"
                        autoComplete="off"
                        {...identity.register('name')}
                        error={identity.formState.errors.name?.message}
                      />
                    </div>
                    <button type="button"
                      onClick={() => searchNominatim(nameValue ?? '')}
                      disabled={nominatimSearching || !nameValue || nameValue.length < 3}
                      className="mb-0.5 flex-shrink-0 p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40"
                      title="Szukaj adresu firmy w OpenStreetMap"
                    >
                      {nominatimSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Nominatim suggestions */}
                  {showSuggestions && nominatimResults.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs text-gray-400 flex items-center gap-1.5">
                          <Search className="h-3 w-3" />
                          Kliknij aby uzupełnić adres
                        </span>
                      </div>
                      {nominatimResults.map((r, i) => {
                        const addr = r.address;
                        const street = [addr.road, addr.house_number].filter(Boolean).join(' ');
                        const cityName = addr.city || addr.town || addr.village || '';
                        return (
                          <button key={i} type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0 transition-colors"
                            onClick={() => {
                              if (street)       address.setValue('addressLine1', street);
                              if (addr.postcode) address.setValue('postalCode', addr.postcode);
                              if (cityName)      address.setValue('city', cityName);
                              const ext = r.extratags;
                              if (ext) {
                                const phone = ext.phone || ext['contact:phone'];
                                const email = ext.email || ext['contact:email'];
                                const web   = ext.website || ext['contact:website'];
                                if (phone) contact.setValue('phone', phone);
                                if (email) contact.setValue('email', email);
                                if (web)   contact.setValue('website', web);
                              }
                              setShowSuggestions(false);
                              toast.success('Dane uzupełnione z OpenStreetMap');
                            }}
                          >
                            <div className="text-sm font-medium text-gray-800 truncate">
                              {[street, cityName].filter(Boolean).join(', ') || r.display_name.slice(0, 60)}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {[addr.postcode, cityName].filter(Boolean).join(' ')}
                            </div>
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => setShowSuggestions(false)}
                        className="w-full px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 text-center">
                        Zamknij
                      </button>
                    </div>
                  )}
                </div>

                <Input
                  label="Nazwa skrócona"
                  placeholder="Wyświetlana w listach"
                  {...identity.register('legalName')}
                  onChange={(e) => {
                    legalNameTouched.current = true;
                    identity.register('legalName').onChange(e);
                  }}
                />

                <div>
                  <Input label="NIP" placeholder="1234567890" {...identity.register('taxId')} />
                  {nipChecking && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Sprawdzam...</p>}
                  {!nipChecking && nipStatus === 'ok'    && <p className="text-xs text-green-600 mt-1">✓ NIP dostępny</p>}
                  {!nipChecking && nipStatus === 'taken' && <p className="text-xs text-red-600 mt-1">✗ NIP już istnieje w bazie</p>}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Imię *" {...identity.register('firstName')} error={identity.formState.errors.firstName?.message} />
                <Input label="Nazwisko *" {...identity.register('lastName')} error={identity.formState.errors.lastName?.message} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <div className="flex gap-2">
                  {(['ACTIVE', 'INACTIVE'] as const).map(s => (
                    <button key={s} type="button"
                      onClick={() => identity.setValue('status', s)}
                      className={clsx(
                        'flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-colors',
                        identity.watch('status') === s
                          ? s === 'ACTIVE' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-400 bg-gray-100 text-gray-600'
                          : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      )}
                    >
                      {s === 'ACTIVE' ? 'Aktywny' : 'Nieaktywny'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Textarea label="Notatki" rows={2} {...identity.register('notes')} />
          </form>
        )}

        {/* ── STEP: CONTACT ─────────────────────────────────────────────────────── */}
        {step === 'contact' && (
          <form id="contact-form"
            onSubmit={contact.handleSubmit(() => setStep('address'))}
            className="space-y-4"
          >
            <Input label="Email" type="email" {...contact.register('email')} error={contact.formState.errors.email?.message} />
            <Input label="Telefon" {...contact.register('phone')} />
            <Input label="Strona WWW" placeholder="https://..." {...contact.register('website')} />

            {/* Logo */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Logo</label>
              {logoUrl ? (
                <div className="flex items-center gap-3">
                  <img src={logoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-xl border border-gray-200 bg-gray-50 p-1" />
                  <button type="button" onClick={() => contact.setValue('logoUrl', '')}
                    className="text-xs text-red-500 hover:text-red-700">Usuń</button>
                </div>
              ) : (
                <button type="button"
                  onClick={() => logoRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors w-full"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Przesyłam...' : 'Prześlij logo (PNG, SVG)'}
                </button>
              )}
              <input ref={logoRef} type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
              <input type="hidden" {...contact.register('logoUrl')} />
            </div>
          </form>
        )}

        {/* ── STEP: ADDRESS ─────────────────────────────────────────────────────── */}
        {step === 'address' && (
          <form id="address-form"
            onSubmit={address.handleSubmit(() => setStep('billing'))}
            className="space-y-4"
          >
            <Input label="Ulica i numer" placeholder="ul. Przykładowa 1" {...address.register('addressLine1')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Kod pocztowy" placeholder="00-000" {...address.register('postalCode')} />
              <CityInput
                label="Miasto"
                value={addrCity ?? ''}
                onChange={v => address.setValue('city', v)}
              />
            </div>

            {/* Create location toggle */}
            {!isEdit && addrLine1 && (
              <label className={clsx(
                'flex items-start gap-3 cursor-pointer rounded-xl p-3.5 border transition-colors',
                createLocFromAddr ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'
              )}>
                <div onClick={() => address.setValue('createLocationFromAddress', !createLocFromAddr)}
                  className={clsx('relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 mt-0.5',
                    createLocFromAddr ? 'bg-indigo-500' : 'bg-gray-300'
                  )}>
                  <span className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    createLocFromAddr && 'translate-x-4')} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Utwórz lokalizację z tego adresu</div>
                  <div className="text-xs text-gray-500">Automatycznie doda siedzibę główną</div>
                  {createLocFromAddr && (
                    <Input
                      label="Nazwa lokalizacji"
                      className="mt-2"
                      placeholder="Siedziba główna"
                      {...address.register('locationName')}
                    />
                  )}
                </div>
              </label>
            )}
          </form>
        )}

        {/* ── STEP: BILLING ─────────────────────────────────────────────────────── */}
        {step === 'billing' && (
          <form id="billing-form"
            onSubmit={billing.handleSubmit(() => save())}
            className="space-y-5"
          >
            {/* Type selector */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Model rozliczeń</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'HOURLY' as const,   label: 'Stawka godzinowa',  desc: 'Rozliczenie za czas pracy',     icon: '⏱️' },
                  { value: 'CONTRACT' as const,  label: 'Abonament / umowa', desc: 'Stała stawka miesięczna',       icon: '📄' },
                ]).map(t => (
                  <button key={t.value} type="button"
                    onClick={() => billing.setValue('billingType', t.value)}
                    className={clsx(
                      'flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-colors',
                      billingType === t.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <div className="text-sm font-semibold text-gray-900">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {billingType === 'HOURLY' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Stawka godzinowa (PLN)" type="number" step="0.01" {...billing.register('hourlyRate')} />
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Interwał rozliczeniowy</label>
                  <select
                    {...billing.register('billingIntervalMinutes')}
                    className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
              </div>
            )}

            {billingType === 'CONTRACT' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Godziny w abonamencie" type="number" {...billing.register('contractHours')} />
                  <Input label="Wartość miesięczna (PLN)" type="number" step="0.01" {...billing.register('contractMonthlyValue')} />
                  <Input label="Stawka za nadgodziny (PLN/h)" type="number" step="0.01" {...billing.register('contractHourlyRateOverLimit')} />
                  <Input label="Data rozpoczęcia" type="date" {...billing.register('contractStartDate')} />
                </div>
                <Textarea label="Zakres umowy" rows={2} {...billing.register('contractScope')} />

                {/* PDF upload */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Załącznik umowy (PDF)</label>
                  {attachUrl ? (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <a href={attachUrl} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-indigo-600 hover:underline flex-1 truncate">
                        <ExternalLink className="h-4 w-4 flex-shrink-0" />
                        Otwórz umowę
                      </a>
                      <button type="button" onClick={() => billing.setValue('contractAttachmentUrl', '')}
                        className="text-red-400 hover:text-red-600 text-xs">Usuń</button>
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => pdfRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors w-full"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? 'Przesyłam...' : 'Prześlij PDF umowy'}
                    </button>
                  )}
                  <input ref={pdfRef} type="file" accept=".pdf" className="sr-only" onChange={handlePdfUpload} />
                </div>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Footer */}
      {step === 'identity' && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex-shrink-0 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
          <Button type="submit" form="identity-form" disabled={nipStatus === 'taken'}>Dalej</Button>
        </div>
      )}
      {step === 'contact' && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex-shrink-0 flex justify-between gap-3">
          <Button variant="secondary" type="button" onClick={() => setStep('identity')}>Wstecz</Button>
          <Button type="submit" form="contact-form">Dalej</Button>
        </div>
      )}
      {step === 'address' && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex-shrink-0 flex justify-between gap-3">
          <Button variant="secondary" type="button" onClick={() => setStep('contact')}>Wstecz</Button>
          <Button type="submit" form="address-form">Dalej</Button>
        </div>
      )}
      {step === 'billing' && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex-shrink-0 flex justify-between gap-3">
          <Button variant="secondary" type="button" onClick={() => setStep('address')}>Wstecz</Button>
          <Button
            type="submit"
            form="billing-form"
            loading={saving}
            disabled={nipStatus === 'taken'}
          >
            {isEdit ? 'Zapisz zmiany' : 'Dodaj klienta'}
          </Button>
        </div>
      )}
    </div>
  );
}
