import { useCallback, useEffect, useRef, useState } from 'react';

export interface ExamTimerState {
  remainingMs: number;
  expired: boolean;
  /** Re-anchor the countdown from a fresh server response. */
  sync: (remainingMs: number) => void;
}

/**
 * Server-anchored exam countdown.
 *
 * The deadline is derived from the server's `remainingMs` (never from the local
 * clock alone) and is re-synced from every heartbeat, so changing the machine
 * clock does not buy extra time. The server independently auto-submits expired
 * sessions, making this display-and-nudge only.
 */
export function useExamTimer(
  remainingFromServer: number | null,
  running: boolean,
  onExpire?: () => void
): ExamTimerState {
  const deadlineRef = useRef<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(remainingFromServer ?? 0);
  const [expired, setExpired] = useState(false);
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const sync = useCallback((next: number) => {
    deadlineRef.current = Date.now() + next;
    setRemainingMs(next);
    if (next > 0) {
      firedRef.current = false;
      setExpired(false);
    }
  }, []);

  // Adopt the first value the server gives us, then keep our own deadline.
  // `sync` also publishes it immediately, so the clock never flashes 00:00
  // between the session arriving and the first interval tick.
  useEffect(() => {
    if (remainingFromServer === null) return;
    if (deadlineRef.current !== null) return;
    sync(remainingFromServer);
  }, [remainingFromServer, sync]);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const next = Math.max(0, deadline - Date.now());
      setRemainingMs(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        setExpired(true);
        onExpireRef.current?.();
      }
    };

    // 250ms keeps the seconds display honest without burning CPU.
    const timer = window.setInterval(tick, 250);

    return () => window.clearInterval(timer);
  }, [running]);

  return { remainingMs, expired, sync };
}
