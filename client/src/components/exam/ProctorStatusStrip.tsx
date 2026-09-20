import type { ProctoringState } from '../../hooks/useProctoring';
import { cn } from '../../utils/cn';

interface Chip {
  label: string;
  ok: boolean;
  detail?: string;
}

/** Compact live status of every proctoring signal, shown inside the exam shell. */
export function ProctorStatusStrip({
  proctoring,
  tabVisible,
  socketConnected,
}: {
  proctoring: ProctoringState;
  tabVisible: boolean;
  socketConnected: boolean;
}) {
  const { conditions, face, noise } = proctoring;

  const chips: Chip[] = [
    { label: 'Camera', ok: conditions.cameraOk },
    { label: 'Microphone', ok: conditions.micOk },
    {
      label: 'Face',
      ok: face.status === 'ready' && conditions.faceOk && !conditions.multipleFaces,
      detail:
        face.status !== 'ready'
          ? face.status === 'unavailable'
            ? 'unavailable'
            : 'loading'
          : face.faceCount === null
            ? '…'
            : `${face.faceCount}`,
    },
    { label: 'Audio', ok: !conditions.loud, detail: noise.active ? undefined : 'off' },
    { label: 'Fullscreen', ok: conditions.fullscreenOk },
    { label: 'Focus', ok: tabVisible },
    { label: 'Link', ok: socketConnected, detail: socketConnected ? 'live' : 'retrying' },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
            chip.ok
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-rose-50 text-rose-700 ring-rose-200'
          )}
        >
          <span
            aria-hidden="true"
            className={cn('size-1.5 rounded-full', chip.ok ? 'bg-emerald-500' : 'bg-rose-500')}
          />
          {chip.label}
          {chip.detail ? <span className="font-normal opacity-70">{chip.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}
