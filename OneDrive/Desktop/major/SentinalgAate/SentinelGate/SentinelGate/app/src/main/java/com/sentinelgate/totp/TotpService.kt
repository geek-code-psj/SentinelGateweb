package com.sentinelgate.totp

import android.net.Uri
import com.google.gson.JsonParser
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.model.GateQr
import com.sentinelgate.sntp.SntpService

object TotpService {

    sealed class QrResult {
        data class Valid(val qr: GateQr, val totpHash: String) : QrResult()
        data class Expired(val gateId: String) : QrResult()
        data class Invalid(val reason: String) : QrResult()
    }

    // ─── Parse QR string — try JSON → URI → pipe ─────────────────────────────

    fun parseAndValidate(raw: String): QrResult {
        val qr = tryJson(raw) ?: tryUri(raw) ?: tryPipe(raw)
            ?: return QrResult.Invalid("Unrecognised QR format")

        // Validate expiry using SNTP time
        val now = SntpService.correctedNowMs()
        val expiryMs = normaliseExpiry(qr.expiry)
        if (now > expiryMs) return QrResult.Expired(qr.gateId)

        // SHA-256 hash the raw TOTP before including in payload
        val totpHash = CryptoService.sha256Hex(qr.totpRaw)

        return QrResult.Valid(qr, totpHash)
    }

    // ─── Format 1: JSON object ────────────────────────────────────────────────
    // { "v":2, "g":"G-01", "geo":"HOSTEL_A", "t":"482913", "w":59200397, "mode":"FULL" }

    private fun tryJson(raw: String): GateQr? = try {
        val obj = JsonParser.parseString(raw.trim()).asJsonObject
        // Keys: g = gate_id, geo = geofence_id, t = totp, w = expiry
        val g   = obj.get("g")?.asString
            ?: obj.get("gate_id")?.asString    // also accept long-form
            ?: return null
        val geo = obj.get("geo")?.asString
            ?: obj.get("geofence_id")?.asString
            ?: ""
        val t   = obj.get("t")?.asString
            ?: obj.get("totp")?.asString
            ?: return null
        val w   = obj.get("w")?.asLong
            ?: obj.get("expiry")?.asLong
            ?: return null
        val mode = obj.get("mode")?.asString ?: "FULL"
        GateQr(gateId = g, geofenceId = geo, totpRaw = t, expiry = w, mode = mode)
    } catch (e: Exception) { null }

    // ─── Format 2: URI scheme ─────────────────────────────────────────────────
    // sentinelgate://gate?g=G-01&geo=HOSTEL_A&t=482913&w=59200397&mode=FULL

    private fun tryUri(raw: String): GateQr? = try {
        if (!raw.startsWith("sentinelgate://")) return null
        val uri = Uri.parse(raw)
        val g   = uri.getQueryParameter("g")
            ?: uri.getQueryParameter("gate_id")
            ?: return null
        val geo = uri.getQueryParameter("geo")
            ?: uri.getQueryParameter("geofence_id") ?: ""
        val t   = uri.getQueryParameter("t")
            ?: uri.getQueryParameter("totp")
            ?: return null
        val w   = uri.getQueryParameter("w")?.toLongOrNull()
            ?: uri.getQueryParameter("expiry")?.toLongOrNull()
            ?: return null
        val mode = uri.getQueryParameter("mode") ?: "FULL"
        GateQr(gateId = g, geofenceId = geo, totpRaw = t, expiry = w, mode = mode)
    } catch (e: Exception) { null }

    // ─── Format 3: Pipe-delimited ─────────────────────────────────────────────
    // G-01|HOSTEL_A|482913|59200397|FULL

    private fun tryPipe(raw: String): GateQr? = try {
        val parts = raw.trim().split("|")
        if (parts.size < 4) return null
        GateQr(
            gateId     = parts[0],
            geofenceId = parts[1],
            totpRaw    = parts[2],
            expiry     = parts[3].toLong(),
            mode       = if (parts.size >= 5) parts[4] else "FULL"
        )
    } catch (e: Exception) { null }

    // ─── Normalise expiry to Unix ms ──────────────────────────────────────────
    // Backend may send Unix seconds, Unix ms, or ISO string

    private fun normaliseExpiry(raw: Long): Long {
        // If value looks like Unix seconds (< year 3000 in seconds = 32503680000)
        return if (raw < 32_503_680_000L) raw * 1000L else raw
    }

    fun normaliseExpiryFromString(raw: String): Long {
        // Try ISO string
        return try {
            java.time.Instant.parse(raw).toEpochMilli()
        } catch (e: Exception) {
            raw.toLongOrNull()?.let { normaliseExpiry(it) } ?: 0L
        }
    }
}
