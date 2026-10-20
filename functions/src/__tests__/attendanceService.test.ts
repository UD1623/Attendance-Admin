import { describe, it, expect, beforeEach } from 'vitest';
import { createMockFirestore } from './mockFirestore';
import {
  computeSignature,
  verifyDeviceSignature,
  validateClockDrift,
  processDeviceScan,
  processDeviceHeartbeat,
} from '../services/attendanceService';

describe('attendanceService', () => {
  let db: any;

  beforeEach(async () => {
    db = createMockFirestore();

    // Seed test device
    await db.collection('devices').doc('ESP32-READER-01').set({
      deviceId: 'ESP32-READER-01',
      deviceName: 'Main Entrance Hall Gate A',
      presharedSecret: 'dev-secret-key-123',
      secretHash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
      active: true,
      status: 'online',
    });

    // Seed test student
    await db.collection('students').doc('std_101').set({
      studentId: 'std_101',
      fullName: 'Aarav Sharma',
      rollNumber: 'CS-2024-001',
      classId: 'class_ce_5a',
      className: 'Computer Engineering - Semester 5 - Div A',
      fingerprintRef: 1,
      active: true,
    });

    // Seed test timetable entry (Monday 09:00 - 10:00)
    await db.collection('timetable').doc('tt_mon_os_5a').set({
      timetableId: 'tt_mon_os_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_os',
      dayOfWeek: 1, // Monday
      sessionType: 'lecture',
      startTime: '09:00',
      endTime: '10:00',
      attendanceOpensAt: '08:55',
      lateCutoff: '09:10',
      finalDeadline: '10:00',
      room: 'LH-101',
      active: true,
    });

    // Seed test subject
    await db.collection('subjects').doc('sub_os').set({
      subjectId: 'sub_os',
      name: 'Operating Systems',
      code: 'CS501',
      active: true,
    });
  });

  describe('Cryptographic Authentication & Clock Drift', () => {
    it('computes and verifies valid HMAC-SHA256 signature', async () => {
      const deviceId = 'ESP32-READER-01';
      const eventId = 'evt_test_01';
      const timestamp = Math.floor(Date.now() / 1000);
      const rawBody = JSON.stringify({ fingerprintRef: 1 });

      const sigPayload = `${deviceId}:${eventId}:${timestamp}:${rawBody}`;
      const signature = computeSignature('dev-secret-key-123', sigPayload);

      const check = await verifyDeviceSignature(
        db,
        { deviceId, eventId, timestamp, signature },
        rawBody
      );

      expect(check.valid).toBe(true);
      expect(check.deviceData.deviceId).toBe('ESP32-READER-01');
    });

    it('rejects tampered or invalid HMAC signature', async () => {
      const deviceId = 'ESP32-READER-01';
      const eventId = 'evt_test_02';
      const timestamp = Math.floor(Date.now() / 1000);
      const rawBody = JSON.stringify({ fingerprintRef: 1 });

      const check = await verifyDeviceSignature(
        db,
        { deviceId, eventId, timestamp, signature: 'deadbeef1234' },
        rawBody
      );

      expect(check.valid).toBe(false);
      expect(check.error).toContain('Invalid HMAC-SHA256 signature');
    });

    it('validates timestamp within +-120s drift tolerance', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const withinTol = validateClockDrift(nowSec - 30);
      expect(withinTol.valid).toBe(true);

      const exceededTol = validateClockDrift(nowSec - 300);
      expect(exceededTol.valid).toBe(false);
      expect(exceededTol.driftSeconds).toBeGreaterThan(120);
    });
  });

  describe('Authoritative Attendance Policy Ingestion (DEC-004)', () => {
    it('marks attendance as Present when scan is within on-time window (09:05)', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = await processDeviceScan(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'evt_ontime',
          timestamp,
        },
        {
          fingerprintRef: 1,
          testTimeOverride: '09:05',
          testDayOfWeekOverride: 1,
          testDateOverride: '2026-10-20',
        }
      );

      expect(result.status).toBe('success');
      expect(result.result).toBe('Present');
      expect(result.student?.fullName).toBe('Aarav Sharma');
      expect(result.lecture?.subjectName).toBe('Operating Systems');

      // Verify attendance doc written
      const attDoc = await db.collection('attendance').doc('std_101_tt_mon_os_5a_2026-10-20').get();
      expect(attDoc.exists).toBe(true);
      expect(attDoc.data().status).toBe('Present');
    });

    it('marks attendance as Late when scan is after late cutoff (09:20)', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = await processDeviceScan(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'evt_late',
          timestamp,
        },
        {
          fingerprintRef: 1,
          testTimeOverride: '09:20',
          testDayOfWeekOverride: 1,
          testDateOverride: '2026-10-20',
        }
      );

      expect(result.status).toBe('success');
      expect(result.result).toBe('Late');

      const attDoc = await db.collection('attendance').doc('std_101_tt_mon_os_5a_2026-10-20').get();
      expect(attDoc.exists).toBe(true);
      expect(attDoc.data().status).toBe('Late');
    });

    it('rejects scan when too early before attendanceOpensAt (08:50)', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = await processDeviceScan(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'evt_early',
          timestamp,
        },
        {
          fingerprintRef: 1,
          testTimeOverride: '08:50',
          testDayOfWeekOverride: 1,
          testDateOverride: '2026-10-20',
        }
      );

      expect(result.status).toBe('rejected');
      expect(result.result).toBe('Rejected');
      expect(result.message).toContain('Too Early');

      // Ensure no attendance record was written
      const attDoc = await db.collection('attendance').doc('std_101_tt_mon_os_5a_2026-10-20').get();
      expect(attDoc.exists).toBe(false);
    });

    it('rejects scan when after lecture finalDeadline (10:15)', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = await processDeviceScan(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'evt_closed',
          timestamp,
        },
        {
          fingerprintRef: 1,
          testTimeOverride: '10:15',
          testDayOfWeekOverride: 1,
          testDateOverride: '2026-10-20',
        }
      );

      expect(result.status).toBe('rejected');
      expect(result.result).toBe('Rejected');
      expect(result.message).toContain('Session Closed');
    });

    it('rejects unknown fingerprint template slot (slot #99)', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = await processDeviceScan(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'evt_unknown',
          timestamp,
        },
        {
          fingerprintRef: 99,
          testTimeOverride: '09:05',
          testDayOfWeekOverride: 1,
        }
      );

      expect(result.status).toBe('rejected');
      expect(result.result).toBe('Rejected');
      expect(result.message).toContain('not assigned to an active student');
    });
  });

  describe('Concurrency & Idempotency Protection (DEC-005)', () => {
    it('returns Duplicate without overwriting on rapid subsequent scans', async () => {
      const timestamp = Math.floor(Date.now() / 1000);

      // First scan
      const first = await processDeviceScan(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'evt_first',
          timestamp,
        },
        {
          fingerprintRef: 1,
          testTimeOverride: '09:05',
          testDayOfWeekOverride: 1,
          testDateOverride: '2026-10-20',
        }
      );
      expect(first.status).toBe('success');
      expect(first.result).toBe('Present');

      // Second rapid scan for the same lecture
      const second = await processDeviceScan(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'evt_second',
          timestamp,
        },
        {
          fingerprintRef: 1,
          testTimeOverride: '09:06',
          testDayOfWeekOverride: 1,
          testDateOverride: '2026-10-20',
        }
      );

      expect(second.status).toBe('duplicate');
      expect(second.result).toBe('Duplicate');
      expect(second.message).toContain('already recorded');
    });
  });

  describe('Device Heartbeat Telemetry & Pending Enrollment', () => {
    it('updates device heartbeat status and returns queued enrollment request', async () => {
      // Create a pending enrollment request for this device
      await db.collection('enrollmentRequests').doc('req_test_123').set({
        requestId: 'req_test_123',
        deviceId: 'ESP32-READER-01',
        studentId: 'std_102',
        studentName: 'Ananya Patel',
        rollNumber: 'CS-2024-002',
        status: 'pending',
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const res = await processDeviceHeartbeat(
        db,
        {
          deviceId: 'ESP32-READER-01',
          eventId: 'hb_test_01',
          timestamp,
        },
        {
          sensorStatus: 'ok',
          firmwareVersion: 'v1.2.0-esp32',
          wifiSignalRssi: -58,
          freeHeap: 184500,
        }
      );

      expect(res.status).toBe('acknowledged');
      expect(res.pendingEnrollment).toBeDefined();
      expect(res.pendingEnrollment.requestId).toBe('req_test_123');
      expect(res.pendingEnrollment.studentName).toBe('Ananya Patel');

      const devDoc = await db.collection('devices').doc('ESP32-READER-01').get();
      expect(devDoc.data().sensorStatus).toBe('ok');
      expect(devDoc.data().wifiSignalRssi).toBe(-58);
      expect(devDoc.data().status).toBe('online');
    });
  });
});
