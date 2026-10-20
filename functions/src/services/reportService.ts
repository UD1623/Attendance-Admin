import { Firestore } from 'firebase-admin/firestore';
import ExcelJS from 'exceljs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  Packer,
  WidthType,
  AlignmentType,
  HeadingLevel,
} from 'docx';
import { AttendanceRecord, Student, AcademicClass, TimetableEntry } from '../shared/types';

export interface ReportQueryInput {
  classId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  subjectId?: string;
}

export interface StudentReportItem {
  studentId: string;
  fullName: string;
  rollNumber: string;
  scheduledLectures: number;
  presentCount: number;
  lateCount: number;
  attendedCount: number;
  excusedCount: number;
  derivedAbsentCount: number; // DEC-006: mathematically derived
  attendancePercentage: number;
  isDefaulter: boolean;
}

export interface NormalizedReportDataset {
  classId: string;
  className: string;
  classCode: string;
  academicYear: string;
  department: string;
  startDate: string;
  endDate: string;
  subjectFilter?: string;
  lowAttendanceThreshold: number;
  totalScheduledLectures: number;
  totalStudents: number;
  classAveragePercentage: number;
  defaulterCount: number;
  students: StudentReportItem[];
  generatedAt: string;
}

/**
 * Normalizes attendance data and mathematically derives absenteeism according to DEC-006
 */
