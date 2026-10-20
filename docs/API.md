# Device Ingestion API Contract

This document defines the interface between hardware devices (ESP32) and the Cloud Functions backend.

## 1. Authentication & Signature Scheme

Every request sent by a device must include the following HTTP headers:

| Header | Description | Example |
|---|---|---|
| `X-Device-Id` | Unique hardware identifier | `ESP32-LAB-01` |
| `X-Event-Id` | Unique UUIDv4 generated per event | `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d` |
| `X-Timestamp` | Unix timestamp in seconds or ISO8601 | `1729382400` |
| `X-Signature` | HMAC-SHA256 signature in hexadecimal | `a35f7...` |

### Signature Generation
The signature is computed over:
```
signaturePayload = `${deviceId}:${eventId}:${timestamp}:${rawRequestBody}`
signature = HMAC-SHA256(deviceSecret, signaturePayload).hex()
```

The server compares this against the hash of the secret stored in `devices/{deviceId}`.

---

## 2. Endpoints

### 2.1 Process Scan
- **Method**: `POST`
- **Path**: `/processScan` (or `/api/scan`)
- **Headers**: Required authentication headers
- **Request Body (JSON)**:
```json
{
  "fingerprintRef": 42,
  "sensorStatus": "ok",
  "capturedAt": 1729382400
}
```

- **Response (200 OK)**:
```json
{
  "status": "success",
  "eventId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "result": "Present",
  "student": {
    "studentId": "std_101",
    "fullName": "Jane Doe",
    "rollNumber": "CS-2024-001"
  },
  "lecture": {
    "subject": "Operating Systems",
    "class": "Computer Engineering A"
  },
  "message": "Attendance marked successfully"
}
```

- **Possible Results**:
  - `Present`: Scan captured before late cutoff.
  - `Late`: Scan captured between late cutoff and session deadline.
  - `Rejected`: Session closed, too early, or student not enrolled in active lecture.
  - `Duplicate`: Attendance already recorded for this session.
  - `No Active Lecture`: No scheduled lecture found for the student's class at this time.
  - `Device Error`: Hardware sensor flagged an internal error.

### 2.2 Device Heartbeat
- **Method**: `POST`
- **Path**: `/deviceHeartbeat` (or `/api/heartbeat`)
- **Headers**: Required authentication headers
- **Request Body (JSON)**:
```json
{
  "sensorStatus": "ok",
  "firmwareVersion": "v1.2.0",
  "wifiSignalRssi": -58,
  "freeHeap": 182400
}
```

- **Response (200 OK)**:
```json
{
  "status": "acknowledged",
  "pendingEnrollment": null
}
```
If an enrollment request is pending for this device, `pendingEnrollment` returns `{ "requestId": "req_123", "studentId": "std_101" }`.

### 2.3 Enrollment Result Ingest
- **Method**: `POST`
- **Path**: `/enrollmentResult`
- **Headers**: Required authentication headers
- **Request Body (JSON)**:
```json
{
  "requestId": "req_123",
  "status": "success",
  "fingerprintRef": 42
}
```
