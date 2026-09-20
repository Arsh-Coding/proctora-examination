import type { ExamDocument, IQuestion } from '../models/Exam';
import { Exam } from '../models/Exam';
import { ExamSession } from '../models/ExamSession';
import type { ExamSessionDocument, SubmissionReason } from '../models/ExamSession';
import { Violation } from '../models/Violation';
import { emitToRooms, rooms } from '../sockets/realtime';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { scoreSession } from './scoring.service';

/** Question shape sent to candidates: no `correctAnswer` field, ever. */
export interface CandidateQuestion {
  id: string;
  questionText: string;
  options: string[];
  marks: number;
}

export function toCandidateQuestions(questions: Array<IQuestion>): CandidateQuestion[] {
  return questions.map((q) => ({
    id: q._id.toString(),
    questionText: q.questionText,
    options: [...q.options],
    marks: q.marks,
  }));
}

export function toCandidateExam(exam: ExamDocument) {
  return {
    id: exam._id.toString(),
    title: exam.title,
    description: exam.description,
    duration: exam.duration,
    isActive: exam.isActive,
    questionCount: exam.questions.length,
    totalMarks: exam.questions.reduce((sum, q) => sum + q.marks, 0),
    questions: toCandidateQuestions(exam.questions),
  };
}

export function remainingMsFor(session: ExamSessionDocument): number {
  if (!session.expiresAt) return 0;
  return Math.max(0, session.expiresAt.getTime() - Date.now());
}

export function serializeSessionForCandidate(session: ExamSessionDocument) {
  return {
    id: session._id.toString(),
    examId: session.examId.toString(),
    candidateName: session.candidateName,
    candidateEmail: session.candidateEmail,
    status: session.status,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    expiresAt: session.expiresAt,
    remainingMs: remainingMsFor(session),
    serverTime: new Date().toISOString(),
    totalMarks: session.totalMarks,
    answers: session.answers.map((a) => ({
      questionId: a.questionId.toString(),
      selectedOption: a.selectedOption,
    })),
  };
}

export function serializeSessionForAdmin(
  session: ExamSessionDocument,
  extras: { violationCount?: number; examTitle?: string } = {}
) {
  const totalMarks = session.totalMarks;
  return {
    id: session._id.toString(),
    examId: session.examId.toString(),
    examTitle: extras.examTitle,
    candidateName: session.candidateName,
    candidateEmail: session.candidateEmail,
    status: session.status,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    expiresAt: session.expiresAt,
    remainingMs: session.status === 'IN_PROGRESS' ? remainingMsFor(session) : 0,
    lastSeenAt: session.lastSeenAt,
    score: session.score,
    totalMarks,
    percentage: totalMarks > 0 ? Math.round((session.score / totalMarks) * 10000) / 100 : 0,
    answeredCount: session.answers.filter((a) => a.selectedOption !== null).length,
    submissionReason: session.submissionReason,
    violationCount: extras.violationCount ?? 0,
    createdAt: session.createdAt,
  };
}

/**
 * Marks and closes a session. Idempotent: calling it on an already-submitted
 * session returns the stored result instead of re-scoring.
 */
export async function submitSession(
  session: ExamSessionDocument,
  exam: ExamDocument,
  reason: SubmissionReason
) {
  if (session.status === 'SUBMITTED') {
    return {
      session,
      result: {
        score: session.score,
        totalMarks: session.totalMarks,
        percentage: session.totalMarks
          ? Math.round((session.score / session.totalMarks) * 10000) / 100
          : 0,
        correctCount: 0,
        incorrectCount: 0,
        unansweredCount: 0,
      },
      alreadySubmitted: true,
    };
  }

  const result = scoreSession(
    exam.questions.map((q) => ({ _id: q._id, correctAnswer: q.correctAnswer, marks: q.marks })),
    session.answers.map((a) => ({ questionId: a.questionId, selectedOption: a.selectedOption }))
  );

  session.score = result.score;
  session.totalMarks = result.totalMarks;
  session.status = 'SUBMITTED';
  session.submittedAt = new Date();
  session.submissionReason = reason;
  await session.save();

  const violationCount = await Violation.countDocuments({ sessionId: session._id });

  emitToRooms(
    [
      rooms.admin(exam.createdBy.toString()),
      rooms.exam(exam._id.toString()),
      rooms.session(session._id.toString()),
    ],
    'session:submitted',
    {
      session: serializeSessionForAdmin(session, { violationCount, examTitle: exam.title }),
      reason,
    }
  );

  logger.info(
    `Session ${session._id.toString()} submitted (${reason}) score=${result.score}/${result.totalMarks}`
  );

  return { session, result, alreadySubmitted: false };
}

/**
 * Server-side timer authority: closes sessions whose deadline passed even if the
 * candidate's browser never called submit (crash, network loss, closed laptop).
 */
export async function sweepExpiredSessions(): Promise<number> {
  const expired = await ExamSession.find({
    status: 'IN_PROGRESS',
    expiresAt: { $ne: null, $lte: new Date() },
  }).limit(50);

  if (expired.length === 0) return 0;

  let closed = 0;
  for (const session of expired) {
    const exam = await Exam.findById(session.examId);
    if (!exam) {
      session.status = 'SUBMITTED';
      session.submittedAt = new Date();
      session.submissionReason = 'AUTO_SWEEP';
      await session.save();
      continue;
    }
    await submitSession(session, exam, 'TIME_EXPIRED');
    closed += 1;
  }
  logger.info(`Auto-submitted ${closed} expired session(s).`);
  return closed;
}

export function startSweeper(intervalMs = 20000): NodeJS.Timeout {
  const timer = setInterval(() => {
    sweepExpiredSessions().catch((error) => logger.error('Session sweeper failed', error));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export async function loadSessionAndExam(sessionId: string) {
  const session = await ExamSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Exam session not found');
  const exam = await Exam.findById(session.examId);
  if (!exam) throw ApiError.notFound('The exam for this session no longer exists');
  return { session, exam };
}
