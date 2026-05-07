package com.sentinelgate.api

import com.sentinelgate.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

interface SentinelApi {

    // ─── No auth ──────────────────────────────────────────────────────────────
    @POST("auth/enroll")
    suspend fun enroll(@Body body: EnrollRequest): Response<EnrollResponse>

    @GET("sync/time")
    suspend fun getTime(): Response<TimeSyncResponse>

    // ─── HMAC auth — headers added by HmacInterceptor ────────────────────────
    @POST("auth/event")
    suspend fun postEvent(
        @Header("x-device-id")      deviceId: String,
        @Header("x-request-sig")    sig: String,
        @Header("x-request-ts")     ts: String,
        @Header("x-request-nonce")  nonce: String,
        @Body body: EventPayload
    ): Response<Unit>

    @GET("sync/delta")
    suspend fun getDelta(
        @Header("x-device-id")     deviceId: String,
        @Header("x-request-sig")   sig: String,
        @Header("x-request-ts")    ts: String,
        @Header("x-request-nonce") nonce: String
    ): Response<DeltaSyncResponse>

    @POST("sync/spoof")
    suspend fun postSpoof(
        @Header("x-device-id")     deviceId: String,
        @Header("x-request-sig")   sig: String,
        @Header("x-request-ts")    ts: String,
        @Header("x-request-nonce") nonce: String,
        @Body body: Map<String, String>
    ): Response<Unit>

    @POST("leave/request")
    suspend fun leaveRequest(
        @Header("x-device-id")     deviceId: String,
        @Header("x-request-sig")   sig: String,
        @Header("x-request-ts")    ts: String,
        @Header("x-request-nonce") nonce: String,
        @Body body: LeaveRequest
    ): Response<LeaveRequestResponse>

    @GET("leave/status/{id}")
    suspend fun leaveStatus(
        @Header("x-device-id")     deviceId: String,
        @Header("x-request-sig")   sig: String,
        @Header("x-request-ts")    ts: String,
        @Header("x-request-nonce") nonce: String,
        @Path("id") leaveId: String
    ): Response<LeaveStatusResponse>

    @POST("leave/upload-doc/{id}")
    suspend fun uploadDoc(
        @Header("x-device-id")     deviceId: String,
        @Header("x-request-sig")   sig: String,
        @Header("x-request-ts")    ts: String,
        @Header("x-request-nonce") nonce: String,
        @Path("id") leaveId: String,
        @Body body: LeaveDocRequest
    ): Response<Unit>
}

object ApiClient {
    private const val BASE_URL = "https://sentinelgateweb-production.up.railway.app/api/"

    val api: SentinelApi by lazy {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BODY }
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SentinelApi::class.java)
    }
}
