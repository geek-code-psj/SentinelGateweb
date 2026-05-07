package com.sentinelgate.ui.checkout

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.graphics.Bitmap
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
import com.sentinelgate.db.SpoofAttemptEntity
import com.sentinelgate.db.SentinelDatabase
import com.sentinelgate.face.FaceService
import com.sentinelgate.geo.GeoService
import com.sentinelgate.model.EventPayload
import com.sentinelgate.model.ExitReason
import com.sentinelgate.model.SyncStatus
import com.sentinelgate.sntp.SntpService
import com.sentinelgate.sync.ApprovalService
import com.sentinelgate.sync.SyncWorker
import com.sentinelgate.totp.TotpService
import com.sentinelgate.ui.home.HomeActivity
import kotlinx.coroutines.launch
import java.util.*

class CheckoutActivity : AppCompatActivity() {

    // State carried through steps
    private var selectedReason: String = ExitReason.MARKET.name
    private var returnTimeMs: Long = 0L
    private var requiresApproval = false
    private var parsedQr: com.sentinelgate.model.GateQr? = null
    private var totpHash: String = ""
    private var faceConfidence: Float = 0f
    private var leaveId: String? = null

    // Views
    private lateinit var stepContainer: LinearLayout
    private lateinit var tvTitle: TextView
    private lateinit var tvStatus: TextView
    private lateinit var progress: ProgressBar

