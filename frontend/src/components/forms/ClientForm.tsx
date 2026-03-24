import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  Building2, User, MapPin, DollarSign, Monitor, Users,
  FileText, ChevronDown, Upload, X, ExternalLink, CheckCircle2,
  AlertCircle, Globe, Mail, Phone, Clock, Calendar, Loader2, Search,
} from 'lucide-react';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { usersApi } from '../../api/users';
import { devicesApi } from '../../api/devices';
import { Input } from '../ui/Input';
import { CityInput } from '../ui/CityInput';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { Client } from '../../types';
import apiClient from '../../api/client';

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  clientType:   z.enum(['COMPANY', 'INDIVIDUAL']).default('COMPANY'),
  // COMPANY
  name:         z.string().min(1, 'Nazwa jest wymagana'),
  legalName:    z.string().optional(),
  taxId:        z.string().optional(),
  // INDIVIDUAL
  firstName:    z.string().optional(),
  lastName:     z.string().optional(),
  // Contact
  email:        z.string().email('Podaj poprawny e-mail').optional().or(z.literal('')),
  phone:        z.string().optional(),
  website:      z.string().optional(),
  logoUrl:      z.string().optional(),
  // Address
  addressLine1: z.string().optional(),
  postalCode:   z.string().optional(),
  city:         z.string().optional(),
  country:      z.string().optional(),
  // Create location from address?
  createLocationFromAddress: z.boolean().default(false),
  locationName: z.string().optional(),
  // Billing
  billingType:            z.enum(['HOURLY', 'CONTRACT']).default('HOURLY'),
  hourlyRate:             z.string().optional(),
  billingIntervalMinutes: z.string().optional(),
  contractHours:               z.string().optional(),
  contractMonthlyValue:        z.string().optional(),
  contractHourlyRateOverLimit: z.string().optional(),
  contractScope:               z.string().optional(),
  contractAttachmentUrl:       z.string().optional(),
  contractStartDate:           z.string().optional(),
  // New location (separate section)
  createLocation: z.boolean().default(false),
  locName:        z.string().optional(),
  locType:        z.string().optional(),
  locAddress:     z.string().optional(),
  locCity:        z.string().optional(),
  locPostal:      z.string().optional(),
  // New user
  createUser:    z.boolean().default(false),
  userFirstName: z.string().optional(),
  userLastName:  z.string().optional(),
  userEmail:     z.string().optional(),
  userPassword:  z.string().optional(),
  userPhone:     z.string().optional(),
  // New device
  createDevice:     z.boolean().default(false),
  deviceName:       z.string().optional(),
  deviceType:       z.string().optional(),
  deviceIp:         z.string().optional(),
  deviceSerial:     z.string().optional(),
  deviceModel:      z.string().optional(),
  // Notes
  notes:  z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).superRefine((data, ctx) => {
  if (data.createLocation && !data.locName?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['locName'], message: 'Nazwa lokalizacji jest wymagana' });
  }
  if (data.createUser) {
    if (!data.userEmail?.trim())    ctx.addIssue({ code: 'custom', path: ['userEmail'],    message: 'E-mail jest wymagany' });
    if (!data.userPassword?.trim()) ctx.addIssue({ code: 'custom', path: ['userPassword'], message: 'Hasło jest wymagane' });
    if (!data.userFirstName?.trim()) ctx.addIssue({ code: 'custom', path: ['userFirstName'], message: 'Imię jest wymagane' });
    if (!data.userLastName?.trim()) ctx.addIssue({ code: 'custom', path: ['userLastName'],  message: 'Nazwisko jest wymagane' });
  }
  if (data.createDevice && !data.deviceName?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['deviceName'], message: 'Nazwa urządzenia jest wymagana' });
  }
});

type FormData = z.infer<typeof schema>;

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  client?: Client;
  onSuccess: () => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type SectionId = 'contact' | 'locations' | 'billing' | 'devices' | 'users' | 'notes';

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

interface NominatimResult {
  display_name: string;
  address: {
    road?: string; house_number?: string; postcode?: string;
    city?: string; town?: string; village?: string; suburb?: string;
  };
  extratags?: {
    phone?: string; 'contact:phone'?: string;
    email?: string; 'contact:email'?: string;
    website?: string; 'contact:website'?: string;
    'addr:postcode'?: string;
  };
}

