import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyATFeNFWxNvWFNMqPaqAlmOzvm84ajTDaw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'smartattendanceiot-43fa2.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://smartattendanceiot-43fa2-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'smartattendanceiot-43fa2',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'smartattendanceiot-43fa2.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '366229227371',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:366229227371:web:a54d7329b52270e0ee6e2e',
};

// Initialize Firebase singleton
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const rtdb = getDatabase(app);

// Connect to Local Emulator Suite strictly when explicitly set in environment
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

let emulatorsConnected = false;

export function initEmulators() {
  if (useEmulators && !emulatorsConnected) {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectFunctionsEmulator(functions, 'localhost', 5001);
      connectDatabaseEmulator(rtdb, 'localhost', 9000);
      emulatorsConnected = true;
      console.log('Connected to Firebase Local Emulator Suite (Auth: 9099, Firestore: 8080, Functions: 5001, RTDB: 9000)');
    } catch (e) {
      console.warn('Firebase emulator connection note:', e);
    }
  }
}

// Auto-run on import in browser
if (typeof window !== 'undefined') {
  initEmulators();
}
