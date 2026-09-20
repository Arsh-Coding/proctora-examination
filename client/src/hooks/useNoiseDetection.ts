import { useEffect, useState } from 'react';

export interface NoiseState {
  /** Normalised RMS volume, roughly 0..1, published at `UI_UPDATE_MS`. */
  volume: number;
  /** Rolling peak, useful for the level meter. */
  peak: number;
  supported: boolean;
  active: boolean;
  error: string | null;
}

/** The analyser samples every frame; React state updates at this rate instead. */
const UI_UPDATE_MS = 100;

/**
 * Basic microphone level monitoring with the Web Audio API.
 *
 * This measures loudness only. It does not identify speech, words or speakers -
 * that is deliberately out of scope for the MVP.
 */
export function useNoiseDetection(stream: MediaStream | null, enabled: boolean): NoiseState {
  const [volume, setVolume] = useState(0);
  const [peak, setPeak] = useState(0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== 'undefined' && 'AudioContext' in window;

  useEffect(() => {
    if (!enabled || !stream || !supported) return;
    if (stream.getAudioTracks().length === 0) return;

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let rafId: number | null = null;
    let cancelled = false;

    try {
      context = new AudioContext();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      // Deliberately not connected to the destination: no playback, so the
      // candidate never hears themselves.

      const buffer = new Float32Array(analyser.fftSize);
      let rollingPeak = 0;
      let lastPublished = 0;

      const sample = () => {
        if (cancelled || !analyser) return;

        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);

        rollingPeak = Math.max(rms, rollingPeak * 0.95);

        // Throttle React updates: the detector runs at frame rate, the UI does not.
        const now = performance.now();
        if (now - lastPublished >= UI_UPDATE_MS) {
          lastPublished = now;
          setVolume(rms);
          setPeak(rollingPeak);
        }

        rafId = window.requestAnimationFrame(sample);
      };

      // Browsers start an AudioContext suspended until a gesture; the stream
      // itself came from a gesture, so resume is normally immediate.
      void context.resume().catch(() => undefined);
      rafId = window.requestAnimationFrame(sample);
      // Reported asynchronously so the effect body stays free of render-time state
      // updates.
      window.setTimeout(() => {
        if (!cancelled) {
          setActive(true);
          setError(null);
        }
      }, 0);
    } catch (err) {
      const message = (err as Error)?.message ?? 'Audio monitoring failed to start.';
      window.setTimeout(() => {
        if (!cancelled) {
          setError(message);
          setActive(false);
        }
      }, 0);
    }

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      try {
        source?.disconnect();
        analyser?.disconnect();
        void context?.close();
      } catch {
        /* already torn down */
      }
      setActive(false);
      setVolume(0);
      setPeak(0);
    };
  }, [stream, enabled, supported]);

  return { volume, peak, supported, active, error };
}
