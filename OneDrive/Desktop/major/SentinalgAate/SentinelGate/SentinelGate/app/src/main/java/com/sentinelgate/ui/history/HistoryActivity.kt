package com.sentinelgate.ui.history

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.sentinelgate.R
import com.sentinelgate.block.BlockService
import com.sentinelgate.db.GateEventEntity
import com.sentinelgate.db.SentinelDatabase
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class HistoryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_history)

        val rv        = findViewById<RecyclerView>(R.id.rvHistory)
        val tvChain   = findViewById<TextView>(R.id.tvChainStatus)
        rv.layoutManager = LinearLayoutManager(this)

        val db = SentinelDatabase.get(this)
        db.gateEventDao().allEvents().observe(this) { events ->
            rv.adapter = EventAdapter(events)
        }

        // Show chain integrity status
        lifecycleScope.launch {
            val broken = BlockService.verifyChain(this@HistoryActivity)
            tvChain.text = if (broken == null) "⛓ Chain intact" else "⚠️ $broken"
            tvChain.setTextColor(if (broken == null) 0xFF00AA44.toInt() else 0xFFFF3300.toInt())
        }
    }

    inner class EventAdapter(private val items: List<GateEventEntity>) :
        RecyclerView.Adapter<EventAdapter.VH>() {

        inner class VH(view: View) : RecyclerView.ViewHolder(view) {
            val tvBadge  : TextView = view.findViewById(R.id.tvBadge)
            val tvGate   : TextView = view.findViewById(R.id.tvGate)
            val tvTime   : TextView = view.findViewById(R.id.tvTime)
            val tvReason : TextView = view.findViewById(R.id.tvReason)
            val tvSync   : TextView = view.findViewById(R.id.tvSync)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
            VH(LayoutInflater.from(parent.context).inflate(R.layout.item_event, parent, false))

        override fun getItemCount() = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val e = items[position]
            val fmt = SimpleDateFormat("dd MMM HH:mm", Locale.getDefault())
            holder.tvBadge.text  = if (e.status == "OUT") "OUT" else "IN"
            holder.tvBadge.setBackgroundColor(if (e.status == "OUT") 0xFFFF4444.toInt() else 0xFF00AA44.toInt())
            holder.tvGate.text   = e.gate_id
            holder.tvTime.text   = fmt.format(Date(e.true_timestamp))
            holder.tvReason.text = e.reason
            holder.tvSync.text   = when (e.sync_status) {
                "SYNCED"  -> "✅"
                "PENDING" -> "⏳"
                "FAILED"  -> "❌"
                else      -> e.sync_status
            }
        }
    }
}
