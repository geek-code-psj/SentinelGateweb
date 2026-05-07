package com.sentinelgate.db

import androidx.lifecycle.LiveData
import androidx.room.*

@Dao
interface GateEventDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: GateEventEntity)

    @Query("SELECT * FROM gate_events ORDER BY true_timestamp DESC")
    fun allEvents(): LiveData<List<GateEventEntity>>

    @Query("SELECT * FROM gate_events WHERE sync_status IN ('PENDING','FAILED') AND retry_count < 5 ORDER BY true_timestamp ASC")
    suspend fun pendingSync(): List<GateEventEntity>

    @Query("UPDATE gate_events SET sync_status = :status, synced_at = :ts WHERE event_id = :id")
    suspend fun updateSyncStatus(id: String, status: String, ts: Long?)

    @Query("UPDATE gate_events SET retry_count = retry_count + 1, sync_status = 'FAILED' WHERE event_id = :id")
    suspend fun incrementRetry(id: String)

    @Query("SELECT * FROM gate_events ORDER BY true_timestamp DESC LIMIT 1")
    suspend fun lastEvent(): GateEventEntity?
}

@Dao
interface BlockDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(block: BlockEntity)

    @Query("SELECT * FROM block_chain ORDER BY block_index DESC LIMIT 1")
    suspend fun lastBlock(): BlockEntity?

    @Query("SELECT * FROM block_chain ORDER BY block_index ASC")
    fun allBlocks(): LiveData<List<BlockEntity>>

    @Query("SELECT COUNT(*) FROM block_chain")
    suspend fun count(): Int
}

@Dao
interface GeofenceDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(zones: List<GeofenceZoneEntity>)

    @Query("SELECT * FROM geofence_zones")
    suspend fun all(): List<GeofenceZoneEntity>

    @Query("SELECT * FROM geofence_zones WHERE gate_id = :gateId LIMIT 1")
    suspend fun forGate(gateId: String): GeofenceZoneEntity?

    @Query("SELECT COUNT(*) FROM geofence_zones")
    suspend fun count(): Int
}

@Dao
interface SpoofDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(attempt: SpoofAttemptEntity)

    @Query("SELECT * FROM spoof_attempts WHERE synced = 0")
    suspend fun unsynced(): List<SpoofAttemptEntity>

    @Query("UPDATE spoof_attempts SET synced = 1 WHERE attempt_id = :id")
    suspend fun markSynced(id: String)
}
