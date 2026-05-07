package com.sentinelgate.block

import android.content.Context
import android.util.Log
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.db.BlockEntity
import com.sentinelgate.db.GateEventEntity
import com.sentinelgate.db.SentinelDatabase

// Local chain — mirrors backend PostgreSQL chain.
// Backend's prev_event_hash field will be populated once the ~30-line fix is deployed.
// For demo: show this local chain as proof. When backend fix lands they'll match.

object BlockService {

    private const val GENESIS = "GENESIS"
    private const val TAG = "BlockService"

    // ─── Append new block for a gate event ───────────────────────────────────

    suspend fun appendBlock(ctx: Context, event: GateEventEntity): BlockEntity {
        val db = SentinelDatabase.get(ctx)
        val last = db.blockDao().lastBlock()
        val prevHash = last?.event_hash ?: GENESIS
        val index = (last?.block_index ?: -1) + 1

        val eventHash = CryptoService.blockPayloadHash(
            blockIndex = index,
            prevHash = prevHash,
            eventId = event.event_id,
            studentId = event.student_id,
            status = event.status,
            gateId = event.gate_id,
            timestamp = event.true_timestamp,
            faceConfidence = event.face_confidence
        )

        val block = BlockEntity(
            event_id        = event.event_id,
            block_index     = index,
            prev_hash       = prevHash,
            event_hash      = eventHash,
            student_id      = event.student_id,
            status          = event.status,
            gate_id         = event.gate_id,
            true_timestamp  = event.true_timestamp,
            face_confidence = event.face_confidence,
            gps_lat         = event.gps_lat,
            gps_lng         = event.gps_lng
        )

        db.blockDao().insert(block)
        Log.d(TAG, "Block $index appended. hash=${eventHash.take(12)}… prevHash=${prevHash.take(12)}…")
        return block
    }

    // ─── Verify full chain integrity ──────────────────────────────────────────
    // Returns null if valid, or description of first broken link

    suspend fun verifyChain(ctx: Context): String? {
        val db = SentinelDatabase.get(ctx)
        val blocks = mutableListOf<BlockEntity>()
        // collect from LiveData synchronously via raw query alternative
        // Using suspend DAO here for simplicity
        val allBlocks = db.blockDao().allBlocks().value ?: return "Chain empty or not loaded"

        var expectedPrevHash = GENESIS
        for (block in allBlocks.sortedBy { it.block_index }) {
            // 1. Check prev_hash linkage
            if (block.prev_hash != expectedPrevHash) {
                return "Chain broken at block ${block.block_index}: " +
                        "expected prevHash ${expectedPrevHash.take(12)}… " +
                        "got ${block.prev_hash.take(12)}…"
            }
            // 2. Recompute event_hash
            val recomputed = CryptoService.blockPayloadHash(
                blockIndex = block.block_index,
                prevHash = block.prev_hash,
                eventId = block.event_id,
                studentId = block.student_id,
                status = block.status,
                gateId = block.gate_id,
                timestamp = block.true_timestamp,
                faceConfidence = block.face_confidence
            )
            if (recomputed != block.event_hash) {
                return "Tampered block at index ${block.block_index}: hash mismatch"
            }
            expectedPrevHash = block.event_hash
        }
        return null // chain valid
    }
}
