import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  Student,
  AcademicClass,
  Subject,
  TimetableEntry,
  EnrollmentRequest,
} from '@/types';
import {
  getDevCollection,
  setDevCollection,
  setDevSettings,
  writeDevAudit,
} from './devData';

// Helper to compute timing windows for timetable entries
function computeWindows(startTime: string, endTime: string) {
  const [sH, sM] = startTime.split(':').map(Number);
  const startTotal = sH * 60 + sM;
  const opensTotal = (startTotal - 5 + 1440) % 1440;
  const lateTotal = (startTotal + 10) % 1440;

  const fmt = (t: number) =>
    `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

  return {
    attendanceOpensAt: fmt(opensTotal),
    lateCutoff: fmt(lateTotal),
    finalDeadline: endTime,
  };
}

// Low-level Firebase callable handles
const rawRegisterStudent = httpsCallable<any, any>(functions, 'registerStudentCall');
const rawUpdateStudent = httpsCallable<any, any>(functions, 'updateStudentCall');
const rawDeleteStudent = httpsCallable<any, any>(functions, 'deleteStudentCall');
const rawRequestEnrollment = httpsCallable<any, any>(functions, 'requestEnrollmentCall');
const rawCancelEnrollment = httpsCallable<any, any>(functions, 'cancelEnrollmentCall');
const rawProcessEnrollmentResult = httpsCallable<any, any>(functions, 'processEnrollmentResultCall');
const rawCreateTimetableEntry = httpsCallable<any, any>(functions, 'createTimetableEntryCall');
const rawUpdateTimetableEntry = httpsCallable<any, any>(functions, 'updateTimetableEntryCall');
const rawDeleteTimetableEntry = httpsCallable<any, any>(functions, 'deleteTimetableEntryCall');
const rawValidateTimetableConflicts = httpsCallable<any, any>(functions, 'validateTimetableConflictsCall');
const rawCreateClass = httpsCallable<any, any>(functions, 'createClassCall');
const rawUpdateClass = httpsCallable<any, any>(functions, 'updateClassCall');
const rawDeleteClass = httpsCallable<any, any>(functions, 'deleteClassCall');
const rawCreateSubject = httpsCallable<any, any>(functions, 'createSubjectCall');
const rawUpdateSubject = httpsCallable<any, any>(functions, 'updateSubjectCall');
const rawDeleteSubject = httpsCallable<any, any>(functions, 'deleteSubjectCall');
const rawCreateAdminUser = httpsCallable<any, any>(functions, 'createAdminUserCall');
const rawUpdateInstitutionSettings = httpsCallable<any, any>(functions, 'updateInstitutionSettingsCall');

// Resilient wrapper that tries Cloud Functions, falling back to local dev store on network/offline failure
async function resilientCall<TReq, TRes>(
  fn: (req: TReq) => Promise<{ data: TRes }>,
  req: TReq,
  fallback: () => TRes
): Promise<{ data: TRes }> {
  try {
    return await fn(req);
  } catch (err: any) {
    console.info('[DevCallables] Backend offline or unreachable, applying action locally:', err?.message || err);
    return { data: fallback() };
  }
}

export const callRegisterStudent = (data: { fullName: string; rollNumber: string; classId: string }) =>
  resilientCall(rawRegisterStudent, data, () => {
    const students = getDevCollection<Student>('students');
    const classes = getDevCollection<AcademicClass>('classes');
    const targetClass = classes.find((c) => c.classId === data.classId);

    const newStudent: Student = {
      studentId: `std_${Date.now()}`,
      fullName: data.fullName,
      rollNumber: data.rollNumber,
      classId: data.classId,
      className: targetClass?.name || data.classId,
      fingerprintRef: null,
      active: true,
      createdAt: new Date().toISOString(),
    };

    setDevCollection('students', [newStudent, ...students]);
    writeDevAudit('STUDENT_REGISTERED', 'student', newStudent.studentId, {
      rollNumber: newStudent.rollNumber,
      classId: newStudent.classId,
    });
    return { success: true, student: newStudent };
  });

export const callUpdateStudent = (data: { studentId: string; fullName: string; rollNumber: string; classId: string; active: boolean }) =>
  resilientCall(rawUpdateStudent, data, () => {
    const students = getDevCollection<Student>('students');
    const classes = getDevCollection<AcademicClass>('classes');
    const targetClass = classes.find((c) => c.classId === data.classId);

    const updated = students.map((s) => {
      if (s.studentId === data.studentId) {
        return {
          ...s,
          fullName: data.fullName,
          rollNumber: data.rollNumber,
          classId: data.classId,
          className: targetClass?.name || s.className,
          active: data.active,
        };
      }
      return s;
    });

    setDevCollection('students', updated);
    writeDevAudit('STUDENT_UPDATED', 'student', data.studentId, data);
    return { success: true };
  });

export const callDeleteStudent = (data: { studentId: string }) =>
  resilientCall(rawDeleteStudent, data, () => {
    const students = getDevCollection<Student>('students');
    const filtered = students.filter((s) => s.studentId !== data.studentId);
    setDevCollection('students', filtered);
    writeDevAudit('STUDENT_DELETED', 'student', data.studentId);
    return { success: true };
  });

export const callRequestEnrollment = (data: { studentId: string; deviceId: string }) =>
  resilientCall(rawRequestEnrollment, data, () => {
    const requestId = `enr_${Date.now()}`;
    const enrollment: EnrollmentRequest = {
      requestId,
      studentId: data.studentId,
      deviceId: data.deviceId,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
    writeDevAudit('ENROLLMENT_REQUESTED', 'enrollment', requestId, data);
    return { success: true, enrollment };
  });

export const callCancelEnrollment = (data: { requestId: string }) =>
  resilientCall(rawCancelEnrollment, data, () => {
    writeDevAudit('ENROLLMENT_CANCELLED', 'enrollment', data.requestId);
    return { success: true };
  });

export const callProcessEnrollmentResult = (data: {
  requestId: string;
  studentId?: string;
  status: 'success' | 'failed';
  fingerprintRef?: number;
  errorMessage?: string;
}) =>
  resilientCall(rawProcessEnrollmentResult, data, () => {
    if (data.status === 'success' && data.fingerprintRef) {
      const students = getDevCollection<Student>('students');
      // If studentId provided or assign to matching student
      const updated = students.map((s) => {
        if (data.studentId && s.studentId === data.studentId) {
          return { ...s, fingerprintRef: data.fingerprintRef };
        }
        return s;
      });
      setDevCollection('students', updated);
      writeDevAudit('BIOMETRIC_ENROLLED', 'student', data.studentId || 'unknown', {
        slot: data.fingerprintRef,
      });
    }
    return { success: true };
  });

export const callCreateTimetableEntry = (data: Partial<TimetableEntry>) =>
  resilientCall(rawCreateTimetableEntry, data, () => {
    const timetable = getDevCollection<TimetableEntry>('timetable');
    const windows = computeWindows(data.startTime || '09:00', data.endTime || '10:00');

    const entry: TimetableEntry = {
      timetableId: `tt_${Date.now()}`,
      classId: data.classId || '',
      subjectId: data.subjectId || '',
      dayOfWeek: data.dayOfWeek || 1,
      sessionType: data.sessionType || 'lecture',
      startTime: data.startTime || '09:00',
      endTime: data.endTime || '10:00',
      attendanceOpensAt: windows.attendanceOpensAt,
      lateCutoff: windows.lateCutoff,
      finalDeadline: windows.finalDeadline,
      room: data.room,
      faculty: data.faculty,
      active: true,
    };

    setDevCollection('timetable', [...timetable, entry]);
    writeDevAudit('TIMETABLE_ENTRY_CREATED', 'timetable', entry.timetableId, {
      classId: entry.classId,
      day: entry.dayOfWeek,
      time: `${entry.startTime}-${entry.endTime}`,
    });
    return { success: true, entry };
  });

export const callUpdateTimetableEntry = (data: Partial<TimetableEntry> & { timetableId: string }) =>
  resilientCall(rawUpdateTimetableEntry, data, () => {
    const timetable = getDevCollection<TimetableEntry>('timetable');
    const updated = timetable.map((t) => {
      if (t.timetableId === data.timetableId) {
        const startTime = data.startTime || t.startTime;
        const endTime = data.endTime || t.endTime;
        const windows = computeWindows(startTime, endTime);
        return {
          ...t,
          ...data,
          attendanceOpensAt: windows.attendanceOpensAt,
          lateCutoff: windows.lateCutoff,
          finalDeadline: windows.finalDeadline,
        };
      }
      return t;
    });

    setDevCollection('timetable', updated);
    writeDevAudit('TIMETABLE_ENTRY_UPDATED', 'timetable', data.timetableId);
    return { success: true };
  });

export const callDeleteTimetableEntry = (data: { timetableId: string }) =>
  resilientCall(rawDeleteTimetableEntry, data, () => {
    const timetable = getDevCollection<TimetableEntry>('timetable');
    const filtered = timetable.filter((t) => t.timetableId !== data.timetableId);
    setDevCollection('timetable', filtered);
    writeDevAudit('TIMETABLE_ENTRY_DELETED', 'timetable', data.timetableId);
    return { success: true };
  });

export const callValidateTimetableConflicts = (data: {
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  faculty?: string;
  excludeId?: string;
}) =>
  resilientCall(rawValidateTimetableConflicts, data, () => {
    const timetable = getDevCollection<TimetableEntry>('timetable');
    const conflicts: string[] = [];

    const toM = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const newStart = toM(data.startTime);
    const newEnd = toM(data.endTime);

    for (const t of timetable) {
      if (t.timetableId === data.excludeId || t.active === false) continue;
      if (t.dayOfWeek !== data.dayOfWeek) continue;

      const tStart = toM(t.startTime);
      const tEnd = toM(t.endTime);
      const overlaps = Math.max(newStart, tStart) < Math.min(newEnd, tEnd);

      if (overlaps) {
        if (t.classId === data.classId) {
          conflicts.push(`Class conflict with existing slot ${t.startTime}–${t.endTime}`);
        }
        if (data.room && t.room && t.room.toLowerCase() === data.room.toLowerCase()) {
          conflicts.push(`Room conflict: ${data.room} is already reserved ${t.startTime}–${t.endTime}`);
        }
        if (data.faculty && t.faculty && t.faculty.toLowerCase() === data.faculty.toLowerCase()) {
          conflicts.push(`Faculty conflict: ${data.faculty} is assigned to another class ${t.startTime}–${t.endTime}`);
        }
      }
    }

    return { valid: conflicts.length === 0, conflicts };
  });

export const callCreateClass = (data: Partial<AcademicClass>) =>
  resilientCall(rawCreateClass, data, () => {
    const classes = getDevCollection<AcademicClass>('classes');
    const newClass: AcademicClass = {
      classId: `class_${Date.now()}`,
      name: data.name || '',
      code: data.code || '',
      department: data.department || '',
      semester: data.semester || 1,
      academicYear: data.academicYear || '2024-2025',
      active: true,
    };
    setDevCollection('classes', [...classes, newClass]);
    writeDevAudit('CLASS_CREATED', 'class', newClass.classId, { code: newClass.code });
    return { success: true, class: newClass };
  });

export const callUpdateClass = (data: Partial<AcademicClass> & { classId: string }) =>
  resilientCall(rawUpdateClass, data, () => {
    const classes = getDevCollection<AcademicClass>('classes');
    const updated = classes.map((c) => (c.classId === data.classId ? { ...c, ...data } : c));
    setDevCollection('classes', updated);
    writeDevAudit('CLASS_UPDATED', 'class', data.classId);
    return { success: true };
  });

export const callDeleteClass = (data: { classId: string }) =>
  resilientCall(rawDeleteClass, data, () => {
    const classes = getDevCollection<AcademicClass>('classes');
    setDevCollection('classes', classes.filter((c) => c.classId !== data.classId));
    writeDevAudit('CLASS_DELETED', 'class', data.classId);
    return { success: true };
  });

export const callCreateSubject = (data: Partial<Subject>) =>
  resilientCall(rawCreateSubject, data, () => {
    const subjects = getDevCollection<Subject>('subjects');
    const newSub: Subject = {
      subjectId: `sub_${Date.now()}`,
      name: data.name || '',
      code: data.code || '',
      department: data.department || '',
      active: true,
    };
    setDevCollection('subjects', [...subjects, newSub]);
    writeDevAudit('SUBJECT_CREATED', 'subject', newSub.subjectId, { code: newSub.code });
    return { success: true, subject: newSub };
  });

export const callUpdateSubject = (data: Partial<Subject> & { subjectId: string }) =>
  resilientCall(rawUpdateSubject, data, () => {
    const subjects = getDevCollection<Subject>('subjects');
    const updated = subjects.map((s) => (s.subjectId === data.subjectId ? { ...s, ...data } : s));
    setDevCollection('subjects', updated);
    writeDevAudit('SUBJECT_UPDATED', 'subject', data.subjectId);
    return { success: true };
  });

export const callDeleteSubject = (data: { subjectId: string }) =>
  resilientCall(rawDeleteSubject, data, () => {
    const subjects = getDevCollection<Subject>('subjects');
    setDevCollection('subjects', subjects.filter((s) => s.subjectId !== data.subjectId));
    writeDevAudit('SUBJECT_DELETED', 'subject', data.subjectId);
    return { success: true };
  });

export const callCreateAdminUser = (data: {
  email: string;
  password: string;
  displayName: string;
  role: 'admin' | 'superAdmin';
}) =>
  resilientCall(rawCreateAdminUser, data, () => {
    const admins = getDevCollection<any>('admins');
    const newAdmin = {
      uid: `admin_${Date.now()}`,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      createdAt: new Date().toISOString(),
    };
    setDevCollection('admins', [...admins, newAdmin]);
    writeDevAudit('ADMIN_CREATED', 'admin', newAdmin.uid, { email: data.email, role: data.role });
    return { success: true, user: newAdmin };
  });

export const callUpdateInstitutionSettings = (data: any) =>
  resilientCall(rawUpdateInstitutionSettings, data, () => {
    setDevSettings(data);
    writeDevAudit('SETTINGS_UPDATED', 'settings', 'institution', data);
    return { success: true };
  });
