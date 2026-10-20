import * as admin from 'firebase-admin';
import { EnrollmentRequest, Student } from '../shared/types';
import { writeAuditLog } from './auditService';
import { ActorInfo } from './studentService';

export interface RequestEnrollmentInput {
  studentId: string;
  deviceId: string;
}

export interface EnrollmentResultInput {
  requestId: string;
  status: 'success' | 'failed';
  fingerprintRef?: number;
  errorMessage?: string;
}

export async function requestEnrollment(
  db: admin.firestore.Firestore,
  input: RequestEnrollmentInput,
  actor: ActorInfo
): Promise<EnrollmentRequest> {
  const { studentId, deviceId } = input;
  if (!studentId) {
    throw new Error('Student ID is required.');
  }
  if (!deviceId) {
    throw new Error('Device ID is required.');
  }

  // Verify student exists and is active
  const studentDoc = await db.collection('students').doc(studentId).get();
  if (!studentDoc.exists) {
    throw new Error(`Student '${studentId}' was not found.`);
  }
  const student = studentDoc.data() as Student;
  if (!student.active) {
    throw new Error(`Cannot enroll inactive student '${student.fullName}'.`);
  }

  // Check if there is an active pending enrollment for this student
  const pendingRequests = await db
    .collection('enrollmentRequests')
    .where('studentId', '==', studentId)
    .where('status', 'in', ['pending', 'in_progress'])
    .get();

  if (!pendingRequests.empty) {
    throw new Error(
      `An enrollment request is already active for student '${student.fullName}' (ID: ${pendingRequests.docs[0].id}).`
    );
  }

  const requestRef = db.collection('enrollmentRequests').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const enrollmentReq: EnrollmentRequest = {
    requestId: requestRef.id,
    studentId,
    studentName: student.fullName,
    rollNumber: student.rollNumber,
    classId: student.classId,
    deviceId,
    status: 'pending',
    fingerprintRef: null,
    createdAt: now,
    updatedAt: now,
  };

  await requestRef.set(enrollmentReq);

  await writeAuditLog(db, {
    action: 'ENROLLMENT_REQUESTED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'enrollmentRequest',
    targetId: requestRef.id,
    details: {
      studentId,
      studentName: student.fullName,
      rollNumber: student.rollNumber,
      deviceId,
    },
  });

  return enrollmentReq;
}

export async function cancelEnrollment(
  db: admin.firestore.Firestore,
  requestId: string,
  actor: ActorInfo
): Promise<void> {
  const reqRef = db.collection('enrollmentRequests').doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    throw new Error(`Enrollment request '${requestId}' not found.`);
  }

  const reqData = reqSnap.data() as EnrollmentRequest;
  if (reqData.status === 'completed') {
    throw new Error('Cannot cancel a completed enrollment request.');
  }

  await reqRef.update({
    status: 'cancelled',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog(db, {
    action: 'ENROLLMENT_CANCELLED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'enrollmentRequest',
    targetId: requestId,
    details: {
      studentId: reqData.studentId,
      deviceId: reqData.deviceId,
    },
  });
}

export async function processEnrollmentResult(
  db: admin.firestore.Firestore,
  input: EnrollmentResultInput,
  actor: ActorInfo
): Promise<void> {
  const { requestId, status, fingerprintRef, errorMessage } = input;
  const reqRef = db.collection('enrollmentRequests').doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    throw new Error(`Enrollment request '${requestId}' does not exist.`);
  }

  const reqData = reqSnap.data() as EnrollmentRequest;
  if (reqData.status === 'completed') {
    throw new Error(`Enrollment request '${requestId}' is already completed.`);
  }

  if (status === 'success') {
    if (typeof fingerprintRef !== 'number' || fingerprintRef < 1 || fingerprintRef > 1000) {
      throw new Error(
        `Invalid fingerprint slot reference: '${fingerprintRef}'. Must be an integer between 1 and 1000.`
      );
    }

    // Check if slot reference is already used by another active student
    const existingSlotSnap = await db
      .collection('students')
      .where('fingerprintRef', '==', fingerprintRef)
      .where('active', '==', true)
      .get();

    const isSlotTaken = existingSlotSnap.docs.some((doc) => doc.id !== reqData.studentId);
    if (isSlotTaken) {
      throw new Error(
        `Biometric slot #${fingerprintRef} is already assigned to another active student.`
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.update(reqRef, {
      status: 'completed',
      fingerprintRef,
      completedAt: now,
      updatedAt: now,
    });

    const studentRef = db.collection('students').doc(reqData.studentId);
    batch.update(studentRef, {
      fingerprintRef,
      updatedAt: now,
    });

    await batch.commit();

    await writeAuditLog(db, {
      action: 'ENROLLMENT_COMPLETED',
      actorUid: actor.uid,
      actorEmail: actor.email,
      targetType: 'student',
      targetId: reqData.studentId,
      details: {
        requestId,
        studentName: reqData.studentName,
        rollNumber: reqData.rollNumber,
        fingerprintRef,
        deviceId: reqData.deviceId,
      },
    });
  } else {
    await reqRef.update({
      status: 'failed',
      errorMessage: errorMessage || 'Device failed to capture fingerprint template.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAuditLog(db, {
      action: 'ENROLLMENT_FAILED',
      actorUid: actor.uid,
      actorEmail: actor.email,
      targetType: 'enrollmentRequest',
      targetId: requestId,
      details: {
        studentId: reqData.studentId,
        errorMessage: errorMessage || 'Device failed to capture fingerprint template.',
      },
    });
  }
}
