// Types for Web Dashboard
export interface AdminUser {
  uid: string;
  email: string;
  role: 'admin' | 'superAdmin';
  displayName: string;
  createdAt: any;
}

export interface InstitutionSettings {
  name: string;
  department: string;
  timezone: string;
  academicYear: string;
  lateToleranceMinutes: number;
  attendanceOpensBeforeMinutes: number;
  driftToleranceSeconds: number;
  heartbeatIntervalSeconds: number;
  deviceOfflineThresholdSeconds: number;
  lowAttendanceThreshold: number;
  updatedAt?: any;
  updatedBy?: string;
}

export interface AcademicClass {
  classId: string;
  name: string;
  code: string;
  department: string;
  semester: number;
  academicYear: string;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface Subject {
  subjectId: string;
  name: string;
  code: string;
  department: string;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface Student {
  studentId: string;
  fullName: string;
  rollNumber: string;
  classId: string;
  className?: string;
  active: boolean;
  fingerprintRef: number | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface EnrollmentRequest {
  requestId: string;
  studentId: string;
  studentName?: string;
  rollNumber?: string;
  classId?: string;
  deviceId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  fingerprintRef?: number | null;
  errorMessage?: string;
  createdAt?: any;
  updatedAt?: any;
  requestedAt?: any;
  expiresAt?: any;
  completedAt?: any;
}

export interface TimetableEntry {
  timetableId: string;
  classId: string;
  subjectId: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6; // Mon-Sat
  sessionType: 'lecture';
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  attendanceOpensAt: string;
  lateCutoff: string;
  finalDeadline: string;
  room?: string;
  faculty?: string;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface AttendanceRecord {
  attendanceId: string;
  studentId: string;
  sessionId: string;
  classId: string;
  subjectId: string;
  lectureDate: string;
  status: 'Present' | 'Late' | 'Absent' | 'Excused';
  capturedAt: any;
  receivedAt: any;
  processedAt: any;
  deviceId: string;
  eventId: string;
  correctedBy?: string;
  correctionReason?: string;
}

export interface DeviceEvent {
  eventId: string;
  deviceId: string;
  eventType: 'scan' | 'heartbeat' | 'enrollment_result' | 'error';
  fingerprintRef?: number;
  studentId?: string;
  studentName?: string;
  rollNumber?: string;
  sessionId?: string;
  subjectName?: string;
  result: 'Present' | 'Late' | 'Rejected' | 'Duplicate' | 'No Active Lecture' | 'Device Error';
  rejectionReason?: string;
  capturedAt: any;
  receivedAt: any;
  processingStatus: 'processed' | 'rejected' | 'duplicate_ignored' | 'failed';
  errorCode?: string;
}

export interface AuditLog {
  logId?: string;
  id?: string;
  action: string;
  actorUid: string;
  actorEmail: string;
  targetType: string;
  targetId: string;
  details?: Record<string, any>;
  timestamp: any;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  location: string;
  secretHash?: string;
  active: boolean;
  status: 'online' | 'offline' | 'pending';
  lastHeartbeatAt?: any;
  firmwareVersion?: string;
  wifiSignalRssi?: number;
  freeHeap?: number;
  enrolledCount?: number;
  createdAt: any;
  updatedAt: any;
}

export interface RtdbAttendanceRecord {
  recordId: string;
  studentId: string;
  fingerprintId: number;
  timestamp: number | string;
  status: string;
  deviceId: string;
}

