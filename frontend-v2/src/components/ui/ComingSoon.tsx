import { Zap } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  sprint?: string;
  note?: string;
}

export function ComingSoon({ title, sprint, note }: ComingSoonProps) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center anim-up">
      <div className="card rounded-[var(--r-l)] px-10 py-14 text-center max-w-md">
        <div
          className="w-14 h-14 rounded-[var(--r)] mx-auto mb-4 flex items-center justify-center anim-glow"
          style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)', boxShadow: '0 4px 20px var(--pri-glow2)' }}
        >
          <Zap className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-[18px] font-bold text-tx mb-2">{title}</h2>
        <p className="text-[12px] text-tx3 leading-relaxed mb-3">
          {note ?? 'Ten moduł pojawi się w kolejnej fazie rebuildu — cały plan jest w V2_BLUEPRINT.md.'}
        </p>
        {sprint && (
          <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--pri)' }}>
            Plan: {sprint}
          </p>
        )}
      </div>
    </div>
  );
}
