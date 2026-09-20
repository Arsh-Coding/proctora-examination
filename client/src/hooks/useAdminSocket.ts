import { useEffect, useState } from 'react';
import { createSocket } from '../services/socket';
import { useLatest } from './useLatest';
import type {
  CandidateHeartbeatPayload,
  CandidatePresencePayload,
  SessionEventPayload,
  ViolationEventPayload,
} from '../types';

interface Handlers {
  onViolation?: (payload: ViolationEventPayload) => void;
  onSessionStarted?: (payload: SessionEventPayload) => void;
  onSessionSubmitted?: (payload: SessionEventPayload) => void;
  onCandidateOnline?: (payload: CandidatePresencePayload) => void;
  onCandidateOffline?: (payload: CandidatePresencePayload) => void;
  onHeartbeat?: (payload: CandidateHeartbeatPayload) => void;
}

interface Options extends Handlers {
  token: string | null;
  /** Optional room scoping so a detail page only receives its own events. */
  examId?: string;
  sessionId?: string;
}

/**
 * Live admin channel. The server pushes violations and session lifecycle events
 * into the admin's private room, so dashboards update without polling.
 */
export function useAdminSocket({ token, examId, sessionId, ...handlers }: Options) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useLatest<Handlers>(handlers);

  useEffect(() => {
    // No token: the previous run's cleanup already reset `connected`.
    if (!token) return undefined;

    const socket = createSocket(token);

    const subscribe = () => {
      if (examId || sessionId) {
        socket.emit('admin:subscribe', { examId, sessionId });
      }
    };

    socket.on('connect', () => {
      setConnected(true);
      subscribe();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('violation:new', (payload: ViolationEventPayload) =>
      handlersRef.current.onViolation?.(payload)
    );
    socket.on('session:started', (payload: SessionEventPayload) =>
      handlersRef.current.onSessionStarted?.(payload)
    );
    socket.on('session:submitted', (payload: SessionEventPayload) =>
      handlersRef.current.onSessionSubmitted?.(payload)
    );
    socket.on('candidate:online', (payload: CandidatePresencePayload) =>
      handlersRef.current.onCandidateOnline?.(payload)
    );
    socket.on('candidate:offline', (payload: CandidatePresencePayload) =>
      handlersRef.current.onCandidateOffline?.(payload)
    );
    socket.on('candidate:heartbeat', (payload: CandidateHeartbeatPayload) =>
      handlersRef.current.onHeartbeat?.(payload)
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
    };
  }, [token, examId, sessionId, handlersRef]);

  return { connected };
}
