import React, { useState, useEffect, useMemo } from 'react';
import { useSyncedCollection } from '@/lib/useSyncedData';
import {
  Clock,
  Plus,
  BookOpen,
  MapPin,
  User,
  LayoutGrid,
  List,
  Edit2,
  Trash2,
  AlertTriangle,
  Filter,
} from 'lucide-react';

import {
  callCreateTimetableEntry,
  callUpdateTimetableEntry,
  callDeleteTimetableEntry,
  callValidateTimetableConflicts,
} from '@/lib/callables';
import { TimetableEntry, AcademicClass, Subject } from '@/types';
import {
  Button,
  Modal,
  Table,
  Column,
  StatusBadge,
  useToast,
} from '@/components';
import styles from './TimetablePage.module.css';

export const ACADEMIC_CLASSES: AcademicClass[] = [
  {
    classId: 'class_cse_3a',
    name: 'CSE- Sem 3- Div: A',
    code: 'CSE-3A',
    department: 'Computer Science & Engineering',
    semester: 3,
    academicYear: '2024-2025',
    active: true,
  },
  {
    classId: 'class_cse_3b',
    name: 'CSE- Sem 3- Div: B',
    code: 'CSE-3B',
    department: 'Computer Science & Engineering',
    semester: 3,
    academicYear: '2024-2025',
    active: true,
  },
];

const DAYS_OF_WEEK = [
  { id: 1, name: 'Monday', short: 'Mon' },
  { id: 2, name: 'Tuesday', short: 'Tue' },
  { id: 3, name: 'Wednesday', short: 'Wed' },
  { id: 4, name: 'Thursday', short: 'Thu' },
  { id: 5, name: 'Friday', short: 'Fri' },
  { id: 6, name: 'Saturday', short: 'Sat' },
];

function calculateTimingWindows(start: string, end: string) {
  if (!start || !end) return null;
  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return null;

  const startM = sH * 60 + sM;
  const endM = eH * 60 + eM;
  if (endM <= startM) return null;

  const opensM = ((startM - 5 + 1440) % 1440);
  const lateM = ((startM + 10 + 1440) % 1440);

  const formatM = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return {
    attendanceOpensAt: formatM(opensM),
    lateCutoff: formatM(lateM),
    finalDeadline: end,
  };
}

