package com.sentinelgate.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.sentinelgate.model.SyncStatus

// ─── Gate Events (Transactional Outbox + local record) ───────────────────────

@Entity(tableName = "gate_events")
data class GateEventEntity(
    @PrimaryKey val event_id: String,
    val student_id: String,
    val status: String,               // IN | OUT
    val reason: String,
    val expected_return_iso: String?,
    val expected_duration_ms: Long?,
    val requires_approval: Boolean,
    val gps_lat: Double,
    val gps_lng: Double,
    val gps_accuracy: Float,
    val gate_id: String,
    val geofence_id: String,
    val true_timestamp: Long,
    val phone_timestamp: Long,
    val clock_delta_ms: Long,
    val face_confidence: Float,
    val embedding_hash: String,
    val totp_hash: String,
    val hmac_signature: String,
    val nonce: String,
    val sync_status: String = SyncStatus.PENDING.name,
    val retry_count: Int = 0,
    val synced_at: Long? = null
)

// ─── Block Chain (local mirror of backend chain) ─────────────────────────────

@Entity(tableName = "block_chain")
data class BlockEntity(
    @PrimaryKey val event_id: String,
    val block_index: Int,
    val prev_hash: String,           // SHA-256 of previous block's full payload
    val event_hash: String,          // SHA-256 of this block's full payload
    val student_id: String,
    val status: String,
    val gate_id: String,
    val true_timestamp: Long,
    val face_confidence: Float,
    val gps_lat: Double,
    val gps_lng: Double
)

// ─── Geofence Zones ──────────────────────────────────────────────────────────

@Entity(tableName = "geofence_zones")
data class GeofenceZoneEntity(
    @PrimaryKey val zone_id: String,
    val gate_id: String,
    val gate_name: String,
    val center_lat: Double,
    val center_lng: Double,
    val radius_meters: Double,
    val updated_at: Long
)

// ─── Spoof Attempts (silent log) ─────────────────────────────────────────────

@Entity(tableName = "spoof_attempts")
data class SpoofAttemptEntity(
    @PrimaryKey val attempt_id: String,
    val student_id: String,
    val gate_id: String,
    val failed_step: String,         // GPS | FACE | TOTP
    val failure_reason: String,
    val gps_lat: Double?,
    val gps_lng: Double?,
    val face_score: Float?,
    val timestamp: Long,
    val synced: Boolean = false
)
