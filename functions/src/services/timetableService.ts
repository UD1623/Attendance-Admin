import * as admin from 'firebase-admin';
import { TimetableEntry } from '../shared/types';
import { writeAuditLog } from './auditService';
import { ActorInfo } from './studentService';

export interface CreateTimetableInput {
  classId: string;
  subjectId: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  room?: string;
  faculty?: string;
  active?: boolean;
}

export interface UpdateTimetableInput extends CreateTimetableInput {
  timetableId: string;
}

export function parseMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return NaN;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

export function formatMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function computeTimingWindows(
  startTime: string,
  endTime: string,
  opensBeforeMinutes: number = 5,
  lateToleranceMinutes: number = 10
) {
  const startM = parseMinutes(startTime);
  const endM = parseMinutes(endTime);

  if (isNaN(startM) || isNaN(endM) || endM <= startM) {
    throw new Error('Invalid lecture times. End time must be strictly after start time.');
  }

  const attendanceOpensAt = formatMinutes(startM - opensBeforeMinutes);
  const lateCutoff = formatMinutes(startM + lateToleranceMinutes);
  const finalDeadline = endTime;

  return {
    attendanceOpensAt,
    lateCutoff,
    finalDeadline,
  };
}

export function checkIntervalOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  return Math.max(start1, start2) < Math.min(end1, end2);
}

export async function validateTimetableConflicts(
  db: admin.firestore.Firestore,
  input: {
    classId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    room?: string;
    faculty?: string;
    excludeId?: string;
  }
): Promise<{ valid: boolean; conflicts: string[] }> {
  const startM = parseMinutes(input.startTime);
  const endM = parseMinutes(input.endTime);

  if (isNaN(startM) || isNaN(endM)) {
    return { valid: false, conflicts: ['Invalid start or end time format (must be HH:MM).'] };
  }
  if (endM <= startM) {
    return { valid: false, conflicts: ['End time must be later than start time.'] };
  }

  const conflicts: string[] = [];

  // Query existing timetable entries for the same day
  const snapshot = await db
    .collection('timetable')
    .where('dayOfWeek', '==', input.dayOfWeek)
    .where('active', '==', true)
    .get();

  for (const doc of snapshot.docs) {
    if (input.excludeId && doc.id === input.excludeId) continue;
    const entry = doc.data() as TimetableEntry;
    const eStartM = parseMinutes(entry.startTime);
    const eEndM = parseMinutes(entry.endTime);

    if (checkIntervalOverlap(startM, endM, eStartM, eEndM)) {
      if (entry.classId === input.classId) {
        conflicts.push(
          `Class already has a scheduled lecture from ${entry.startTime} to ${entry.endTime}.`
        );
      }
      if (input.room && entry.room && input.room.toLowerCase() === entry.room.toLowerCase()) {
        conflicts.push(
          `Room '${input.room}' is already booked from ${entry.startTime} to ${entry.endTime}.`
        );
      }
      if (input.faculty && entry.faculty && input.faculty.toLowerCase() === entry.faculty.toLowerCase()) {
        conflicts.push(
          `Faculty instructor '${input.faculty}' is already assigned from ${entry.startTime} to ${entry.endTime}.`
        );
      }
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
}

export async function createTimetableEntry(
  db: admin.firestore.Firestore,
  input: CreateTimetableInput,
  actor: ActorInfo
): Promise<TimetableEntry> {
  const validation = await validateTimetableConflicts(db, {
    classId: input.classId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    room: input.room,
    faculty: input.faculty,
  });

  if (!validation.valid) {
    throw new Error(`Schedule Conflict: ${validation.conflicts.join(' ')}`);
  }

  // Fetch institution settings for windows
  const settingsDoc = await db.collection('settings').doc('institution').get();
  const settings = settingsDoc.data();
  const opensBefore = settings?.attendanceOpensBeforeMinutes ?? 5;
  const lateTol = settings?.lateToleranceMinutes ?? 10;

  const windows = computeTimingWindows(input.startTime, input.endTime, opensBefore, lateTol);

  const timetableRef = db.collection('timetable').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const entry: TimetableEntry = {
    timetableId: timetableRef.id,
    classId: input.classId,
    subjectId: input.subjectId,
    dayOfWeek: input.dayOfWeek,
    sessionType: 'lecture',
    startTime: input.startTime,
    endTime: input.endTime,
    attendanceOpensAt: windows.attendanceOpensAt,
    lateCutoff: windows.lateCutoff,
    finalDeadline: windows.finalDeadline,
    room: input.room?.trim() || '',
    faculty: input.faculty?.trim() || '',
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };

  await timetableRef.set(entry);

  await writeAuditLog(db, {
    action: 'TIMETABLE_ENTRY_CREATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'timetable',
    targetId: timetableRef.id,
    details: {
      classId: input.classId,
      subjectId: input.subjectId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    },
  });

  return entry;
}

export async function updateTimetableEntry(
  db: admin.firestore.Firestore,
  input: UpdateTimetableInput,
  actor: ActorInfo
): Promise<void> {
  const timetableRef = db.collection('timetable').doc(input.timetableId);
  const snap = await timetableRef.get();
  if (!snap.exists) {
    throw new Error(`Timetable entry '${input.timetableId}' not found.`);
  }

  const validation = await validateTimetableConflicts(db, {
    classId: input.classId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    room: input.room,
    faculty: input.faculty,
    excludeId: input.timetableId,
  });

  if (!validation.valid) {
    throw new Error(`Schedule Conflict: ${validation.conflicts.join(' ')}`);
  }

  const settingsDoc = await db.collection('settings').doc('institution').get();
  const settings = settingsDoc.data();
  const opensBefore = settings?.attendanceOpensBeforeMinutes ?? 5;
  const lateTol = settings?.lateToleranceMinutes ?? 10;

  const windows = computeTimingWindows(input.startTime, input.endTime, opensBefore, lateTol);

  await timetableRef.update({
    classId: input.classId,
    subjectId: input.subjectId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    attendanceOpensAt: windows.attendanceOpensAt,
    lateCutoff: windows.lateCutoff,
    finalDeadline: windows.finalDeadline,
    room: input.room?.trim() || '',
    faculty: input.faculty?.trim() || '',
    active: input.active !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog(db, {
    action: 'TIMETABLE_ENTRY_UPDATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'timetable',
    targetId: input.timetableId,
    details: {
      classId: input.classId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    },
  });
}

export async function deleteTimetableEntry(
  db: admin.firestore.Firestore,
  timetableId: string,
  actor: ActorInfo
): Promise<void> {
  const timetableRef = db.collection('timetable').doc(timetableId);
  const snap = await timetableRef.get();
  if (!snap.exists) {
    throw new Error(`Timetable entry '${timetableId}' not found.`);
  }

  await timetableRef.delete();

  await writeAuditLog(db, {
    action: 'TIMETABLE_ENTRY_DELETED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'timetable',
    targetId: timetableId,
  });
}
