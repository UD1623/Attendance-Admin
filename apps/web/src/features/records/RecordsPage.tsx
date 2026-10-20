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
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { AttendanceRecord, AcademicClass } from '@/types';
import { StatusBadge, Button, Modal, EmptyState } from '@/components';
import styles from './RecordsPage.module.css';

export const RecordsPage: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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

  // Load Classes
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const snap = await getDocs(collection(db, 'classes'));
        const clsList: AcademicClass[] = [];
        snap.forEach((d) => clsList.push({ ...d.data(), classId: d.id } as AcademicClass));
        setClasses(clsList);
      } catch (err) {
        console.warn('Failed to load classes:', err);
      }
    };
    fetchClasses();
  }, []);

  // Live Snapshot of Attendance Records
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
        console.warn('Attendance snapshot error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered List
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
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

        return (
          stdId.includes(q) ||
          name.includes(q) ||
          roll.includes(q) ||
          sub.includes(q) ||
          sess.includes(q)
        );
      }

      return true;
    });
  }, [records, selectedClass, selectedStatus, selectedDate, searchQuery]);

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
      const correctCall = httpsCallable(functions, 'correctAttendanceRecordCall');
      await correctCall({
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
      const createCall = httpsCallable(functions, 'createManualAttendanceRecordCall');
      await createCall({
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
                ? 'Retrieving authoritative records from Firestore...'
                : 'No attendance records match your current filters. Trigger a biometric scan via the Live Stream page or simulator.'
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
