import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Keeps a ref pointing at the latest value without touching it during render.
 *
 * Used for values that long-lived listeners and intervals need to read (the
 * newest callback, the current volume, …) but that should not restart those
 * subscriptions when they change. The assignment happens on commit, which is
 * always before any event handler or timer callback can observe it.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
