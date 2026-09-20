import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/layout/Logo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiRequestError } from '../../services/api';

export function RegisterPage() {
  const { register, user, initialising } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!initialising && user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await register(name.trim(), email.trim(), password);
      toast.success('Account created', 'You are signed in.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setFieldErrors(
          Object.fromEntries(err.fieldErrors.map((detail) => [detail.field, detail.message]))
        );
      } else {
        setError('Unable to create the account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-ink-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="text-ink-900" />
          <h1 className="mt-4 text-xl font-bold text-ink-900">Create an admin account</h1>
          <p className="mt-1 text-sm text-ink-600">Admins create and monitor exams.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
        >
          {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

          <Input
            label="Full name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
            placeholder="Jordan Blake"
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            hint="At least 8 characters with upper case, lower case and a number."
          />

          <Button type="submit" fullWidth loading={submitting}>
            Create account
          </Button>

          <p className="text-center text-xs text-ink-500">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-brand-700 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
