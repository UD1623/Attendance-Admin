import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { rtdb } from './firebase';
import { RtdbAttendanceRecord } from '@/types';

export interface UseRtdbAttendanceResult {
  records: RtdbAttendanceRecord[];
  loading: boolean;
  isConnected: boolean;
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'error';
  error: string | null;
  testConnection: () => Promise<{ success: boolean; message: string }>;
}

/**
 * Real-time attendance hook subscribing to Firebase Realtime Database path `/attendance/{recordId}`
 * and built-in `.info/connected` connection state monitor.
 */
export function useRtdbAttendance(): UseRtdbAttendanceResult {
  const [records, setRecords] = useState<RtdbAttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);

  // 1. Monitor Realtime Database Connection State via `.info/connected`
  useEffect(() => {
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribeConnected = onValue(
      connectedRef,
      (snapshot) => {
        const connected = snapshot.val() === true;
        setIsConnected(connected);
        setConnectionState(connected ? 'connected' : 'disconnected');
      },
      (err) => {
        console.warn('[RTDB .info/connected error]:', err);
        setIsConnected(false);
        setConnectionState('error');
        setError(err.message || 'Realtime Database connection failed');
      }
    );

    return () => unsubscribeConnected();
  }, []);

  // 2. Real-time Attendance Records Listener on `/attendance`
  useEffect(() => {
    setLoading(true);
    const attendanceRef = ref(rtdb, 'attendance');

    const unsubscribeAttendance = onValue(
      attendanceRef,
      (snapshot) => {
        try {
          if (!snapshot.exists()) {
            // Database path is currently empty
            setRecords([]);
            setLoading(false);
            return;
          }

          const rawData = snapshot.val();
          const parsedRecords: RtdbAttendanceRecord[] = [];

          // Process push ID map
          Object.keys(rawData).forEach((key) => {
            const item = rawData[key];
            if (item && typeof item === 'object') {
              parsedRecords.push({
                recordId: key,
                studentId: String(item.studentId || ''),
                fingerprintId: typeof item.fingerprintId === 'number' ? item.fingerprintId : parseInt(item.fingerprintId || '0', 10),
                timestamp: item.timestamp ?? Date.now(),
                status: String(item.status || 'Present'),
                deviceId: String(item.deviceId || 'ESP32-READER'),
              });
            }
          });

          // Sort descending by timestamp (newest scans at the top)
          parsedRecords.sort((a, b) => {
            const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
            const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
            return (timeB || 0) - (timeA || 0);
          });

          setRecords(parsedRecords);
          setError(null);
        } catch (err: any) {
          console.error('[RTDB attendance parse error]:', err);
          setError(err.message || 'Error parsing attendance records');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error('[RTDB onValue attendance error]:', err);
        setError(err.message || 'Failed to read /attendance path. Check database security rules.');
        setLoading(false);
      }
    );

    return () => unsubscribeAttendance();
  }, []);

  // 3. Safe, non-destructive connection probe (no test records inserted)
  const testConnection = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      // Probe .info/connected and /attendance with a read-only get()
      const connectedSnap = await get(ref(rtdb, '.info/connected'));
      const isOnline = connectedSnap.val() === true;

      const attendanceSnap = await get(ref(rtdb, 'attendance'));
      const count = attendanceSnap.exists() ? Object.keys(attendanceSnap.val()).length : 0;

      return {
        success: true,
        message: `Connected to smartattendanceiot-43fa2 successfully! (${isOnline ? 'Online' : 'Reachable'}, ${count} attendance records found)`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `RTDB Connection probe failed: ${err.message || 'Unknown error'}. Verify security rules or database URL.`,
      };
    }
  }, []);

  return {
    records,
    loading,
    isConnected,
    connectionState,
    error,
    testConnection,
  };
}
