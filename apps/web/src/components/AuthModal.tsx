/**
 * Authentication modal — Sign In / Sign Up with Cognito
 */
import { useState } from 'react';
import type { UseAuthReturn } from '../auth';

type AuthTab = 'signin' | 'signup';
type AuthStep = 'form' | 'confirm';

interface AuthModalProps {
  auth: UseAuthReturn;
  onClose: () => void;
}

export function AuthModal({ auth, onClose }: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>('signin');
  const [step, setStep] = useState<AuthStep>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await auth.login(email, password);
      onClose();
    } catch {
      // error is set in useAuth
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await auth.register(email, password);
      if (result.needsConfirmation) {
        setStep('confirm');
      } else {
        // Auto-confirmed — sign in
        await auth.login(email, password);
        onClose();
      }
    } catch {
      // error is set in useAuth
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await auth.confirmRegistration(email, confirmCode);
      // Now sign in
      await auth.login(email, password);
      onClose();
    } catch {
      // error is set in useAuth
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auth not configured — show coming-soon state
  if (!auth.authEnabled) {
    return (
      <div className="dialog-overlay" onClick={onClose}>
        <div className="dialog auth-dialog" onClick={e => e.stopPropagation()}>
          <div className="dialog-header">
            <h2>Welcome to fusionCad</h2>
            <button className="dialog-close" onClick={onClose}>&times;</button>
          </div>
          <div className="dialog-body">
            <p className="auth-description">
              Account sign-up is coming soon! Create an account to unlock:
            </p>
            <ul className="auth-benefits">
              <li>10 AI generations per day (vs 1 as guest)</li>
              <li>Save projects to the cloud</li>
              <li>Access from any device</li>
            </ul>
            <p className="auth-fine-print">
              For now, you can use fusionCad as a guest with local storage.
            </p>
          </div>
          <div className="dialog-footer">
            <button className="btn primary" onClick={onClose}>Got it</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog auth-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>{step === 'confirm' ? 'Verify Email' : 'Welcome to fusionCad'}</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          {step === 'confirm' ? (
            <form onSubmit={handleConfirm}>
              <p className="auth-description">
                We sent a verification code to <strong>{email}</strong>. Enter it below.
              </p>
              <div className="auth-field">
                <label htmlFor="confirm-code">Verification Code</label>
                <input
                  id="confirm-code"
                  type="text"
                  value={confirmCode}
                  onChange={e => setConfirmCode(e.target.value)}
                  placeholder="123456"
                  autoFocus
                  required
                />
              </div>
              {auth.error && <div className="auth-error">{auth.error}</div>}
              <button type="submit" className="btn-primary auth-submit" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
              </button>
            </form>
          ) : (
            <>
              <div className="auth-tabs">
                <button
                  className={`auth-tab ${tab === 'signin' ? 'active' : ''}`}
                  onClick={() => { setTab('signin'); auth.clearError(); }}
                >
                  Sign In
                </button>
                <button
                  className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
                  onClick={() => { setTab('signup'); auth.clearError(); }}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp}>
                <div className="auth-field">
                  <label htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    required
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={tab === 'signup' ? 'Min 8 characters' : 'Password'}
                    minLength={tab === 'signup' ? 8 : undefined}
                    required
                  />
                </div>
                {auth.error && <div className="auth-error">{auth.error}</div>}
                <button type="submit" className="btn-primary auth-submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? (tab === 'signin' ? 'Signing in...' : 'Creating account...')
                    : (tab === 'signin' ? 'Sign In' : 'Create Account')
                  }
                </button>
              </form>

              {tab === 'signup' && (
                <p className="auth-fine-print">
                  Free account: save 1 project to the cloud. Upgrade anytime for unlimited.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
