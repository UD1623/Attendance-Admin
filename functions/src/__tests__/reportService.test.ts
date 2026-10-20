import { describe, it, expect, beforeEach } from 'vitest';
import { createMockFirestore } from './mockFirestore';
import {
  buildNormalizedReportDataset,
  renderExcelReport,
  renderPdfReport,
  renderWordReport,
} from '../services/reportService';

describe('reportService', () => {
  let db: any;

  beforeEach(async () => {
    db = createMockFirestore();

    // Seed class
    await db.collection('classes').doc('class_ce_5a').set({
      classId: 'class_ce_5a',
      name: 'Computer Engineering - Semester 5 - Div A',
      code: 'CE-5A',
      department: 'Computer Science & Engineering',
      academicYear: '2024-2025',
    });

    // Seed settings (75% threshold)
    await db.collection('settings').doc('institution').set({
      lowAttendanceThreshold: 75,
    });

    // Seed students
    await db.collection('students').doc('std_101').set({
      studentId: 'std_101',
      fullName: 'Aarav Sharma',
      rollNumber: 'CS-2024-001',
      classId: 'class_ce_5a',
      active: true,
    });

    await db.collection('students').doc('std_102').set({
      studentId: 'std_102',
      fullName: 'Ananya Patel',
      rollNumber: 'CS-2024-002',
      classId: 'class_ce_5a',
      active: true,
    });

    // Seed timetable entry (Monday 09:00 - 10:00)
    await db.collection('timetable').doc('tt_mon_os_5a').set({
      timetableId: 'tt_mon_os_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_os',
      dayOfWeek: 1, // Monday
      active: true,
    });

    // Seed attendance records for 2026-10-19 (Monday)
    // Aarav attended (Present)
    await db.collection('attendance').doc('std_101_sess_1').set({
      attendanceId: 'std_101_sess_1',
      studentId: 'std_101',
      classId: 'class_ce_5a',
      subjectId: 'sub_os',
      lectureDate: '2026-10-19',
      status: 'Present',
    });

    // Ananya did NOT attend (no attendance doc written - DEC-006 derived absenteeism)
  });

  describe('Normalized Dataset Builder (DEC-006)', () => {
    it('mathematically derives absenteeism without absent docs in database', async () => {
      const report = await buildNormalizedReportDataset(db, {
        classId: 'class_ce_5a',
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      });

      expect(report.totalStudents).toBe(2);
      expect(report.totalScheduledLectures).toBe(1);

      // Aarav: 1 present, 0 absent -> 100% -> Not Defaulter
      const aarav = report.students.find((s) => s.studentId === 'std_101')!;
      expect(aarav.presentCount).toBe(1);
      expect(aarav.derivedAbsentCount).toBe(0);
      expect(aarav.attendancePercentage).toBe(100);
      expect(aarav.isDefaulter).toBe(false);

      // Ananya: 0 present, 1 derived absent -> 0% -> Defaulter (< 75%)
      const ananya = report.students.find((s) => s.studentId === 'std_102')!;
      expect(ananya.presentCount).toBe(0);
      expect(ananya.derivedAbsentCount).toBe(1);
      expect(ananya.attendancePercentage).toBe(0);
      expect(ananya.isDefaulter).toBe(true);

      // Class average: (100 + 0) / 2 = 50%
      expect(report.classAveragePercentage).toBe(50);
      expect(report.defaulterCount).toBe(1);
    });

    it('accounts for Excused absences in effective scheduled count', async () => {
      // Mark Ananya as Excused
      await db.collection('attendance').doc('std_102_sess_1').set({
        attendanceId: 'std_102_sess_1',
        studentId: 'std_102',
        classId: 'class_ce_5a',
        subjectId: 'sub_os',
        lectureDate: '2026-10-19',
        status: 'Excused',
      });

      const report = await buildNormalizedReportDataset(db, {
        classId: 'class_ce_5a',
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      });

      const ananya = report.students.find((s) => s.studentId === 'std_102')!;
      expect(ananya.excusedCount).toBe(1);
      expect(ananya.derivedAbsentCount).toBe(0);
    });
  });

  describe('Server-Side Document Renderers (DEC-007)', () => {
    it('renders valid Excel workbook (.xlsx) buffer', async () => {
      const report = await buildNormalizedReportDataset(db, {
        classId: 'class_ce_5a',
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      });

      const buffer = await renderExcelReport(report);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(2000);
      // PK zip header (all xlsx files are zip archives starting with PK\x03\x04)
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });

    it('renders valid PDF document (.pdf) bytes with PDF header', async () => {
      const report = await buildNormalizedReportDataset(db, {
        classId: 'class_ce_5a',
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      });

      const pdfBytes = await renderPdfReport(report);
      expect(pdfBytes).toBeDefined();
      expect(pdfBytes.length).toBeGreaterThan(1000);
      // '%PDF' header check
      const headerStr = Buffer.from(pdfBytes.slice(0, 5)).toString('ascii');
      expect(headerStr).toContain('%PDF');
    });

    it('renders valid Word document (.docx) buffer', async () => {
      const report = await buildNormalizedReportDataset(db, {
        classId: 'class_ce_5a',
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      });

      const buffer = await renderWordReport(report);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(2000);
      // PK zip header
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    });
  });
});
