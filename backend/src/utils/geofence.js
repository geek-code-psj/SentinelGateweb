const { pool } = require('../db');

/**
 * Haversine formula — great-circle distance between two GPS points in meters.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Point-in-polygon using ray casting algorithm.
 * polygon: array of {lat, lng} objects (from geofence_zones.polygon_coords JSONB)
 */
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Verify submitted GPS coordinates against a geofence zone.
 *
 * Returns:
 *   { inFence: boolean, distanceMeters: number, method: string }
 *
 * Uses polygon if available (more precise), falls back to circle.
 */
async function verifyGeofence(geofenceId, lat, lng) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { inFence: false, distanceMeters: null, method: 'invalid_coords' };
  }

  const result = await pool.query(
    `SELECT center_lat, center_lng, radius_meters, polygon_coords
     FROM sentinel.geofence_zones
     WHERE id = $1 AND is_active = TRUE`,
    [geofenceId]
  );

  if (result.rowCount === 0) {
    return { inFence: false, distanceMeters: null, method: 'zone_not_found' };
  }

  const zone = result.rows[0];
  const distanceMeters = Math.round(
    haversineDistance(lat, lng, zone.center_lat, zone.center_lng)
  );

  // Try polygon first (more accurate)
  if (zone.polygon_coords && Array.isArray(zone.polygon_coords)) {
    const inPolygon = pointInPolygon(lat, lng, zone.polygon_coords);
    return { inFence: inPolygon, distanceMeters, method: 'polygon' };
  }

  // Fallback: circular geofence
  const inCircle = distanceMeters <= zone.radius_meters;
  return { inFence: inCircle, distanceMeters, method: 'circular' };
}

module.exports = { verifyGeofence, haversineDistance };
