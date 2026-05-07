package com.sentinelgate.face

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import kotlin.math.sqrt

object FaceService {

    // Thresholds
    private const val EYE_OPEN_PROB    = 0.4f
    private const val MAX_YAW_DEGREES  = 25f
    private const val MAX_PITCH_DEGREES = 20f
    private const val MATCH_THRESHOLD  = 0.12f   // Euclidean distance ≤ 0.12 = match

    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .setMinFaceSize(0.15f)
            .build()
    )

    sealed class FaceResult {
        data class Success(val template: FloatArray, val livenessScore: Float) : FaceResult()
        data class Failure(val reason: String) : FaceResult()
    }

    // ─── Detect + validate + extract template ────────────────────────────────

    suspend fun process(bitmap: Bitmap): FaceResult = suspendCoroutine { cont ->
        val image = InputImage.fromBitmap(bitmap, 0)
        detector.process(image)
            .addOnSuccessListener { faces ->
                when {
                    faces.isEmpty()  -> cont.resume(FaceResult.Failure("No face detected"))
                    faces.size > 1   -> cont.resume(FaceResult.Failure("Multiple faces detected"))
                    else -> {
                        val face = faces[0]
                        val check = validate(face)
                        if (check != null) {
                            cont.resume(FaceResult.Failure(check))
                        } else {
                            val template = extractTemplate(face, bitmap.width, bitmap.height)
                            val liveness = livenessScore(face)
                            cont.resume(FaceResult.Success(template, liveness))
                        }
                    }
                }
            }
            .addOnFailureListener { cont.resumeWithException(it) }
    }

    // ─── Validate liveness conditions ────────────────────────────────────────

    private fun validate(face: Face): String? {
        val leftEye  = face.leftEyeOpenProbability  ?: 0f
        val rightEye = face.rightEyeOpenProbability ?: 0f
        if (leftEye < EYE_OPEN_PROB || rightEye < EYE_OPEN_PROB)
            return "Please open both eyes"
        if (Math.abs(face.headEulerAngleY) > MAX_YAW_DEGREES)
            return "Face the camera straight"
        if (Math.abs(face.headEulerAngleX) > MAX_PITCH_DEGREES)
            return "Hold your head level"
        return null
    }

    // ─── Extract 7 landmarks, normalise by image dimensions ──────────────────
    // Order: LEFT_EYE, RIGHT_EYE, NOSE_BASE, LEFT_MOUTH, RIGHT_MOUTH, LEFT_CHEEK, RIGHT_CHEEK
    // Output: flat FloatArray of 14 values [x0,y0, x1,y1, ...]

    private fun extractTemplate(face: Face, imgW: Int, imgH: Int): FloatArray {
        val landmarkTypes = listOf(
            FaceLandmark.LEFT_EYE,
            FaceLandmark.RIGHT_EYE,
            FaceLandmark.NOSE_BASE,
            FaceLandmark.LEFT_MOUTH,
            FaceLandmark.RIGHT_MOUTH,
            FaceLandmark.LEFT_CHEEK,
            FaceLandmark.RIGHT_CHEEK
        )
        val result = FloatArray(14)
        var idx = 0
        for (type in landmarkTypes) {
            val lm = face.getLandmark(type)
            if (lm != null) {
                result[idx++] = lm.position.x / imgW.toFloat()
                result[idx++] = lm.position.y / imgH.toFloat()
            } else {
                // fallback: use bounding box centre so array always has 14 values
                result[idx++] = face.boundingBox.centerX() / imgW.toFloat()
                result[idx++] = face.boundingBox.centerY() / imgH.toFloat()
            }
        }
        return result
    }

    // ─── Liveness score (0–1) ─────────────────────────────────────────────────

    private fun livenessScore(face: Face): Float {
        val leftEye  = face.leftEyeOpenProbability  ?: 0.5f
        val rightEye = face.rightEyeOpenProbability ?: 0.5f
        val yawNorm  = 1f - (Math.abs(face.headEulerAngleY) / MAX_YAW_DEGREES).coerceIn(0f, 1f)
        val pitchNorm = 1f - (Math.abs(face.headEulerAngleX) / MAX_PITCH_DEGREES).coerceIn(0f, 1f)
        return ((leftEye + rightEye) / 2f * 0.5f + yawNorm * 0.25f + pitchNorm * 0.25f)
            .coerceIn(0f, 1f)
    }

    // ─── Match stored vs live template ───────────────────────────────────────
    // Returns (matched: Boolean, distance: Float, confidence: Float)

    data class MatchResult(val matched: Boolean, val distance: Float, val confidence: Float)

    fun match(stored: FloatArray, live: FloatArray): MatchResult {
        if (stored.size != live.size) return MatchResult(false, 1f, 0f)
        var sum = 0.0
        for (i in stored.indices) {
            val diff = (stored[i] - live[i]).toDouble()
            sum += diff * diff
        }
        val dist = sqrt(sum).toFloat()
        val matched = dist <= MATCH_THRESHOLD
        val confidence = (1f - dist).coerceIn(0f, 1f)
        return MatchResult(matched, dist, confidence)
    }
}
