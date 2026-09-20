import { z } from 'zod';
import { PROCTORING_CONFIG } from '../config/proctoring';
import { Exam } from '../models/Exam';
import { ExamSession } from '../models/ExamSession';
import {
  loadSessionAndExam,
  remainingMsFor,
  serializeSessionForAdmin,
  serializeSessionForCandidate,
  submitSession,
  toCandidateExam,
} from '../services/session.service';
import { listViolations, violationCountsBySession } from '../services/violation.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/params';

export const saveAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid question id'),
        selectedOption: z.number().int().min(0).max(5).nullable(),
      })
    )
    .min(1, 'Send at least one answer')
    .max(500),
});

export const submitSchema = z.object({
  answers: saveAnswersSchema.shape.answers.optional(),
  reason: z.enum(['MANUAL', 'TIME_EXPIRED']).default('MANUAL'),
});

async function assertOwnedByAdmin(examId: string, adminId: string) {
  const exam = await Exam.findById(examId);
  if (!exam) throw ApiError.notFound('Exam not found');
  if (exam.createdBy.toString() !== adminId) {
    throw ApiError.forbidden('This session belongs to another account');
  }
  return exam;
}

/**
 * Applies an answer patch onto the session document.
 * Rejects question ids that are not part of the exam and option indexes that are
 * out of range, so a tampered client cannot inject junk.
 */
function applyAnswers(
  session: Awaited<ReturnType<typeof loadSessionAndExam>>['session'],
  exam: Awaited<ReturnType<typeof loadSessionAndExam>>['exam'],
  patch: Array<{ questionId: string; selectedOption: number | null }>
) {
  const optionCounts = new Map(exam.questions.map((q) => [q._id.toString(), q.options.length]));

  for (const entry of patch) {
    const optionCount = optionCounts.get(entry.questionId);
    if (optionCount === undefined) {
      throw ApiError.badRequest(`Question ${entry.questionId} is not part of this exam`);
    }
    if (entry.selectedOption !== null && entry.selectedOption >= optionCount) {
      throw ApiError.badRequest(`Option index out of range for question ${entry.questionId}`);
    }

    const existing = session.answers.find((a) => a.questionId.toString() === entry.questionId);
    if (existing) {
      existing.selectedOption = entry.selectedOption;
      existing.answeredAt = new Date();
    } else {
      session.answers.push({
        questionId: entry.questionId as never,
        selectedOption: entry.selectedOption,
        answeredAt: new Date(),
      } as never);
    }
  }
}

/* ------------------------------- candidate ------------------------------- */

/** Restores an in-flight attempt after a refresh or crash. */
export const getCandidateSession = asyncHandler(async (req, res) => {
  const sessionId = req.sessionToken!.sub;
  const { session, exam } = await loadSessionAndExam(sessionId);

  res.json({
    success: true,
    data: {
      session: serializeSessionForCandidate(session),
      exam: toCandidateExam(exam),
      proctoring: PROCTORING_CONFIG,
    },
  });
});

export const saveAnswers = asyncHandler(async (req, res) => {
  const sessionId = req.sessionToken!.sub;
  const { answers } = req.body as z.infer<typeof saveAnswersSchema>;
  const { session, exam } = await loadSessionAndExam(sessionId);

  if (session.status === 'SUBMITTED') {
    throw ApiError.badRequest('This attempt has already been submitted');
  }

  // Server-side deadline check: a late save closes the attempt instead of saving.
  if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    const { result } = await submitSession(session, exam, 'TIME_EXPIRED');
    return res.status(409).json({
      success: false,
      message: 'Time is up. Your attempt was submitted automatically.',
      data: { autoSubmitted: true, result },
    });
  }

  applyAnswers(session, exam, answers);
  session.lastSeenAt = new Date();
  await session.save();

  return res.json({
    success: true,
    data: {
      savedCount: answers.length,
      answeredCount: session.answers.filter((a) => a.selectedOption !== null).length,
      remainingMs: remainingMsFor(session),
      serverTime: new Date().toISOString(),
    },
  });
});

