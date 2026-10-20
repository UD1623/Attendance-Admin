import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { Fingerprint, AlertCircle, CheckCircle2, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Input, Button } from '@/components';
import styles from './LoginPage.module.css';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid administrator email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as { from?: { pathname?: string } } | null;
  const from = locationState?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleQuickLogin = async () => {
    setValue('email', 'admin@attendance.local');
    setValue('password', 'AdminPass123!');
    try {
      setAuthError(null);
      await signIn('admin@attendance.local', 'AdminPass123!');
      navigate(from, { replace: true });
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    try {
      setAuthError(null);
      await signIn(data.email, data.password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      console.error('Login error:', err);
      const errorObj = err as { code?: string; message?: string };
      if (
        errorObj.code === 'auth/invalid-credential' ||
        errorObj.code === 'auth/user-not-found' ||
        errorObj.code === 'auth/wrong-password'
      ) {
        setAuthError('Invalid email or password. Please verify your credentials.');
      } else if (errorObj.code === 'auth/too-many-requests') {
        setAuthError('Too many failed attempts. Access temporarily restricted. Try again later.');
      } else if (
        errorObj.code === 'auth/configuration-not-found' ||
        errorObj.message?.includes('configuration-not-found')
      ) {
        setAuthError(
          'Firebase Authentication is not yet enabled for project smartattendanceiot-43fa2. Please enable the Email/Password provider in the Firebase Console (Authentication > Sign-in method), or click "Quick Sign-In as SuperAdmin".'
        );
      } else {
        setAuthError(errorObj.message || 'Authentication failed. Please check network and try again.');
      }
    }
  };

  const handleForgotPassword = async () => {
    const email = getValues('email');
    if (!email || !email.includes('@')) {
      setAuthError('Please enter your email address in the field above to receive a reset link.');
      return;
    }
    try {
      setIsResetting(true);
      setAuthError(null);
      await resetPassword(email);
      setResetSent(true);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setAuthError(errorObj.message || 'Failed to send password reset email.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.iconWrapper} aria-hidden="true">
            <Fingerprint size={28} />
          </div>
          <h1 className={styles.title}>Administrator Login</h1>
          <p className={styles.subtitle}>Smart Attendance Management Dashboard</p>
        </div>

        {authError && (
          <div className={styles.alertError} role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{authError}</span>
          </div>
        )}

        {resetSent && (
          <div className={styles.alertSuccess} role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>Password reset instructions sent to your email.</span>
          </div>
        )}

        <div className={styles.demoBanner}>
          <div>
            <strong>SuperAdmin Dev Credentials:</strong>
            <code>admin@attendance.local</code> / <code>AdminPass123!</code>
          </div>
          <button
            type="button"
            className={styles.demoBtn}
            onClick={handleQuickLogin}
          >
            ⚡ Quick Sign-In as SuperAdmin
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
          <Input
            label="Administrator Email"
            type="email"
            placeholder="admin@institution.edu"
            isRequired
            autoComplete="email"
            leftIcon={<Mail size={16} />}
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter password"
            isRequired
            autoComplete="current-password"
            leftIcon={<Lock size={16} />}
            error={errors.password?.message}
            {...register('password')}
          />

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.forgotBtn}
              onClick={handleForgotPassword}
              disabled={isResetting}
            >
              {isResetting ? 'Sending reset link...' : 'Forgot password?'}
            </button>
          </div>

          <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting}>
            Sign In to Dashboard
          </Button>
        </form>

        <div className={styles.footer}>
          Authorized personnel only. All access is logged and audited.
        </div>
      </div>
    </div>
  );
};
