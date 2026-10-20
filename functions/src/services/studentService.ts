import * as admin from 'firebase-admin';
import { Student } from '../shared/types';
import { writeAuditLog } from './auditService';

export interface RegisterStudentInput {
  fullName: string;
  rollNumber: string;
  classId: string;
}

export interface UpdateStudentInput {
  studentId: string;
  fullName: string;
  rollNumber: string;
  classId: string;
  active: boolean;
}

export interface ActorInfo {
  uid: string;
  email: string;
}

export async function registerStudent(
  db: admin.firestore.Firestore,
  input: RegisterStudentInput,
  actor: ActorInfo
): Promise<Student> {
  const fullName = input.fullName?.trim();
  const rollNumber = input.rollNumber?.trim().toUpperCase();
  const classId = input.classId?.trim();

  if (!fullName || fullName.length < 2) {
    throw new Error('Full name is required and must be at least 2 characters.');
  }
  if (!rollNumber || rollNumber.length < 2) {
    throw new Error('Roll number is required and must be at least 2 characters.');
  }
  if (!classId) {
    throw new Error('Class ID is required.');
  }

  // Verify class exists
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) {
    throw new Error(`Academic class with ID '${classId}' does not exist.`);
  }
  const classData = classSnap.data();

  // Check unique roll number
  const existingRollSnap = await db
    .collection('students')
    .where('rollNumber', '==', rollNumber)
    .where('active', '==', true)
    .get();

  if (!existingRollSnap.empty) {
    throw new Error(`Student with Roll Number '${rollNumber}' is already registered and active.`);
  }

  const studentRef = db.collection('students').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const newStudent: Student = {
    studentId: studentRef.id,
    fullName,
    rollNumber,
    classId,
    className: classData?.name || '',
    active: true,
    fingerprintRef: null,
    createdAt: now,
    updatedAt: now,
  };

  await studentRef.set(newStudent);

  await writeAuditLog(db, {
    action: 'STUDENT_REGISTERED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'student',
    targetId: studentRef.id,
    details: {
      fullName,
      rollNumber,
      classId,
      className: classData?.name,
    },
  });

  return newStudent;
}

export async function updateStudent(
  db: admin.firestore.Firestore,
  input: UpdateStudentInput,
  actor: ActorInfo
): Promise<void> {
  const { studentId } = input;
  const fullName = input.fullName?.trim();
  const rollNumber = input.rollNumber?.trim().toUpperCase();
  const classId = input.classId?.trim();

  if (!studentId) {
    throw new Error('Student ID is required.');
  }
  if (!fullName || fullName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }
  if (!rollNumber || rollNumber.length < 2) {
    throw new Error('Roll number must be at least 2 characters.');
  }
  if (!classId) {
    throw new Error('Class ID is required.');
  }

  const studentRef = db.collection('students').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) {
    throw new Error(`Student with ID '${studentId}' was not found.`);
  }

  // Check if roll number changed and if it is taken by another active student
  const existingRollSnap = await db
    .collection('students')
    .where('rollNumber', '==', rollNumber)
    .where('active', '==', true)
    .get();

  const isDuplicate = existingRollSnap.docs.some((doc) => doc.id !== studentId);
  if (isDuplicate) {
    throw new Error(`Roll number '${rollNumber}' is already taken by another active student.`);
  }

  // Verify class
  const classSnap = await db.collection('classes').doc(classId).get();
  const className = classSnap.exists ? classSnap.data()?.name || '' : '';

  await studentRef.update({
    fullName,
    rollNumber,
    classId,
    className,
    active: input.active,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog(db, {
    action: 'STUDENT_UPDATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'student',
    targetId: studentId,
    details: {
      fullName,
      rollNumber,
      classId,
      active: input.active,
    },
  });
}

export async function deleteStudent(
  db: admin.firestore.Firestore,
  studentId: string,
  actor: ActorInfo
): Promise<void> {
  const studentRef = db.collection('students').doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) {
    throw new Error(`Student with ID '${studentId}' does not exist.`);
  }

  const studentData = studentSnap.data() as Student;

  await studentRef.delete();

  await writeAuditLog(db, {
    action: 'STUDENT_DELETED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'student',
    targetId: studentId,
    details: {
      fullName: studentData.fullName,
      rollNumber: studentData.rollNumber,
      freedFingerprintRef: studentData.fingerprintRef,
    },
  });
}
