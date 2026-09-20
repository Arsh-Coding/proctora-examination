import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QuestionBuilder } from '../../components/admin/QuestionBuilder';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Input, Textarea } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { InlineAlert } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { ApiRequestError } from '../../services/api';
import { examService } from '../../services/exam.service';
import type { QuestionDraft } from '../../types';
import { emptyQuestion } from '../../utils/questions';

/** Handles both `/exams/create` and editing an existing exam. */
export function CreateExamPage({ mode = 'create' }: { mode?: 'create' | 'edit' }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { id: examId } = useParams<{ id: string }>();
  const isEdit = mode === 'edit';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionErrors, setQuestionErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isEdit || !examId) return;
    let cancelled = false;
    // `loading` already starts true in edit mode, so nothing is set here.
    examService
      .get(examId)
      .then((exam) => {
        if (cancelled) return;
        setTitle(exam.title);
        setDescription(exam.description);
        setDuration(exam.duration);
        setQuestions(
          exam.questions.map((question) => ({
            questionText: question.questionText,
            options: [...question.options],
            correctAnswer: question.correctAnswer,
            marks: question.marks,
          }))
        );
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isEdit, examId]);

  const totalMarks = useMemo(
    () => questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0),
    [questions]
  );

  const validate = (): boolean => {
    const errors: Record<number, string> = {};

    questions.forEach((question, index) => {
      if (question.questionText.trim().length < 3) {
        errors[index] = 'Question text is required (at least 3 characters).';
        return;
      }
      if (question.options.some((option) => option.trim().length === 0)) {
        errors[index] = 'Every option needs text.';
        return;
      }
      if (question.correctAnswer < 0 || question.correctAnswer >= question.options.length) {
        errors[index] = 'Select the correct answer.';
        return;
      }
      if (!Number.isFinite(question.marks) || question.marks < 1) {
        errors[index] = 'Marks must be at least 1.';
      }
    });

    setQuestionErrors(errors);

    if (title.trim().length < 3) {
      setError('Exam title must be at least 3 characters.');
      return false;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      setError('Duration must be at least 1 minute.');
      return false;
    }
    if (questions.length === 0) {
      setError('Add at least one question.');
      return false;
    }
    if (Object.keys(errors).length > 0) {
      setError('Fix the highlighted questions before saving.');
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        duration: Number(duration),
        isActive: true,
        questions: questions.map((question) => ({
          questionText: question.questionText.trim(),
          options: question.options.map((option) => option.trim()),
          correctAnswer: question.correctAnswer,
          marks: Number(question.marks),
        })),
      };

      const exam =
        isEdit && examId
          ? await examService.update(examId, payload)
          : await examService.create(payload);

      toast.success(isEdit ? 'Exam updated' : 'Exam created', `${exam.title} · ${exam.totalMarks} marks`);
      navigate(`/exams/${exam.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(
          err.fieldErrors.length > 0
            ? `${err.message}: ${err.fieldErrors.map((d) => `${d.field} ${d.message}`).join('; ')}`
            : err.message
        );
      } else {
        setError((err as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading exam…" />;

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title={isEdit ? 'Edit exam' : 'Create exam'}
        description="Multiple-choice questions with one correct option each."
        breadcrumbs={[{ label: 'Exams', to: '/exams' }, { label: isEdit ? 'Edit' : 'Create' }]}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/exams')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? 'Save changes' : 'Create exam'}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="mb-4">
          <InlineAlert tone="danger" title="Cannot save yet">
            {error}
          </InlineAlert>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Exam details" />
          <CardBody className="space-y-4">
            <Input
              label="Exam title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="JavaScript Fundamentals"
            />
            <Textarea
              label="Description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this exam covers, instructions for candidates…"
            />
            <Input
              label="Duration (minutes)"
              type="number"
              min={1}
              max={600}
              required
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              hint="The countdown is enforced by the server, not the browser."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Summary" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-ink-600">Questions</dt>
                <dd className="font-bold text-ink-900">{questions.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-600">Total marks</dt>
                <dd className="font-bold text-ink-900">{totalMarks}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-600">Duration</dt>
                <dd className="font-bold text-ink-900">{duration || 0} min</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-ink-500">
              After saving you will get a shareable exam link. Candidates do not need an account.
            </p>
          </CardBody>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-bold tracking-wide text-ink-500 uppercase">
        Questions
      </h2>
      <QuestionBuilder questions={questions} onChange={setQuestions} errors={questionErrors} />

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/exams')}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {isEdit ? 'Save changes' : 'Create exam'}
        </Button>
      </div>
    </form>
  );
}
