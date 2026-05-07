package com.sentinelgate.geo

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.sentinelgate.db.GeofenceZoneEntity
import com.sentinelgate.db.SentinelDatabase
import kotlinx.coroutines.tasks.await
import kotlin.math.*

object GeoService {

    // Demo mode — keeps indoor GPS passing during demo
    var demoMode = true
    private const val DEMO_ACCURACY_TOLERANCE = 250f   // metres
    private const val DEMO_RADIUS_PADDING      = 35.0  // metres extra
    private const val LOCATION_TIMEOUT_MS      = 10_000L

    sealed class GeoResult {
        data class Pass(val lat: Double, val lng: Double, val accuracy: Float) : GeoResult()
        data class Fail(val reason: String, val lat: Double?, val lng: Double?) : GeoResult()
    }

    // ─── Check student is inside geofence for given gate ─────────────────────

    @SuppressLint("MissingPermission")
    suspend fun checkGeofence(ctx: Context, gateId: String): GeoResult {
        // 1. Get current location
        val client = LocationServices.getFusedLocationProviderClient(ctx)
        val location = try {
            client.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                null
            ).await()
        } catch (e: Exception) {
            Log.e("GeoService", "Location fetch failed: ${e.message}")
            return GeoResult.Fail("Could not get location", null, null)
        } ?: return GeoResult.Fail("Location unavailable", null, null)

        val lat = location.latitude
        val lng = location.longitude
        val accuracy = location.accuracy

        // 2. Demo mode accuracy check
        if (demoMode && accuracy > DEMO_ACCURACY_TOLERANCE) {
            // In demo, still allow with warning logged — don't fail on accuracy
            Log.w("GeoService", "Low accuracy $accuracy m — demo mode passing anyway")
        }

        // 3. Look up geofence zone
        val db = SentinelDatabase.get(ctx)
        val zone: GeofenceZoneEntity? = db.geofenceDao().forGate(gateId)
            ?: db.geofenceDao().all().firstOrNull() // fallback to any zone for demo

        if (zone == null) {
            Log.e("GeoService", "No geofence zone downloaded for gate $gateId")
            return GeoResult.Fail("Gate zone not downloaded. Open app on WiFi first.", lat, lng)
        }

        // 4. Haversine distance check
        val radius = if (demoMode) zone.radius_meters + DEMO_RADIUS_PADDING else zone.radius_meters
        val dist = haversine(lat, lng, zone.center_lat, zone.center_lng)

        return if (dist <= radius) {
            GeoResult.Pass(lat, lng, accuracy)
        } else {
            GeoResult.Fail("Outside campus perimeter (${dist.toInt()}m from centre, limit ${radius.toInt()}m)", lat, lng)
        }
    }

    // ─── Haversine formula — returns distance in metres ──────────────────────

    fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6_371_000.0 // Earth radius metres
        val φ1 = Math.toRadians(lat1)
        val φ2 = Math.toRadians(lat2)
        val Δφ = Math.toRadians(lat2 - lat1)
        val Δλ = Math.toRadians(lon2 - lon1)
        val a = sin(Δφ / 2).pow(2) + cos(φ1) * cos(φ2) * sin(Δλ / 2).pow(2)
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}
