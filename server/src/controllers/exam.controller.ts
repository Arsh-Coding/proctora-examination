import { z } from 'zod';
import { PROCTORING_CONFIG } from '../config/proctoring';
import { Exam } from '../models/Exam';
import type { ExamDocument } from '../models/Exam';
import { ExamSession } from '../models/ExamSession';
import { Violation } from '../models/Violation';
import {
  serializeSessionForAdmin,
  serializeSessionForCandidate,
  submitSession,
  toCandidateExam,
} from '../services/session.service';
import { violationCountsBySession } from '../services/violation.service';
import { emitToRooms, rooms } from '../sockets/realtime';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { routeParam } from '../utils/params';
import { signSessionToken } from '../utils/token';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const questionSchema = z
  .object({
    questionText: z.string().trim().min(3, 'Question text is required').max(2000),
    options: z
      .array(z.string().trim().min(1, 'Options cannot be empty'))
      .min(2, 'At least 2 options are required')
      .max(6, 'At most 6 options are allowed'),
    // Accepts an index (0-based) or a letter ("A".."F").
    correctAnswer: z.union([z.number().int().min(0), z.enum(['A', 'B', 'C', 'D', 'E', 'F'])]),
    marks: z.number().int().min(1).max(100).default(1),
  })
  .transform((question) => ({
    ...question,
    correctAnswer:
      typeof question.correctAnswer === 'number'
        ? question.correctAnswer
        : OPTION_LETTERS.indexOf(question.correctAnswer),
  }))
  .refine((question) => question.correctAnswer < question.options.length, {
    message: 'Correct answer must be one of the provided options',
    path: ['correctAnswer'],
  });

export const createExamSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().trim().max(2000).default(''),
  duration: z.number().int().min(1, 'Duration must be at least 1 minute').max(600),
  isActive: z.boolean().default(true),
  questions: z.array(questionSchema).min(1, 'Add at least one question'),
});

export const updateExamSchema = createExamSchema.partial();

export const startExamSchema = z.object({
  candidateName: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  candidateEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

function serializeExamForAdmin(exam: ExamDocument) {
  return {
    id: exam._id.toString(),
    title: exam.title,
    description: exam.description,
    duration: exam.duration,
    isActive: exam.isActive,
    createdBy: exam.createdBy.toString(),
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
    questionCount: exam.questions.length,
    totalMarks: exam.questions.reduce((sum, q) => sum + q.marks, 0),
    questions: exam.questions.map((q) => ({
      id: q._id.toString(),
      questionText: q.questionText,
      options: [...q.options],
      correctAnswer: q.correctAnswer,
      marks: q.marks,
    })),
  };
}

async function findOwnedExam(examId: string, adminId: string) {
  const exam = await Exam.findById(examId);
  if (!exam) throw ApiError.notFound('Exam not found');
  if (exam.createdBy.toString() !== adminId) {
    throw ApiError.forbidden('This exam belongs to another account');
  }
  return exam;
}

/* ------------------------------ admin: CRUD ------------------------------ */

export const createExam = asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createExamSchema>;
  const exam = await Exam.create({ ...body, createdBy: req.admin!._id });
  res.status(201).json({ success: true, data: serializeExamForAdmin(exam) });
});

export const listExams = asyncHandler(async (req, res) => {
  const exams = await Exam.find({ createdBy: req.admin!._id }).sort({ createdAt: -1 });
  const examIds = exams.map((e) => e._id);

  const sessionRows = await ExamSession.aggregate<{
    _id: unknown;
    total: number;
    submitted: number;
  }>([
    { $match: { examId: { $in: examIds } } },
    {
      $group: {
        _id: '$examId',
        total: { $sum: 1 },
        submitted: { $sum: { $cond: [{ $eq: ['$status', 'SUBMITTED'] }, 1, 0] } },
      },
    },
  ]);
  const stats = new Map(sessionRows.map((row) => [String(row._id), row]));

  res.json({
    success: true,
    data: exams.map((exam) => {
      const row = stats.get(exam._id.toString());
      // Drop the question bodies from list responses: the list view never needs
      // them and they contain the correct answers.
      const { questions, ...summary } = serializeExamForAdmin(exam);
      void questions;
      return {
        ...summary,
        sessionCount: row?.total ?? 0,
        submittedCount: row?.submitted ?? 0,
      };
    }),
  });
});

export const getExam = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(routeParam(req, 'id'), req.admin!._id.toString());
  const sessionCount = await ExamSession.countDocuments({ examId: exam._id });
  const submittedCount = await ExamSession.countDocuments({ examId: exam._id, status: 'SUBMITTED' });
  const violationCount = await Violation.countDocuments({ examId: exam._id });

  res.json({
    success: true,
    data: { ...serializeExamForAdmin(exam), sessionCount, submittedCount, violationCount },
  });
});

