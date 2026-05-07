package com.sentinelgate.model

// ─── QR Parsed Result ───────────────────────────────────────────────────────

data class GateQr(
    val gateId: String,       // g
    val geofenceId: String,   // geo
    val totpRaw: String,      // t  (will be SHA-256 hashed before payload)
    val expiry: Long,         // w  (unix ms or unix s or ISO — TotpService normalises)
    val mode: String = "FULL" // mode
)

// ─── Enrollment ──────────────────────────────────────────────────────────────

data class EnrollRequest(
    val roll_number: String,
    val name: String,
    val department: String,
    val device_fingerprint: String,
    val platform: String = "android",
    val model: String
)

data class EnrollResponse(
    val hmac_secret: String,
    val device_id: String
)

// ─── Event Payload ───────────────────────────────────────────────────────────

data class EventPayload(
    val event_id: String,
    val student_id: String,
    val status: String,          // IN | OUT
    val reason: String,
    val expected_return_ts: Long?,
    val expected_duration_ms: Long?,
    val requires_approval: Boolean,
    val gps_lat: Double,
    val gps_lng: Double,
    val gps_accuracy: Float,
    val gate_id: String,
    val geofence_id: String,
    val true_timestamp: Long,    // SNTP-corrected
    val phone_timestamp: Long,
    val clock_delta_ms: Long,
    val face_confidence: Float,
    val embedding_hash: String,
    val totp_hash: String,       // SHA-256(raw totp)
    val hmac_signature: String,
    val nonce: String,
    val prev_block_hash: String  // local chain — backend will mirror when fix lands
)

// ─── Geofence Zone ───────────────────────────────────────────────────────────

data class GeofenceZone(
    val id: String,
    val geofence_id: String,
    val name: String,
    val center_lat: Double,
    val center_lng: Double,
    val radius_meters: Double
)

data class DeltaSyncResponse(
    val geofences: List<GeofenceZone>
)

// ─── Leave ───────────────────────────────────────────────────────────────────

data class LeaveRequest(
    val gate_id: String,
    val reason: String,
    val expected_return_ts: Long
)

data class LeaveRequestResponse(
    val leave_id: String,
    val status: String
)

data class LeaveStatusResponse(
    val status: String,
    val can_proceed: Boolean,
    val approved_by: String?
)

data class LeaveDocRequest(
    val approval_doc_b64: String
)

// ─── Time Sync ───────────────────────────────────────────────────────────────

data class TimeSyncResponse(
    val server_ts: Long
)

// ─── Reasons ─────────────────────────────────────────────────────────────────

enum class ExitReason(val display: String) {
    MARKET("Market"),
    HOME("Home"),
    MEDICAL("Medical"),
    ACADEMIC("Academic"),
    SPORTS("Sports"),
    OTHER("Other")
}

enum class SyncStatus {
    PENDING, SYNCED, FAILED, PENDING_APPROVAL, APPROVED
}
