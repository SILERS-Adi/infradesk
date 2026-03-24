import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { HelpCircle, Plus, Trash2, Save, GripVertical, ChevronDown, ChevronUp, Monitor, Bot } from 'lucide-react';
import apiClient from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';

type Visibility = 'panel' | 'agent' | 'both';

interface FaqItem { q: string; a: string; visibility: Visibility; }

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'panel',  label: 'Panel',        icon: <Monitor className="h-3.5 w-3.5" />, desc: 'Widoczne tylko w panelu admina' },
  { value: 'agent',  label: 'Agent',         icon: <Bot     className="h-3.5 w-3.5" />, desc: 'Widoczne tylko w aplikacji agenta' },
  { value: 'both',   label: 'Panel i Agent', icon: <><Monitor className="h-3.5 w-3.5" /><Bot className="h-3.5 w-3.5" /></>, desc: 'Widoczne wszędzie' },
];

const VISIBILITY_BADGE: Record<Visibility, { label: string; cls: string }> = {
  panel: { label: 'Panel',        cls: 'bg-indigo-50 text-indigo-700' },
  agent: { label: 'Agent',        cls: 'bg-emerald-50 text-emerald-700' },
  both:  { label: 'Panel+Agent',  cls: 'bg-amber-50 text-amber-700' },
};

function useFaq() {
  return useQuery<FaqItem[]>({
    queryKey: ['settings', 'faq'],
    queryFn: async () => {
      const { data } = await apiClient.get('/settings/faq');
      const arr: any[] = Array.isArray(data)
        ? data
        : data?.value ? (() => { try { return JSON.parse(data.value); } catch { return []; } })()
        : [];
      // migrate old entries without visibility
      return arr.map(it => ({ ...it, visibility: it.visibility ?? 'both' }));
    },
  });
}

export function FaqPage() {
  const qc = useQueryClient();
  const { data: initial, isLoading } = useFaq();
  const [items, setItems] = useState<FaqItem[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const list: FaqItem[] = items ?? initial ?? [];

  const saveMutation = useMutation({
    mutationFn: async (data: FaqItem[]) => {
      await apiClient.put('/settings/faq', { value: JSON.stringify(data) });
    },
    onSuccess: () => {
      toast.success('FAQ zapisane');
      qc.invalidateQueries({ queryKey: ['settings', 'faq'] });
      setItems(null);
    },
    onError: () => toast.error('Błąd zapisu'),
  });

  function update<K extends keyof FaqItem>(idx: number, field: K, val: FaqItem[K]) {
    setItems(list.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  function remove(idx: number) {
    setItems(list.filter((_, i) => i !== idx));
    if (expanded === idx) setExpanded(null);
  }

  function addItem() {
    const next = [...list, { q: '', a: '', visibility: 'both' as Visibility }];
    setItems(next);
    setExpanded(next.length - 1);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...list];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setItems(next);
  }

  function moveDown(idx: number) {
    if (idx === list.length - 1) return;
    const next = [...list];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setItems(next);
  }

  const isDirty = items !== null;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="FAQ"
        subtitle="Baza wiedzy widoczna w panelu i/lub aplikacji agenta"
      />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-brand-500" />
            Wpisy FAQ
          </h2>
          <button
            onClick={addItem}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Dodaj wpis
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Ładowanie...</p>
        ) : list.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <HelpCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Brak wpisów — kliknij "Dodaj wpis"</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((item, idx) => {
              const badge = VISIBILITY_BADGE[item.visibility ?? 'both'];
              return (
                <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div
                    className="flex items-center gap-2 px-4 py-3 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                  >
                    <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                      {item.q || <span className="text-gray-400 italic">Nowe pytanie</span>}
                    </span>
                    {/* Visibility badge */}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => moveUp(idx)} disabled={idx === 0}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors">
                        <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => moveDown(idx)} disabled={idx === list.length - 1}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors">
                        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => remove(idx)}
                        className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {expanded === idx
                      ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    }
                  </div>

                  {/* Edit form */}
                  {expanded === idx && (
                    <div className="p-4 space-y-4 border-t border-gray-100">

                      {/* Visibility selector */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">Widoczność</label>
                        <div className="flex gap-2">
                          {VISIBILITY_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => update(idx, 'visibility', opt.value)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                                item.visibility === opt.value
                                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                              title={opt.desc}
                            >
                              {opt.icon}
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Pytanie</label>
                        <input
                          type="text"
                          value={item.q}
                          onChange={e => update(idx, 'q', e.target.value)}
                          placeholder="np. Co zrobić gdy komputer się zawiesił?"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Odpowiedź</label>
                        <textarea
                          value={item.a}
                          onChange={e => update(idx, 'a', e.target.value)}
                          rows={4}
                          placeholder="Szczegółowa odpowiedź / instrukcja..."
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(isDirty || list.length > 0) && (
          <div className="flex justify-end pt-4 mt-2 border-t border-gray-100">
            <Button
              onClick={() => saveMutation.mutate(list)}
              loading={saveMutation.isPending}
              disabled={!isDirty}
              icon={<Save className="h-4 w-4" />}
            >
              Zapisz FAQ
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
