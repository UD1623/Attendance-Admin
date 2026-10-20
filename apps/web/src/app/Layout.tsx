import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  UserPlus,
  CalendarDays,
  Activity,
  ClipboardList,
  FileBarChart,
  Cpu,
  Settings,
  LogOut,
  Fingerprint,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useRtdbAttendance } from '@/lib/useRtdbAttendance';
import styles from './Layout.module.css';

interface NavItemDef {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItemDef[] = [
  { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
  { label: 'Register Student', path: '/students', icon: <UserPlus size={20} /> },
  { label: 'Timetable', path: '/timetable', icon: <CalendarDays size={20} /> },
  { label: 'Live Attendance', path: '/live', icon: <Activity size={20} /> },
  { label: 'Attendance Records', path: '/records', icon: <ClipboardList size={20} /> },
  { label: 'Reports', path: '/reports', icon: <FileBarChart size={20} /> },
  { label: 'Device Status', path: '/devices', icon: <Cpu size={20} /> },
  { label: 'Settings', path: '/settings', icon: <Settings size={20} /> },
];

export const Layout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, role, signOut } = useAuth();
  const location = useLocation();

  const currentNav = navItems.find((item) => location.pathname.startsWith(item.path));
  const pageTitle = currentNav ? currentNav.label : 'Dashboard';
  const { isConnected, testConnection } = useRtdbAttendance();
  const [testingRtdb, setTestingRtdb] = useState(false);

  const handleTestRtdb = async () => {
    setTestingRtdb(true);
    const res = await testConnection();
    setTestingRtdb(false);
    alert(res.message);
  };

  return (
    <div className={styles.container}>
      {/* Sidebar Navigation */}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
        aria-label="Sidebar navigation"
      >
        <div className={styles.brand}>
          <div className={styles.brandTitle}>
            <span className={styles.brandIcon} aria-hidden="true">
              <Fingerprint size={24} />
            </span>
            {!collapsed && <span>Attendance Admin</span>}
          </div>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {!collapsed && user && (
            <div className={styles.userCard}>
              <div className={styles.userName}>{user.email}</div>
              <div className={styles.userRole}>
                {role === 'superAdmin' ? 'Super Administrator' : 'Administrator'}
              </div>
            </div>
          )}
          <button
            type="button"
            className={styles.logoutButton}
            onClick={signOut}
            title={collapsed ? 'Log out' : undefined}
          >
            <span aria-hidden="true">
              <LogOut size={18} />
            </span>
            {!collapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainWrapper}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>{pageTitle}</h1>
          <div className={styles.headerMeta}>
            <button
              id="btn-test-rtdb-header"
              type="button"
              className={`${styles.badgeRtdb} ${isConnected ? styles.rtdbOnline : styles.rtdbOffline}`}
              onClick={handleTestRtdb}
              title="Click to test Realtime Database connection"
            >
              <span className={`${styles.rtdbDot} ${isConnected ? styles.rtdbDotOnline : styles.rtdbDotOffline}`} />
              <span>{testingRtdb ? 'Testing RTDB...' : isConnected ? 'RTDB: Online' : 'RTDB: Connecting...'}</span>
            </button>

            <div className={styles.badgeLive}>
              <span className={styles.liveDot} />
              <span>System Active</span>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
