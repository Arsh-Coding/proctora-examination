import { cn } from '../../utils/cn';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
        className
      )}
    />
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-ink-500">
      <Spinner size={28} className="text-brand-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
