import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Download, Trash2, Copy, Plus, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';

interface Override {
  nodeId: string;
  level: string;
  canDelete?: boolean;
}

interface Schema {
  id: string;
  name: string;
  description: string | null;
  overrides: Override[];
}

interface Props {
  currentOverrides: Override[];
  onApply: (overrides: Override[]) => void;
  onSave: (name: string, description: string) => void;
}

export function PermissionSchemas({ currentOverrides, onApply, onSave }: Props) {
  const qc = useQueryClient();
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const { data: schemas = [] } = useQuery<Schema[]>({
    queryKey: ['permission-schemas'],
    queryFn: () => apiClient.get('/permissions/schemas/list').then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/permissions/schemas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permission-schemas'] }); toast.success('Schemat usunięty'); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/permissions/schemas/${id}/duplicate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permission-schemas'] }); toast.success('Schemat zduplikowany'); },
  });

  const saveMutation = useMutation({
    mutationFn: () => apiClient.post('/permissions/schemas', { name, description: desc || null, overrides: currentOverrides }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-schemas'] });
      toast.success('Schemat zapisany');
      setShowSave(false);
      setName('');
      setDesc('');
    },
    onError: () => toast.error('Błąd zapisu schematu'),
  });

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ts)' }}>Schematy uprawnień</span>
        <button
          type="button"
          onClick={() => setShowSave(!showSave)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 6, border: '1px solid var(--border)', background: 'none',
            color: 'var(--tm)', fontSize: 10, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Save style={{ width: 11, height: 11 }} />
          Zapisz jako schemat
        </button>
      </div>

      {/* Save form */}
      {showSave && (
        <div style={{
          padding: 12, borderRadius: 10, border: '1px solid var(--accent)',
          background: 'var(--accent-g, rgba(99,102,241,0.06))', marginBottom: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nazwa schematu..."
            style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--t)', fontSize: 12,
            }}
          />
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Opis (opcjonalnie)..."
            style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--t)', fontSize: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600,
                cursor: name.trim() ? 'pointer' : 'default', opacity: name.trim() ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              {saveMutation.isPending ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Save style={{ width: 12, height: 12 }} />}
              Zapisz
            </button>
            <button
              type="button"
              onClick={() => { setShowSave(false); setName(''); setDesc(''); }}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'none', color: 'var(--ts)', fontSize: 11, cursor: 'pointer',
              }}
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Schema list */}
      {schemas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {schemas.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--hover-bg)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{s.name}</div>
                {s.description && <div style={{ fontSize: 10, color: 'var(--td)' }}>{s.description}</div>}
              </div>
              <button type="button" onClick={() => onApply(s.overrides as Override[])} title="Wczytaj schemat"
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex' }}>
                <Download style={{ width: 13, height: 13 }} />
              </button>
              <button type="button" onClick={() => duplicateMutation.mutate(s.id)} title="Duplikuj"
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', display: 'flex' }}>
                <Copy style={{ width: 13, height: 13 }} />
              </button>
              <button type="button" onClick={() => { if (confirm(`Usunąć schemat "${s.name}"?`)) deleteMutation.mutate(s.id); }} title="Usuń"
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex' }}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {schemas.length === 0 && !showSave && (
        <div style={{ fontSize: 10, color: 'var(--td)', fontStyle: 'italic' }}>
          Brak zapisanych schematów. Ustaw uprawnienia i kliknij „Zapisz jako schemat".
        </div>
      )}
    </div>
  );
}
