import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/layout/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { NotFoundPage } from './pages/NotFoundPage';
import { AllSessionsPage } from './pages/admin/AllSessionsPage';
import { CreateExamPage } from './pages/admin/CreateExamPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { ExamDetailPage } from './pages/admin/ExamDetailPage';
import { ExamSessionsPage } from './pages/admin/ExamSessionsPage';
import { ExamsPage } from './pages/admin/ExamsPage';
import { LoginPage } from './pages/admin/LoginPage';
import { RegisterPage } from './pages/admin/RegisterPage';
import { SessionDetailPage } from './pages/admin/SessionDetailPage';
import { CandidateExamPage } from './pages/candidate/CandidateExamPage';

export default function App() {
  return (
    <Routes>
      {/* Candidate flow: public, no account required. */}
      <Route path="/exam/:examId" element={<CandidateExamPage />} />

      {/* Admin auth. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Admin console. */}
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/exams" element={<ExamsPage />} />
        <Route path="/exams/create" element={<CreateExamPage mode="create" />} />
        <Route path="/exams/:id" element={<ExamDetailPage />} />
        <Route path="/exams/:id/edit" element={<CreateExamPage mode="edit" />} />
        <Route path="/exams/:id/sessions" element={<ExamSessionsPage />} />
        <Route path="/sessions" element={<AllSessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
