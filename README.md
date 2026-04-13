# SentinelGate — Decentralized Multi-Factor Spatial-Temporal Authentication

**v2.0 Complete Code Reorganization**

6,344 lines of code across 27 files, now properly structured for production deployment and team collaboration.

---

## Architecture

```
Student APK (Flutter)
  ↓ POST /auth/event  [HMAC-SHA256 signed]
  ↓ POST /sync/spoof  [silent fail logging]
  ↓ GET  /sync/time   [SNTP clock sync]
  ↓ GET  /sync/delta  [geofence + gate mode updates]

Node.js Backend  :3001
  ├── HMAC-SHA256 middleware (constant-time verify)
  ├── Redis nonce cache (replay prevention)
  ├── /gate/bootstrap  → gate display gets TOTP secret once
  ├── /gate/telemetry  → gate display polls queue stats
  ├── /auth/event      → core auth flow (TOTP + GPS + liveness)
  ├── /leave/request   → Phase 3 state machine (short/long leave)
  ├── /admin/stream    → SSE live feed to dashboard
  └── node-cron workers:
       ├── Curfew audit (22:00 IST)
       ├── Re-anonymization (23:59 IST)
       ├── Gate telemetry snapshot (*/5 min)
       ├── Lambda decay (* * * * *)
       └── ML outbox processor (every 10s)

PostgreSQL  :5432
  ├── sentinel.users, devices, biometric_baselines
  ├── sentinel.gates, geofence_zones
  ├── sentinel.auth_events  ← core telemetry
  ├── sentinel.leave_requests, override_events
  ├── sentinel.curfew_violations, anomaly_events
  └── RLS policies on all sensitive tables

Redis  :6379
  ├── nonce:{uuid}   TTL=65s (replay prevention)
  ├── gate_secret:{id}   TTL=600s (cached TOTP secret)
  └── gate_telemetry:{id}  TTL=30s (queue metrics cache)

Python FastAPI ML Worker  :8000
  ├── Reads auth_events from PostgreSQL (NEVER called directly by Node)
  ├── XGBoost point anomaly scoring (rule-based until trained)
  ├── ST-GNN collective scan (periodic, every 60s)
  └── Writes anomaly_events back to PostgreSQL

Gate Display (browser)
  ├── Boots: GET /sync/time (SNTP delta) + POST /gate/bootstrap (secret)
  ├── Generates TOTP QR locally with otplib (offline-first)
  ├── Polls GET /gate/telemetry every 30s (non-blocking)
  └── QR stays live even when backend is unreachable

Admin Dashboard (browser)
  ├── Login → JWT
  ├── Live feed via SSE (/admin/stream)
  ├── Leave approval queue (/leave/pending)
  ├── Guard override console (/admin/override)
  ├── Geofence map (PostGIS polygons rendered on canvas)
  ├── Curfew violations (/admin/curfew)
  └── ML stats (/admin/anomalies)
```

---

## Flutter App State Machine (Prabal's APK)

### Phase 0 — Background Sync
```dart
// On app open / WorkManager fire:
GET /sync/time?client_ts=<phone_time_ms>
// → server_ts_ms, delta_ms
// Store: serverDelta = server_ts_ms - phone_time_ms + rtt/2
// True time: trueTime = DateTime.now().millisecondsSinceEpoch + serverDelta

GET /sync/delta?since=<last_sync_ts>
// → geofences (polygons), gate_modes
// Store in local SQLite (Drift) for offline use
```

### Phase 1 — Scan QR
```dart
// Student presses "Scan Gate"
// Camera reads QR → decode JSON payload:
// { v:2, g:"G-01", geo:"HOSTEL_A", t:"482913", w:59200397, mode:"FULL" }
```

