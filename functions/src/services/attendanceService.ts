import * as crypto from 'crypto';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { DeviceEvent, AttendanceRecord, TimetableEntry } from '../shared/types';

export interface ScanPayload {
  fingerprintRef: number;
  sensorStatus?: string;
  capturedAt?: number | string;
  testTimeOverride?: string; // Optional HH:MM for deterministic test/simulation
  testDateOverride?: string; // Optional YYYY-MM-DD for deterministic test/simulation
  testDayOfWeekOverride?: number; // Optional 1..6 for test/simulation
}

export interface HeartbeatPayload {
  sensorStatus?: string;
  firmwareVersion?: string;
  wifiSignalRssi?: number;
  freeHeap?: number;
}

export interface IngestionHeaders {
  deviceId: string;
  eventId: string;
  timestamp: string | number;
  signature?: string;
}

export interface IngestionResult {
  status: 'success' | 'rejected' | 'duplicate' | 'error';
  eventId: string;
  result: 'Present' | 'Late' | 'Rejected' | 'Duplicate' | 'No Active Lecture' | 'Device Error';
  message: string;
  student?: {
    studentId: string;
    fullName: string;
    rollNumber: string;
    classId: string;
    className?: string;
  };
  lecture?: {
    timetableId: string;
    subjectId: string;
    subjectName: string;
    classId: string;
    room?: string;
    startTime: string;
    endTime: string;
  };
  attendanceRecord?: AttendanceRecord;
}

const DEFAULT_DEV_SECRET = 'dev-secret-key-123';
const DEFAULT_DRIFT_TOLERANCE_SECONDS = 120;

/**
 * Computes HMAC-SHA256 signature for payload verification
 */
export function computeSignature(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verifies request signature against device secret or pre-shared key
 */
export async function verifyDeviceSignature(
  db: Firestore,
  headers: IngestionHeaders,
  rawBody: string
): Promise<{ valid: boolean; deviceData?: any; error?: string }> {
  const { deviceId, eventId, timestamp, signature } = headers;

  if (!deviceId || !eventId || !timestamp) {
    return { valid: false, error: 'Missing required security headers (X-Device-Id, X-Event-Id, X-Timestamp).' };
  }

  // Lookup device document
  const deviceDoc = await db.collection('devices').doc(deviceId).get();
  if (!deviceDoc.exists) {
    return { valid: false, error: `Unregistered hardware device: ${deviceId}` };
  }

  const deviceData = deviceDoc.data()!;
  if (deviceData.active === false) {
    return { valid: false, error: `Device ${deviceId} is currently deactivated.` };
  }

  // If signature provided, verify cryptographic authenticity
  if (signature) {
    const signaturePayload = `${deviceId}:${eventId}:${timestamp}:${rawBody}`;

    // Candidates for secret: device.presharedSecret, or fallback to known dev secret
    const secretCandidates: string[] = [];
    if (deviceData.presharedSecret) {
      secretCandidates.push(deviceData.presharedSecret);
    }
    secretCandidates.push(DEFAULT_DEV_SECRET);

    // If device has a secretHash, check if any candidate matches it
    if (deviceData.secretHash) {
      const candidateMatchingHash = secretCandidates.find(
        (sec) => crypto.createHash('sha256').update(sec).digest('hex') === deviceData.secretHash
      );
      if (candidateMatchingHash) {
        secretCandidates.unshift(candidateMatchingHash);
      }
    }

    let isMatch = false;
    for (const secret of secretCandidates) {
      const expected = computeSignature(secret, signaturePayload);
      const sigBuf = Buffer.from(signature, 'utf8');
      const expBuf = Buffer.from(expected, 'utf8');
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        isMatch = true;
        break;
      }
    }

    if (!isMatch) {
      return { valid: false, error: 'Invalid HMAC-SHA256 signature.' };
    }
  }

  return { valid: true, deviceData };
}

/**
 * Validates clock drift against server time authority (DEC-003)
 */
export function validateClockDrift(
  clientTimestamp: number | string,
  toleranceSeconds: number = DEFAULT_DRIFT_TOLERANCE_SECONDS
): { valid: boolean; driftSeconds: number } {
  let clientTimeMs: number;

  if (typeof clientTimestamp === 'number') {
    // If timestamp is in seconds, convert to ms
    clientTimeMs = clientTimestamp < 10000000000 ? clientTimestamp * 1000 : clientTimestamp;
  } else {
    const parsed = Date.parse(clientTimestamp);
    clientTimeMs = isNaN(parsed) ? Date.now() : parsed;
  }

  const serverNowMs = Date.now();
  const driftSeconds = Math.abs(serverNowMs - clientTimeMs) / 1000;

  return {
    valid: driftSeconds <= toleranceSeconds,
    driftSeconds: Math.round(driftSeconds),
  };
}

