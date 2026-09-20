import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from './useLatest';

export interface FullscreenState {
  supported: boolean;
  isFullscreen: boolean;
  exitCount: number;
  enter: () => Promise<boolean>;
  exit: () => Promise<void>;
}

function currentElement(): Element | null {
  return document.fullscreenElement ?? null;
}

/**
 * Fullscreen control for the exam shell.
 * `enter()` must be called from a user gesture: browsers reject the request
 * otherwise.
 */
export function useFullscreen(enabled: boolean, onExit?: () => void): FullscreenState {
  const supported =
    typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(currentElement()));
  const [exitCount, setExitCount] = useState(0);
  const onExitRef = useLatest(onExit);
  const wasFullscreenRef = useRef(false);

  useEffect(() => {
    const handleChange = () => {
      const active = Boolean(currentElement());
      setIsFullscreen(active);

      if (wasFullscreenRef.current && !active) {
        setExitCount((n) => n + 1);
        if (enabled) onExitRef.current?.();
      }
      wasFullscreenRef.current = active;
    };

    // Seed the "was fullscreen" flag without writing React state from the effect
    // body; `isFullscreen` already starts from the live document state.
    wasFullscreenRef.current = Boolean(currentElement());
    document.addEventListener('fullscreenchange', handleChange);

    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [enabled]);

  const enter = useCallback(async () => {
    if (!supported) return false;
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      return true;
    } catch (error) {
      console.warn('[proctoring] fullscreen request rejected', error);
      return false;
    }
  }, [supported]);

  const exit = useCallback(async () => {
    if (!currentElement()) return;
    try {
      await document.exitFullscreen();
    } catch {
      /* already exited */
    }
  }, []);

  return { supported, isFullscreen, exitCount, enter, exit };
}
