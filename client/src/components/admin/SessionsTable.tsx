import { useNavigate } from 'react-router-dom';
import type { AdminSessionRow } from '../../types';
import { formatDateTime, formatDuration, formatPercent } from '../../utils/format';
import { Badge, StatusBadge } from '../ui/Badge';
import { Table, Td, Th, Tr } from '../ui/Table';

export function SessionsTable({
  sessions,
  showExam = false,
  liveSessionIds,
}: {
  sessions: AdminSessionRow[];
  showExam?: boolean;
  liveSessionIds?: Set<string>;
}) {
  const navigate = useNavigate();

  return (
    <Table>
      <thead>
        <tr>
          <Th>Candidate</Th>
          {showExam ? <Th>Exam</Th> : null}
          <Th>Status</Th>
          <Th>Started</Th>
          <Th>Submitted</Th>
          <Th align="right">Score</Th>
          <Th align="right">Violations</Th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <Tr key={session.id} onClick={() => navigate(`/sessions/${session.id}`)}>
            <Td>
              <div className="flex items-center gap-2">
                {liveSessionIds?.has(session.id) ? (
                  <span
                    className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500"
                    title="Connected right now"
                    aria-label="Connected right now"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{session.candidateName}</p>
                  <p className="truncate text-xs text-ink-500">{session.candidateEmail}</p>
                </div>
              </div>
            </Td>
            {showExam ? (
              <Td>
                <span className="text-ink-700">{session.examTitle ?? '—'}</span>
              </Td>
            ) : null}
            <Td>
              <div className="flex flex-col items-start gap-1">
                <StatusBadge status={session.status} />
                {session.status === 'IN_PROGRESS' && session.remainingMs > 0 ? (
                  <span className="font-mono text-[11px] text-ink-500">
                    {formatDuration(session.remainingMs)} left
                  </span>
                ) : null}
              </div>
            </Td>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(session.startedAt)}</Td>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(session.submittedAt)}</Td>
            <Td align="right">
              {session.status === 'SUBMITTED' ? (
                <span className="font-semibold text-ink-900">
                  {session.score}/{session.totalMarks}
                  <span className="ml-1 text-xs font-normal text-ink-500">
                    ({formatPercent(session.percentage)})
                  </span>
                </span>
              ) : (
                <span className="text-xs text-ink-500">
                  {session.answeredCount} answered
                </span>
              )}
            </Td>
            <Td align="right">
              {session.violationCount > 0 ? (
                <Badge tone={session.violationCount >= 5 ? 'danger' : 'warning'}>
                  {session.violationCount}
                </Badge>
              ) : (
                <Badge tone="success">0</Badge>
              )}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
