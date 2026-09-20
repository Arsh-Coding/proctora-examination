import { Types } from 'mongoose';
import type { ViolationType } from '../config/proctoring';
import { VIOLATION_LABELS, severityFor } from '../config/proctoring';
import { Exam } from '../models/Exam';
import { ExamSession } from '../models/ExamSession';
import { Violation } from '../models/Violation';
import type { ViolationDocument } from '../models/Violation';
import { emitToRooms, rooms } from '../sockets/realtime';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export interface RecordViolationInput {
  sessionId: string;
  type: ViolationType;
  timestamp?: string | Date;
  metadata?: Record<string, unknown>;
}

export function serializeViolation(violation: ViolationDocument) {
  return {
    id: violation._id.toString(),
    sessionId: violation.sessionId.toString(),
    examId: violation.examId.toString(),
    type: violation.type,
    label: VIOLATION_LABELS[violation.type],
    severity: violation.severity,
    timestamp: violation.timestamp,
    metadata: violation.metadata ?? {},
  };
}

/**
 * Persists a violation and pushes it to every interested room in one step.
 * Both the REST endpoint and the Socket.io handler funnel through here so the
 * severity mapping and broadcast behaviour cannot drift apart.
 */
export async function recordViolation(input: RecordViolationInput) {
  const session = await ExamSession.findById(input.sessionId);
  if (!session) throw ApiError.notFound('Exam session not found');
  if (session.status === 'SUBMITTED') {
    throw ApiError.badRequest('Cannot record a violation for a submitted session');
  }

  const exam = await Exam.findById(session.examId).select('_id title createdBy');
  if (!exam) throw ApiError.notFound('Exam not found for this session');

  const violation = await Violation.create({
    sessionId: session._id,
    examId: session.examId,
    type: input.type,
    severity: severityFor(input.type),
    timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
    metadata: input.metadata ?? {},
  });

  session.lastSeenAt = new Date();
  await session.save();

  const violationCount = await Violation.countDocuments({ sessionId: session._id });
  const payload = {
    violation: serializeViolation(violation),
    violationCount,
    candidate: {
      sessionId: session._id.toString(),
      name: session.candidateName,
      email: session.candidateEmail,
      examId: session.examId.toString(),
      examTitle: exam.title,
    },
  };

  emitToRooms(
    [
      rooms.admin(exam.createdBy.toString()),
      rooms.exam(exam._id.toString()),
      rooms.session(session._id.toString()),
    ],
    'violation:new',
    payload
  );

  logger.debug(`Violation ${input.type} recorded for session ${session._id.toString()}`);
  return { violation, violationCount, payload };
}

export async function listViolations(sessionId: string) {
  const violations = await Violation.find({ sessionId }).sort({ timestamp: 1 });
  return violations.map(serializeViolation);
}

export async function violationCountsBySession(sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, number>();
  const rows = await Violation.aggregate<{ _id: unknown; count: number }>([
    { $match: { sessionId: { $in: sessionIds.map((id) => new Types.ObjectId(id)) } } },
    { $group: { _id: '$sessionId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}
