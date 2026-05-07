package com.sentinelgate.ui.home

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.sentinelgate.R
import com.sentinelgate.api.ApiClient
import com.sentinelgate.crypto.CryptoService
import com.sentinelgate.db.SentinelDatabase
import com.sentinelgate.sync.SyncWorker
import com.sentinelgate.ui.checkout.CheckoutActivity
import com.sentinelgate.ui.checkin.CheckinActivity
import com.sentinelgate.ui.history.HistoryActivity
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_home)

        val tvRoll      = findViewById<TextView>(R.id.tvRollNumber)
        val tvStatus    = findViewById<TextView>(R.id.tvStatus)
        val tvPending   = findViewById<TextView>(R.id.tvPendingSync)
        val btnAction   = findViewById<Button>(R.id.btnAction)
        val btnHistory  = findViewById<Button>(R.id.btnHistory)

        tvRoll.text = CryptoService.getRollNumber(this)

        // Load last event to determine IN/OUT
        lifecycleScope.launch {
            val db = SentinelDatabase.get(this@HomeActivity)
            val last = db.gateEventDao().lastEvent()
            val isOut = last?.status == "OUT"

            tvStatus.text = if (isOut) "🔴 OUT" else "🟢 IN"
            btnAction.text = if (isOut) "ENTER GATE" else "EXIT GATE"
            btnAction.setOnClickListener {
                if (isOut) startActivity(Intent(this@HomeActivity, CheckinActivity::class.java))
                else startActivity(Intent(this@HomeActivity, CheckoutActivity::class.java))
            }

            // Pending sync count
            val pending = db.gateEventDao().pendingSync().size
            tvPendingSync?.text = if (pending > 0) "⏳ $pending pending sync" else "✅ Synced"

            // Download geofences if not present
            val zoneCount = db.geofenceDao().count()
            if (zoneCount == 0) {
                try {
                    val headers = CryptoService.sign(this@HomeActivity, "GET", "/sync/delta", emptyMap<String, String>())
                    val response = ApiClient.api.getDelta(headers.deviceId, headers.signature, headers.timestamp, headers.nonce)
                    if (response.isSuccessful) {
                        val zones = response.body()?.geofences ?: emptyList()
                        db.geofenceDao().insertAll(zones.map {
                            com.sentinelgate.db.GeofenceZoneEntity(
                                zone_id = it.id, gate_id = it.geofence_id,
                                gate_name = it.name, center_lat = it.center_lat,
                                center_lng = it.center_lng, radius_meters = it.radius_meters,
                                updated_at = System.currentTimeMillis()
                            )
                        })
                    }
                } catch (e: Exception) { /* silent — will retry on next sync */ }
            }
        }

        btnHistory.setOnClickListener {
            startActivity(Intent(this, HistoryActivity::class.java))
        }
    }
}
