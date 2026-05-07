package com.sentinelgate.sync

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import com.sentinelgate.api.ApiClient
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.model.LeaveDocRequest
import com.sentinelgate.model.LeaveRequest
import kotlinx.coroutines.delay
import java.io.ByteArrayOutputStream

object ApprovalService {

    private const val TAG = "ApprovalService"
    private const val POLL_INTERVAL_MS = 5_000L

    sealed class ApprovalResult {
        data class Approved(val approvedBy: String?) : ApprovalResult()
        data class Denied(val reason: String) : ApprovalResult()
        data class Error(val message: String) : ApprovalResult()
    }

    // ─── Step 1: Post leave request ──────────────────────────────────────────

    suspend fun requestLeave(ctx: Context, gateId: String, reason: String, expectedReturnTs: Long): String? {
        return try {
            val body = LeaveRequest(gate_id = gateId, reason = reason, expected_return_ts = expectedReturnTs)
            val headers = CryptoService.sign(ctx, "POST", "/leave/request", body)
            val response = ApiClient.api.leaveRequest(
                headers.deviceId, headers.signature, headers.timestamp, headers.nonce, body
            )
            if (response.isSuccessful) {
                response.body()?.leave_id.also { Log.d(TAG, "Leave request created: $it") }
            } else {
                Log.e(TAG, "Leave request failed: ${response.code()}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Leave request error: ${e.message}")
            null
        }
    }

    // ─── Step 2: Upload warden letter photo ──────────────────────────────────

    suspend fun uploadDoc(ctx: Context, leaveId: String, photo: Bitmap): Boolean {
        return try {
            val stream = ByteArrayOutputStream()
            photo.compress(Bitmap.CompressFormat.JPEG, 80, stream)
            val b64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
            val body = LeaveDocRequest(approval_doc_b64 = b64)
            val headers = CryptoService.sign(ctx, "POST", "/leave/upload-doc/$leaveId", body)
            val response = ApiClient.api.uploadDoc(
                headers.deviceId, headers.signature, headers.timestamp, headers.nonce, leaveId, body
            )
            response.isSuccessful.also { Log.d(TAG, "Doc upload: $it") }
        } catch (e: Exception) {
            Log.e(TAG, "Doc upload error: ${e.message}")
            false
        }
    }

    // ─── Step 3: Poll every 5 seconds until approved ─────────────────────────

    suspend fun pollUntilApproved(
        ctx: Context,
        leaveId: String,
        maxAttempts: Int = 120,  // 10 minutes max
        onStatusUpdate: (String) -> Unit = {}
    ): ApprovalResult {
        repeat(maxAttempts) { attempt ->
            try {
                val headers = CryptoService.sign(ctx, "GET", "/leave/status/$leaveId", emptyMap<String, String>())
                val response = ApiClient.api.leaveStatus(
                    headers.deviceId, headers.signature, headers.timestamp, headers.nonce, leaveId
                )
                if (response.isSuccessful) {
                    val status = response.body() ?: return ApprovalResult.Error("Empty response")
                    onStatusUpdate(status.status)
                    Log.d(TAG, "Poll $attempt: status=${status.status} can_proceed=${status.can_proceed}")
                    when {
                        status.can_proceed -> return ApprovalResult.Approved(status.approved_by)
                        status.status == "REJECTED" -> return ApprovalResult.Denied("Warden rejected the request")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Poll error: ${e.message}")
            }
            delay(POLL_INTERVAL_MS)
        }
        return ApprovalResult.Error("Approval timed out after ${maxAttempts * POLL_INTERVAL_MS / 1000}s")
    }
}
