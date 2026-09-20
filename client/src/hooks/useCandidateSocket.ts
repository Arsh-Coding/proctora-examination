import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '../services/socket';

/**
 * Candidate side of the real-time channel. The exam-session token authorises the
 * connection, and violations are pushed through it (with a REST fallback in
 * `useProctoring`).
 */
export function useCandidateSocket(sessionToken: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // No token: the previous run's cleanup already cleared the socket.
    if (!sessionToken) return undefined;

    const instance = createSocket(sessionToken);
    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('connect_error', () => setConnected(false));
    setSocket(instance);

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [sessionToken]);

  return { socket, connected };
}
