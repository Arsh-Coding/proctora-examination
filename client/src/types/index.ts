/** Shared API/domain types, mirroring the server contracts. */

export type UserRole = 'ADMIN' | 'CANDIDATE';
export type SessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
export type SubmissionReason = 'MANUAL' | 'TIME_EXPIRED' | 'AUTO_SWEEP';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export type ViolationType =
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'TAB_SWITCH'
  | 'FULLSCREEN_EXIT'
  | 'NO_CAMERA'
  | 'NO_MICROPHONE'
  | 'NOISE_DETECTED';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AdminQuestion {
  id: string;
  questionText: string;
  options: string[];
  correctAnswer: number;
  marks: number;
}

export interface ExamSummary {
  id: string;
  title: string;
  description: string;
  duration: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  totalMarks: number;
  sessionCount: number;
  submittedCount: number;
}

export interface ExamDetail extends Omit<ExamSummary, 'sessionCount' | 'submittedCount'> {
  questions: AdminQuestion[];
  sessionCount: number;
  submittedCount: number;
  violationCount: number;
}

export interface QuestionDraft {
  questionText: string;
  options: string[];
  correctAnswer: number;
  marks: number;
}

export interface ExamPayload {
  title: string;
  description: string;
  duration: number;
  isActive: boolean;
  questions: QuestionDraft[];
}

/* ------------------------------- candidate ------------------------------- */

export interface PublicExam {
  id: string;
  title: string;
  description: string;
  duration: number;
  questionCount: number;
  totalMarks: number;
  isActive: boolean;
}

export interface CandidateQuestion {
  id: string;
  questionText: string;
  options: string[];
  marks: number;
}

export interface CandidateExam {
  id: string;
  title: string;
  description: string;
  duration: number;
  isActive: boolean;
  questionCount: number;
  totalMarks: number;
  questions: CandidateQuestion[];
}

export interface CandidateSession {
  id: string;
  examId: string;
  candidateName: string;
  candidateEmail: string;
  status: SessionStatus;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  remainingMs: number;
  serverTime: string;
  totalMarks: number;
  answers: Array<{ questionId: string; selectedOption: number | null }>;
}

export interface ProctoringThresholds {
  faceDetectionIntervalMs: number;
  noFaceGraceMs: number;
  multipleFacesGraceMs: number;
  faceMinConfidence: number;
  noiseVolumeThreshold: number;
  noiseSustainMs: number;
  violationCooldownMs: Record<ViolationType, number>;
  maxWarnings: number;
  warningCountedTypes: ViolationType[];
  autoTerminateOnMaxWarnings: boolean;
  answerAutosaveMs: number;
  heartbeatMs: number;
}

export interface StartExamResponse {
  resumed: boolean;
  sessionToken: string;
  session: CandidateSession;
  exam: CandidateExam;
  proctoring: ProctoringThresholds;
}

export interface SubmitResult {
  alreadySubmitted: boolean;
  submittedAt: string;
  status: SessionStatus;
  score: number;
  totalMarks: number;
  percentage: number;
  reason: SubmissionReason | null;
}

/* --------------------------------- admin --------------------------------- */

export interface AdminSessionRow {
  id: string;
  examId: string;
  examTitle?: string;
  candidateName: string;
  candidateEmail: string;
  status: SessionStatus;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  remainingMs: number;
  lastSeenAt: string | null;
  score: number;
  totalMarks: number;
  percentage: number;
  answeredCount: number;
  submissionReason: SubmissionReason | null;
  violationCount: number;
  createdAt: string;
}

export interface ViolationRecord {
  id: string;
  sessionId: string;
  examId: string;
  type: ViolationType;
  label: string;
  severity: Severity;
  timestamp: string;
  metadata: Record<string, unknown>;
  examTitle?: string;
}

export interface ReviewRow {
  number: number;
  questionId: string;
  questionText: string;
  options: string[];
  correctAnswer: number;
  selectedOption: number | null;
  marks: number;
  awarded: number;
}

export interface SessionDetail {
  session: AdminSessionRow;
  exam: {
    id: string;
    title: string;
    description: string;
    duration: number;
    questionCount: number;
  };
  violations: ViolationRecord[];
  review: ReviewRow[];
}

export interface DashboardStats {
  totals: {
    exams: number;
    activeExams: number;
    candidates: number;
    attempts: number;
    completedAttempts: number;
    inProgressAttempts: number;
    averageScore: number;
    violations: number;
  };
  violationsByType: Array<{ type: ViolationType; count: number }>;
  recentSessions: AdminSessionRow[];
  recentViolations: ViolationRecord[];
}

/* ----------------------------- socket payloads ---------------------------- */

export interface ViolationEventPayload {
  violation: ViolationRecord;
  violationCount: number;
  candidate: {
    sessionId: string;
    name: string;
    email: string;
    examId: string;
    examTitle: string;
  };
}

export interface SessionEventPayload {
  session: AdminSessionRow;
  reason?: SubmissionReason;
}

export interface CandidatePresencePayload {
  sessionId: string;
  examId: string;
  candidateName?: string;
  candidateEmail?: string;
  at: string;
}

export interface CandidateHeartbeatPayload {
  sessionId: string;
  examId: string;
  faces: number | null;
  volume: number | null;
  fullscreen: boolean | null;
  at: string;
}
