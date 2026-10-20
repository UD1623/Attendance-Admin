import React, { useState, useEffect, useCallback } from 'react';
import {
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Download,
  AlertTriangle,
  RefreshCw,
  Users,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { AcademicClass, Subject } from '@/types';
import { Button, EmptyState } from '@/components';
import styles from './ReportsPage.module.css';

const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_URL || 'http://127.0.0.1:5001/smart-attendance-dev/us-central1';

interface StudentReportItem {
  studentId: string;
  fullName: string;
  rollNumber: string;
  scheduledLectures: number;
  presentCount: number;
  lateCount: number;
  attendedCount: number;
  excusedCount: number;
  derivedAbsentCount: number;
  attendancePercentage: number;
  isDefaulter: boolean;
}

interface ReportData {
  classId: string;
  className: string;
  classCode: string;
  academicYear: string;
  department: string;
  startDate: string;
  endDate: string;
  lowAttendanceThreshold: number;
  totalScheduledLectures: number;
  totalStudents: number;
  classAveragePercentage: number;
  defaulterCount: number;
  students: StudentReportItem[];
  generatedAt: string;
}

export const ReportsPage: React.FC = () => {
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Default dates: start of month to today
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<string>(firstDay.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(today.toISOString().split('T')[0]);

  const [activePreset, setActivePreset] = useState<string>('month');
  const [loading, setLoading] = useState<boolean>(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load Classes & Subjects
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [classSnap, subSnap] = await Promise.all([
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'subjects')),
        ]);

        const clsList: AcademicClass[] = [];
        classSnap.forEach((d) => clsList.push({ ...d.data(), classId: d.id } as AcademicClass));
        setClasses(clsList);
        if (clsList.length > 0) {
          setSelectedClassId(clsList[0].classId);
        }

        const subList: Subject[] = [];
        subSnap.forEach((d) => subList.push({ ...d.data(), subjectId: d.id } as Subject));
        setSubjects(subList);
      } catch (err: any) {
        console.warn('Failed to load classes/subjects:', err);
      }
    };
    fetchMetadata();
  }, []);

  // Fetch Report Data
  const generateReport = useCallback(async () => {
    if (!selectedClassId) return;

    setLoading(true);
    setError(null);

    try {
      const getReportCall = httpsCallable(functions, 'getAttendanceReportCall');
      const res: any = await getReportCall({
        classId: selectedClassId,
        startDate,
        endDate,
        subjectId: selectedSubjectId || undefined,
      });

      if (res.data?.success && res.data?.report) {
        setReport(res.data.report);
      } else {
        throw new Error('Failed to parse report dataset.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate attendance report.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, startDate, endDate, selectedSubjectId]);

  // Auto-generate on initial class selection
  useEffect(() => {
    if (selectedClassId) {
      generateReport();
    }
  }, [selectedClassId, generateReport]);

  // Preset Handlers
  const applyPreset = (preset: 'today' | 'week' | 'month' | 'semester') => {
    setActivePreset(preset);
    const now = new Date();
    const endStr = now.toISOString().split('T')[0];
    let startObj = new Date(now);

    if (preset === 'today') {
      setStartDate(endStr);
      setEndDate(endStr);
      return;
    }

    if (preset === 'week') {
      startObj.setDate(now.getDate() - 7);
    } else if (preset === 'month') {
      startObj = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'semester') {
      startObj = new Date(now.getFullYear(), now.getMonth() - 4, 1);
    }

    setStartDate(startObj.toISOString().split('T')[0]);
    setEndDate(endStr);
  };

  // Export URLs
  const getExportUrl = (format: 'excel' | 'pdf' | 'word') => {
    const params = new URLSearchParams({
      format,
      classId: selectedClassId,
      startDate,
      endDate,
    });
    if (selectedSubjectId) {
      params.append('subjectId', selectedSubjectId);
    }
    return `${FUNCTIONS_BASE}/exportReport?${params.toString()}`;
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2>Attendance Reports & Official Exports</h2>
          <p className={styles.subtitle}>
            Normalized attendance registers with derived absenteeism (DEC-006) and multi-format document generators (DEC-007).
          </p>
        </div>

        {report && (
          <div className={styles.exportButtons}>
            <a
              id="btn-download-excel"
              href={getExportUrl('excel')}
              className={styles.btnExportExcel}
              target="_blank"
              rel="noopener noreferrer"
              title="Download Formatted Excel Spreadsheet"
            >
              <FileSpreadsheet size={15} />
              Excel (.xlsx)
            </a>

            <a
              id="btn-download-pdf"
              href={getExportUrl('pdf')}
              className={styles.btnExportPdf}
              target="_blank"
              rel="noopener noreferrer"
              title="Download Official PDF Register"
            >
              <FileText size={15} />
              PDF (.pdf)
            </a>

            <a
              id="btn-download-word"
              href={getExportUrl('word')}
              className={styles.btnExportWord}
              target="_blank"
              rel="noopener noreferrer"
              title="Download Academic Word Memorandum"
            >
              <Download size={15} />
              Word (.docx)
            </a>
          </div>
        )}
      </div>

      {/* Filter and Date Control Panel */}
      <div className={styles.filterBox}>
        <div className={styles.filterRow}>
          <div className={styles.formGroup}>
            <span className={styles.filterLabel}>Academic Class</span>
            <select
              id="report-select-class"
              className={styles.selectInput}
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <span className={styles.filterLabel}>Subject (Optional)</span>
            <select
              id="report-select-subject"
              className={styles.selectInput}
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <span className={styles.filterLabel}>Start Date</span>
            <input
              id="report-date-start"
              type="date"
              className={styles.dateInput}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setActivePreset('custom');
              }}
            />
          </div>

          <div className={styles.formGroup}>
            <span className={styles.filterLabel}>End Date</span>
            <input
              id="report-date-end"
              type="date"
              className={styles.dateInput}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActivePreset('custom');
              }}
            />
          </div>

          <div style={{ alignSelf: 'flex-end', marginBottom: '2px' }}>
            <Button
              id="btn-run-report"
              variant="primary"
              size="sm"
              onClick={generateReport}
              disabled={loading || !selectedClassId}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Calculating...' : 'Run Report'}
            </Button>
          </div>
        </div>

        {/* Date Presets */}
        <div className={styles.presetChips}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginRight: '4px' }}>
            Presets:
          </span>
          <button
            className={`${styles.chip} ${activePreset === 'today' ? styles.activeChip : ''}`}
            onClick={() => applyPreset('today')}
          >
            Today
          </button>
          <button
            className={`${styles.chip} ${activePreset === 'week' ? styles.activeChip : ''}`}
            onClick={() => applyPreset('week')}
          >
            Last 7 Days
          </button>
          <button
            className={`${styles.chip} ${activePreset === 'month' ? styles.activeChip : ''}`}
            onClick={() => applyPreset('month')}
          >
            This Month
          </button>
          <button
            className={`${styles.chip} ${activePreset === 'semester' ? styles.activeChip : ''}`}
            onClick={() => applyPreset('semester')}
          >
            This Semester
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', padding: '12px', background: 'var(--color-error-bg)', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* KPI Stats Grid */}
      {report && (
        <>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={`${styles.kpiIcon} ${styles.iconRate}`}>
                <CheckCircle2 size={22} />
              </div>
              <div>
                <div className={styles.kpiLabel}>Average Attendance</div>
                <div
                  className={styles.kpiValue}
                  style={{
                    color: report.classAveragePercentage >= 75 ? '#10B981' : '#EF4444',
                  }}
                >
                  {report.classAveragePercentage}%
                </div>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={`${styles.kpiIcon} ${styles.iconLectures}`}>
                <BookOpen size={22} />
              </div>
              <div>
                <div className={styles.kpiLabel}>Scheduled Lectures</div>
                <div className={styles.kpiValue}>{report.totalScheduledLectures}</div>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={`${styles.kpiIcon} ${styles.iconStudents}`}>
                <Users size={22} />
              </div>
              <div>
                <div className={styles.kpiLabel}>Enrolled Students</div>
                <div className={styles.kpiValue}>{report.totalStudents}</div>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={`${styles.kpiIcon} ${styles.iconDefaulters}`}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <div className={styles.kpiLabel}>Defaulters (&lt;75%)</div>
                <div
                  className={styles.kpiValue}
                  style={{ color: report.defaulterCount > 0 ? '#EF4444' : '#10B981' }}
                >
                  {report.defaulterCount}
                </div>
              </div>
            </div>
          </div>

          {/* Defaulter Alert Callout */}
          {report.defaulterCount > 0 && (
            <div className={styles.defaulterAlert}>
              <AlertTriangle size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 className={styles.defaulterTitle}>
                  Institutional Attendance Deficiency Alert ({report.defaulterCount} Students)
                </h4>
                <p className={styles.defaulterDesc}>
                  {report.defaulterCount} student(s) fall below the institutional minimum threshold of 75%.
                  Defaulter letters and parent notifications should be issued according to academic regulations.
                </p>
              </div>
            </div>
          )}

          {/* Student Breakdown Register Table */}
          <div className={styles.tableContainer}>
            <table className={styles.reportTable}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Scheduled</th>
                  <th>Present</th>
                  <th>Late</th>
                  <th>Excused</th>
                  <th>Derived Absent</th>
                  <th>Attendance %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.students.map((s) => {
                  const initials = s.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2);

                  return (
                    <tr
                      key={s.studentId}
                      className={`${styles.tableRow} ${s.isDefaulter ? styles.defaulterRow : ''}`}
                    >
                      <td>
                        <div className={styles.studentCell}>
                          <div className={styles.avatar}>{initials}</div>
                          <div>
                            <span className={styles.studentName}>{s.fullName}</span>
                            <span className={styles.studentRoll}>{s.rollNumber}</span>
                          </div>
                        </div>
                      </td>

                      <td>{s.scheduledLectures}</td>
                      <td>{s.presentCount}</td>
                      <td>{s.lateCount}</td>
                      <td>{s.excusedCount}</td>
                      <td>
                        <strong style={{ color: s.derivedAbsentCount > 0 ? '#DC2626' : 'inherit' }}>
                          {s.derivedAbsentCount}
                        </strong>
                      </td>

                      <td>
                        <div>
                          <strong
                            style={{
                              color: s.isDefaulter ? '#DC2626' : '#16A34A',
                              fontSize: 'var(--text-sm)',
                            }}
                          >
                            {s.attendancePercentage}%
                          </strong>
                          <div className={styles.progressBarContainer}>
                            <div
                              className={`${styles.progressBar} ${s.isDefaulter ? styles.progressDefaulter : styles.progressGood}`}
                              style={{ width: `${Math.min(100, s.attendancePercentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td>
                        {s.isDefaulter ? (
                          <span className={`${styles.statusPill} ${styles.pillDefaulter}`}>
                            Defaulter (&lt;75%)
                          </span>
                        ) : (
                          <span className={`${styles.statusPill} ${styles.pillGood}`}>
                            Satisfactory
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!report && !loading && (
        <EmptyState
          title="Select Parameters to Generate Report"
          description="Choose an academic class and date period above, then click 'Run Report' to compute authoritative metrics and download exports."
          icon={<FileBarChart size={28} />}
        />
      )}
    </div>
  );
};
