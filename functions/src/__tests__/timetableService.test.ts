import { describe, it, expect, beforeEach } from 'vitest';
import { createMockFirestore } from './mockFirestore';
import {
  computeTimingWindows,
  parseMinutes,
  formatMinutes,
  checkIntervalOverlap,
  validateTimetableConflicts,
  createTimetableEntry,
} from '../services/timetableService';

describe('timetableService', () => {
  let db: any;
  const actor = { uid: 'admin_1', email: 'admin@college.edu' };

  beforeEach(() => {
    db = createMockFirestore();
    db.collection('settings').doc('institution').set({
      attendanceOpensBeforeMinutes: 5,
      lateToleranceMinutes: 10,
    });
  });

  describe('timing window math', () => {
    it('parses minutes and formats minutes accurately', () => {
      expect(parseMinutes('09:00')).toBe(540);
      expect(parseMinutes('10:30')).toBe(630);
      expect(formatMinutes(540)).toBe('09:00');
      expect(formatMinutes(630)).toBe('10:30');
    });

    it('computes attendance timing windows correctly', () => {
      const windows = computeTimingWindows('09:00', '10:00', 5, 10);
      expect(windows.attendanceOpensAt).toBe('08:55');
      expect(windows.lateCutoff).toBe('09:10');
      expect(windows.finalDeadline).toBe('10:00');
    });

    it('rejects end time before start time', () => {
      expect(() => computeTimingWindows('10:00', '09:00')).toThrow();
    });

    it('identifies interval overlaps', () => {
      // 09:00 - 10:00 vs 09:30 - 10:30 -> overlap
      expect(checkIntervalOverlap(540, 600, 570, 630)).toBe(true);
      // 09:00 - 10:00 vs 10:00 - 11:00 -> adjacent, no overlap
      expect(checkIntervalOverlap(540, 600, 600, 660)).toBe(false);
    });
  });

  describe('conflict validation', () => {
    it('detects class schedule conflicts on the same day', async () => {
      await createTimetableEntry(
        db,
        {
          classId: 'class_ce_1',
          subjectId: 'sub_os',
          dayOfWeek: 1, // Mon
          startTime: '09:00',
          endTime: '10:00',
          room: 'LH-101',
          faculty: 'Dr. Turing',
        },
        actor
      );

      const conflictCheck = await validateTimetableConflicts(db, {
        classId: 'class_ce_1',
        dayOfWeek: 1,
        startTime: '09:30',
        endTime: '10:30',
      });

      expect(conflictCheck.valid).toBe(false);
      expect(conflictCheck.conflicts[0]).toMatch(/already has a scheduled lecture/);
    });

    it('detects room booking conflicts on the same day', async () => {
      await createTimetableEntry(
        db,
        {
          classId: 'class_ce_1',
          subjectId: 'sub_os',
          dayOfWeek: 2, // Tue
          startTime: '10:00',
          endTime: '11:00',
          room: 'Lab-A',
        },
        actor
      );

      const conflictCheck = await validateTimetableConflicts(db, {
        classId: 'class_other',
        dayOfWeek: 2,
        startTime: '10:30',
        endTime: '11:30',
        room: 'Lab-A',
      });

      expect(conflictCheck.valid).toBe(false);
      expect(conflictCheck.conflicts[0]).toMatch(/Room 'Lab-A' is already booked/);
    });

    it('allows non-overlapping sessions on the same day', async () => {
      await createTimetableEntry(
        db,
        {
          classId: 'class_ce_1',
          subjectId: 'sub_os',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '10:00',
        },
        actor
      );

      const conflictCheck = await validateTimetableConflicts(db, {
        classId: 'class_ce_1',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '11:00',
      });

      expect(conflictCheck.valid).toBe(true);
      expect(conflictCheck.conflicts).toHaveLength(0);
    });
  });
});
