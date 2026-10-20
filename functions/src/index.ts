import * as admin from 'firebase-admin';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { registerStudent, updateStudent, deleteStudent } from './services/studentService';
import {
  requestEnrollment,
  cancelEnrollment,
  processEnrollmentResult,
} from './services/enrollmentService';
import {
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  validateTimetableConflicts,
} from './services/timetableService';
import {
  createClass,
  updateClass,
  deleteClass,
  createSubject,
  updateSubject,
  deleteSubject,
} from './services/academicService';
import { createAdminUser, updateInstitutionSettings } from './services/adminService';

import {
  processDeviceScan,
  processDeviceHeartbeat,
  IngestionHeaders,
} from './services/attendanceService';
import {
  correctAttendanceRecord,
  createManualAttendanceRecord,
} from './services/recordService';
import {
  buildNormalizedReportDataset,
  renderExcelReport,
  renderPdfReport,
  renderWordReport,
} from './services/reportService';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

/** Helper: require admin role */
function ensureAdmin(request: any) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const token = request.auth.token;
  if (!token.admin && !token.superAdmin) {
    throw new HttpsError('permission-denied', 'Only administrators may perform this action.');
  }
  return {
    uid: request.auth.uid,
    email: request.auth.token.email || 'unknown@admin.local',
  };
}

/** Helper: require superAdmin role */
function ensureSuperAdmin(request: any) {
  const actor = ensureAdmin(request);
  if (!request.auth.token.superAdmin) {
    throw new HttpsError('permission-denied', 'SuperAdmin privileges required.');
  }
  return actor;
}

/** Health check */
export const health = onRequest({ cors: true }, (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'attendance-backend-functions',
    phase: 5,
  });
});

// ==========================================
// Student Management Callables
// ==========================================

