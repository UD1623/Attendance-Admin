import { describe, it, expect, beforeEach } from 'vitest';
import { createMockFirestore } from './mockFirestore';
import {
  correctAttendanceRecord,
  createManualAttendanceRecord,
} from '../services/recordService';

describe('recordService', () => {
  let db: any;
  const adminActor = {
    uid: 'admin_test_uid',
    email: 'admin@attendance.local',
  };

  beforeEach(async () => {
    db = createMockFirestore();

    // Seed student
    await db.collection('students').doc('std_101').set({
      studentId: 'std_101',
      fullName: 'Aarav Sharma',
      rollNumber: 'CS-2024-001',
      classId: 'class_ce_5a',
      className: 'Computer Engineering - Semester 5 - Div A',
    });

    // Seed existing attendance record
    await db.collection('attendance').doc('std_101_sess_01').set({
      attendanceId: 'std_101_sess_01',
      studentId: 'std_101',
      sessionId: 'sess_01',
      classId: 'class_ce_5a',
      subjectId: 'sub_os',
      lectureDate: '2026-10-20',
      status: 'Late',
      capturedAt: '2026-10-20T09:25:00.000Z',
    });
  });

  describe('correctAttendanceRecord', () => {
    it('successfully corrects attendance status and writes an audit log', async () => {
      const result = await correctAttendanceRecord(
        db,
        {
          attendanceId: 'std_101_sess_01',
          newStatus: 'Excused',
          reason: 'Medical certificate submitted and verified by HOD.',
        },
        adminActor
      );

      expect(result.status).toBe('Excused');
      expect(result.correctedBy).toBe('admin@attendance.local');
      expect(result.correctionReason).toContain('Medical certificate submitted');

      // Verify database doc updated
      const updatedDoc = await db.collection('attendance').doc('std_101_sess_01').get();
      expect(updatedDoc.data().status).toBe('Excused');
      expect(updatedDoc.data().previousStatus).toBe('Late');

      // Verify audit log created
      const auditSnap = await db.collection('auditLogs').get();
      expect(auditSnap.empty).toBe(false);
      const log = auditSnap.docs[0].data();
      expect(log.action).toBe('ATTENDANCE_RECORD_CORRECTED');
      expect(log.targetId).toBe('std_101_sess_01');
      expect(log.details.previousStatus).toBe('Late');
      expect(log.details.newStatus).toBe('Excused');
    });

    it('rejects correction if justification reason is missing or too short', async () => {
      await expect(
        correctAttendanceRecord(
          db,
          {
            attendanceId: 'std_101_sess_01',
            newStatus: 'Present',
            reason: 'ok', // too short
          },
          adminActor
        )
      ).rejects.toThrow('Mandatory justification reason required');
    });

    it('rejects correction if record does not exist', async () => {
      await expect(
        correctAttendanceRecord(
          db,
          {
            attendanceId: 'non_existent_rec',
            newStatus: 'Present',
            reason: 'Valid justification reason provided.',
          },
          adminActor
        )
      ).rejects.toThrow('not found');
    });
  });

  describe('createManualAttendanceRecord', () => {
    it('creates manual attendance entry with mandatory justification and audit trail', async () => {
      const created = await createManualAttendanceRecord(
        db,
        {
          studentId: 'std_101',
          sessionId: 'sess_manual_02',
          classId: 'class_ce_5a',
          subjectId: 'sub_cn',
          lectureDate: '2026-10-20',
          status: 'Present',
          reason: 'Hardware scanner battery died; attendance verified manually by Prof. Alan.',
        },
        adminActor
      );

      expect(created.attendanceId).toBe('std_101_sess_manual_02');
      expect(created.status).toBe('Present');
      expect(created.deviceId).toBe('MANUAL_ENTRY');

      // Verify doc in firestore
      const doc = await db.collection('attendance').doc('std_101_sess_manual_02').get();
      expect(doc.exists).toBe(true);
      expect(doc.data().isManualEntry).toBe(true);
      expect(doc.data().studentName).toBe('Aarav Sharma');

      // Verify audit log
      const auditSnap = await db
        .collection('auditLogs')
        .where('action', '==', 'ATTENDANCE_RECORD_CREATED_MANUAL')
        .get();
      expect(auditSnap.empty).toBe(false);
    });
  });
});
