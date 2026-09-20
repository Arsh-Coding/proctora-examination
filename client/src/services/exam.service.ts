import { api, unwrap } from './api';
import type {
  AdminSessionRow,
  DashboardStats,
  ExamDetail,
  ExamPayload,
  ExamSummary,
} from '../types';

export const examService = {
  list() {
    return unwrap<ExamSummary[]>(api.get('/exams'));
  },

  get(examId: string) {
    return unwrap<ExamDetail>(api.get(`/exams/${examId}`));
  },

  create(payload: ExamPayload) {
    return unwrap<ExamDetail>(api.post('/exams', payload));
  },

  update(examId: string, payload: Partial<ExamPayload>) {
    return unwrap<ExamDetail>(api.put(`/exams/${examId}`, payload));
  },

  remove(examId: string) {
    return unwrap<{ id: string; deleted: boolean }>(api.delete(`/exams/${examId}`));
  },

  sessions(examId: string) {
    return unwrap<{
      exam: { id: string; title: string; duration: number };
      sessions: AdminSessionRow[];
    }>(api.get(`/exams/${examId}/sessions`));
  },

  dashboard() {
    return unwrap<DashboardStats>(api.get('/stats/dashboard'));
  },
};
