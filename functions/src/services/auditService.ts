import * as admin from 'firebase-admin';

export interface AuditParams {
  action: string;
  actorUid: string;
  actorEmail: string;
  targetType: string;
  targetId: string;
  details?: Record<string, any>;
}

export async function writeAuditLog(
  db: admin.firestore.Firestore,
  params: AuditParams
): Promise<string> {
  const logRef = db.collection('auditLogs').doc();
  await logRef.set({
    logId: logRef.id,
    action: params.action,
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details || {},
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  return logRef.id;
}