### Phase 2 — Triple-Lock (Edge Verification)
```dart
// Step A — GPS Geofence (local math, no network)
final polygon = localDb.getGeofence(payload.geo);
final gpsResult = pointInPolygon(currentGPS, polygon);
if (!gpsResult.inFence) {
  silentLog(SpoofAttempt(reason: "GPS_FAIL", ...));  // → POST /sync/spoof
  showRetryUI();
  return;
}

// Step B — Face PAD (MediaPipe BlazeFace, on-device)
final padResult = await mediaPipe.runPAD(cameraFeed);
// padResult.livenessScore: 0.0–1.0
// padResult.embeddingHash: SHA256 of 128-dim face vector
if (padResult.livenessScore < 0.75) {
  silentLog(SpoofAttempt(reason: "LIVENESS_FAIL", ...));
  showRetryUI();
  return;
}
```

### Phase 3 — Intent Branch
```dart
// Student selects reason + return time
final durationHours = returnTime.difference(DateTime.now()).inHours;

if (durationHours >= 5) {
  // LONG LEAVE — must get warden approval
  final leaveRes = await POST('/leave/request', {
    gate_id: payload.g, reason, expected_return_ts: returnTime.ms,
    approval_doc_b64: capturedDoc  // camera capture of warden letter
  });
  // leaveRes.status: "PENDING_APPROVAL" → show waiting UI
  // Flutter polls GET /leave/status/{leaveId} every 30s
  // When status == "APPROVED" → proceed to Phase 4
  while (leaveStatus != "APPROVED") {
    await Future.delayed(Duration(seconds: 30));
    leaveStatus = await GET('/leave/status/${leaveRes.leaveId}');
  }
}
// SHORT LEAVE or APPROVED → fall through to Phase 4
```

### Phase 4 — Cryptographic Commitment
```dart
// Build payload
final payload = {
  gate_id: qrPayload.g,
  geofence_id: qrPayload.geo,
  totp_value: qrPayload.t,       // from QR — NOT regenerated on device
  totp_window: qrPayload.w,
  gps_lat: currentGPS.lat,
  gps_lng: currentGPS.lng,
  liveness_score: padResult.livenessScore,
  embedding_hash: padResult.embeddingHash,
  direction: "OUT",
  client_ts: trueTime            // server-corrected timestamp
};

// HMAC-SHA256 signing (Android KeyStore)
final secret = await AndroidKeyStore.getHmacSecret(deviceId);
final bodyHash = sha256(jsonEncode(payload));
final nonce = uuid.v4();
final ts = trueTime.toString();
final canonical = "POST\n/auth/event\n${bodyHash}\n${ts}\n${nonce}";
final signature = hmacSha256(canonical, secret);

// Headers:
// x-device-id: <device_fingerprint>
// x-request-ts: <ts>
// x-request-nonce: <nonce>
// x-request-sig: <signature>

// OFFLINE-FIRST: write to local SQLite immediately
await localDb.authEvents.insert(AuthEvent(payload: payload, status: "PENDING_SYNC"));
// UI immediately shows green — no network wait

// Phase 5: WorkManager syncs in background
```

### Phase 5 — Network Dispatch
```dart
// WorkManager fires when network available
// Outbox pattern: for each pendingSync event:
final response = await POST('/auth/event', payload, headers: hmacHeaders);
if (response.status == "GRANTED") {
  await localDb.authEvents.markSynced(event.id);
} else if (response.error == "AUTH_GATE_LOCKED") {
  showGateLockedUI();
}
// Exponential backoff on failure: 2s → 4s → 8s → 16s → 32s
```

---

## Setup

### 1. Database
```bash
# Start services
docker-compose up -d postgres redis

# Run schema (auto-runs in Docker, or manually):
psql -h localhost -U sentinel_app -d sentinelgate -f backend/schema.sql

# Generate gate TOTP secrets + admin user
cd backend && node bootstrap.js
```

### 2. Backend
```bash
cd backend
cp .env.example .env          # edit passwords
npm install
npm start                     # http://localhost:3001
```

### 3. ML Worker
```bash
cd ml-worker
pip install -r requirements.txt
uvicorn main:app --port 8000  # http://localhost:8000
```

### 4. Frontend
```bash
# Gate display (open in tablet browser at gate)
open dynamic-qr/index.html    # or serve via nginx

# Admin dashboard
open admin-dashboard/index.html

# Or serve both via nginx:
docker-compose up nginx
# Gate display: http://localhost/gate/
# Admin:        http://localhost/admin/
```

