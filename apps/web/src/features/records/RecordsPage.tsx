import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Search,
  Download,
  Plus,
  Edit2,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRtdbAttendance } from '@/lib/useRtdbAttendance';
import { useSyncedCollection } from '@/lib/useSyncedData';
import {
  callCorrectAttendanceRecord,
  callCreateManualAttendanceRecord,
} from '@/lib/callables';
import { AttendanceRecord, AcademicClass, Student, Subject, AuditLog, TimetableEntry } from '@/types';
import { StatusBadge, Button, Modal, EmptyState } from '@/components';
import {
  exportAttendanceToPdf,
  exportAttendanceToDocx,
  ReportMetadata,
  ExportAttendanceRow,
} from './exportUtils';
import styles from './RecordsPage.module.css';

export const RecordsPage: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'records' | 'audit'>('records');

  // Real-time Database attendance scans (hardware reader stream)
  const { records: rtdbRecords } = useRtdbAttendance();

  // Synced academic rosters and audit log
  const { data: students } = useSyncedCollection<Student>('students', 'studentId');
  const { data: classes } = useSyncedCollection<AcademicClass>('classes', 'classId');
  const { data: subjects } = useSyncedCollection<Subject>('subjects', 'subjectId');
  const { data: timetable } = useSyncedCollection<TimetableEntry>('timetable', 'timetableId');
  const { data: auditLogs } = useSyncedCollection<AuditLog>('auditLogs', 'id');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Modals
  const [correctionModalOpen, setCorrectionModalOpen] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [newStatus, setNewStatus] = useState<'Present' | 'Late' | 'Absent' | 'Excused'>('Present');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [submittingCorrection, setSubmittingCorrection] = useState<boolean>(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Manual Entry Modal
  const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState({
    studentId: '',
    sessionId: '',
    classId: '',
    subjectId: '',
    lectureDate: new Date().toISOString().split('T')[0],
    status: 'Present' as 'Present' | 'Late' | 'Absent' | 'Excused',
    reason: '',
  });
  const [submittingManual, setSubmittingManual] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Formal Report Export States
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [exportingDocx, setExportingDocx] = useState<boolean>(false);
  const [exportFeedback, setExportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live Snapshot of Firestore Attendance Records
  useEffect(() => {
    setLoading(true);
    const attRef = collection(db, 'attendance');
    const q = query(attRef, orderBy('lectureDate', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: AttendanceRecord[] = [];
        snapshot.forEach((doc) => {
          list.push({ ...doc.data(), attendanceId: doc.id } as AttendanceRecord);
        });
        setRecords(list);
        setLoading(false);
      },
      (error) => {
        console.warn('Attendance snapshot note:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Map and combine Realtime Database scans with Firestore records
  const combinedRecords = useMemo(() => {
    const mappedRtdb: AttendanceRecord[] = rtdbRecords.map((r) => {
      // Find matching student by fingerprint slot or studentId
      const matchedStudent = students.find((s) => {
        if (s.fingerprintRef !== null && s.fingerprintRef !== undefined && Number(s.fingerprintRef) === Number(r.fingerprintId)) {
          return true;
        }
        if (s.studentId && r.studentId && s.studentId === r.studentId) {
          return true;
        }
        return false;
      });

      const matchedClass = classes.find((c) => c.classId === matchedStudent?.classId) || classes[0];
      const matchedSubject = subjects[0];

      const isUnenrolled = r.fingerprintId === 99 || (!matchedStudent && !r.studentId);
      const studentName = isUnenrolled
        ? 'Unenrolled Biometric'
        : matchedStudent?.fullName ||
          (r.studentId && !r.studentId.startsWith('std_test') && r.studentId !== 'TEST'
            ? r.studentId
            : `Student Slot #${r.fingerprintId}`);

      const rollNumber = isUnenrolled
        ? 'Slot #99 (No Match)'
        : matchedStudent?.rollNumber ||
          (r.fingerprintId ? `Slot #${r.fingerprintId}` : r.studentId || 'N/A');

      const dateObj = new Date(typeof r.timestamp === 'number' ? r.timestamp : Number(r.timestamp) || Date.now());
      const lectureDate = !isNaN(dateObj.getTime())
        ? dateObj.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        attendanceId: r.recordId,
        studentId: matchedStudent?.studentId || r.studentId,
        studentName,
        rollNumber,
        classId: matchedClass?.classId || 'class_ce_5a',
        className: matchedClass?.name || 'Computer Engineering - Sem 5',
        subjectId: matchedSubject?.name || 'Operating Systems (CS501)',
        sessionId: `LEC_${lectureDate}_01`,
        lectureDate,
        status: (r.status as any) || 'Present',
        capturedAt: r.timestamp,
        receivedAt: r.timestamp,
        processedAt: r.timestamp,
        deviceId: r.deviceId || 'ESP32-READER-01',
        eventId: r.recordId,
        correctedBy: r.correctedBy,
        correctionReason: r.correctionReason,
      };
    });

    // Merge: RTDB scans take precedence, unioned with Firestore records
    const rtdbIds = new Set(mappedRtdb.map((r) => r.attendanceId));
    const uniqueFirestore = records.filter((r) => !rtdbIds.has(r.attendanceId));
    const merged = [...mappedRtdb, ...uniqueFirestore];

    merged.sort((a, b) => {
      const timeA = typeof a.capturedAt === 'number' ? a.capturedAt : new Date(a.capturedAt || a.lectureDate).getTime();
      const timeB = typeof b.capturedAt === 'number' ? b.capturedAt : new Date(b.capturedAt || b.lectureDate).getTime();
      return (timeB || 0) - (timeA || 0);
    });

    return merged;
  }, [rtdbRecords, records, students, classes, subjects]);

  // Filtered List
  const filteredRecords = useMemo(() => {
    return combinedRecords.filter((r) => {
      if (selectedClass !== 'all' && r.classId !== selectedClass) return false;
      if (selectedStatus !== 'all' && r.status !== selectedStatus) return false;
      if (selectedDate && r.lectureDate !== selectedDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const stdId = (r.studentId || '').toLowerCase();
        const name = ((r as any).studentName || '').toLowerCase();
        const roll = ((r as any).rollNumber || '').toLowerCase();
        const sub = (r.subjectId || '').toLowerCase();
        const sess = (r.sessionId || '').toLowerCase();
        const dev = (r.deviceId || '').toLowerCase();

        return (
          stdId.includes(q) ||
          name.includes(q) ||
          roll.includes(q) ||
          sub.includes(q) ||
          sess.includes(q) ||
          dev.includes(q)
        );
      }

      return true;
    });
  }, [combinedRecords, selectedClass, selectedStatus, selectedDate, searchQuery]);

  // Summary Metrics
  const summary = useMemo(() => {
    let total = filteredRecords.length;
    let present = 0;
    let late = 0;
    let excused = 0;
    let corrected = 0;

    for (const r of filteredRecords) {
      if (r.status === 'Present') present++;
      else if (r.status === 'Late') late++;
      else if (r.status === 'Excused') excused++;
      if (r.correctedBy) corrected++;
    }

    return { total, present, late, excused, corrected };
  }, [filteredRecords]);

  // Open Correction Modal
  const handleOpenCorrection = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setNewStatus(record.status as any);
    setCorrectionReason(record.correctionReason || '');
    setCorrectionError(null);
    setCorrectionModalOpen(true);
  };

  // Submit Correction
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    if (!correctionReason.trim() || correctionReason.trim().length < 5) {
      setCorrectionError('Justification reason must be at least 5 characters.');
      return;
    }

    setSubmittingCorrection(true);
    setCorrectionError(null);

    try {
      await callCorrectAttendanceRecord({
        attendanceId: selectedRecord.attendanceId,
        newStatus,
        reason: correctionReason.trim(),
      });

      setCorrectionModalOpen(false);
      setSelectedRecord(null);
    } catch (err: any) {
      setCorrectionError(err.message || 'Failed to submit attendance correction.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Submit Manual Entry
  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.reason.trim() || manualForm.reason.trim().length < 5) {
      setManualError('Mandatory institutional reason must be at least 5 characters.');
      return;
    }

    setSubmittingManual(true);
    setManualError(null);

    try {
      await callCreateManualAttendanceRecord({
        ...manualForm,
        reason: manualForm.reason.trim(),
      });

      setManualModalOpen(false);
      setManualForm({
        studentId: '',
        sessionId: '',
        classId: '',
        subjectId: '',
        lectureDate: new Date().toISOString().split('T')[0],
        status: 'Present',
        reason: '',
      });
    } catch (err: any) {
      setManualError(err.message || 'Failed to create manual attendance entry.');
    } finally {
      setSubmittingManual(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;

    const headers = [
      'Attendance ID',
      'Student ID',
      'Student Name',
      'Roll Number',
      'Class ID',
      'Subject ID',
      'Session ID',
      'Lecture Date',
      'Status',
      'Captured At',
      'Device ID',
      'Corrected By',
      'Correction Reason',
    ];

    const rows = filteredRecords.map((r) => [
      `"${r.attendanceId}"`,
      `"${r.studentId}"`,
      `"${(r as any).studentName || ''}"`,
      `"${(r as any).rollNumber || ''}"`,
      `"${r.classId}"`,
      `"${r.subjectId}"`,
      `"${r.sessionId}"`,
      `"${r.lectureDate}"`,
      `"${r.status}"`,
      `"${r.capturedAt || ''}"`,
      `"${r.deviceId || ''}"`,
      `"${r.correctedBy || ''}"`,
      `"${(r.correctionReason || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendance_records_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to compile dynamic formal SGGS report metadata
  const prepareReportMetadata = (): ReportMetadata => {
    // 1. Department
    let dept = 'CSE (CSE-3A)';
    if (selectedClass !== 'all') {
      const c = classes.find((cls) => cls.classId === selectedClass);
      if (c) {
        dept = `CSE (${c.code || c.name})`;
      }
    } else if (filteredRecords.length > 0) {
      const firstClass = classes.find((c) => c.classId === filteredRecords[0].classId);
      if (firstClass) {
        dept = `CSE (${firstClass.code || firstClass.name})`;
      }
    }

    // 2. Subject
    let subj = filteredRecords[0]?.subjectId || 'Operating Systems (CS501)';
    const foundSubject = subjects.find((s) => s.subjectId === subj || s.name === subj || s.code === subj);
    if (foundSubject) {
      subj = `${foundSubject.name} (${foundSubject.code || ''})`.trim();
    }

    // 3. Time
    let sessionTime = '09:00 – 10:00 AM';
    const firstRec = filteredRecords[0];
    if (firstRec?.sessionId) {
      const matchTt = timetable.find((t) => t.timetableId === firstRec.sessionId);
      if (matchTt && matchTt.startTime && matchTt.endTime) {
        sessionTime = `${matchTt.startTime} – ${matchTt.endTime}`;
      }
    }

    // 4. Date
    const attDate = selectedDate || filteredRecords[0]?.lectureDate || new Date().toISOString().split('T')[0];

    return {
      institutionName: 'SGGS Institute of Engineering and Technology, Nanded – 431606',
      department: dept,
      subject: subj,
      time: sessionTime,
      date: attDate,
    };
  };

  // Prepare table data for export
  const prepareExportRows = (): ExportAttendanceRow[] => {
    return filteredRecords.map((r, idx) => {
      let checkInTime = '—';
      if (r.capturedAt) {
        const d =
          typeof r.capturedAt === 'number'
            ? new Date(r.capturedAt < 10000000000 ? r.capturedAt * 1000 : r.capturedAt)
            : new Date(r.capturedAt);
        if (!isNaN(d.getTime())) {
          checkInTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
      }

      return {
        srNo: idx + 1,
        studentName: (r as any).studentName || r.studentId || 'Unknown Student',
        rollNumber: (r as any).rollNumber || r.studentId || 'N/A',
        enrollmentId: r.studentId || (r as any).rollNumber || 'N/A',
        status: r.status,
        checkInTime,
        device: r.deviceId || 'ESP32-READER-01',
      };
    });
  };

  // Export to PDF
  const handleExportPdf = async () => {
    if (filteredRecords.length === 0) return;
    setExportingPdf(true);
    setExportFeedback(null);
    try {
      const meta = prepareReportMetadata();
      const rows = prepareExportRows();
      await exportAttendanceToPdf(rows, meta);
      setExportFeedback({
        type: 'success',
        message: `Successfully generated and downloaded PDF report: SGGS_Attendance_Records_${meta.date}.pdf (${rows.length} records).`,
      });
    } catch (err: any) {
      console.error('PDF export error:', err);
      setExportFeedback({
        type: 'error',
        message: `Failed to export PDF: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setExportingPdf(false);
      setTimeout(() => setExportFeedback(null), 6000);
    }
  };

  // Export to Word (.docx)
  const handleExportDocx = async () => {
    if (filteredRecords.length === 0) return;
    setExportingDocx(true);
    setExportFeedback(null);
    try {
      const meta = prepareReportMetadata();
      const rows = prepareExportRows();
      await exportAttendanceToDocx(rows, meta);
      setExportFeedback({
        type: 'success',
        message: `Successfully generated and downloaded editable Word report: SGGS_Attendance_Records_${meta.date}.docx (${rows.length} records).`,
      });
    } catch (err: any) {
      console.error('DOCX export error:', err);
      setExportFeedback({
        type: 'error',
        message: `Failed to export Word document: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setExportingDocx(false);
      setTimeout(() => setExportFeedback(null), 6000);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2>Attendance Records & Audit Log</h2>
          <p className={styles.subtitle}>
            Indexed historical attendance registers with cryptographically audited administrative corrections.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button
            id="btn-export-pdf"
            variant="secondary"
            size="sm"
            onClick={handleExportPdf}
            disabled={filteredRecords.length === 0 || exportingPdf}
            title="Export formal academic report to PDF (Times New Roman, SGGS Watermark)"
          >
            <FileText size={16} />
            {exportingPdf ? 'Exporting PDF...' : 'Export PDF'}
          </Button>

          <Button
            id="btn-export-docx"
            variant="secondary"
            size="sm"
            onClick={handleExportDocx}
            disabled={filteredRecords.length === 0 || exportingDocx}
            title="Export formal academic report to editable Word document"
          >
            <FileSpreadsheet size={16} />
            {exportingDocx ? 'Exporting Word...' : 'Export Word (.docx)'}
          </Button>

          <Button
            id="btn-export-csv"
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
          >
            <Download size={16} />
            Export CSV ({filteredRecords.length})
          </Button>

          <Button
            id="btn-add-manual-record"
            variant="primary"
            size="sm"
            onClick={() => setManualModalOpen(true)}
          >
            <Plus size={16} />
            Add Manual Entry
          </Button>
        </div>
      </div>

      {/* Export Operation Feedback Banner */}
      {exportFeedback && (
        <div
          className={
            exportFeedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
          }
        >
          {exportFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{exportFeedback.message}</span>
        </div>
      )}

      {/* Tab Switcher */}
      <div className={styles.tabBar}>
        <button
          id="tab-attendance-registers"
          className={`${styles.tabBtn} ${activeTab === 'records' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('records')}
        >
          <ClipboardList size={16} />
          Attendance Registers ({combinedRecords.length})
        </button>
        <button
          id="tab-audit-trail"
          className={`${styles.tabBtn} ${activeTab === 'audit' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <ShieldAlert size={16} />
          Immutable Audit Trail ({auditLogs.length})
        </button>
      </div>

      {activeTab === 'records' && (
        <>
          {/* Summary Cards */}
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconAll}`}>
                <ClipboardList size={22} />
              </div>
              <div>
                <div className={styles.summaryLabel}>Total Records</div>
                <div className={styles.summaryCount}>{summary.total}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPresent}`}>
                <CheckCircle2 size={22} />
              </div>
              <div>
                <div className={styles.summaryLabel}>Present</div>
                <div className={styles.summaryCount}>{summary.present}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconLate}`}>
                <Clock size={22} />
              </div>
              <div>
                <div className={styles.summaryLabel}>Late</div>
                <div className={styles.summaryCount}>{summary.late}</div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconExcused}`}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className={styles.summaryLabel}>Excused / Corrected</div>
                <div className={styles.summaryCount}>{summary.corrected}</div>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className={styles.controlsBar}>
            <div className={styles.filterRow}>
              <div className={styles.searchBox}>
                <Search size={16} color="var(--color-text-secondary)" />
                <input
                  id="input-search-records"
                  type="text"
                  placeholder="Search by student, roll number, or subject..."
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                id="select-filter-class"
                className={styles.selectInput}
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="all">All Classes</option>
                {classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.code || c.name}
                  </option>
                ))}
              </select>

              <select
                id="select-filter-status"
                className={styles.selectInput}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Excused">Excused</option>
                <option value="Absent">Absent</option>
              </select>

              <input
                id="input-filter-date"
                type="date"
                className={styles.dateInput}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />

              {(selectedClass !== 'all' || selectedStatus !== 'all' || selectedDate || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedClass('all');
                    setSelectedStatus('all');
                    setSelectedDate('');
                    setSearchQuery('');
                  }}
                >
                  Reset Filters
                </Button>
              )}
            </div>
          </div>

          {/* Records Table */}
          <div className={styles.tableContainer}>
            {filteredRecords.length === 0 ? (
              <EmptyState
                title={loading ? 'Loading Attendance Records...' : 'No Attendance Records Found'}
                description={
                  loading
                    ? 'Retrieving authoritative records from Firestore and RTDB...'
                    : 'No attendance records match your current filters. Trigger a biometric scan via the Live Stream page or hardware reader.'
                }
                icon={<ClipboardList size={28} />}
              />
            ) : (
              <table className={styles.recordsTable}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Subject & Session</th>
                    <th>Lecture Date</th>
                    <th>Status</th>
                    <th>Method / Device</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r) => {
                    const name = (r as any).studentName || r.studentId;
                    const roll = (r as any).rollNumber || r.studentId;
                    const initials = name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .slice(0, 2);

                    return (
                      <tr key={r.attendanceId} className={styles.tableRow}>
                        <td>
                          <div className={styles.studentCell}>
                            <div className={styles.avatar}>{initials}</div>
                            <div>
                              <span className={styles.studentName}>{name}</span>
                              <span className={styles.studentRoll}>{roll}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div>
                            <div className={styles.subjectName}>{r.subjectId}</div>
                            <div className={styles.sessionSub}>{r.sessionId}</div>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={13} color="var(--color-text-muted)" />
                            <span>{r.lectureDate}</span>
                          </div>
                        </td>

                        <td>
                          <div>
                            <StatusBadge status={r.status} />
                            {r.correctedBy && (
                              <div
                                className={styles.correctionTag}
                                title={`Corrected by ${r.correctedBy}. Reason: ${r.correctionReason || 'N/A'}`}
                              >
                                <ShieldAlert size={11} /> Corrected
                              </div>
                            )}
                          </div>
                        </td>

                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                            {r.deviceId || 'Scanner'}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            className={styles.actionBtn}
                            onClick={() => handleOpenCorrection(r)}
                            title="Audited Attendance Correction"
                          >
                            <Edit2 size={12} />
                            Correct
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Audit Trail View */}
      {activeTab === 'audit' && (
        <div className={styles.tableContainer}>
          {auditLogs.length === 0 ? (
            <EmptyState
              title="No Audit Entries Found"
              description="Administrative actions, corrections, and overrides will be logged here."
              icon={<ShieldAlert size={28} />}
            />
          ) : (
            <table className={styles.recordsTable}>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Target Resource</th>
                  <th>Actor Email</th>
                  <th>Timestamp</th>
                  <th>Audit Details & Institutional Justification</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => {
                  const logId = log.id || log.logId || `log_${Math.random()}`;
                  const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Just now';
                  const detailsStr = log.details
                    ? typeof log.details === 'object'
                      ? JSON.stringify(log.details, null, 2)
                      : String(log.details)
                    : '-';

                  return (
                    <tr key={logId} className={styles.tableRow}>
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 'var(--font-semibold)',
                            background: 'rgba(37, 99, 235, 0.1)',
                            color: '#2563EB',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-block',
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 'var(--font-medium)' }}>{log.targetType}</span>
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-secondary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {log.targetId}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {log.actorEmail}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
                          <Clock size={12} color="var(--color-text-muted)" />
                          <span>{dateStr}</span>
                        </div>
                      </td>
                      <td>
                        <pre
                          style={{
                            margin: 0,
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            background: 'var(--color-page-bg)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '90px',
                            overflowY: 'auto',
                          }}
                        >
                          {detailsStr}
                        </pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Audited Correction Modal */}
      {selectedRecord && (
        <Modal
          isOpen={correctionModalOpen}
          onClose={() => setCorrectionModalOpen(false)}
          title="Audited Attendance Correction"
          maxWidth="520px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCorrectionModalOpen(false)}
                disabled={submittingCorrection}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitCorrection}
                disabled={submittingCorrection}
              >
                {submittingCorrection ? 'Recording Audit...' : 'Save Audited Correction'}
              </Button>
            </div>
          }
        >
          <form className={styles.modalForm} onSubmit={handleSubmitCorrection}>
            <div className={styles.infoBanner}>
              <div>
                <strong>Student:</strong> {(selectedRecord as any).studentName || selectedRecord.studentId} (
                {(selectedRecord as any).rollNumber || selectedRecord.studentId})
              </div>
              <div>
                <strong>Lecture:</strong> {selectedRecord.subjectId} | <strong>Date:</strong> {selectedRecord.lectureDate}
              </div>
              <div>
                <strong>Current Status:</strong> <StatusBadge status={selectedRecord.status} />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>New Status *</label>
              <select
                className={styles.formSelect}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as any)}
              >
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Excused">Excused (Authorized Leave)</option>
                <option value="Absent">Absent</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Institutional Justification Reason *</label>
              <textarea
                className={styles.formTextarea}
                placeholder="Explain why this record is being modified (e.g. medical certificate #104, approved extracurricular participation, scanner anomaly)..."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                required
              />
            </div>

            <div className={styles.warningBox}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Audited Action:</strong> This correction will be permanently recorded in the immutable audit log
                with your administrator identity and timestamp.
              </div>
            </div>

            {correctionError && (
              <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
                {correctionError}
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Manual Entry Modal */}
      <Modal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        title="Add Manual Attendance Entry"
        maxWidth="520px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setManualModalOpen(false)}
              disabled={submittingManual}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitManual}
              disabled={submittingManual}
            >
              {submittingManual ? 'Creating...' : 'Create Entry'}
            </Button>
          </div>
        }
      >
        <form className={styles.modalForm} onSubmit={handleSubmitManual}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Student ID (e.g. std_101) *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="e.g. std_101"
              value={manualForm.studentId}
              onChange={(e) => setManualForm({ ...manualForm, studentId: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Class ID *</label>
            <select
              className={styles.formSelect}
              required
              value={manualForm.classId}
              onChange={(e) => setManualForm({ ...manualForm, classId: e.target.value })}
            >
              <option value="">Select Class</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Subject ID *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="e.g. sub_os"
              value={manualForm.subjectId}
              onChange={(e) => setManualForm({ ...manualForm, subjectId: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Session ID *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="e.g. tt_mon_os_5a_2026-10-20"
              value={manualForm.sessionId}
              onChange={(e) => setManualForm({ ...manualForm, sessionId: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Lecture Date *</label>
            <input
              type="date"
              required
              className={styles.formInput}
              value={manualForm.lectureDate}
              onChange={(e) => setManualForm({ ...manualForm, lectureDate: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Status *</label>
            <select
              className={styles.formSelect}
              value={manualForm.status}
              onChange={(e) => setManualForm({ ...manualForm, status: e.target.value as any })}
            >
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Excused">Excused</option>
              <option value="Absent">Absent</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Mandatory Reason *</label>
            <textarea
              required
              className={styles.formTextarea}
              placeholder="Reason why this student attendance is being recorded manually..."
              value={manualForm.reason}
              onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
            />
          </div>

          {manualError && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
              {manualError}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};
