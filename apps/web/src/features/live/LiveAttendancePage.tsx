import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Cpu,
  Fingerprint,
  RefreshCw,
  Zap,
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRtdbAttendance } from '@/lib/useRtdbAttendance';
import { DeviceEvent } from '@/types';
import { StatusBadge, Button, EmptyState } from '@/components';
import styles from './LiveAttendancePage.module.css';

const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_URL || 'http://127.0.0.1:5001/smart-attendance-dev/us-central1';

export const LiveAttendancePage: React.FC = () => {
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [newestEventId, setNewestEventId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  // Audio Context ref for chime
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playChime = (status?: string) => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const isError = status === 'Rejected' || status === 'Device Error';
      osc.type = isError ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(isError ? 220 : 880, ctx.currentTime);
      if (!isError) {
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);
      }

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Audio playback policy or context error ignored gracefully
    }
  };

  // Live Firestore Listener
  useEffect(() => {
    if (isPaused) return;

    setLoading(true);
    const eventsRef = collection(db, 'deviceEvents');
    const q = query(eventsRef, orderBy('receivedAt', 'desc'), limit(50));

    let isInitialLoad = true;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventList: DeviceEvent[] = [];
        snapshot.forEach((doc) => {
          eventList.push({ ...doc.data(), eventId: doc.id } as DeviceEvent);
        });

        if (!isInitialLoad && eventList.length > 0) {
          const latest = eventList[0];
          setNewestEventId(latest.eventId);
          playChime(latest.result);
        }

        setEvents(eventList);
        setLoading(false);
        isInitialLoad = false;
      },
      (error) => {
        console.warn('Live deviceEvents snapshot warning:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isPaused]);

  const {
    records: rtdbRecords,
    isConnected: isRtdbConnected,
    testConnection: testRtdbConnection,
  } = useRtdbAttendance();

  // Combine RTDB records with Firestore events
  const combinedEvents = useMemo(() => {
    const rtdbEvents: DeviceEvent[] = rtdbRecords.map((r) => ({
      eventId: r.recordId,
      deviceId: r.deviceId || 'ESP32-READER',
      eventType: 'scan' as const,
      fingerprintRef: r.fingerprintId,
      studentId: r.studentId,
      studentName: r.studentId || `Slot #${r.fingerprintId}`,
      rollNumber: r.studentId,
      result: (r.status as any) || 'Present',
      capturedAt: r.timestamp,
      receivedAt: r.timestamp,
      processingStatus: 'processed' as const,
    }));

    const existingIds = new Set(rtdbEvents.map((e) => e.eventId));
    const uniqueFirestore = events.filter((e) => !existingIds.has(e.eventId));
    return [...rtdbEvents, ...uniqueFirestore];
  }, [rtdbRecords, events]);

  // KPI Calculations
  const stats = useMemo(() => {
    let total = combinedEvents.length;
    let present = 0;
    let late = 0;
    let rejected = 0;

    for (const ev of combinedEvents) {
      if (ev.result === 'Present') present++;
      else if (ev.result === 'Late') late++;
      else rejected++;
    }

    return { total, present, late, rejected };
  }, [combinedEvents]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return combinedEvents.filter((ev) => {
      // Filter tab
      if (selectedFilter !== 'all') {
        const res = ev.result.toLowerCase();
        if (selectedFilter === 'present' && res !== 'present') return false;
        if (selectedFilter === 'late' && res !== 'late') return false;
        if (selectedFilter === 'rejected' && res !== 'rejected' && res !== 'no active lecture') return false;
        if (selectedFilter === 'duplicate' && res !== 'duplicate') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = (ev.studentName || '').toLowerCase();
        const roll = (ev.rollNumber || '').toLowerCase();
        const subject = (ev.subjectName || '').toLowerCase();
        const device = (ev.deviceId || '').toLowerCase();
        const result = (ev.result || '').toLowerCase();

        return (
          name.includes(query) ||
          roll.includes(query) ||
          subject.includes(query) ||
          device.includes(query) ||
          result.includes(query)
        );
      }

      return true;
    });
  }, [combinedEvents, selectedFilter, searchQuery]);

  // Quick simulator action trigger
  const runSimulatorAction = async (payload: any, label: string) => {
    setSimulating(true);
    setSimFeedback(`Dispatching: ${label}...`);
    try {
      const isHeartbeat = payload.isHeartbeat;
      const url = `${FUNCTIONS_BASE}/${isHeartbeat ? 'deviceHeartbeat' : 'processScan'}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': 'ESP32-READER-01',
          'x-event-id': `sim_${Date.now()}`,
          'x-timestamp': String(Math.floor(Date.now() / 1000)),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSimFeedback(`✅ ${label}: Evaluated as "${data.result || data.status}"`);
      } else {
        setSimFeedback(`❌ ${label} Error: ${data.error || data.message || 'Failed'}`);
      }
    } catch (err: any) {
      setSimFeedback(`💥 Network Error: ${err.message}`);
    } finally {
      setSimulating(false);
      setTimeout(() => setSimFeedback(null), 5000);
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return { exact: 'Just now', relative: '' };
    let dateObj: Date;
    if (ts.seconds) {
      dateObj = new Date(ts.seconds * 1000);
    } else if (typeof ts === 'number') {
      dateObj = new Date(ts < 10000000000 ? ts * 1000 : ts);
    } else {
      dateObj = new Date(ts);
    }

    if (isNaN(dateObj.getTime())) return { exact: 'Just now', relative: '' };

    const hours = String(dateObj.getHours()).padStart(2, '0');
    const mins = String(dateObj.getMinutes()).padStart(2, '0');
    const secs = String(dateObj.getSeconds()).padStart(2, '0');
    const exact = `${hours}:${mins}:${secs}`;

    const diffSeconds = Math.round((Date.now() - dateObj.getTime()) / 1000);
    let relative = 'Just now';
    if (diffSeconds > 60) {
      relative = `${Math.floor(diffSeconds / 60)}m ago`;
    } else if (diffSeconds > 5) {
      relative = `${diffSeconds}s ago`;
    }

    return { exact, relative };
  };

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2>
            Live Attendance Stream
            {isPaused ? (
              <span className={styles.pausedIndicator}>
                <span className={styles.pausedDot} /> Paused
              </span>
            ) : (
              <span className={styles.liveIndicator}>
                <span className={styles.pulsingDot} /> Live Feed Active
              </span>
            )}
          </h2>
          <p className={styles.subtitle}>
            Real-time biometric scan events streaming from hardware readers with authoritative schedule verification.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button
            id="btn-test-rtdb-live"
            variant="secondary"
            size="sm"
            onClick={async () => {
              const res = await testRtdbConnection();
              setSimFeedback(res.message);
              setTimeout(() => setSimFeedback(null), 6000);
            }}
            title="Safe, non-destructive connection test to smartattendanceiot-43fa2 Realtime Database"
          >
            <Cpu size={14} />
            {isRtdbConnected ? 'RTDB: Online' : 'Test RTDB'}
          </Button>

          <Button
            id="btn-toggle-sound"
            variant="ghost"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute Chime Notifications' : 'Enable Chime Notifications'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {soundEnabled ? 'Sound On' : 'Muted'}
          </Button>

          <Button
            id="btn-toggle-pause"
            variant={isPaused ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            {isPaused ? 'Resume Stream' : 'Pause Stream'}
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiTotal}`}>
            <Activity size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Scans</span>
            <span className={styles.kpiValue}>{stats.total}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiPresent}`}>
            <CheckCircle2 size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Marked Present</span>
            <span className={styles.kpiValue}>{stats.present}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiLate}`}>
            <Clock size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Marked Late</span>
            <span className={styles.kpiValue}>{stats.late}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIconWrapper} ${styles.kpiRejected}`}>
            <XCircle size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Exceptions / Rejections</span>
            <span className={styles.kpiValue}>{stats.rejected}</span>
          </div>
        </div>
      </div>

      {/* Hardware Simulator Quick Action Bar */}
      <div className={styles.simulatorBox}>
        <div className={styles.simulatorHeader}>
          <div>
            <div className={styles.simulatorTitle}>
              <Zap size={16} color="#2563EB" />
              Hardware Simulator Quick Launch
            </div>
            <p className={styles.simulatorSubtitle}>
              Dispatch simulated biometric scans and heartbeat pings directly to the Cloud Functions ingestion engine.
            </p>
          </div>
          {simFeedback && (
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary)' }}>
              {simFeedback}
            </span>
          )}
        </div>

        <div className={styles.simulatorButtons}>
          <button
            id="sim-scan-aarav"
            className={styles.simBtn}
            disabled={simulating}
            onClick={() =>
              runSimulatorAction(
                { fingerprintRef: 1, testTimeOverride: '09:05', testDayOfWeekOverride: 1 },
                'Aarav Sharma (Slot #1 - On Time)'
              )
            }
          >
            <Fingerprint size={14} color="#10B981" />
            Scan Aarav (On Time)
          </button>

          <button
            id="sim-scan-ananya"
            className={styles.simBtn}
            disabled={simulating}
            onClick={() =>
              runSimulatorAction(
                { fingerprintRef: 2, testTimeOverride: '09:20', testDayOfWeekOverride: 1 },
                'Ananya Patel (Slot #2 - Late)'
              )
            }
          >
            <Clock size={14} color="#F59E0B" />
            Scan Ananya (Late)
          </button>

          <button
            id="sim-scan-duplicate"
            className={styles.simBtn}
            disabled={simulating}
            onClick={() =>
              runSimulatorAction(
                { fingerprintRef: 1, testTimeOverride: '09:06', testDayOfWeekOverride: 1 },
                'Duplicate Scan Test (Slot #1)'
              )
            }
          >
            <RefreshCw size={14} color="#6366F1" />
            Simulate Rapid Duplicate
          </button>

          <button
            id="sim-scan-unknown"
            className={styles.simBtn}
            disabled={simulating}
            onClick={() =>
              runSimulatorAction(
                { fingerprintRef: 99, testTimeOverride: '09:05', testDayOfWeekOverride: 1 },
                'Unenrolled Fingerprint (Slot #99)'
              )
            }
          >
            <XCircle size={14} color="#EF4444" />
            Unregistered Slot (#99)
          </button>

          <button
            id="sim-heartbeat"
            className={styles.simBtn}
            disabled={simulating}
            onClick={() =>
              runSimulatorAction(
                { isHeartbeat: true, sensorStatus: 'ok', firmwareVersion: 'v1.2.0-esp32', wifiSignalRssi: -58, freeHeap: 182400 },
                'ESP32 Heartbeat Ping'
              )
            }
          >
            <Cpu size={14} color="#0284C7" />
            Device Heartbeat Ping
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.searchBox}>
          <Search size={16} color="var(--color-text-secondary)" />
          <input
            id="input-search-feed"
            type="text"
            className={styles.searchInput}
            placeholder="Search by student, roll number, or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.filterChips}>
          <button
            id="filter-all"
            className={`${styles.filterChip} ${selectedFilter === 'all' ? styles.activeChip : ''}`}
            onClick={() => setSelectedFilter('all')}
          >
            All Events ({events.length})
          </button>
          <button
            id="filter-present"
            className={`${styles.filterChip} ${selectedFilter === 'present' ? styles.activeChip : ''}`}
            onClick={() => setSelectedFilter('present')}
          >
            Present ({stats.present})
          </button>
          <button
            id="filter-late"
            className={`${styles.filterChip} ${selectedFilter === 'late' ? styles.activeChip : ''}`}
            onClick={() => setSelectedFilter('late')}
          >
            Late ({stats.late})
          </button>
          <button
            id="filter-rejected"
            className={`${styles.filterChip} ${selectedFilter === 'rejected' ? styles.activeChip : ''}`}
            onClick={() => setSelectedFilter('rejected')}
          >
            Exceptions ({stats.rejected})
          </button>
        </div>
      </div>

      {/* Real-Time Events Feed Table */}
      <div className={styles.tableContainer}>
        {filteredEvents.length === 0 ? (
          <EmptyState
            title={loading ? 'Connecting to live telemetry feed...' : 'No Scan Events Yet'}
            description={
              loading
                ? 'Connecting to live attendance feeds...'
                : isRtdbConnected
                ? 'Connected to Firebase Realtime Database (smartattendanceiot-43fa2) at /attendance. Waiting for biometric scan from ESP32 hardware...'
                : 'Click "Test RTDB" above or trigger a simulated scan to stream events.'
            }
            icon={<Activity size={28} />}
          />
        ) : (
          <table className={styles.feedTable}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Subject & Session</th>
                <th>Device ID</th>
                <th>Ingestion Result</th>
                <th>Captured At</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev) => {
                const isNew = ev.eventId === newestEventId;
                const { exact, relative } = formatTimestamp(ev.receivedAt || ev.capturedAt);
                const initials = ev.studentName
                  ? ev.studentName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                  : '??';

                return (
                  <tr
                    key={ev.eventId}
                    className={`${styles.tableRow} ${isNew ? styles.newRowHighlight : ''}`}
                  >
                    <td>
                      <div className={styles.studentCell}>
                        <div className={styles.avatar}>{initials}</div>
                        <div className={styles.studentMeta}>
                          <span className={styles.studentName}>
                            {ev.studentName || `Slot #${ev.fingerprintRef ?? 'Unknown'}`}
                          </span>
                          <span className={styles.studentRoll}>
                            {ev.rollNumber || (ev.fingerprintRef ? `Hardware Slot #${ev.fingerprintRef}` : 'Unenrolled')}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className={styles.lectureCell}>
                        <span className={styles.subjectName}>{ev.subjectName || 'Schedule Slot'}</span>
                        <span className={styles.roomInfo}>
                          {ev.sessionId ? `Session: ${ev.sessionId}` : 'Device Direct'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className={styles.deviceBadge}>
                        <Cpu size={12} />
                        {ev.deviceId || 'ESP32-READER-01'}
                      </span>
                    </td>

                    <td>
                      <div>
                        <StatusBadge status={ev.result} />
                        {ev.rejectionReason && (
                          <div className={styles.reasonNote}>{ev.rejectionReason}</div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className={styles.timeCell}>
                        <span className={styles.timeExact}>{exact}</span>
                        {relative && <span className={styles.timeRelative}>{relative}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
