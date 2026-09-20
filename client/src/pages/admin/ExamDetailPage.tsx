import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CopyLinkButton } from '../../components/admin/CopyLinkButton';
import { StatCard } from '../../components/admin/StatCard';
import { PageHeader } from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState, InlineAlert } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { examService } from '../../services/exam.service';
import type { ExamDetail } from '../../types';
import { examLinkFor } from '../../utils/examLink';
import { formatDateTime, formatMinutes, optionLetter } from '../../utils/format';

export function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setExam(await examService.get(id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async () => {
    if (!exam) return;
    try {
      const updated = await examService.update(exam.id, { isActive: !exam.isActive });
      setExam({ ...exam, isActive: updated.isActive });
      toast.success(updated.isActive ? 'Exam opened' : 'Exam closed');
    } catch (err) {
      toast.error('Could not update the exam', (err as Error).message);
    }
  };

  if (loading && !exam) return <PageLoader label="Loading exam…" />;
  if (error && !exam) return <ErrorState message={error} onRetry={refresh} />;
  if (!exam) return null;

  const link = examLinkFor(exam.id);

  return (
    <>
      <PageHeader
        title={exam.title}
        description={exam.description || 'No description provided.'}
        breadcrumbs={[{ label: 'Exams', to: '/exams' }, { label: exam.title }]}
        actions={
          <>
            <Badge tone={exam.isActive ? 'success' : 'neutral'}>
              {exam.isActive ? 'Active' : 'Closed'}
            </Badge>
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              Refresh
            </Button>
            <Button variant="secondary" onClick={toggleActive}>
              {exam.isActive ? 'Close exam' : 'Open exam'}
            </Button>
            <Link to={`/exams/${exam.id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
            <Button onClick={() => navigate(`/exams/${exam.id}/sessions`)}>View attempts</Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="Candidate exam link"
          description="Share this URL. Candidates do not need an account."
          action={<CopyLinkButton examId={exam.id} />}
        />
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-ink-100 px-3 py-2 font-mono text-xs text-ink-800">
              {link}
            </code>
            <a href={link} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm">
                Open in new tab
              </Button>
            </a>
          </div>
          {!exam.isActive ? (
            <div className="mt-3">
              <InlineAlert tone="warning" title="This exam is closed">
                Candidates opening the link will be told the exam is not accepting attempts. Use
                “Open exam” to accept attempts again.
              </InlineAlert>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Questions" value={exam.questionCount} tone="brand" />
        <StatCard label="Total marks" value={exam.totalMarks} tone="brand" />
        <StatCard label="Duration" value={formatMinutes(exam.duration)} tone="neutral" />
        <StatCard label="Attempts" value={exam.sessionCount} hint={`${exam.submittedCount} submitted`} tone="success" />
        <StatCard
          label="Violations"
          value={exam.violationCount}
          tone={exam.violationCount > 0 ? 'danger' : 'neutral'}
        />
        <StatCard label="Created" value={formatDateTime(exam.createdAt)} tone="neutral" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title={`Questions (${exam.questions.length})`}
          description="Correct answers are visible to you only. They are never sent to candidates."
          action={
            <Button variant="secondary" size="sm" onClick={() => setShowAnswers((v) => !v)}>
              {showAnswers ? 'Hide answers' : 'Show answers'}
            </Button>
          }
        />
        <ol className="divide-y divide-ink-100">
          {exam.questions.map((question, index) => (
            <li key={question.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-ink-900">
                  <span className="mr-2 text-ink-400">{index + 1}.</span>
                  {question.questionText}
                </p>
                <Badge tone="neutral">{question.marks} mark{question.marks === 1 ? '' : 's'}</Badge>
              </div>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = showAnswers && optionIndex === question.correctAnswer;
                  return (
                    <li
                      key={optionIndex}
                      className={
                        'flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ' +
                        (isCorrect
                          ? 'bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-200 ring-inset'
                          : 'text-ink-700')
                      }
                    >
                      <span className="font-mono text-xs text-ink-500">
                        {optionLetter(optionIndex)}.
                      </span>
                      <span className="min-w-0">{option}</span>
                      {isCorrect ? <span className="ml-auto text-xs font-bold">correct</span> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
