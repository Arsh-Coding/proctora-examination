import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import { allowedOrigins } from '../config/env';
import { VIOLATION_TYPES } from '../config/proctoring';
import { Exam } from '../models/Exam';
import { ExamSession } from '../models/ExamSession';
import { recordViolation } from '../services/violation.service';
import { logger } from '../utils/logger';
import { verifyToken } from '../utils/token';
import { emitToRooms, registerIo, rooms } from './realtime';

interface SocketAuth {
  role: 'ADMIN' | 'CANDIDATE';
  adminId?: string;
  sessionId?: string;
  examId?: string;
}

const violationEventSchema = z.object({
  type: z.enum(VIOLATION_TYPES),
  timestamp: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const subscribeSchema = z.object({
  examId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  sessionId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

type AuthedSocket = Socket & { data: { auth: SocketAuth } };

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    path: '/socket.io',
  });

  /**
   * Handshake auth. Admins present their login JWT, candidates present the exam
   * session token issued at exam start. Anything else is rejected.
   */
  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as
        | string
        | undefined;
      if (!token) return next(new Error('Missing auth token'));

      const payload = verifyToken(token);
      if (payload.kind === 'ADMIN') {
        socket.data.auth = { role: 'ADMIN', adminId: payload.sub } satisfies SocketAuth;
      } else {
        socket.data.auth = {
          role: 'CANDIDATE',
          sessionId: payload.sub,
          examId: payload.examId,
        } satisfies SocketAuth;
      }
      return next();
    } catch (error) {
      logger.warn('Socket auth rejected:', (error as Error).message);
      return next(new Error('Unauthorised socket connection'));
    }
  });

  io.on('connection', (socket) => {
    const auth = (socket as AuthedSocket).data.auth;

    if (auth.role === 'ADMIN' && auth.adminId) {
      socket.join(rooms.admin(auth.adminId));
      logger.debug(`Admin socket connected (${auth.adminId})`);

      /** Scope an admin to a single exam or session view. */
      socket.on('admin:subscribe', async (raw: unknown, ack?: (res: unknown) => void) => {
        const parsed = subscribeSchema.safeParse(raw ?? {});
        if (!parsed.success) return ack?.({ ok: false, error: 'Invalid subscription' });

        const { examId, sessionId } = parsed.data;
        try {
          if (examId) {
            const exam = await Exam.findById(examId).select('createdBy');
            if (!exam || exam.createdBy.toString() !== auth.adminId) {
              return ack?.({ ok: false, error: 'Not your exam' });
            }
            socket.join(rooms.exam(examId));
          }
          if (sessionId) {
            const session = await ExamSession.findById(sessionId).select('examId');
            if (!session) return ack?.({ ok: false, error: 'Session not found' });
            const exam = await Exam.findById(session.examId).select('createdBy');
            if (!exam || exam.createdBy.toString() !== auth.adminId) {
              return ack?.({ ok: false, error: 'Not your session' });
            }
            socket.join(rooms.session(sessionId));
          }
          return ack?.({ ok: true });
        } catch (error) {
          logger.error('admin:subscribe failed', error);
          return ack?.({ ok: false, error: 'Subscription failed' });
        }
      });

      socket.on('admin:unsubscribe', (raw: unknown) => {
        const parsed = subscribeSchema.safeParse(raw ?? {});
        if (!parsed.success) return;
        if (parsed.data.examId) socket.leave(rooms.exam(parsed.data.examId));
        if (parsed.data.sessionId) socket.leave(rooms.session(parsed.data.sessionId));
      });

      return;
    }

    /* -------------------------- candidate socket -------------------------- */
    const sessionId = auth.sessionId!;
    const examId = auth.examId!;
    socket.join(rooms.session(sessionId));

    void (async () => {
      const exam = await Exam.findById(examId).select('createdBy title');
      const session = await ExamSession.findById(sessionId);
      if (!exam || !session) return;
      emitToRooms([rooms.admin(exam.createdBy.toString()), rooms.exam(examId)], 'candidate:online', {
        sessionId,
        examId,
        candidateName: session.candidateName,
        candidateEmail: session.candidateEmail,
        at: new Date().toISOString(),
      });
    })();

    /**
     * Primary violation path: candidate browser -> socket -> MongoDB -> admin.
     * The ack tells the client it is safe not to retry over REST.
     */
    socket.on('violation:report', async (raw: unknown, ack?: (res: unknown) => void) => {
      const parsed = violationEventSchema.safeParse(raw);
      if (!parsed.success) {
        return ack?.({ ok: false, error: 'Invalid violation payload' });
      }
      try {
        const { violation, violationCount } = await recordViolation({
          sessionId,
          type: parsed.data.type,
          timestamp: parsed.data.timestamp,
          metadata: parsed.data.metadata ?? {},
        });
        return ack?.({
          ok: true,
          violation: {
            id: violation._id.toString(),
            type: violation.type,
            severity: violation.severity,
            timestamp: violation.timestamp,
          },
          violationCount,
        });
      } catch (error) {
        logger.warn('violation:report failed:', (error as Error).message);
        return ack?.({ ok: false, error: (error as Error).message });
      }
    });

    /** Lightweight liveness + proctoring telemetry for the admin live view. */
    socket.on('candidate:heartbeat', async (raw: unknown) => {
      const payload = (raw ?? {}) as { faces?: number; volume?: number; fullscreen?: boolean };
      try {
        const session = await ExamSession.findById(sessionId);
        if (!session || session.status !== 'IN_PROGRESS') return;
        session.lastSeenAt = new Date();
        await session.save();

        const exam = await Exam.findById(examId).select('createdBy');
        if (!exam) return;
        emitToRooms(
          [rooms.admin(exam.createdBy.toString()), rooms.exam(examId), rooms.session(sessionId)],
          'candidate:heartbeat',
          {
            sessionId,
            examId,
            faces: payload.faces ?? null,
            volume: payload.volume ?? null,
            fullscreen: payload.fullscreen ?? null,
            at: new Date().toISOString(),
          }
        );
      } catch (error) {
        logger.debug('heartbeat failed', error);
      }
    });

    socket.on('disconnect', () => {
      void (async () => {
        const exam = await Exam.findById(examId).select('createdBy');
        if (!exam) return;
        emitToRooms(
          [rooms.admin(exam.createdBy.toString()), rooms.exam(examId)],
          'candidate:offline',
          { sessionId, examId, at: new Date().toISOString() }
        );
      })();
    });
  });

  registerIo(io);
  logger.info('Socket.io ready on /socket.io');
  return io;
}
