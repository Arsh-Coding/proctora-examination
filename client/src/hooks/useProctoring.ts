import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { useLatest } from './useLatest';
import { candidateService } from '../services/session.service';
import { emitWithAck } from '../services/socket';
import type { ProctoringThresholds, Severity, ViolationType } from '../types';
import { VIOLATION_MESSAGES } from '../utils/violations';
import { useFaceDetection } from './useFaceDetection';
import type { FaceDetectionState } from './useFaceDetection';
import { useFullscreen } from './useFullscreen';
import type { FullscreenState } from './useFullscreen';
import { useNoiseDetection } from './useNoiseDetection';
import type { NoiseState } from './useNoiseDetection';
import { useTabVisibility } from './useTabVisibility';

export interface LoggedViolation {
  id: string;
  type: ViolationType;
  severity: Severity | 'PENDING';
  message: string;
  at: number;
  /** false while the report is still in flight or if it failed to persist. */
  persisted: boolean;
}

export interface ProctoringAlert {
  id: string;
  type: ViolationType;
  message: string;
  at: number;
  warningIndex: number | null;
}

export interface ProctoringState {
  face: FaceDetectionState;
  noise: NoiseState;
  fullscreen: FullscreenState;
  tabVisible: boolean;
  violations: LoggedViolation[];
  alerts: ProctoringAlert[];
  warningCount: number;
  maxWarnings: number;
  dismissAlert: (id: string) => void;
  report: (type: ViolationType, metadata?: Record<string, unknown>) => void;
  /** Live conditions for the status strip. */
  conditions: {
    faceOk: boolean;
    multipleFaces: boolean;
    loud: boolean;
    fullscreenOk: boolean;
    cameraOk: boolean;
    micOk: boolean;
  };
}

interface Options {
  sessionId: string | null;
  sessionToken: string | null;
  socket: Socket | null;
  thresholds: ProctoringThresholds;
  /** True while the exam is in progress (detectors run, violations are recorded). */
  active: boolean;
  /** True during the pre-exam system check (detectors run, nothing is recorded). */
  previewOnly?: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  videoLive: boolean;
  audioLive: boolean;
}

const ALERT_TTL_MS = 9000;
const EVALUATE_INTERVAL_MS = 500;

let alertSeq = 0;
const nextId = () => `v${Date.now().toString(36)}-${(alertSeq += 1)}`;

/**
 * Runs every proctoring signal and turns sustained/instant breaches into
 * violation records.
 *
 * Reporting path: Socket.io first (candidate -> server -> MongoDB -> admin), with
 * an automatic REST fallback if the socket is down, so nothing is lost.
 */
