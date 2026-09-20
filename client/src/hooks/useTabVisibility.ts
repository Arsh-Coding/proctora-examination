import { useEffect, useState } from 'react';
import { useLatest } from './useLatest';

export interface VisibilityState {
  visible: boolean;
  /** Times the candidate left the exam tab/window. */
  awayCount: number;
  lastAwayAt: number | null;
}

/**
 * Tracks whether the exam tab is the active one.
 *
 * `visibilitychange` covers tab switches and minimising; `blur` additionally
 * catches switching to another application while the tab stays "visible".
 */
export function useTabVisibility(
  enabled: boolean,
  onLeave?: (reason: 'visibility' | 'blur') => void
): VisibilityState {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const [awayCount, setAwayCount] = useState(0);
  const [lastAwayAt, setLastAwayAt] = useState<number | null>(null);
  const onLeaveRef = useLatest(onLeave);

  useEffect(() => {
    if (!enabled) return undefined;

    const markAway = (reason: 'visibility' | 'blur') => {
      setVisible(false);
      setAwayCount((n) => n + 1);
      setLastAwayAt(Date.now());
      onLeaveRef.current?.(reason);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') markAway('visibility');
      else setVisible(true);
    };

    const handleBlur = () => {
      // Ignore blur caused by focusing an element inside our own document.
      if (document.visibilityState === 'hidden') return;
      markAway('blur');
    };

    const handleFocus = () => setVisible(true);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled]);

  return { visible, awayCount, lastAwayAt };
}
