import mongoose, { Schema } from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { SEVERITIES, VIOLATION_TYPES } from '../config/proctoring';
import type { Severity, ViolationType } from '../config/proctoring';

export interface IViolation {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  examId: Types.ObjectId;
  type: ViolationType;
  severity: Severity;
  timestamp: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ViolationDocument = HydratedDocument<IViolation>;

const violationSchema = new Schema<IViolation, Model<IViolation>>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'ExamSession', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    type: { type: String, enum: VIOLATION_TYPES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    timestamp: { type: Date, default: () => new Date(), index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

violationSchema.index({ sessionId: 1, timestamp: -1 });

export const Violation = mongoose.model<IViolation>('Violation', violationSchema);
