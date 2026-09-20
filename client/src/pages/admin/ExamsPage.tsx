import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CopyLinkButton } from '../../components/admin/CopyLinkButton';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { Table, Td, Th, Tr } from '../../components/ui/Table';
import { useToast } from '../../context/ToastContext';
import { examService } from '../../services/exam.service';
import type { ExamSummary } from '../../types';
import { formatDateTime, formatMinutes } from '../../utils/format';

export function ExamsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExamSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setExams(await examService.list());
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

  const toggleActive = async (exam: ExamSummary) => {
    try {
      const updated = await examService.update(exam.id, { isActive: !exam.isActive });
      setExams((current) =>
        current.map((item) => (item.id === exam.id ? { ...item, isActive: updated.isActive } : item))
      );
      toast.success(updated.isActive ? 'Exam opened' : 'Exam closed', updated.title);
    } catch (err) {
      toast.error('Could not update the exam', (err as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await examService.remove(pendingDelete.id);
      setExams((current) => current.filter((item) => item.id !== pendingDelete.id));
      toast.success('Exam deleted', `${pendingDelete.title} and its attempts were removed.`);
      setPendingDelete(null);
    } catch (err) {
      toast.error('Could not delete the exam', (err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading && exams.length === 0) return <PageLoader label="Loading exams…" />;
  if (error && exams.length === 0) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <>
      <PageHeader
        title="Exams"
        description="Create an exam, then share its link with candidates."
        actions={
          <>
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              Refresh
            </Button>
            <Link to="/exams/create">
              <Button>Create exam</Button>
            </Link>
          </>
        }
      />

      <Card>
        {exams.length === 0 ? (
          <EmptyState
            title="No exams yet"
            description="Create your first exam to generate a candidate link."
            action={
              <Link to="/exams/create">
                <Button size="sm">Create exam</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Exam</Th>
                <Th>Duration</Th>
                <Th align="center">Questions</Th>
                <Th align="center">Marks</Th>
                <Th align="center">Attempts</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <Tr key={exam.id}>
                  <Td>
                    <button
                      type="button"
                      onClick={() => navigate(`/exams/${exam.id}`)}
                      className="text-left"
                    >
                      <span className="block font-semibold text-ink-900 hover:text-brand-700">
                        {exam.title}
                      </span>
                      <span className="block text-xs text-ink-500">
                        Created {formatDateTime(exam.createdAt)}
                      </span>
                    </button>
                  </Td>
                  <Td className="whitespace-nowrap">{formatMinutes(exam.duration)}</Td>
                  <Td align="center">{exam.questionCount}</Td>
                  <Td align="center">{exam.totalMarks}</Td>
                  <Td align="center">
                    <span className="font-semibold text-ink-900">{exam.sessionCount}</span>
                    <span className="text-xs text-ink-500"> ({exam.submittedCount} done)</span>
                  </Td>
                  <Td>
                    <Badge tone={exam.isActive ? 'success' : 'neutral'}>
                      {exam.isActive ? 'Active' : 'Closed'}
                    </Badge>
                  </Td>
                  <Td align="right">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <CopyLinkButton examId={exam.id} size="sm" label="Copy link" />
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/exams/${exam.id}/sessions`)}>
                        Attempts
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(exam)}>
                        {exam.isActive ? 'Close' : 'Open'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50"
                        onClick={() => setPendingDelete(exam)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(pendingDelete)}
        title="Delete this exam?"
        description={
          <>
            <strong>{pendingDelete?.title}</strong> will be removed along with{' '}
            {pendingDelete?.sessionCount ?? 0} attempt(s) and their violation records. This cannot be
            undone.
          </>
        }
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              Delete exam
            </Button>
          </>
        }
      />
    </>
  );
}
