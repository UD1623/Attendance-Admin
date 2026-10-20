import * as admin from 'firebase-admin';

// Check if running against emulators
const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST || true;
if (isEmulator && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'smart-attendance-dev',
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function bootstrapAdmin() {
  const email = process.env.ADMIN_INITIAL_EMAIL || 'admin@attendance.local';
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'AdminPass123!';
  const displayName = 'Super Administrator';

  console.log(`[Seed] Bootstrapping SuperAdmin: ${email}`);

  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`[Seed] Existing user found: ${userRecord.uid}`);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({
        email,
        password,
        displayName,
        emailVerified: true,
      });
      console.log(`[Seed] Created new user: ${userRecord.uid}`);
    } else {
      throw error;
    }
  }

  // Set custom claims
  await auth.setCustomUserClaims(userRecord.uid, {
    admin: true,
    superAdmin: true,
  });
  console.log(`[Seed] Set custom claims: { admin: true, superAdmin: true }`);

  // Create admin profile in Firestore
  await db.collection('admins').doc(userRecord.uid).set(
    {
      role: 'superAdmin',
      displayName,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`[Seed] Created admins/${userRecord.uid} document.`);

  // Create default institutional settings
  await db.collection('settings').doc('institution').set(
    {
      name: 'Faculty of Engineering & Technology',
      department: 'Department of Computer Science & Engineering',
      timezone: 'Asia/Kolkata',
      academicYear: '2024-2025',
      lateToleranceMinutes: 10,
      attendanceOpensBeforeMinutes: 5,
      driftToleranceSeconds: 120,
      heartbeatIntervalSeconds: 30,
      deviceOfflineThresholdSeconds: 90,
      lowAttendanceThreshold: 75,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: userRecord.uid,
    },
    { merge: true }
  );
  console.log(`[Seed] Initialized institutional settings at settings/institution.`);

  // Seed sample classes
  const classes = [
    {
      id: 'class_ce_5a',
      name: 'Computer Engineering - Semester 5 - Div A',
      code: 'CE-5A',
      department: 'Computer Science & Engineering',
      semester: 5,
      academicYear: '2024-2025',
      active: true,
    },
    {
      id: 'class_ce_5b',
      name: 'Computer Engineering - Semester 5 - Div B',
      code: 'CE-5B',
      department: 'Computer Science & Engineering',
      semester: 5,
      academicYear: '2024-2025',
      active: true,
    },
  ];

  for (const c of classes) {
    await db.collection('classes').doc(c.id).set(
      {
        classId: c.id,
        name: c.name,
        code: c.code,
        department: c.department,
        semester: c.semester,
        academicYear: c.academicYear,
        active: c.active,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  console.log(`[Seed] Initialized ${classes.length} sample classes.`);

  // Seed sample subjects
  const subjects = [
    {
      id: 'sub_os',
      name: 'Operating Systems',
      code: 'CS501',
      department: 'Computer Science & Engineering',
      active: true,
    },
    {
      id: 'sub_cn',
      name: 'Computer Networks',
      code: 'CS502',
      department: 'Computer Science & Engineering',
      active: true,
    },
    {
      id: 'sub_dbms',
      name: 'Database Management Systems',
      code: 'CS503',
      department: 'Computer Science & Engineering',
      active: true,
    },
    {
      id: 'sub_se',
      name: 'Software Engineering',
      code: 'CS504',
      department: 'Computer Science & Engineering',
      active: true,
    },
  ];

  for (const s of subjects) {
    await db.collection('subjects').doc(s.id).set(
      {
        subjectId: s.id,
        name: s.name,
        code: s.code,
        department: s.department,
        active: s.active,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  console.log(`[Seed] Initialized ${subjects.length} sample subjects.`);

  // Seed sample students
  const sampleStudents = [
    {
      id: 'std_101',
      fullName: 'Aarav Sharma',
      rollNumber: 'CS-2024-001',
      classId: 'class_ce_5a',
      className: 'Computer Engineering - Semester 5 - Div A',
      fingerprintRef: 1,
      active: true,
    },
    {
      id: 'std_102',
      fullName: 'Ananya Patel',
      rollNumber: 'CS-2024-002',
      classId: 'class_ce_5a',
      className: 'Computer Engineering - Semester 5 - Div A',
      fingerprintRef: 2,
      active: true,
    },
    {
      id: 'std_103',
      fullName: 'Rohan Gupta',
      rollNumber: 'CS-2024-003',
      classId: 'class_ce_5a',
      className: 'Computer Engineering - Semester 5 - Div A',
      fingerprintRef: null,
      active: true,
    },
    {
      id: 'std_104',
      fullName: 'Sneha Verma',
      rollNumber: 'CS-2024-004',
      classId: 'class_ce_5b',
      className: 'Computer Engineering - Semester 5 - Div B',
      fingerprintRef: 3,
      active: true,
    },
    {
      id: 'std_105',
      fullName: 'Vikram Joshi',
      rollNumber: 'CS-2024-005',
      classId: 'class_ce_5b',
      className: 'Computer Engineering - Semester 5 - Div B',
      fingerprintRef: null,
      active: true,
    },
  ];

  for (const s of sampleStudents) {
    await db.collection('students').doc(s.id).set(
      {
        studentId: s.id,
        fullName: s.fullName,
        rollNumber: s.rollNumber,
        classId: s.classId,
        className: s.className,
        fingerprintRef: s.fingerprintRef,
        active: s.active,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  console.log(`[Seed] Initialized ${sampleStudents.length} sample students.`);

  // Seed primary hardware device
  await db.collection('devices').doc('ESP32-READER-01').set(
    {
      deviceId: 'ESP32-READER-01',
      deviceName: 'Main Entrance Hall Gate A',
      secretHash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', // sha256('dev-secret-key-123')
      presharedSecret: 'dev-secret-key-123',
      active: true,
      status: 'online',
      enrolledCount: 3,
      firmwareVersion: 'v1.2.0',
      wifiSignalRssi: -58,
      freeHeap: 184500,
      lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`[Seed] Initialized device ESP32-READER-01.`);

  // Seed sample timetable entries (Monday to Saturday)
  const timetableEntries = [
    {
      id: 'tt_mon_os_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_os',
      dayOfWeek: 1, // Monday
      sessionType: 'lecture',
      startTime: '09:00',
      endTime: '10:00',
      attendanceOpensAt: '08:55',
      lateCutoff: '09:10',
      finalDeadline: '10:00',
      room: 'LH-101',
      faculty: 'Prof. Alan Turing',
      active: true,
    },
    {
      id: 'tt_mon_cn_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_cn',
      dayOfWeek: 1, // Monday
      sessionType: 'lecture',
      startTime: '10:15',
      endTime: '11:15',
      attendanceOpensAt: '10:10',
      lateCutoff: '10:25',
      finalDeadline: '11:15',
      room: 'LH-101',
      faculty: 'Dr. Vint Cerf',
      active: true,
    },
    {
      id: 'tt_tue_dbms_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_dbms',
      dayOfWeek: 2, // Tuesday
      sessionType: 'lecture',
      startTime: '09:00',
      endTime: '10:00',
      attendanceOpensAt: '08:55',
      lateCutoff: '09:10',
      finalDeadline: '10:00',
      room: 'LH-102',
      faculty: 'Dr. Edgar Codd',
      active: true,
    },
    {
      id: 'tt_wed_se_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_se',
      dayOfWeek: 3, // Wednesday
      sessionType: 'lecture',
      startTime: '11:30',
      endTime: '12:30',
      attendanceOpensAt: '11:25',
      lateCutoff: '11:40',
      finalDeadline: '12:30',
      room: 'LH-101',
      faculty: 'Prof. Grace Hopper',
      active: true,
    },
    {
      id: 'tt_thu_os_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_os',
      dayOfWeek: 4, // Thursday
      sessionType: 'lecture',
      startTime: '09:00',
      endTime: '10:00',
      attendanceOpensAt: '08:55',
      lateCutoff: '09:10',
      finalDeadline: '10:00',
      room: 'LH-101',
      faculty: 'Prof. Alan Turing',
      active: true,
    },
    {
      id: 'tt_fri_cn_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_cn',
      dayOfWeek: 5, // Friday
      sessionType: 'lecture',
      startTime: '14:00',
      endTime: '15:00',
      attendanceOpensAt: '13:55',
      lateCutoff: '14:10',
      finalDeadline: '15:00',
      room: 'Lab-3',
      faculty: 'Dr. Vint Cerf',
      active: true,
    },
    {
      id: 'tt_sat_dbms_5a',
      classId: 'class_ce_5a',
      subjectId: 'sub_dbms',
      dayOfWeek: 6, // Saturday
      sessionType: 'lecture',
      startTime: '10:00',
      endTime: '11:00',
      attendanceOpensAt: '09:55',
      lateCutoff: '10:10',
      finalDeadline: '11:00',
      room: 'LH-102',
      faculty: 'Dr. Edgar Codd',
      active: true,
    },
  ];

  for (const tt of timetableEntries) {
    await db.collection('timetable').doc(tt.id).set(
      {
        ...tt,
        timetableId: tt.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  console.log(`[Seed] Initialized ${timetableEntries.length} timetable entries.`);

  // Write audit log entry
  await db.collection('auditLogs').add({
    action: 'SYSTEM_BOOTSTRAPPED',
    actorUid: userRecord.uid,
    actorEmail: email,
    targetType: 'system',
    targetId: 'bootstrap',
    details: {
      seededClasses: classes.length,
      seededSubjects: subjects.length,
      seededStudents: sampleStudents.length,
      seededTimetable: timetableEntries.length,
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('[Seed] System bootstrap audit log recorded.');
}

bootstrapAdmin()
  .then(() => {
    console.log('[Seed] Complete bootstrap executed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Seed] Bootstrap failed:', err);
    process.exit(1);
  });
