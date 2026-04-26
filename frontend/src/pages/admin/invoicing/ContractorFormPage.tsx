/**
 * Contractor Form — Full version (like Fakturownia/wFirma)
 * Fields: typ, NIP+GUS, REGON, KRS, adres, kontakt, konto bankowe, osoba kontaktowa, domyślne ustawienia
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Search, Loader2, Building2, User } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ImageUpload } from '../../../components/ui/ImageUpload';

const PAYMENT_DAYS = [
  { value: '', label: 'Domyślny (z ustawień)' },
  { value: '7', label: '7 dni' },
  { value: '14', label: '14 dni' },
  { value: '21', label: '21 dni' },
  { value: '30', label: '30 dni' },
  { value: '45', label: '45 dni' },
  { value: '60', label: '60 dni' },
];

const COUNTRY_OPTIONS = [
  { value: 'PL', label: 'Polska' },
  { value: 'DE', label: 'Niemcy' },
  { value: 'CZ', label: 'Czechy' },
  { value: 'SK', label: 'Słowacja' },
  { value: 'LT', label: 'Litwa' },
  { value: 'GB', label: 'Wielka Brytania' },
  { value: 'US', label: 'USA' },
  { value: 'OTHER', label: 'Inny' },
];

export function ContractorFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gusLoading, setGusLoading] = useState(false);

  // Typ
  const [isCompany, setIsCompany] = useState(true);

  // Dane podstawowe
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [regon, setRegon] = useState('');
  const [krs, setKrs] = useState('');

  // Adres siedziby
  const [street, setStreet] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('PL');

  // Adres korespondencyjny (opcjonalny)
  const [showCorrespondence, setShowCorrespondence] = useState(false);
  const [corrStreet, setCorrStreet] = useState('');
  const [corrPostalCode, setCorrPostalCode] = useState('');
  const [corrCity, setCorrCity] = useState('');

  // Kontakt
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  // Osoba kontaktowa
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Konto bankowe
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  // Ustawienia domyślne
  const [defaultPaymentDays, setDefaultPaymentDays] = useState('');

  // Logo
  const [logoUrl, setLogoUrl] = useState('');

  // Notatki
  const [notes, setNotes] = useState('');

  // GUS lookup
  async function lookupNip() {
    const cleanNip = nip.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(cleanNip)) { toast.error('Wpisz poprawny NIP (10 cyfr)'); return; }
    setGusLoading(true);
    try {
      const { data } = await api.get(`/invoicing/contractors/nip-lookup/${cleanNip}`);
      setName(data.name || name);
      setStreet(data.street || street);
      setCity(data.city || city);
      setPostalCode(data.postalCode || postalCode);
      setRegon(data.regon || regon);
      if (data.krs) setKrs(data.krs);
      if (data.bankAccounts?.length) setBankAccount(data.bankAccounts[0]);
      if (data.isPersonName) {
        toast('Pobrano dane. Nazwa może zawierać tylko imię i nazwisko — popraw na pełną nazwę firmy.', { icon: '⚠️', duration: 6000 });
      } else {
        toast.success(`Pobrano: ${data.name}`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udało się pobrać danych');
    } finally {
      setGusLoading(false);
    }
  }

  // Load existing contractor
  const loadContractor = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/invoicing/contractors/${id}`);
      setName(data.name || '');
      setNip(data.nip || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setCity(data.city || '');
      setStreet(data.address || data.street || '');
      setPostalCode(data.postalCode || '');
      setRegon(data.regon || '');
      setKrs(data.krs || '');
      setCountry(data.country || 'PL');
      setWebsite(data.website || '');
      setContactPerson(data.contactPerson || '');
      setContactEmail(data.contactEmail || '');
      setContactPhone(data.contactPhone || '');
      setBankName(data.bankName || '');
      setBankAccount(data.bankAccount || '');
      setDefaultPaymentDays(data.defaultPaymentDays || '');
      setNotes(data.notes || '');
      setLogoUrl(data.logoUrl || '');
      setIsCompany(data.type !== 'person');
      if (data.corrStreet || data.corrCity) {
        setShowCorrespondence(true);
        setCorrStreet(data.corrStreet || '');
        setCorrPostalCode(data.corrPostalCode || '');
        setCorrCity(data.corrCity || '');
      }
    } catch {
      toast.error('Nie udało się pobrać kontrahenta');
      navigate('/invoicing/contractors');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadContractor(); }, [loadContractor]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nazwa jest wymagana';
    if (isCompany && nip.trim() && !/^\d{10}$/.test(nip.replace(/[-\s]/g, ''))) e.nip = 'NIP musi mieć 10 cyfr';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        type: isCompany ? 'company' : 'person',
        nip: nip.trim() || undefined,
        regon: regon.trim() || undefined,
        krs: krs.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        address: street.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        city: city.trim() || undefined,
        country: country || 'PL',
        contactPerson: contactPerson.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        bankName: bankName.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
        defaultPaymentDays: defaultPaymentDays || undefined,
        logoUrl: logoUrl || undefined,
        notes: notes.trim() || undefined,
      };
      if (showCorrespondence) {
        payload.corrStreet = corrStreet.trim() || undefined;
        payload.corrPostalCode = corrPostalCode.trim() || undefined;
        payload.corrCity = corrCity.trim() || undefined;
      }

      if (isEdit) {
        await api.put(`/invoicing/contractors/${id}`, payload);
        toast.success('Kontrahent zaktualizowany');
      } else {
        await api.post('/invoicing/contractors', payload);
        toast.success('Kontrahent dodany');
      }
      navigate('/invoicing/contractors');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udało się zapisać');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <><PageHeader title={isEdit ? 'Edytuj kontrahenta' : 'Nowy kontrahent'} back="/invoicing/contractors" /><LoadingSpinner /></>;
  }

  return (
    <>
      <PageHeader
        title={isEdit ? `Edytuj: ${name}` : 'Nowy kontrahent'}
        subtitle={isEdit ? 'Zmień dane kontrahenta' : 'Dodaj nowego klienta lub dostawcę'}
        back="/invoicing/contractors"
      />
      <div style={{ padding: '0 24px 120px', maxWidth: 780, margin: '0 auto' }}>
        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Alert type="error" title="Popraw błędy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert>
          </div>
        )}

        {/* ── Typ kontrahenta ── */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20 }}>
          <button type="button" onClick={() => setIsCompany(true)} style={{
            flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: isCompany ? 'var(--accent)' : 'transparent', color: isCompany ? '#fff' : 'var(--td)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}><Building2 size={14} /> Firma</button>
          <button type="button" onClick={() => setIsCompany(false)} style={{
            flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: !isCompany ? 'var(--accent)' : 'transparent', color: !isCompany ? '#fff' : 'var(--td)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}><User size={14} /> Osoba fizyczna</button>
        </div>

        {/* ── Dane podstawowe + GUS ── */}
        <Card title="Dane podstawowe">
          <div style={{ marginBottom: 16 }}>
            <ImageUpload value={logoUrl || null} onChange={url => setLogoUrl(url || '')} label="Logo firmy" hint="JPG, PNG — maks. 5MB" size={70} rounded />
          </div>
          {isCompany && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
              <div style={{ flex: '0 0 200px' }}>
                <Input label="NIP" placeholder="Wpisz NIP i pobierz dane" value={nip} onChange={e => setNip(e.target.value)} error={errors.nip} />
              </div>
              <Button variant="primary" icon={gusLoading ? <Loader2 size={14} className="spinning" /> : <Search size={14} />}
                onClick={lookupNip} disabled={gusLoading || nip.replace(/[-\s]/g, '').length < 10}
                style={{ marginBottom: errors.nip ? 22 : 1 }}>
                {gusLoading ? 'Szukam...' : 'Pobierz z GUS'}
              </Button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isCompany ? '1fr 1fr' : '1fr', gap: 16 }}>
            <Input label={isCompany ? 'Nazwa firmy *' : 'Imię i nazwisko *'} placeholder={isCompany ? 'np. Firma XYZ Sp. z o.o.' : 'np. Jan Kowalski'}
              value={name} onChange={e => { setName(e.target.value); setErrors(p => { const { name: _, ...r } = p; return r; }); }} error={errors.name} />
            {isCompany && <Input label="REGON" placeholder="np. 123456789" value={regon} onChange={e => setRegon(e.target.value)} />}
          </div>
          {isCompany && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
              <Input label="KRS" placeholder="Opcjonalne" value={krs} onChange={e => setKrs(e.target.value)} />
              <Select label="Kraj" options={COUNTRY_OPTIONS} value={country} onChange={e => setCountry(e.target.value)} />
            </div>
          )}
          {!isCompany && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
              <Input label="NIP (opcjonalnie)" placeholder="np. 1234567890" value={nip} onChange={e => setNip(e.target.value)} />
              <Select label="Kraj" options={COUNTRY_OPTIONS} value={country} onChange={e => setCountry(e.target.value)} />
            </div>
          )}
        </Card>

        {/* ── Adres siedziby ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Adres siedziby">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
              <Input label="Ulica i numer" placeholder="np. ul. Testowa 1/2" value={street} onChange={e => setStreet(e.target.value)} />
              <Input label="Kod pocztowy" placeholder="00-000" value={postalCode} onChange={e => setPostalCode(e.target.value)} />
              <Input label="Miasto" placeholder="np. Warszawa" value={city} onChange={e => setCity(e.target.value)} />
            </div>

            {!showCorrespondence ? (
              <button type="button" onClick={() => setShowCorrespondence(true)} style={{
                marginTop: 12, background: 'none', border: '1px dashed var(--border)', borderRadius: 8,
                padding: '8px 14px', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', width: '100%',
              }}>+ Dodaj adres korespondencyjny</button>
            ) : (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Adres korespondencyjny</span>
                  <button type="button" onClick={() => { setShowCorrespondence(false); setCorrStreet(''); setCorrPostalCode(''); setCorrCity(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--td)', cursor: 'pointer', fontSize: 11 }}>Usuń</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <Input label="Ulica i numer" value={corrStreet} onChange={e => setCorrStreet(e.target.value)} />
                  <Input label="Kod pocztowy" value={corrPostalCode} onChange={e => setCorrPostalCode(e.target.value)} />
                  <Input label="Miasto" value={corrCity} onChange={e => setCorrCity(e.target.value)} />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Kontakt ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Kontakt">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Input label="Email" placeholder="biuro@firma.pl" value={email} onChange={e => setEmail(e.target.value)} />
              <Input label="Telefon" placeholder="+48 500 000 000" value={phone} onChange={e => setPhone(e.target.value)} />
              <Input label="Strona www" placeholder="www.firma.pl" value={website} onChange={e => setWebsite(e.target.value)} />
            </div>
          </Card>
        </div>

        {/* ── Osoba kontaktowa ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Osoba kontaktowa">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Input label="Imię i nazwisko" placeholder="np. Anna Kowalska" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
              <Input label="Email" placeholder="anna@firma.pl" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              <Input label="Telefon" placeholder="+48 500 000 001" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
            </div>
          </Card>
        </div>

        {/* ── Konto bankowe ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Konto bankowe kontrahenta">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
              <Input label="Nazwa banku" placeholder="np. PKO BP" value={bankName} onChange={e => setBankName(e.target.value)} />
              <Input label="Numer konta (IBAN)" placeholder="PL 00 0000 0000 0000 0000 0000 0000" value={bankAccount} onChange={e => setBankAccount(e.target.value)} />
            </div>
          </Card>
        </div>

        {/* ── Ustawienia domyślne ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Ustawienia domyślne">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 300 }}>
              <Select label="Termin płatności" options={PAYMENT_DAYS} value={defaultPaymentDays} onChange={e => setDefaultPaymentDays(e.target.value)} />
            </div>
          </Card>
        </div>

        {/* ── Notatki ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Notatki">
            <Textarea label="Uwagi wewnętrzne" placeholder="Dodatkowe informacje o kontrahencie (nie drukowane na fakturze)" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
      }}>
        <Button variant="ghost" onClick={() => navigate('/invoicing/contractors')} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>
          {isEdit ? 'Zapisz zmiany' : 'Dodaj kontrahenta'}
        </Button>
      </div>
    </>
  );
}
