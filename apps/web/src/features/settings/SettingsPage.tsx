import React, { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
} from 'firebase/firestore';
import {
  Shield,
  ShieldCheck,
  UserPlus,
  History,
  Building,
  Save,
  Eye,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/app/AuthProvider';
import { useSyncedCollection } from '@/lib/useSyncedData';
import { getDevSettings } from '@/lib/devData';
import {
  callCreateAdminUser,
  callUpdateInstitutionSettings,
} from '@/lib/callables';
import { InstitutionSettings, AdminUser, AuditLog } from '@/types';
import {
  Button,
  Modal,
  Table,
  Column,
  StatusBadge,
  useToast,
} from '@/components';
import styles from './SettingsPage.module.css';

export const SettingsPage: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const { showToast } = useToast();

  const [settings, setSettings] = useState<InstitutionSettings>(() => getDevSettings());
  const { data: admins } = useSyncedCollection<AdminUser>('admins', 'uid');
  const { data: auditLogs, loading } = useSyncedCollection<AuditLog>('auditLogs', 'id');
  const [savingSettings, setSavingSettings] = useState(false);

  // Provision Admin Modal
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({
    displayName: '',
    email: '',
    password: '',
    role: 'admin' as 'admin' | 'superAdmin',
  });
  const [adminError, setAdminError] = useState('');
  const [provisioning, setProvisioning] = useState(false);

  // Audit Detail Modal
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getDevSettings());
    };
    window.addEventListener('dev-store-updated', handleUpdate);

    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        doc(db, 'settings', 'institution'),
        (snap) => {
          if (snap.exists()) {
            setSettings(snap.data() as InstitutionSettings);
          }
        },
        () => {
          // offline
        }
      );
    } catch {}

    return () => {
      window.removeEventListener('dev-store-updated', handleUpdate);
      if (unsub) unsub();
    };
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    try {
      setSavingSettings(true);
      await callUpdateInstitutionSettings(settings);
      showToast({
        type: 'success',
        title: 'Settings Saved',
        message: 'Institutional parameters updated successfully.',
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Could not update settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleProvisionAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminForm.displayName || !adminForm.email || !adminForm.password) {
      setAdminError('Please fill out all fields.');
      return;
    }

    try {
      setProvisioning(true);
      setAdminError('');
      await callCreateAdminUser({
        displayName: adminForm.displayName.trim(),
        email: adminForm.email.trim().toLowerCase(),
        password: adminForm.password,
        role: adminForm.role,
      });

      showToast({
        type: 'success',
        title: 'Admin Provisioned',
        message: `Account for ${adminForm.email} created with role ${adminForm.role}.`,
      });
      setIsAdminModalOpen(false);
      setAdminForm({ displayName: '', email: '', password: '', role: 'admin' });
    } catch (err: any) {
      setAdminError(err.message || 'Failed to provision admin account.');
    } finally {
      setProvisioning(false);
    }
  };

  const adminColumns: Column<AdminUser>[] = [
    {
      key: 'displayName',
      header: 'Name',
      render: (a: AdminUser) => <strong>{a.displayName || 'Administrator'}</strong>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (a: AdminUser) => a.email,
    },
    {
      key: 'role',
      header: 'Privilege Level',
      render: (a: AdminUser) => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-semibold)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            background: a.role === 'superAdmin' ? 'var(--color-primary-light)' : 'var(--color-surface-hover)',
            color: a.role === 'superAdmin' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          }}
        >
          {a.role === 'superAdmin' ? <ShieldCheck size={14} /> : <Shield size={14} />}
          {a.role === 'superAdmin' ? 'SuperAdmin' : 'Admin'}
        </span>
      ),
    },
    {
      key: 'uid',
      header: 'Security UID',
      render: (a: AdminUser) => (
        <code style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {a.uid.substring(0, 12)}...
        </code>
      ),
    },
  ];

  const auditColumns: Column<AuditLog>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      render: (log: AuditLog) => {
        const d = log.timestamp?.toDate ? log.timestamp.toDate() : new Date();
        return (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {d.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: 'action',
      header: 'Action',
      render: (log: AuditLog) => <span className={styles.actionBadge}>{log.action}</span>,
    },
    {
      key: 'actorEmail',
      header: 'Actor',
      render: (log: AuditLog) => (
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
          {log.actorEmail}
        </span>
      ),
    },
    {
      key: 'targetType',
      header: 'Target Entity',
      render: (log: AuditLog) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          {log.targetType}:{log.targetId?.substring(0, 8)}
        </span>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (log: AuditLog) => (
        <button
          type="button"
          onClick={() => setSelectedAuditLog(log)}
          style={{
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Eye size={12} /> View
        </button>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Administration & System Settings</h2>
          <p className={styles.subtitle}>
            Institutional timing windows, cryptographic drift limits, administrator RBAC, and immutable audit trails.
          </p>
        </div>
      </div>

      <div className={styles.sectionGrid}>
        {/* Institutional Settings Form */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrapper}>
              <Building size={20} color="var(--color-primary)" />
              <div>
                <h3 className={styles.cardTitle}>Institutional Parameters</h3>
                <span className={styles.cardDescription}>
                  Defines default attendance cutoffs, academic year, and timing enforcement.
                </span>
              </div>
            </div>
            {!isSuperAdmin && (
              <StatusBadge status="Late" label="Read-Only (SuperAdmin required to edit)" />
            )}
          </div>

          <form onSubmit={handleSaveSettings}>
            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Institution Name</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Academic Department</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.department}
                  onChange={(e) => setSettings({ ...settings, department: e.target.value })}
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Academic Year</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.academicYear}
                  onChange={(e) => setSettings({ ...settings, academicYear: e.target.value })}
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Timezone</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Attendance Opens Before (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.attendanceOpensBeforeMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      attendanceOpensBeforeMinutes: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Late Arrival Tolerance (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.lateToleranceMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      lateToleranceMinutes: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Clock Drift Tolerance (Seconds)</label>
                <input
                  type="number"
                  min="30"
                  max="300"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.driftToleranceSeconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      driftToleranceSeconds: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Device Offline Threshold (Seconds)</label>
                <input
                  type="number"
                  min="30"
                  max="600"
                  disabled={!isSuperAdmin}
                  className={styles.formInput}
                  value={settings.deviceOfflineThresholdSeconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deviceOfflineThresholdSeconds: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            {isSuperAdmin && (
              <div className={styles.formFooter}>
                <Button
                  type="submit"
                  variant="primary"
                  leftIcon={<Save size={16} />}
                  isLoading={savingSettings}
                >
                  Save Institutional Settings
                </Button>
              </div>
            )}
          </form>
        </div>

        {/* Administrator Management (SuperAdmin only) */}
        {isSuperAdmin && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleWrapper}>
                <ShieldCheck size={20} color="var(--color-primary)" />
                <div>
                  <h3 className={styles.cardTitle}>Administrator Accounts</h3>
                  <span className={styles.cardDescription}>
                    Manage personnel authorized to administer attendance records and roster configurations.
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<UserPlus size={14} />}
                onClick={() => setIsAdminModalOpen(true)}
              >
                Provision Admin
              </Button>
            </div>

            <Table
              columns={adminColumns}
              data={admins}
              keyExtractor={(a) => a.uid}
              isLoading={loading}
              emptyMessage="No administrators configured."
            />
          </div>
        )}

        {/* System Audit Log Viewer */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrapper}>
              <History size={20} color="var(--color-primary)" />
              <div>
                <h3 className={styles.cardTitle}>Immutable Audit Trail</h3>
                <span className={styles.cardDescription}>
                  Real-time tamper-evident log of administrative operations and biometric events.
                </span>
              </div>
            </div>
          </div>

          <div className={styles.auditTableWrapper}>
            <Table
              columns={auditColumns}
              data={auditLogs}
              keyExtractor={(l) => l.logId || l.id || 'log'}
              isLoading={loading}
              emptyMessage="No audit logs recorded yet."
            />
          </div>
        </div>
      </div>

      {/* Provision Admin Modal */}
      <Modal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        title="Provision Administrator Account"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsAdminModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleProvisionAdmin}
              isLoading={provisioning}
            >
              Create Administrator
            </Button>
          </div>
        }
      >
        <form onSubmit={handleProvisionAdmin} className={styles.formGrid}>
          {adminError && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
              {adminError}
            </div>
          )}

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Full Display Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Dr. Jane Smith"
              className={styles.formInput}
              value={adminForm.displayName}
              onChange={(e) => setAdminForm({ ...adminForm, displayName: e.target.value })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Institutional Email *</label>
            <input
              type="email"
              required
              placeholder="e.g. janesmith@college.edu"
              className={styles.formInput}
              value={adminForm.email}
              onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Initial Temporary Password * (min 8 chars)</label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className={styles.formInput}
              value={adminForm.password}
              onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Assigned Role *</label>
            <select
              className={styles.formInput}
              value={adminForm.role}
              onChange={(e) =>
                setAdminForm({ ...adminForm, role: e.target.value as 'admin' | 'superAdmin' })
              }
            >
              <option value="admin">Administrator (Roster, Timetable & Attendance)</option>
              <option value="superAdmin">SuperAdmin (Full Permissions & RBAC Provisioning)</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Audit Detail Modal */}
      <Modal
        isOpen={Boolean(selectedAuditLog)}
        onClose={() => setSelectedAuditLog(null)}
        title={`Audit Event: ${selectedAuditLog?.action || ''}`}
        footer={
          <Button variant="primary" onClick={() => setSelectedAuditLog(null)}>
            Close
          </Button>
        }
      >
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
            Actor: <strong>{selectedAuditLog?.actorEmail}</strong> ({selectedAuditLog?.actorUid})
            <br />
            Target: <strong>{selectedAuditLog?.targetType}</strong> (ID: {selectedAuditLog?.targetId})
          </p>
          <pre className={styles.detailsModalJson}>
            {JSON.stringify(selectedAuditLog?.details || {}, null, 2)}
          </pre>
        </div>
      </Modal>
    </div>
  );
};
