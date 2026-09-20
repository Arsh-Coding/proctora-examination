import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const TONES: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  neutral: 'bg-ink-100 text-ink-700',
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm shadow-ink-900/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
        {icon ? (
          <span className={cn('flex size-8 items-center justify-center rounded-lg', TONES[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
