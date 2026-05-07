# SentinelGate - Project Analysis & Status

## What We Made

SentinelGate is a **decentralized multi-factor spatial-temporal authentication system** for hostel/campus gate management. It's a complete full-stack system with:

1. **Mobile App (Flutter)** - Android app for students to authenticate at gates
2. **Backend API (Node.js)** - Transaction server with HMAC verification
3. **Admin Dashboard** - Web interface for administrators
4. **Gate Display** - Web interface showing QR codes at gates
5. **ML Worker (Python)** - Anomaly detection with XGBoost + ST-GNN
6. **Database (PostgreSQL)** - With PostGIS for geofencing
7. **Cache (Redis)** - For nonce caching and telemetry

---

## Tech Stack

### Frontend (Mobile)
| Technology | Purpose | Version |
|------------|---------|---------|
| **Flutter** | Cross-platform mobile framework | Dart 3.x |
| **Dart** | Programming language | 3.x |
| **google_mlkit_face_detection** | Face liveness detection | Latest |
| **geolocator** | GPS location | Latest |
| **flutter_secure_storage** | Secure key storage (Android Keystore) | Latest |
| **drift** | SQLite local database | Latest |
| **workmanager** | Background sync | Latest |
| **dio** | HTTP client | Latest |
| **otplib** | TOTP generation | Latest |
| **mobile_scanner** | QR code scanning | Latest |

### Frontend (Web)
| Technology | Purpose |
|------------|---------|
| **Vanilla HTML/CSS/JS** | Admin dashboard & gate display |
| **Server-Sent Events (SSE)** | Real-time event streaming |
| **otplib (JS)** | QR code generation |

### Backend
| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | Runtime | 20.x |
| **Express** | Web framework | 4.x |
| **PostgreSQL** | Database | 15+ |
| **PostGIS** | Geospatial queries | 3.x |
| **Redis** | Cache/nonce storage | 7.x |
| **node-cron** | Scheduler | 3.x |
| **jsonwebtoken** | JWT auth | 9.x |
| **bcrypt** | Password hashing | 5.x |
| **helmet** | Security headers | 7.x |
| **cors** | Cross-origin | 2.x |
| **multer** | File uploads | 2.x |
| **otplib** | TOTP verification | 12.x |
| **ioredis** | Redis client | 5.x |
| **crypto-js** | Cryptography | 4.x |

### ML Worker
| Technology | Purpose | Version |
|------------|---------|---------|
| **Python** | Runtime | 3.11 |
| **FastAPI** | Web framework | 0.115 |
| **uvicorn** | ASGI server | 0.30 |
| **psycopg2** | PostgreSQL client | 2.9 |
| **pandas** | Data processing | 2.2 |
| **numpy** | Numerical computing | 1.26 |
| **scikit-learn** | ML library | 1.5 |
| **xgboost** | Gradient boosting | 2.1 |
| **pydantic** | Data validation | 2.8 |

### Infrastructure
| Service | Purpose | Status |
|---------|---------|--------|
| **Railway** | Backend hosting | ✅ Deployed |
| **Vercel** | Frontend hosting | ⚠️ Routing issues |
| **Neon** | PostgreSQL cloud | ✅ Connected |
| **Upstash** | Redis cloud | ✅ Connected |

---

## Code Quality Assessment

### Overall: **GOOD** ⭐⭐⭐⭐☆

The codebase is well-structured with good security practices. Here's the breakdown:

### ✅ Strengths

| Area | Assessment | Details |
|------|------------|---------|
| **Security** | Excellent | HMAC-SHA256 signing, nonce replay prevention, constant-time comparison, secure storage |
| **Architecture** | Good | Clear separation of concerns, route-based organization, middleware pattern |
| **Database** | Good | Proper schema design, RLS-ready, indexed queries |
| **Cron Jobs** | Good | 5 well-implemented scheduled jobs with error handling |
| **Offline-First** | Excellent | SQLite outbox for offline sync |
| **Privacy** | Good | Revocable privacy model with curfew anonymization |

### ⚠️ Issues Found

| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| Vercel routing broken | High | vercel.json | Rebuild or fix routes |
| ML worker not deployed | Medium | ml-worker/ | Deploy to Railway |
| Frontend URLs hardcoded | Low | admin-dashboard/index.html | Use env vars |
| Flutter URLs outdated | Low | constants.dart | Update to current Vercel URL |
| Missing env validation | Low | server.js | Add startup checks |

### Security Review

```javascript
// ✅ GOOD - Constant-time comparison prevents timing attacks
crypto.timingSafeEqual(
  Buffer.from(signature, 'hex'),
  Buffer.from(expectedSig, 'hex')
)

// ✅ GOOD - Nonce prevents replay attacks
await checkAndStoreNonce(nonce, 10);

// ✅ GOOD - SNTP-corrected timestamps
final timestamp = SntpService.nowMs().toString();

// ✅ GOOD - Secure storage with AES-GCM
FlutterSecureStorage(
  aOptions: AndroidOptions(
    encryptedSharedPreferences: true,
    storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
  ),
)
```

---

## GitHub Repositories

### Current Repos (geek-code-psj)

| Repo | Description | Status |
|------|-------------|--------|
| **SentinelGate** | Flutter mobile app | ✅ Active |
| **SentinelGateweb** | Backend + Frontend | ✅ Active |
| **halogaurd** | Different project | ❌ Old |

### Vercel Deployments (Multiple)

All these Vercel projects point to the same SentinelGateweb repo:

