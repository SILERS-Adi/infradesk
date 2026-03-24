import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center py-12', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </div>
  );
}
