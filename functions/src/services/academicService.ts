import * as admin from 'firebase-admin';
import { AcademicClass, Subject } from '../shared/types';
import { writeAuditLog } from './auditService';
import { ActorInfo } from './studentService';

export interface CreateClassInput {
  name: string;
  code: string;
  department: string;
  semester: number;
  academicYear: string;
}

export interface UpdateClassInput extends CreateClassInput {
  classId: string;
  active: boolean;
}

export interface CreateSubjectInput {
  name: string;
  code: string;
  department: string;
}

export interface UpdateSubjectInput extends CreateSubjectInput {
  subjectId: string;
  active: boolean;
}

export async function createClass(
  db: admin.firestore.Firestore,
  input: CreateClassInput,
  actor: ActorInfo
): Promise<AcademicClass> {
  const name = input.name?.trim();
  const code = input.code?.trim().toUpperCase();
  const department = input.department?.trim();
  const semester = Number(input.semester);
  const academicYear = input.academicYear?.trim();

  if (!name) throw new Error('Class name is required.');
  if (!code) throw new Error('Class code is required.');
  if (!department) throw new Error('Department is required.');
  if (isNaN(semester) || semester < 1 || semester > 12) {
    throw new Error('Semester must be an integer between 1 and 12.');
  }

  // Check code uniqueness
  const existingCode = await db.collection('classes').where('code', '==', code).get();
  if (!existingCode.empty) {
    throw new Error(`A class with code '${code}' already exists.`);
  }

  const classRef = db.collection('classes').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const newClass: AcademicClass = {
    classId: classRef.id,
    name,
    code,
    department,
    semester,
    academicYear: academicYear || '2024-2025',
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await classRef.set(newClass);

  await writeAuditLog(db, {
    action: 'CLASS_CREATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'class',
    targetId: classRef.id,
    details: { name, code, department, semester },
  });

  return newClass;
}

export async function updateClass(
  db: admin.firestore.Firestore,
  input: UpdateClassInput,
  actor: ActorInfo
): Promise<void> {
  const classRef = db.collection('classes').doc(input.classId);
  const snap = await classRef.get();
  if (!snap.exists) {
    throw new Error(`Class '${input.classId}' was not found.`);
  }

  const code = input.code?.trim().toUpperCase();
  const existingCode = await db.collection('classes').where('code', '==', code).get();
  const isDuplicate = existingCode.docs.some((doc) => doc.id !== input.classId);
  if (isDuplicate) {
    throw new Error(`Class code '${code}' is already used by another class.`);
  }

  await classRef.update({
    name: input.name?.trim(),
    code,
    department: input.department?.trim(),
    semester: Number(input.semester),
    academicYear: input.academicYear?.trim(),
    active: input.active !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog(db, {
    action: 'CLASS_UPDATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'class',
    targetId: input.classId,
    details: { code, name: input.name },
  });
}

export async function deleteClass(
  db: admin.firestore.Firestore,
  classId: string,
  actor: ActorInfo
): Promise<void> {
  const classRef = db.collection('classes').doc(classId);
  const snap = await classRef.get();
  if (!snap.exists) {
    throw new Error(`Class '${classId}' was not found.`);
  }

  // Check if students are assigned to this class
  const studentsInClass = await db.collection('students').where('classId', '==', classId).limit(1).get();
  if (!studentsInClass.empty) {
    throw new Error('Cannot delete class that has active or enrolled students. Reassign or remove students first.');
  }

  await classRef.delete();

  await writeAuditLog(db, {
    action: 'CLASS_DELETED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'class',
    targetId: classId,
  });
}

export async function createSubject(
  db: admin.firestore.Firestore,
  input: CreateSubjectInput,
  actor: ActorInfo
): Promise<Subject> {
  const name = input.name?.trim();
  const code = input.code?.trim().toUpperCase();
  const department = input.department?.trim();

  if (!name) throw new Error('Subject name is required.');
  if (!code) throw new Error('Subject code is required.');
  if (!department) throw new Error('Department is required.');

  const existing = await db.collection('subjects').where('code', '==', code).get();
  if (!existing.empty) {
    throw new Error(`Subject with code '${code}' already exists.`);
  }

  const subRef = db.collection('subjects').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const newSubject: Subject = {
    subjectId: subRef.id,
    name,
    code,
    department,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await subRef.set(newSubject);

  await writeAuditLog(db, {
    action: 'SUBJECT_CREATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'subject',
    targetId: subRef.id,
    details: { name, code, department },
  });

  return newSubject;
}

export async function updateSubject(
  db: admin.firestore.Firestore,
  input: UpdateSubjectInput,
  actor: ActorInfo
): Promise<void> {
  const subRef = db.collection('subjects').doc(input.subjectId);
  const snap = await subRef.get();
  if (!snap.exists) {
    throw new Error(`Subject '${input.subjectId}' was not found.`);
  }

  const code = input.code?.trim().toUpperCase();
  const existing = await db.collection('subjects').where('code', '==', code).get();
  const isDuplicate = existing.docs.some((doc) => doc.id !== input.subjectId);
  if (isDuplicate) {
    throw new Error(`Subject code '${code}' is already used by another subject.`);
  }

  await subRef.update({
    name: input.name?.trim(),
    code,
    department: input.department?.trim(),
    active: input.active !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog(db, {
    action: 'SUBJECT_UPDATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'subject',
    targetId: input.subjectId,
    details: { code, name: input.name },
  });
}

export async function deleteSubject(
  db: admin.firestore.Firestore,
  subjectId: string,
  actor: ActorInfo
): Promise<void> {
  const subRef = db.collection('subjects').doc(subjectId);
  const snap = await subRef.get();
  if (!snap.exists) {
    throw new Error(`Subject '${subjectId}' was not found.`);
  }

  // Check if timetable entries reference this subject
  const entries = await db.collection('timetable').where('subjectId', '==', subjectId).limit(1).get();
  if (!entries.empty) {
    throw new Error('Cannot delete subject that is currently scheduled in the timetable.');
  }

  await subRef.delete();

  await writeAuditLog(db, {
    action: 'SUBJECT_DELETED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'subject',
    targetId: subjectId,
  });
}
