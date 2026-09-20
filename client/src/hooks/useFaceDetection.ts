import { useCallback, useEffect, useRef, useState } from 'react';

export type FaceDetectorStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface FaceBox {
  /** Normalised 0..1 coordinates so the overlay scales with the preview. */
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export interface FaceDetectionState {
  status: FaceDetectorStatus;
  error: string | null;
  /** Number of faces in the most recent frame, or null before the first frame. */
  faceCount: number | null;
  boxes: FaceBox[];
  /** Frames analysed since the detector started - proves detection is live. */
  frames: number;
  lastDetectionAt: number | null;
  /** Warms up the model. Safe to call more than once. */
  load: () => Promise<boolean>;
}

interface Options {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  intervalMs: number;
  minConfidence: number;
}

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/models/blaze_face_short_range.tflite';

interface MpDetector {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number
  ) => {
    detections: Array<{
      categories: Array<{ score: number }>;
      boundingBox?: { originX: number; originY: number; width: number; height: number };
    }>;
  };
}

/** Module-level singleton: loading the wasm runtime twice wastes ~10 MB. */
let detectorPromise: Promise<MpDetector> | null = null;

async function loadDetector(minConfidence: number): Promise<MpDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
      const detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: 'VIDEO',
        minDetectionConfidence: minConfidence,
      });
      return detector as unknown as MpDetector;
    })().catch((error) => {
      // Reset so a later retry can attempt the load again.
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

/**
 * On-device face detection with MediaPipe BlazeFace.
 *
 * The model and wasm runtime are served from `client/public` (populated by
 * `scripts/setup-face-model.mjs`), so detection runs entirely in the browser with
 * no external or paid API. If the assets are missing the hook reports
 * `unavailable` instead of silently pretending to work.
 */
export function useFaceDetection({
  videoRef,
  enabled,
  intervalMs,
  minConfidence,
}: Options): FaceDetectionState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState<number | null>(null);
  const [boxes, setBoxes] = useState<FaceBox[]>([]);
  const [frames, setFrames] = useState(0);
  const [lastDetectionAt, setLastDetectionAt] = useState<number | null>(null);

  const detectorRef = useRef<MpDetector | null>(null);
  const lastTimestampRef = useRef(-1);
  const loadingRef = useRef(false);

  // Derived, so no "loading" state has to be written from an effect.
  const status: FaceDetectorStatus = ready
    ? 'ready'
    : error
      ? 'unavailable'
      : enabled
        ? 'loading'
        : 'idle';

  const load = useCallback(async () => {
    if (detectorRef.current) return true;
    if (loadingRef.current) return false;
    loadingRef.current = true;
    try {
      detectorRef.current = await loadDetector(minConfidence);
      setError(null);
      setReady(true);
      return true;
    } catch (err) {
      setError(
        (err as Error)?.message ??
          'Face detection model could not be loaded. Run "npm run setup:models" in client/.'
      );
      return false;
    } finally {
      loadingRef.current = false;
    }
  }, [minConfidence]);

  useEffect(() => {
    if (!enabled || ready || error) return;
    void load();
  }, [enabled, ready, error, load]);

  useEffect(() => {
    if (!enabled || !ready) return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector) return;
      // readyState >= 2 means there is current frame data to analyse.
      if (video.readyState < 2 || video.videoWidth === 0) return;

      // MediaPipe requires a strictly increasing timestamp in VIDEO mode.
      let timestamp = Math.round(performance.now());
      if (timestamp <= lastTimestampRef.current) timestamp = lastTimestampRef.current + 1;
      lastTimestampRef.current = timestamp;

      try {
        const result = detector.detectForVideo(video, timestamp);
        const detections = (result?.detections ?? []).filter(
          (d) => (d.categories?.[0]?.score ?? 0) >= minConfidence
        );

        setFaceCount(detections.length);
        setBoxes(
          detections.map((d) => ({
            x: (d.boundingBox?.originX ?? 0) / video.videoWidth,
            y: (d.boundingBox?.originY ?? 0) / video.videoHeight,
            width: (d.boundingBox?.width ?? 0) / video.videoWidth,
            height: (d.boundingBox?.height ?? 0) / video.videoHeight,
            score: d.categories?.[0]?.score ?? 0,
          }))
        );
        setFrames((n) => n + 1);
        setLastDetectionAt(Date.now());
      } catch (err) {
        // A transient frame error should not kill the detection loop.
        console.warn('[proctoring] face detection frame failed', err);
      }
    };

    const timer = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, ready, intervalMs, minConfidence, videoRef]);

  return { status, error, faceCount, boxes, frames, lastDetectionAt, load };
}
