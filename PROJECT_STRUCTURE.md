# SentinelGate Project - Complete Structure & Documentation

## Project Overview

**SentinelGate** is a decentralized multi-factor spatial-temporal authentication system. It combines:
- **TOTP (Time-based One-Time Password)** - QR code based
- **GPS Geofencing** - Location verification
- **Face Liveness Detection** - Prevent photo/spoof attacks
- **ML Anomaly Detection** - XGBoost + ST-GNN for detecting attacks

---

## Complete Directory Structure

```
SentinalgAate/
├── websiteadmin/                    # Main project (Backend + Frontend)
│   ├── backend/                      # Node.js/Express API server
│   │   ├── src/
│   │   │   ├── server.js            # Main Express server (port 3001)
│   │   │   ├── db.js                # PostgreSQL connection (with mock fallback)
│   │   │   ├── db-mock.js           # In-memory mock database for dev
│   │   │   ├── redis-mock.js        # In-memory mock Redis for dev
│   │   │   ├── routes/
│   │   │   │   ├── gate.js          # Gate registration, telemetry, mode control
│   │   │   │   ├── auth.js          # Device enrollment, auth event processing
│   │   │   │   ├── admin.js         # Admin login, metrics, overrides, curfew
│   │   │   │   ├── sync.js          # Time sync, geofence delta, spoof logging
│   │   │   │   └── leave.js         # Leave request, approval, status
│   │   │   ├── middleware/
│   │   │   │   └── hmac.js          # HMAC-SHA256 signature verification
│   │   │   ├── workers/
│   │   │   │   └── crons.js         # Scheduled jobs (5 cron jobs)
│   │   │   └── utils/
│   │   │       ├── sse.js           # Server-Sent Events for real-time
│   │   │       ├── totp.js          # TOTP generation/verification
│   │   │       ├── geofence.js      # GPS geofencing logic
│   │   │       └── redis.js         # Redis client
│   │   ├── schema.sql               # PostgreSQL database schema
│   │   ├── package.json
│   │   ├── bootstrap.js             # Database initialization script
│   │   ├── create-admin.js          # Admin user creation utility
│   │   └── Dockerfile
│   │
│   ├── admin-dashboard/             # Admin dashboard (single HTML file)
│   │   └── index.html              # Full admin UI with login, tabs, SSE
│   │
│   ├── gate-display/               # Gate display (single HTML file)
│   │   └── index.html              # QR code display, real-time telemetry
│   │
│   ├── ml-worker/                  # Python FastAPI ML scoring service
│   │   ├── main.py                 # XGBoost anomaly scoring, ST-GNN
│   │   └── requirements.txt
│   │
│   ├── config/
│   │   ├── .env.example            # Environment variable template
│   │   └── nginx.conf              # Nginx configuration
│   │
│   ├── uploads/                    # Uploaded files directory
│   ├── package.json                # Root package.json
│   ├── vercel.json                 # Vercel routing configuration
│   ├── railway.json                # Railway deployment config
│   ├── docker-compose.yml          # Local development stack
│   ├── Dockerfile                  # Backend Docker image
│   ├── Procfile                    # Railway startup
│   └── DEPLOYMENT_STATUS.md        # Deployment details
│
├── Student app/
│   └── files (4)/                  # Flutter mobile app
│       ├── lib/
│       │   ├── main.dart           # App entry point
│       │   ├── utils/
│       │   │   └── constants.dart  # Configuration (backend URLs, thresholds)
│       │   ├── services/
│       │   │   ├── api_service.dart     # Server communication (HMAC signed)
│       │   │   ├── crypto_service.dart  # HMAC signing
│       │   │   ├── totp_service.dart    # TOTP generation
│       │   │   ├── geo_service.dart     # GPS + geofencing
│       │   │   ├── face_service.dart    # Face liveness detection
│       │   │   ├── gate_event_service.dart
│       │   │   ├── sync_service.dart    # Background sync
│       │   │   ├── approval_service.dart
│       │   │   ├── sntp_service.dart    # Time synchronization
│       │   │   └── spoof_log_service.dart
│       │   ├── screens/
│       │   │   ├── splash_screen.dart
│       │   │   ├── login_screen.dart
│       │   │   ├── home_screen.dart
│       │   │   ├── checkin_screen.dart
│       │   │   ├── checkout_screen.dart
│       │   │   ├── history_screen.dart
│       │   │   └── startup_face_gate_screen.dart
│       │   └── models/
│       │       ├── database.dart       # SQLite (Drift) local DB
│       │       └── database.g.dart
│       ├── pubspec.yaml
│       ├── android/                 # Android build files
│       └── build/                   # Built APK
│
└── IMPLEMENTATION_SUMMARY.md        # Implementation documentation
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUTTER MOBILE APP                                 │
│                        (Student app/files (4)/)                            │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Scan QR     │  │ GPS Check  │  │ Face PAD   │  │ SQLite (Drift) │  │
│  │ (TOTP)      │  │ (Geofence) │  │ (Liveness) │  │ (Offline queue) │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                │                │                  │            │
│         └────────────────┼────────────────┼──────────────────┘            │
│                          │                                                   │
│                          ▼ HMAC-SHA256 signed                               │
└──────────────────────────│─────────────────────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │     Vercel (Frontend Routing)   │
          │  vercel.json proxies /api/*      │
          └────────────────┬────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RAILWAY (Backend)                                    │
│                      Node.js Server :3001                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ROUTES                                                                 ││
│  │  /gate/bootstrap ──→ Gate gets TOTP secret (once)                     ││
│  │  /gate/telemetry ──→ Gate polls queue stats                           ││
│  │  /gate/mode ────────→ Admin sets gate mode (FULL/SINGLE/TOTP_ONLY)    ││
│  │  /gate/lockdown ────→ Admin locks gate completely                     ││
│  │                                                                        ││
│  │  /auth/enroll ──────→ Device enrollment (first time)                  ││
│  │  /auth/event ───────→ Core auth flow (TOTP + GPS + Face)              ││
│  │  /auth/sync-batch ──→ Batch sync from offline queue                   ││
│  │                                                                        ││
│  │  /sync/time ────────→ SNTP time sync for clock drift                  ││
│  │  /sync/delta ───────→ Geofence + gate mode updates                    ││
│  │  /sync/spoof ────────→ Silent spoof attempt logging                   ││
│  │                                                                        ││
│  │  /leave/request ─────→ Student submits leave request                  ││
│  │  /leave/status/{id} ──→ Check leave status                            ││
│  │  /leave/pending ──────→ Admin views pending leaves                    ││
│  │  /leave/approve/{id} ─→ Admin approves/rejects leave                  ││
│  │                                                                        ││
│  │  /admin/login ────────→ Admin JWT login                               ││
│  │  /admin/feed ────────→ Auth events feed (paginated)                  ││
│  │  /admin/metrics ──────→ Dashboard metrics                             ││
│  │  /admin/anomalies ────→ ML anomaly events                             ││
│  │  /admin/override ─────→ Guard override console                        ││
│  │  /admin/curfew ───────→ Curfew violations                            ││
│  │  /admin/geofences ────→ Geofence management                          ││
│  │  /admin/presence ─────→ Student presence status                      ││
│  │  /admin/stream ───────→ SSE real-time event stream                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ CRON JOBS (5 active)                                                   ││
│  │  1. Curfew Audit ─────────── 22:00 IST daily                           ││
│  │  2. Re-anonymization ────── 23:59 IST daily                           ││
│  │  3. Gate Telemetry ──────── Every 5 minutes                           ││
│  │  4. ML Outbox Processor ─── Every 10 seconds                          ││
│  │  5. Heartbeat ───────────── Every 30 seconds                           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌──────────────┐                     ┌──────────────┐                    │
│  │ PostgreSQL   │◄───────────────────►│   Redis     │                    │
│  │  (Neon)      │                       │ (Upstash)   │                    │
│  └──────────────┘                     └──────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼ (async, via sync_outbox)
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ML WORKER (Python FastAPI) - NOT DEPLOYED                 │
│                         Port 8000 (local only)                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  /score-batch ──→ Scores auth events for anomalies                    ││
│  │  /stats ─────────→ ML statistics dashboard                             ││
│  │  /health ────────→ Health check                                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  SCORING METHODS:                                                           │
│  - Rule-based: TEMPORAL_ANOMALY, TRIPLE_LOCK_FAILURE,                      ││
│                 SPATIAL_IMPOSSIBILITY, LIVENESS_ATTACK, REPLAY_ATTACK     ││
│  - XGBoost model: Ready for training (currently uses rules)              ││
│  - ST-GNN: Collective anomaly detection for proxy rings                   ││
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow (Triple-Lock)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STUDENT APP AUTHENTICATION FLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

1. SCAN QR CODE
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ QR contains: { v:2, g:"G-01", geo:"HOSTEL_A", t:"482913", w:59200397, │
   │               mode:"FULL" }                                           │
   └─────────────────────────────────────────────────────────────────────────┘
                         │
2. GPS CHECK (local, no network)
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ App checks: pointInPolygon(currentGPS, geofence_polygon)              │
   │ If FAIL → silentLog(/sync/spoof) → show retry UI                     │
   └─────────────────────────────────────────────────────────────────────────┘
                         │
3. FACE LIVENESS (MediaPipe)
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ - Eye open probability >= 0.4                                        │
   │ - Head rotation < 25° yaw, < 20° pitch                                │
   │ - Liveness score >= 0.65                                              │
   │ If FAIL → silentLog(/sync/spoof) → show retry UI                     │
   └─────────────────────────────────────────────────────────────────────────┘
                         │
4. SIGN WITH HMAC
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ payload = { gate_id, geofence_id, totp_value, totp_window,           │
   │            gps_lat, gps_lng, liveness_score, ... }                   │
   │ signature = HMAC-SHA256(hmac_secret, canonical(payload))             │
   │ headers: x-request-signature, x-request-nonce, x-request-timestamp │
   └─────────────────────────────────────────────────────────────────────────┘
                         │
5. UPLOAD EVENT
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ POST /auth/event (signed)                                            │
   │   → Server verifies HMAC                                              │
   │   → Server verifies TOTP (totp_value vs gate's secret)              │
   │   → Server verifies GPS (PostGIS polygon check)                     │
   │   → Server verifies liveness score >= 0.75                          │
   │   → DECISION: GRANTED / REJECTED                                     │
   │   → Write to auth_events table                                       │
   │   → Add to ML outbox (sync_outbox) for async scoring                │
   └─────────────────────────────────────────────────────────────────────────┘
                         │
6. LOCAL SQLite COMMIT (offline-first)
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ App commits to local SQLite immediately → UI shows "Access OK"     │
   │ WorkManager runs background sync → uploads from outbox             │
   └─────────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Summary

### Gate Endpoints
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /gate/bootstrap | Get gate config + TOTP secret | None |
| GET | /gate/telemetry/:gateId | Get queue stats | None |
| POST | /gate/mode | Set gate MFA mode | Admin/Warden |
| POST | /gate/lockdown | Lock gate completely | Admin |

### Auth Endpoints
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /auth/enroll | Device enrollment | None |
| POST | /auth/event | Core auth flow | HMAC |
| POST | /auth/sync-batch | Batch sync from offline | HMAC |

### Sync Endpoints
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /sync/time | SNTP time sync | None |
| GET | /sync/delta | Geofence + gate updates | HMAC |
| POST | /sync/spoof | Spoof attempt logging | HMAC |

### Leave Endpoints
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /leave/request | Submit leave request | HMAC |
| GET | /leave/status/:id | Check leave status | HMAC |
| POST | /leave/upload-doc/:id | Upload approval doc | HMAC |
| GET | /leave/pending | View pending leaves | Admin/Warden |
| POST | /leave/approve/:id | Approve/reject leave | Admin/Warden |

### Admin Endpoints
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /admin/login | Admin login | None |
| GET | /admin/feed | Auth events feed | Admin/Warden/Guard |
| GET | /admin/metrics | Dashboard metrics | Admin/Warden/Guard |
| GET | /admin/anomalies | ML anomaly events | Admin/Warden |
| POST | /admin/override | Create override | Admin/Warden/Guard |
| GET | /admin/overrides | List overrides | Admin/Warden/Guard |
| GET | /admin/curfew | Curfew violations | Admin/Warden |
| GET | /admin/geofences | List geofences | Admin/Warden/Guard |
| PUT | /admin/geofences/:id | Update geofence | Admin |
| GET | /admin/gates | List gates | Admin/Warden/Guard |
| GET | /admin/presence | Student presence | Admin/Warden |
| GET | /admin/stream | SSE real-time stream | Admin/Warden/Guard |

---

## Database Schema (Key Tables)

### sentinel.users
- `id` (UUID), `roll_number`, `full_name`, `role` (student/guard/warden/admin)
- `hostel_block`, `room_number`, `password_hash`, `is_active`

### sentinel.devices
- `id` (UUID), `user_id`, `device_fingerprint`, `hmac_secret_enc`
- `platform`, `model`, `enrolled_at`, `is_revoked`

### sentinel.gates
- `id` (VARCHAR, e.g. "G-01"), `name`, `geofence_id`
- `totp_secret_enc`, `status` (ACTIVE/LOCKED/DEGRADED/MAINTENANCE)
- `mfa_mode` (FULL/SINGLE/TOTP_ONLY), `current_rho`, `current_lambda`

### sentinel.geofence_zones
- `id` (VARCHAR, e.g. "HOSTEL_A"), `name`, `center_lat`, `center_lng`
- `radius_meters`, `polygon_coords` (JSONB)

### sentinel.auth_events
- `id` (UUID), `user_id`, `device_id`, `student_roll`
- `gate_id`, `geofence_id`, `client_ts`, `server_ts`
- `totp_valid`, `gps_in_fence`, `gps_distance_m`
- `liveness_score`, `liveness_pass`
- `status` (GRANTED/REJECTED/ANOMALY/OVERRIDE/PENDING/SYNCING)
- `xgboost_score`, `anomaly_type`

### sentinel.anomaly_events
- `id` (UUID), `auth_event_id`, `user_id`, `model` (xgboost/stgnn)
- `anomaly_type`, `score`, `severity` (low/medium/high), `details`

### sentinel.leave_requests
- `id` (UUID), `user_id`, `gate_id`, `reason`, `expected_return_ts`
- `status` (PENDING/APPROVED/REJECTED), `approved_by`, `created_at`

### sentinel.override_events
- `id` (UUID), `gate_id`, `user_id`, `override_reason`
- `created_by`, `expires_at`, `is_active`

---

## What IS Working

### ✅ Deployed & Working

| Component | Status | URL | Location |
|-----------|--------|-----|----------|
| **Backend API** | Working | `https://sentinelgateweb-production.up.railway.app` | Railway |
| **Database** | Connected | Neon PostgreSQL | Cloud |
| **Redis Cache** | Connected | Upstash | Cloud |
| **Health Check** | Responding | `/health` returns `{"status":"ok"}` | Railway |
| **ML Outbox Cron** | Running | Processes every 10s | Railway |
| **Telemetry Cron** | Running | Every 5 min | Railway |
| **Curfew Cron** | Running | 22:00 IST daily | Railway |

