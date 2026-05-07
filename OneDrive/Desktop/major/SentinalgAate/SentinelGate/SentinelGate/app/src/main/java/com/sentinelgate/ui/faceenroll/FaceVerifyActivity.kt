package com.sentinelgate.ui.faceenroll

import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.sentinelgate.R
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.face.FaceService
import com.sentinelgate.ui.home.HomeActivity
import kotlinx.coroutines.launch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class FaceVerifyActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var btnCapture: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvGuide: TextView
    private lateinit var progress: ProgressBar
    private lateinit var cameraExecutor: ExecutorService
    private var imageCapture: ImageCapture? = null

    // "enroll" = save baseline, "verify" = match against stored
    private var mode: String = "verify"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_face)

        mode = intent.getStringExtra("mode") ?: "verify"
        previewView = findViewById(R.id.previewView)
        btnCapture  = findViewById(R.id.btnCapture)
        tvStatus    = findViewById(R.id.tvStatus)
        tvGuide     = findViewById(R.id.tvGuide)
        progress    = findViewById(R.id.progressBar)

        tvGuide.text = if (mode == "enroll")
            "Position your face in the oval and tap Capture"
        else
            "Look at the camera and tap Verify"

        cameraExecutor = Executors.newSingleThreadExecutor()
        startCamera()

        btnCapture.setOnClickListener { captureAndProcess() }
    }

    private fun startCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            val provider = providerFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            imageCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()
            try {
                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, imageCapture)
            } catch (e: Exception) {
                tvStatus.text = "Camera error: ${e.message}"
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun captureAndProcess() {
        val ic = imageCapture ?: return
        btnCapture.isEnabled = false
        progress.visibility = View.VISIBLE
        tvStatus.text = "Analysing…"

        ic.takePicture(ContextCompat.getMainExecutor(this), object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val bitmap = image.toBitmap()
                image.close()
                lifecycleScope.launch { processFrame(bitmap) }
            }
            override fun onError(e: ImageCaptureException) {
                tvStatus.text = "Capture failed: ${e.message}"
                btnCapture.isEnabled = true
                progress.visibility = View.GONE
            }
        })
    }

    private suspend fun processFrame(bitmap: Bitmap) {
        when (val result = FaceService.process(bitmap)) {
            is FaceService.FaceResult.Failure -> {
                tvStatus.text = "❌ ${result.reason}"
                btnCapture.isEnabled = true
                progress.visibility = View.GONE
            }
            is FaceService.FaceResult.Success -> {
                when (mode) {
                    "enroll" -> {
                        CryptoService.saveFaceTemplate(this, result.template)
                        tvStatus.text = "✅ Face enrolled successfully"
                        goHome()
                    }
                    "verify" -> {
                        val stored = CryptoService.getFaceTemplate(this)
                        if (stored == null) {
                            tvStatus.text = "No face enrolled. Please re-enroll."
                            btnCapture.isEnabled = true
                            progress.visibility = View.GONE
                            return
                        }
                        val match = FaceService.match(stored, result.template)
                        if (match.matched) {
                            tvStatus.text = "✅ Verified (confidence ${String.format("%.0f", match.confidence * 100)}%)"
                            if (mode == "result") {
                                // Return confidence to caller (CheckoutActivity / CheckinActivity)
                                setResult(RESULT_OK, android.content.Intent().putExtra("confidence", match.confidence))
                                android.os.Handler(mainLooper).postDelayed({ finish() }, 600)
                            } else {
                                goHome()
                            }
                        } else {
                            tvStatus.text = "❌ Face not recognised (dist ${String.format("%.3f", match.distance)}). Try again."
                            btnCapture.isEnabled = true
                            progress.visibility = View.GONE
                        }
                    }
                }
            }
        }
    }

    private fun goHome() {
        android.os.Handler(mainLooper).postDelayed({
            startActivity(Intent(this, HomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }, 800)
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }
}
