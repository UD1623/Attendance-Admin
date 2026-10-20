import React from 'react';
import {
  Users,
  Clock,
  CheckCircle2,
  Cpu,
  Calendar,
} from 'lucide-react';
import { useSyncedCollection } from '@/lib/useSyncedData';
import { useRtdbAttendance } from '@/lib/useRtdbAttendance';
import { Student, TimetableEntry, AcademicClass, Subject } from '@/types';
import { StatusBadge } from '@/components';
import styles from './DashboardPage.module.css';

export const DashboardPage: React.FC = () => {
  const { isConnected } = useRtdbAttendance();
  const { data: students } = useSyncedCollection<Student>('students', 'studentId');
  const { data: timetable } = useSyncedCollection<TimetableEntry>('timetable', 'timetableId');
  const { data: classes } = useSyncedCollection<AcademicClass>('classes', 'classId');
  const { data: subjects } = useSyncedCollection<Subject>('subjects', 'subjectId');

  const totalStudents = students.length;
  const enrolledStudents = students.filter(
    (s) => s.fingerprintRef !== null && s.fingerprintRef !== undefined
  ).length;

  // Find next/active lecture for today
  const todayDayOfWeek = new Date().getDay(); // 0 is Sun, 1 is Mon, etc.
  // Map Sun (0) to none or day 1..6
  const mappedDay = todayDayOfWeek === 0 ? 1 : todayDayOfWeek;
  const todayLectures = timetable
    .filter((t) => t.dayOfWeek === mappedDay && t.active !== false)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const nextLecture = todayLectures[0];
  const nextSubject = nextLecture ? subjects.find((s) => s.subjectId === nextLecture.subjectId) : null;
  const nextClass = nextLecture ? classes.find((c) => c.classId === nextLecture.classId) : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>System Overview</h2>
          <p className={styles.subtitle}>
            Real-time biometric attendance monitoring and lecture synchronization.
          </p>
        </div>
        <StatusBadge
          status={isConnected ? 'Online' : 'Pending'}
          label={isConnected ? 'Firebase RTDB: Connected' : 'Firebase RTDB: Connecting...'}
        />
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Total Students</span>
            <span className={`${styles.kpiIcon} ${styles.iconNeutral}`} aria-hidden="true">
              <Users size={18} />
            </span>
          </div>
          <div className={styles.kpiValue}>{totalStudents}</div>
          <div className={styles.kpiFooter}>Registered in academic rosters</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Enrolled Biometrics</span>
            <span className={`${styles.kpiIcon} ${styles.iconSuccess}`} aria-hidden="true">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <div className={styles.kpiValue}>{enrolledStudents}</div>
          <div className={styles.kpiFooter}>
            {totalStudents > 0 ? `${Math.round((enrolledStudents / totalStudents) * 100)}% coverage` : 'Hardware templates'}
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Pending Biometrics</span>
            <span className={`${styles.kpiIcon} ${styles.iconWarning}`} aria-hidden="true">
              <Clock size={18} />
            </span>
          </div>
          <div className={styles.kpiValue}>{totalStudents - enrolledStudents}</div>
          <div className={styles.kpiFooter}>Awaiting hardware enrollment</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Scheduled Lectures Today</span>
            <span className={`${styles.kpiIcon} ${styles.iconNeutral}`} aria-hidden="true">
              <Calendar size={18} />
            </span>
          </div>
          <div className={styles.kpiValue}>{todayLectures.length}</div>
          <div className={styles.kpiFooter}>Active sessions on schedule</div>
        </div>
      </div>

      {/* Overview Panels */}
      <div className={styles.panelGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleWrapper}>
              <Calendar size={18} className={styles.panelIcon} aria-hidden="true" />
              <h3 className={styles.panelTitle}>Current / Next Lecture Session</h3>
            </div>
          </div>
          <div className={styles.panelBody}>
            {nextLecture ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-primary)' }}>
                    {nextSubject?.name || nextLecture.subjectId}
                  </strong>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', padding: '3px 8px', borderRadius: 'var(--radius-sm)' }}>
                    {nextLecture.startTime} – {nextLecture.endTime}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  Class: <strong>{nextClass?.name || nextLecture.classId}</strong>
                  {nextLecture.room && ` | Room: ${nextLecture.room}`}
                  {nextLecture.faculty && ` | Faculty: ${nextLecture.faculty}`}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', background: 'var(--color-page-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  Attendance Window: Opens at {nextLecture.attendanceOpensAt} • Late Cutoff at {nextLecture.lateCutoff}
                </div>
              </div>
            ) : (
              <div className={styles.emptySession}>
                <p>No active lecture session is currently taking place.</p>
                <span>Attendance opens 5 minutes before scheduled start times.</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleWrapper}>
              <Cpu size={18} className={styles.panelIcon} aria-hidden="true" />
              <h3 className={styles.panelTitle}>Device Gateway Health</h3>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.deviceRow}>
              <div>
                <strong>ESP32-READER-01</strong>
                <p className={styles.subtext}>Primary Lecture Hall Gate</p>
              </div>
              <StatusBadge status="Online" label="Ready for Biometrics" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
