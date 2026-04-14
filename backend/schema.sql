-- ============================================================
-- SentinelGate Database Schema
-- PostgreSQL 15+ with PostGIS extension
-- Run as superuser to create extension, then as app owner
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- PostGIS for geofencing (install postgis package first)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- SCHEMA ISOLATION
-- ============================================================
CREATE SCHEMA IF NOT EXISTS sentinel;
SET search_path = sentinel, public;

-- ============================================================
-- 1. USERS (students, guards, wardens, admins)
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roll_number     VARCHAR(20) UNIQUE NOT NULL,        -- e.g. "STU-2892" or "2021CS042"
    full_name       TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student','guard','warden','admin')),
    hostel_block    VARCHAR(10),                         -- A, B, C etc. — null for staff
    room_number     VARCHAR(10),
    phone_hash      TEXT,                                -- bcrypt hash, never plain
    email_hash      TEXT,
    password_hash   TEXT,                                -- bcrypt hash for admin/warden login
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ
);

-- ============================================================
-- 2. DEVICES — each student phone registered here
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.devices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES sentinel.users(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL UNIQUE,            -- hardware ID from Flutter
    -- HMAC shared secret (high entropy, 32 bytes hex)
    -- Stored encrypted at rest. Never returned in API responses.
    hmac_secret_enc TEXT NOT NULL,                      -- AES-256 encrypted with server master key
    platform        VARCHAR(10) CHECK (platform IN ('android','ios')),
    model           TEXT,
    fcm_token       TEXT,                                -- Firebase Cloud Messaging token for push notifications
    enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ,
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON sentinel.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON sentinel.devices(device_fingerprint);

-- ============================================================
-- 3. BIOMETRIC BASELINES
-- Only stores hash of embedding — raw biometric never persists
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.biometric_baselines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES sentinel.users(id) ON DELETE CASCADE,
    -- SHA256 of the 128-dim FaceNet embedding vector (quantized)
    -- The actual embedding lives only on the device secure enclave
    embedding_hash  TEXT NOT NULL,
    enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

-- ============================================================
-- 4. GATES
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.gates (
    id              VARCHAR(10) PRIMARY KEY,             -- "G-01", "G-02"
    name            TEXT NOT NULL,
    geofence_id     VARCHAR(50) NOT NULL,
    location_label  TEXT,
    -- TOTP secret for THIS gate's QR codes
    -- Each gate has a unique secret so compromise of one gate ≠ compromise of all
    totp_secret_enc TEXT NOT NULL,                      -- AES-256 encrypted
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','LOCKED','DEGRADED','MAINTENANCE')),
    mfa_mode        VARCHAR(20) NOT NULL DEFAULT 'FULL'
                        CHECK (mfa_mode IN ('FULL','SINGLE','TOTP_ONLY')),
    -- Queue params for this gate (updated by telemetry cron)
    current_rho     NUMERIC(4,3) DEFAULT 0,
    current_lambda  INTEGER DEFAULT 0,
    mu_capacity     INTEGER DEFAULT 12,                  -- persons/min this gate can serve
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. GEOFENCE ZONES (PostGIS polygons)
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.geofence_zones (
    id              VARCHAR(50) PRIMARY KEY,             -- "HOSTEL_A"
    name            TEXT NOT NULL,
    description     TEXT,
    -- Using TEXT for lat/lng bounds when PostGIS not available
    -- Replace with: boundary GEOMETRY(MULTIPOLYGON, 4326)
    center_lat      NUMERIC(10,7) NOT NULL,
    center_lng      NUMERIC(10,7) NOT NULL,
    radius_meters   INTEGER NOT NULL DEFAULT 100,        -- fallback circular geofence
    -- JSON polygon coords for PostGIS: [[lng,lat],[lng,lat],...]
    polygon_coords  JSONB,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. AUTH EVENTS — core telemetry table
-- All authentication attempts land here via sync
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.auth_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Who
    user_id         UUID REFERENCES sentinel.users(id),  -- null if unknown device
    device_id       UUID REFERENCES sentinel.devices(id),
    student_roll    VARCHAR(20),                          -- denormalized for fast display
    -- Where
    gate_id         VARCHAR(10) REFERENCES sentinel.gates(id),
    geofence_id     VARCHAR(50) REFERENCES sentinel.geofence_zones(id),
    -- When
    client_ts       TIMESTAMPTZ NOT NULL,                 -- timestamp from device (may lag)
    server_ts       TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- when backend received it
    totp_window     BIGINT,                               -- which 30s window the TOTP was for
    -- Payload hashes (raw data never stored)
    payload_hash    TEXT,                                 -- SHA256 of the original signed body
    hmac_signature  TEXT,                                 -- the x-request-signature header
    nonce           TEXT,                                 -- from x-request-nonce header
    -- Factor results
    totp_valid      BOOLEAN,
    gps_lat         NUMERIC(10,7),
    gps_lng         NUMERIC(10,7),
    gps_in_fence    BOOLEAN,
    gps_distance_m  INTEGER,                             -- distance from geofence center
    liveness_score  NUMERIC(5,4),                        -- 0.0000 to 1.0000
    liveness_pass   BOOLEAN,
    -- Overall outcome
    status          VARCHAR(20) NOT NULL
                        CHECK (status IN ('GRANTED','REJECTED','ANOMALY','OVERRIDE','PENDING','SYNCING')),
    rejection_reason TEXT,
    -- HMAC verification result
    hmac_valid      BOOLEAN,
    replay_attempt  BOOLEAN NOT NULL DEFAULT FALSE,
    -- ML scores (populated async by FastAPI worker)
    xgboost_score   NUMERIC(5,4),                        -- 0 = normal, 1 = anomaly
    stgnn_score     NUMERIC(5,4),
    anomaly_type    VARCHAR(50),
    -- Direction
    direction       VARCHAR(5) CHECK (direction IN ('IN','OUT')),
    -- Sync metadata
    synced_at       TIMESTAMPTZ,                         -- when WorkManager pushed this
    is_override     BOOLEAN NOT NULL DEFAULT FALSE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_auth_user ON sentinel.auth_events(user_id, server_ts DESC);
CREATE INDEX IF NOT EXISTS idx_auth_gate ON sentinel.auth_events(gate_id, server_ts DESC);
CREATE INDEX IF NOT EXISTS idx_auth_status ON sentinel.auth_events(status);
CREATE INDEX IF NOT EXISTS idx_auth_ts ON sentinel.auth_events(server_ts DESC);
CREATE INDEX IF NOT EXISTS idx_auth_anomaly ON sentinel.auth_events(stgnn_score) WHERE stgnn_score > 0.5;

-- ============================================================
-- 7. STUDENT PRESENCE — current IN/OUT state per student
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.student_presence (
    user_id         UUID PRIMARY KEY REFERENCES sentinel.users(id),
    current_status  VARCHAR(5) NOT NULL DEFAULT 'IN'
                        CHECK (current_status IN ('IN','OUT','UNKNOWN')),
    last_gate_id    VARCHAR(10) REFERENCES sentinel.gates(id),
    last_event_id   UUID REFERENCES sentinel.auth_events(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. OVERRIDE EVENTS — guard manual overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.override_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_event_id   UUID REFERENCES sentinel.auth_events(id),
    guard_user_id   UUID NOT NULL REFERENCES sentinel.users(id),
    student_roll    VARCHAR(20) NOT NULL,
    gate_id         VARCHAR(10) REFERENCES sentinel.gates(id),
    action          VARCHAR(30) NOT NULL
                        CHECK (action IN ('FORCE_ENTRY','FORCE_EXIT','FORCE_EXEMPT')),
    reason          VARCHAR(50) NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. CURFEW VIOLATIONS — populated by node-cron at 22:00
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.curfew_violations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES sentinel.users(id),
    student_roll    VARCHAR(20) NOT NULL,
    -- Decrypted name only written during audit window (22:00–23:59)
    student_name    TEXT,                                -- NULL during day (privacy model)
    violation_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    last_seen_gate  VARCHAR(10),
    last_seen_at    TIMESTAMPTZ,
    minutes_late    INTEGER,
    status          VARCHAR(20) DEFAULT 'UNRESOLVED'
                        CHECK (status IN ('UNRESOLVED','RETURNED','EXEMPTED','ESCALATED')),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curfew_date ON sentinel.curfew_violations(violation_date DESC);

-- ============================================================
-- 10. ANOMALY EVENTS — written by FastAPI ML worker
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.anomaly_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_event_id   UUID REFERENCES sentinel.auth_events(id),
    user_id         UUID REFERENCES sentinel.users(id),
    model           VARCHAR(20) NOT NULL CHECK (model IN ('xgboost','stgnn','combined')),
    anomaly_type    VARCHAR(50) NOT NULL,
    score           NUMERIC(5,4) NOT NULL,
    severity        VARCHAR(10) CHECK (severity IN ('low','medium','high','critical')),
    details         JSONB,
    is_reviewed     BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by     UUID REFERENCES sentinel.users(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. SYNC QUEUE / OUTBOX
-- WorkManager pushes to this, backend moves to auth_events
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.sync_outbox (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       UUID REFERENCES sentinel.devices(id),
    raw_payload     JSONB NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PROCESSING','DONE','FAILED')),
    error_msg       TEXT,
    processed_at    TIMESTAMPTZ
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE sentinel.auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel.biometric_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel.student_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel.curfew_violations ENABLE ROW LEVEL SECURITY;

-- Students can only see their own auth events
CREATE POLICY auth_events_student_policy ON sentinel.auth_events
    FOR SELECT
    USING (
        current_setting('app.user_id', true) = user_id::text
        OR current_setting('app.user_role', true) IN ('admin','warden','guard')
    );

-- Students can only see their own biometric hash
CREATE POLICY biometric_student_policy ON sentinel.biometric_baselines
    FOR ALL
    USING (
        current_setting('app.user_id', true) = user_id::text
        OR current_setting('app.user_role', true) = 'admin'
    );

-- Curfew violations: only warden/admin can see names
CREATE POLICY curfew_warden_policy ON sentinel.curfew_violations
    FOR SELECT
    USING (
        current_setting('app.user_role', true) IN ('admin','warden')
    );

-- ============================================================
-- SEED DATA — gates and geofences (no student data — real only)
-- ============================================================
INSERT INTO sentinel.geofence_zones (id, name, center_lat, center_lng, radius_meters, polygon_coords) VALUES
('HOSTEL_A',    'Hostel Block A',        23.5204, 77.8038, 80,  '[{"lat":23.5208,"lng":77.8033},{"lat":23.5208,"lng":77.8043},{"lat":23.5200,"lng":77.8043},{"lat":23.5200,"lng":77.8033}]'),
('HOSTEL_B',    'Hostel Block B',        23.5210, 77.8050, 80,  '[{"lat":23.5214,"lng":77.8045},{"lat":23.5214,"lng":77.8055},{"lat":23.5206,"lng":77.8055},{"lat":23.5206,"lng":77.8045}]'),
('ACADEMIC',    'Academic Zone',         23.5195, 77.8025, 120, '[{"lat":23.5201,"lng":77.8018},{"lat":23.5201,"lng":77.8032},{"lat":23.5189,"lng":77.8032},{"lat":23.5189,"lng":77.8018}]'),
('PERIMETER_S', 'Campus South Perimeter',23.5185, 77.8038, 150, '[{"lat":23.5190,"lng":77.8028},{"lat":23.5190,"lng":77.8048},{"lat":23.5180,"lng":77.8048},{"lat":23.5180,"lng":77.8028}]')
ON CONFLICT (id) DO NOTHING;

-- Gates — totp_secret_enc is a placeholder; real value set by bootstrap script
INSERT INTO sentinel.gates (id, name, geofence_id, location_label, totp_secret_enc, mu_capacity) VALUES
('G-01', 'Hostel A Main Gate',     'HOSTEL_A',    'North entrance, Hostel Block A', 'SEED_REPLACE_IN_BOOTSTRAP', 12),
('G-02', 'Hostel B Main Gate',     'HOSTEL_B',    'North entrance, Hostel Block B', 'SEED_REPLACE_IN_BOOTSTRAP', 12),
('G-03', 'Academic Block Entry',   'ACADEMIC',    'Main lobby, Academic building',  'SEED_REPLACE_IN_BOOTSTRAP', 15),
('G-04', 'Campus South Perimeter', 'PERIMETER_S', 'South pedestrian gate',          'SEED_REPLACE_IN_BOOTSTRAP', 10)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 12. LEAVE REQUESTS — Phase 3 state machine
-- ============================================================
CREATE TABLE IF NOT EXISTS sentinel.leave_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES sentinel.users(id),
    device_id           UUID REFERENCES sentinel.devices(id),
    gate_id             VARCHAR(10) REFERENCES sentinel.gates(id),
    reason              VARCHAR(50) NOT NULL,
    duration_hours      NUMERIC(5,2) NOT NULL,
    is_long_leave       BOOLEAN NOT NULL DEFAULT FALSE,  -- >= 5 hours
    expected_return_ts  TIMESTAMPTZ NOT NULL,
    approval_doc_path   TEXT,                            -- path to uploaded warden letter
    status              VARCHAR(20) NOT NULL DEFAULT 'APPROVED'
                            CHECK (status IN (
                              'APPROVED',        -- short leave or warden-approved
                              'PENDING_APPROVAL', -- doc submitted, awaiting warden
                              'PENDING_DOC',      -- long leave, doc not yet uploaded
                              'REJECTED',         -- warden rejected
                              'CANCELLED'
                            )),
    approved_by         UUID REFERENCES sentinel.users(id),
    approved_by_name    TEXT,
    approved_at         TIMESTAMPTZ,
    warden_notes        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_user ON sentinel.leave_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_pending ON sentinel.leave_requests(status)
    WHERE status IN ('PENDING_APPROVAL','PENDING_DOC');

-- Add mfa_mode_used column to auth_events (tracks which mode was active at auth time)
ALTER TABLE sentinel.auth_events
    ADD COLUMN IF NOT EXISTS mfa_mode_used VARCHAR(20);
