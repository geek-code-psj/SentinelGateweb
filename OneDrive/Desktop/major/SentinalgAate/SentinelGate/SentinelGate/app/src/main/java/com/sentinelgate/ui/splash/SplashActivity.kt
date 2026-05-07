package com.sentinelgate.ui.splash

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.sntp.SntpService
import com.sentinelgate.sync.SyncWorker
import com.sentinelgate.ui.faceenroll.FaceVerifyActivity
import com.sentinelgate.ui.login.LoginActivity
import kotlinx.coroutines.launch

class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            // Sync clock before first HMAC call
            SntpService.sync(this@SplashActivity)

            if (CryptoService.isEnrolled(this@SplashActivity)) {
                // Schedule background sync
                SyncWorker.schedule(this@SplashActivity)
                startActivity(Intent(this@SplashActivity, FaceVerifyActivity::class.java)
                    .putExtra("mode", "verify"))
            } else {
                startActivity(Intent(this@SplashActivity, LoginActivity::class.java))
            }
            finish()
        }
    }
}
