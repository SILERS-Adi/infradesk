import { clsx } from 'clsx';

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center py-12', className)}>
      <div className="h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