export const submitCandidateSession = asyncHandler(async (req, res) => {
  const sessionId = req.sessionToken!.sub;
  const body = req.body as z.infer<typeof submitSchema>;
  const { session, exam } = await loadSessionAndExam(sessionId);

  if (session.status !== 'SUBMITTED' && body.answers?.length) {
    applyAnswers(session, exam, body.answers);
    await session.save();
  }

  const timedOut = Boolean(session.expiresAt && session.expiresAt.getTime() <= Date.now());
  const reason = timedOut || body.reason === 'TIME_EXPIRED' ? 'TIME_EXPIRED' : 'MANUAL';
  const { result, alreadySubmitted } = await submitSession(session, exam, reason);

  res.json({
    success: true,
    data: {
      alreadySubmitted,
      submittedAt: session.submittedAt,
      status: session.status,
      // Score summary only. Correct answers are never returned to a candidate.
      score: result.score,
      totalMarks: result.totalMarks,
      percentage: result.percentage,
      reason: session.submissionReason,
    },
  });
});

/** Keeps `lastSeenAt` fresh and lets the client re-sync with the server clock. */
export const heartbeat = asyncHandler(async (req, res) => {
  const sessionId = req.sessionToken!.sub;
  const session = await ExamSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Exam session not found');

  if (session.status === 'IN_PROGRESS') {
    session.lastSeenAt = new Date();
    await session.save();
  }

  res.json({
    success: true,
    data: {
      status: session.status,
      remainingMs: remainingMsFor(session),
      serverTime: new Date().toISOString(),
    },
  });
});

/* --------------------------------- admin --------------------------------- */

export const listAllSessions = asyncHandler(async (req, res) => {
  const adminId = req.admin!._id;
  const exams = await Exam.find({ createdBy: adminId }).select('_id title');
  const examTitles = new Map(exams.map((e) => [e._id.toString(), e.title]));

  const sessions = await ExamSession.find({ examId: { $in: exams.map((e) => e._id) } })
    .sort({ createdAt: -1 })
    .limit(500);
  const counts = await violationCountsBySession(sessions.map((s) => s._id.toString()));

  res.json({
    success: true,
    data: sessions.map((session) =>
      serializeSessionForAdmin(session, {
        violationCount: counts.get(session._id.toString()) ?? 0,
        examTitle: examTitles.get(session.examId.toString()),
      })
    ),
  });
});

export const getAdminSession = asyncHandler(async (req, res) => {
  const { session, exam } = await loadSessionAndExam(routeParam(req, 'id'));
  await assertOwnedByAdmin(session.examId.toString(), req.admin!._id.toString());

  const violations = await listViolations(session._id.toString());
  const answerByQuestion = new Map(
    session.answers.map((a) => [a.questionId.toString(), a.selectedOption])
  );

  // Admins may see the key, so the review table can show right vs wrong.
  const review = exam.questions.map((question, index) => {
    const selectedOption = answerByQuestion.get(question._id.toString()) ?? null;
    return {
      number: index + 1,
      questionId: question._id.toString(),
      questionText: question.questionText,
      options: [...question.options],
      correctAnswer: question.correctAnswer,
      selectedOption,
      marks: question.marks,
      awarded: selectedOption !== null && selectedOption === question.correctAnswer ? question.marks : 0,
    };
  });

  res.json({
    success: true,
    data: {
      session: serializeSessionForAdmin(session, {
        violationCount: violations.length,
        examTitle: exam.title,
      }),
      exam: {
        id: exam._id.toString(),
        title: exam.title,
        description: exam.description,
        duration: exam.duration,
        questionCount: exam.questions.length,
      },
      violations,
      review,
    },
  });
});

export const getSessionViolations = asyncHandler(async (req, res) => {
  const session = await ExamSession.findById(routeParam(req, 'id'));
  if (!session) throw ApiError.notFound('Exam session not found');

  // Admins need ownership; a candidate may only read their own session.
  if (req.admin) {
    await assertOwnedByAdmin(session.examId.toString(), req.admin._id.toString());
  } else if (req.sessionToken?.sub !== session._id.toString()) {
    throw ApiError.forbidden('You cannot read violations for another session');
  }

  const violations = await listViolations(session._id.toString());
  res.json({ success: true, data: violations });
});