### ⚠️ Partially Working

| Component | Status | Issue |
|-----------|--------|-------|
| **Vercel Routing** | Not working | `/` serves admin instead of gate display |
| **/admin URL** | Returns 404 | Should serve admin dashboard |
| **Gate Display** | Not accessible | Route not working |

### ❌ Not Deployed

| Component | Status | Reason |
|-----------|--------|--------|
| **ML Worker** | Local only | Needs separate Railway service |
| **Flutter App** | APK exists | Not on Play Store |
| **Frontend folder** | Empty | Files at root level |

---

## Environment Variables

### Backend (Railway)
```
PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://...@neon.tech/neondb
REDIS_URL=rediss://...@upstash.io:6379
JWT_SECRET=<generated>
ADMIN_JWT_SECRET=<generated>
HMAC_TIMESTAMP_WINDOW=60
```

### Flutter App (constants.dart)
```dart
backendRootUrl = 'https://sentinelgateweb-production.up.railway.app'
intranetBaseUrl = 'https://sentinelgateweb-production.up.railway.app/api'
cloudBaseUrl = 'https://sentinelgateweb-production.up.railway.app/api'
gateQrWebUrl = 'https://sentinel-gateweb-4sdy-5xlaqwa20.vercel.app/'
adminWebUrl = 'https://sentinel-gateweb-ejdf-im2a9shr3.vercel.app/'
```

