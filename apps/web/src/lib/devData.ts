import { Student, TimetableEntry, AcademicClass, Subject, AuditLog, InstitutionSettings } from '@/types';

const STORAGE_KEY_PREFIX = 'smart_attendance_dev_';

export const INITIAL_CLASSES: AcademicClass[] = [
  {
    classId: 'class_cse_3a',
    name: 'CSE- Sem 3- Div: A',
    code: 'CSE-3A',
    department: 'Computer Science & Engineering',
    semester: 3,
    academicYear: '2024-2025',
    active: true,
  },
  {
    classId: 'class_cse_3b',
    name: 'CSE- Sem 3- Div: B',
    code: 'CSE-3B',
    department: 'Computer Science & Engineering',
    semester: 3,
    academicYear: '2024-2025',
    active: true,
  },
];

export const INITIAL_SUBJECTS: Subject[] = [
  {
    subjectId: 'sub_os',
    name: 'Operating Systems',
    code: 'CS501',
    department: 'Computer Science & Engineering',
    active: true,
  },
  {
    subjectId: 'sub_cn',
    name: 'Computer Networks',
    code: 'CS502',
    department: 'Computer Science & Engineering',
    active: true,
  },
  {
    subjectId: 'sub_dbms',
    name: 'Database Management Systems',
    code: 'CS503',
    department: 'Computer Science & Engineering',
    active: true,
  },
  {
    subjectId: 'sub_se',
    name: 'Software Engineering',
    code: 'CS504',
    department: 'Computer Science & Engineering',
    active: true,
  },
];

export const INITIAL_STUDENTS: Student[] = [
  {
    studentId: 'std_101',
    fullName: 'Aarav Sharma',
    rollNumber: 'CS-2024-001',
    classId: 'class_ce_5a',
    className: 'Computer Engineering - Semester 5 - Div A',
    fingerprintRef: 1,
    active: true,
  },
  {
    studentId: 'std_102',
    fullName: 'Ananya Patel',
    rollNumber: 'CS-2024-002',
    classId: 'class_ce_5a',
    className: 'Computer Engineering - Semester 5 - Div A',
    fingerprintRef: 2,
    active: true,
  },
  {
    studentId: 'std_103',
    fullName: 'Rohan Gupta',
    rollNumber: 'CS-2024-003',
    classId: 'class_ce_5a',
    className: 'Computer Engineering - Semester 5 - Div A',
    fingerprintRef: null,
    active: true,
  },
  {
    studentId: 'std_104',
    fullName: 'Sneha Verma',
    rollNumber: 'CS-2024-004',
    classId: 'class_ce_5b',
    className: 'Computer Engineering - Semester 5 - Div B',
    fingerprintRef: 3,
    active: true,
  },
  {
    studentId: 'std_105',
    fullName: 'Vikram Joshi',
    rollNumber: 'CS-2024-005',
    classId: 'class_ce_5b',
    className: 'Computer Engineering - Semester 5 - Div B',
    fingerprintRef: null,
    active: true,
  },
];

export const INITIAL_TIMETABLE: TimetableEntry[] = [
  {
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
    faculty: 'Prof. Alan Turing',
    active: true,
  },
  {
    timetableId: 'tt_mon_cn_5a',
    classId: 'class_ce_5a',
    subjectId: 'sub_cn',
    dayOfWeek: 1, // Monday
    sessionType: 'lecture',
    startTime: '10:15',
    endTime: '11:15',
    attendanceOpensAt: '10:10',
    lateCutoff: '10:25',
    finalDeadline: '11:15',
    room: 'LH-101',
    faculty: 'Dr. Vint Cerf',
    active: true,
  },
  {
    timetableId: 'tt_tue_dbms_5a',
    classId: 'class_ce_5a',
    subjectId: 'sub_dbms',
    dayOfWeek: 2, // Tuesday
    sessionType: 'lecture',
    startTime: '09:00',
    endTime: '10:00',
    attendanceOpensAt: '08:55',
    lateCutoff: '09:10',
    finalDeadline: '10:00',
    room: 'LH-102',
    faculty: 'Dr. Edgar Codd',
    active: true,
  },
  {
    timetableId: 'tt_wed_se_5a',
    classId: 'class_ce_5a',
    subjectId: 'sub_se',
    dayOfWeek: 3, // Wednesday
    sessionType: 'lecture',
    startTime: '11:30',
    endTime: '12:30',
    attendanceOpensAt: '11:25',
    lateCutoff: '11:40',
    finalDeadline: '12:30',
    room: 'LH-101',
    faculty: 'Prof. Grace Hopper',
    active: true,
  },
  {
    timetableId: 'tt_thu_os_5a',
    classId: 'class_ce_5a',
    subjectId: 'sub_os',
    dayOfWeek: 4, // Thursday
    sessionType: 'lecture',
    startTime: '09:00',
    endTime: '10:00',
    attendanceOpensAt: '08:55',
    lateCutoff: '09:10',
    finalDeadline: '10:00',
    room: 'LH-101',
    faculty: 'Prof. Alan Turing',
    active: true,
  },
  {
    timetableId: 'tt_fri_cn_5a',
    classId: 'class_ce_5a',
    subjectId: 'sub_cn',
    dayOfWeek: 5, // Friday
    sessionType: 'lecture',
    startTime: '14:00',
    endTime: '15:00',
    attendanceOpensAt: '13:55',
    lateCutoff: '14:10',
    finalDeadline: '15:00',
    room: 'Lab-3',
    faculty: 'Dr. Vint Cerf',
    active: true,
  },
  {
    timetableId: 'tt_sat_dbms_5a',
    classId: 'class_ce_5a',
    subjectId: 'sub_dbms',
    dayOfWeek: 6, // Saturday
    sessionType: 'lecture',
    startTime: '10:00',
    endTime: '11:00',
    attendanceOpensAt: '09:55',
    lateCutoff: '10:10',
    finalDeadline: '11:00',
    room: 'LH-102',
    faculty: 'Dr. Edgar Codd',
    active: true,
  },
];

