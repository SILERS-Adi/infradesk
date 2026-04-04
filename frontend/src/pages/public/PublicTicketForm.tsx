import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Send, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor?: string;
}

interface LocationInfo {
  id: string;
  name: string;
  type: string;
}

interface DeviceInfo {
  id: string;
  name: string;
  hostname?: string;
  type: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function PublicTicketForm() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [searchParams] = useSearchParams();
  const deviceIdFromUrl = searchParams.get('deviceId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [device, setDevice] = useState<DeviceInfo | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [type, setType] = useState('INCIDENT');
  const [locationId, setLocationId] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceSlug) return;
    const url = `${API_BASE}/api/public/tickets/${workspaceSlug}${deviceIdFromUrl ? `?deviceId=${deviceIdFromUrl}` : ''}`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('Nie znaleziono firmy'); return r.json(); })
      .then(data => {
        setWorkspace(data.workspace);
        setLocations(data.locations ?? []);
        setDevice(data.device);
        if (data.locations?.length === 1) setLocationId(data.locations[0].id);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [workspaceSlug, deviceIdFromUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/tickets/${workspaceSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, priority, type,
          locationId: locationId || undefined,
          deviceId: device?.id || undefined,
          reporterName: reporterName || undefined,
          reporterPhone: reporterPhone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd wysyłania');
      setSubmitted(data.ticketNumber);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const accentColor = workspace?.primaryColor || '#6D28D9';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #f5f5f5)' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <AlertTriangle size={48} color="#EF4444" style={{ marginBottom: 12 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{error}</h2>
          <p style={{ color: '#666', fontSize: 14 }}>Sprawdź poprawność linku i spróbuj ponownie.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <CheckCircle size={56} color="#22C55E" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Zgłoszenie wysłane!</h2>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>
            Numer zgłoszenia: <strong style={{ color: accentColor }}>{submitted}</strong>
          </p>
          <p style={{ color: '#999', fontSize: 13 }}>
            Firma {workspace?.name} została powiadomiona o Twoim zgłoszeniu.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '40px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {workspace?.logoUrl && (
            <img src={workspace.logoUrl} alt="" style={{ height: 40, marginBottom: 12 }} />
          )}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111', margin: '0 0 6px' }}>
            Nowe zgłoszenie
          </h1>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            {workspace?.name}
          </p>
        </div>

        {/* Device info */}
        {device && (
          <div style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px',
            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{device.name}</span>
              {device.hostname && <span style={{ color: '#999', marginLeft: 6 }}>{device.hostname}</span>}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#DC2626' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Reporter info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Twoje imię i nazwisko</label>
                <input className="input" value={reporterName} onChange={e => setReporterName(e.target.value)} placeholder="Jan Kowalski" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Telefon kontaktowy</label>
                <input className="input" type="tel" value={reporterPhone} onChange={e => setReporterPhone(e.target.value)} placeholder="+48..." style={inputStyle} />
              </div>
            </div>

            {/* Title */}
            <div>
              <label style={labelStyle}>Tytuł zgłoszenia <span style={{ color: '#EF4444' }}>*</span></label>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Krótki opis problemu" required style={inputStyle} />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Opis <span style={{ color: '#EF4444' }}>*</span></label>
              <textarea
                className="input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Opisz szczegółowo problem..."
                required
                rows={5}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* Type + Priority */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Typ</label>
                <select className="input" value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                  <option value="INCIDENT">Awaria</option>
                  <option value="REQUEST">Zlecenie</option>
                  <option value="MAINTENANCE">Konserwacja</option>
                  <option value="OTHER">Inne</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priorytet</label>
                <select className="input" value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                  <option value="LOW">Niski</option>
                  <option value="MEDIUM">Średni</option>
                  <option value="HIGH">Wysoki</option>
                  <option value="CRITICAL">Krytyczny</option>
                </select>
              </div>
            </div>

            {/* Location */}
            {locations.length > 1 && (
              <div>
                <label style={labelStyle}>Lokalizacja</label>
                <select className="input" value={locationId} onChange={e => setLocationId(e.target.value)} style={inputStyle}>
                  <option value="">— Wybierz —</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim()}
              style={{
                background: accentColor, color: '#fff', border: 'none', borderRadius: 8,
                padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: submitting ? 0.7 : 1, transition: 'opacity .2s',
              }}
            >
              {submitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
              {submitting ? 'Wysyłanie...' : 'Wyślij zgłoszenie'}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginTop: 20 }}>
          InfraDesk &mdash; Platforma do zarządzania IT
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #ddd',
  borderRadius: 8, background: '#fafafa',
};
