package com.sentinelgate.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [GateEventEntity::class, BlockEntity::class, GeofenceZoneEntity::class, SpoofAttemptEntity::class],
    version = 1,
    exportSchema = false
)
abstract class SentinelDatabase : RoomDatabase() {

    abstract fun gateEventDao(): GateEventDao
    abstract fun blockDao(): BlockDao
    abstract fun geofenceDao(): GeofenceDao
    abstract fun spoofDao(): SpoofDao

    companion object {
        @Volatile private var INSTANCE: SentinelDatabase? = null

        fun get(context: Context): SentinelDatabase =
            INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(context.applicationContext, SentinelDatabase::class.java, "sentinel.db")
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { INSTANCE = it }
            }
    }
}
