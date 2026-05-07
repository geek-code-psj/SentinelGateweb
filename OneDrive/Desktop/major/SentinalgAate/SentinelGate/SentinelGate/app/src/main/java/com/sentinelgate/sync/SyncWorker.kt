package com.sentinelgate.sync

import android.content.Context
import android.util.Log
import androidx.work.*
import com.google.gson.Gson
import com.sentinelgate.api.ApiClient
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.db.SentinelDatabase
import com.sentinelgate.model.SyncStatus
import com.sentinelgate.sntp.SntpService
import java.util.concurrent.TimeUnit

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val db = SentinelDatabase.get(ctx)

        // 1. Sync clock
        SntpService.sync(ctx)

        // 2. Upload pending gate events
        val pending = db.gateEventDao().pendingSync()
        Log.d("SyncWorker", "Found ${pending.size} pending events")

        for (event in pending) {
            try {
                val payload = Gson().fromJson(
                    // Re-construct payload from stored event
                    buildPayloadJson(event), com.sentinelgate.model.EventPayload::class.java
                )
                val headers = CryptoService.sign(ctx, "POST", "/auth/event", payload)
                val response = ApiClient.api.postEvent(
                    deviceId = headers.deviceId,
                    sig      = headers.signature,
                    ts       = headers.timestamp,
                    nonce    = headers.nonce,
                    body     = payload
                )
                if (response.isSuccessful) {
                    db.gateEventDao().updateSyncStatus(event.event_id, SyncStatus.SYNCED.name, System.currentTimeMillis())
                    Log.d("SyncWorker", "Synced event ${event.event_id}")
                } else if (response.code() == 409) {
                    // Replay detected — mark synced to avoid infinite retry
                    db.gateEventDao().updateSyncStatus(event.event_id, SyncStatus.SYNCED.name, System.currentTimeMillis())
                    Log.w("SyncWorker", "Replay 409 for ${event.event_id} — marked synced")
                } else {
                    db.gateEventDao().incrementRetry(event.event_id)
                    Log.w("SyncWorker", "Failed ${event.event_id}: ${response.code()}")
                }
            } catch (e: Exception) {
                db.gateEventDao().incrementRetry(event.event_id)
                Log.e("SyncWorker", "Exception syncing ${event.event_id}: ${e.message}")
            }
        }

        // 3. Upload unsynced spoof logs
        val spoofs = db.spoofDao().unsynced()
        for (spoof in spoofs) {
            try {
                val body = mapOf(
                    "attempt_id"     to spoof.attempt_id,
                    "student_id"     to spoof.student_id,
                    "gate_id"        to spoof.gate_id,
                    "failed_step"    to spoof.failed_step,
                    "failure_reason" to spoof.failure_reason,
                    "timestamp"      to spoof.timestamp.toString()
                )
                val headers = CryptoService.sign(ctx, "POST", "/sync/spoof", body)
                val response = ApiClient.api.postSpoof(headers.deviceId, headers.signature, headers.timestamp, headers.nonce, body)
                if (response.isSuccessful) db.spoofDao().markSynced(spoof.attempt_id)
            } catch (e: Exception) {
                Log.e("SyncWorker", "Spoof sync failed: ${e.message}")
            }
        }

        // 4. Refresh geofence zones
        try {
            val headers = CryptoService.sign(ctx, "GET", "/sync/delta", emptyMap<String, String>())
            val response = ApiClient.api.getDelta(headers.deviceId, headers.signature, headers.timestamp, headers.nonce)
            if (response.isSuccessful) {
                val zones = response.body()?.geofences ?: emptyList()
                val entities = zones.map {
                    com.sentinelgate.db.GeofenceZoneEntity(
                        zone_id        = it.id,
                        gate_id        = it.geofence_id,
                        gate_name      = it.name,
                        center_lat     = it.center_lat,
                        center_lng     = it.center_lng,
                        radius_meters  = it.radius_meters,
                        updated_at     = System.currentTimeMillis()
                    )
                }
                db.geofenceDao().insertAll(entities)
                Log.d("SyncWorker", "Geofences refreshed: ${entities.size}")
            }
        } catch (e: Exception) {
            Log.e("SyncWorker", "Geofence refresh failed: ${e.message}")
        }

        return Result.success()
    }

    private fun buildPayloadJson(event: com.sentinelgate.db.GateEventEntity): String {
        // Re-assemble payload map from stored event for re-signing
        val map = mapOf(
            "event_id"            to event.event_id,
            "student_id"          to event.student_id,
            "status"              to event.status,
            "reason"              to event.reason,
            "gate_id"             to event.gate_id,
            "geofence_id"         to event.geofence_id,
            "gps_lat"             to event.gps_lat,
            "gps_lng"             to event.gps_lng,
            "gps_accuracy"        to event.gps_accuracy,
            "true_timestamp"      to event.true_timestamp,
            "phone_timestamp"     to event.phone_timestamp,
            "clock_delta_ms"      to event.clock_delta_ms,
            "face_confidence"     to event.face_confidence,
            "embedding_hash"      to event.embedding_hash,
            "totp_hash"           to event.totp_hash,
            "hmac_signature"      to event.hmac_signature,
            "nonce"               to event.nonce
        )
        return Gson().toJson(map)
    }

    companion object {
        fun schedule(ctx: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                "sentinel_sync",
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }

        // Immediate one-shot sync (called right after writing each event)
        fun syncNow(ctx: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueue(request)
        }
    }
}
