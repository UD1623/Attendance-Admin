import { Command } from 'commander';
import * as crypto from 'crypto';

const program = new Command();

function computeHmac(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

program
  .name('device-simulator')
  .description('ESP32 & Fingerprint Sensor hardware simulation CLI with HMAC security')
  .version('2.0.0');

program
  .option('-d, --device <id>', 'Device identifier', 'ESP32-READER-01')
  .option('-k, --secret <key>', 'Device pre-shared cryptographic key', 'dev-secret-key-123')
  .option('-s, --student <ref>', 'Fingerprint template reference ID (e.g. 1, 2, 3)', parseInt)
  .option('-b, --heartbeat', 'Send real-time telemetry heartbeat to backend')
  .option('-e, --enroll <requestId>', 'Complete biometric enrollment for request ID')
  .option('--slot <number>', 'Fingerprint slot reference (1..1000)', parseInt)
  .option('--time <HH:MM>', 'Simulate specific time of day (e.g. 09:05 for Present, 09:20 for Late)')
  .option('--day <number>', 'Simulate specific day of week (1=Mon, 2=Tue, 3=Wed...)', parseInt)
  .option('--date <YYYY-MM-DD>', 'Simulate specific calendar date')
  .option('--status <state>', 'Sensor hardware status string', 'ok')
  .option('--burst <count>', 'Send rapid burst of N identical scans to test idempotency', parseInt)
  .option(
    '--endpoint <url>',
    'Functions base URL',
    'http://127.0.0.1:5001/smart-attendance-dev/us-central1'
  )
  .action(async (options) => {
    console.log(`\n======================================================`);
    console.log(`📡 [ESP32 Simulator] Device ID: ${options.device}`);
    console.log(`🔗 [ESP32 Simulator] Target Endpoint: ${options.endpoint}`);
    console.log(`======================================================\n`);

    // 1. Biometric Enrollment Completion
    if (options.enroll) {
      const slot = options.slot || Math.floor(Math.random() * 500) + 10;
      console.log(`👆 [Sensor] Student placed finger on optical prism...`);
      console.log(`🔄 [Sensor] Feature extraction completed. Enrolled in hardware slot #${slot}`);

      try {
        const url = `${options.endpoint}/enrollmentResult`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-device-id': options.device,
          },
          body: JSON.stringify({
            requestId: options.enroll,
            status: 'success',
            fingerprintRef: slot,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          console.log(`✅ [Backend Response] Biometric enrollment verified!`, data);
        } else {
          console.error(`❌ [Backend Error]:`, data);
        }
      } catch (err: any) {
        console.error(`💥 [Connection Error] Failed to post enrollment:`, err.message);
      }
      return;
    }

    // 2. Hardware Heartbeat Telemetry
    if (options.heartbeat) {
      const eventId = `hb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const rssi = -55 - Math.floor(Math.random() * 15);
      const freeHeap = 175000 + Math.floor(Math.random() * 15000);

      const payload = {
        sensorStatus: options.status || 'ok',
        firmwareVersion: 'v1.2.0-esp32',
        wifiSignalRssi: rssi,
        freeHeap,
      };

      const rawBody = JSON.stringify(payload);
      const signaturePayload = `${options.device}:${eventId}:${timestamp}:${rawBody}`;
      const signature = computeHmac(options.secret, signaturePayload);

      console.log(`💓 [Heartbeat] Transmitting hardware telemetry...`);
      console.log(`   - WiFi RSSI: ${rssi} dBm`);
      console.log(`   - Free Heap: ${(freeHeap / 1024).toFixed(1)} KB`);
      console.log(`   - Sensor Health: ${payload.sensorStatus}`);
      console.log(`   - HMAC-SHA256: ${signature.substring(0, 16)}...`);

      try {
        const url = `${options.endpoint}/deviceHeartbeat`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-device-id': options.device,
            'x-event-id': eventId,
            'x-timestamp': String(timestamp),
            'x-signature': signature,
          },
          body: rawBody,
        });

        const data = await res.json();
        if (res.ok) {
          console.log(`\n✅ [Heartbeat Acknowledged]`);
          console.log(`   Status: ${data.status}`);
          if (data.pendingEnrollment) {
            console.log(`   ⚠️ PENDING ENROLLMENT FOUND: Request #${data.pendingEnrollment.requestId} for student ${data.pendingEnrollment.studentName}`);
          } else {
            console.log(`   No pending enrollment requests queued.`);
          }
        } else {
          console.error(`❌ [Heartbeat Rejected]:`, data);
        }
      } catch (err: any) {
        console.error(`💥 [Connection Error] Heartbeat failed:`, err.message);
      }
      return;
    }

    // 3. Biometric Scan Ingestion (Student Scan)
    if (options.student !== undefined) {
      const burstCount = options.burst && options.burst > 1 ? options.burst : 1;

      for (let i = 0; i < burstCount; i++) {
        const eventId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const timestamp = Math.floor(Date.now() / 1000);

        const payload: any = {
          fingerprintRef: options.student,
          sensorStatus: options.status || 'ok',
          capturedAt: timestamp,
        };

        if (options.time) payload.testTimeOverride = options.time;
        if (options.day) payload.testDayOfWeekOverride = options.day;
        if (options.date) payload.testDateOverride = options.date;

        const rawBody = JSON.stringify(payload);
        const signaturePayload = `${options.device}:${eventId}:${timestamp}:${rawBody}`;
        const signature = computeHmac(options.secret, signaturePayload);

        console.log(`👆 [Biometric Capture #${i + 1}/${burstCount}] Finger detected! Matched template slot #${options.student}`);
        if (options.time) console.log(`   🕒 Simulated Time Override: ${options.time}`);
        if (options.day) console.log(`   📅 Simulated Day of Week: ${options.day}`);

        try {
          const url = `${options.endpoint}/processScan`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-device-id': options.device,
              'x-event-id': eventId,
              'x-timestamp': String(timestamp),
              'x-signature': signature,
            },
            body: rawBody,
          });

          const data = await res.json();
          if (res.ok) {
            const badge =
              data.result === 'Present'
                ? '🟢 [PRESENT]'
                : data.result === 'Late'
                ? '🟡 [LATE]'
                : data.result === 'Duplicate'
                ? '🔁 [DUPLICATE]'
                : '🔴 [' + data.result.toUpperCase() + ']';

            console.log(`\n${badge} Backend Ingestion Response:`);
            console.log(`   Status: ${data.result} (${data.message})`);
            if (data.student) {
              console.log(`   Student: ${data.student.fullName} (${data.student.rollNumber})`);
            }
            if (data.lecture) {
              console.log(`   Lecture: ${data.lecture.subjectName} | Room: ${data.lecture.room || 'N/A'}`);
              console.log(`   Scheduled: ${data.lecture.startTime} - ${data.lecture.endTime}`);
            }
          } else {
            console.error(`\n❌ [Ingestion Rejected (${res.status})]:`, data.error || data.message || data);
          }
        } catch (err: any) {
          console.error(`💥 [Connection Error] Scan ingestion failed:`, err.message);
        }

        if (i < burstCount - 1) {
          // brief pause between bursts
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      return;
    }

    console.log(`ℹ️ No action specified. Usage examples:`);
    console.log(`   npm run simulator -- --heartbeat`);
    console.log(`   npm run simulator -- --student 1`);
    console.log(`   npm run simulator -- --student 1 --time 09:05`);
    console.log(`   npm run simulator -- --student 2 --time 09:20`);
    console.log(`   npm run simulator -- --student 1 --burst 3`);
  });

program.parse(process.argv);