/**
 * Helper to convert "HH:MM" to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Authoritative scan processor implementing DEC-001 through DEC-005
 */
export async function processDeviceScan(
  db: Firestore,
  headers: IngestionHeaders,
  payload: ScanPayload,
  rawBody: string = ''
): Promise<IngestionResult> {
  const { deviceId, eventId, timestamp } = headers;
  const { fingerprintRef, sensorStatus } = payload;

  // 1. Verify Device Authentication
  const authCheck = await verifyDeviceSignature(db, headers, rawBody);
  if (!authCheck.valid) {
    throw new Error(authCheck.error || 'Device verification failed.');
  }

  // 2. Validate Clock Drift
  const driftCheck = validateClockDrift(timestamp);
  if (!driftCheck.valid) {
    throw new Error(
      `Clock drift tolerance exceeded (${driftCheck.driftSeconds}s > ${DEFAULT_DRIFT_TOLERANCE_SECONDS}s). Synchronize RTC.`
    );
  }

  // 3. Check for hardware sensor error
  if (sensorStatus && sensorStatus !== 'ok') {
    const eventDoc: DeviceEvent = {
      eventId,
      deviceId,
      eventType: 'error',
      result: 'Device Error',
      rejectionReason: `Sensor hardware flagged error: ${sensorStatus}`,
      capturedAt: timestamp,
      receivedAt: FieldValue.serverTimestamp(),
      processingStatus: 'failed',
      errorCode: sensorStatus,
    };
    await db.collection('deviceEvents').doc(eventId).set(eventDoc);

    return {
      status: 'rejected',
      eventId,
      result: 'Device Error',
      message: `Sensor reported hardware fault: ${sensorStatus}`,
    };
  }

  // 4. Resolve Student from Fingerprint Slot (DEC-001)
  const studentSnap = await db
    .collection('students')
    .where('fingerprintRef', '==', fingerprintRef)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (studentSnap.empty) {
    const eventDoc: DeviceEvent = {
      eventId,
      deviceId,
      eventType: 'scan',
      fingerprintRef,
      result: 'Rejected',
      rejectionReason: `No active student enrolled with fingerprint slot #${fingerprintRef}`,
      capturedAt: timestamp,
      receivedAt: FieldValue.serverTimestamp(),
      processingStatus: 'rejected',
    };
    await db.collection('deviceEvents').doc(eventId).set(eventDoc);

    return {
      status: 'rejected',
      eventId,
      result: 'Rejected',
      message: `Fingerprint slot #${fingerprintRef} is not assigned to an active student.`,
    };
  }

  const studentDoc = studentSnap.docs[0];
  const student = studentDoc.data();

  // 5. Determine Current Day of Week & Current Time in Timezone (DEC-003)
  const now = new Date();
  const currentDayOfWeek = payload.testDayOfWeekOverride || (now.getDay() === 0 ? 7 : now.getDay()); // 1=Mon .. 6=Sat

  // Format current time HH:MM
  let currentTimeStr = payload.testTimeOverride;
  if (!currentTimeStr) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    currentTimeStr = `${hours}:${minutes}`;
  }

  // Format date YYYY-MM-DD
  const todayDateStr =
    payload.testDateOverride ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const currentMinutes = timeToMinutes(currentTimeStr);

  // 6. Find Scheduled Timetable Entries for Student's Class (DEC-004)
  const timetableSnap = await db
    .collection('timetable')
    .where('classId', '==', student.classId)
    .where('active', '==', true)
    .get();

  const entries: TimetableEntry[] = timetableSnap.docs
    .map((d) => ({ ...(d.data() as any), timetableId: d.id } as TimetableEntry))
    .filter((e: TimetableEntry) => e.dayOfWeek === currentDayOfWeek);

  // If no classes today, or search for matching entry
  let matchedEntry: any = null;
  let rejectionReason: string | undefined;
  let statusResult: 'Present' | 'Late' | 'Rejected' | 'No Active Lecture' = 'No Active Lecture';

  // Find entry where session is active or soon to start
  for (const entry of entries) {
    const opensAtMinutes = timeToMinutes(entry.attendanceOpensAt || entry.startTime);
    const deadlineMinutes = timeToMinutes(entry.finalDeadline || entry.endTime);

    // If current time is within or near the window
    if (currentMinutes >= opensAtMinutes && currentMinutes <= deadlineMinutes) {
      matchedEntry = entry;
      break;
    }
  }

  // If no currently open window, check if we're too early for an upcoming lecture today
  if (!matchedEntry) {
    const upcoming = entries.find((e: any) => {
      const startMin = timeToMinutes(e.startTime);
      return currentMinutes < startMin && currentMinutes >= startMin - 30; // within 30 min before start
    });

    if (upcoming) {
      matchedEntry = upcoming;
      statusResult = 'Rejected';
      rejectionReason = `Too Early: Attendance opens at ${upcoming.attendanceOpensAt || upcoming.startTime} for ${upcoming.subjectId}`;
    }
  }

  // If still not matched, check if an entry is available today for fallback/demo
  if (!matchedEntry && entries.length > 0) {
    // If testing or off-hours, pick the first scheduled entry for today to evaluate policy
    const first = entries[0];
    const deadlineMin = timeToMinutes(first.finalDeadline || first.endTime);
    if (currentMinutes > deadlineMin) {
      matchedEntry = first;
      statusResult = 'Rejected';
      rejectionReason = `Session Closed: Lecture ended at ${first.finalDeadline || first.endTime}`;
    } else {
      matchedEntry = first;
    }
  }

  // If completely no timetable found for this class today
  if (!matchedEntry) {
    const eventDoc: DeviceEvent = {
      eventId,
      deviceId,
      eventType: 'scan',
      fingerprintRef,
      studentId: student.studentId,
      studentName: student.fullName,
      rollNumber: student.rollNumber,
      result: 'No Active Lecture',
      rejectionReason: `No scheduled lecture found for ${student.className || student.classId} today.`,
      capturedAt: timestamp,
      receivedAt: FieldValue.serverTimestamp(),
      processingStatus: 'rejected',
    };
    await db.collection('deviceEvents').doc(eventId).set(eventDoc);

    return {
      status: 'rejected',
      eventId,
      result: 'No Active Lecture',
      message: `No active lecture scheduled for class ${student.className || student.classId}.`,
      student: {
        studentId: student.studentId,
        fullName: student.fullName,
        rollNumber: student.rollNumber,
        classId: student.classId,
        className: student.className,
      },
    };
  }

  // Look up subject name
  let subjectName = matchedEntry.subjectId;
  try {
    const subDoc = await db.collection('subjects').doc(matchedEntry.subjectId).get();
    if (subDoc.exists) {
      subjectName = subDoc.data()?.name || matchedEntry.subjectId;
    }
  } catch {
    // ignore
  }

  // 7. Evaluate Policy (DEC-004)
  const opensAtMin = timeToMinutes(matchedEntry.attendanceOpensAt || matchedEntry.startTime);
  const lateCutoffMin = timeToMinutes(matchedEntry.lateCutoff || matchedEntry.startTime);
  const finalDeadlineMin = timeToMinutes(matchedEntry.finalDeadline || matchedEntry.endTime);

  if (currentMinutes < opensAtMin) {
    statusResult = 'Rejected';
    rejectionReason = `Too Early: Attendance opens at ${matchedEntry.attendanceOpensAt}.`;
  } else if (currentMinutes <= lateCutoffMin) {
    statusResult = 'Present';
  } else if (currentMinutes <= finalDeadlineMin) {
    statusResult = 'Late';
  } else {
    statusResult = 'Rejected';
    rejectionReason = `Session Closed: Deadline was ${matchedEntry.finalDeadline}.`;
  }

  // 8. If Rejected (Too Early or Session Closed)
  if (statusResult === 'Rejected') {
    const eventDoc: DeviceEvent = {
      eventId,
      deviceId,
      eventType: 'scan',
      fingerprintRef,
      studentId: student.studentId,
      studentName: student.fullName,
      rollNumber: student.rollNumber,
      sessionId: `${matchedEntry.timetableId}_${todayDateStr}`,
      subjectName,
      result: 'Rejected',
      rejectionReason,
      capturedAt: timestamp,
      receivedAt: FieldValue.serverTimestamp(),
      processingStatus: 'rejected',
    };
    await db.collection('deviceEvents').doc(eventId).set(eventDoc);

    return {
      status: 'rejected',
      eventId,
      result: 'Rejected',
      message: rejectionReason || 'Scan rejected by institutional policy.',
      student: {
        studentId: student.studentId,
        fullName: student.fullName,
        rollNumber: student.rollNumber,
        classId: student.classId,
        className: student.className,
      },
      lecture: {
        timetableId: matchedEntry.timetableId,
        subjectId: matchedEntry.subjectId,
        subjectName,
        classId: matchedEntry.classId,
        room: matchedEntry.room,
        startTime: matchedEntry.startTime,
        endTime: matchedEntry.endTime,
      },
    };
  }

  // 9. Concurrency Protection & Idempotency Transaction (DEC-005)
  const sessionId = `${matchedEntry.timetableId}_${todayDateStr}`;
  const deterministicAttendanceId = `${student.studentId}_${sessionId}`;
  const attendanceDocRef = db.collection('attendance').doc(deterministicAttendanceId);
  const eventDocRef = db.collection('deviceEvents').doc(eventId);

  const transactionResult = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(attendanceDocRef);

    if (existing.exists) {
      // Duplicate scan detected
      const duplicateEvent: DeviceEvent = {
        eventId,
        deviceId,
        eventType: 'scan',
        fingerprintRef,
        studentId: student.studentId,
        studentName: student.fullName,
        rollNumber: student.rollNumber,
        sessionId,
        subjectName,
        result: 'Duplicate',
        rejectionReason: `Student already marked attendance at ${existing.data()?.capturedAt || 'earlier'}`,
        capturedAt: timestamp,
        receivedAt: FieldValue.serverTimestamp(),
        processingStatus: 'duplicate_ignored',
      };
      transaction.set(eventDocRef, duplicateEvent);
      return { isDuplicate: true, attendanceData: existing.data() };
    }

    // Record new authoritative attendance record
    const attendanceRecord: AttendanceRecord = {
      attendanceId: deterministicAttendanceId,
      studentId: student.studentId,
      sessionId,
      classId: student.classId,
      subjectId: matchedEntry.subjectId,
      lectureDate: todayDateStr,
      status: statusResult as 'Present' | 'Late',
      capturedAt: timestamp,
      receivedAt: FieldValue.serverTimestamp(),
      processedAt: FieldValue.serverTimestamp(),
      deviceId,
      eventId,
    };

    const newEvent: DeviceEvent = {
      eventId,
      deviceId,
      eventType: 'scan',
      fingerprintRef,
      studentId: student.studentId,
      studentName: student.fullName,
      rollNumber: student.rollNumber,
      sessionId,
      subjectName,
      result: statusResult,
      capturedAt: timestamp,
      receivedAt: FieldValue.serverTimestamp(),
      processingStatus: 'processed',
    };

    transaction.set(attendanceDocRef, attendanceRecord);
    transaction.set(eventDocRef, newEvent);

    return { isDuplicate: false, attendanceRecord };
  });

  if (transactionResult.isDuplicate) {
    return {
      status: 'duplicate',
      eventId,
      result: 'Duplicate',
      message: `Attendance already recorded for ${student.fullName} in ${subjectName}.`,
      student: {
        studentId: student.studentId,
        fullName: student.fullName,
        rollNumber: student.rollNumber,
        classId: student.classId,
        className: student.className,
      },
      lecture: {
        timetableId: matchedEntry.timetableId,
        subjectId: matchedEntry.subjectId,
        subjectName,
        classId: matchedEntry.classId,
        room: matchedEntry.room,
        startTime: matchedEntry.startTime,
        endTime: matchedEntry.endTime,
      },
    };
  }

  return {
    status: 'success',
    eventId,
    result: statusResult,
    message: `Attendance recorded as ${statusResult} for ${student.fullName} (${subjectName}).`,
    student: {
      studentId: student.studentId,
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      classId: student.classId,
      className: student.className,
    },
    lecture: {
      timetableId: matchedEntry.timetableId,
      subjectId: matchedEntry.subjectId,
      subjectName,
      classId: matchedEntry.classId,
      room: matchedEntry.room,
      startTime: matchedEntry.startTime,
      endTime: matchedEntry.endTime,
    },
    attendanceRecord: transactionResult.attendanceRecord,
  };
}

