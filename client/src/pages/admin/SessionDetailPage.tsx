import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StatCard } from '../../components/admin/StatCard';
import { ViolationFeed } from '../../components/admin/ViolationFeed';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState, InlineAlert } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useAdminSocket } from '../../hooks/useAdminSocket';
import { adminSessionService } from '../../services/session.service';
import type { SessionDetail } from '../../types';
import { formatDateTime, formatDuration, formatPercent, optionLetter } from '../../utils/format';

export function SessionDetailPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<{
    faces: number | null;
    volume: number | null;
    fullscreen: boolean | null;
    at: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      setDetail(await adminSessionService.get(sessionId));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const { connected } = useAdminSocket({
    token,
    sessionId,
    onViolation: (payload) => {
      if (payload.violation.sessionId !== sessionId) return;
      setDetail((current) =>
        current
          ? {
              ...current,
              violations: [...current.violations, payload.violation],
              session: { ...current.session, violationCount: payload.violationCount },
            }
          : current
      );
    },
    onSessionSubmitted: (payload) => {
      if (payload.session.id !== sessionId) return;
      // Re-fetch so the answer review reflects the final marked state.
      void load();
    },
    onHeartbeat: (payload) => {
      if (payload.sessionId !== sessionId) return;
      setLiveTelemetry({
        faces: payload.faces,
        volume: payload.volume,
        fullscreen: payload.fullscreen,
        at: payload.at,
      });
    },
  });

  if (loading && !detail) return <PageLoader label="Loading candidate report…" />;
  if (error && !detail) return <ErrorState message={error} onRetry={refresh} />;
  if (!detail) return null;

  const { session, exam, violations, review } = detail;
  const isLive = session.status === 'IN_PROGRESS';

  return (
    <>
      <PageHeader
        title={session.candidateName}
        description={session.candidateEmail}
        breadcrumbs={[
          { label: 'Exams', to: '/exams' },
          { label: exam.title, to: `/exams/${exam.id}` },
          { label: 'Attempts', to: `/exams/${exam.id}/sessions` },
          { label: session.candidateName },
        ]}
        actions={
          <>
            <StatusBadge status={session.status} />
            {isLive ? (
              <Badge tone={connected ? 'success' : 'neutral'}>
                <span
                  className={
                    'size-1.5 rounded-full ' + (connected ? 'animate-pulse bg-emerald-500' : 'bg-ink-400')
                  }
                  aria-hidden="true"
                />
                {connected ? 'Live' : 'Offline'}
              </Badge>
            ) : null}
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              Refresh
            </Button>
          </>
        }
      />

      {isLive ? (
        <div className="mb-4">
          <InlineAlert tone="info" title="Attempt in progress">
            {liveTelemetry ? (
              <span>
                Latest proctoring signal at {formatDateTime(liveTelemetry.at)}: faces{' '}
                <strong>{liveTelemetry.faces ?? 'n/a'}</strong>, mic level{' '}
                <strong>{liveTelemetry.volume ?? 'n/a'}</strong>, fullscreen{' '}
                <strong>{liveTelemetry.fullscreen ? 'yes' : 'no'}</strong>.
              </span>
            ) : (
              <span>
                Waiting for the candidate&apos;s next proctoring heartbeat. Violations appear below the
                moment they happen.
              </span>
            )}
          </InlineAlert>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Score"
          value={session.status === 'SUBMITTED' ? `${session.score}/${session.totalMarks}` : '—'}
          hint={session.status === 'SUBMITTED' ? formatPercent(session.percentage) : 'Not submitted yet'}
          tone="brand"
        />
        <StatCard
          label="Violations"
          value={session.violationCount}
          hint={`${violations.filter((v) => v.severity === 'HIGH').length} high severity`}
          tone={session.violationCount > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Answered"
          value={`${session.answeredCount}/${exam.questionCount}`}
          hint="Questions with a selection"
          tone="neutral"
        />
        <StatCard
          label={isLive ? 'Time left' : 'Submission'}
          value={
            isLive
              ? formatDuration(session.remainingMs)
              : session.submissionReason === 'TIME_EXPIRED'
                ? 'Auto (time up)'
                : session.submissionReason === 'AUTO_SWEEP'
                  ? 'Auto (closed)'
                  : 'Manual'
          }
          hint={isLive ? 'Server enforced' : formatDateTime(session.submittedAt)}
          tone="neutral"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Attempt details" />
          <CardBody>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Candidate', session.candidateName],
                ['Email', session.candidateEmail],
                ['Exam', exam.title],
                ['Duration', `${exam.duration} min`],
                ['Start time', formatDateTime(session.startedAt)],
                ['Submission time', formatDateTime(session.submittedAt)],
                ['Last seen', formatDateTime(session.lastSeenAt)],
                ['Session id', session.id],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium text-ink-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title={`Violations (${violations.length})`}
            description="Timestamps are server-recorded."
          />
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <ViolationFeed
              items={violations}
              emptyTitle="No violations recorded"
              emptyDescription="This candidate triggered no proctoring events."
            />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Answer review"
          description="Correct answers are visible to admins only."
        />
        <ol className="divide-y divide-ink-100">
          {review.map((row) => {
            const answered = row.selectedOption !== null;
            const correct = answered && row.selectedOption === row.correctAnswer;
            return (
              <li key={row.questionId} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">
                    <span className="mr-2 text-ink-400">{row.number}.</span>
                    {row.questionText}
                  </p>
                  <Badge tone={correct ? 'success' : answered ? 'danger' : 'neutral'}>
                    {answered ? (correct ? `+${row.awarded}` : `0/${row.marks}`) : 'Unanswered'}
                  </Badge>
                </div>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {row.options.map((option, index) => {
                    const isCorrect = index === row.correctAnswer;
                    const isChosen = index === row.selectedOption;
                    return (
                      <li
                        key={index}
                        className={
                          'flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-inset ' +
                          (isCorrect
                            ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                            : isChosen
                              ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                              : 'text-ink-700')
                        }
                      >
                        <span className="font-mono text-xs text-ink-500">
                          {optionLetter(index)}.
                        </span>
                        <span className="min-w-0">{option}</span>
                        <span className="ml-auto text-xs font-semibold">
                          {isCorrect ? 'correct' : isChosen ? 'chosen' : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}