export async function buildNormalizedReportDataset(
  db: Firestore,
  input: ReportQueryInput
): Promise<NormalizedReportDataset> {
  const { classId, startDate, endDate, subjectId } = input;

  if (!classId || !startDate || !endDate) {
    throw new Error('classId, startDate, and endDate are required for report generation.');
  }

  // 1. Fetch Class Info
  const classDoc = await db.collection('classes').doc(classId).get();
  const classData = (classDoc.exists ? classDoc.data() : {}) as Partial<AcademicClass>;
  const className = classData.name || classId;
  const classCode = classData.code || classId;
  const department = classData.department || 'Faculty of Engineering & Technology';
  const academicYear = classData.academicYear || '2024-2025';

  // 2. Fetch Institutional Settings (Threshold)
  let threshold = 75;
  try {
    const settingsDoc = await db.collection('settings').doc('institution').get();
    if (settingsDoc.exists) {
      threshold = settingsDoc.data()?.lowAttendanceThreshold || 75;
    }
  } catch {
    // default 75
  }

  // 3. Fetch Active Students in Class
  const studentsSnap = await db
    .collection('students')
    .where('classId', '==', classId)
    .where('active', '==', true)
    .get();

  const studentsList: Student[] = studentsSnap.docs
    .map((d) => ({ ...d.data(), studentId: d.id } as Student))
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  // 4. Fetch Active Timetable Entries for Class
  const timetableSnap = await db
    .collection('timetable')
    .where('classId', '==', classId)
    .where('active', '==', true)
    .get();

  let timetableEntries: TimetableEntry[] = timetableSnap.docs.map(
    (d) => ({ ...d.data(), timetableId: d.id } as TimetableEntry)
  );

  if (subjectId) {
    timetableEntries = timetableEntries.filter((t) => t.subjectId === subjectId);
  }

  // 5. Fetch Holidays in Range
  const holidaysSet = new Set<string>();
  try {
    const holidaysSnap = await db.collection('holidays').get();
    holidaysSnap.forEach((d) => {
      const data = d.data();
      if (data.date >= startDate && data.date <= endDate) {
        holidaysSet.add(data.date);
      }
    });
  } catch {
    // ignore
  }

  // 6. Calculate Scheduled Lectures between startDate and endDate
  const start = new Date(startDate);
  const end = new Date(endDate);
  let totalScheduledCount = 0;

  const current = new Date(start);
  while (current <= end) {
    const isoDate = current.toISOString().split('T')[0];

    // Check holiday
    if (!holidaysSet.has(isoDate)) {
      const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay(); // 1=Mon .. 6=Sat

      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const lecturesToday = timetableEntries.filter((t) => t.dayOfWeek === dayOfWeek);
        totalScheduledCount += lecturesToday.length;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  // Fallback: If no scheduled timetable matched the simulated date range, ensure totalScheduled is at least 1 or count of attendance events
  if (totalScheduledCount === 0) {
    totalScheduledCount = Math.max(1, timetableEntries.length);
  }

  // 7. Fetch Attendance Records in Range
  const attendanceSnap = await db
    .collection('attendance')
    .where('classId', '==', classId)
    .get();

  const relevantAttendance = attendanceSnap.docs
    .map((d) => d.data() as AttendanceRecord)
    .filter((r) => {
      if (r.lectureDate < startDate || r.lectureDate > endDate) return false;
      if (subjectId && r.subjectId !== subjectId) return false;
      return true;
    });

  // Group attendance records by studentId
  const studentAttendanceMap = new Map<string, AttendanceRecord[]>();
  for (const rec of relevantAttendance) {
    if (!studentAttendanceMap.has(rec.studentId)) {
      studentAttendanceMap.set(rec.studentId, []);
    }
    studentAttendanceMap.get(rec.studentId)!.push(rec);
  }

  // 8. Mathematically derive student metrics (DEC-006)
  let totalPercentageSum = 0;
  let defaulterCount = 0;

  const studentItems: StudentReportItem[] = studentsList.map((st) => {
    const records = studentAttendanceMap.get(st.studentId) || [];

    let presentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;

    for (const r of records) {
      if (r.status === 'Present') presentCount++;
      else if (r.status === 'Late') lateCount++;
      else if (r.status === 'Excused') excusedCount++;
    }

    const attendedCount = presentCount + lateCount;
    // Scheduled instances student was expected to attend: scheduled - excused
    const effectiveScheduled = Math.max(1, totalScheduledCount - excusedCount);

    // Derived Absent: scheduled - excused - present - late
    const derivedAbsentCount = Math.max(0, totalScheduledCount - excusedCount - attendedCount);

    const percentage = Math.min(
      100,
      Math.round((attendedCount / effectiveScheduled) * 100)
    );

    const isDefaulter = percentage < threshold;
    if (isDefaulter) defaulterCount++;
    totalPercentageSum += percentage;

    return {
      studentId: st.studentId,
      fullName: st.fullName,
      rollNumber: st.rollNumber,
      scheduledLectures: totalScheduledCount,
      presentCount,
      lateCount,
      attendedCount,
      excusedCount,
      derivedAbsentCount,
      attendancePercentage: percentage,
      isDefaulter,
    };
  });

  const totalStudents = studentItems.length;
  const classAveragePercentage =
    totalStudents > 0 ? Math.round(totalPercentageSum / totalStudents) : 0;

  return {
    classId,
    className,
    classCode,
    academicYear,
    department,
    startDate,
    endDate,
    subjectFilter: subjectId,
    lowAttendanceThreshold: threshold,
    totalScheduledLectures: totalScheduledCount,
    totalStudents,
    classAveragePercentage,
    defaulterCount,
    students: studentItems,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Server-side Excel report renderer using ExcelJS (DEC-007)
 */
export async function renderExcelReport(data: NormalizedReportDataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Attendance System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Attendance Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  // Institutional Title
  sheet.mergeCells('A1:I1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `${data.department.toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:I2');
  const subTitleCell = sheet.getCell('A2');
  subTitleCell.value = `OFFICIAL ATTENDANCE REGISTER & DEFICIENCY REPORT (${data.academicYear})`;
  subTitleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF334155' } };
  subTitleCell.alignment = { horizontal: 'center' };

  // Metadata Block
  sheet.addRow([]);
  sheet.addRow(['Class:', `${data.className} (${data.classCode})`, '', 'Period:', `${data.startDate} to ${data.endDate}`]);
  sheet.addRow(['Total Lectures:', data.totalScheduledLectures, '', 'Class Average:', `${data.classAveragePercentage}%`]);
  sheet.addRow(['Total Students:', data.totalStudents, '', 'Defaulters (<75%):', `${data.defaulterCount} students`]);
  sheet.addRow([]);

  // Table Headers
  const headerRow = sheet.addRow([
    'Roll Number',
    'Student Full Name',
    'Lectures Scheduled',
    'Present (On-Time)',
    'Late Arrivals',
    'Excused Leave',
    'Derived Absent',
    'Attendance Rate',
    'Academic Status',
  ]);

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Student Data Rows
  data.students.forEach((s) => {
    const row = sheet.addRow([
      s.rollNumber,
      s.fullName,
      s.scheduledLectures,
      s.presentCount,
      s.lateCount,
      s.excusedCount,
      s.derivedAbsentCount,
      `${s.attendancePercentage}%`,
      s.isDefaulter ? 'DEFAULTER (<75%)' : 'Satisfactory',
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).alignment = { horizontal: 'center' };
    row.getCell(9).alignment = { horizontal: 'center' };

    // Defaulter highlighting
    if (s.isDefaulter) {
      row.getCell(8).font = { bold: true, color: { argb: 'FFDC2626' } };
      row.getCell(9).font = { bold: true, color: { argb: 'FFDC2626' } };
      row.getCell(9).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' },
      };
    } else {
      row.getCell(8).font = { bold: true, color: { argb: 'FF16A34A' } };
      row.getCell(9).font = { color: { argb: 'FF16A34A' } };
    }
  });

  // Column Widths
  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 15;
  sheet.getColumn(6).width = 15;
  sheet.getColumn(7).width = 16;
  sheet.getColumn(8).width = 18;
  sheet.getColumn(9).width = 22;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Server-side PDF report renderer using pdf-lib (DEC-007)
 */
export async function renderPdfReport(data: NormalizedReportDataset): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = height - 40;

  // Header Banner
  page.drawText(data.department.toUpperCase(), {
    x: 40,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.12, 0.23, 0.54),
  });
  y -= 16;

  page.drawText(`OFFICIAL ATTENDANCE REPORT & DEFICIENCY REGISTER`, {
    x: 40,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 18;

  // Divider Line
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1.5,
    color: rgb(0.15, 0.39, 0.92),
  });
  y -= 18;

  // Metadata block
  page.drawText(`Class: ${data.className} (${data.classCode})`, { x: 40, y, size: 9, font: fontBold });
  page.drawText(`Date Range: ${data.startDate} to ${data.endDate}`, { x: 340, y, size: 9, font: fontRegular });
  y -= 14;

  page.drawText(`Scheduled Lectures: ${data.totalScheduledLectures}`, { x: 40, y, size: 9, font: fontRegular });
  page.drawText(`Class Average: ${data.classAveragePercentage}%`, { x: 200, y, size: 9, font: fontBold });
  page.drawText(`Defaulters (<75%): ${data.defaulterCount}`, {
    x: 340,
    y,
    size: 9,
    font: fontBold,
    color: data.defaulterCount > 0 ? rgb(0.86, 0.15, 0.15) : rgb(0.1, 0.6, 0.2),
  });
  y -= 22;

  // Table Headers
  const colX = [40, 120, 240, 290, 340, 390, 440, 500];
  page.drawRectangle({
    x: 40,
    y: y - 4,
    width: width - 80,
    height: 18,
    color: rgb(0.15, 0.39, 0.92),
  });

  const headers = ['Roll No', 'Student Name', 'Present', 'Late', 'Excused', 'Absent', 'Rate', 'Status'];
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: colX[i] + 4,
      y: y + 1,
      size: 8,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  });
  y -= 20;

  // Rows
  for (let i = 0; i < data.students.length; i++) {
    const s = data.students[i];

    // Page overflow protection
    if (y < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = height - 50;
    }

    // Zebra striping
    if (i % 2 === 1) {
      page.drawRectangle({
        x: 40,
        y: y - 3,
        width: width - 80,
        height: 16,
        color: rgb(0.96, 0.97, 0.98),
      });
    }

    page.drawText(s.rollNumber, { x: colX[0] + 4, y: y + 2, size: 8, font: fontRegular });
    page.drawText(s.fullName.slice(0, 20), { x: colX[1] + 4, y: y + 2, size: 8, font: fontRegular });
    page.drawText(String(s.presentCount), { x: colX[2] + 4, y: y + 2, size: 8, font: fontRegular });
    page.drawText(String(s.lateCount), { x: colX[3] + 4, y: y + 2, size: 8, font: fontRegular });
    page.drawText(String(s.excusedCount), { x: colX[4] + 4, y: y + 2, size: 8, font: fontRegular });
    page.drawText(String(s.derivedAbsentCount), { x: colX[5] + 4, y: y + 2, size: 8, font: fontRegular });

    const rateColor = s.isDefaulter ? rgb(0.85, 0.15, 0.15) : rgb(0.1, 0.6, 0.2);
    page.drawText(`${s.attendancePercentage}%`, {
      x: colX[6] + 4,
      y: y + 2,
      size: 8,
      font: fontBold,
      color: rateColor,
    });

    page.drawText(s.isDefaulter ? 'DEFAULTER' : 'OK', {
      x: colX[7] + 4,
      y: y + 2,
      size: 8,
      font: fontBold,
      color: rateColor,
    });

    y -= 16;
  }

  // Footer Signatures
  y -= 30;
  if (y < 60) {
    page = pdfDoc.addPage([595.28, 841.89]);
    y = height - 80;
  }

  page.drawLine({ start: { x: 60, y }, end: { x: 200, y }, thickness: 1, color: rgb(0.5, 0.5, 0.5) });
  page.drawLine({ start: { x: 360, y }, end: { x: 500, y }, thickness: 1, color: rgb(0.5, 0.5, 0.5) });
  y -= 12;

  page.drawText('Course Coordinator / Faculty', { x: 65, y, size: 8, font: fontRegular });
  page.drawText('Head of Department / Dean', { x: 375, y, size: 8, font: fontRegular });

  return await pdfDoc.save();
}

/**
 * Server-side Word report renderer using docx (DEC-007)
 */
export async function renderWordReport(data: NormalizedReportDataset): Promise<Buffer> {
  const tableRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Roll No', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Student Name', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Lectures', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Present', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Late', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Excused', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Absent', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Attendance %', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true, color: 'FFFFFF' })] })], shading: { fill: '2563EB' } }),
      ],
    }),
  ];

  data.students.forEach((s) => {
    const statusColor = s.isDefaulter ? 'DC2626' : '16A34A';
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(s.rollNumber)] }),
          new TableCell({ children: [new Paragraph(s.fullName)] }),
          new TableCell({ children: [new Paragraph(String(s.scheduledLectures))] }),
          new TableCell({ children: [new Paragraph(String(s.presentCount))] }),
          new TableCell({ children: [new Paragraph(String(s.lateCount))] }),
          new TableCell({ children: [new Paragraph(String(s.excusedCount))] }),
          new TableCell({ children: [new Paragraph(String(s.derivedAbsentCount))] }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: `${s.attendancePercentage}%`, bold: true, color: statusColor })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: s.isDefaulter ? 'DEFAULTER' : 'Satisfactory', bold: s.isDefaulter, color: statusColor })],
              }),
            ],
          }),
        ],
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: data.department.toUpperCase(),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `ATTENDANCE REPORT & DEFICIENCY REGISTER`,
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: `Class: `, bold: true }),
              new TextRun(`${data.className} (${data.classCode})`),
              new TextRun({ text: `     Date Range: `, bold: true }),
              new TextRun(`${data.startDate} to ${data.endDate}`),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Total Scheduled Lectures: `, bold: true }),
              new TextRun(`${data.totalScheduledLectures}`),
              new TextRun({ text: `     Class Average Attendance: `, bold: true }),
              new TextRun(`${data.classAveragePercentage}%`),
              new TextRun({ text: `     Defaulters (<75%): `, bold: true }),
              new TextRun({ text: `${data.defaulterCount}`, bold: true, color: data.defaulterCount > 0 ? 'DC2626' : '16A34A' }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: `Generated on ${new Date(data.generatedAt).toLocaleString()} by Smart Attendance System Authoritative Cloud Service.`,
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
