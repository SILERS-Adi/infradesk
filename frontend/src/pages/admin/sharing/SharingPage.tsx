import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';
import toast from 'react-hot-toast';
import {
  Share2, Send, UserPlus, Shield, Monitor, MapPin, ChevronRight, X, Check, Loader2, Link2Off, Building2,
} from 'lucide-react';
import { devicesApi } from '../../../api/devices';
import { locationsApi } from '../../../api/locations';

export default function SharingPage() {
  const { workspace, isAdmin } = useWorkspaceContext();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sharing', workspace?.workspaceId],
    queryFn: () => apiClient.get('/sharing').then(r => r.data),
    enabled: !!workspace,
  });

  const [tab, setTab] = useState<'overview' | 'invite' | 'request'>('overview');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState('FULL_MANAGEMENT');
  const [scope, setScope] = useState('ALL');
  const [message, setMessage] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());

  // Fetch devices and locations for picker (only when SELECTED scope)
  const { data: devices } = useQuery({
    queryKey: ['devices-sharing'],
    queryFn: () => devicesApi.getAll(),
    enabled: scope === 'SELECTED' && tab === 'invite',
  });
  const { data: locations } = useQuery({
    queryKey: ['locations-sharing'],
    queryFn: () => locationsApi.getAll(),
    enabled: scope === 'SELECTED' && tab === 'invite',
  });

  const toggleDevice = (id: string) => setSelectedDeviceIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleLocation = (id: string) => setSelectedLocationIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const inviteMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post('/sharing/invite', payload),
    onSuccess: () => { toast.success('Zaproszenie wysłane!'); setTab('overview'); setEmail(''); setMessage(''); qc.invalidateQueries({ queryKey: ['sharing'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Błąd'),
  });

  const requestMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post('/sharing/request', payload),
    onSuccess: () => { toast.success('Prośba o dostęp wysłana!'); setTab('overview'); setEmail(''); setMessage(''); qc.invalidateQueries({ queryKey: ['sharing'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Błąd'),
  });

  const revokeMutation = useMutation({
    mutationFn: (managementId: string) => apiClient.post('/sharing/revoke', { managementId }),
    onSuccess: () => { toast.success('Dostęp cofnięty'); qc.invalidateQueries({ queryKey: ['sharing'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Błąd'),
  });

  const managing = data?.managing || [];
  const managedBy = data?.managedBy || [];
  const sentInvites = data?.sentInvites || [];
  const receivedInvites = data?.receivedInvites || [];

  const accessLabels: Record<string, string> = {
    FULL_MANAGEMENT: 'Pełne zarządzanie',
    REMOTE_SUPPORT: 'Wsparcie zdalne',
    MONITORING_ONLY: 'Tylko monitoring',
  };

  const cardStyle: React.CSSProperties = {
    padding: 20, borderRadius: 16,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    marginBottom: 12,
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Share2 size={20} color="var(--accent)" />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', margin: 0 }}>Udostępnianie</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {[
          { id: 'overview' as const, label: 'Przegląd', icon: Shield },
          { id: 'invite' as const, label: 'Udziel dostępu', icon: Send },
          { id: 'request' as const, label: 'Poproś o dostęp', icon: UserPlus },
        ].map(t => {
          const sel = tab === t.id;
          const TI = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 18px', borderRadius: 12, border: 'none',
              background: sel ? 'var(--accent-g, rgba(79,140,255,0.12))' : 'transparent',
              color: sel ? 'var(--accent, #4F46E5)' : 'var(--ts)',
              fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.2s ease',
            }}>
              <TI size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {isLoading && <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} color="var(--tm)" className="animate-spin" /></div>}

      {/* Overview */}
      {tab === 'overview' && !isLoading && (
        <div>
          {/* Companies I manage */}
          {managing.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tm)', marginBottom: 12 }}>Zarządzam firmami</h3>
              {managing.map((m: any) => (
                <div key={m.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>{m.companyWorkspace.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--ts)', marginTop: 2 }}>{accessLabels[m.accessLevel] || m.accessLevel} · {m.status}</div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => { if (confirm('Cofnąć dostęp?')) revokeMutation.mutate(m.id); }}
                        style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--ts)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Link2Off size={13} /> Cofnij
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MSPs that manage me */}
          {managedBy.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tm)', marginBottom: 12 }}>Zarządzane przez</h3>
              {managedBy.map((m: any) => (
                <div key={m.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>{m.mspWorkspace.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--ts)', marginTop: 2 }}>{accessLabels[m.accessLevel] || m.accessLevel}</div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => { if (confirm('Cofnąć dostęp tej firmie?')) revokeMutation.mutate(m.id); }}
                        style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Link2Off size={13} /> Cofnij dostęp
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending invitations */}
          {sentInvites.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tm)', marginBottom: 12 }}>Oczekujące zaproszenia</h3>
              {sentInvites.map((inv: any) => (
                <div key={inv.id} style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{inv.toEmail}</div>
                  <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 2 }}>{inv.direction === 'REQUEST' ? 'Prośba o dostęp' : 'Zaproszenie'} · {accessLabels[inv.accessLevel]}</div>
                </div>
              ))}
            </div>
          )}

          {/* Received invitations */}
          {receivedInvites.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tm)', marginBottom: 12 }}>Otrzymane zaproszenia</h3>
              {receivedInvites.map((inv: any) => (
                <div key={inv.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{inv.fromWorkspace?.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 2 }}>{accessLabels[inv.accessLevel]}</div>
                    </div>
                    <button onClick={() => apiClient.post('/sharing/accept', { token: inv.token }).then(() => { toast.success('Zaakceptowano!'); qc.invalidateQueries({ queryKey: ['sharing'] }); })}
                      style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Check size={13} /> Akceptuj
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {managing.length === 0 && managedBy.length === 0 && sentInvites.length === 0 && receivedInvites.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tm)' }}>
              <Share2 size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <div style={{ fontSize: 15, fontWeight: 500 }}>Brak udostępnień</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Zaproś firmę IT do zarządzania lub poproś o dostęp.</div>
            </div>
          )}
        </div>
      )}

      {/* Invite form */}
      {tab === 'invite' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 750, color: 'var(--t)', marginBottom: 4 }}>Udziel dostępu do swoich urządzeń</h3>
          <p style={{ fontSize: 13, color: 'var(--ts)', marginBottom: 8 }}>Wyślij zaproszenie do firmy IT, która będzie zarządzać Twoją infrastrukturą.</p>
          <p style={{ fontSize: 12, color: 'var(--tm)', marginBottom: 20, padding: '8px 12px', borderRadius: 8, background: isAdmin ? 'transparent' : 'rgba(245,158,11,0.08)', border: isAdmin ? 'none' : '1px solid rgba(245,158,11,0.15)' }}>
            {isAdmin ? '' : '⚠️ Jako pracownik możesz udostępnić tylko urządzenia przypisane do Ciebie.'}
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)', display: 'block', marginBottom: 6 }}>Email firmy IT</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="it@firma.pl" type="email"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t)', fontSize: 14, outline: 'none' }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)', display: 'block', marginBottom: 6 }}>Poziom dostępu</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'FULL_MANAGEMENT', label: 'Pełne zarządzanie' },
                { id: 'REMOTE_SUPPORT', label: 'Wsparcie zdalne' },
                { id: 'MONITORING_ONLY', label: 'Monitoring' },
              ].map(a => (
                <button key={a.id} onClick={() => setAccessLevel(a.id)} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 12, fontWeight: accessLevel === a.id ? 700 : 500,
                  border: `1px solid ${accessLevel === a.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: accessLevel === a.id ? 'var(--accent-g, rgba(79,140,255,0.1))' : 'var(--bg)',
                  color: accessLevel === a.id ? 'var(--accent)' : 'var(--ts)', cursor: 'pointer',
                }}>{a.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)', display: 'block', marginBottom: 6 }}>Zakres</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setScope('ALL')} style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: scope === 'ALL' ? 700 : 500,
                border: `1px solid ${scope === 'ALL' ? 'var(--accent)' : 'var(--border)'}`,
                background: scope === 'ALL' ? 'var(--accent-g, rgba(79,140,255,0.1))' : 'var(--bg)',
                color: scope === 'ALL' ? 'var(--accent)' : 'var(--ts)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}><Monitor size={14} /> Wszystkie urządzenia</button>
              <button onClick={() => setScope('SELECTED')} style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: scope === 'SELECTED' ? 700 : 500,
                border: `1px solid ${scope === 'SELECTED' ? 'var(--accent)' : 'var(--border)'}`,
                background: scope === 'SELECTED' ? 'var(--accent-g, rgba(79,140,255,0.1))' : 'var(--bg)',
                color: scope === 'SELECTED' ? 'var(--accent)' : 'var(--ts)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}><MapPin size={14} /> Wybrane</button>
            </div>
          </div>

          {/* Device/Location picker when SELECTED */}
          {scope === 'SELECTED' && (
            <div style={{ marginBottom: 16 }}>
              {/* Locations */}
              {(locations as any[])?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tm)', display: 'block', marginBottom: 8 }}>
                    <MapPin size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /> Lokalizacje
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(locations as any[]).map((loc: any) => {
                      const sel = selectedLocationIds.has(loc.id);
                      return (
                        <button key={loc.id} onClick={() => toggleLocation(loc.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, width: '100%', textAlign: 'left',
                          border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                          background: sel ? 'var(--accent-g, rgba(79,140,255,0.08))' : 'var(--bg)',
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}>
                          <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel ? 'var(--accent)' : 'transparent', transition: 'all 0.15s ease', flexShrink: 0 }}>
                            {sel && <Check size={12} color="#fff" />}
                          </div>
                          <Building2 size={14} color="var(--tm)" />
                          <span style={{ fontSize: 13, fontWeight: sel ? 600 : 500, color: 'var(--t)' }}>{loc.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Devices */}
              {(devices as any[])?.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tm)', display: 'block', marginBottom: 8 }}>
                    <Monitor size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /> Urządzenia ({selectedDeviceIds.size} wybranych)
                  </label>
                  <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 10, border: '1px solid var(--border)', padding: 6 }}>
                    {(devices as any[]).map((dev: any) => {
                      const sel = selectedDeviceIds.has(dev.id);
                      return (
                        <button key={dev.id} onClick={() => toggleDevice(dev.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, width: '100%', textAlign: 'left', border: 'none',
                          background: sel ? 'var(--accent-g, rgba(79,140,255,0.08))' : 'transparent',
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}>
                          <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel ? 'var(--accent)' : 'transparent', transition: 'all 0.15s ease', flexShrink: 0 }}>
                            {sel && <Check size={10} color="#fff" />}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: sel ? 600 : 500, color: 'var(--t)' }}>{dev.hostname || dev.name || 'Urządzenie'}</div>
                            <div style={{ fontSize: 11, color: 'var(--tm)' }}>{dev.ipAddress || ''} {dev.location?.name ? `· ${dev.location.name}` : ''}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedDeviceIds.size === 0 && selectedLocationIds.size === 0 && (
                <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 8, fontStyle: 'italic' }}>
                  Wybierz lokalizacje lub urządzenia do udostępnienia
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)', display: 'block', marginBottom: 6 }}>Wiadomość (opcjonalnie)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Np. Prosimy o obsługę naszych 14 stanowisk..."
              rows={3} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t)', fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>

          <button onClick={() => inviteMutation.mutate({
              email, accessLevel, scope, message: message || undefined,
              deviceIds: scope === 'SELECTED' ? Array.from(selectedDeviceIds) : undefined,
              locationIds: scope === 'SELECTED' ? Array.from(selectedLocationIds) : undefined,
            })}
            disabled={!email || inviteMutation.isPending || (scope === 'SELECTED' && selectedDeviceIds.size === 0 && selectedLocationIds.size === 0)}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: !email ? 0.5 : 1,
            }}>
            {inviteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Wyślij zaproszenie
          </button>
        </div>
      )}

      {/* Request form */}
      {tab === 'request' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 750, color: 'var(--t)', marginBottom: 4 }}>Poproś firmę IT o obsługę</h3>
          <p style={{ fontSize: 13, color: 'var(--ts)', marginBottom: 20 }}>Wyślij prośbę do firmy IT o objęcie Twojej infrastruktury obsługą informatyczną.</p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)', display: 'block', marginBottom: 6 }}>Email firmy IT</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="biuro@firmaIT.pl" type="email"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t)', fontSize: 14, outline: 'none' }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)', display: 'block', marginBottom: 6 }}>Wiadomość</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Np. Szukamy firmy do obsługi IT naszych biur..."
              rows={3} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t)', fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>

          <button onClick={() => requestMutation.mutate({ email, scope: 'ALL', message: message || undefined })}
            disabled={!email || requestMutation.isPending}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: !email ? 0.5 : 1,
            }}>
            {requestMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Wyślij prośbę o dostęp
          </button>
        </div>
      )}
    </div>
  );
}
