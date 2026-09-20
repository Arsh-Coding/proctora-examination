import type { QuestionDraft } from '../../types';
import { optionLetter } from '../../utils/format';
import { emptyQuestion } from '../../utils/questions';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Field';

interface Props {
  questions: QuestionDraft[];
  onChange: (questions: QuestionDraft[]) => void;
  errors?: Record<number, string>;
}

export function QuestionBuilder({ questions, onChange, errors }: Props) {
  const update = (index: number, patch: Partial<QuestionDraft>) => {
    onChange(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));
  };

  const updateOption = (index: number, optionIndex: number, value: string) => {
    onChange(
      questions.map((question, i) =>
        i === index
          ? { ...question, options: question.options.map((o, oi) => (oi === optionIndex ? value : o)) }
          : question
      )
    );
  };

  const remove = (index: number) => {
    onChange(questions.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <fieldset
          key={index}
          className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm shadow-ink-900/[0.03]"
        >
          <legend className="sr-only">Question {index + 1}</legend>

          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-ink-900">
              <span className="flex size-6 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-700">
                {index + 1}
              </span>
              Question {index + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move question ${index + 1} up`}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => move(index, 1)}
                disabled={index === questions.length - 1}
                aria-label={`Move question ${index + 1} down`}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:bg-rose-50"
                onClick={() => remove(index)}
                disabled={questions.length === 1}
                aria-label={`Remove question ${index + 1}`}
              >
                Remove
              </Button>
            </div>
          </div>

          <Textarea
            label="Question"
            required
            rows={2}
            value={question.questionText}
            onChange={(e) => update(index, { questionText: e.target.value })}
            placeholder="What is Node.js?"
          />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {question.options.map((option, optionIndex) => (
              <Input
                key={optionIndex}
                label={`Option ${optionLetter(optionIndex)}`}
                required
                value={option}
                onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                placeholder={`Option ${optionLetter(optionIndex)}`}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-ink-700">
                Correct answer<span className="ml-0.5 text-rose-500">*</span>
              </span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={`Correct answer for question ${index + 1}`}>
                {question.options.map((_, optionIndex) => {
                  const selected = question.correctAnswer === optionIndex;
                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => update(index, { correctAnswer: optionIndex })}
                      className={
                        'size-9 rounded-lg border text-sm font-bold transition ' +
                        (selected
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-300 bg-white text-ink-600 hover:border-brand-400 hover:text-brand-700')
                      }
                    >
                      {optionLetter(optionIndex)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-24">
              <Input
                label="Marks"
                type="number"
                min={1}
                max={100}
                required
                value={question.marks}
                onChange={(e) => update(index, { marks: Number(e.target.value) })}
              />
            </div>
          </div>

          {errors?.[index] ? (
            <p role="alert" className="mt-3 text-xs font-medium text-rose-600">
              {errors[index]}
            </p>
          ) : null}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-ink-300 bg-white/60 px-4 py-3">
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{questions.length}</span> question
          {questions.length === 1 ? '' : 's'} ·{' '}
          <span className="font-semibold text-ink-900">{totalMarks}</span> total marks
        </p>
        <Button variant="secondary" onClick={() => onChange([...questions, emptyQuestion()])}>
          + Add question
        </Button>
      </div>
    </div>
  );
}
