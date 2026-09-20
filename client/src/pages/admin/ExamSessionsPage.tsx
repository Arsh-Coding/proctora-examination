import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SessionsTable } from '../../components/admin/SessionsTable';
import { ViolationFeed } from '../../components/admin/ViolationFeed';
import type { FeedItem } from '../../components/admin/ViolationFeed';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useAdminSocket } from '../../hooks/useAdminSocket';
import { examService } from '../../services/exam.service';
import type { AdminSessionRow } from '../../types';

/** Live monitoring view for one exam. */
export function ExamSessionsPage() {
  const { id: examId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [exam, setExam] = useState<{ id: string; title: string; duration: number } | null>(null);
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [liveSessions, setLiveSessions] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const data = await examService.sessions(examId);
      setExam(data.exam);
      setSessions(data.sessions);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [examId]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const { connected } = useAdminSocket({
    token,
    examId,
    onViolation: (payload) => {
      setFeed((current) => [
        { ...payload.violation, candidateName: payload.candidate.name },
        ...current.slice(0, 49),
      ]);
      setSessions((current) =>
        current.map((session) =>
          session.id === payload.candidate.sessionId
            ? { ...session, violationCount: payload.violationCount }
            : session
        )
      );
    },
    onSessionStarted: (payload) =>
      setSessions((current) =>
        current.some((session) => session.id === payload.session.id)
          ? current
          : [payload.session, ...current]
      ),
    onSessionSubmitted: (payload) =>
      setSessions((current) =>
        current.map((session) => (session.id === payload.session.id ? payload.session : session))
      ),
    onCandidateOnline: (payload) =>
      setLiveSessions((current) => new Set(current).add(payload.sessionId)),
    onCandidateOffline: (payload) =>
      setLiveSessions((current) => {
        const next = new Set(current);
        next.delete(payload.sessionId);
        return next;
      }),
  });

  if (loading && !exam) return <PageLoader label="Loading attempts…" />;
  if (error && !exam) return <ErrorState message={error} onRetry={refresh} />;

  const inProgress = sessions.filter((session) => session.status === 'IN_PROGRESS').length;

  return (
    <>
      <PageHeader
        title="Exam attempts"
        description={exam ? `${exam.title} · ${sessions.length} attempt(s), ${inProgress} in progress` : undefined}
        breadcrumbs={[
          { label: 'Exams', to: '/exams' },
          { label: exam?.title ?? 'Exam', to: `/exams/${examId}` },
          { label: 'Attempts' },
        ]}
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
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Candidates" description="Click a row to open the full report." />
          {sessions.length === 0 ? (
            <EmptyState
              title="No attempts yet"
              description="Share the exam link. Attempts appear here in real time."
            />
          ) : (
            <SessionsTable sessions={sessions} liveSessionIds={liveSessions} />
          )}
        </Card>

        <Card>
          <CardHeader title="Live violations" description="This exam only." />
          <div className="max-h-[32rem] overflow-y-auto scrollbar-thin">
            <ViolationFeed
              items={feed}
              showCandidate
              linkToSession
              emptyTitle="Waiting for events"
              emptyDescription="Violations raised during an active attempt will stream in here."
            />
          </div>
        </Card>
      </div>
    </>
  );
}
