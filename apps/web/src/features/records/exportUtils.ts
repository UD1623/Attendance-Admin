import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  ImageRun,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  BorderStyle,
} from 'docx';

export interface ReportMetadata {
  institutionName: string;
  department: string;
  subject: string;
  time: string;
  date: string;
}

export interface ExportAttendanceRow {
  srNo: number;
  studentName: string;
  rollNumber: string;
  enrollmentId: string;
  status: string;
  checkInTime: string;
  device: string;
}

/**
 * Loads the SGGS Institute logo and renders a subtle semi-transparent watermark.
 */
export async function getWatermarkDataUrl(alpha: number = 0.07): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || 400;
        canvas.height = img.height || 400;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(img.src);
          return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('/sggs_logo.png');
      }
    };
    img.onerror = () => {
      resolve('/sggs_logo.png');
    };
    img.src = '/sggs_logo.png';
  });
}

/**
 * Trigger browser file download from Blob
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export Attendance Records to PDF in formal academic format for SGGS Institute.
 */
export async function exportAttendanceToPdf(
  rows: ExportAttendanceRow[],
  metadata: ReportMetadata
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Prepare subtle watermark image (~7% opacity, light and non-intrusive)
  let watermarkDataUrl: string | null = null;
  try {
    watermarkDataUrl = await getWatermarkDataUrl(0.07);
  } catch (err) {
    console.warn('Could not render canvas watermark:', err);
  }

  // Draw watermark centered on page (105mm x 105mm circular logo, aspect ratio preserved)
  const drawWatermark = () => {
    if (watermarkDataUrl) {
      const wmSize = 105;
      const x = (pageWidth - wmSize) / 2;
      const y = (pageHeight - wmSize) / 2;
      try {
        doc.addImage(watermarkDataUrl, 'PNG', x, y, wmSize, wmSize, undefined, 'FAST');
      } catch (e) {
        console.warn('Watermark drawing note:', e);
      }
    }
  };

  // Draw watermark on Page 1 before header & table
  drawWatermark();

  // 2. Institution Header (Centered, bold Times New Roman, 17 pt)
  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text(
    metadata.institutionName || 'SGGS Institute of Engineering and Technology, Nanded – 431606',
    pageWidth / 2,
    18,
    { align: 'center' }
  );

  // Decorative double horizontal rule below institution title
  doc.setDrawColor(26, 44, 91);
  doc.setLineWidth(0.6);
  doc.line(14, 23.5, pageWidth - 14, 23.5);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(14, 24.8, pageWidth - 14, 24.8);

  // 3. Dynamic Metadata Grid (Department, Subject, Time, Date)
  const leftColX = 16;
  const rightColX = 115;
  const metaStartY = 32;

  doc.setFontSize(10.5);

  // Line 1: Department & Date
  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Department: ', leftColX, metaStartY);
  doc.setFont('times', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(metadata.department || 'CSE (CSE-3A)', leftColX + 24, metaStartY);

  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Date: ', rightColX, metaStartY);
  doc.setFont('times', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(metadata.date || new Date().toISOString().split('T')[0], rightColX + 12, metaStartY);

  // Line 2: Subject & Time
  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Subject: ', leftColX, metaStartY + 6.5);
  doc.setFont('times', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(metadata.subject || 'Operating Systems (CS501)', leftColX + 24, metaStartY + 6.5);

  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Time: ', rightColX, metaStartY + 6.5);
  doc.setFont('times', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(metadata.time || '09:00 – 10:00 AM', rightColX + 12, metaStartY + 6.5);

  // Line separator
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(14, metaStartY + 11.5, pageWidth - 14, metaStartY + 11.5);

  // 4. Section Title (Centered, bold Times New Roman, 15 pt)
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('STUDENT ATTENDANCE RECORDS', pageWidth / 2, metaStartY + 19, { align: 'center' });

  // 5. Table Layout with jspdf-autotable
  const tableHeaders = [
    'Sr. No.',
    'Student Name',
    'Roll Number',
    'Enrollment No.',
    'Status',
    'Check-in Time',
    'Method / Device',
  ];

  const tableBody = rows.map((r) => [
    r.srNo,
    r.studentName,
    r.rollNumber,
    r.enrollmentId,
    r.status,
    r.checkInTime,
    r.device,
  ]);

  autoTable(doc, {
    startY: metaStartY + 23,
    margin: { left: 14, right: 14, bottom: 25 },
    head: [tableHeaders],
    body: tableBody,
    showHead: 'everyPage', // Repeats header on every page
    theme: 'grid',
    styles: {
      font: 'times',
      fontStyle: 'normal',
      fontSize: 9,
      cellPadding: 2.8,
      lineColor: [226, 232, 240], // Thin light-gray borders
      lineWidth: 0.15,
      textColor: [30, 41, 59], // Dark Slate neutral text for data
      overflow: 'linebreak',
    },
    headStyles: {
      font: 'times',
      fontStyle: 'bold',
      fontSize: 9.5,
      fillColor: [26, 44, 91], // Dark Navy Blue header background
      textColor: [255, 255, 255], // White bold header text
      halign: 'left',
      valign: 'middle',
      lineWidth: 0.15,
      lineColor: [26, 44, 91],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // Very light-gray alternating row background
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 }, // Sr. No.
      1: { cellWidth: 44 },                  // Student Name
      2: { cellWidth: 26 },                  // Roll Number
      3: { cellWidth: 26 },                  // Enrollment No.
      4: { halign: 'center', cellWidth: 22 }, // Status
      5: { halign: 'center', cellWidth: 26 }, // Check-in Time
      6: { halign: 'center', cellWidth: 24 }, // Method / Device
    },
    // CRITICAL REQUIREMENT: Color ONLY the attendance status word without touching row or cell background
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const rawStatus = String(data.cell.raw ?? '').trim().toLowerCase();
        data.cell.styles.font = 'times';
        data.cell.styles.fontStyle = 'bold';

        if (rawStatus === 'present') {
          data.cell.styles.textColor = [22, 163, 74]; // Green #16A34A
        } else if (rawStatus === 'rejected') {
          data.cell.styles.textColor = [220, 38, 38]; // Red #DC2626
        } else if (rawStatus === 'late') {
          data.cell.styles.textColor = [217, 119, 6]; // Amber #D97706
        } else if (rawStatus === 'excused' || rawStatus === 'absent') {
          data.cell.styles.textColor = [107, 114, 128]; // Gray #6B7280
        } else {
          data.cell.styles.textColor = [30, 41, 59];
        }
      }
    },
    willDrawPage: (data) => {
      // Draw watermark behind table on continuation pages
      if (data.pageNumber > 1) {
        drawWatermark();
      }
    },
  });

  // 6. Pagination, Formal Footer, & Project Credit across all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Subtle divider line above footer
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(14, 281, pageWidth - 14, 281);

    // Footer Line 1 (y = 286mm)
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(107, 114, 128); // #6B7280
    doc.text('SGGS Institute of Engineering and Technology, Nanded – 431606', 14, 286);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, 286, { align: 'right' });

    // Footer Line 2 (y = 291mm)
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('en-GB');
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    doc.text(`Generated: ${dateFormatted} at ${timeFormatted}`, 14, 291);

    // Project Credit: "Made by Group 19 (Aditya Hajare)" (Times New Roman, 9.5 pt, bold, #6B7280)
    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(107, 114, 128);
    doc.text('Made by Group 19 (Aditya Hajare)', pageWidth - 14, 291, { align: 'right' });
  }

  // 7. Save file with meaningful academic filename
  const filename = `SGGS_Attendance_Records_${metadata.date || new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

/**
 * Export Attendance Records to Microsoft Word (.docx) document
 * with watermark, Times New Roman typography, tables, and pagination.
 */
export async function exportAttendanceToDocx(
  rows: ExportAttendanceRow[],
  metadata: ReportMetadata
): Promise<void> {
  // 1. Prepare watermark image
  let watermarkDataUrl = '/sggs_logo.png';
  try {
    watermarkDataUrl = await getWatermarkDataUrl(0.12);
  } catch (err) {
    console.warn('Canvas watermark fallback:', err);
  }

  // 2. Build Word Document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 22, // 11pt
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1140, // ~20mm
              right: 1140,
              bottom: 1140,
              left: 1140,
            },
          },
        },
        // Header with light semi-transparent institute watermark floating in center of page
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: watermarkDataUrl,
                    transformation: {
                      width: 380,
                      height: 380,
                    },
                    floating: {
                      horizontalPosition: {
                        relative: HorizontalPositionRelativeFrom.PAGE,
                        align: HorizontalPositionAlign.CENTER,
                      },
                      verticalPosition: {
                        relative: VerticalPositionRelativeFrom.PAGE,
                        align: VerticalPositionAlign.CENTER,
                      },
                      wrap: {
                        type: TextWrappingType.NONE,
                      },
                      behindDocument: true,
                    },
                  }),
                ],
              }),
            ],
          }),
        },
        // Footer with formal Page numbering
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Page ',
                    font: 'Times New Roman',
                    size: 18, // 9pt
                    color: '666666',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Times New Roman',
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    text: ' of ',
                    font: 'Times New Roman',
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: 'Times New Roman',
                    size: 18,
                    color: '666666',
                  }),
                  new TextRun({
                    text: '   |   SGGS Institute of Engineering & Technology, Nanded',
                    font: 'Times New Roman',
                    size: 18,
                    color: '666666',
                  }),
                ],
              }),
            ],
          }),
        },
        // Document Content
        children: [
          // Institution Header Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: metadata.institutionName || 'SGGS Institute of Engineering and Technology, Nanded – 431606',
                bold: true,
                font: 'Times New Roman',
                size: 28, // 14pt
                color: '111827',
              }),
            ],
          }),

          // Metadata Grid
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 80, after: 60 },
            children: [
              new TextRun({ text: 'Department: ', bold: true, font: 'Times New Roman', size: 22 }),
              new TextRun({ text: `${metadata.department || 'Computer Science & Engineering'}          `, font: 'Times New Roman', size: 22 }),
              new TextRun({ text: 'Date: ', bold: true, font: 'Times New Roman', size: 22 }),
              new TextRun({ text: metadata.date || new Date().toISOString().split('T')[0], font: 'Times New Roman', size: 22 }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 180 },
            children: [
              new TextRun({ text: 'Subject: ', bold: true, font: 'Times New Roman', size: 22 }),
              new TextRun({ text: `${metadata.subject || 'Operating Systems (CS501)'}          `, font: 'Times New Roman', size: 22 }),
              new TextRun({ text: 'Time: ', bold: true, font: 'Times New Roman', size: 22 }),
              new TextRun({ text: metadata.time || '09:00 - 10:00 AM', font: 'Times New Roman', size: 22 }),
            ],
          }),

          // Section Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 140, after: 200 },
            children: [
              new TextRun({
                text: 'STUDENT ATTENDANCE RECORDS',
                bold: true,
                font: 'Times New Roman',
                size: 26, // 13pt
                color: '0F172A',
              }),
            ],
          }),

          // Attendance Records Table
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: 'BBBBBB' },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: 'BBBBBB' },
              left: { style: BorderStyle.SINGLE, size: 2, color: 'BBBBBB' },
              right: { style: BorderStyle.SINGLE, size: 2, color: 'BBBBBB' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            },
            rows: [
              // Header Row (repeats on every page in Word)
              new TableRow({
                tableHeader: true,
                cantSplit: true,
                children: [
                  createTableCell('Sr. No.', { isHeader: true, widthPct: 8, align: AlignmentType.CENTER }),
                  createTableCell('Student Name', { isHeader: true, widthPct: 26, align: AlignmentType.LEFT }),
                  createTableCell('Roll Number', { isHeader: true, widthPct: 16, align: AlignmentType.LEFT }),
                  createTableCell('Enrollment No.', { isHeader: true, widthPct: 16, align: AlignmentType.LEFT }),
                  createTableCell('Status', { isHeader: true, widthPct: 12, align: AlignmentType.CENTER }),
                  createTableCell('Check-in Time', { isHeader: true, widthPct: 12, align: AlignmentType.CENTER }),
                  createTableCell('Device / Method', { isHeader: true, widthPct: 10, align: AlignmentType.CENTER }),
                ],
              }),

              // Data Rows
              ...rows.map((row) =>
                new TableRow({
                  cantSplit: true,
                  children: [
                    createTableCell(String(row.srNo), { align: AlignmentType.CENTER }),
                    createTableCell(row.studentName, { align: AlignmentType.LEFT }),
                    createTableCell(row.rollNumber, { align: AlignmentType.LEFT }),
                    createTableCell(row.enrollmentId, { align: AlignmentType.LEFT }),
                    createTableCell(row.status, {
                      align: AlignmentType.CENTER,
                      bold: true,
                      color:
                        row.status === 'Present'
                          ? '15803D'
                          : row.status === 'Late'
                          ? 'B45309'
                          : row.status === 'Rejected'
                          ? 'B91C1C'
                          : '1E293B',
                    }),
                    createTableCell(row.checkInTime, { align: AlignmentType.CENTER }),
                    createTableCell(row.device, { align: AlignmentType.CENTER }),
                  ],
                })
              ),
            ],
          }),
        ],
      },
    ],
  });

  // 3. Pack to Blob and trigger download
  const blob = await Packer.toBlob(doc);
  const filename = `SGGS_Attendance_Records_${metadata.date || new Date().toISOString().split('T')[0]}.docx`;
  downloadBlob(blob, filename);
}

/**
 * Helper to construct formatted TableCells with Times New Roman styling.
 */
function createTableCell(
  text: string,
  options: {
    isHeader?: boolean;
    widthPct?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    color?: string;
  } = {}
): TableCell {
  const { isHeader = false, align = AlignmentType.LEFT, bold = false, color = '1E293B' } = options;

  return new TableCell({
    shading: isHeader ? { fill: 'F1F5F9' } : undefined,
    margins: {
      top: 100, // dxa (twips)
      bottom: 100,
      left: 120,
      right: 120,
    },
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text,
            bold: isHeader || bold,
            font: 'Times New Roman',
            size: isHeader ? 20 : 19, // 10pt for header, 9.5pt for body
            color: isHeader ? '0F172A' : color,
          }),
        ],
      }),
    ],
  });
}