### 5. One-command (Docker)
```bash
docker-compose up -d
# First time only:
docker exec sg_backend node bootstrap.js
```

---

## Enroll a Student Device (Flutter APK)
```bash
# First, add student to database:
INSERT INTO sentinel.users (roll_number, full_name, role, hostel_block, room_number)
VALUES ('STU-2892', 'Student Name', 'student', 'A', '204');

# Device enrollment (Flutter calls this at first launch):
curl -X POST http://localhost:3001/auth/enroll \
  -H "Content-Type: application/json" \
  -d '{"roll_number":"STU-2892","device_fingerprint":"<android_id>","platform":"android","model":"Pixel 6"}'

# Response includes hmac_secret — Flutter stores in Android KeyStore
# { "device_id": "uuid", "hmac_secret": "64-hex-chars" }
```

---

## API Reference

| Endpoint | Auth | Description |
|---|---|---|
| `GET /health` | None | Server + DB status |
| `GET /sync/time` | None | SNTP clock sync for Flutter |
| `GET /sync/delta` | None | Geofences + gate modes |
| `POST /sync/spoof` | HMAC | Silent spoof attempt log |
| `POST /gate/bootstrap` | API key | Gate display boot (secret + status) |
| `GET /gate/telemetry/:id` | None | Queue stats for gate display |
| `POST /gate/mode` | JWT admin | Set gate MFA mode |
| `POST /gate/lockdown` | JWT admin | Lock/release all gates |
| `POST /auth/enroll` | None | Register student device |
| `POST /auth/event` | HMAC | Submit authentication event |
| `POST /auth/sync-batch` | HMAC | Batch offline sync |
| `POST /leave/request` | HMAC | Phase 3 leave intent |
| `GET /leave/status/:id` | HMAC | Poll approval status |
| `POST /leave/upload-doc/:id` | HMAC | Upload warden letter |
| `GET /leave/pending` | JWT warden | Approval queue |
| `POST /leave/approve/:id` | JWT warden | Approve/reject leave |
| `POST /admin/login` | None | Get JWT |
| `GET /admin/stream` | JWT | SSE live feed |
| `GET /admin/feed` | JWT | Auth event log |
| `GET /admin/metrics` | JWT | Dashboard summary |
| `GET /admin/anomalies` | JWT | ML anomaly events |
| `POST /admin/override` | JWT guard | Force auth override |
| `GET /admin/curfew` | JWT warden | Tonight's violations |
| `GET /admin/geofences` | JWT | Geofence zones |
| `GET /admin/gates` | JWT | Gate status list |

---

## Key Architectural Decisions

**Trap A Fix (QR Offline):** Gate display fetches TOTP secret once at boot via `/gate/bootstrap`, then generates QR codes locally with `otplib` using SNTP-corrected clock. Zero network needed after boot.

**Trap B Fix (ML Isolation):** Node.js NEVER calls Python ML directly. Both read/write the same PostgreSQL database. Node writes `sync_outbox` rows; Node cron calls `/score-batch` fire-and-forget; ML worker reads `auth_events` independently.

**Gap A Fix (Guard Override):** `/admin/override` endpoint + admin dashboard Override tab with full audit trail, TX IDs, guard identity, and direction (IN/OUT/EXEMPT).

**Gap B Fix (Curfew Cron):** `node-cron` at 22:00 IST queries all `student_presence` rows with `status='OUT'`, inserts `curfew_violations` with full names (revocable privacy), then `23:59` cron nulls names.

**SNTP Anti-Cheat:** Flutter app never trusts phone clock. Uses `GET /sync/time` to compute `serverDelta`, then `trueTime = phoneTime + serverDelta`. TOTP window calculated from `trueTime`.

**LWW Conflict Resolution:** Offline auth events use cryptographic `client_ts` (server-corrected). When multiple offline events sync, PostgreSQL `TIMESTAMPTZ` + `UNIQUE` constraints ensure Last-Write-Wins by timestamp.
