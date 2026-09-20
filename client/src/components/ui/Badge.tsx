import type { ReactNode } from 'react';
import type { Severity, SessionStatus } from '../../types';
import { cn } from '../../utils/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<SessionStatus, Tone> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'info',
  SUBMITTED: 'success',
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]}>
      {status === 'IN_PROGRESS' ? (
        <span className="size-1.5 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
      ) : null}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const SEVERITY_TONES: Record<Severity, Tone> = {
  LOW: 'warning',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge tone={SEVERITY_TONES[severity]} className={severity === 'MEDIUM' ? 'bg-orange-50 text-orange-700 ring-orange-200' : undefined}>
      {severity}
    </Badge>
  );
}
