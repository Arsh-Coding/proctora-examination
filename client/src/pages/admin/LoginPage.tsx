import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/layout/Logo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiRequestError } from '../../services/api';

const DEMO = { email: 'admin@proctora.local', password: 'Admin@123' };

export function LoginPage() {
  const { login, user, initialising } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!initialising && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/dashboard'} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await login(email.trim(), password);
      toast.success('Signed in', `Welcome back, ${signedIn.name}.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : 'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = () => {
    setEmail(DEMO.email);
    setPassword(DEMO.password);
    setError(null);
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-ink-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="text-ink-900" />
          <h1 className="mt-4 text-xl font-bold text-ink-900">Sign in to the console</h1>
          <p className="mt-1 text-sm text-ink-600">
            Create exams, monitor candidates and review violations.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
        >
          {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button type="submit" fullWidth loading={submitting}>
            Sign in
          </Button>

          <p className="text-center text-xs text-ink-500">
            No account yet?{' '}
            <Link to="/register" className="font-semibold text-brand-700 hover:underline">
              Create one
            </Link>
          </p>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-ink-300 bg-white/60 p-4">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Demo credentials (development only)
          </p>
          <p className="mt-1.5 font-mono text-xs text-ink-700">{DEMO.email}</p>
          <p className="font-mono text-xs text-ink-700">{DEMO.password}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={fillDemo}>
            Fill demo credentials
          </Button>
          <p className="mt-2 text-[11px] text-ink-500">
            Run <span className="font-mono">npm run seed</span> once to create this account.
          </p>
        </div>
      </div>
    </div>
  );
}
