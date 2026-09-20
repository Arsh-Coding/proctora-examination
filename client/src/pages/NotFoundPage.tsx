import { Link } from 'react-router-dom';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-ink-100 px-4 text-center">
      <Logo className="text-ink-900" />
      <p className="text-5xl font-black text-ink-300">404</p>
      <h1 className="text-lg font-bold text-ink-900">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-600">
        The page you are looking for does not exist. If you were given an exam link, check that you
        copied the whole URL.
      </p>
      <Link to="/">
        <Button variant="secondary">Back to sign in</Button>
      </Link>
    </div>
  );
}
