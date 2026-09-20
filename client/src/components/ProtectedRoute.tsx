import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from './ui/Spinner';

/** Blocks admin routes until a valid token has been confirmed with the API. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, token, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-ink-100">
        <PageLoader label="Checking your session…" />
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
