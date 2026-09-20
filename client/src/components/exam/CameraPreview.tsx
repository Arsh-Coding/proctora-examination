import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { FaceBox } from '../../hooks/useFaceDetection';
import { cn } from '../../utils/cn';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  boxes?: FaceBox[];
  faceCount?: number | null;
  detectorReady?: boolean;
  className?: string;
  compact?: boolean;
}

/**
 * Candidate camera preview with the live face-detection overlay.
 * The overlay is drawn from real detector output, so the candidate can see that
 * proctoring is actually running.
 */
export function CameraPreview({
  videoRef,
  stream,
  boxes = [],
  faceCount = null,
  detectorReady = false,
  className,
  compact = false,
}: Props) {
  // Attach the stream imperatively: `srcObject` cannot be set as a JSX prop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    if (stream) {
      video.play().catch(() => undefined);
    }
  }, [stream, videoRef]);

  const status =
    !stream
      ? { label: 'Camera off', tone: 'bg-ink-700' }
      : !detectorReady
        ? { label: 'Starting detector…', tone: 'bg-amber-600' }
        : faceCount === null
          ? { label: 'Analysing…', tone: 'bg-amber-600' }
          : faceCount === 0
            ? { label: 'No face', tone: 'bg-rose-600' }
            : faceCount > 1
              ? { label: `${faceCount} faces`, tone: 'bg-rose-600' }
              : { label: 'Face OK', tone: 'bg-emerald-600' };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-ink-900 ring-1 ring-ink-800',
        compact ? 'aspect-[4/3]' : 'aspect-video',
        className
      )}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-label="Your camera preview"
        className="size-full scale-x-[-1] object-cover"
      />

      {/* Face boxes, mirrored to match the flipped preview. */}
      <div className="pointer-events-none absolute inset-0 scale-x-[-1]">
        {boxes.map((box, index) => (
          <span
            key={index}
            className="absolute rounded-md border-2 border-emerald-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />
        ))}
      </div>

      {!stream ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-400">
          <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
            <path
              d="M15 10l6-4v12l-6-4M3 6h12v12H3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <p className="text-xs font-medium">Camera not started</p>
        </div>
      ) : null}

      <span
        className={cn(
          'absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold text-white',
          status.tone
        )}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-white/90" aria-hidden="true" />
        {status.label}
      </span>
    </div>
  );
}
