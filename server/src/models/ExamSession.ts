import mongoose, { Schema } from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

export const SESSION_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SUBMISSION_REASONS = ['MANUAL', 'TIME_EXPIRED', 'AUTO_SWEEP'] as const;
export type SubmissionReason = (typeof SUBMISSION_REASONS)[number];

export interface IAnswer {
  questionId: Types.ObjectId;
  /** Index into the question's options, or null when cleared. */
  selectedOption: number | null;
  answeredAt: Date;
}

export interface IExamSession {
  _id: Types.ObjectId;
  examId: Types.ObjectId;
  candidateName: string;
  candidateEmail: string;
  startedAt: Date | null;
  submittedAt: Date | null;
  /** Server-authoritative deadline = startedAt + exam.duration. */
  expiresAt: Date | null;
  status: SessionStatus;
  score: number;
  totalMarks: number;
  answers: Types.DocumentArray<IAnswer>;
  submissionReason: SubmissionReason | null;
  lastSeenAt: Date | null;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ExamSessionDocument = HydratedDocument<IExamSession>;

const answerSchema = new Schema<IAnswer>(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    selectedOption: { type: Number, default: null },
    answeredAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const examSessionSchema = new Schema<IExamSession, Model<IExamSession>>(
  {
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    candidateName: { type: String, required: true, trim: true, maxlength: 120 },
    candidateEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    status: { type: String, enum: SESSION_STATUSES, default: 'NOT_STARTED', index: true },
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    answers: { type: [answerSchema], default: [] },
    submissionReason: { type: String, enum: SUBMISSION_REASONS, default: null },
    lastSeenAt: { type: Date, default: null },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

examSessionSchema.index({ examId: 1, candidateEmail: 1, status: 1 });

examSessionSchema.virtual('percentage').get(function percentage() {
  if (!this.totalMarks) return 0;
  return Math.round((this.score / this.totalMarks) * 10000) / 100;
});

examSessionSchema.set('toJSON', { virtuals: true });
examSessionSchema.set('toObject', { virtuals: true });

export const ExamSession = mongoose.model<IExamSession>('ExamSession', examSessionSchema);
