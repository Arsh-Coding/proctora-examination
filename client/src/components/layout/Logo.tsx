import { cn } from '../../utils/cn';

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white"
      >
        P
      </span>
      {compact ? null : (
        <span className="text-base font-black tracking-tight">
          PROCTORA
        </span>
      )}
    </span>
  );
}