function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}

// ── Map Preview ───────────────────────────────────────────────────────────────
function MapPreview({ address }: { address: string }) {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(address, 900);

  useEffect(() => {
    if (!debounced || debounced.trim().length < 8) { setCoords(null); return; }
    setLoading(true);
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(debounced)}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'pl' },
    })
      .then(r => r.json())
      .then((d: Array<{ lat: string; lon: string }>) => {
        if (d[0]) setCoords({ lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) });
        else setCoords(null);
      })
      .catch(() => setCoords(null))
      .finally(() => setLoading(false));
  }, [debounced]);

  if (!debounced || debounced.trim().length < 8) return null;
  if (loading) return <div className="mt-3 h-32 rounded-xl bg-gray-100 animate-pulse flex items-center justify-center text-xs text-gray-400">Szukam lokalizacji...</div>;
  if (!coords) return null;

  const { lat, lon } = coords;
  const d = 0.008;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 160 }}>
      <iframe src={mapUrl} title="Podgląd mapy" className="w-full h-full border-0" loading="lazy" />
    </div>
  );
}

// ── Accordion Section ─────────────────────────────────────────────────────────
function AccordionSection({
  id, icon, title, subtitle, badge, open, onToggle, children, highlight,
}: {
  id: SectionId; icon: React.ReactNode; title: string; subtitle?: string;
  badge?: string | number; open: boolean; onToggle: () => void;
  children: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className={clsx(
      'rounded-2xl border transition-all',
      open ? (highlight ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200 bg-white') : 'border-gray-100 bg-white'
    )}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left">
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
          open ? 'bg-brand-100 text-brand-600' : 'bg-gray-50 text-gray-400'
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {badge != null && (
          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium mr-1">{badge}</span>
        )}
        <ChevronDown className={clsx('h-4 w-4 text-gray-400 transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ClientForm({ client, onSuccess, onCancel }: Props) {
  const isEditing = !!client;
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nipChecking, setNipChecking] = useState(false);
  const [nipStatus, setNipStatus] = useState<'ok' | 'taken' | null>(null);
  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set());
  const [companyResults, setCompanyResults] = useState<NominatimResult[]>([]);
  const [companySearching, setCompanySearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const legalNameTouched = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, submitCount } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientType:   (client?.clientType as 'COMPANY' | 'INDIVIDUAL') ?? 'COMPANY',
      name:         client?.name ?? '',
      firstName:    client?.firstName ?? '',
      lastName:     client?.lastName ?? '',
      legalName:    client?.legalName ?? '',
      taxId:        client?.taxId ?? '',
      email:        client?.email ?? '',
      phone:        client?.phone ?? '',
      website:      client?.website ?? '',
      logoUrl:      client?.logoUrl ?? '',
      addressLine1: client?.addressLine1 ?? '',
      postalCode:   client?.postalCode ?? '',
      city:         client?.city ?? '',
      country:      client?.country ?? 'PL',
      billingType:  (client?.hasContract ? 'CONTRACT' : 'HOURLY') as 'HOURLY' | 'CONTRACT',
      hourlyRate:             client?.hourlyRate?.toString() ?? '150',
      billingIntervalMinutes: client?.billingIntervalMinutes?.toString() ?? '30',
      contractHours:               client?.contractHours?.toString() ?? '',
      contractMonthlyValue:        client?.contractMonthlyValue?.toString() ?? '',
      contractHourlyRateOverLimit: client?.contractHourlyRateOverLimit?.toString() ?? '',
      contractScope:               client?.contractScope ?? '',
      contractAttachmentUrl:       client?.contractAttachmentUrl ?? '',
      contractStartDate:           client?.contractStartDate?.slice(0, 10) ?? '',
      locType: 'Biuro',
      status:  client?.status ?? 'ACTIVE',
      notes:   client?.notes ?? '',
    },
  });

  const clientType   = watch('clientType');
  const billingType  = watch('billingType');
  const attachUrl    = watch('contractAttachmentUrl');
  const logoUrl      = watch('logoUrl');
  const addressLine1 = watch('addressLine1');
  const postalCode   = watch('postalCode');
  const city         = watch('city');
  const locAddress   = watch('locAddress');
  const locCity      = watch('locCity');
  const taxId        = watch('taxId');
  const nameValue    = watch('name');
  const createLocFromAddr = watch('createLocationFromAddress');
  const createLocation = watch('createLocation');
  const createUser = watch('createUser');
  const createDevice = watch('createDevice');

  const mapAddressQuery = [addressLine1, postalCode, city].filter(Boolean).join(', ');
  const locMapQuery = [locAddress, locCity].filter(Boolean).join(', ');
  const debouncedTaxId = useDebounce(taxId ?? '', 600);
  const debouncedName  = useDebounce(nameValue ?? '', 1200);

  // Toggle section
  const toggleSection = (id: SectionId) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Auto-open sections that have validation errors
  useEffect(() => {
    if (submitCount === 0) return;
    setOpenSections(prev => {
      const next = new Set(prev);
      if (errors.locName)      next.add('locations');
      if (errors.userFirstName || errors.userLastName || errors.userEmail || errors.userPassword) next.add('users');
      if (errors.deviceName)   next.add('devices');
      return next;
    });
  }, [submitCount, errors.locName, errors.userFirstName, errors.userLastName, errors.userEmail, errors.userPassword, errors.deviceName]);

  // NIP uniqueness check
  useEffect(() => {
    const nip = (debouncedTaxId ?? '').replace(/[\s-]/g, '');
    if (!nip || nip.length < 8) { setNipStatus(null); return; }
    setNipChecking(true);
    clientsApi.checkTaxId(nip, isEditing ? client?.id : undefined)
      .then(r => setNipStatus(r.exists ? 'taken' : 'ok'))
      .catch(() => setNipStatus(null))
      .finally(() => setNipChecking(false));
  }, [debouncedTaxId, isEditing, client?.id]);

  // Auto-fill legalName from name (when not manually edited)
  useEffect(() => {
    if (!isEditing && nameValue && clientType === 'COMPANY' && !legalNameTouched.current) {
      setValue('legalName', shortenCompanyName(nameValue));
    }
  }, [nameValue, clientType, isEditing, setValue]);

  // Company address lookup via Nominatim
  useEffect(() => {
    if (clientType !== 'COMPANY' || !debouncedName || debouncedName.length < 4) {
      setCompanyResults([]); setShowSuggestions(false); return;
    }
    setShowSuggestions(false); // reset before new search
    setCompanySearching(true);
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(debouncedName)}&format=json&limit=6&addressdetails=1&extratags=1&countrycodes=pl`,
      { headers: { 'Accept-Language': 'pl', 'User-Agent': 'InfraDesk/1.0' } }
    )
      .then(r => r.json())
      .then((data: NominatimResult[]) => {
        const withAddr = data.filter(d => d.address?.postcode || d.address?.city || d.address?.town);
        setCompanyResults(withAddr.slice(0, 5));
        setShowSuggestions(withAddr.length > 0);
      })
      .catch(() => { setCompanyResults([]); setShowSuggestions(false); })
      .finally(() => setCompanySearching(false));
    return () => { /* allow new search on next change */ };
  }, [debouncedName, clientType]);

  // Upload logo
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await apiClient.post<{ url: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setValue('logoUrl', data.url);
      toast.success('Logo przesłane');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  // Upload PDF umowy
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await apiClient.post<{ url: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setValue('contractAttachmentUrl', data.url);
      toast.success('Umowa przesłana');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setUploading(false); if (pdfRef.current) pdfRef.current.value = ''; }
  }

  // Submit
  async function onSubmit(data: FormData) {
    if (nipStatus === 'taken') {
      toast.error('NIP już istnieje w bazie');
      return;
    }
    setLoading(true);
    try {
      // Build client name for individuals
      const finalName = data.clientType === 'INDIVIDUAL'
        ? `${data.lastName ?? ''} ${data.firstName ?? ''}`.trim()
        : data.name;

      const payload: Partial<Client> = {
        clientType: data.clientType,
        name:         finalName,
        firstName:    data.clientType === 'INDIVIDUAL' ? (data.firstName || undefined) : undefined,
        lastName:     data.clientType === 'INDIVIDUAL' ? (data.lastName || undefined) : undefined,
        legalName:    data.legalName || undefined,
        taxId:        data.taxId || undefined,
        email:        data.email || undefined,
        phone:        data.phone || undefined,
        website:      data.website || undefined,
        logoUrl:      data.logoUrl || undefined,
        addressLine1: data.addressLine1 || undefined,
        postalCode:   data.postalCode || undefined,
        city:         data.city || undefined,
        country:      data.country || 'PL',
        notes:        data.notes || undefined,
        status:       data.status,
        billingIntervalMinutes: data.billingIntervalMinutes ? parseInt(data.billingIntervalMinutes) : 30,
        hasContract: data.billingType === 'CONTRACT',
        contractHours:               data.billingType === 'CONTRACT' && data.contractHours ? parseInt(data.contractHours) : undefined,
        contractMonthlyValue:        data.billingType === 'CONTRACT' && data.contractMonthlyValue ? parseFloat(data.contractMonthlyValue) : undefined,
        contractHourlyRateOverLimit: data.billingType === 'CONTRACT' && data.contractHourlyRateOverLimit ? parseFloat(data.contractHourlyRateOverLimit) : undefined,
        contractScope:               data.billingType === 'CONTRACT' ? (data.contractScope || undefined) : undefined,
        contractAttachmentUrl:       data.billingType === 'CONTRACT' ? (data.contractAttachmentUrl || undefined) : undefined,
        contractStartDate:           data.billingType === 'CONTRACT' && data.contractStartDate ? data.contractStartDate : undefined,
        hourlyRate:                  data.billingType === 'HOURLY' && data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
      };

      const saved = isEditing
        ? await clientsApi.update(client.id, payload)
        : await clientsApi.create(payload);

      // Auto-create location from company address
      if (!isEditing && data.createLocationFromAddress && data.addressLine1) {
        await locationsApi.create({
          clientId: saved.id,
          name: data.locationName || 'Siedziba główna',
          type: 'Biuro',
          addressLine1: data.addressLine1 || '',
          postalCode: data.postalCode || '',
          city: data.city || '',
          country: data.country || 'PL',
        });
      }

      // Create separate location
      if (!isEditing && data.createLocation && data.locName) {
        await locationsApi.create({
          clientId: saved.id,
          name: data.locName,
          type: data.locType || 'Biuro',
          addressLine1: data.locAddress || '',
          postalCode: data.locPostal || '',
          city: data.locCity || '',
          country: data.country || 'PL',
        });
      }

      // Create user
      if (!isEditing && data.createUser && data.userEmail && data.userPassword) {
        await usersApi.create({
          firstName: data.userFirstName || '',
          lastName:  data.userLastName || '',
          email:     data.userEmail,
          phone:     data.userPhone || undefined,
          role:      'CLIENT',
          clientId:  saved.id,
          password:  data.userPassword,
          isActive:  true,
        } as Parameters<typeof usersApi.create>[0]);
      }

      // Create device
      if (!isEditing && data.createDevice && data.deviceName) {
        const locs = await locationsApi.getAll({ clientId: saved.id });
        if (locs.length > 0) {
          await devicesApi.create({
            clientId:   saved.id,
            locationId: locs[0].id,
            name:       data.deviceName,
            ipAddress:  data.deviceIp || undefined,
            serialNumber: data.deviceSerial || undefined,
            model:      data.deviceModel || undefined,
            status:     'ACTIVE',
            criticality: 'MEDIUM',
          } as Parameters<typeof devicesApi.create>[0]);
        }
      }

      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success(isEditing ? 'Klient zaktualizowany' : 'Klient dodany');
      onSuccess();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

      {/* ── NAGŁÓWEK: FIRMA / OSOBA + dane główne ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Toggle */}
        <div className="px-5 pt-5 pb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Typ klienta</p>
          <div className="grid grid-cols-2 gap-2">
            {(['COMPANY', 'INDIVIDUAL'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setValue('clientType', t)}
                className={clsx(
                  'flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all',
                  clientType === t
                    ? t === 'COMPANY'
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                )}
              >
                {t === 'COMPANY'
                  ? <><Building2 className="h-4 w-4" /> Firma</>
                  : <><User className="h-4 w-4" /> Osoba prywatna</>
                }
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 pt-4 pb-5 space-y-4">
          {clientType === 'COMPANY' ? (
            <>
              {/* Nazwa firmy z podpowiedziami adresowymi */}
              <div className="relative">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Nazwa firmy *</label>
                  <div className="relative">
                    <input
                      autoComplete="off"
                      className={clsx(
                        'block w-full rounded-lg border px-3 py-2 pr-9 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
                        errors.name?.message ? 'border-red-300 focus:ring-red-400' : 'border-gray-300'
                      )}
                      {...register('name')}
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {companySearching
                        ? <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                        : (
                          <button
                            type="button"
                            title="Szukaj adresu firmy"
                            className="text-gray-400 hover:text-indigo-500 transition-colors"
                            onClick={() => {
                              if (!nameValue || nameValue.length < 3) return;
                              setCompanySearching(true);
                              fetch(
                                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nameValue)}&format=json&limit=6&addressdetails=1&extratags=1&countrycodes=pl`,
                                { headers: { 'Accept-Language': 'pl', 'User-Agent': 'InfraDesk/1.0' } }
                              )
                                .then(r => r.json())
                                .then((data: NominatimResult[]) => {
                                  const withAddr = data.filter(d => d.address?.postcode || d.address?.city || d.address?.town);
                                  setCompanyResults(withAddr.slice(0, 5));
                                  setShowSuggestions(withAddr.length > 0);
                                  if (withAddr.length === 0) toast('Brak wyników w OpenStreetMap', { icon: 'ℹ️' });
                                })
                                .catch(() => toast.error('Błąd wyszukiwania'))
                                .finally(() => setCompanySearching(false));
                            }}
                          >
                            <Search className="h-4 w-4" />
                          </button>
                        )
                      }
                    </div>
                  </div>
                  {errors.name?.message && <p className="text-xs text-red-600">{errors.name.message}</p>}
                </div>
                {showSuggestions && companyResults.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <Search className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-400">Znalezione lokalizacje – kliknij aby uzupełnić adres</span>
                    </div>
                    {companyResults.map((r, i) => {
                      const addr = r.address;
                      const street = [addr.road, addr.house_number].filter(Boolean).join(' ');
                      const cityName = addr.city || addr.town || addr.village || '';
                      return (
                        <button
                          key={i}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-brand-50 border-b border-gray-50 last:border-0 transition-colors"
                          onClick={() => {
                            if (street) setValue('addressLine1', street);
                            if (addr.postcode) setValue('postalCode', addr.postcode);
                            if (cityName) setValue('city', cityName);
                            const ext = r.extratags;
                            if (ext) {
                              const phone = ext.phone || ext['contact:phone'];
                              const email = ext.email || ext['contact:email'];
                              const web   = ext.website || ext['contact:website'];
                              if (phone) setValue('phone', phone);
                              if (email) setValue('email', email);
                              if (web)   setValue('website', web);
                            }
                            setShowSuggestions(false);
                          }}
                        >
                          <p className="text-xs font-medium text-gray-700 truncate">{r.display_name}</p>
                          <p className="text-xs text-gray-400">
                            {[street, addr.postcode, cityName].filter(Boolean).join(', ')}
                            {r.extratags?.phone || r.extratags?.['contact:phone'] ? ` · ${r.extratags.phone || r.extratags['contact:phone']}` : ''}
                            {r.extratags?.email || r.extratags?.['contact:email'] ? ` · ${r.extratags.email || r.extratags['contact:email']}` : ''}
                          </p>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 text-right"
                      onClick={() => setShowSuggestions(false)}
                    >
                      Zamknij ×
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nazwa skrócona"
                  placeholder="np. ABC Sp. z o.o."
                  {...register('legalName', {
                    onChange: () => { legalNameTouched.current = true; }
                  })}
                />
                <div>
                  <Input
                    label="NIP (bez kresek)"
                    placeholder="0000000000"
                    {...register('taxId', {
                      onChange: (e) => {
                        // Strip dashes and spaces automatically
                        e.target.value = e.target.value.replace(/[\s-]/g, '');
                      }
                    })}
                    error={nipStatus === 'taken' ? 'Ten NIP już istnieje w bazie' : undefined}
                  />
                  {/* NIP status indicator */}
                  <div className="mt-1 flex items-center gap-1.5 h-4">
                    {nipChecking && <span className="text-xs text-gray-400 flex items-center gap-1"><span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-brand-400 rounded-full animate-spin" />Sprawdzanie...</span>}
                    {!nipChecking && nipStatus === 'ok' && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />NIP unikalny</span>}
                    {!nipChecking && nipStatus === 'taken' && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />NIP już zajęty</span>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Imię *" {...register('firstName')} />
              <Input label="Nazwisko *" {...register('lastName')} />
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</label>
            <div className="flex gap-2">
              {(['ACTIVE', 'INACTIVE'] as const).map(s => (
                <button key={s} type="button" onClick={() => setValue('status', s)}
                  className={clsx('px-3 py-1 rounded-full text-xs font-semibold border transition-all',
                    watch('status') === s
                      ? s === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                      : 'bg-transparent text-gray-400 border-gray-100 hover:border-gray-200'
                  )}>
                  {s === 'ACTIVE' ? 'Aktywny' : 'Nieaktywny'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── DANE ADRESOWE I KONTAKT ────────────────────────────────────────── */}
      <AccordionSection
        id="contact"
        icon={<MapPin className="h-4 w-4" />}
        title="Dane adresowe i kontakt"
        subtitle="Adres, telefon, e-mail, strona, logo"
        open={openSections.has('contact')}
        onToggle={() => toggleSection('contact')}
      >
        <div className="space-y-4">
          {/* Address */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Adres</p>
          <Input label="Ulica i numer" placeholder="ul. Przykładowa 1/2" {...register('addressLine1')} />
          <div className="grid grid-cols-2 gap-3">
            <CityInput
              label="Miejscowość"
              value={city ?? ''}
              onChange={v => setValue('city', v)}
              onSelect={(c, pc) => { setValue('city', c); if (pc) setValue('postalCode', pc); }}
            />
            <Input label="Kod pocztowy" placeholder="00-000" {...register('postalCode')} />
          </div>
          <Input label="Kraj" defaultValue="PL" {...register('country')} />

          {/* Add as location */}
          <label className={clsx(
            'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
            createLocFromAddr ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100'
          )}>
            <input type="checkbox" {...register('createLocationFromAddress')} className="mt-0.5 rounded border-gray-300 text-brand-600 w-4 h-4 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-gray-800">Dodaj jako lokalizację klienta</div>
              <div className="text-xs text-gray-400 mt-0.5">Powyższy adres zostanie zapisany jako lokalizacja</div>
            </div>
          </label>
          {createLocFromAddr && (
            <Input label="Nazwa lokalizacji" placeholder="np. Biuro, Zakład, Magazyn" {...register('locationName')} />
          )}

          {/* Map preview */}
          <MapPreview address={mapAddressQuery} />

          {/* Contact */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Kontakt</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300 pointer-events-none" style={{top:'calc(50% + 9px)'}} />
                <Input label="E-mail" type="email" placeholder="firma@example.com" {...register('email')} error={errors.email?.message}
                  className="pl-9" />
              </div>
              <Input label="Telefon" placeholder="+48 000 000 000" {...register('phone')} />
              <Input label="Strona WWW" placeholder="https://www.firma.pl" {...register('website')} />
            </div>
          </div>

          {/* Logo */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Logo firmy</p>
            {logoUrl ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <img src={logoUrl} alt="Logo" className="w-12 h-12 object-contain rounded-lg bg-white border border-gray-100" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 truncate">{logoUrl}</p>
                </div>
                <button type="button" onClick={() => setValue('logoUrl', '')} className="text-gray-400 hover:text-red-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Input placeholder="https://cdn.firma.pl/logo.png" {...register('logoUrl')} className="flex-1" />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button type="button" variant="secondary" size="sm" icon={<Upload className="h-3.5 w-3.5" />}
                  onClick={() => fileRef.current?.click()} loading={uploading}>
                  Prześlij
                </Button>
              </div>
            )}
          </div>
        </div>
      </AccordionSection>

      {/* ── LOKALIZACJE (only create mode) ────────────────────────────────── */}
      {!isEditing && (
        <AccordionSection
          id="locations"
          icon={<Building2 className="h-4 w-4" />}
          title="Lokalizacje"
          subtitle="Dodaj dodatkową lokalizację klienta"
          open={openSections.has('locations')}
          onToggle={() => toggleSection('locations')}
        >
          <label className={clsx(
            'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors mb-4',
            createLocation ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100'
          )}>
            <input type="checkbox" {...register('createLocation')} className="mt-0.5 rounded border-gray-300 text-brand-600 w-4 h-4 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-gray-800">Utwórz lokalizację</div>
              <div className="text-xs text-gray-400">Wypełnij dane lokalizacji poniżej</div>
            </div>
          </label>

          {createLocation && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Nazwa lokalizacji *" placeholder="np. Oddział, Magazyn" {...register('locName')} error={errors.locName?.message} />
                <Select label="Typ" options={['Biuro','Magazyn','Sklep','Serwerownia','Oddział','Szkoła','Produkcja','Inne'].map(v => ({ value: v, label: v }))} {...register('locType')} />
              </div>
              <Input label="Ulica i numer" {...register('locAddress')} />
              <div className="grid grid-cols-2 gap-3">
                <CityInput
                  label="Miejscowość"
                  value={locCity ?? ''}
                  onChange={v => setValue('locCity', v)}
                  onSelect={(c, pc) => { setValue('locCity', c); if (pc) setValue('locPostal', pc); }}
                />
                <Input label="Kod pocztowy" {...register('locPostal')} />
              </div>
              <MapPreview address={locMapQuery} />
            </div>
          )}
        </AccordionSection>
      )}

      {/* ── FORMA ROZLICZENIA ─────────────────────────────────────────────── */}
      <AccordionSection
        id="billing"
        icon={<DollarSign className="h-4 w-4" />}
        title="Forma rozliczenia"
        subtitle={billingType === 'HOURLY' ? 'Rozliczenie godzinowe' : 'Abonament (SLA)'}
        open={openSections.has('billing')}
        onToggle={() => toggleSection('billing')}
        highlight
      >
        {/* Toggle Godzinowa / Abonament */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {([
            { value: 'HOURLY',   label: 'Godzinowa', icon: <Clock className="h-4 w-4" /> },
            { value: 'CONTRACT', label: 'Abonament',  icon: <FileText className="h-4 w-4" /> },
          ] as const).map(opt => (
            <button key={opt.value} type="button" onClick={() => setValue('billingType', opt.value)}
              className={clsx(
                'flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all',
                billingType === opt.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
              )}>
              {opt.icon}{opt.label}
            </button>
          ))}
        </div>

        {billingType === 'HOURLY' ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input label="Stawka za godzinę (zł netto)" type="number" step="0.01" placeholder="150.00" {...register('hourlyRate')} />
              <p className="text-xs text-gray-400 mt-1">Domyślnie: 150 zł/h</p>
            </div>
            <div>
              <Select
                label="Rozliczanie co (min)"
                options={[
                  { value: '15', label: 'Co 15 minut' },
                  { value: '30', label: 'Co 30 minut' },
                  { value: '60', label: 'Pełne godziny' },
                ]}
                {...register('billingIntervalMinutes')}
              />
              <p className="text-xs text-gray-400 mt-1">Domyślnie: co 30 min</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Godziny w abonamencie / mies." type="number" placeholder="20" {...register('contractHours')} />
              <Input label="Wartość miesięczna (zł netto)" type="number" step="0.01" placeholder="0.00" {...register('contractMonthlyValue')} />
              <Input label="Stawka poza abonamentem (zł/h)" type="number" step="0.01" placeholder="200.00" {...register('contractHourlyRateOverLimit')} />
              <Input label="Umowa ważna od" type="date" {...register('contractStartDate')} />
            </div>
            <Textarea label="Zakres umowy" rows={3} placeholder="Opis usług objętych abonamentem..." {...register('contractScope')} />

            {/* PDF umowy */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Podpięcie umowy (PDF)</p>
              {attachUrl ? (
                <div className="flex items-center gap-3 p-3 bg-brand-50 rounded-xl border border-brand-100">
                  <FileText className="h-5 w-5 text-brand-600 flex-shrink-0" />
                  <span className="text-sm text-brand-700 flex-1 truncate">Umowa załączona</span>
                  <a href={attachUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:text-brand-700">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button type="button" onClick={() => setValue('contractAttachmentUrl', '')} className="text-gray-400 hover:text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                  <button type="button" onClick={() => pdfRef.current?.click()} disabled={uploading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors">
                    <Upload className="h-4 w-4" />
                    {uploading ? 'Przesyłanie...' : 'Kliknij, aby wybrać plik PDF'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </AccordionSection>

      {/* ── URZĄDZENIA (only create mode) ─────────────────────────────────── */}
      {!isEditing && (
        <AccordionSection
          id="devices"
          icon={<Monitor className="h-4 w-4" />}
          title="Urządzenia"
          subtitle="Dodaj pierwsze urządzenie"
          open={openSections.has('devices')}
          onToggle={() => toggleSection('devices')}
        >
          <label className={clsx(
            'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors mb-4',
            createDevice ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100'
          )}>
            <input type="checkbox" {...register('createDevice')} className="mt-0.5 rounded border-gray-300 text-brand-600 w-4 h-4 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-gray-800">Dodaj urządzenie</div>
              <div className="text-xs text-gray-400">Zostanie przypisane do pierwszej lokalizacji</div>
            </div>
          </label>
          {createDevice && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Nazwa urządzenia *" placeholder="np. Serwer Dell" {...register('deviceName')} error={errors.deviceName?.message} />
              <Input label="Model" placeholder="np. PowerEdge R440" {...register('deviceModel')} />
              <Input label="Adres IP" placeholder="192.168.1.1" {...register('deviceIp')} />
              <Input label="Numer seryjny" placeholder="SN-XXXXXXXX" {...register('deviceSerial')} />
            </div>
          )}
        </AccordionSection>
      )}

      {/* ── UŻYTKOWNICY (only create mode) ────────────────────────────────── */}
      {!isEditing && (
        <AccordionSection
          id="users"
          icon={<Users className="h-4 w-4" />}
          title="Użytkownicy portalu"
          subtitle="Dodaj dostęp do portalu klienta"
          open={openSections.has('users')}
          onToggle={() => toggleSection('users')}
        >
          <label className={clsx(
            'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors mb-4',
            createUser ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100'
          )}>
            <input type="checkbox" {...register('createUser')} className="mt-0.5 rounded border-gray-300 text-brand-600 w-4 h-4 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-gray-800">Utwórz użytkownika portalu</div>
              <div className="text-xs text-gray-400">Klient będzie mógł logować się do portalu</div>
            </div>
          </label>
          {createUser && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Imię *" {...register('userFirstName')} error={errors.userFirstName?.message} />
              <Input label="Nazwisko *" {...register('userLastName')} error={errors.userLastName?.message} />
              <Input label="E-mail *" type="email" {...register('userEmail')} error={errors.userEmail?.message} />
              <Input label="Telefon" {...register('userPhone')} />
              <Input label="Hasło *" type="password" {...register('userPassword')} error={errors.userPassword?.message} className="sm:col-span-2" />
            </div>
          )}
        </AccordionSection>
      )}

      {/* ── DODATKOWE INFORMACJE ──────────────────────────────────────────── */}
      <AccordionSection
        id="notes"
        icon={<FileText className="h-4 w-4" />}
        title="Dodatkowe informacje"
        subtitle="Uwagi wewnętrzne, notatki"
        open={openSections.has('notes')}
        onToggle={() => toggleSection('notes')}
      >
        <Textarea label="" placeholder="Notatki, uwagi, informacje dodatkowe..." rows={4} {...register('notes')} />
      </AccordionSection>

      {/* ── FOOTER BUTTONS ────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pt-2 pb-1 sticky bottom-0 bg-transparent">
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={loading} disabled={nipStatus === 'taken'}>
          {isEditing ? 'Zapisz zmiany' : 'Utwórz klienta'}
        </Button>
      </div>
    </form>
  );
}