export const TimetablePage: React.FC = () => {
  const { showToast } = useToast();



  // Filters & View State
  const [selectedDay, setSelectedDay] = useState<number | 'ALL'>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimetableEntry | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    classId: '',
    subjectId: '',
    dayOfWeek: 1 as 1 | 2 | 3 | 4 | 5 | 6,
    startTime: '09:00',
    endTime: '10:00',
    room: '',
    faculty: '',
    active: true,
  });
  const [formError, setFormError] = useState('');
  const [conflictWarning, setConflictWarning] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: timetable, loading } = useSyncedCollection<TimetableEntry>('timetable', 'timetableId');
  const { data: classes } = useSyncedCollection<AcademicClass>('classes', 'classId');
  const { data: subjects } = useSyncedCollection<Subject>('subjects', 'subjectId');

  const academicClasses = useMemo(() => {
    if (classes && classes.length > 0 && classes.some((c) => c.name.includes('CSE- Sem 3'))) {
      return classes.filter((c) => c.name.includes('CSE- Sem 3'));
    }
    return ACADEMIC_CLASSES;
  }, [classes]);

  // Pre-flight conflict check on form changes
  useEffect(() => {
    if (!formData.classId || !formData.startTime || !formData.endTime) {
      setConflictWarning([]);
      return;
    }

    const check = async () => {
      try {
        const res = await callValidateTimetableConflicts({
          classId: formData.classId,
          dayOfWeek: formData.dayOfWeek,
          startTime: formData.startTime,
          endTime: formData.endTime,
          room: formData.room,
          faculty: formData.faculty,
          excludeId: selectedEntry?.timetableId,
        });

        if (!res.data.valid) {
          setConflictWarning(res.data.conflicts);
        } else {
          setConflictWarning([]);
        }
      } catch (e) {
        // Validation check fallback
      }
    };

    const timer = setTimeout(check, 350);
    return () => clearTimeout(timer);
  }, [
    formData.classId,
    formData.dayOfWeek,
    formData.startTime,
    formData.endTime,
    formData.room,
    formData.faculty,
    selectedEntry?.timetableId,
  ]);

  // Filtered timetable
  const filteredEntries = timetable.filter((entry) => {
    const matchesDay = selectedDay === 'ALL' || entry.dayOfWeek === selectedDay;
    const matchesClass =
      selectedClassFilter === 'ALL' ||
      entry.classId === selectedClassFilter ||
      (selectedClassFilter === 'class_cse_3a' && entry.classId === 'class_ce_5a') ||
      (selectedClassFilter === 'class_cse_3b' && entry.classId === 'class_ce_5b');
    return matchesDay && matchesClass;
  });

  const handleOpenAdd = () => {
    setSelectedEntry(null);
    setFormData({
      classId: academicClasses[0]?.classId || 'class_cse_3a',
      subjectId: '',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      room: 'LH-101',
      faculty: '',
      active: true,
    });
    setFormError('');
    setConflictWarning([]);
    setIsAddModalOpen(true);
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.classId || !formData.subjectId.trim() || !formData.startTime || !formData.endTime) {
      setFormError('Please fill out all required fields.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');
      await callCreateTimetableEntry({
        classId: formData.classId,
        subjectId: formData.subjectId.trim(),
        dayOfWeek: formData.dayOfWeek,
        startTime: formData.startTime,
        endTime: formData.endTime,
        room: formData.room.trim(),
        faculty: formData.faculty.trim(),
        active: formData.active,
      });

      showToast({
        type: 'success',
        title: 'Lecture Scheduled',
        message: 'Timetable entry created with authoritative attendance windows.',
      });
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create timetable entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (entry: TimetableEntry) => {
    setSelectedEntry(entry);
    const existingSubject = subjects.find((s) => s.subjectId === entry.subjectId);
    const mappedClassId =
      entry.classId === 'class_ce_5a' ? 'class_cse_3a' :
      entry.classId === 'class_ce_5b' ? 'class_cse_3b' :
      entry.classId;

    setFormData({
      classId: mappedClassId,
      subjectId: existingSubject ? existingSubject.name : entry.subjectId,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      room: entry.room || '',
      faculty: entry.faculty || '',
      active: entry.active !== false,
    });
    setFormError('');
    setConflictWarning([]);
    setIsEditModalOpen(true);
  };

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;

    if (!formData.classId || !formData.subjectId.trim() || !formData.startTime || !formData.endTime) {
      setFormError('Please fill out all required fields.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');
      await callUpdateTimetableEntry({
        timetableId: selectedEntry.timetableId,
        classId: formData.classId,
        subjectId: formData.subjectId.trim(),
        dayOfWeek: formData.dayOfWeek,
        startTime: formData.startTime,
        endTime: formData.endTime,
        room: formData.room.trim(),
        faculty: formData.faculty.trim(),
        active: formData.active,
      });

      showToast({
        type: 'success',
        title: 'Schedule Updated',
        message: 'Lecture session updated successfully.',
      });
      setIsEditModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update schedule.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDelete = (entry: TimetableEntry) => {
    setSelectedEntry(entry);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteEntry = async () => {
    if (!selectedEntry) return;
    try {
      setSubmitting(true);
      await callDeleteTimetableEntry({ timetableId: selectedEntry.timetableId });
      showToast({
        type: 'success',
        title: 'Lecture Removed',
        message: 'Timetable session deleted successfully.',
      });
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.message || 'Could not delete entry.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const currentWindows = calculateTimingWindows(formData.startTime, formData.endTime);

  // Table columns for List View
  const tableColumns: Column<TimetableEntry>[] = [
    {
      key: 'dayOfWeek',
      header: 'Day',
      render: (t: TimetableEntry) => (
        <strong>{DAYS_OF_WEEK.find((d) => d.id === t.dayOfWeek)?.name || `Day ${t.dayOfWeek}`}</strong>
      ),
    },
    {
      key: 'startTime',
      header: 'Session Time',
      render: (t: TimetableEntry) => (
        <span className={styles.lectureTime}>
          <Clock size={12} />
          {t.startTime} – {t.endTime}
        </span>
      ),
    },
    {
      key: 'subjectId',
      header: 'Subject & Class',
      render: (t: TimetableEntry) => {
        const sub = subjects.find((s) => s.subjectId === t.subjectId);
        const cls = academicClasses.find(
          (c) =>
            c.classId === t.classId ||
            (t.classId === 'class_ce_5a' && c.classId === 'class_cse_3a') ||
            (t.classId === 'class_ce_5b' && c.classId === 'class_cse_3b')
        );
        return (
          <div>
            <div style={{ fontWeight: 'var(--font-medium)' }}>{sub?.name || t.subjectId}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {cls?.name || t.classId}
            </div>
          </div>
        );
      },
    },
    {
      key: 'room',
      header: 'Room & Faculty',
      render: (t: TimetableEntry) => (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          {t.room && <div>Room: {t.room}</div>}
          {t.faculty && <div>Faculty: {t.faculty}</div>}
        </div>
      ),
    },
    {
      key: 'attendanceOpensAt',
      header: 'Attendance Cutoffs',
      render: (t: TimetableEntry) => (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          <div>Opens: {t.attendanceOpensAt}</div>
          <div>Late cutoff: {t.lateCutoff}</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (t: TimetableEntry) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => handleOpenEdit(t)}
            title="Edit lecture"
          >
            <Edit2 size={13} /> Edit
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.danger}`}
            onClick={() => handleOpenDelete(t)}
            title="Delete lecture"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Six-Day Lecture Timetable</h2>
          <p className={styles.subtitle}>
            Weekly lecture schedules (Monday to Saturday) with automated attendance cutoffs and conflict prevention.
          </p>
        </div>
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={handleOpenAdd}>
          Add Lecture Session
        </Button>
      </div>

      {/* Control Bar: Day Tabs, Class Filter, View Toggle */}
      <div className={styles.controlsBar}>
        <div className={styles.dayTabs}>
          <button
            type="button"
            className={`${styles.dayTab} ${selectedDay === 'ALL' ? styles.active : ''}`}
            onClick={() => setSelectedDay('ALL')}
          >
            All Days
          </button>
          {DAYS_OF_WEEK.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`${styles.dayTab} ${selectedDay === d.id ? styles.active : ''}`}
              onClick={() => setSelectedDay(d.id)}
            >
              {d.short}
            </button>
          ))}
        </div>

        <div className={styles.filterControls}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="var(--color-text-muted)" />
            <select
              className={styles.filterSelect}
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              aria-label="Filter by Class"
            >
              <option value="ALL">All Academic Classes</option>
              {academicClasses.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.viewToggle} role="group" aria-label="View Mode">
            <button
              type="button"
              className={`${styles.viewToggleButton} ${viewMode === 'grid' ? styles.active : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${viewMode === 'table' ? styles.active : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
              aria-label="Table View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Content: Grid or Table */}
      {viewMode === 'grid' ? (
        <div className={styles.scheduleGrid}>
          {DAYS_OF_WEEK.filter((d) => selectedDay === 'ALL' || selectedDay === d.id).map(
            (day) => {
              const dayLectures = filteredEntries.filter(
                (entry) => entry.dayOfWeek === day.id
              );

              return (
                <div key={day.id} className={styles.dayColumn}>
                  <div className={styles.dayColumnHeader}>
                    <span className={styles.dayTitle}>{day.name}</span>
                    <span className={styles.sessionCountBadge}>
                      {dayLectures.length} {dayLectures.length === 1 ? 'Lecture' : 'Lectures'}
                    </span>
                  </div>

                  <div className={styles.dayColumnBody}>
                    {dayLectures.length === 0 ? (
                      <div className={styles.emptyDayMessage}>No lectures scheduled</div>
                    ) : (
                      dayLectures.map((item) => {
                        const sub = subjects.find((s) => s.subjectId === item.subjectId);
                        const cls = academicClasses.find(
                          (c) =>
                            c.classId === item.classId ||
                            (item.classId === 'class_ce_5a' && c.classId === 'class_cse_3a') ||
                            (item.classId === 'class_ce_5b' && c.classId === 'class_cse_3b')
                        );

                        return (
                          <div key={item.timetableId} className={styles.lectureCard}>
                            <div className={styles.lectureTimeRow}>
                              <span className={styles.lectureTime}>
                                <Clock size={12} />
                                {item.startTime} – {item.endTime}
                              </span>
                              <StatusBadge
                                status={item.active ? 'Present' : 'Absent'}
                                label={item.active ? 'Active' : 'Paused'}
                              />
                            </div>

                            <div className={styles.lectureSubject}>
                              {sub?.name || item.subjectId}
                            </div>

                            <div className={styles.lectureDetails}>
                              <div className={styles.lectureMetaRow}>
                                <BookOpen size={12} />
                                <span>{cls?.name || item.classId}</span>
                              </div>
                              {item.room && (
                                <div className={styles.lectureMetaRow}>
                                  <MapPin size={12} />
                                  <span>{item.room}</span>
                                </div>
                              )}
                              {item.faculty && (
                                <div className={styles.lectureMetaRow}>
                                  <User size={12} />
                                  <span>{item.faculty}</span>
                                </div>
                              )}
                            </div>

                            <div className={styles.windowChips}>
                              <span className={styles.windowChip}>
                                Opens: {item.attendanceOpensAt}
                              </span>
                              <span className={styles.windowChip}>
                                Late: {item.lateCutoff}
                              </span>
                            </div>

                            <div className={styles.lectureActions}>
                              <button
                                type="button"
                                className={styles.actionButton}
                                onClick={() => handleOpenEdit(item)}
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.danger}`}
                                onClick={() => handleOpenDelete(item)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Table
            columns={tableColumns}
            data={filteredEntries}
            keyExtractor={(t) => t.timetableId}
            isLoading={loading}
            emptyMessage="No lecture timetable entries found."
          />
        </div>
      )}

      {/* Add Lecture Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Schedule New Lecture"
        maxWidth="560px"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateEntry}
              isLoading={submitting}
              disabled={conflictWarning.length > 0}
            >
              Save Schedule
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateEntry} className={styles.formGrid}>
          {formError && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
              {formError}
            </div>
          )}

          {conflictWarning.length > 0 && (
            <div className={styles.conflictAlert}>
              <AlertTriangle size={16} />
              <div>
                <strong>Schedule Conflict Detected:</strong>
                {conflictWarning.map((c, i) => (
                  <div key={i}>{c}</div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.formRowTwoCol}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Academic Class *</label>
              <select
                className={styles.formInput}
                value={formData.classId}
                onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                required
              >
                <option value="" disabled>Select Class...</option>
                {academicClasses.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>Subjects *</label>
              <input
                type="text"
                list="timetable-subjects-list"
                required
                className={styles.formInput}
                placeholder="Enter subject name (e.g. Operating Systems)"
                value={formData.subjectId}
                onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
              />
              <datalist id="timetable-subjects-list">
                {subjects.map((s) => (
                  <option key={s.subjectId} value={s.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Day of the Week *</label>
            <select
              className={styles.formInput}
              value={formData.dayOfWeek}
              onChange={(e) =>
                setFormData({ ...formData, dayOfWeek: Number(e.target.value) as any })
              }
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formRowTwoCol}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Start Time (HH:MM) *</label>
              <input
                type="time"
                required
                className={styles.formInput}
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>End Time (HH:MM) *</label>
              <input
                type="time"
                required
                className={styles.formInput}
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              />
            </div>
          </div>

          {currentWindows && (
            <div className={styles.windowsPreviewBox}>
              <div className={styles.windowsPreviewTitle}>
                Calculated Attendance Enforcement Windows
              </div>
              <div className={styles.windowsList}>
                <div className={styles.windowsItem}>
                  <span>Attendance Opens:</span>
                  <strong>{currentWindows.attendanceOpensAt}</strong>
                  <span>(-5 mins)</span>
                </div>
                <div className={styles.windowsItem}>
                  <span>Late Cutoff:</span>
                  <strong>{currentWindows.lateCutoff}</strong>
                  <span>(+10 mins)</span>
                </div>
                <div className={styles.windowsItem}>
                  <span>Session Deadline:</span>
                  <strong>{currentWindows.finalDeadline}</strong>
                  <span>(End time)</span>
                </div>
              </div>
            </div>
          )}

          <div className={styles.formRowTwoCol}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Room / Hall</label>
              <input
                type="text"
                placeholder="e.g. LH-101"
                className={styles.formInput}
                value={formData.room}
                onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>Faculty Instructor</label>
              <input
                type="text"
                placeholder="e.g. Dr. Alan Turing"
                className={styles.formInput}
                value={formData.faculty}
                onChange={(e) => setFormData({ ...formData, faculty: e.target.value })}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Lecture Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Lecture Schedule"
        maxWidth="560px"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdateEntry}
              isLoading={submitting}
              disabled={conflictWarning.length > 0}
            >
              Save Changes
            </Button>
          </div>
        }
      >
        <form onSubmit={handleUpdateEntry} className={styles.formGrid}>
          {formError && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
              {formError}
            </div>
          )}

          {conflictWarning.length > 0 && (
            <div className={styles.conflictAlert}>
              <AlertTriangle size={16} />
              <div>
                <strong>Schedule Conflict Detected:</strong>
                {conflictWarning.map((c, i) => (
                  <div key={i}>{c}</div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.formRowTwoCol}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Academic Class *</label>
              <select
                className={styles.formInput}
                value={formData.classId}
                onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
              >
                {academicClasses.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>Subjects *</label>
              <input
                type="text"
                list="edit-timetable-subjects-list"
                required
                className={styles.formInput}
                placeholder="Enter subject name"
                value={formData.subjectId}
                onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
              />
              <datalist id="edit-timetable-subjects-list">
                {subjects.map((s) => (
                  <option key={s.subjectId} value={s.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Day of the Week *</label>
            <select
              className={styles.formInput}
              value={formData.dayOfWeek}
              onChange={(e) =>
                setFormData({ ...formData, dayOfWeek: Number(e.target.value) as any })
              }
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formRowTwoCol}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Start Time *</label>
              <input
                type="time"
                required
                className={styles.formInput}
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>End Time *</label>
              <input
                type="time"
                required
                className={styles.formInput}
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              />
            </div>
          </div>

          {currentWindows && (
            <div className={styles.windowsPreviewBox}>
              <div className={styles.windowsPreviewTitle}>
                Calculated Attendance Windows
              </div>
              <div className={styles.windowsList}>
                <div className={styles.windowsItem}>
                  <span>Opens:</span>
                  <strong>{currentWindows.attendanceOpensAt}</strong>
                </div>
                <div className={styles.windowsItem}>
                  <span>Late Cutoff:</span>
                  <strong>{currentWindows.lateCutoff}</strong>
                </div>
                <div className={styles.windowsItem}>
                  <span>Deadline:</span>
                  <strong>{currentWindows.finalDeadline}</strong>
                </div>
              </div>
            </div>
          )}

          <div className={styles.formRowTwoCol}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Room / Hall</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.room}
                onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>Faculty</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.faculty}
                onChange={(e) => setFormData({ ...formData, faculty: e.target.value })}
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <span className={styles.formLabel}>Active Lecture in Timetable</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Session Deletion"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteEntry}
              isLoading={submitting}
            >
              Delete Lecture
            </Button>
          </div>
        }
      >
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          Are you sure you want to delete this lecture session ({selectedEntry?.startTime} – {selectedEntry?.endTime})?
        </p>
      </Modal>
    </div>
  );
};
