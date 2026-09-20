import { cn } from '../../utils/cn';
import type { CheckItem, CheckState } from '../../utils/systemCheck';

const ICONS: Record<CheckState, { glyph: string; className: string; label: string }> = {
  pending: { glyph: '•', className: 'bg-ink-100 text-ink-400', label: 'Not checked' },
  checking: { glyph: '…', className: 'bg-amber-50 text-amber-600', label: 'Checking' },
  pass: { glyph: '✓', className: 'bg-emerald-50 text-emerald-600', label: 'Passed' },
  fail: { glyph: '✕', className: 'bg-rose-50 text-rose-600', label: 'Failed' },
  warn: { glyph: '!', className: 'bg-amber-50 text-amber-700', label: 'Warning' },
};

export function SystemCheckList({ items }: { items: CheckItem[] }) {
  return (
    <ul className="divide-y divide-ink-100">
      {items.map((item) => {
        const icon = ICONS[item.state];
        return (
          <li key={item.key} className="flex items-start gap-3 px-5 py-3">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                icon.className
              )}
            >
              {icon.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">
                {item.label}
                {!item.required ? (
                  <span className="ml-2 text-[11px] font-medium text-ink-400">optional</span>
                ) : null}
              </p>
              {item.detail ? <p className="mt-0.5 text-xs text-ink-500">{item.detail}</p> : null}
            </div>
            <span className="sr-only">{icon.label}</span>
          </li>
        );
      })}
    </ul>
  );
}


