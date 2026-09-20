import { useCallback, useEffect, useMemo, useState } from 'react';
import { SessionsTable } from '../../components/admin/SessionsTable';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useAdminSocket } from '../../hooks/useAdminSocket';
import { adminSessionService } from '../../services/session.service';
import type { AdminSessionRow, SessionStatus } from '../../types';

export function AllSessionsPage() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SessionStatus | 'ALL'>('ALL');
  const [liveSessions, setLiveSessions] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setSessions(await adminSessionService.list());
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

  const { connected } = useAdminSocket({
    token,
    onViolation: (payload) =>
      setSessions((current) =>
        current.map((session) =>
          session.id === payload.candidate.sessionId
            ? { ...session, violationCount: payload.violationCount }
            : session
        )
      ),
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (status !== 'ALL' && session.status !== status) return false;
      if (!term) return true;
      return (
        session.candidateName.toLowerCase().includes(term) ||
        session.candidateEmail.toLowerCase().includes(term) ||
        (session.examTitle ?? '').toLowerCase().includes(term)
      );
    });
  }, [sessions, search, status]);

  if (loading && sessions.length === 0) return <PageLoader label="Loading attempts…" />;
  if (error && sessions.length === 0) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <>
      <PageHeader
        title="All attempts"
        description="Every candidate attempt across your exams."
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

      <Card>
        <CardHeader
          title={`${filtered.length} attempt${filtered.length === 1 ? '' : 's'}`}
          action={
            <div className="flex flex-wrap items-end gap-2">
              <Input
                placeholder="Search name, email or exam"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
                aria-label="Search attempts"
              />
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as SessionStatus | 'ALL')}
                aria-label="Filter by status"
                className="w-40"
              >
                <option value="ALL">All statuses</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="NOT_STARTED">Not started</option>
              </Select>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="No attempts match"
            description={
              sessions.length === 0
                ? 'Share an exam link to start collecting attempts.'
                : 'Try clearing the search or status filter.'
            }
          />
        ) : (
          <SessionsTable sessions={filtered} showExam liveSessionIds={liveSessions} />
        )}
      </Card>
    </>
  );
}
