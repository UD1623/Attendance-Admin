import { describe, it, expect, beforeEach } from 'vitest';
import { createMockFirestore } from './mockFirestore';
import { registerStudent, updateStudent, deleteStudent } from '../services/studentService';

describe('studentService', () => {
  let db: any;
  const actor = { uid: 'admin_1', email: 'admin@college.edu' };

  beforeEach(() => {
    db = createMockFirestore();
    // Seed a class
    db.collection('classes').doc('class_cs_1').set({
      classId: 'class_cs_1',
      name: 'Computer Engineering - 5A',
      code: 'CE-5A',
      department: 'Computer Science',
      semester: 5,
    });
  });

  it('registers a student successfully and records audit log', async () => {
    const student = await registerStudent(
      db,
      {
        fullName: 'Jane Doe',
        rollNumber: 'CS-001',
        classId: 'class_cs_1',
      },
      actor
    );

    expect(student).toBeDefined();
    expect(student.fullName).toBe('Jane Doe');
    expect(student.rollNumber).toBe('CS-001');
    expect(student.className).toBe('Computer Engineering - 5A');
    expect(student.fingerprintRef).toBeNull();
    expect(student.active).toBe(true);

    // Verify stored
    const snap = await db.collection('students').doc(student.studentId).get();
    expect(snap.exists).toBe(true);
    expect(snap.data().fullName).toBe('Jane Doe');

    // Verify audit log
    const auditSnap = await db.collection('auditLogs').get();
    expect(auditSnap.size).toBe(1);
    expect(auditSnap.docs[0].data().action).toBe('STUDENT_REGISTERED');
  });

  it('rejects registration if class does not exist', async () => {
    await expect(
      registerStudent(
        db,
        {
          fullName: 'Jane Doe',
          rollNumber: 'CS-002',
          classId: 'non_existent_class',
        },
        actor
      )
    ).rejects.toThrow(/does not exist/);
  });

  it('rejects duplicate roll number registration', async () => {
    await registerStudent(
      db,
      {
        fullName: 'Jane Doe',
        rollNumber: 'CS-001',
        classId: 'class_cs_1',
      },
      actor
    );

    await expect(
      registerStudent(
        db,
        {
          fullName: 'John Smith',
          rollNumber: 'CS-001',
          classId: 'class_cs_1',
        },
        actor
      )
    ).rejects.toThrow(/already registered and active/);
  });

  it('updates student details correctly', async () => {
    const student = await registerStudent(
      db,
      {
        fullName: 'Jane Doe',
        rollNumber: 'CS-001',
        classId: 'class_cs_1',
      },
      actor
    );

    await updateStudent(
      db,
      {
        studentId: student.studentId,
        fullName: 'Jane Smith',
        rollNumber: 'CS-001',
        classId: 'class_cs_1',
        active: false,
      },
      actor
    );

    const snap = await db.collection('students').doc(student.studentId).get();
    expect(snap.data().fullName).toBe('Jane Smith');
    expect(snap.data().active).toBe(false);
  });

  it('deletes student successfully', async () => {
    const student = await registerStudent(
      db,
      {
        fullName: 'Jane Doe',
        rollNumber: 'CS-001',
        classId: 'class_cs_1',
      },
      actor
    );

    await deleteStudent(db, student.studentId, actor);
    const snap = await db.collection('students').doc(student.studentId).get();
    expect(snap.exists).toBe(false);
  });
});
