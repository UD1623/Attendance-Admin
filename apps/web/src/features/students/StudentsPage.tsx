import React, { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { useSyncedCollection } from '@/lib/useSyncedData';
import {
  Users,
  Fingerprint,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Layers,
  BookOpen,
  Plus,
  Cpu,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  callRegisterStudent,
  callUpdateStudent,
  callDeleteStudent,
  callRequestEnrollment,
  callCancelEnrollment,
  callProcessEnrollmentResult,
  callCreateClass,
  callDeleteClass,
  callCreateSubject,
  callDeleteSubject,
} from '@/lib/callables';
import { Student, AcademicClass, Subject, EnrollmentRequest } from '@/types';
import {
  Button,
  Modal,
  Table,
  Column,
  StatusBadge,
  useToast,
} from '@/components';
import styles from './StudentsPage.module.css';

export const StudentsPage: React.FC = () => {
  const { showToast } = useToast();



  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [biometricFilter, setBiometricFilter] = useState('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [isAcademicModalOpen, setIsAcademicModalOpen] = useState(false);

  // Selected student for edit / delete / enroll
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    fullName: '',
    rollNumber: '',
    classId: '',
    active: true,
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Biometric Enrollment Wizard State
  const [selectedDeviceId, setSelectedDeviceId] = useState('ESP32-READER-01');
  const [activeEnrollment, setActiveEnrollment] = useState<EnrollmentRequest | null>(null);
  const [enrollingStep, setEnrollingStep] = useState<'device' | 'waiting' | 'success' | 'failed'>('device');
  const [enrollmentError, setEnrollmentError] = useState('');

  // Academic Class / Subject form state
  const [academicTab, setAcademicTab] = useState<'classes' | 'subjects'>('classes');
  const [newClassForm, setNewClassForm] = useState({
    name: '',
    code: '',
    department: 'Computer Science & Engineering',
    semester: 5,
  });
  const [newSubjectForm, setNewSubjectForm] = useState({
    name: '',
    code: '',
    department: 'Computer Science & Engineering',
  });

  const { data: students, loading } = useSyncedCollection<Student>('students', 'studentId');
  const { data: classes } = useSyncedCollection<AcademicClass>('classes', 'classId');
  const { data: subjects } = useSyncedCollection<Subject>('subjects', 'subjectId');

  // Listen to active enrollment request
  useEffect(() => {
    if (!activeEnrollment?.requestId) return;

    const unsubReq = onSnapshot(
      doc(db, 'enrollmentRequests', activeEnrollment.requestId),
      (snap) => {
        if (snap.exists()) {
          const req = snap.data() as EnrollmentRequest;
          setActiveEnrollment(req);
          if (req.status === 'completed') {
            setEnrollingStep('success');
            showToast({
              type: 'success',
              title: 'Biometric Enrolled',
              message: `Student successfully registered in Hardware Slot #${req.fingerprintRef}!`,
            });
          } else if (req.status === 'failed') {
            setEnrollingStep('failed');
            setEnrollmentError(req.errorMessage || 'Sensor failed to capture fingerprint.');
          }
        }
      }
    );

    return () => unsubReq();
  }, [activeEnrollment?.requestId, showToast]);

  // Statistics calculation
  const totalStudents = students.length;
  const enrolledStudents = students.filter((s) => s.fingerprintRef !== null && s.fingerprintRef !== undefined).length;
  const unenrolledStudents = totalStudents - enrolledStudents;
  const enrollmentRate = totalStudents > 0 ? Math.round((enrolledStudents / totalStudents) * 100) : 0;

  // Filtered Students
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.rollNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesClass =
      selectedClassFilter === 'ALL' || s.classId === selectedClassFilter;

    const matchesBiometric =
      biometricFilter === 'ALL' ||
      (biometricFilter === 'ENROLLED' && s.fingerprintRef !== null) ||
      (biometricFilter === 'UNENROLLED' && s.fingerprintRef === null);

    return matchesSearch && matchesClass && matchesBiometric;
  });

  // Action Handlers
  const handleOpenAddModal = () => {
    setFormData({
      fullName: '',
      rollNumber: '',
      classId: classes[0]?.classId || '',
      active: true,
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.rollNumber.trim() || !formData.classId) {
      setFormError('Please fill out all required fields.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError('');
      await callRegisterStudent({
        fullName: formData.fullName.trim(),
        rollNumber: formData.rollNumber.trim().toUpperCase(),
        classId: formData.classId,
      });

      showToast({
        type: 'success',
        title: 'Student Registered',
        message: `${formData.fullName} added successfully.`,
      });
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to register student.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (student: Student) => {
    setSelectedStudent(student);
    setFormData({
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      classId: student.classId,
      active: student.active,
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    try {
      setSubmitting(true);
      setFormError('');
      await callUpdateStudent({
        studentId: selectedStudent.studentId,
        fullName: formData.fullName.trim(),
        rollNumber: formData.rollNumber.trim().toUpperCase(),
        classId: formData.classId,
        active: formData.active,
      });

      showToast({
        type: 'success',
        title: 'Student Updated',
        message: `${formData.fullName} record was updated.`,
      });
      setIsEditModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update student.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDelete = (student: Student) => {
    setSelectedStudent(student);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteStudent = async () => {
    if (!selectedStudent) return;
    try {
      setSubmitting(true);
      await callDeleteStudent({ studentId: selectedStudent.studentId });
      showToast({
        type: 'success',
        title: 'Student Deleted',
        message: `${selectedStudent.fullName} removed from roster.`,
      });
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Deletion Failed',
        message: err.message || 'Could not delete student.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Biometric Enrollment Handlers
  const handleOpenEnrollment = (student: Student) => {
    setSelectedStudent(student);
    setActiveEnrollment(null);
    setEnrollingStep('device');
    setEnrollmentError('');
    setIsEnrollModalOpen(true);
  };

  const handleStartEnrollment = async () => {
    if (!selectedStudent) return;
    try {
      setSubmitting(true);
      setEnrollmentError('');
      const res = await callRequestEnrollment({
        studentId: selectedStudent.studentId,
        deviceId: selectedDeviceId,
      });
      setActiveEnrollment(res.data.enrollment);
      setEnrollingStep('waiting');
    } catch (err: any) {
      setEnrollmentError(err.message || 'Failed to initiate enrollment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimulateScannerCapture = async () => {
    if (!activeEnrollment) return;
    try {
      setSubmitting(true);
      // Pick random slot between 10 and 250
      const slot = Math.floor(Math.random() * 200) + 10;
      await callProcessEnrollmentResult({
        requestId: activeEnrollment.requestId,
        studentId: activeEnrollment.studentId,
        status: 'success',
        fingerprintRef: slot,
      });
      setActiveEnrollment((prev) =>
        prev ? { ...prev, status: 'completed', fingerprintRef: slot } : null
      );
      setEnrollingStep('success');
      showToast({
        type: 'success',
        title: 'Biometric Enrolled',
        message: `Student successfully registered in Hardware Slot #${slot}!`,
      });
    } catch (err: any) {
      setEnrollmentError(err.message || 'Simulation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEnrollment = async () => {
    if (activeEnrollment && activeEnrollment.status === 'pending') {
      try {
        await callCancelEnrollment({ requestId: activeEnrollment.requestId });
      } catch (e) {
        console.warn(e);
      }
    }
    setIsEnrollModalOpen(false);
  };

  // Classes & Subjects handlers
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await callCreateClass({
        name: newClassForm.name.trim(),
        code: newClassForm.code.trim().toUpperCase(),
        department: newClassForm.department.trim(),
        semester: Number(newClassForm.semester),
        academicYear: '2024-2025',
      });
      showToast({ type: 'success', title: 'Class Created', message: newClassForm.name });
      setNewClassForm({ name: '', code: '', department: 'Computer Science & Engineering', semester: 5 });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      await callDeleteClass({ classId });
      showToast({ type: 'success', title: 'Class Removed', message: 'Class deleted successfully.' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Cannot Delete', message: err.message });
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await callCreateSubject({
        name: newSubjectForm.name.trim(),
        code: newSubjectForm.code.trim().toUpperCase(),
        department: newSubjectForm.department.trim(),
      });
      showToast({ type: 'success', title: 'Subject Created', message: newSubjectForm.name });
      setNewSubjectForm({ name: '', code: '', department: 'Computer Science & Engineering' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    try {
      await callDeleteSubject({ subjectId });
      showToast({ type: 'success', title: 'Subject Removed', message: 'Subject deleted successfully.' });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Cannot Delete', message: err.message });
    }
  };

  // Table Columns
  const columns: Column<Student>[] = [
    {
      key: 'rollNumber',
      header: 'Roll Number',
      render: (s) => <strong>{s.rollNumber}</strong>,
    },
    {
      key: 'fullName',
      header: 'Student Name',
      render: (s) => (
        <div>
          <div style={{ fontWeight: 'var(--font-medium)' }}>{s.fullName}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {classes.find((c) => c.classId === s.classId)?.name || s.className || s.classId}
          </div>
        </div>
      ),
    },
    {
      key: 'fingerprintRef',
      header: 'Biometric Status',
      render: (s) => {
        const isEnrolled = s.fingerprintRef !== null && s.fingerprintRef !== undefined;
        return (
          <span
            className={`${styles.biometricBadge} ${
              isEnrolled ? styles.enrolled : styles.unenrolled
            }`}
          >
            <Fingerprint size={14} />
            {isEnrolled ? `Slot #${s.fingerprintRef} (Enrolled)` : 'Unenrolled'}
          </span>
        );
      },
    },
    {
      key: 'active',
      header: 'Roster Status',
      render: (s) => (
        <StatusBadge
          status={s.active ? 'Present' : 'Absent'}
          label={s.active ? 'Active' : 'Archived'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) => (
        <div className={styles.actionButtonRow}>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Fingerprint size={14} />}
            onClick={() => handleOpenEnrollment(s)}
          >
            {s.fingerprintRef !== null ? 'Re-enroll' : 'Enroll'}
          </Button>
          <button
            type="button"
            className={styles.actionIconButton}
            onClick={() => handleOpenEdit(s)}
            title="Edit student profile"
            aria-label="Edit student"
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            className={`${styles.actionIconButton} ${styles.delete}`}
            onClick={() => handleOpenDelete(s)}
            title="Delete student"
            aria-label="Delete student"
          >
            <Trash2 size={14} />
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
          <h2 className={styles.title}>Student Roster & Biometric Enrollment</h2>
          <p className={styles.subtitle}>
            Manage academic class enrollments, assign hardware biometric slots, and maintain student rosters.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            leftIcon={<Layers size={16} />}
            onClick={() => setIsAcademicModalOpen(true)}
          >
            Classes & Subjects
          </Button>
          <Button
            variant="primary"
            leftIcon={<UserPlus size={16} />}
            onClick={handleOpenAddModal}
          >
            Register Student
          </Button>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Students</span>
            <span className={styles.statValue}>{totalStudents}</span>
          </div>
          <div className={`${styles.statIcon} ${styles.iconPrimary}`}>
            <Users size={22} />
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Biometrically Enrolled</span>
            <span className={styles.statValue}>{enrolledStudents}</span>
          </div>
          <div className={`${styles.statIcon} ${styles.iconSuccess}`}>
            <Fingerprint size={22} />
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Pending Biometrics</span>
            <span className={styles.statValue}>{unenrolledStudents}</span>
          </div>
          <div className={`${styles.statIcon} ${styles.iconWarning}`}>
            <AlertCircle size={22} />
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Enrollment Rate</span>
            <span className={styles.statValue}>{enrollmentRate}%</span>
          </div>
          <div className={`${styles.statIcon} ${styles.iconNeutral}`}>
            <CheckCircle2 size={22} />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by student name or roll number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <select
            className={styles.filterSelect}
            value={biometricFilter}
            onChange={(e) => setBiometricFilter(e.target.value)}
            aria-label="Filter by Biometrics"
          >
            <option value="ALL">All Biometric States</option>
            <option value="ENROLLED">Enrolled Only</option>
            <option value="UNENROLLED">Unenrolled Only</option>
          </select>
        </div>
      </div>

      {/* Student Table */}
      <div className={styles.tableCard}>
        <Table
          columns={columns}
          data={filteredStudents}
          keyExtractor={(s) => s.studentId}
          isLoading={loading}
          emptyMessage="No students found matching the selected filters. Use 'Register Student' to add new students."
        />
      </div>

      {/* Register Student Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Student"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRegisterStudent}
              isLoading={submitting}
            >
              Register Student
            </Button>
          </div>
        }
      >
        <form onSubmit={handleRegisterStudent} className={styles.formGrid}>
          {formError && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
              {formError}
            </div>
          )}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Full Student Name *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="e.g. Aditi Sharma"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Institutional Roll Number *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="e.g. CS-2024-042"
              value={formData.rollNumber}
              onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Academic Class *</label>
            <select
              className={styles.formInput}
              value={formData.classId}
              onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
              required
            >
              <option value="" disabled>
                Select Academic Class...
              </option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* Edit Student Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Student Profile"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdateStudent}
              isLoading={submitting}
            >
              Save Changes
            </Button>
          </div>
        }
      >
        <form onSubmit={handleUpdateStudent} className={styles.formGrid}>
          {formError && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
              {formError}
            </div>
          )}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Full Student Name *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Roll Number *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              value={formData.rollNumber}
              onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Academic Class *</label>
            <select
              className={styles.formInput}
              value={formData.classId}
              onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
            >
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formRow}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <span className={styles.formLabel}>Active Student in Attendance Roster</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Delete Student Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Student Deletion"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteStudent}
              isLoading={submitting}
            >
              Delete Student
            </Button>
          </div>
        }
      >
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          Are you sure you want to remove <strong>{selectedStudent?.fullName}</strong> ({selectedStudent?.rollNumber})?
          This will also release biometric hardware reference slot #{selectedStudent?.fingerprintRef || 'N/A'}.
        </p>
      </Modal>

      {/* Biometric Enrollment Wizard Modal */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={handleCancelEnrollment}
        title="Biometric Fingerprint Enrollment"
        maxWidth="540px"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {enrollingStep === 'device' && (
              <>
                <Button variant="outline" onClick={() => setIsEnrollModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  leftIcon={<Fingerprint size={16} />}
                  onClick={handleStartEnrollment}
                  isLoading={submitting}
                >
                  Initiate Scanner Capture
                </Button>
              </>
            )}

            {enrollingStep === 'waiting' && (
              <>
                <Button variant="outline" onClick={handleCancelEnrollment}>
                  Cancel Request
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<Cpu size={16} />}
                  onClick={handleSimulateScannerCapture}
                  isLoading={submitting}
                >
                  Simulate Scanner Press
                </Button>
              </>
            )}

            {(enrollingStep === 'success' || enrollingStep === 'failed') && (
              <Button variant="primary" onClick={() => setIsEnrollModalOpen(false)}>
                Done
              </Button>
            )}
          </div>
        }
      >
        <div className={styles.enrollWizard}>
          <div className={styles.enrollBanner}>
            <strong>Target:</strong> {selectedStudent?.fullName} ({selectedStudent?.rollNumber})
            <br />
            <strong>Biometric Privacy Notice:</strong> Raw fingerprint images are never stored on the cloud. Templates are retained securely on local sensor hardware memory; only numeric slot references (1..1000) are synchronized.
          </div>

          {enrollingStep === 'device' && (
            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Target Hardware Scanner Device *</label>
                <select
                  className={styles.formInput}
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                >
                  <option value="ESP32-READER-01">ESP32-READER-01 (Main Entrance Gate)</option>
                  <option value="ESP32-LAB-02">ESP32-LAB-02 (Hardware Lab Gate)</option>
                </select>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Device must be online and connected to receive the enrollment dispatch packet.
                </span>
              </div>
            </div>
          )}

          {enrollingStep === 'waiting' && (
            <div>
              <div className={styles.scannerVisual}>
                <div className={styles.fingerprintRing}>
                  <Fingerprint size={42} className={styles.scannerIconPulse} />
                </div>
                <div className={styles.scannerStatusText}>
                  Awaiting Finger Placement on Scanner...
                </div>
                <div className={styles.scannerSubtext}>
                  Scanner: {selectedDeviceId} | Request ID: {activeEnrollment?.requestId}
                </div>
              </div>

              <div className={styles.simulatorBox}>
                <div className={styles.simulatorBoxText}>
                  <strong>Testing locally?</strong> Click <em>'Simulate Scanner Press'</em> or run:
                  <br />
                  <code>npm run simulator -- --enroll {activeEnrollment?.requestId}</code>
                </div>
              </div>
            </div>
          )}

          {enrollingStep === 'success' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
              <div style={{ color: 'var(--color-success)', marginBottom: 'var(--space-2)' }}>
                <CheckCircle2 size={48} style={{ margin: '0 auto' }} />
              </div>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                Biometric Enrollment Complete!
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
                Student fingerprint template assigned to <strong>Hardware Slot #{activeEnrollment?.fingerprintRef}</strong> on device {activeEnrollment?.deviceId}.
              </p>
            </div>
          )}

          {enrollingStep === 'failed' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
              <div style={{ color: 'var(--color-error)', marginBottom: 'var(--space-2)' }}>
                <AlertCircle size={48} style={{ margin: '0 auto' }} />
              </div>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                Enrollment Encountered An Issue
              </h3>
              <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
                {enrollmentError}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Classes & Subjects Management Modal */}
      <Modal
        isOpen={isAcademicModalOpen}
        onClose={() => setIsAcademicModalOpen(false)}
        title="Manage Academic Structure"
        maxWidth="680px"
        footer={
          <Button variant="primary" onClick={() => setIsAcademicModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div className={styles.classesModalContent}>
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
            <Button
              variant={academicTab === 'classes' ? 'primary' : 'outline'}
              size="sm"
              leftIcon={<Layers size={14} />}
              onClick={() => setAcademicTab('classes')}
            >
              Academic Classes ({classes.length})
            </Button>
            <Button
              variant={academicTab === 'subjects' ? 'primary' : 'outline'}
              size="sm"
              leftIcon={<BookOpen size={14} />}
              onClick={() => setAcademicTab('subjects')}
            >
              Subjects ({subjects.length})
            </Button>
          </div>

          {academicTab === 'classes' ? (
            <div>
              <form onSubmit={handleCreateClass} style={{ marginBottom: '16px', background: 'var(--color-page-bg)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <strong style={{ fontSize: 'var(--text-sm)' }}>Add New Academic Class</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="text"
                    required
                    placeholder="Class Name (e.g. CE - Sem 5 Div A)"
                    className={styles.formInput}
                    value={newClassForm.name}
                    onChange={(e) => setNewClassForm({ ...newClassForm, name: e.target.value })}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Code (e.g. CE-5A)"
                    className={styles.formInput}
                    value={newClassForm.code}
                    onChange={(e) => setNewClassForm({ ...newClassForm, code: e.target.value })}
                  />
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    placeholder="Sem (5)"
                    className={styles.formInput}
                    value={newClassForm.semester}
                    onChange={(e) => setNewClassForm({ ...newClassForm, semester: Number(e.target.value) })}
                  />
                  <Button type="submit" variant="primary" size="sm" leftIcon={<Plus size={14} />} isLoading={submitting}>
                    Add
                  </Button>
                </div>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {classes.map((c) => (
                  <div key={c.classId} className={styles.itemCard}>
                    <div className={styles.itemCardInfo}>
                      <strong>{c.name}</strong>
                      <span>Code: {c.code} | Semester: {c.semester} | {c.department}</span>
                    </div>
                    <button
                      type="button"
                      className={`${styles.actionIconButton} ${styles.delete}`}
                      onClick={() => handleDeleteClass(c.classId)}
                      title="Delete class"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <form onSubmit={handleCreateSubject} style={{ marginBottom: '16px', background: 'var(--color-page-bg)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <strong style={{ fontSize: 'var(--text-sm)' }}>Add New Subject</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="text"
                    required
                    placeholder="Subject Name (e.g. Operating Systems)"
                    className={styles.formInput}
                    value={newSubjectForm.name}
                    onChange={(e) => setNewSubjectForm({ ...newSubjectForm, name: e.target.value })}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Subject Code (CS501)"
                    className={styles.formInput}
                    value={newSubjectForm.code}
                    onChange={(e) => setNewSubjectForm({ ...newSubjectForm, code: e.target.value })}
                  />
                  <Button type="submit" variant="primary" size="sm" leftIcon={<Plus size={14} />} isLoading={submitting}>
                    Add
                  </Button>
                </div>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {subjects.map((sub) => (
                  <div key={sub.subjectId} className={styles.itemCard}>
                    <div className={styles.itemCardInfo}>
                      <strong>{sub.name}</strong>
                      <span>Code: {sub.code} | {sub.department}</span>
                    </div>
                    <button
                      type="button"
                      className={`${styles.actionIconButton} ${styles.delete}`}
                      onClick={() => handleDeleteSubject(sub.subjectId)}
                      title="Delete subject"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