export const INITIAL_SETTINGS: InstitutionSettings = {
  name: 'Faculty of Engineering & Technology',
  department: 'Department of Computer Science & Engineering',
  timezone: 'Asia/Kolkata',
  academicYear: '2024-2025',
  lateToleranceMinutes: 10,
  attendanceOpensBeforeMinutes: 5,
  driftToleranceSeconds: 120,
  heartbeatIntervalSeconds: 30,
  deviceOfflineThresholdSeconds: 90,
  lowAttendanceThreshold: 75,
};

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit_init',
    action: 'SYSTEM_BOOTSTRAPPED',
    actorUid: 'demo_superadmin_01',
    actorEmail: 'admin@attendance.local',
    targetType: 'system',
    targetId: 'bootstrap',
    details: {
      seededClasses: 2,
      seededSubjects: 4,
      seededStudents: 5,
      seededTimetable: 7,
      status: 'Initial Academic Roster & Biometric Hardware Ready',
    },
    timestamp: new Date().toISOString(),
  },
];

export const INITIAL_ADMINS = [
  {
    uid: 'demo_superadmin_01',
    email: 'admin@attendance.local',
    displayName: 'Super Administrator',
    role: 'superAdmin',
    createdAt: new Date().toISOString(),
  },
];

function getInitialDataForCollection(collectionName: string): any[] {
  switch (collectionName) {
    case 'classes':
      return INITIAL_CLASSES;
    case 'subjects':
      return INITIAL_SUBJECTS;
    case 'students':
      return INITIAL_STUDENTS;
    case 'timetable':
      return INITIAL_TIMETABLE;
    case 'auditLogs':
      return INITIAL_AUDIT_LOGS;
    case 'admins':
      return INITIAL_ADMINS;
    default:
      return [];
  }
}

export function getDevCollection<T>(collectionName: string): T[] {
  if (typeof window === 'undefined') return getInitialDataForCollection(collectionName) as T[];
  const stored = localStorage.getItem(STORAGE_KEY_PREFIX + collectionName);
  if (!stored) {
    const initial = getInitialDataForCollection(collectionName);
    setDevCollection(collectionName, initial);
    return initial as T[];
  }
  try {
    const parsed = JSON.parse(stored) as T[];
    if (collectionName === 'classes') {
      const needsUpdate = parsed.some((c: any) => c.name?.includes('Semester 5'));
      if (needsUpdate || parsed.length === 0) {
        setDevCollection('classes', INITIAL_CLASSES);
        return INITIAL_CLASSES as unknown as T[];
      }
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse dev storage:', e);
    return getInitialDataForCollection(collectionName) as T[];
  }
}

export function setDevCollection<T>(collectionName: string, items: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PREFIX + collectionName, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('dev-store-updated', { detail: { collectionName } }));
}

export function getDevSettings(): InstitutionSettings {
  if (typeof window === 'undefined') return INITIAL_SETTINGS;
  const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'settings');
  if (!stored) {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'settings', JSON.stringify(INITIAL_SETTINGS));
    return INITIAL_SETTINGS;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return INITIAL_SETTINGS;
  }
}

export function setDevSettings(settings: Partial<InstitutionSettings>): void {
  if (typeof window === 'undefined') return;
  const current = getDevSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY_PREFIX + 'settings', JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('dev-store-updated', { detail: { collectionName: 'settings' } }));
}

export function writeDevAudit(action: string, targetType: string, targetId: string, details?: any): void {
  const currentLogs = getDevCollection<AuditLog>('auditLogs');
  const newLog: AuditLog = {
    id: `audit_${Date.now()}`,
    action,
    actorUid: 'demo_superadmin_01',
    actorEmail: 'admin@attendance.local',
    targetType,
    targetId,
    details: details || {},
    timestamp: new Date().toISOString(),
  };
  setDevCollection('auditLogs', [newLog, ...currentLogs]);
}
