package com.sentinelgate.crypto

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object CryptoService {

    private const val PREFS_FILE = "sentinel_secure"
    private const val KEY_HMAC_SECRET  = "hmac_secret"
    private const val KEY_DEVICE_ID    = "device_id"
    private const val KEY_ROLL_NUMBER  = "roll_number"
    private const val KEY_STUDENT_NAME = "student_name"
    private const val KEY_DEPARTMENT   = "department"
    private const val KEY_FACE_TEMPLATE = "face_template"
    private const val KEY_EMBEDDING_HASH = "embedding_hash"
    private const val KEY_IS_ENROLLED  = "is_enrolled"
    private const val KEY_CLOCK_DELTA  = "clock_delta_ms"

    private fun prefs(ctx: Context) = EncryptedSharedPreferences.create(
        ctx,
        PREFS_FILE,
        MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // ─── Storage ─────────────────────────────────────────────────────────────

    fun saveEnrollment(ctx: Context, hmacSecret: String, deviceId: String,
                       rollNumber: String, name: String, dept: String) {
        prefs(ctx).edit()
            .putString(KEY_HMAC_SECRET, hmacSecret)
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_ROLL_NUMBER, rollNumber)
            .putString(KEY_STUDENT_NAME, name)
            .putString(KEY_DEPARTMENT, dept)
            .putBoolean(KEY_IS_ENROLLED, true)
            .apply()
    }

    fun saveFaceTemplate(ctx: Context, template: FloatArray) {
        val csv = template.joinToString(",")
        val hash = sha256Hex(csv)
        prefs(ctx).edit()
            .putString(KEY_FACE_TEMPLATE, csv)
            .putString(KEY_EMBEDDING_HASH, hash)
            .apply()
    }

    fun saveClockDelta(ctx: Context, deltaMs: Long) {
        prefs(ctx).edit().putLong(KEY_CLOCK_DELTA, deltaMs).apply()
    }

    fun isEnrolled(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_IS_ENROLLED, false)
    fun getHmacSecret(ctx: Context): String = prefs(ctx).getString(KEY_HMAC_SECRET, "") ?: ""
    fun getDeviceId(ctx: Context): String = prefs(ctx).getString(KEY_DEVICE_ID, "") ?: ""
    fun getRollNumber(ctx: Context): String = prefs(ctx).getString(KEY_ROLL_NUMBER, "") ?: ""
    fun getStudentName(ctx: Context): String = prefs(ctx).getString(KEY_STUDENT_NAME, "") ?: ""
    fun getDepartment(ctx: Context): String = prefs(ctx).getString(KEY_DEPARTMENT, "") ?: ""
    fun getClockDelta(ctx: Context): Long = prefs(ctx).getLong(KEY_CLOCK_DELTA, 0L)
    fun getEmbeddingHash(ctx: Context): String = prefs(ctx).getString(KEY_EMBEDDING_HASH, "") ?: ""

    fun getFaceTemplate(ctx: Context): FloatArray? {
        val csv = prefs(ctx).getString(KEY_FACE_TEMPLATE, null) ?: return null
        return csv.split(",").map { it.toFloat() }.toFloatArray()
    }

    // ─── Corrected timestamp ─────────────────────────────────────────────────

    fun correctedNow(ctx: Context): Long = System.currentTimeMillis() + getClockDelta(ctx)

    // ─── HMAC Signing ────────────────────────────────────────────────────────
    // Canonical: METHOD\nPATH\nSHA256(body)\nTIMESTAMP\nNONCE
    // KEY = hmacSecret.toByteArray(UTF_8)  — NOT hex decoded

    data class SignedHeaders(
        val deviceId: String,
        val signature: String,
        val timestamp: String,
        val nonce: String
    )

    fun sign(ctx: Context, method: String, path: String, body: Any): SignedHeaders {
        val secret = getHmacSecret(ctx)
        val bodyJson = Gson().toJson(body)
        val bodyHash = sha256Hex(bodyJson)
        val timestamp = correctedNow(ctx).toString()
        val nonce = UUID.randomUUID().toString().replace("-", "")

        val canonical = "$method\n$path\n$bodyHash\n$timestamp\n$nonce"
        val signature = hmacSha256(secret, canonical)

        return SignedHeaders(
            deviceId  = getDeviceId(ctx),
            signature = signature,
            timestamp = timestamp,
            nonce     = nonce
        )
    }

    // ─── Hashing helpers ─────────────────────────────────────────────────────

    fun sha256Hex(input: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    fun sha256HexBytes(input: ByteArray): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(input)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun hmacSha256(secret: String, data: String): String {
        // KEY = UTF-8 bytes of the secret string — NOT hex decoded
        val keyBytes = secret.toByteArray(Charsets.UTF_8)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(keyBytes, "HmacSHA256"))
        val result = mac.doFinal(data.toByteArray(Charsets.UTF_8))
        return result.joinToString("") { "%02x".format(it) }
    }

    // ─── Block payload hash ───────────────────────────────────────────────────
    // Deterministic string from event fields for chaining

    fun blockPayloadHash(
        blockIndex: Int, prevHash: String, eventId: String,
        studentId: String, status: String, gateId: String,
        timestamp: Long, faceConfidence: Float
    ): String {
        val payload = "$blockIndex|$prevHash|$eventId|$studentId|$status|$gateId|$timestamp|$faceConfidence"
        return sha256Hex(payload)
    }

    fun generateNonce(): String = UUID.randomUUID().toString().replace("-", "")
}
