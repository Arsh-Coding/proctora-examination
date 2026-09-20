import { useCallback, useEffect, useRef, useState } from 'react';

export type MediaStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

export interface MediaState {
  stream: MediaStream | null;
  status: MediaStatus;
  error: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Flips to false if a track ends mid-exam (unplugged webcam, revoked access). */
  videoLive: boolean;
  audioLive: boolean;
  request: () => Promise<MediaStream | null>;
  stop: () => void;
}

function describeError(error: unknown): string {
  const err = error as DOMException;
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permission denied. Allow camera and microphone access in your browser, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera or microphone was found. Connect a device and try again.';
    case 'NotReadableError':
      return 'Your camera or microphone is already in use by another application. Close it and try again.';
    case 'AbortError':
      return 'Device access was interrupted. Please try again.';
    default:
      return err?.message || 'Unable to access camera and microphone.';
  }
}

/**
 * Owns the candidate's camera + microphone stream for the whole attempt.
 * Acquisition is triggered by an explicit user action so the browser permission
 * prompt is always tied to a gesture.
 */
export function useMediaStream(): MediaState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [videoLive, setVideoLive] = useState(false);
  const [audioLive, setAudioLive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setVideoLive(false);
    setAudioLive(false);
    setStatus('idle');
  }, []);

  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('This browser does not support camera access (getUserMedia is unavailable).');
      return null;
    }

    setStatus('requesting');
    setError(null);

    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = acquired;
      setStream(acquired);
      setVideoLive(acquired.getVideoTracks().some((t) => t.readyState === 'live'));
      setAudioLive(acquired.getAudioTracks().some((t) => t.readyState === 'live'));
      setStatus('granted');
      return acquired;
    } catch (err) {
      const name = (err as DOMException)?.name;
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      setError(describeError(err));
      return null;
    }
  }, []);

  /** Watch for tracks dying so the proctor can raise NO_CAMERA / NO_MICROPHONE. */
  useEffect(() => {
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    const sync = () => {
      setVideoLive(videoTracks.some((t) => t.readyState === 'live' && t.enabled));
      setAudioLive(audioTracks.some((t) => t.readyState === 'live' && t.enabled));
    };

    const all = [...videoTracks, ...audioTracks];
    all.forEach((track) => {
      track.addEventListener('ended', sync);
      track.addEventListener('mute', sync);
      track.addEventListener('unmute', sync);
    });
    sync();

    return () => {
      all.forEach((track) => {
        track.removeEventListener('ended', sync);
        track.removeEventListener('mute', sync);
        track.removeEventListener('unmute', sync);
      });
    };
  }, [stream]);

  // Release devices when the component tree using the hook goes away.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    []
  );

  return {
    stream,
    status,
    error,
    hasVideo: (stream?.getVideoTracks().length ?? 0) > 0,
    hasAudio: (stream?.getAudioTracks().length ?? 0) > 0,
    videoLive,
    audioLive,
    request,
    stop,
  };
}