/**
 * Device Heartbeat processor implementing Section 2.2
 */
export async function processDeviceHeartbeat(
  db: Firestore,
  headers: IngestionHeaders,
  payload: HeartbeatPayload,
  rawBody: string = ''
): Promise<{ status: string; pendingEnrollment: any }> {
  const { deviceId } = headers;

  // Verify device signature if provided
  const authCheck = await verifyDeviceSignature(db, headers, rawBody);
  if (!authCheck.valid) {
    throw new Error(authCheck.error || 'Device verification failed.');
  }

  // Update device status and telemetry
  const deviceRef = db.collection('devices').doc(deviceId);
  await deviceRef.set(
    {
      lastHeartbeatAt: FieldValue.serverTimestamp(),
      status: 'online',
      sensorStatus: payload.sensorStatus || 'ok',
      firmwareVersion: payload.firmwareVersion || 'v1.2.0',
      wifiSignalRssi: payload.wifiSignalRssi ?? -60,
      freeHeap: payload.freeHeap ?? 180000,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Check for any pending enrollment requests targeted to this device
  const pendingSnap = await db
    .collection('enrollmentRequests')
    .where('deviceId', '==', deviceId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  let pendingEnrollment: any = null;
  if (!pendingSnap.empty) {
    const doc = pendingSnap.docs[0];
    const data = doc.data();
    pendingEnrollment = {
      requestId: doc.id,
      studentId: data.studentId,
      studentName: data.studentName,
      rollNumber: data.rollNumber,
    };
  }

  return {
    status: 'acknowledged',
    pendingEnrollment,
  };
}
