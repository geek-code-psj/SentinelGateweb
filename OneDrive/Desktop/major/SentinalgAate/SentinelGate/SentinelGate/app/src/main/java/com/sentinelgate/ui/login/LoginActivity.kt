package com.sentinelgate.ui.login

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.sentinelgate.R
import com.sentinelgate.api.ApiClient
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.model.EnrollRequest
import com.sentinelgate.ui.faceenroll.FaceVerifyActivity
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val etRoll   = findViewById<EditText>(R.id.etRollNumber)
        val etName   = findViewById<EditText>(R.id.etName)
        val etDept   = findViewById<EditText>(R.id.etDepartment)
        val btnEnroll = findViewById<Button>(R.id.btnEnroll)
        val progress = findViewById<ProgressBar>(R.id.progressBar)
        val tvError  = findViewById<TextView>(R.id.tvError)

        btnEnroll.setOnClickListener {
            val roll = etRoll.text.toString().trim()
            val name = etName.text.toString().trim()
            val dept = etDept.text.toString().trim()

            if (roll.isEmpty() || name.isEmpty() || dept.isEmpty()) {
                tvError.text = "All fields required"
                tvError.visibility = View.VISIBLE
                return@setOnClickListener
            }

            progress.visibility = View.VISIBLE
            btnEnroll.isEnabled = false
            tvError.visibility = View.GONE

            lifecycleScope.launch {
                try {
                    val deviceFingerprint = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                    val body = EnrollRequest(
                        roll_number        = roll,
                        name               = name,
                        department         = dept,
                        device_fingerprint = deviceFingerprint,
                        model              = "${Build.MANUFACTURER} ${Build.MODEL}"
                    )
                    val response = ApiClient.api.enroll(body)
                    if (response.isSuccessful) {
                        val result = response.body()!!
                        CryptoService.saveEnrollment(
                            ctx        = this@LoginActivity,
                            hmacSecret = result.hmac_secret,
                            deviceId   = result.device_id,
                            rollNumber = roll,
                            name       = name,
                            dept       = dept
                        )
                        // Go to face enrollment
                        startActivity(Intent(this@LoginActivity, FaceVerifyActivity::class.java)
                            .putExtra("mode", "enroll"))
                        finish()
                    } else {
                        tvError.text = "Enrollment failed (${response.code()}). Check server."
                        tvError.visibility = View.VISIBLE
                    }
                } catch (e: Exception) {
                    tvError.text = "Network error: ${e.message}"
                    tvError.visibility = View.VISIBLE
                } finally {
                    progress.visibility = View.GONE
                    btnEnroll.isEnabled = true
                }
            }
        }
    }
}
