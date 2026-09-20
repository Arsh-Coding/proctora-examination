import { Link } from 'react-router-dom';
import type { ViolationRecord } from '../../types';
import { formatTime } from '../../utils/format';
import { violationLabel } from '../../utils/violations';
import { SeverityBadge } from '../ui/Badge';
import { EmptyState } from '../ui/States';

export interface FeedItem extends ViolationRecord {
  candidateName?: string;
}

/** Chronological violation list. New items arrive over Socket.io, not polling. */
export function ViolationFeed({
  items,
  emptyTitle = 'No violations recorded',
  emptyDescription = 'Proctoring events will appear here as soon as they happen.',
  showCandidate = false,
  linkToSession = false,
}: {
  items: FeedItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  showCandidate?: boolean;
  linkToSession?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="divide-y divide-ink-100">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-5 py-3">
          <span className="mt-0.5 font-mono text-xs text-ink-500 tabular-nums">
            {formatTime(item.timestamp)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">
              <span className="font-mono text-xs text-ink-500">{item.type}</span>{' '}
              <span className="font-normal text-ink-700">— {violationLabel(item.type)}</span>
            </p>
            {showCandidate && item.candidateName ? (
              <p className="text-xs text-ink-500">
                {linkToSession ? (
                  <Link to={`/sessions/${item.sessionId}`} className="font-medium hover:text-brand-700 hover:underline">
                    {item.candidateName}
                  </Link>
                ) : (
                  item.candidateName
                )}
                {item.examTitle ? ` · ${item.examTitle}` : null}
              </p>
            ) : null}
          </div>
          <SeverityBadge severity={item.severity} />
        </li>
      ))}
    </ul>
  );
}
