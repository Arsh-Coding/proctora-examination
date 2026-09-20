import { cn } from '../../utils/cn';

export function QuestionNavigator({
  total,
  currentIndex,
  answeredIds,
  questionIds,
  onJump,
}: {
  total: number;
  currentIndex: number;
  answeredIds: Set<string>;
  questionIds: string[];
  onJump: (index: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-ink-500">
        <span className="font-semibold tracking-wide uppercase">Questions</span>
        <span>
          {answeredIds.size}/{total} answered
        </span>
      </div>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-6">
        {questionIds.map((id, index) => {
          const answered = answeredIds.has(id);
          const current = index === currentIndex;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onJump(index)}
              aria-current={current ? 'true' : undefined}
              aria-label={`Question ${index + 1}${answered ? ', answered' : ', not answered'}`}
              className={cn(
                'h-8 rounded-md text-xs font-bold transition',
                current
                  ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                  : answered
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded bg-brand-600" aria-hidden="true" /> Current
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded bg-emerald-200" aria-hidden="true" /> Answered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded bg-ink-200" aria-hidden="true" /> Unanswered
        </span>
      </div>
    </div>
  );
}
