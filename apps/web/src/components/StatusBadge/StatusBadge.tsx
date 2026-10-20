import React from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  AlertTriangle,
  UserX,
  ShieldCheck,
  WifiOff,
  HelpCircle,
} from 'lucide-react';
import styles from './StatusBadge.module.css';

export type StatusType =
  | 'Present'
  | 'Late'
  | 'Rejected'
  | 'Duplicate'
  | 'No Active Lecture'
  | 'Device Error'
  | 'Absent'
  | 'Excused'
  | 'Online'
  | 'Offline'
  | 'Sensor Unavailable'
  | 'Connection Degraded'
  | 'Awaiting First Heartbeat'
  | 'Pending'
  | 'In Progress'
  | 'Success'
  | 'Failed';

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className }) => {
  const normalized = status.toLowerCase();

  const getStyleClass = () => {
    switch (normalized) {
      case 'present':
      case 'accepted':
      case 'online':
      case 'success':
        return styles.present;
      case 'late':
      case 'connection degraded':
      case 'degraded':
        return styles.late;
      case 'rejected':
      case 'failed':
      case 'device error':
      case 'sensor unavailable':
      case 'offline':
        return styles.rejected;
      case 'duplicate':
      case 'no active lecture':
      case 'absent':
      case 'awaiting first heartbeat':
      case 'pending':
      case 'in progress':
        return styles.duplicate;
      case 'excused':
        return styles.excused;
      default:
        return styles.neutral;
    }
  };

  const getIcon = () => {
    switch (normalized) {
      case 'present':
      case 'accepted':
      case 'online':
      case 'success':
        return <CheckCircle2 size={13} aria-hidden="true" />;
      case 'late':
      case 'connection degraded':
      case 'degraded':
        return <Clock size={13} aria-hidden="true" />;
      case 'rejected':
        return <XCircle size={13} aria-hidden="true" />;
      case 'duplicate':
        return <Copy size={13} aria-hidden="true" />;
      case 'device error':
      case 'sensor unavailable':
      case 'failed':
        return <AlertTriangle size={13} aria-hidden="true" />;
      case 'absent':
        return <UserX size={13} aria-hidden="true" />;
      case 'excused':
        return <ShieldCheck size={13} aria-hidden="true" />;
      case 'offline':
        return <WifiOff size={13} aria-hidden="true" />;
      default:
        return <HelpCircle size={13} aria-hidden="true" />;
    }
  };

  return (
    <span className={`${styles.badge} ${getStyleClass()} ${className || ''}`}>
      <span className={styles.icon}>{getIcon()}</span>
      <span>{label || status}</span>
    </span>
  );
};