export const registerStudentCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    const student = await registerStudent(db, request.data, actor);
    return { success: true, student };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const updateStudentCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await updateStudent(db, request.data, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const deleteStudentCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await deleteStudent(db, request.data.studentId, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

// ==========================================
// Biometric Enrollment Callables
// ==========================================

export const requestEnrollmentCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    const enrollment = await requestEnrollment(db, request.data, actor);
    return { success: true, enrollment };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const cancelEnrollmentCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await cancelEnrollment(db, request.data.requestId, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const processEnrollmentResultCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await processEnrollmentResult(db, request.data, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

/** Device Ingestion HTTP endpoint for Enrollment Result (API Contract 2.3) */
export const enrollmentResult = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const deviceId = (req.headers['x-device-id'] as string) || req.body.deviceId || 'UNKNOWN_DEVICE';
  const { requestId, status, fingerprintRef, errorMessage } = req.body;

  if (!requestId || !status) {
    res.status(400).json({ error: 'Missing requestId or status in request body.' });
    return;
  }

  try {
    await processEnrollmentResult(
      db,
      {
        requestId,
        status,
        fingerprintRef: typeof fingerprintRef === 'number' ? fingerprintRef : parseInt(fingerprintRef, 10),
        errorMessage,
      },
      {
        uid: `device:${deviceId}`,
        email: `${deviceId.toLowerCase()}@hardware.local`,
      }
    );

    res.status(200).json({
      status: 'acknowledged',
      requestId,
      processed: true,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// Timetable Callables
// ==========================================

export const validateTimetableConflictsCall = onCall({ cors: true }, async (request) => {
  ensureAdmin(request);
  try {
    const result = await validateTimetableConflicts(db, request.data);
    return result;
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const createTimetableEntryCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    const entry = await createTimetableEntry(db, request.data, actor);
    return { success: true, entry };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const updateTimetableEntryCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await updateTimetableEntry(db, request.data, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const deleteTimetableEntryCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await deleteTimetableEntry(db, request.data.timetableId, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

// ==========================================
// Academic Classes & Subjects Callables
// ==========================================

export const createClassCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    const newClass = await createClass(db, request.data, actor);
    return { success: true, class: newClass };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const updateClassCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await updateClass(db, request.data, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const deleteClassCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await deleteClass(db, request.data.classId, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const createSubjectCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    const subject = await createSubject(db, request.data, actor);
    return { success: true, subject };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const updateSubjectCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await updateSubject(db, request.data, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const deleteSubjectCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    await deleteSubject(db, request.data.subjectId, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

// ==========================================
// Administration & Settings Callables
// ==========================================

export const createAdminUserCall = onCall({ cors: true }, async (request) => {
  const actor = ensureSuperAdmin(request);
  try {
    const res = await createAdminUser(auth, db, request.data, actor);
    return { success: true, user: res };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const updateInstitutionSettingsCall = onCall({ cors: true }, async (request) => {
  const actor = ensureSuperAdmin(request);
  try {
    await updateInstitutionSettings(db, request.data, actor);
    return { success: true };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

// ==========================================
// Attendance Record & Audited Correction Callables (Phase 4)
// ==========================================

export const correctAttendanceRecordCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    const updated = await correctAttendanceRecord(db, request.data, actor);
    return { success: true, record: updated };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

export const createManualAttendanceRecordCall = onCall({ cors: true }, async (request) => {
  const actor = ensureAdmin(request);
  try {
    const created = await createManualAttendanceRecord(db, request.data, actor);
    return { success: true, record: created };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

// ==========================================
// Device Ingestion HTTP Endpoints (Phase 3)
// ==========================================

/**
 * Authoritative Biometric Attendance Ingestion (API Contract 2.1)
 * Validates HMAC-SHA256, checks clock drift, evaluates schedule policies,
 * records attendance atomically, and emits live deviceEvents.
 */
export const processScan = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const deviceId = (req.headers['x-device-id'] as string) || req.body?.deviceId || 'ESP32-READER-01';
  const eventId =
    (req.headers['x-event-id'] as string) ||
    req.body?.eventId ||
    `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const timestamp = req.headers['x-timestamp']
    ? (req.headers['x-timestamp'] as string)
    : req.body?.capturedAt || Math.floor(Date.now() / 1000);
  const signature = (req.headers['x-signature'] as string) || req.body?.signature;

  const headers: IngestionHeaders = {
    deviceId,
    eventId,
    timestamp,
    signature,
  };

  const rawBody = (req as any).rawBody
    ? (req as any).rawBody.toString('utf8')
    : JSON.stringify(req.body || {});

  try {
    const result = await processDeviceScan(db, headers, req.body || {}, rawBody);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({
      status: 'error',
      eventId,
      error: error.message || 'Scan processing failed',
    });
  }
});

/**
 * Hardware Device Telemetry Heartbeat (API Contract 2.2)
 * Updates online status, health, and checks for pending enrollment requests.
 */
export const deviceHeartbeat = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const deviceId = (req.headers['x-device-id'] as string) || req.body?.deviceId || 'ESP32-READER-01';
  const eventId =
    (req.headers['x-event-id'] as string) ||
    req.body?.eventId ||
    `hb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const timestamp = req.headers['x-timestamp']
    ? (req.headers['x-timestamp'] as string)
    : Math.floor(Date.now() / 1000);
  const signature = (req.headers['x-signature'] as string) || req.body?.signature;

  const headers: IngestionHeaders = {
    deviceId,
    eventId,
    timestamp,
    signature,
  };

  const rawBody = (req as any).rawBody
    ? (req as any).rawBody.toString('utf8')
    : JSON.stringify(req.body || {});

  try {
    const result = await processDeviceHeartbeat(db, headers, req.body || {}, rawBody);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({
      status: 'error',
      eventId,
      error: error.message || 'Heartbeat processing failed',
    });
  }
});

// ==========================================
// Attendance Reporting & Multi-Format Exports (Phase 5)
// ==========================================

/**
 * Callable: Retrieve JSON normalized dataset with derived absenteeism (DEC-006)
 */
export const getAttendanceReportCall = onCall({ cors: true }, async (request) => {
  ensureAdmin(request);
  try {
    const report = await buildNormalizedReportDataset(db, request.data);
    return { success: true, report };
  } catch (error: any) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

/**
 * Direct HTTP Download Endpoint for Excel (.xlsx), PDF (.pdf), and Word (.docx) (DEC-007)
 */
export const exportReport = onRequest({ cors: true }, async (req, res) => {
  const classId = (req.query.classId as string) || (req.body?.classId as string);
  const startDate = (req.query.startDate as string) || (req.body?.startDate as string);
  const endDate = (req.query.endDate as string) || (req.body?.endDate as string);
  const subjectId = (req.query.subjectId as string) || (req.body?.subjectId as string) || undefined;
  const format = ((req.query.format as string) || (req.body?.format as string) || 'excel').toLowerCase();

  if (!classId || !startDate || !endDate) {
    res.status(400).json({ error: 'Missing required query parameters: classId, startDate, endDate' });
    return;
  }

  try {
    const reportData = await buildNormalizedReportDataset(db, {
      classId,
      startDate,
      endDate,
      subjectId,
    });

    const filePrefix = `attendance_${reportData.classCode || reportData.classId}_${startDate}_to_${endDate}`;

    if (format === 'excel' || format === 'xlsx') {
      const buffer = await renderExcelReport(reportData);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}.xlsx"`);
      res.setHeader('Content-Length', buffer.length);
      res.status(200).send(buffer);
      return;
    }

    if (format === 'pdf') {
      const pdfBytes = await renderPdfReport(reportData);
      const buffer = Buffer.from(pdfBytes);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}.pdf"`);
      res.setHeader('Content-Length', buffer.length);
      res.status(200).send(buffer);
      return;
    }

    if (format === 'word' || format === 'docx') {
      const buffer = await renderWordReport(reportData);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filePrefix}.docx"`);
      res.setHeader('Content-Length', buffer.length);
      res.status(200).send(buffer);
      return;
    }

    res.status(400).json({ error: `Unsupported export format: ${format}. Expected excel, pdf, or word.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Report generation failed.' });
  }
});


