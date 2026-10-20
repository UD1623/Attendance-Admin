import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Wifi,
  HardDrive,
  Activity,
  MapPin,
  Clock,
  Plus,
  RefreshCw,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { DeviceInfo, Student } from '@/types';
import { Button, Modal, EmptyState } from '@/components';
import styles from './DevicesPage.module.css';

const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_URL || 'http://127.0.0.1:5001/smart-attendance-dev/us-central1';

const OFFLINE_THRESHOLD_SECONDS = 90;

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [now, setNow] = useState<number>(Date.now());

  // Registration Modal
  const [registerModalOpen, setRegisterModalOpen] = useState<boolean>(false);
  const [registerForm, setRegisterForm] = useState({
    deviceId: '',
    deviceName: '',
    location: '',
    presharedSecret: 'dev-secret-key-123',
  });
  const [submittingRegister, setSubmittingRegister] = useState<boolean>(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Enrollment Modal
  const [enrollModalOpen, setEnrollModalOpen] = useState<boolean>(false);
  const [targetDevice, setTargetDevice] = useState<DeviceInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [submittingEnroll, setSubmittingEnroll] = useState<boolean>(false);
  const [enrollFeedback, setEnrollFeedback] = useState<string | null>(null);

  // Update clock every 5s for dynamic online/offline ticker
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Live devices snapshot
  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'devices'),
      (snapshot) => {
        const list: DeviceInfo[] = [];
        snapshot.forEach((doc) => {
          list.push({ ...doc.data(), deviceId: doc.id } as DeviceInfo);
        });
        setDevices(list);
        setLoading(false);
      },
      (error) => {
        console.warn('Devices snapshot error:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch unenrolled students for enrollment modal
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const snap = await getDocs(collection(db, 'students'));
        const list: Student[] = [];
        snap.forEach((d) => list.push({ ...d.data(), studentId: d.id } as Student));
        setStudents(list);
      } catch (err) {
        console.warn('Failed to load students:', err);
      }
    };
    fetchStudents();
  }, []);

  // Compute online status dynamically
  const enrichedDevices = useMemo(() => {
    return devices.map((dev) => {
      let isOnline = false;
      let lastHeartbeatMs: number | null = null;
      let secondsAgo: number | null = null;

      if (dev.lastHeartbeatAt) {
        if (dev.lastHeartbeatAt.seconds) {
          lastHeartbeatMs = dev.lastHeartbeatAt.seconds * 1000;
        } else if (typeof dev.lastHeartbeatAt === 'number') {
          lastHeartbeatMs = dev.lastHeartbeatAt < 10000000000 ? dev.lastHeartbeatAt * 1000 : dev.lastHeartbeatAt;
        } else {
          lastHeartbeatMs = new Date(dev.lastHeartbeatAt).getTime();
        }

        if (lastHeartbeatMs) {
          secondsAgo = Math.max(0, Math.round((now - lastHeartbeatMs) / 1000));
          isOnline = secondsAgo <= OFFLINE_THRESHOLD_SECONDS;
        }
      }

      return {
        ...dev,
        isOnline,
        secondsAgo,
      };
    });
  }, [devices, now]);

  // KPI Calculations
  const stats = useMemo(() => {
    const total = enrichedDevices.length;
    let online = 0;
    let offline = 0;
    let healthySensors = 0;

    for (const d of enrichedDevices) {
      if (d.isOnline) online++;
      else offline++;
      if ((d as any).sensorStatus === 'ok' || !(d as any).sensorStatus) healthySensors++;
    }

    return { total, online, offline, healthySensors };
  }, [enrichedDevices]);

  // Ping heartbeat action
  const handlePingHeartbeat = async (deviceId: string) => {
    try {
      const rssi = -55 - Math.floor(Math.random() * 15);
      const freeHeap = 178000 + Math.floor(Math.random() * 12000);

      const res = await fetch(`${FUNCTIONS_BASE}/deviceHeartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
          'x-event-id': `ping_${Date.now()}`,
          'x-timestamp': String(Math.floor(Date.now() / 1000)),
        },
        body: JSON.stringify({
          sensorStatus: 'ok',
          firmwareVersion: 'v1.2.0-esp32',
          wifiSignalRssi: rssi,
          freeHeap,
        }),
      });

      if (!res.ok) {
        throw new Error(`Heartbeat failed: HTTP ${res.status}`);
      }
    } catch (err: any) {
      alert(`Heartbeat ping failed: ${err.message}`);
    }
  };

  // Submit device registration
  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.deviceId.trim()) {
      setRegisterError('Device ID is required.');
      return;
    }

    setSubmittingRegister(true);
    setRegisterError(null);

    try {
      const deviceId = registerForm.deviceId.trim();
      await setDoc(doc(db, 'devices', deviceId), {
        deviceId,
        deviceName: registerForm.deviceName.trim() || deviceId,
        location: registerForm.location.trim() || 'Unspecified Location',
        presharedSecret: registerForm.presharedSecret.trim() || 'dev-secret-key-123',
        active: true,
        status: 'pending',
        enrolledCount: 0,
        firmwareVersion: 'v1.2.0-esp32',
        wifiSignalRssi: -60,
        freeHeap: 180000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setRegisterModalOpen(false);
      setRegisterForm({
        deviceId: '',
        deviceName: '',
        location: '',
        presharedSecret: 'dev-secret-key-123',
      });
    } catch (err: any) {
      setRegisterError(err.message || 'Failed to register hardware reader.');
    } finally {
      setSubmittingRegister(false);
    }
  };

  // Open Enrollment Modal
  const handleOpenEnrollment = (device: DeviceInfo) => {
    setTargetDevice(device);
    setSelectedStudentId('');
    setEnrollFeedback(null);
    setEnrollModalOpen(true);
  };

  // Submit Enrollment Request
  const handleSubmitEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDevice || !selectedStudentId) return;

    const student = students.find((s) => s.studentId === selectedStudentId);
    if (!student) return;

    setSubmittingEnroll(true);
    setEnrollFeedback(null);

    try {
      const enrollCall = httpsCallable(functions, 'requestEnrollmentCall');
      await enrollCall({
        studentId: student.studentId,
        studentName: student.fullName,
        rollNumber: student.rollNumber,
        classId: student.classId,
        deviceId: targetDevice.deviceId,
      });

      setEnrollFeedback(`Enrollment queued! Next heartbeat from ${targetDevice.deviceId} will initiate capture.`);
      setTimeout(() => {
        setEnrollModalOpen(false);
        setEnrollFeedback(null);
      }, 2500);
    } catch (err: any) {
      setEnrollFeedback(`Error: ${err.message}`);
    } finally {
      setSubmittingEnroll(false);
    }
  };

  const formatSignal = (rssi?: number) => {
    if (!rssi) return { text: 'N/A', color: 'var(--color-text-muted)' };
    if (rssi >= -60) return { text: `${rssi} dBm (Excellent)`, color: '#10B981' };
    if (rssi >= -70) return { text: `${rssi} dBm (Good)`, color: '#2563EB' };
    if (rssi >= -80) return { text: `${rssi} dBm (Fair)`, color: '#F59E0B' };
    return { text: `${rssi} dBm (Weak)`, color: '#EF4444' };
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2>Hardware Devices & Sensor Telemetry</h2>
          <p className={styles.subtitle}>
            Dynamic heartbeat monitoring, WiFi signal quality, free heap memory, and remote biometric enrollment commands.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button
            id="btn-register-device"
            variant="primary"
            size="sm"
            onClick={() => setRegisterModalOpen(true)}
          >
            <Plus size={16} />
            Register Device
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconTotal}`}>
            <Cpu size={22} />
          </div>
          <div>
            <div className={styles.kpiLabel}>Total Readers</div>
            <div className={styles.kpiValue}>{stats.total}</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconOnline}`}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className={styles.kpiLabel}>Online Active</div>
            <div className={styles.kpiValue}>{stats.online}</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconOffline}`}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className={styles.kpiLabel}>Offline (&gt;90s)</div>
            <div className={styles.kpiValue}>{stats.offline}</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconSensor}`}>
            <Activity size={22} />
          </div>
          <div>
            <div className={styles.kpiLabel}>Sensors Healthy</div>
            <div className={styles.kpiValue}>
              {stats.healthySensors} / {stats.total}
            </div>
          </div>
        </div>
      </div>

      {/* Device Cards Grid */}
      {enrichedDevices.length === 0 ? (
        <EmptyState
          title={loading ? 'Scanning for Hardware Devices...' : 'No Hardware Devices Registered'}
          description={
            loading
              ? 'Loading reader documents from Firestore...'
              : 'Click "Register Device" above to add an ESP32 fingerprint reader unit.'
          }
          icon={<Cpu size={28} />}
        />
      ) : (
        <div className={styles.deviceGrid}>
          {enrichedDevices.map((dev) => {
            const sig = formatSignal(dev.wifiSignalRssi);
            const heapKb = dev.freeHeap ? (dev.freeHeap / 1024).toFixed(0) : '180';
            const sensorStatus = (dev as any).sensorStatus || 'ok';

            return (
              <div key={dev.deviceId} className={styles.deviceCard}>
                <div className={styles.cardTop}>
                  <div>
                    <h3 className={styles.deviceName}>{dev.deviceName}</h3>
                    <span className={styles.deviceIdBadge}>
                      <Cpu size={12} /> {dev.deviceId}
                    </span>
                  </div>

                  <div>
                    {dev.isOnline ? (
                      <span className={styles.onlineBadge}>
                        <span className={styles.pulsingDot} /> Online
                      </span>
                    ) : (
                      <span className={styles.offlineBadge}>
                        <span className={styles.offlineDot} /> Offline
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.locationRow}>
                    <MapPin size={14} color="var(--color-text-muted)" />
                    <span>{dev.location || 'Location Not Set'}</span>
                  </div>

                  <div className={styles.telemetryGrid}>
                    <div className={styles.telemetryItem}>
                      <span className={styles.telemetryLabel}>
                        <Wifi size={12} /> WiFi Signal
                      </span>
                      <span className={styles.telemetryValue} style={{ color: sig.color }}>
                        {sig.text}
                      </span>
                    </div>

                    <div className={styles.telemetryItem}>
                      <span className={styles.telemetryLabel}>
                        <HardDrive size={12} /> Free Heap
                      </span>
                      <span className={styles.telemetryValue}>{heapKb} KB</span>
                    </div>

                    <div className={styles.telemetryItem}>
                      <span className={styles.telemetryLabel}>
                        <Activity size={12} /> Sensor Status
                      </span>
                      <span
                        className={styles.telemetryValue}
                        style={{ color: sensorStatus === 'ok' ? '#10B981' : '#EF4444' }}
                      >
                        {sensorStatus.toUpperCase()}
                      </span>
                    </div>

                    <div className={styles.telemetryItem}>
                      <span className={styles.telemetryLabel}>
                        <Fingerprint size={12} /> Enrolled
                      </span>
                      <span className={styles.telemetryValue}>{dev.enrolledCount ?? 0} templates</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    <span>Firmware: {dev.firmwareVersion || 'v1.2.0'}</span>
                    <span>State: {dev.active ? 'Active' : 'Disabled'}</span>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.heartbeatTicker}>
                    <Clock size={12} />
                    <span>
                      {dev.secondsAgo !== null
                        ? dev.secondsAgo < 10
                          ? 'Just now'
                          : `${dev.secondsAgo}s ago`
                        : 'No heartbeat yet'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handlePingHeartbeat(dev.deviceId)}
                      title="Simulate Hardware Heartbeat Ping"
                    >
                      <RefreshCw size={12} />
                      Ping
                    </button>

                    <button
                      className={styles.actionBtn}
                      onClick={() => handleOpenEnrollment(dev)}
                      title="Initiate Biometric Enrollment on this Device"
                    >
                      <Fingerprint size={12} />
                      Enroll
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Register Device Modal */}
      <Modal
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        title="Register Hardware Reader"
        maxWidth="480px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRegisterModalOpen(false)}
              disabled={submittingRegister}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRegisterDevice}
              disabled={submittingRegister}
            >
              {submittingRegister ? 'Registering...' : 'Register Device'}
            </Button>
          </div>
        }
      >
        <form className={styles.modalForm} onSubmit={handleRegisterDevice}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Hardware Device Identifier (Unique) *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="e.g. ESP32-READER-02"
              value={registerForm.deviceId}
              onChange={(e) => setRegisterForm({ ...registerForm, deviceId: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Human-Readable Name *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="e.g. Computer Science Lab 3 Gate"
              value={registerForm.deviceName}
              onChange={(e) => setRegisterForm({ ...registerForm, deviceName: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Physical Location</label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="e.g. Academic Block B, Floor 2"
              value={registerForm.location}
              onChange={(e) => setRegisterForm({ ...registerForm, location: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Pre-Shared Cryptographic Secret *</label>
            <input
              type="text"
              required
              className={styles.formInput}
              placeholder="Secret for HMAC-SHA256 signature verification"
              value={registerForm.presharedSecret}
              onChange={(e) => setRegisterForm({ ...registerForm, presharedSecret: e.target.value })}
            />
          </div>

          {registerError && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>
              {registerError}
            </div>
          )}
        </form>
      </Modal>

      {/* Trigger Biometric Enrollment Modal */}
      {targetDevice && (
        <Modal
          isOpen={enrollModalOpen}
          onClose={() => setEnrollModalOpen(false)}
          title={`Biometric Enrollment on ${targetDevice.deviceId}`}
          maxWidth="480px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEnrollModalOpen(false)}
                disabled={submittingEnroll}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitEnrollment}
                disabled={submittingEnroll || !selectedStudentId}
              >
                {submittingEnroll ? 'Queueing Command...' : 'Issue Capture Command'}
              </Button>
            </div>
          }
        >
          <form className={styles.modalForm} onSubmit={handleSubmitEnrollment}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
              Queue a fingerprint enrollment command for <strong>{targetDevice.deviceName}</strong>. When the device
              next pings the server via heartbeat, it will prompt the student to place their finger on the sensor prism.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Select Student to Enroll *</label>
              <select
                className={styles.formSelect}
                required
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
              >
                <option value="">Select a student...</option>
                {students.map((s) => (
                  <option key={s.studentId} value={s.studentId}>
                    {s.fullName} ({s.rollNumber}) {s.fingerprintRef ? `[Slot #${s.fingerprintRef}]` : '[Unenrolled]'}
                  </option>
                ))}
              </select>
            </div>

            {enrollFeedback && (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-medium)',
                  color: enrollFeedback.startsWith('Error') ? 'var(--color-error)' : 'var(--color-success)',
                }}
              >
                {enrollFeedback}
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
};
