import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { AttendanceRecord } from '../shared/types';
import { writeAuditLog } from './auditService';

export interface CorrectRecordInput {
  attendanceId: string;
  newStatus: 'Present' | 'Late' | 'Absent' | 'Excused';
  reason: string;
}

export interface ManualRecordInput {
  studentId: string;
  sessionId: string;
  classId: string;
  subjectId: string;
  lectureDate: string;
  status: 'Present' | 'Late' | 'Absent' | 'Excused';
  reason: string;
}

export interface ActorInfo {
  uid: string;
  email: string;
}

/**
 * Manually corrects an existing attendance record with mandatory audit trail
 */
export async function correctAttendanceRecord(
  db: Firestore,
  input: CorrectRecordInput,
  actor: ActorInfo
): Promise<AttendanceRecord> {
  const { attendanceId, newStatus, reason } = input;

  if (!attendanceId) {
    throw new Error('Attendance Record ID is required.');
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error('Mandatory justification reason required (minimum 5 characters).');
  }

  const validStatuses = ['Present', 'Late', 'Absent', 'Excused'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Must be one of ${validStatuses.join(', ')}.`);
  }

  const recordRef = db.collection('attendance').doc(attendanceId);
  const doc = await recordRef.get();

  if (!doc.exists) {
    throw new Error(`Attendance record with ID ${attendanceId} not found.`);
  }

  const currentData = doc.data() as AttendanceRecord;
  const previousStatus = currentData.status;

  // Update record with correction metadata
  await recordRef.update({
    status: newStatus,
    previousStatus,
    correctedBy: actor.email,
    correctedByUid: actor.uid,
    correctionReason: reason.trim(),
    correctedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Write immutable audit log entry
  await writeAuditLog(db as any, {
    action: 'ATTENDANCE_RECORD_CORRECTED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'attendance',
    targetId: attendanceId,
    details: {
      studentId: currentData.studentId,
      sessionId: currentData.sessionId,
      previousStatus,
      newStatus,
      reason: reason.trim(),
    },
  });

  const updatedDoc = await recordRef.get();
  return { ...updatedDoc.data(), attendanceId } as AttendanceRecord;
}

/**
 * Creates a manual attendance entry when a device scan was not captured (e.g. excused absence or manual verification)
 */
export async function createManualAttendanceRecord(
  db: Firestore,
  input: ManualRecordInput,
  actor: ActorInfo
): Promise<AttendanceRecord> {
  const { studentId, sessionId, classId, subjectId, lectureDate, status, reason } = input;

  if (!studentId || !sessionId || !classId || !subjectId || !lectureDate) {
    throw new Error('studentId, sessionId, classId, subjectId, and lectureDate are all required.');
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error('Mandatory institutional justification reason required (minimum 5 characters).');
  }

  // Lookup student details
  const studentDoc = await db.collection('students').doc(studentId).get();
  const studentData = studentDoc.exists ? studentDoc.data() : null;

  const attendanceId = `${studentId}_${sessionId}`;
  const recordRef = db.collection('attendance').doc(attendanceId);

  const newRecord: AttendanceRecord = {
    attendanceId,
    studentId,
    sessionId,
    classId,
    subjectId,
    lectureDate,
    status,
    capturedAt: new Date().toISOString(),
    receivedAt: FieldValue.serverTimestamp(),
    processedAt: FieldValue.serverTimestamp(),
    deviceId: 'MANUAL_ENTRY',
    eventId: `manual_${Date.now()}`,
    correctedBy: actor.email,
    correctionReason: reason.trim(),
  };

  await recordRef.set(
    {
      ...newRecord,
      studentName: studentData?.fullName || 'Manual Record',
      rollNumber: studentData?.rollNumber || '',
      className: studentData?.className || '',
      correctedByUid: actor.uid,
      isManualEntry: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Write audit log
  await writeAuditLog(db as any, {
    action: 'ATTENDANCE_RECORD_CREATED_MANUAL',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'attendance',
    targetId: attendanceId,
    details: {
      studentId,
      sessionId,
      classId,
      subjectId,
      status,
      reason: reason.trim(),
    },
  });

  return newRecord;
}
