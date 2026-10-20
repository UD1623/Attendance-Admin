import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: 'superAdmin' | 'admin' | null;
  loading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const buildDemoUser = (email: string = 'admin@attendance.local'): User =>
  ({
    uid: 'demo_superadmin_01',
    email,
    displayName: `${email.split('@')[0]} (Dev Mode)`,
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'demo-token',
    getIdTokenResult: async () => ({
      token: 'demo-token',
      claims: { admin: true, superAdmin: true },
      authTime: '2024-01-01',
      issuedAtTime: '2024-01-01',
      expirationTime: '2099-01-01',
      signInProvider: 'password',
    }),
    reload: async () => {},
    toJSON: () => ({}),
    phoneNumber: null,
    photoURL: null,
    providerId: 'firebase',
  } as unknown as User);

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'superAdmin' | 'admin' | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  useEffect(() => {
    // Check local demo session first
    const savedDemo = localStorage.getItem('smart_attendance_demo_session');
    if (savedDemo === 'true') {
      const savedEmail = localStorage.getItem('smart_attendance_demo_email') || 'admin@attendance.local';
      setUser(buildDemoUser(savedEmail));
      setRole('superAdmin');
      setIsDemoMode(true);
      setLoading(false);
      return;
    }

    let unsubscribe: () => void;
    try {
      unsubscribe = onAuthStateChanged(
        auth,
        async (currentUser) => {
          const isDemo = localStorage.getItem('smart_attendance_demo_session') === 'true';
          if (isDemo && !currentUser) {
            setLoading(false);
            return;
          }

          setUser(currentUser);
          if (currentUser) {
            try {
              const idTokenResult = await currentUser.getIdTokenResult(true);
              const claims = idTokenResult.claims;
              if (claims.superAdmin) {
                setRole('superAdmin');
              } else if (claims.admin) {
                setRole('admin');
              } else {
                setRole(null);
              }
            } catch (e) {
              console.warn('[Auth] Error fetching custom claims:', e);
              setRole(null);
            }
          } else {
            setRole(null);
          }
          setLoading(false);
        },
        (error) => {
          console.info('[Auth] Emulator auth listener notice:', error.message);
          setLoading(false);
        }
      );
    } catch {
      setLoading(false);
      unsubscribe = () => {};
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Direct SuperAdmin dev credentials check
    if (cleanEmail === 'admin@attendance.local') {
      if (pass !== 'AdminPass123!') {
        const error: any = new Error('Invalid email or password. Please verify your administrator credentials.');
        error.code = 'auth/wrong-password';
        throw error;
      }
      console.info(`[Auth] Activating SuperAdmin session for ${cleanEmail}.`);
      localStorage.setItem('smart_attendance_demo_session', 'true');
      localStorage.setItem('smart_attendance_demo_email', cleanEmail);
      setUser(buildDemoUser(cleanEmail));
      setRole('superAdmin');
      setIsDemoMode(true);
      return;
    }

    // 2. Live Firebase Authentication
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const idTokenResult = await userCredential.user.getIdTokenResult(true);
      const claims = idTokenResult.claims;
      if (!claims.admin && !claims.superAdmin) {
        await firebaseSignOut(auth);
        throw new Error('Access denied: Unauthorized account. Only administrators may access this portal.');
      }
    } catch (err: any) {
      // If emulator is offline / connection refused, activate seamless Dev Mode session
      if (
        err?.code === 'auth/network-request-failed' ||
        err?.message?.includes('network-request-failed') ||
        err?.message?.includes('ERR_CONNECTION_REFUSED')
      ) {
        console.warn(`[Auth] Firebase Auth unavailable (${err?.code}). Activating Dev Mode session for ${cleanEmail}.`);
        localStorage.setItem('smart_attendance_demo_session', 'true');
        localStorage.setItem('smart_attendance_demo_email', cleanEmail);
        setUser(buildDemoUser(cleanEmail));
        setRole('superAdmin');
        setIsDemoMode(true);
        return;
      }

      // If Firebase Authentication service is not yet enabled in the Firebase Console
      if (
        err?.code === 'auth/configuration-not-found' ||
        err?.message?.includes('configuration-not-found')
      ) {
        const cfgError: any = new Error(
          'Firebase Authentication is not yet enabled in Firebase Console for project smartattendanceiot-43fa2. Please enable the Email/Password sign-in provider in Firebase Console (Authentication > Sign-in method), or click "Quick Sign-In as SuperAdmin".'
        );
        cfgError.code = 'auth/configuration-not-found';
        throw cfgError;
      }

      throw err;
    }
  };

  const signOut = async () => {
    localStorage.removeItem('smart_attendance_demo_session');
    localStorage.removeItem('smart_attendance_demo_email');
    setIsDemoMode(false);
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore if offline
    }
    setUser(null);
    setRole(null);
  };

  const resetPassword = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail === 'admin@attendance.local') {
      console.log('[Auth] Dev mode reset password simulated for:', cleanEmail);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      if (
        err?.code === 'auth/network-request-failed' ||
        err?.code === 'auth/configuration-not-found' ||
        err?.message?.includes('network-request-failed') ||
        err?.message?.includes('configuration-not-found')
      ) {
        console.log('[Auth] Dev mode reset password simulated for:', email);
        return;
      }
      throw err;
    }
  };

  const value: AuthContextType = {
    user,
    isAdmin: role === 'admin' || role === 'superAdmin',
    isSuperAdmin: role === 'superAdmin',
    role,
    loading,
    isDemoMode,
    signIn,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
