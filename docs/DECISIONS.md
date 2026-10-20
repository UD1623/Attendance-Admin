# Architecture Decisions Record (ADR)

## DEC-001: Sensor Model & Biometric Privacy
- **Decision**: Generic UART sensor (R307/AS608 class) with template storage retained on hardware.
- **Rationale**: Storing raw fingerprint images or minutiae templates in cloud databases violates biometric privacy regulations and introduces severe liability. The system only stores a numeric `fingerprintRef` (slot index 1..1000) mapped to a student record.
- **Status**: Accepted.

## DEC-002: Ingestion Protocol & Device Authentication
- **Decision**: Direct HTTPS POST to Cloud Functions ingestion endpoint (`/processScan`), authenticated via per-device preshared secret and HMAC-SHA256 signature over payload + timestamp + eventId.
- **Rationale**: Microcontrollers such as ESP32 handle HTTPS and HMAC natively without needing complex MQTT brokers or external gateway software.
- **Status**: Accepted.

## DEC-003: Trusted Time Authority & Clock Drift
- **Decision**: Server receipt time is the authoritative source. Device-provided timestamps are accepted only within a ±120 second drift tolerance.
- **Rationale**: Embedded microcontrollers can experience RTC drift or lose sync on reboot. Rejecting packets with excessive drift prevents replay attacks, while evaluating against server time guarantees consistent schedule alignment.
- **Status**: Accepted.

## DEC-004: Attendance Late & Rejection Policy
- **Decision**: Configured per timetable entry with institutional defaults:
  - `attendanceOpensAt`: 5 minutes before scheduled start. Scans prior are rejected as "Too Early".
  - `lateCutoff`: 10 minutes after scheduled start. Scans before this are marked `Present`.
  - `finalDeadline`: Scheduled end of lecture. Scans between `lateCutoff` and `finalDeadline` are marked `Late`.
  - Scans after `finalDeadline` are rejected as "Session Closed".
- **Status**: Accepted.

## DEC-005: Idempotency & Concurrency Protection
- **Decision**: Deterministic document keys in Firestore (`${studentId}_${sessionId}`). Scan processing executes in a Firestore transaction that checks for existing documents before writing.
- **Rationale**: Physical fingers frequently tap sensors multiple times in rapid succession, or network retries may resend packets. Deterministic IDs guarantee exactly one attendance doc is created per student per session.
- **Status**: Accepted.

## DEC-006: Absence Derivation
- **Decision**: Absences are never written to `attendance` on scan events. "Absent" is mathematically derived during reports generation from `eligible roster × scheduled sessions - holidays - excused absences - present - late`.
- **Rationale**: Storing absence documents when someone *doesn't* show up leads to massive unnecessary database writes and complications if a student arrives late.
- **Status**: Accepted.

## DEC-007: Export Architecture
- **Decision**: Server-side document rendering in Cloud Functions from a unified normalized dataset builder.
- **Rationale**: Excel, PDF, and Word exports must reconcile 100% identically in student counts, percentages, and totals.
- **Status**: Accepted.

## DEC-008: Role-Based Authorization
- **Decision**: Firebase Auth custom claims: `admin` and `superAdmin`.
- **Rationale**: Prevents client tampering. The first admin is provisioned via an offline seed script; subsequent admins are created exclusively through a SuperAdmin callable function.
- **Status**: Accepted.
