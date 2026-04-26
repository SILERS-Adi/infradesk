/**
 * Product Form — Full version
 * Pola: zdjęcie (upload + auto z netu), EAN, PKWiU, kategoria, cena netto/brutto, jednostka, stawka VAT
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Search, Loader2 } from 'lucide-react';
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

const UNIT_OPTIONS = [
  { value: 'szt', label: 'szt (sztuka)' },
  { value: 'godz', label: 'godz (godzina)' },
  { value: 'mies', label: 'mies (miesiąc)' },
  { value: 'kpl', label: 'kpl (komplet)' },
  { value: 'mb', label: 'mb (metr bieżący)' },
  { value: 'kg', label: 'kg (kilogram)' },
  { value: 'l', label: 'l (litr)' },
  { value: 'm2', label: 'm² (metr kwadratowy)' },
  { value: 'm3', label: 'm³ (metr sześcienny)' },
  { value: 'usł', label: 'usł (usługa)' },
  { value: 'km', label: 'km (kilometr)' },
  { value: 'op', label: 'op (opakowanie)' },
];

const VAT_OPTIONS = [
  { value: '23', label: '23%' },
  { value: '8', label: '8%' },
  { value: '5', label: '5%' },
  { value: '0', label: '0%' },
  { value: 'zw', label: 'zw. (zwolniony)' },
  { value: 'np', label: 'np. (nie podlega)' },
];

const TYPE_OPTIONS = [
  { value: 'product', label: 'Towar' },
  { value: 'service', label: 'Usługa' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'Brak kategorii' },
  { value: 'it_services', label: 'Usługi IT' },
  { value: 'hardware', label: 'Sprzęt komputerowy' },
  { value: 'software', label: 'Oprogramowanie' },
  { value: 'consulting', label: 'Doradztwo' },
  { value: 'maintenance', label: 'Serwis i konserwacja' },
  { value: 'subscription', label: 'Abonament / Subskrypcja' },
  { value: 'networking', label: 'Sieci i telekomunikacja' },
  { value: 'other', label: 'Inne' },
];

function calcGross(net: number, vatRate: string): number {
  if (vatRate === 'zw' || vatRate === 'np') return net;
  return net * (1 + parseFloat(vatRate) / 100);
}
function calcNet(gross: number, vatRate: string): number {
  if (vatRate === 'zw' || vatRate === 'np') return gross;
  return gross / (1 + parseFloat(vatRate) / 100);
}

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [ean, setEan] = useState('');
  const [pkwiu, setPkwiu] = useState('');
  const [productType, setProductType] = useState('service');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('szt');
  const [priceNet, setPriceNet] = useState('');
  const [priceGross, setPriceGross] = useState('');
  const [vatRate, setVatRate] = useState('23');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [imageSearching, setImageSearching] = useState(false);

  async function searchImage() {
    if (!name.trim()) { toast.error('Wpisz najpierw nazwę produktu'); return; }
    setImageSearching(true);
    try {
      const { data } = await api.get(`/invoicing/products/image-search?q=${encodeURIComponent(name.trim())}`);
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
        toast.success(`Znaleziono zdjęcie${data.credit ? ` (autor: ${data.credit})` : ''}`);
      } else {
        toast('Nie znaleziono zdjęcia — wgraj ręcznie', { icon: '📷' });
      }
    } catch {
      toast.error('Błąd wyszukiwania');
    } finally {
      setImageSearching(false);
    }
  }

  // Sync net ↔ gross
  function onNetChange(v: string) {
    setPriceNet(v);
    const n = parseFloat(v);
    if (!isNaN(n)) setPriceGross(calcGross(n, vatRate).toFixed(2));
  }
  function onGrossChange(v: string) {
    setPriceGross(v);
    const g = parseFloat(v);
    if (!isNaN(g)) setPriceNet(calcNet(g, vatRate).toFixed(2));
  }
  function onVatChange(v: string) {
    setVatRate(v);
    const n = parseFloat(priceNet);
    if (!isNaN(n)) setPriceGross(calcGross(n, v).toFixed(2));
  }

  const loadProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/invoicing/products/${id}`);
      setName(data.name || '');
      setSku(data.sku || '');
      setEan(data.ean || '');
      setPkwiu(data.pkwiu || '');
      setProductType(data.productType || 'service');
      setCategory(data.category || '');
      setUnit(data.unit || 'szt');
      const net = Number(data.priceNet) || 0;
      setPriceNet(net ? String(net) : '');
      setPriceGross(net ? calcGross(net, data.vatRate || '23').toFixed(2) : '');
      setVatRate(data.vatRate || '23');
      setImageUrl(data.imageUrl || '');
      setNotes(data.notes || '');
    } catch {
      toast.error('Nie udało się pobrać produktu');
      navigate('/invoicing/products');
    } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { loadProduct(); }, [loadProduct]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nazwa jest wymagana';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        ean: ean.trim() || undefined,
        pkwiu: pkwiu.trim() || undefined,
        productType: productType || undefined,
        category: category || undefined,
        unit,
        priceNet: parseFloat(priceNet) || 0,
        vatRate,
        imageUrl: imageUrl || undefined,
        notes: notes.trim() || undefined,
      };
      if (isEdit) {
        await api.put(`/invoicing/products/${id}`, payload);
        toast.success('Produkt zaktualizowany');
      } else {
        await api.post('/invoicing/products', payload);
        toast.success('Produkt dodany');
      }
      navigate('/invoicing/products');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udało się zapisać');
    } finally { setSaving(false); }
  }

  if (loading) return <><PageHeader title={isEdit ? 'Edytuj produkt' : 'Nowy produkt'} back="/invoicing/products" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title={isEdit ? `Edytuj: ${name}` : 'Nowy produkt / usługa'} subtitle={isEdit ? 'Zmień dane produktu' : 'Dodaj nowy produkt lub usługę do katalogu'} back="/invoicing/products" />
      <div style={{ padding: '0 24px 120px', maxWidth: 780, margin: '0 auto' }}>
        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}><Alert type="error" title="Popraw błędy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert></div>
        )}

        {/* ── Zdjęcie + typ ── */}
        <Card title="Podstawowe">
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div>
              <ImageUpload value={imageUrl || null} onChange={url => setImageUrl(url || '')} label="Zdjęcie" hint="Wgraj z dysku lub szukaj" size={90} />
              <button type="button" onClick={searchImage} disabled={imageSearching || !name.trim()} style={{
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, background: 'none',
                border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px',
                fontSize: 10, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', width: '100%', justifyContent: 'center',
              }}>
                {imageSearching ? <Loader2 size={10} className="spinning" /> : <Search size={10} />}
                {imageSearching ? 'Szukam...' : 'Szukaj w sieci'}
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <Input label="Nazwa *" placeholder="np. Usługa IT — wsparcie techniczne" value={name}
                  onChange={e => { setName(e.target.value); setErrors(p => { const { name: _, ...r } = p; return r; }); }} error={errors.name} />
                <Select label="Typ" options={TYPE_OPTIONS} value={productType} onChange={e => setProductType(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
                <Input label="SKU (numer katalogowy)" placeholder="np. SRV-IT-001" value={sku} onChange={e => setSku(e.target.value)} />
                <Select label="Kategoria" options={CATEGORY_OPTIONS} value={category} onChange={e => setCategory(e.target.value)} />
              </div>
            </div>
          </div>
        </Card>

        {/* ── Kody ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Kody">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="EAN / Kod kreskowy" placeholder="np. 5901234123457" value={ean} onChange={e => setEan(e.target.value)} hint="13-cyfrowy kod kreskowy produktu" />
              <Input label="PKWiU" placeholder="np. 62.02.30.0" value={pkwiu} onChange={e => setPkwiu(e.target.value)} hint="Wymagane przy sprzedaży zwolnionej z VAT" />
            </div>
          </Card>
        </div>

        {/* ── Cena ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Cena i jednostka">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
              <Input label="Cena netto (PLN)" type="number" min="0" step="0.01" placeholder="0.00" value={priceNet} onChange={e => onNetChange(e.target.value)} />
              <Select label="Stawka VAT" options={VAT_OPTIONS} value={vatRate} onChange={e => onVatChange(e.target.value)} />
              <Input label="Cena brutto (PLN)" type="number" min="0" step="0.01" placeholder="0.00" value={priceGross} onChange={e => onGrossChange(e.target.value)} />
              <Select label="Jednostka miary" options={UNIT_OPTIONS} value={unit} onChange={e => setUnit(e.target.value)} />
            </div>
          </Card>
        </div>

        {/* ── Notatki ── */}
        <div style={{ marginTop: 20 }}>
          <Card title="Opis">
            <Textarea label="Opis / uwagi" placeholder="Szczegółowy opis produktu lub usługi" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => navigate('/invoicing/products')} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>{isEdit ? 'Zapisz zmiany' : 'Dodaj produkt'}</Button>
      </div>
    </>
  );
}
