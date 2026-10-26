import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { rtdb } from './firebase';
import { RtdbAttendanceRecord } from '@/types';

export interface RtdbDevice {
  deviceId: string;
  freeHeap?: number;
  lastHeartbeat?: number | string;
  sensorStatus?: string;
  status?: string;
  wifiSignalRssi?: number;
}

export interface UseRtdbAttendanceResult {
  records: RtdbAttendanceRecord[];
  devices: Record<string, RtdbDevice>;
  loading: boolean;
  isConnected: boolean;
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'error';
  error: string | null;
  testConnection: () => Promise<{ success: boolean; message: string }>;
}

/**
 * Real-time attendance hook subscribing to Firebase Realtime Database paths `/attendance`
 * and `/devices`, along with built-in `.info/connected` connection state monitor.
 */
export function useRtdbAttendance(): UseRtdbAttendanceResult {
  const [records, setRecords] = useState<RtdbAttendanceRecord[]>([]);
  const [devices, setDevices] = useState<Record<string, RtdbDevice>>({});
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

  // 2. Real-time Devices Listener on `/devices`
  useEffect(() => {
    const devicesRef = ref(rtdb, 'devices');
    const unsubscribeDevices = onValue(
      devicesRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setDevices({});
          return;
        }
        const raw = snapshot.val() || {};
        const parsed: Record<string, RtdbDevice> = {};
        Object.keys(raw).forEach((devId) => {
          parsed[devId] = {
            deviceId: devId,
            ...(typeof raw[devId] === 'object' ? raw[devId] : {}),
          };
        });
        setDevices(parsed);
      },
      (err) => {
        console.warn('[RTDB onValue devices warning]:', err);
      }
    );

    return () => unsubscribeDevices();
  }, []);

  // 3. Real-time Attendance Records Listener on `/attendance`
  useEffect(() => {
    setLoading(true);
    const attendanceRef = ref(rtdb, 'attendance');

    const unsubscribeAttendance = onValue(
      attendanceRef,
      (snapshot) => {
        try {
          if (!snapshot.exists()) {
            setRecords([]);
            setLoading(false);
            return;
          }

          const rawData = snapshot.val();
          const parsedRecords: RtdbAttendanceRecord[] = [];

          // Process push ID map or array
          Object.keys(rawData).forEach((key) => {
            const item = rawData[key];
            if (item && typeof item === 'object') {
              // Parse fingerprint ID flexibly across various naming conventions
              const rawFp =
                item.fingerprintId ??
                item.fingerprintRef ??
                item.finger_id ??
                item.fingerprint_id ??
                item.slot ??
                item.id ??
                0;
              const fpId = typeof rawFp === 'number' ? rawFp : parseInt(String(rawFp || '0'), 10) || 0;

              // Parse timestamp (seconds vs milliseconds vs string)
              let ts = item.timestamp ?? item.time ?? item.capturedAt ?? item.dateTime ?? Date.now();
              if (typeof ts === 'number' && ts < 10000000000) {
                ts = ts * 1000;
              } else if (typeof ts === 'string') {
                const parsedDate = new Date(ts).getTime();
                if (!isNaN(parsedDate)) ts = parsedDate;
              }

              parsedRecords.push({
                recordId: key,
                studentId: String(item.studentId || item.student_id || item.rollNumber || item.roll_no || item.student || ''),
                fingerprintId: fpId,
                timestamp: ts,
                status: String(item.status || 'Present'),
                deviceId: String(item.deviceId || item.device_id || item.device || 'ESP32-READER-01'),
                correctedBy: item.correctedBy,
                correctionReason: item.correctionReason,
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

  // 4. Safe, non-destructive connection probe (without invalid token queries)
  const testConnection = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      // Query the /attendance and /devices nodes with read-only get()
      const attendanceSnap = await get(ref(rtdb, 'attendance'));
      const count = attendanceSnap.exists() ? Object.keys(attendanceSnap.val()).length : 0;

      const devicesSnap = await get(ref(rtdb, 'devices'));
      const deviceCount = devicesSnap.exists() ? Object.keys(devicesSnap.val()).length : 0;

      return {
        success: true,
        message: `Connected to smartattendanceiot-43fa2 Realtime Database! (${count} scan record${count === 1 ? '' : 's'}, ${deviceCount} device${deviceCount === 1 ? '' : 's'} active)`,
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
    devices,
    loading,
    isConnected,
    connectionState,
    error,
    testConnection,
  };
}
