# Local Setup & Development Guide

## Prerequisites
- Node.js 20+ (Node 24 supported)
- npm 10+
- Java 17+ (Java 23 installed and supported for Firebase Local Emulators)
- Git

## 1. Quick Start

### 1.1 Install Dependencies
Run from repository root:
```bash
npm install
```

### 1.2 Start Firebase Emulators
The Firebase Local Emulator Suite provides Auth, Firestore, Functions, and Hosting locally without touching production services:
```bash
npm run emulators
```
- Emulator UI: http://localhost:4000
- Auth Emulator: http://localhost:9099
- Firestore Emulator: http://localhost:8080
- Functions: http://localhost:5001

### 1.3 Seed Default Data & First SuperAdmin
In a second terminal, execute the local seed script:
```bash
npm run seed
```
This provisions:
- SuperAdmin account: `admin@attendance.local` / `AdminPass123!`
- Sample classes (e.g. Computer Engineering A & B)
- Sample subjects (e.g. Operating Systems, Computer Networks)
- Timetable entries marked as illustrative placeholders
- Device simulator registration

### 1.4 Start Frontend Web Application
```bash
npm run dev
```
Open http://localhost:5173 to access the dashboard.

### 1.5 Run the Hardware Simulator
```bash
npm run simulator -- --heartbeat
```
To simulate a student scan:
```bash
npm run simulator -- --student 1
```
