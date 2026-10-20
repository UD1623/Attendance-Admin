import { describe, it, expect, beforeEach } from 'vitest';
import { createMockFirestore } from './mockFirestore';
import {
  requestEnrollment,
  cancelEnrollment,
  processEnrollmentResult,
} from '../services/enrollmentService';

describe('enrollmentService', () => {
  let db: any;
  const actor = { uid: 'admin_1', email: 'admin@college.edu' };

  beforeEach(() => {
    db = createMockFirestore();
    // Seed student
    db.collection('students').doc('student_1').set({
      studentId: 'student_1',
      fullName: 'Alice Johnson',
      rollNumber: 'CS-101',
      classId: 'class_1',
      active: true,
      fingerprintRef: null,
    });
  });

  it('creates an enrollment request with pending status', async () => {
    const req = await requestEnrollment(
      db,
      {
        studentId: 'student_1',
        deviceId: 'ESP32-READER-01',
      },
      actor
    );

    expect(req).toBeDefined();
    expect(req.status).toBe('pending');
    expect(req.studentName).toBe('Alice Johnson');

    const snap = await db.collection('enrollmentRequests').doc(req.requestId).get();
    expect(snap.exists).toBe(true);
    expect(snap.data().status).toBe('pending');
  });

  it('prevents multiple active enrollment requests for the same student', async () => {
    await requestEnrollment(
      db,
      {
        studentId: 'student_1',
        deviceId: 'ESP32-READER-01',
      },
      actor
    );

    await expect(
      requestEnrollment(
        db,
        {
          studentId: 'student_1',
          deviceId: 'ESP32-READER-01',
        },
        actor
      )
    ).rejects.toThrow(/already active/);
  });

  it('cancels an active enrollment request', async () => {
    const req = await requestEnrollment(
      db,
      {
        studentId: 'student_1',
        deviceId: 'ESP32-READER-01',
      },
      actor
    );

    await cancelEnrollment(db, req.requestId, actor);

    const snap = await db.collection('enrollmentRequests').doc(req.requestId).get();
    expect(snap.data().status).toBe('cancelled');
  });

  it('completes enrollment and updates student with biometric slot reference', async () => {
    const req = await requestEnrollment(
      db,
      {
        studentId: 'student_1',
        deviceId: 'ESP32-READER-01',
      },
      actor
    );

    await processEnrollmentResult(
      db,
      {
        requestId: req.requestId,
        status: 'success',
        fingerprintRef: 42,
      },
      actor
    );

    // Verify request updated
    const reqSnap = await db.collection('enrollmentRequests').doc(req.requestId).get();
    expect(reqSnap.data().status).toBe('completed');
    expect(reqSnap.data().fingerprintRef).toBe(42);

    // Verify student updated
    const studentSnap = await db.collection('students').doc('student_1').get();
    expect(studentSnap.data().fingerprintRef).toBe(42);
  });

  it('rejects invalid fingerprintRef out of range', async () => {
    const req = await requestEnrollment(
      db,
      {
        studentId: 'student_1',
        deviceId: 'ESP32-READER-01',
      },
      actor
    );

    await expect(
      processEnrollmentResult(
        db,
        {
          requestId: req.requestId,
          status: 'success',
          fingerprintRef: 9999, // out of range 1..1000
        },
        actor
      )
    ).rejects.toThrow(/Invalid fingerprint slot reference/);
  });
});
