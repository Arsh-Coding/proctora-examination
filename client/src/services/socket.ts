import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { SOCKET_URL } from './api';

/**
 * Creates an authenticated Socket.io connection.
 * Admins pass their login JWT, candidates pass the exam-session token; the
 * server derives the role from the token.
 */
export function createSocket(token: string): Socket {
  return io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 8000,
  });
}

/** Promise wrapper around an acknowledged emit, with a timeout. */
export function emitWithAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 5000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Socket ack timeout for "${event}"`));
    }, timeoutMs);

    socket.emit(event, payload, (response: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(response);
    });
  });
}
