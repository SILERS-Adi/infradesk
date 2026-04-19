import { useEffect, useRef, useState } from 'react';

/**
 * useCountUp — animates number from 0 → target when mounted or target changes.
 * Respects prefers-reduced-motion (skips straight to final).
 *
 * Usage: const display = useCountUp(98, 900);  → 0, 12, 45, 78, 98
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(target);
  const prevRef = useRef<number>(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setValue(target); prevRef.current = target; return; }

    const from = prevRef.current;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      /* easeOutQuart */
      const e = 1 - Math.pow(1 - t, 4);
      const v = from + (to - from) * e;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else prevRef.current = to;
    };
    rafRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
