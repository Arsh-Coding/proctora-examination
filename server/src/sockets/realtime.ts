import type { Server } from 'socket.io';
import { logger } from '../utils/logger';

/**
 * Small registry so services can broadcast without importing the socket layer
 * (which would create a require cycle).
 */
let io: Server | null = null;

export function registerIo(instance: Server): void {
  io = instance;
}

export function getIo(): Server | null {
  return io;
}

export const rooms = {
  admin: (adminId: string) => `admin:${adminId}`,
  exam: (examId: string) => `exam:${examId}`,
  session: (sessionId: string) => `session:${sessionId}`,
};

type Payload = Record<string, unknown>;

export function emitToRooms(roomNames: string[], event: string, payload: Payload): void {
  if (!io) {
    logger.debug(`Socket.io not ready, dropped "${event}"`);
    return;
  }
  const unique = roomNames.filter((r, i, all) => all.indexOf(r) === i);
  io.to(unique).emit(event, payload);
}
