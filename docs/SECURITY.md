# Security & Privacy Model

## 1. Biometric Data Protection

Biometric data represents sensitive personal identifiable information (PII). This system adheres to strict data minimization principles:

- **Local Fingerprint Template Storage**: Optical/capacitive sensors (e.g. R307, AS608, FPM10A) perform matching and template generation directly on their internal flash memory.
- **Reference-Only Architecture**: Cloud Firestore and Cloud Functions handle only an integer slot identifier (`fingerprintRef`).
- **No Biometric Cloud Transmission**: Neither raw bitmap images nor processed mathematical minutiae are transmitted over the network or stored in Firebase databases.
- **Student Unenrollment & Deletion**: When a student is deleted or unenrolled, a device command clears the slot from the physical sensor, and the `fingerprintRef` is revoked.

---

## 2. Authorization & Role-Based Access Control (RBAC)

The system enforces custom claims assigned via Firebase Admin SDK:

- **`superAdmin`**:
  - Provision new administrator accounts.
  - Modify institutional settings and retention policies.
  - Access global audit logs.
- **`admin`**:
  - Manage classes, subjects, and student rosters.
  - Issue fingerprint enrollment triggers.
  - Configure timetable entries.
  - Perform manual attendance corrections (requiring mandatory justification).
  - Export attendance reports.

**Public Signups are Prohibited**: Firebase Authentication public registrations are disabled. Only existing administrators with `superAdmin` role can create accounts.

---

## 3. Device Cryptographic Identity

- Each hardware unit has a unique `deviceId` and pre-shared secret key.
- Device secrets are never stored in plaintext on the server; Firestore retains a SHA-256 cryptographic hash for validation.
- All communications occur over TLS (HTTPS).
- Every payload is signed with HMAC-SHA256 covering device ID, timestamp, unique event ID, and payload body.
- Packets with timestamp drift exceeding ±120 seconds or duplicate `eventId`s are rejected immediately.
