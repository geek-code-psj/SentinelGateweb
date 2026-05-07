package com.sentinelgate.ui.checkin

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.sentinelgate.R
import com.sentinelgate.block.BlockService
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.db.GateEventEntity
import com.sentinelgate.db.SentinelDatabase
import com.sentinelgate.db.SpoofAttemptEntity
import com.sentinelgate.geo.GeoService
import com.sentinelgate.model.GateQr
import com.sentinelgate.model.SyncStatus
import com.sentinelgate.sntp.SntpService
import com.sentinelgate.sync.SyncWorker
import com.sentinelgate.totp.TotpService
import com.sentinelgate.ui.home.HomeActivity
import kotlinx.coroutines.launch
import java.util.UUID

class CheckinActivity : AppCompatActivity() {

    private var parsedQr: GateQr? = null
    private var totpHash: String = ""
    private var faceConfidence: Float = 0f

    private lateinit var tvTitle: TextView
    private lateinit var tvStatus: TextView
    private lateinit var stepContainer: LinearLayout
    private lateinit var progress: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_checkout) // reuse same layout

        tvTitle       = findViewById(R.id.tvTitle)
        tvStatus      = findViewById(R.id.tvStatus)
        stepContainer = findViewById(R.id.stepContainer)
        progress      = findViewById(R.id.progressBar)

        showStep1()
    }

    // ─── STEP 1: QR Scan ─────────────────────────────────────────────────────

    private fun showStep1() {
        tvTitle.text = "Return — Step 1 of 2 — Scan Gate QR"
        stepContainer.removeAllViews()

        val btnScan = Button(this).apply { text = "Scan Gate QR" }
        btnScan.setOnClickListener {
            qrLauncher.launch(ScanOptions().apply {
                setPrompt("Scan SentinelGate QR")
                setBeepEnabled(false)
                setOrientationLocked(true)
            })
        }
        stepContainer.addView(btnScan)
    }

    private val qrLauncher = registerForActivityResult(ScanContract()) { result ->
        val raw = result.contents ?: run { tvStatus.text = "Scan cancelled"; return@registerForActivityResult }
        when (val qrResult = TotpService.parseAndValidate(raw)) {
            is TotpService.QrResult.Invalid -> tvStatus.text = "❌ ${qrResult.reason}"
            is TotpService.QrResult.Expired -> tvStatus.text = "❌ QR expired — wait for rotation"
            is TotpService.QrResult.Valid   -> {
                parsedQr = qrResult.qr
                totpHash = qrResult.totpHash
                tvStatus.text = "✅ Gate: ${qrResult.qr.gateId}"
                showStep2()
            }
        }
    }

    // ─── STEP 2: Face Check ──────────────────────────────────────────────────

    private fun showStep2() {
        tvTitle.text = "Return — Step 2 of 2 — Face Verification"
        stepContainer.removeAllViews()

        val btnFace = Button(this).apply { text = "Start Face Check" }
        btnFace.setOnClickListener {
            faceLauncher.launch(
                Intent(this, com.sentinelgate.ui.faceenroll.FaceVerifyActivity::class.java)
                    .putExtra("mode", "result")
            )
        }
        stepContainer.addView(btnFace)
    }

    private val faceLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            faceConfidence = result.data?.getFloatExtra("confidence", 0f) ?: 0f
            tvStatus.text = "✅ Face verified"
            finaliseCheckin()
        } else {
            tvStatus.text = "❌ Face check failed — try again"
        }
    }

    // ─── Finalise: GPS + sign + block + send ─────────────────────────────────

    private fun finaliseCheckin() {
        progress.visibility = View.VISIBLE
        tvStatus.text = "Checking location…"

        lifecycleScope.launch {
            val qr = parsedQr ?: return@launch

            when (val geo = GeoService.checkGeofence(this@CheckinActivity, qr.gateId)) {
                is GeoService.GeoResult.Fail -> {
                    logSpoofAttempt("GPS", geo.reason, geo.lat, geo.lng)
                    tvStatus.text = "❌ Location: ${geo.reason}"
                    progress.visibility = View.GONE
                }
                is GeoService.GeoResult.Pass -> buildAndSend(qr, geo.lat, geo.lng, geo.accuracy)
            }
        }
    }

    private suspend fun buildAndSend(qr: GateQr, lat: Double, lng: Double, accuracy: Float) {
        val ctx = this
        val db = SentinelDatabase.get(ctx)
        val now = SntpService.correctedNowMs()
        val eventId = UUID.randomUUID().toString()

        val payloadForSigning = mapOf(
            "event_id" to eventId, "student_id" to CryptoService.getRollNumber(ctx),
            "status" to "IN", "gate_id" to qr.gateId,
            "gps_lat" to lat, "gps_lng" to lng,
            "true_timestamp" to now, "face_confidence" to faceConfidence,
            "totp_hash" to totpHash
        )
        val signHeaders = CryptoService.sign(ctx, "POST", "/auth/event", payloadForSigning)

        val entity = GateEventEntity(
            event_id            = eventId,
            student_id          = CryptoService.getRollNumber(ctx),
            status              = "IN",
            reason              = "RETURN",
            expected_return_iso = null,
            expected_duration_ms = null,
            requires_approval   = false,
            gps_lat             = lat,
            gps_lng             = lng,
            gps_accuracy        = accuracy,
            gate_id             = qr.gateId,
            geofence_id         = qr.geofenceId,
            true_timestamp      = now,
            phone_timestamp     = System.currentTimeMillis(),
            clock_delta_ms      = now - System.currentTimeMillis(),
            face_confidence     = faceConfidence,
            embedding_hash      = CryptoService.getEmbeddingHash(ctx),
            totp_hash           = totpHash,
            hmac_signature      = signHeaders.signature,
            nonce               = signHeaders.nonce,
            sync_status         = SyncStatus.PENDING.name
        )

        db.gateEventDao().insert(entity)
        BlockService.appendBlock(ctx, entity)
        SyncWorker.syncNow(ctx)

        tvStatus.text = "✅ ENTRY GRANTED"
        progress.visibility = View.GONE

        android.os.Handler(mainLooper).postDelayed({
            startActivity(Intent(ctx, HomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }, 1500)
    }

    private suspend fun logSpoofAttempt(step: String, reason: String, lat: Double?, lng: Double?) {
        SentinelDatabase.get(this).spoofDao().insert(SpoofAttemptEntity(
            attempt_id     = UUID.randomUUID().toString(),
            student_id     = CryptoService.getRollNumber(this),
            gate_id        = parsedQr?.gateId ?: "unknown",
            failed_step    = step,
            failure_reason = reason,
            gps_lat        = lat,
            gps_lng        = lng,
            face_score     = null,
            timestamp      = System.currentTimeMillis()
        ))
    }
}