export const updateExam = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(routeParam(req, 'id'), req.admin!._id.toString());
  const body = req.body as z.infer<typeof updateExamSchema>;

  if (body.title !== undefined) exam.title = body.title;
  if (body.description !== undefined) exam.description = body.description;
  if (body.duration !== undefined) exam.duration = body.duration;
  if (body.isActive !== undefined) exam.isActive = body.isActive;
  if (body.questions !== undefined) exam.set('questions', body.questions);

  await exam.save();
  res.json({ success: true, data: serializeExamForAdmin(exam) });
});

export const deleteExam = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(routeParam(req, 'id'), req.admin!._id.toString());
  const sessions = await ExamSession.find({ examId: exam._id }).select('_id');
  await Violation.deleteMany({ sessionId: { $in: sessions.map((s) => s._id) } });
  await ExamSession.deleteMany({ examId: exam._id });
  await exam.deleteOne();
  res.json({ success: true, data: { id: routeParam(req, 'id'), deleted: true } });
});

export const listExamSessions = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(routeParam(req, 'id'), req.admin!._id.toString());
  const sessions = await ExamSession.find({ examId: exam._id }).sort({ createdAt: -1 });
  const counts = await violationCountsBySession(sessions.map((s) => s._id.toString()));

  res.json({
    success: true,
    data: {
      exam: { id: exam._id.toString(), title: exam.title, duration: exam.duration },
      sessions: sessions.map((session) =>
        serializeSessionForAdmin(session, {
          violationCount: counts.get(session._id.toString()) ?? 0,
          examTitle: exam.title,
        })
      ),
    },
  });
});

/* ------------------------- candidate: public views ------------------------ */

/** Exam intro shown on the candidate landing page. No questions, no answers. */
export const getPublicExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(routeParam(req, 'id'));
  if (!exam) throw ApiError.notFound('This exam link is not valid');

  res.json({
    success: true,
    data: {
      id: exam._id.toString(),
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      questionCount: exam.questions.length,
      totalMarks: exam.questions.reduce((sum, q) => sum + q.marks, 0),
      isActive: exam.isActive,
    },
  });
});

/**
 * Creates (or resumes) a candidate session and mints the session token used for
 * answer saves, submission and violation reports.
 */
export const startExam = asyncHandler(async (req, res) => {
  const { candidateName, candidateEmail } = req.body as z.infer<typeof startExamSchema>;

  const exam = await Exam.findById(routeParam(req, 'id'));
  if (!exam) throw ApiError.notFound('This exam link is not valid');
  if (!exam.isActive) throw ApiError.forbidden('This exam is currently closed');
  if (exam.questions.length === 0) throw ApiError.badRequest('This exam has no questions yet');

  const existing = await ExamSession.findOne({
    examId: exam._id,
    candidateEmail,
    status: 'IN_PROGRESS',
  });

  let session = existing;
  let resumed = false;

  if (session && session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    // Deadline already passed: close it and refuse a fresh attempt.
    await submitSession(session, exam, 'TIME_EXPIRED');
    throw ApiError.forbidden('Your previous attempt has expired and was submitted automatically.');
  }

  if (session) {
    resumed = true;
    session.lastSeenAt = new Date();
    session.userAgent = req.headers['user-agent'] ?? session.userAgent;
    await session.save();
  } else {
    const alreadySubmitted = await ExamSession.findOne({
      examId: exam._id,
      candidateEmail,
      status: 'SUBMITTED',
    });
    if (alreadySubmitted) {
      throw ApiError.conflict('This email has already submitted an attempt for this exam.');
    }

    const now = new Date();
    session = await ExamSession.create({
      examId: exam._id,
      candidateName,
      candidateEmail,
      startedAt: now,
      expiresAt: new Date(now.getTime() + exam.duration * 60 * 1000),
      status: 'IN_PROGRESS',
      totalMarks: exam.questions.reduce((sum, q) => sum + q.marks, 0),
      answers: [],
      lastSeenAt: now,
      userAgent: req.headers['user-agent'] ?? '',
    });

    emitToRooms(
      [rooms.admin(exam.createdBy.toString()), rooms.exam(exam._id.toString())],
      'session:started',
      {
        session: serializeSessionForAdmin(session, { violationCount: 0, examTitle: exam.title }),
      }
    );
  }

  const token = signSessionToken({ sub: session._id.toString(), examId: exam._id.toString() });

  res.status(resumed ? 200 : 201).json({
    success: true,
    data: {
      resumed,
      sessionToken: token,
      session: serializeSessionForCandidate(session),
      exam: toCandidateExam(exam),
      proctoring: PROCTORING_CONFIG,
    },
  });
});
