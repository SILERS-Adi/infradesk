import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Copy, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Override } from './PermissionTreeEditor';

interface Schema {
  id: string;
  name: string;
  description: string | null;
  overrides: Override[];
}

interface Props {
  currentOverrides: Override[];
  onApply: (overrides: Override[]) => void;
}

export function PermissionSchemas({ currentOverrides, onApply }: Props) {
  const qc = useQueryClient();
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const { data: schemas = [] } = useQuery<Schema[]>({
    queryKey: ['permission-schemas'],
    queryFn: async () => (await api.get('/permissions/schemas/list')).data,
  });

  const saveMut = useMutation({
    mutationFn: async () => (await api.post('/permissions/schemas', {
      name, description: desc || null, overrides: currentOverrides,
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-schemas'] });
      toast.success('Schemat zapisany');
      setShowSave(false); setName(''); setDesc('');
    },
    onError: () => toast.error('Błąd zapisu'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/permissions/schemas/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-schemas'] });
      toast.success('Usunięto');
    },
  });

  const dupMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/permissions/schemas/${id}/duplicate`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission-schemas'] });
      toast.success('Zduplikowano');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-tx3">Szybkie szablony</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowSave(!showSave)} className="gap-1 text-[10px]">
          <Save className="h-3 w-3" /> Zapisz jako schemat
        </Button>
      </div>

      {showSave && (
        <div className="p-3 rounded-[var(--r-s)] border border-pri bg-pri-l mb-2 space-y-2">
          <Input placeholder="Nazwa schematu (np. Serwisant terenowy)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Opis (opcjonalnie)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowSave(false)}>Anuluj</Button>
            <Button type="button" size="sm" onClick={() => saveMut.mutate()} disabled={!name || saveMut.isPending}>
              {saveMut.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Zapisywanie</> : 'Zapisz'}
            </Button>
          </div>
        </div>
      )}

      {schemas.length === 0 ? (
        <div className="text-[11px] text-tx3 italic py-2">
          Brak zapisanych szablonów. Skonfiguruj drzewo uprawnień poniżej i kliknij „Zapisz jako schemat".
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {schemas.map((s) => (
            <div key={s.id} className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-bd bg-sf-h hover:border-pri">
              <button type="button" onClick={() => { onApply(s.overrides); toast.success(`Zastosowano: ${s.name}`); }}
                className="text-[11px] text-tx2 hover:text-pri font-medium" title={s.description ?? ''}>
                {s.name}
              </button>
              <button type="button" onClick={() => dupMut.mutate(s.id)} className="p-0.5 opacity-0 group-hover:opacity-100 text-tx3 hover:text-pri" title="Duplikuj">
                <Copy className="h-2.5 w-2.5" />
              </button>
              <button type="button" onClick={() => { if (confirm(`Usunąć schemat „${s.name}"?`)) deleteMut.mutate(s.id); }}
                className="p-0.5 opacity-0 group-hover:opacity-100 text-tx3 hover:text-er" title="Usuń">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

