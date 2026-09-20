import type { ProctoringAlert } from '../../hooks/useProctoring';
import { cn } from '../../utils/cn';

/**
 * The candidate-facing proctoring warning area.
 * Warnings are informative: the MVP records violations for review and never
 * terminates an attempt automatically.
 */
export function ProctorWarnings({
  alerts,
  warningCount,
  maxWarnings,
  onDismiss,
}: {
  alerts: ProctoringAlert[];
  warningCount: number;
  maxWarnings: number;
  onDismiss: (id: string) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2" role="alert" aria-live="assertive">
      {alerts.map((alert) => {
        const overBudget = alert.warningIndex !== null && alert.warningIndex > maxWarnings;
        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-2.5',
              overBudget
                ? 'border-rose-300 bg-rose-50 text-rose-900'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-black text-white',
                overBudget ? 'bg-rose-600' : 'bg-amber-500'
              )}
            >
              !
            </span>
            <div className="min-w-0 flex-1">
              {alert.warningIndex !== null ? (
                <p className="text-xs font-bold tracking-wide uppercase">
                  {overBudget
                    ? `Warning ${alert.warningIndex} — limit of ${maxWarnings} exceeded`
                    : `Warning ${alert.warningIndex}/${maxWarnings}`}
                </p>
              ) : (
                <p className="text-xs font-bold tracking-wide uppercase">Proctoring notice</p>
              )}
              <p className="mt-0.5 text-sm font-medium">{alert.message}</p>
              {overBudget ? (
                <p className="mt-1 text-xs">
                  Further violations are being recorded and will be reviewed by the exam
                  administrator.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(alert.id)}
              className="shrink-0 rounded px-1.5 text-lg leading-none opacity-60 transition hover:opacity-100"
              aria-label="Dismiss warning"
            >
              &times;
            </button>
          </div>
        );
      })}

      {warningCount > 0 ? (
        <p className="text-xs text-ink-500">
          Recorded warnings this attempt: <strong>{warningCount}</strong>
          {maxWarnings > 0 ? ` (allowance ${maxWarnings})` : null}
        </p>
      ) : null}
    </div>
  );
}
