import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Activity, Zap, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Input';

interface Usage {
  total: { calls: number; inputTokens: number; outputTokens: number; costPln: number };
  byFeature: { feature: string; calls: number; inputTokens: number; outputTokens: number; costPln: number }[];
  byModel: { model: string; calls: number; inputTokens: number; outputTokens: number; costPln: number }[];
  histogram: { day: string; costPln: number; tokens: number; calls: number }[];
}

const FEATURE_LABEL: Record<string, string> = {
  iris_chat: 'Iris Chat',
  ticket_classify: 'Klasyfikacja ticketów',
  kb_generate: 'Generowanie KB',
  shadow_decision: 'Shadow Mode',
  copilot_chat: 'Copilot',
};

export function AiUsagePage() {
  const [days, setDays] = useState(30);
  const usageQ = useQuery<Usage>({
    queryKey: ['ai', 'usage', days],
    queryFn: async () => (await api.get<Usage>(`/ai/usage?days=${days}`)).data,
  });

  if (usageQ.isLoading) return <SkeletonCard />;
  const u = usageQ.data;
  if (!u) return null;

  const maxCost = Math.max(0.0001, ...u.histogram.map((h) => h.costPln));

  return (
    <div className="space-y-[var(--sp-4)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
            <DollarSign size={18} className="text-[var(--pri)]" /> Koszty AI
          </h1>
          <p className="text-[13px] text-[var(--tx3)] mt-0.5">
            Zużycie modeli Claude w Twoim workspace. Rozliczenie miesięczne, PLN.
          </p>
        </div>
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-[140px]">
          <option value={7}>7 dni</option>
          <option value={30}>30 dni</option>
          <option value={90}>90 dni</option>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--sp-3)]">
        <StatCard icon={DollarSign} label="Koszt" value={`${u.total.costPln.toFixed(2)} zł`} color="var(--pri)" />
        <StatCard icon={Activity} label="Wywołania" value={u.total.calls.toLocaleString('pl-PL')} color="var(--in)" />
        <StatCard icon={Zap} label="Tokenów (in)" value={u.total.inputTokens.toLocaleString('pl-PL')} color="var(--ok)" />
        <StatCard icon={Zap} label="Tokenów (out)" value={u.total.outputTokens.toLocaleString('pl-PL')} color="var(--wn)" />
      </div>

      <Card className="p-[var(--sp-4)]">
        <div className="flex items-center gap-2 mb-[var(--sp-3)]">
          <TrendingUp size={14} />
          <span className="text-[13px] font-medium">Koszt dzienny</span>
        </div>
        <div className="flex items-end gap-1 h-[120px]">
          {u.histogram.map((h, i) => {
            const height = (h.costPln / maxCost) * 100;
            return (
              <div key={h.day} className="flex-1 flex flex-col items-center justify-end group">
                <div
                  className="w-full rounded-t bg-[var(--pri)] hover:bg-[var(--pri-h)] transition-colors relative"
                  style={{ height: `${Math.max(height, 2)}%`, minHeight: 2 }}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap bg-[var(--sf)] border border-[var(--bd)] rounded px-2 py-1 text-[10px] shadow-lg z-10">
                    {h.costPln.toFixed(4)} zł · {h.calls} wyw.
                  </div>
                </div>
                {(i % 7 === 0 || i === u.histogram.length - 1) && (
                  <div className="text-[9px] text-[var(--tx3)] mt-1">
                    {new Date(h.day).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-4)]">
        <Card className="overflow-hidden">
          <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] text-[13px] font-medium">
            Koszt per moduł
          </div>
          <div className="divide-y divide-[var(--bd)]">
            {u.byFeature.length === 0 ? (
              <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">Brak zużycia w tym okresie.</div>
            ) : (
              u.byFeature
                .sort((a, b) => b.costPln - a.costPln)
                .map((f) => (
                  <div key={f.feature} className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)]">
                    <div>
                      <div className="text-[13px]">{FEATURE_LABEL[f.feature] ?? f.feature}</div>
                      <div className="text-[11px] text-[var(--tx3)]">{f.calls} wywołań · {(f.inputTokens + f.outputTokens).toLocaleString('pl-PL')} tokenów</div>
                    </div>
                    <div className="text-[13px] font-semibold">{f.costPln.toFixed(4)} zł</div>
                  </div>
                ))
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] text-[13px] font-medium">
            Koszt per model
          </div>
          <div className="divide-y divide-[var(--bd)]">
            {u.byModel.length === 0 ? (
              <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">Brak zużycia.</div>
            ) : (
              u.byModel
                .sort((a, b) => b.costPln - a.costPln)
                .map((m) => (
                  <div key={m.model} className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)]">
                    <div>
                      <div className="text-[13px] font-mono">{m.model}</div>
                      <div className="text-[11px] text-[var(--tx3)]">{m.calls} wywołań</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{(m.inputTokens + m.outputTokens).toLocaleString('pl-PL')} tok</Badge>
                      <div className="text-[13px] font-semibold">{m.costPln.toFixed(4)} zł</div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string; color: string }) {
  return (
    <Card className="p-[var(--sp-4)]">
      <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
        <Icon size={12} style={{ color }} /> {label}
      </div>
      <div className="text-[22px] font-semibold mt-1">{value}</div>
    </Card>
  );
}
