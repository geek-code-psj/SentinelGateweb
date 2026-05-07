package com.sentinelgate.sntp

import android.content.Context
import android.util.Log
import com.sentinelgate.api.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SntpService {

    private var deltaMs: Long = 0L
    private const val TAG = "SntpService"

    // Called on cold start + every 15 min by SyncService
    suspend fun sync(ctx: Context) = withContext(Dispatchers.IO) {
        val before = System.currentTimeMillis()
        try {
            val response = ApiClient.api.getTime()
            if (response.isSuccessful) {
                val serverTs = response.body()?.server_ts ?: return@withContext
                val after = System.currentTimeMillis()
                val rtt = after - before
                // Server time at midpoint of request
                deltaMs = serverTs - (before + rtt / 2)
                Log.d(TAG, "Clock synced. Delta: ${deltaMs}ms")
            } else {
                Log.w(TAG, "Time sync failed: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Time sync error: ${e.message}")
        }
    }

    fun correctedNowMs(): Long = System.currentTimeMillis() + deltaMs

    fun getDeltaMs(): Long = deltaMs

    fun setDelta(delta: Long) { deltaMs = delta }
}