| Project Name | URL | Status |
|--------------|-----|--------|
| sentinel-gateweb | sentinel-gateweb.vercel.app | ⚠️ Old |
| sentinel-gateweb-4sdy | sentinel-gateweb-4sdy.vercel.app | ⚠️ Old |
| sentinel-gateweb-odtp | sentinel-gateweb-odtp.vercel.app | ⚠️ Old |
| sentinel-gateweb-fte | sentinel-gateweb-fte.vercel.app | ⚠️ Old |
| sentinel-gateweb-gate | sentinel-gateweb-gate.vercel.app | ⚠️ Old |
| **sentinel-gateweb-ejdf** | sentinel-gateweb-ejdf.vercel.app | ✅ Current |

---

## What's Currently Deployed

### ✅ Working (Production)

| Component | URL | Service |
|-----------|-----|---------|
| **Backend API** | `https://sentinelgateweb-production.up.railway.app` | Railway |
| **Health Check** | `/health` | Railway |
| **Database** | Neon PostgreSQL | Cloud |
| **Redis** | Upstash | Cloud |
| **Curfew Cron** | Running | Railway |
| **Telemetry Cron** | Running | Railway |
| **ML Outbox Cron** | Running | Railway |

### ⚠️ Partially Working

| Component | URL | Issue |
|-----------|-----|-------|
| **Vercel Frontend** | `https://sentinel-gateweb-ejdf.vercel.app/` | Serves wrong page |
| **Admin Dashboard** | `/admin` | Returns 404 |
| **Gate Display** | `/` | Shows admin instead of gate |

### ❌ Not Deployed

| Component | Location | Reason |
|-----------|----------|--------|
| **ML Worker** | ml-worker/main.py | Needs separate Railway service |
| **Flutter App** | Student app/files (4)/ | Not on Play Store |

---

## File Structure Summary

```
websiteadmin/                          # Main project (6,344 lines)
├── backend/                          # Node.js API
│   ├── src/
│   │   ├── server.js               # Express entry point
│   │   ├── db.js                   # PostgreSQL connection
│   │   ├── routes/
│   │   │   ├── auth.js             # /auth/* endpoints
│   │   │   ├── gate.js             # /gate/* endpoints
│   │   │   ├── admin.js            # /admin/* endpoints
│   │   │   ├── leave.js            # /leave/* endpoints
│   │   │   └── sync.js             # /sync/* endpoints
│   │   ├── middleware/
│   │   │   └── hmac.js             # HMAC verification
│   │   ├── workers/
│   │   │   └── crons.js            # 5 cron jobs
│   │   └── utils/
│   │       ├── totp.js             # TOTP verification
│   │       ├── geofence.js         # GPS check
│   │       ├── sse.js             # Real-time events
│   │       └── redis.js           # Redis client
│   └── schema.sql                  # DB schema
├── admin-dashboard/
│   └── index.html                  # Admin UI (single file)
├── gate-display/
│   └── index.html                  # Gate QR display (single file)
├── ml-worker/
│   ├── main.py                     # FastAPI ML service
│   └── requirements.txt
└── vercel.json                    # Frontend routing config
```

---

## Authentication Flow

```
Student App                              Backend                           ML Worker
    │                                        │                                  │
    ├── 1. Scan QR (gate ID + TOTP)          │                                  │
    ├── 2. Check GPS (local)                 │                                  │
    ├── 3. Face PAD (MediaPipe)               │                                  │
    ├── 4. Sign with HMAC                     │                                  │
    │ ──────────────────────────────────────► │                                  │
    │                                        ├── 5. Verify HMAC                │
    │                                        ├── 6. Verify TOTP                │
    │                                        ├── 7. Verify GPS                 │
    │                                        ├── 8. Verify Face                │
    │                                        ├── 9. Write to auth_events       │
    │                                        ├── 10. Add to sync_outbox        │
    │ ◄────────────────────────────────────── │                                  │
    │                                        │ ◄────────── (every 10s)           │
    │                                        │                                  ├── Score with XGBoost
    │                                        │                                  ├── Write anomaly_events
```

---

## Cleanup Recommendations

### Projects to DELETE (keep only working ones):

1. ~~sentinel-gateweb~~ - Old, broken routing
2. ~~sentinel-gateweb-4sdy~~ - Old deployment
3. ~~sentinel-gateweb-odtp~~ - Old deployment
4. ~~sentinel-gateweb-fte~~ - Old deployment
5. ~~sentinel-gateweb-gate~~ - Old deployment

### KEEP:

| Project | URL | Purpose |
|---------|-----|---------|
| **SentinelGate** (GitHub) | github.com/geek-code-psj/SentinelGate | Flutter app repo |
| **SentinelGateweb** (GitHub) | github.com/geek-code-psj/SentinelGateweb | Backend repo |
| **sentinel-gateweb-ejdf** (Vercel) | sentinel-gateweb-ejdf.vercel.app | Current frontend |
| **sentinelgateweb-production** (Railway) | sentinelgateweb-production.up.railway.app | Current backend |

---

## Next Steps to Make Fully Working

### Priority 1: Fix Vercel Routing

The vercel.json needs to properly route:
- `/` → gate-display/index.html
- `/admin` → admin-dashboard/index.html

### Priority 2: Deploy ML Worker

Deploy ml-worker to separate Railway service for anomaly detection.

### Priority 3: Update Flutter URLs

Update `constants.dart` with correct Vercel URLs:
```dart
gateQrWebUrl = 'https://sentinel-gateweb-ejdf.vercel.app/'
adminWebUrl = 'https://sentinel-gateweb-ejdf.vercel.app/admin'
```

---

## Summary

| Metric | Value |
|--------|-------|
| Total Code Lines | ~6,344 |
| Files | 27 |
| GitHub Stars | N/A (private) |
| Deployments | 2 (Railway + Vercel) |
| Code Quality | Good ⭐⭐⭐⭐ |
| Security | Excellent |
| Infrastructure Cost | ~$0 (free tiers) |

Last Updated: 2026-04-22