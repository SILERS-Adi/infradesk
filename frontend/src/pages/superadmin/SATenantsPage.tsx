import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2, Search, Trash2, Edit2, Plus, X, Save, AlertTriangle } from 'lucide-react';
import { superadminApi } from '../../api/superadmin';

const TYPE_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  MSP:      { label: 'MSP',     color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  COMPANY:  { label: 'Firma',   color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  PERSONAL: { label: 'Osobisty', color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
};

const ORG_TYPE_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  msp:                { label: 'MSP',             color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  internal_it:        { label: 'Dział IT',        color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  client:             { label: 'Klient',          color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  // Backward compat
  it_operator:        { label: 'MSP',             color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  client_external_it: { label: 'Klient',          color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
};

const PLANS = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export default function SATenantsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newWs, setNewWs] = useState({ name: '', slug: '', type: 'COMPANY', plan: 'FREE', email: '', taxId: '', city: '', phone: '' });

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['sa-tenants'],
    queryFn: superadminApi.getTenants,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => superadminApi.updateTenant(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); toast.success('Zapisano'); setEditId(null); },
    onError: () => toast.error('Błąd zapisu'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => superadminApi.deleteTenant(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); toast.success('Usunięto'); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Błąd usuwania'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => superadminApi.createTenant(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-tenants'] }); toast.success('Utworzono'); setShowCreate(false); setNewWs({ name: '', slug: '', type: 'COMPANY', plan: 'FREE', email: '', taxId: '', city: '', phone: '' }); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Błąd tworzenia'),
  });

  const filtered = workspaces.filter((w: any) =>
    !search || w.name?.toLowerCase().includes(search.toLowerCase()) || w.slug?.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (ws: any) => {
    setEditId(ws.id);
    setEditData({
      name: ws.name || '', slug: ws.slug || '', plan: ws.plan || 'FREE',
      legalName: ws.legalName || '', taxId: ws.taxId || '',
      email: ws.email || '', phone: ws.phone || '', website: ws.website || '',
      addressLine1: ws.addressLine1 || '', postalCode: ws.postalCode || '', city: ws.city || '', country: ws.country || 'PL',
      maxAgents: ws.maxAgents ?? 10, maxUsers: ws.maxUsers ?? 5,
      enabledModules: ws.enabledModules ?? ['helpdesk'],
      organizationType: ws.organizationType ?? 'internal_it',
      isActive: ws.isActive,
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 12,
    background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)' }}>Workspace'y</h1>
          <p style={{ fontSize: 12, color: 'var(--td)' }}>{workspaces.length} workspace'ów</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
          background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>
          <Plus style={{ width: 14, height: 14 }} /> Nowy workspace
        </button>
      </div>

      {/* Search */}
      <div className="page-card" style={{ padding: 12, marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search style={{ position: 'absolute', left: 10, top: 10, width: 14, height: 14, color: 'var(--td)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj..."
            style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
      </div>

      {/* Table */}
      <div className="page-card" style={{ padding: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}>
        {isLoading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--td)' }}>Ładowanie...</div>}

        {!isLoading && (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase' }}>Nazwa</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase' }}>Typ</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase' }}>Organizacja</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase' }}>Plan</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase' }}>NIP</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase' }}>Miasto</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase' }}>Status</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ws: any) => {
                const tc = TYPE_COLORS[ws.type] ?? TYPE_COLORS.COMPANY;
                const isEditing = editId === ws.id;

                return (
                  <tr key={ws.id} className="group" style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--t)' }}>{ws.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--td)' }}>{ws.slug}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: tc.bg, color: tc.color }}>{tc.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {(() => { const oc = ORG_TYPE_COLORS[ws.organizationType] ?? ORG_TYPE_COLORS.internal_it; return (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: oc.bg, color: oc.color }}>{oc.label}</span>
                      ); })()}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ts)' }}>{ws.plan}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--td)' }}>{ws.taxId || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--td)' }}>{ws.city || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: ws.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: ws.isActive ? '#4ADE80' : '#F87171' }}>
                        {ws.isActive ? 'Aktywny' : 'Nieaktywny'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(ws)} title="Edytuj"
                          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)' }}>
                          <Edit2 style={{ width: 13, height: 13 }} />
                        </button>
                        <button onClick={() => setDeleteTarget(ws)} title="Usuń"
                          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}>
                          <Trash2 style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 24, maxWidth: 400, width: '90%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle style={{ width: 20, height: 20, color: '#F87171' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>Usunąć workspace?</div>
                <div style={{ fontSize: 12, color: 'var(--td)' }}>To usunie wszystkie powiązane dane!</div>
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{deleteTarget.name}</div>
              <div style={{ fontSize: 11, color: 'var(--td)' }}>{deleteTarget.slug} · {deleteTarget.type} · {deleteTarget.plan}</div>
              <div style={{ fontSize: 10, color: '#F87171', marginTop: 6 }}>
                Usunięte zostaną: urządzenia, lokalizacje, zgłoszenia, sejf haseł, sesje, agenty i wszystkie inne dane tego workspace.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteTarget(null)} style={{
                flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--ts)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>Anuluj</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} style={{
                flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
                background: '#EF4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>{deleteMutation.isPending ? 'Usuwam...' : 'Usuń trwale'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 24, maxWidth: 440, width: '90%', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 16 }}>Nowy workspace</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={newWs.name} onChange={e => setNewWs({ ...newWs, name: e.target.value })} placeholder="Nazwa firmy *" style={inputStyle} />
              <input value={newWs.slug} onChange={e => setNewWs({ ...newWs, slug: e.target.value })} placeholder="Slug (np. pks-garwolin)" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={newWs.type} onChange={e => setNewWs({ ...newWs, type: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                  <option value="COMPANY">Firma</option>
                  <option value="MSP">MSP</option>
                  <option value="PERSONAL">Osobisty</option>
                </select>
                <select value={newWs.plan} onChange={e => setNewWs({ ...newWs, plan: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <input value={newWs.email} onChange={e => setNewWs({ ...newWs, email: e.target.value })} placeholder="Email" style={inputStyle} />
              <input value={newWs.taxId} onChange={e => setNewWs({ ...newWs, taxId: e.target.value })} placeholder="NIP" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newWs.city} onChange={e => setNewWs({ ...newWs, city: e.target.value })} placeholder="Miasto" style={{ ...inputStyle, flex: 1 }} />
                <input value={newWs.phone} onChange={e => setNewWs({ ...newWs, phone: e.target.value })} placeholder="Telefon" style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowCreate(false)} style={{
                flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--ts)', cursor: 'pointer', fontSize: 12,
              }}>Anuluj</button>
              <button onClick={() => createMutation.mutate(newWs)} disabled={!newWs.name.trim()} style={{
                flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                opacity: newWs.name.trim() ? 1 : 0.4,
              }}>{createMutation.isPending ? 'Tworzę...' : 'Utwórz'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal — full fields */}
      {editId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 24, maxWidth: 540, width: '90%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 16 }}>Edytuj workspace</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginTop: 4 }}>DANE PODSTAWOWE</div>
              <input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} placeholder="Nazwa firmy *" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={editData.slug} onChange={e => setEditData({ ...editData, slug: e.target.value })} placeholder="Slug" style={{ ...inputStyle, flex: 1 }} />
                <input value={editData.legalName} onChange={e => setEditData({ ...editData, legalName: e.target.value })} placeholder="Nazwa prawna" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={editData.plan} onChange={e => setEditData({ ...editData, plan: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ts)', cursor: 'pointer', flex: 1 }}>
                  <input type="checkbox" checked={editData.isActive} onChange={e => setEditData({ ...editData, isActive: e.target.checked })} />
                  {editData.isActive ? 'Aktywny' : 'Nieaktywny'}
                </label>
              </div>

              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginTop: 8 }}>TYP ORGANIZACJI</div>
              <select value={editData.organizationType ?? 'internal_it'} onChange={e => setEditData({ ...editData, organizationType: e.target.value })} style={inputStyle}>
                <option value="msp">MSP — Centrum Obsługi IT</option>
                <option value="internal_it">Dział IT wewnętrzny</option>
                <option value="client">Klient</option>
              </select>

              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginTop: 8 }}>KONTAKT</div>
              <input value={editData.taxId} onChange={e => setEditData({ ...editData, taxId: e.target.value })} placeholder="NIP" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} placeholder="Email" style={{ ...inputStyle, flex: 1 }} />
                <input value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} placeholder="Telefon" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input value={editData.website} onChange={e => setEditData({ ...editData, website: e.target.value })} placeholder="Strona www" style={inputStyle} />

              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginTop: 8 }}>ADRES</div>
              <input value={editData.addressLine1} onChange={e => setEditData({ ...editData, addressLine1: e.target.value })} placeholder="Adres (ulica)" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={editData.postalCode} onChange={e => setEditData({ ...editData, postalCode: e.target.value })} placeholder="Kod pocztowy" style={{ ...inputStyle, flex: 1 }} />
                <input value={editData.city} onChange={e => setEditData({ ...editData, city: e.target.value })} placeholder="Miasto" style={{ ...inputStyle, flex: 1 }} />
                <input value={editData.country} onChange={e => setEditData({ ...editData, country: e.target.value })} placeholder="Kraj" style={{ ...inputStyle, width: 60 }} />
              </div>

              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginTop: 8 }}>LIMITY</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--td)', marginBottom: 4 }}>Max agentów</div>
                  <input type="number" value={editData.maxAgents} onChange={e => setEditData({ ...editData, maxAgents: parseInt(e.target.value) || 0 })} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--td)', marginBottom: 4 }}>Max użytkowników</div>
                  <input type="number" value={editData.maxUsers} onChange={e => setEditData({ ...editData, maxUsers: parseInt(e.target.value) || 0 })} style={inputStyle} />
                </div>
              </div>
            </div>

              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginTop: 8 }}>MODUŁY</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { id: 'helpdesk', label: 'Helpdesk' },
                  { id: 'invoicing', label: 'Faktury' },
                  { id: 'packaging', label: 'Pakowanie' },
                  { id: 'service', label: 'Serwis SKP' },
                ].map(mod => {
                  const enabled = (editData.enabledModules || []).includes(mod.id);
                  return (
                    <label key={mod.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                      background: enabled ? 'rgba(99,102,241,0.12)' : 'var(--hover-bg)',
                      border: `1px solid ${enabled ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                      fontSize: 12, fontWeight: 600, color: enabled ? 'var(--accent)' : 'var(--tm)',
                    }}>
                      <input type="checkbox" checked={enabled}
                        onChange={() => {
                          const mods = editData.enabledModules || [];
                          setEditData({ ...editData, enabledModules: enabled ? mods.filter((m: string) => m !== mod.id) : [...mods, mod.id] });
                        }}
                        style={{ accentColor: 'var(--accent)' }} />
                      {mod.label}
                    </label>
                  );
                })}
              </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditId(null)} style={{
                flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--ts)', cursor: 'pointer', fontSize: 12,
              }}>Anuluj</button>
              <button onClick={() => updateMutation.mutate({ id: editId, data: editData })} style={{
                flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>{updateMutation.isPending ? 'Zapisuję...' : 'Zapisz zmiany'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
