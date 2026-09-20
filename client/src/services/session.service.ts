import { api, publicApi, unwrap, withSessionToken } from './api';
import type {
  AdminSessionRow,
  CandidateExam,
  CandidateSession,
  ProctoringThresholds,
  PublicExam,
  SessionDetail,
  StartExamResponse,
  SubmitResult,
  ViolationRecord,
} from '../types';

export interface AnswerPatch {
  questionId: string;
  selectedOption: number | null;
}

export const candidateService = {
  /** Exam intro for the landing page: no questions, no answer key. */
  publicExam(examId: string) {
    return unwrap<PublicExam>(publicApi.get(`/exams/${examId}/public`));
  },

  proctoringConfig() {
    return unwrap<{ thresholds: ProctoringThresholds }>(publicApi.get('/proctoring/config'));
  },

  start(examId: string, candidateName: string, candidateEmail: string) {
    return unwrap<StartExamResponse>(
      publicApi.post(`/exams/${examId}/start`, { candidateName, candidateEmail })
    );
  },

  /** Restores an in-flight attempt after a refresh or crash. */
  restore(sessionToken: string) {
    return unwrap<{
      session: CandidateSession;
      exam: CandidateExam;
      proctoring: ProctoringThresholds;
    }>(publicApi.get('/sessions/me', withSessionToken(sessionToken)));
  },

  saveAnswers(sessionId: string, sessionToken: string, answers: AnswerPatch[]) {
    return unwrap<{
      savedCount: number;
      answeredCount: number;
      remainingMs: number;
      serverTime: string;
    }>(publicApi.patch(`/sessions/${sessionId}/answers`, { answers }, withSessionToken(sessionToken)));
  },

  submit(
    sessionId: string,
    sessionToken: string,
    answers?: AnswerPatch[],
    reason: 'MANUAL' | 'TIME_EXPIRED' = 'MANUAL'
  ) {
    return unwrap<SubmitResult>(
      publicApi.post(
        `/sessions/${sessionId}/submit`,
        { answers, reason },
        withSessionToken(sessionToken)
      )
    );
  },

  heartbeat(sessionId: string, sessionToken: string) {
    return unwrap<{ status: string; remainingMs: number; serverTime: string }>(
      publicApi.post(`/sessions/${sessionId}/heartbeat`, {}, withSessionToken(sessionToken))
    );
  },

  /** REST fallback used when the Socket.io channel is unavailable. */
  reportViolation(
    sessionId: string,
    sessionToken: string,
    body: { type: string; timestamp?: string; metadata?: Record<string, unknown> }
  ) {
    return unwrap<{ id: string; violationCount: number }>(
      publicApi.post('/violations', { sessionId, ...body }, withSessionToken(sessionToken))
    );
  },
};

export const adminSessionService = {
  list() {
    return unwrap<AdminSessionRow[]>(api.get('/sessions'));
  },

  get(sessionId: string) {
    return unwrap<SessionDetail>(api.get(`/sessions/${sessionId}`));
  },

  violations(sessionId: string) {
    return unwrap<ViolationRecord[]>(api.get(`/sessions/${sessionId}/violations`));
  },
};
