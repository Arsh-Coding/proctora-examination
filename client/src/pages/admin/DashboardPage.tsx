import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { SessionsTable } from '../../components/admin/SessionsTable';
import { StatCard } from '../../components/admin/StatCard';
import { ViolationFeed } from '../../components/admin/ViolationFeed';
import type { FeedItem } from '../../components/admin/ViolationFeed';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAdminSocket } from '../../hooks/useAdminSocket';
import { examService } from '../../services/exam.service';
import type { DashboardStats } from '../../types';
import { formatPercent } from '../../utils/format';
import { violationLabel } from '../../utils/violations';

export function DashboardPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [liveSessions, setLiveSessions] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await examService.dashboard();
      setStats(data);
      setFeed(data.recentViolations);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Live updates: no refresh needed. */
  const { connected } = useAdminSocket({
    token,
    onViolation: (payload) => {
      setFeed((current) => [
        { ...payload.violation, candidateName: payload.candidate.name, examTitle: payload.candidate.examTitle },
        ...current.slice(0, 24),
      ]);
      setStats((current) =>
        current
          ? {
              ...current,
              totals: { ...current.totals, violations: current.totals.violations + 1 },
              recentSessions: current.recentSessions.map((session) =>
                session.id === payload.candidate.sessionId
                  ? { ...session, violationCount: payload.violationCount }
                  : session
              ),
            }
          : current
      );
    },
    onSessionStarted: (payload) => {
      toast.info('Candidate started an exam', `${payload.session.candidateName} · ${payload.session.examTitle ?? ''}`);
      setStats((current) =>
        current
          ? {
              ...current,
              totals: {
                ...current.totals,
                attempts: current.totals.attempts + 1,
                inProgressAttempts: current.totals.inProgressAttempts + 1,
              },
              recentSessions: [payload.session, ...current.recentSessions].slice(0, 10),
            }
          : current
      );
    },
    onSessionSubmitted: (payload) => {
      toast.success('Exam submitted', `${payload.session.candidateName} scored ${payload.session.score}/${payload.session.totalMarks}`);
      // Recompute averages server-side rather than guessing locally.
      void load();
    },
    onCandidateOnline: (payload) =>
      setLiveSessions((current) => new Set(current).add(payload.sessionId)),
    onCandidateOffline: (payload) =>
      setLiveSessions((current) => {
        const next = new Set(current);
        next.delete(payload.sessionId);
        return next;
      }),
  });

  if (loading && !stats) return <PageLoader label="Loading dashboard…" />;
  if (error && !stats) return <ErrorState message={error} onRetry={refresh} />;
  if (!stats) return null;

  const { totals, violationsByType, recentSessions } = stats;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live view of your exams, attempts and proctoring events."
        actions={
          <>
            <Badge tone={connected ? 'success' : 'neutral'}>
              <span
                className={
                  'size-1.5 rounded-full ' + (connected ? 'animate-pulse bg-emerald-500' : 'bg-ink-400')
                }
                aria-hidden="true"
              />
              {connected ? 'Live' : 'Offline'}
            </Badge>
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              Refresh
            </Button>
            <Link to="/exams/create">
              <Button>Create exam</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total exams" value={totals.exams} hint={`${totals.activeExams} active`} tone="brand" />
        <StatCard label="Active exams" value={totals.activeExams} hint="Accepting candidates" tone="success" />
        <StatCard label="Candidates" value={totals.candidates} hint="Unique email addresses" tone="neutral" />
        <StatCard
          label="Completed attempts"
          value={totals.completedAttempts}
          hint={`${totals.inProgressAttempts} in progress`}
          tone="success"
        />
        <StatCard
          label="Average score"
          value={formatPercent(totals.averageScore)}
          hint="Across submitted attempts"
          tone="brand"
        />
        <StatCard
          label="Violations"
          value={totals.violations}
          hint="All recorded proctoring events"
          tone={totals.violations > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent attempts"
            description="Newest exam sessions across all your exams."
            action={
              <Link to="/sessions">
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </Link>
            }
          />
          {recentSessions.length === 0 ? (
            <EmptyState
              title="No attempts yet"
              description="Share an exam link with a candidate to see attempts appear here."
              action={
                <Link to="/exams">
                  <Button size="sm">Go to exams</Button>
                </Link>
              }
            />
          ) : (
            <SessionsTable sessions={recentSessions} showExam liveSessionIds={liveSessions} />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Live violation feed" description="Streams in over Socket.io." />
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <ViolationFeed items={feed} showCandidate linkToSession />
            </div>
          </Card>

          <Card>
            <CardHeader title="Violations by type" />
            {violationsByType.length === 0 ? (
              <EmptyState title="Nothing recorded yet" />
            ) : (
              <ul className="divide-y divide-ink-100">
                {violationsByType.map((row) => (
                  <li key={row.type} className="flex items-center justify-between px-5 py-2.5">
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-ink-500">{row.type}</span>
                      <span className="block text-sm text-ink-700">{violationLabel(row.type)}</span>
                    </span>
                    <span className="text-sm font-bold text-ink-900">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