---

## Credentials (from deployment)

| Role | Roll Number | Password |
|------|-------------|----------|
| Admin | admin-001 | admin123 |

---

## Key Files Connection Map

```
Flutter App
├── constants.dart ──────────────► backendRootUrl ──► Railway
├── api_service.dart ────────────► /auth/event ────► auth.js route
├── crypto_service.dart ────────► HMAC signing ───► hmac.js middleware
├── geo_service.dart ────────────► local check ───► sync/delta
└── face_service.dart ──────────► MediaPipe PAD ──► liveness_score

Backend Server
├── server.js ───────────────────► Express server ◄── routes/*.js
├── db.js ───────────────────────► PostgreSQL ◄────── schema.sql
├── routes/auth.js ──────────────► /auth/* ─────────► Triple-lock logic
├── routes/gate.js ──────────────► /gate/* ─────────► Gate management
├── routes/admin.js ─────────────► /admin/* ───────► Dashboard ops
├── routes/leave.js ─────────────► /leave/* ───────► Leave workflow
├── routes/sync.js ──────────────► /sync/* ─────────► Time + delta
├── middleware/hmac.js ──────────► HMAC verify ─────► Replay prevention
├── workers/crons.js ────────────► 5 cron jobs ────► Background tasks
└── utils/totp.js ───────────────► TOTP verify ─────► QR code validation

Admin Dashboard (index.html)
├── Login form ─────────────────► /admin/login ──► JWT token
├── SSE stream ─────────────────► /admin/stream ─► Real-time events
├── Leave queue ───────────────► /leave/pending ─► Pending leaves
├── Override console ──────────► /admin/override ─► Create override
└── All APIs use full Railway URL (hardcoded)

Gate Display (index.html)
├── Bootstrap ─────────────────► /gate/bootstrap ─► Get TOTP secret
├── TOTP generation ───────────► Local otplib ────► QR code display
├── Telemetry poll ────────────► /gate/telemetry ► Queue stats
└── All APIs use full Railway URL (hardcoded)
```

---

## Logic Issues Found

### 1. Vercel Routing Not Working
- **Problem**: vercel.json routes not being applied
- **Expected**: `/` → gate-display, `/admin` → admin-dashboard
- **Actual**: `/` → admin-dashboard, `/admin` → 404
- **Fix**: Rebuild Vercel project or check vercel.json format

### 2. ML Worker Not Deployed
- **Problem**: Python FastAPI service exists but not deployed
- **Impact**: Anomaly scoring runs locally only, not in production
- **Fix**: Deploy ml-worker to separate Railway service

### 3. Frontend Directory Empty
- **Problem**: `/frontend/` folder is empty
- **Impact**: Files are at root level (admin-dashboard, gate-display)
- **Fix**: Organize into proper public/ structure

### 4. URL Mismatch in Flutter App
- **Problem**: constants.dart has old Vercel URLs
- **Current**: `sentinel-gateweb-4sdy-5xlaqwa20.vercel.app`
- **Deployed**: `sentinel-gateweb-ejdf.vercel.app`
- **Fix**: Update constants.dart with correct URLs before rebuild

---

## Files Created

| File | Purpose |
|------|----------|
| PROJECT_STRUCTURE.md | This comprehensive documentation |

Last Updated: 2026-04-22