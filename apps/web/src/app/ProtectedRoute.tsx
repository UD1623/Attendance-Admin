import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireSuperAdmin = false,
}) => {
  const { user, isAdmin, isSuperAdmin, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--color-page-bg)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
          aria-label="Loading authentication state"
        />
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Verifying security credentials...
        </span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: 'var(--color-page-bg)',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-error-border)',
            borderRadius: 'var(--radius-xl)',
            padding: '32px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <ShieldAlert size={24} />
          </div>
          <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: '8px' }}>Access Denied</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
            Your account ({user.email}) does not have active administrator claims assigned. Please contact the system SuperAdmin.
          </p>
          <Button variant="secondary" onClick={signOut} leftIcon={<LogOut size={16} />}>
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return (
      <div style={{ padding: '32px' }}>
        <h2>SuperAdmin Privileges Required</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>
          This section is restricted to Super Administrators.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