    private var currentStep = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_checkout)

        stepContainer = findViewById(R.id.stepContainer)
        tvTitle       = findViewById(R.id.tvTitle)
        tvStatus      = findViewById(R.id.tvStatus)
        progress      = findViewById(R.id.progressBar)

        showStep1()
    }

    // ─── STEP 1: Reason + Return Time ────────────────────────────────────────

    private fun showStep1() {
        currentStep = 1
        tvTitle.text = "Step 1 of 4 — Reason & Return Time"
        stepContainer.removeAllViews()

        val spinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@CheckoutActivity,
                android.R.layout.simple_spinner_dropdown_item,
                ExitReason.values().map { it.display })
        }

        val tvReturnTime = TextView(this).apply { text = "Return time: not set" }
        val btnPickTime = Button(this).apply { text = "Pick Return Time" }
        val tvWarning = TextView(this).apply { visibility = View.GONE; setTextColor(0xFFFF6600.toInt()) }
        val btnNext = Button(this).apply { text = "Next →"; isEnabled = false }

        btnPickTime.setOnClickListener {
            val now = Calendar.getInstance()
            DatePickerDialog(this, { _, y, m, d ->
                TimePickerDialog(this, { _, h, min ->
                    val cal = Calendar.getInstance().apply { set(y, m, d, h, min, 0) }
                    returnTimeMs = cal.timeInMillis
                    val durationMs = returnTimeMs - SntpService.correctedNowMs()
                    requiresApproval = durationMs > 5 * 60 * 60 * 1000L
                    tvReturnTime.text = "Return: ${android.text.format.DateFormat.format("dd MMM, HH:mm", cal)}"
                    if (requiresApproval) {
                        tvWarning.text = "⚠️ Over 5 hours — warden approval required"
                        tvWarning.visibility = View.VISIBLE
                    } else {
                        tvWarning.visibility = View.GONE
                    }
                    btnNext.isEnabled = true
                }, now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE), true).show()
            }, now.get(Calendar.YEAR), now.get(Calendar.MONTH), now.get(Calendar.DAY_OF_MONTH)).show()
        }

        btnNext.setOnClickListener {
            selectedReason = ExitReason.values()[spinner.selectedItemPosition].name
            showStep2()
        }

        listOf(spinner, tvReturnTime, btnPickTime, tvWarning, btnNext).forEach { stepContainer.addView(it) }
    }

    // ─── STEP 2: QR Scan ─────────────────────────────────────────────────────

    private fun showStep2() {
        currentStep = 2
        tvTitle.text = "Step 2 of 4 — Scan Gate QR"
        stepContainer.removeAllViews()

        val tvInfo = TextView(this).apply { text = "Scan the QR code on the gate display." }
        val btnScan = Button(this).apply { text = "Scan QR" }

        btnScan.setOnClickListener {
            qrLauncher.launch(ScanOptions().apply {
                setPrompt("Scan SentinelGate QR")
                setBeepEnabled(false)
                setOrientationLocked(true)
            })
        }

        listOf(tvInfo, btnScan).forEach { stepContainer.addView(it) }
    }

    private val qrLauncher = registerForActivityResult(ScanContract()) { result ->
        val raw = result.contents ?: run {
            tvStatus.text = "QR scan cancelled"
            return@registerForActivityResult
        }
        when (val qrResult = TotpService.parseAndValidate(raw)) {
            is TotpService.QrResult.Invalid  -> tvStatus.text = "❌ ${qrResult.reason}"
            is TotpService.QrResult.Expired  -> tvStatus.text = "❌ QR expired — wait for rotation"
            is TotpService.QrResult.Valid    -> {
                parsedQr = qrResult.qr
                totpHash = qrResult.totpHash
                tvStatus.text = "✅ Gate: ${qrResult.qr.gateId}"
                showStep3()
            }
        }
    }

    // ─── STEP 3: Face Check ──────────────────────────────────────────────────

    private fun showStep3() {
        currentStep = 3
        tvTitle.text = "Step 3 of 4 — Face Verification"
        stepContainer.removeAllViews()

        // Reuse FaceVerifyActivity in result mode
        val tvInfo = TextView(this).apply { text = "Look at the camera for face verification." }
        val btnFace = Button(this).apply { text = "Start Face Check" }

        btnFace.setOnClickListener {
            faceLauncher.launch(Intent(this, com.sentinelgate.ui.faceenroll.FaceVerifyActivity::class.java)
                .putExtra("mode", "result"))
        }

        listOf(tvInfo, btnFace).forEach { stepContainer.addView(it) }
    }

    private val faceLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            faceConfidence = result.data?.getFloatExtra("confidence", 0f) ?: 0f
            tvStatus.text = "✅ Face verified (${String.format("%.0f", faceConfidence * 100)}%)"
            if (requiresApproval) showStep4Approval() else finaliseCheckout()
        } else {
            tvStatus.text = "❌ Face check failed — try again"
        }
    }

    // ─── STEP 4: Approval Wait (only if >5h) ─────────────────────────────────

    private fun showStep4Approval() {
        currentStep = 4
        tvTitle.text = "Step 4 of 4 — Waiting for Warden Approval"
        stepContainer.removeAllViews()

        val tvInfo = TextView(this).apply { text = "Requesting leave approval from warden…" }
        val progressApproval = ProgressBar(this)
        val tvApprovalStatus = TextView(this).apply { text = "Status: Pending" }

        listOf(tvInfo, progressApproval, tvApprovalStatus).forEach { stepContainer.addView(it) }

        lifecycleScope.launch {
            val qr = parsedQr ?: return@launch
            leaveId = ApprovalService.requestLeave(this@CheckoutActivity, qr.gateId, selectedReason, returnTimeMs)
            if (leaveId == null) {
                tvApprovalStatus.text = "❌ Failed to submit leave request"
                return@launch
            }
            // If backend returns PENDING_DOC, prompt for photo upload
            // For demo simplicity — skip doc upload unless backend explicitly requires it
            val approvalResult = ApprovalService.pollUntilApproved(
                ctx = this@CheckoutActivity,
                leaveId = leaveId!!,
                onStatusUpdate = { status -> tvApprovalStatus.text = "Status: $status" }
            )
            when (approvalResult) {
                is ApprovalService.ApprovalResult.Approved -> {
                    tvApprovalStatus.text = "✅ Approved by ${approvalResult.approvedBy ?: "warden"}"
                    finaliseCheckout()
                }
                is ApprovalService.ApprovalResult.Denied -> {
                    tvApprovalStatus.text = "❌ ${approvalResult.reason}"
                    progressApproval.visibility = View.GONE
                }
                is ApprovalService.ApprovalResult.Error -> {
                    tvApprovalStatus.text = "❌ ${approvalResult.message}"
                    progressApproval.visibility = View.GONE
                }
            }
        }
    }

    // ─── FINALISE: GPS check + sign + write block + send ─────────────────────

    private fun finaliseCheckout() {
        progress.visibility = View.VISIBLE
        tvStatus.text = "Checking location…"

        lifecycleScope.launch {
            val qr = parsedQr ?: return@launch

            // GPS check
            when (val geoResult = GeoService.checkGeofence(this@CheckoutActivity, qr.gateId)) {
                is GeoService.GeoResult.Fail -> {
                    // Log spoof attempt silently
                    logSpoofAttempt("GPS", geoResult.reason, geoResult.lat, geoResult.lng, null)
                    tvStatus.text = "❌ Location check failed: ${geoResult.reason}"
                    progress.visibility = View.GONE
                    return@launch
                }
                is GeoService.GeoResult.Pass -> {
                    tvStatus.text = "✅ Location verified"
                    buildAndSend(qr, geoResult.lat, geoResult.lng, geoResult.accuracy)
                }
            }
        }
    }

    private suspend fun buildAndSend(
        qr: com.sentinelgate.model.GateQr,
        gpsLat: Double, gpsLng: Double, gpsAccuracy: Float
    ) {
        val ctx = this
        val db = SentinelDatabase.get(ctx)
        val now = SntpService.correctedNowMs()
        val phoneNow = System.currentTimeMillis()
        val delta = now - phoneNow
        val eventId = UUID.randomUUID().toString()
        val nonce = CryptoService.generateNonce()

        // Build payload first (without signature) then sign
        val payloadForSigning = mapOf(
            "event_id" to eventId, "student_id" to CryptoService.getRollNumber(ctx),
            "status" to "OUT", "reason" to selectedReason,
            "gate_id" to qr.gateId, "geofence_id" to qr.geofenceId,
            "gps_lat" to gpsLat, "gps_lng" to gpsLng, "gps_accuracy" to gpsAccuracy,
            "true_timestamp" to now, "face_confidence" to faceConfidence,
            "totp_hash" to totpHash
        )
        val signHeaders = CryptoService.sign(ctx, "POST", "/auth/event", payloadForSigning)

        val entity = GateEventEntity(
            event_id            = eventId,
            student_id          = CryptoService.getRollNumber(ctx),
            status              = "OUT",
            reason              = selectedReason,
            expected_return_iso = Date(returnTimeMs).toString(),
            expected_duration_ms = returnTimeMs - now,
            requires_approval   = requiresApproval,
            gps_lat             = gpsLat,
            gps_lng             = gpsLng,
            gps_accuracy        = gpsAccuracy,
            gate_id             = qr.gateId,
            geofence_id         = qr.geofenceId,
            true_timestamp      = now,
            phone_timestamp     = phoneNow,
            clock_delta_ms      = delta,
            face_confidence     = faceConfidence,
            embedding_hash      = CryptoService.getEmbeddingHash(ctx),
            totp_hash           = totpHash,
            hmac_signature      = signHeaders.signature,
            nonce               = signHeaders.nonce,
            sync_status         = SyncStatus.PENDING.name
        )

        // 1. Write to local DB (offline-first)
        db.gateEventDao().insert(entity)

        // 2. Append block to local chain
        BlockService.appendBlock(ctx, entity)

        // 3. Trigger immediate sync
        SyncWorker.syncNow(ctx)

        tvStatus.text = "✅ EXIT GRANTED"
        progress.visibility = View.GONE

        android.os.Handler(mainLooper).postDelayed({
            startActivity(Intent(ctx, HomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }, 1500)
    }

    private suspend fun logSpoofAttempt(
        step: String, reason: String, lat: Double?, lng: Double?, faceScore: Float?
    ) {
        val db = SentinelDatabase.get(this)
        db.spoofDao().insert(SpoofAttemptEntity(
            attempt_id     = UUID.randomUUID().toString(),
            student_id     = CryptoService.getRollNumber(this),
            gate_id        = parsedQr?.gateId ?: "unknown",
            failed_step    = step,
            failure_reason = reason,
            gps_lat        = lat,
            gps_lng        = lng,
            face_score     = faceScore,
            timestamp      = System.currentTimeMillis()
        ))
    }
}
