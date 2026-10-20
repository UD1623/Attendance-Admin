import * as admin from 'firebase-admin';
import { InstitutionSettings } from '../shared/types';
import { writeAuditLog } from './auditService';
import { ActorInfo } from './studentService';

export interface CreateAdminUserInput {
  email: string;
  password: string;
  displayName: string;
  role: 'admin' | 'superAdmin';
}

export async function createAdminUser(
  auth: admin.auth.Auth,
  db: admin.firestore.Firestore,
  input: CreateAdminUserInput,
  actor: ActorInfo
): Promise<{ uid: string; email: string; role: string }> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password;
  const displayName = input.displayName?.trim();
  const role = input.role === 'superAdmin' ? 'superAdmin' : 'admin';

  if (!email || !email.includes('@')) {
    throw new Error('Valid email address is required.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  if (!displayName) {
    throw new Error('Display name is required.');
  }

  const userRecord = await auth.createUser({
    email,
    password,
    displayName,
    emailVerified: true,
  });

  const claims = {
    admin: true,
    superAdmin: role === 'superAdmin',
  };

  await auth.setCustomUserClaims(userRecord.uid, claims);

  await db.collection('admins').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    displayName,
    role,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog(db, {
    action: 'ADMIN_PROVISIONED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'admin',
    targetId: userRecord.uid,
    details: {
      email,
      role,
      displayName,
    },
  });

  return {
    uid: userRecord.uid,
    email,
    role,
  };
}

export async function updateInstitutionSettings(
  db: admin.firestore.Firestore,
  settings: Partial<InstitutionSettings>,
  actor: ActorInfo
): Promise<void> {
  const settingsRef = db.collection('settings').doc('institution');

  await settingsRef.set(
    {
      ...settings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    },
    { merge: true }
  );

  await writeAuditLog(db, {
    action: 'SETTINGS_UPDATED',
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetType: 'settings',
    targetId: 'institution',
    details: settings,
  });
}
