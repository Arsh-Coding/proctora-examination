import mongoose, { Schema } from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export interface IQuestion {
  _id: Types.ObjectId;
  questionText: string;
  /** Ordered options; index 0 -> "A", 1 -> "B", ... */
  options: string[];
  /** Index into `options` of the correct choice. Never sent to candidates. */
  correctAnswer: number;
  marks: number;
}

export interface IExam {
  _id: Types.ObjectId;
  title: string;
  description: string;
  /** Minutes. */
  duration: number;
  questions: Types.DocumentArray<IQuestion>;
  createdBy: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ExamDocument = HydratedDocument<IExam>;

const questionSchema = new Schema<IQuestion>(
  {
    questionText: { type: String, required: true, trim: true, maxlength: 2000 },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (options: string[]) =>
          Array.isArray(options) &&
          options.length >= 2 &&
          options.length <= 6 &&
          options.every((o) => typeof o === 'string' && o.trim().length > 0),
        message: 'A question needs between 2 and 6 non-empty options.',
      },
    },
    correctAnswer: { type: Number, required: true, min: 0 },
    marks: { type: Number, required: true, min: 1, max: 100, default: 1 },
  },
  { _id: true }
);

questionSchema.pre('validate', function validateCorrectAnswer(next) {
  if (this.correctAnswer >= this.options.length) {
    return next(new Error('correctAnswer must point at one of the provided options.'));
  }
  next();
});

const examSchema = new Schema<IExam, Model<IExam>>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    duration: { type: Number, required: true, min: 1, max: 600 },
    questions: { type: [questionSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

examSchema.virtual('totalMarks').get(function totalMarks() {
  return this.questions.reduce((sum, q) => sum + q.marks, 0);
});

examSchema.set('toJSON', { virtuals: true });
examSchema.set('toObject', { virtuals: true });

export const Exam = mongoose.model<IExam>('Exam', examSchema);

/** Total marks for a plain (non-hydrated) exam shape. */
export function computeTotalMarks(questions: Array<{ marks: number }>): number {
  return questions.reduce((sum, q) => sum + (q.marks ?? 0), 0);
}
