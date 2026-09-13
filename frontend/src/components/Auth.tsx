import { useMemo, useState } from 'react';
import { Webhook } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { getErrorMessage } from '../lib/api';
import { Spinner } from './Spinner';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(password: string): { label: string; score: number; color: string } {
  if (password.length === 0) return { label: '', score: 0, color: 'bg-slate-700' };
  if (password.length < 6) return { label: 'Too short', score: 1, color: 'bg-red-600' };
  const strong = password.length >= 8 && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const medium = password.length >= 8 || /[0-9A-Z]/.test(password);
  if (strong) return { label: 'Strong', score: 3, color: 'bg-green-600' };
  if (medium) return { label: 'Okay', score: 2, color: 'bg-amber-500' };
  return { label: 'Weak', score: 2, color: 'bg-amber-600' };
}

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [status, setStatus] = useState('');
  const { register, login, loading } = useAuth();
  const { success, error: toastError } = useToast();

  const emailError = useMemo(() => {
    if (!email) return 'Email is required';
    if (!EMAIL_REGEX.test(email)) return 'Enter a valid email address';
    return '';
  }, [email]);

  const passwordError = useMemo(() => {
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return '';
  }, [password]);

  const confirmError = useMemo(() => {
    if (isLogin) return '';
    if (!confirmPassword) return 'Confirm your password';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  }, [isLogin, password, confirmPassword]);

  const strength = passwordStrength(password);
  const isValid = !emailError && !passwordError && !confirmError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    setSubmitError('');
    setStatus(isLogin ? 'Signing in...' : 'Account created! Logging in...');

    try {
      if (isLogin) {
        await login(email, password);
        success('Welcome back!');
      } else {
        await register(email, password);
        success('Account created! Logging in...');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setSubmitError(message);
      toastError(message);
      setStatus('');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-lg sm:p-8">
        <div className="mb-6 text-center">
          <Webhook className="mx-auto mb-3 text-blue-500" size={36} aria-hidden="true" />
          <h1 className="text-3xl font-bold text-slate-100">{isLogin ? 'Login' : 'Register'}</h1>
          <p className="mt-2 text-sm text-slate-400">Inspect webhooks in real time</p>
        </div>

        {submitError && (
          <div className="mb-4 rounded-lg border border-red-500 bg-red-900/40 px-4 py-2 text-red-200" role="alert">
            {submitError}
          </div>
        )}
        {status && !submitError && (
          <div className="mb-4 rounded-lg border border-green-600 bg-green-900/40 px-4 py-2 text-green-200" role="status">
            {status}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-100">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              aria-invalid={Boolean(email) && Boolean(emailError)}
              aria-describedby="email-error"
            />
            {email && emailError && (
              <p id="email-error" className="mt-1 text-sm text-red-400">
                {emailError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-100">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              aria-invalid={Boolean(password) && Boolean(passwordError)}
              aria-describedby="password-error password-strength"
            />
            {password && (
              <div id="password-strength" className="mt-2">
                <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all ${strength.color}`}
                    style={{ width: `${(strength.score / 3) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">{strength.label || 'Min 6 characters'}</p>
              </div>
            )}
            {password && passwordError && (
              <p id="password-error" className="mt-1 text-sm text-red-400">
                {passwordError}
              </p>
            )}
          </div>

          {!isLogin && (
            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-100">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                aria-invalid={Boolean(confirmPassword) && Boolean(confirmError)}
                aria-describedby="confirm-error"
              />
              {confirmPassword && confirmError && (
                <p id="confirm-error" className="mt-1 text-sm text-red-400">
                  {confirmError}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isValid}
            className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {loading ? <Spinner label={isLogin ? 'Signing in...' : 'Creating account...'} /> : isLogin ? 'Login' : 'Register'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setSubmitError('');
              setStatus('');
            }}
            className="min-h-12 text-blue-400 transition-colors hover:text-blue-300"
          >
            {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    </div>
  );
}