export function useProctoring({
  sessionId,
  sessionToken,
  socket,
  thresholds,
  active,
  previewOnly = false,
  videoRef,
  stream,
  videoLive,
  audioLive,
}: Options): ProctoringState {
  const detectorsEnabled = active || previewOnly;

  const [violations, setViolations] = useState<LoggedViolation[]>([]);
  const [alerts, setAlerts] = useState<ProctoringAlert[]>([]);
  const [warningCount, setWarningCount] = useState(0);

  const lastReportRef = useRef<Partial<Record<ViolationType, number>>>({});
  const warningCountRef = useRef(0);
  const activeRef = useLatest(active);
  const socketRef = useLatest<Socket | null>(socket);
  const credentialsRef = useLatest({ sessionId, sessionToken });

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  /** Records a violation once per cooldown window, then persists it. */
  const report = useCallback(
    (type: ViolationType, metadata: Record<string, unknown> = {}) => {
      if (!activeRef.current) return;
      const { sessionId: id, sessionToken: token } = credentialsRef.current;
      if (!id || !token) return;

      const cooldown = thresholds.violationCooldownMs?.[type] ?? 10000;
      const now = Date.now();
      if (now - (lastReportRef.current[type] ?? 0) < cooldown) return;
      lastReportRef.current[type] = now;

      const localId = nextId();
      const message = VIOLATION_MESSAGES[type] ?? type;

      const counted = thresholds.warningCountedTypes?.includes(type) ?? false;
      let warningIndex: number | null = null;
      if (counted) {
        warningCountRef.current += 1;
        warningIndex = warningCountRef.current;
        setWarningCount(warningCountRef.current);
      }

      setViolations((current) => [
        { id: localId, type, severity: 'PENDING', message, at: now, persisted: false },
        ...current,
      ]);
      setAlerts((current) => [
        ...current.slice(-3),
        { id: localId, type, message, at: now, warningIndex },
      ]);

      const timestamp = new Date(now).toISOString();
      const payload = { type, timestamp, metadata };

      void (async () => {
        const markPersisted = (severity: Severity) => {
          setViolations((current) =>
            current.map((v) => (v.id === localId ? { ...v, severity, persisted: true } : v))
          );
        };

        const socketInstance = socketRef.current;
        if (socketInstance?.connected) {
          try {
            const ack = await emitWithAck<{
              ok: boolean;
              violation?: { severity: Severity };
              error?: string;
            }>(socketInstance, 'violation:report', payload, 4000);
            if (ack?.ok && ack.violation) {
              markPersisted(ack.violation.severity);
              return;
            }
          } catch {
            /* fall through to the REST fallback */
          }
        }

        try {
          await candidateService.reportViolation(id, token, payload);
          // The REST response does not echo severity; the admin view reads the
          // authoritative value from the server anyway.
          setViolations((current) =>
            current.map((v) => (v.id === localId ? { ...v, persisted: true } : v))
          );
        } catch (error) {
          console.warn('[proctoring] failed to persist violation', type, error);
        }
      })();
    },
    [thresholds, activeRef, credentialsRef, socketRef]
  );

  /* ------------------------------- detectors ------------------------------- */

  const face = useFaceDetection({
    videoRef,
    enabled: detectorsEnabled && Boolean(stream),
    intervalMs: thresholds.faceDetectionIntervalMs,
    minConfidence: thresholds.faceMinConfidence,
  });

  const noise = useNoiseDetection(stream, detectorsEnabled);

  const onFullscreenExit = useCallback(() => {
    report('FULLSCREEN_EXIT', { at: new Date().toISOString() });
  }, [report]);

  const fullscreen = useFullscreen(active, onFullscreenExit);

  const onTabLeave = useCallback(
    (reason: 'visibility' | 'blur') => {
      report('TAB_SWITCH', { reason });
    },
    [report]
  );

  const visibility = useTabVisibility(active, onTabLeave);

  /* ------------------------ sustained-condition rules ---------------------- */

  // Mirror the detector readings so the evaluation interval can sample the newest
  // value without being torn down and recreated on every detection frame.
  const faceCountRef = useLatest(face.faceCount);
  const volumeRef = useLatest(noise.volume);

  const noFaceSinceRef = useRef<number | null>(null);
  const multiFaceSinceRef = useRef<number | null>(null);
  const loudSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      noFaceSinceRef.current = null;
      multiFaceSinceRef.current = null;
      loudSinceRef.current = null;
      return undefined;
    }

    const evaluate = () => {
      const now = Date.now();
      const faces = faceCountRef.current;

      // No face: only meaningful once the detector has produced a frame.
      if (faces === 0) {
        noFaceSinceRef.current ??= now;
        if (now - noFaceSinceRef.current >= thresholds.noFaceGraceMs) {
          report('NO_FACE', { secondsWithoutFace: Math.round((now - noFaceSinceRef.current) / 1000) });
        }
      } else {
        noFaceSinceRef.current = null;
      }

      if (faces !== null && faces > 1) {
        multiFaceSinceRef.current ??= now;
        if (now - multiFaceSinceRef.current >= thresholds.multipleFacesGraceMs) {
          report('MULTIPLE_FACES', { faceCount: faces });
        }
      } else {
        multiFaceSinceRef.current = null;
      }

      if (volumeRef.current >= thresholds.noiseVolumeThreshold) {
        loudSinceRef.current ??= now;
        if (now - loudSinceRef.current >= thresholds.noiseSustainMs) {
          report('NOISE_DETECTED', { volume: Math.round(volumeRef.current * 1000) / 1000 });
        }
      } else {
        loudSinceRef.current = null;
      }
    };

    const timer = window.setInterval(evaluate, EVALUATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, report, thresholds, faceCountRef, volumeRef]);

  /* ----------------------- device availability rules ---------------------- */

  useEffect(() => {
    if (!active || videoLive) return;
    report('NO_CAMERA', { reason: 'video track is not live' });
  }, [active, videoLive, report]);

  useEffect(() => {
    if (!active || audioLive) return;
    report('NO_MICROPHONE', { reason: 'audio track is not live' });
  }, [active, audioLive, report]);

  /* -------------------------- telemetry heartbeat ------------------------- */

  useEffect(() => {
    if (!active || !socket) return undefined;

    const send = () => {
      socket.emit('candidate:heartbeat', {
        faces: faceCountRef.current,
        volume: Math.round(volumeRef.current * 1000) / 1000,
        fullscreen: Boolean(document.fullscreenElement),
      });
    };

    const timer = window.setInterval(send, thresholds.heartbeatMs);
    // First beat on the next tick so the effect body stays side-effect free.
    const initial = window.setTimeout(send, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, [active, socket, thresholds.heartbeatMs, faceCountRef, volumeRef]);

  /* --------------------------- alert expiry timer -------------------------- */

  useEffect(() => {
    if (alerts.length === 0) return undefined;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - ALERT_TTL_MS;
      setAlerts((current) => current.filter((alert) => alert.at > cutoff));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [alerts.length]);

  const conditions = useMemo(
    () => ({
      faceOk: face.faceCount === null ? true : face.faceCount >= 1,
      multipleFaces: (face.faceCount ?? 0) > 1,
      loud: noise.volume >= thresholds.noiseVolumeThreshold,
      fullscreenOk: fullscreen.isFullscreen,
      cameraOk: videoLive,
      micOk: audioLive,
    }),
    [face.faceCount, noise.volume, thresholds.noiseVolumeThreshold, fullscreen.isFullscreen, videoLive, audioLive]
  );

  return {
    face,
    noise,
    fullscreen,
    tabVisible: visibility.visible,
    violations,
    alerts,
    warningCount,
    maxWarnings: thresholds.maxWarnings,
    dismissAlert,
    report,
    conditions,
  };
}
