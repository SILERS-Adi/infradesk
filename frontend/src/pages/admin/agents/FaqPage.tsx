import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { HelpCircle, Plus, Trash2, Save, GripVertical, ChevronDown, ChevronUp, Monitor, Bot } from 'lucide-react';
import apiClient from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

type Visibility = 'panel' | 'agent' | 'both';

interface FaqItem { q: string; a: string; visibility: Visibility; }

const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'panel',  label: 'Panel',        icon: <Monitor className="h-3.5 w-3.5" />, desc: 'Widoczne tylko w panelu admina' },
  { value: 'agent',  label: 'Asystent',         icon: <Bot     className="h-3.5 w-3.5" />, desc: 'Widoczne tylko w aplikacji asystenta' },
  { value: 'both',   label: 'Panel i Asystent', icon: <><Monitor className="h-3.5 w-3.5" /><Bot className="h-3.5 w-3.5" /></>, desc: 'Widoczne wszędzie' },
];

const VISIBILITY_BADGE: Record<Visibility, { label: string; bg: string; color: string }> = {
  panel: { label: 'Panel',       bg: 'rgba(99,102,241,0.12)', color: '#818CF8' },
  agent: { label: 'Asystent',       bg: 'rgba(16,185,129,0.12)', color: '#34D399' },
  both:  { label: 'Panel+Asystent', bg: 'rgba(234,179,8,0.12)',  color: '#FBBF24' },
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
        subtitle="Baza wiedzy widoczna w panelu i/lub aplikacji asystenta"
      />

      <Card>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[14px] font-semibold text-white/80 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-violet-400" />
            Wpisy FAQ
          </h2>
          <button
            onClick={addItem}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Dodaj wpis
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm py-4 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>Ładowanie...</p>
        ) : list.length === 0 ? (
          <div className="text-center py-10" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <HelpCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Brak wpisów — kliknij "Dodaj wpis"</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((item, idx) => {
              const badge = VISIBILITY_BADGE[item.visibility ?? 'both'];
              return (
                <div key={idx} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Header */}
                  <div
                    className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none transition-colors"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  >
                    <GripVertical className="h-4 w-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }} />
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {item.q || <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Nowe pytanie</span>}
                    </span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => moveUp(idx)} disabled={idx === 0}
                        className="p-1 rounded transition-colors hover:bg-white/[0.06] disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
                      </button>
                      <button onClick={() => moveDown(idx)} disabled={idx === list.length - 1}
                        className="p-1 rounded transition-colors hover:bg-white/[0.06] disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
                      </button>
                      <button onClick={() => remove(idx)}
                        className="p-1 rounded transition-colors hover:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" style={{ color: 'rgba(239,68,68,0.6)' }} />
                      </button>
                    </div>
                    {expanded === idx
                      ? <ChevronUp className="h-4 w-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
                      : <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    }
                  </div>

                  {/* Edit form */}
                  {expanded === idx && (
                    <div className="p-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {/* Visibility selector */}
                      <div>
                        <label className="block text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Widoczność</label>
                        <div className="flex gap-2">
                          {VISIBILITY_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => update(idx, 'visibility', opt.value)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                              style={
                                item.visibility === opt.value
                                  ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA' }
                                  : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
                              }
                              title={opt.desc}
                            >
                              {opt.icon}
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Pytanie</label>
                        <input
                          type="text"
                          value={item.q}
                          onChange={e => update(idx, 'q', e.target.value)}
                          placeholder="np. Co zrobić gdy komputer się zawiesił?"
                          className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Odpowiedź</label>
                        <textarea
                          value={item.a}
                          onChange={e => update(idx, 'a', e.target.value)}
                          rows={4}
                          placeholder="Szczegółowa odpowiedź / instrukcja..."
                          className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
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
          <div className="flex justify-end pt-4 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
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
      </Card>
    </div>
  );
}
