const cron = require('node-cron');
const { pool } = require('../db');

/**
 * ══════════════════════════════════════════════════════════════
 * CRON JOB 1: CURFEW AUDIT — fires at 22:00 every night
 *
 * Revocable Privacy Model:
 *  - During the day: auth logs contain only user_id (UUID) and roll_number
 *  - At 22:00: this cron DECRYPTS names for students still OUT
 *  - At 23:59: nightly re-anonymization cron re-nulls names
 * ══════════════════════════════════════════════════════════════
 */
function startCurfewAuditCron() {
  cron.schedule('0 22 * * *', async () => {
    console.log('[CRON] Curfew audit starting at 22:00...');
    try {
      // Find all students currently OUT
      const outStudents = await pool.query(
        `SELECT p.user_id, p.last_gate_id, p.updated_at,
                u.roll_number, u.full_name, u.hostel_block, u.room_number
         FROM sentinel.student_presence p
         JOIN sentinel.users u ON u.id = p.user_id
         WHERE p.current_status = 'OUT'
           AND u.role = 'student'`
      );

      if (outStudents.rowCount === 0) {
        console.log('[CRON] Curfew: No violations tonight.');
        return;
      }

      console.log(`[CRON] Curfew: ${outStudents.rowCount} student(s) OUT at 22:00`);

      // Bulk insert violations
      for (const student of outStudents.rows) {
        const curfewTime = new Date();
        curfewTime.setHours(22, 0, 0, 0);
        const minutesLate = Math.floor((Date.now() - curfewTime.getTime()) / 60000);

        await pool.query(
          `INSERT INTO sentinel.curfew_violations (
             user_id, student_roll, student_name, violation_date,
             last_seen_gate, last_seen_at, minutes_late, status
           ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 'UNRESOLVED')
           ON CONFLICT DO NOTHING`,
          [
            student.user_id,
            student.roll_number,
            student.full_name,   // Name revealed ONLY during audit window
            student.last_gate_id,
            student.updated_at,
            Math.max(0, minutesLate),
          ]
        );
      }

      // Optionally push to anomaly_events for admin dashboard alert
      await pool.query(
        `INSERT INTO sentinel.anomaly_events
           (user_id, model, anomaly_type, score, severity, details)
         SELECT
           p.user_id,
           'combined',
           'CURFEW_VIOLATION',
           0.80,
           'high',
           jsonb_build_object(
             'roll_number', u.roll_number,
             'last_gate', p.last_gate_id,
             'curfew_time', '22:00'
           )
         FROM sentinel.student_presence p
         JOIN sentinel.users u ON u.id = p.user_id
         WHERE p.current_status = 'OUT' AND u.role = 'student'`
      );

      console.log(`[CRON] Curfew: Violations logged and anomaly alerts written.`);
    } catch (err) {
      console.error('[CRON] Curfew audit failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[CRON] Curfew audit scheduled: 22:00 IST daily');
}

/**
 * ══════════════════════════════════════════════════════════════
 * CRON JOB 2: NIGHTLY RE-ANONYMIZATION — fires at 23:59
 *
 * Privacy model: warden decryption window is 22:00–23:59 only.
 * After midnight, student names are nulled in curfew_violations.
 * ══════════════════════════════════════════════════════════════
 */
function startReanonymizationCron() {
  cron.schedule('59 23 * * *', async () => {
    console.log('[CRON] Nightly re-anonymization starting...');
    try {
      // Null out names in curfew violations (warden can still see roll numbers)
      const result = await pool.query(
        `UPDATE sentinel.curfew_violations
         SET student_name = NULL
         WHERE violation_date = CURRENT_DATE`
      );
      console.log(`[CRON] Re-anonymized ${result.rowCount} curfew records.`);
    } catch (err) {
      console.error('[CRON] Re-anonymization failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[CRON] Re-anonymization scheduled: 23:59 IST daily');
}

/**
 * ══════════════════════════════════════════════════════════════
 * CRON JOB 3: GATE TELEMETRY SNAPSHOT — every 5 minutes
 *
 * Calculates ρ (utilization factor) for each gate using
 * actual auth events from the last 5 minutes.
 * ══════════════════════════════════════════════════════════════
 */
function startTelemetryCron() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const gates = await pool.query(`SELECT id, mu_capacity FROM sentinel.gates`);
      
      if (!gates || !gates.rows || gates.rows.length === 0) {
        console.log('[CRON] Telemetry: No gates found');
        return;
      }

      for (const gate of gates.rows) {
        // Count auth events in last 5 minutes = λ (per 5 min)
        const countResult = await pool.query(
          `SELECT COUNT(*) as count FROM sentinel.auth_events
           WHERE gate_id = $1 AND server_ts > NOW() - INTERVAL '5 minutes'`,
          [gate.id]
        );
        
        if (!countResult || !countResult.rows || !countResult.rows[0]) {
          console.warn(`[CRON] Telemetry: No count result for gate ${gate.id}`);
          continue;
        }
        
        const total5min = parseInt(countResult.rows[0].count || 0);
        const lambdaPerMin = total5min / 5;   // events per minute
        const mu = gate.mu_capacity || 12;    // service rate (persons/min per gate)
        const rho = mu > 0 ? Math.min(lambdaPerMin / mu, 0.999) : 0;

        await pool.query(
          `UPDATE sentinel.gates
           SET current_rho = $1, current_lambda = $2, updated_at = NOW()
           WHERE id = $3`,
          [rho.toFixed(3), Math.round(lambdaPerMin), gate.id]
        );
      }
    } catch (err) {
      console.error('[CRON] Telemetry snapshot failed:', err?.message || err || 'Unknown error');
    }
  });

  console.log('[CRON] Gate telemetry snapshot scheduled: every 5 min');
}

/**
 * ══════════════════════════════════════════════════════════════
 * CRON JOB 4: LAMBDA DECAY — every minute
 *
 * Gates that have had no recent auths should have their lambda
 * decay toward zero (prevents stale high-rho display)
 * ══════════════════════════════════════════════════════════════
 */
function startLambdaDecayCron() {
  cron.schedule('* * * * *', async () => {
    try {
      await pool.query(
        `UPDATE sentinel.gates
         SET current_lambda = GREATEST(0, current_lambda - 1),
             current_rho = GREATEST(0, current_rho - 0.05),
             updated_at = NOW()
         WHERE updated_at < NOW() - INTERVAL '2 minutes'`
      );
    } catch (err) {
      // Non-critical — silently fail
    }
  });
}

/**
 * ══════════════════════════════════════════════════════════════
 * CRON JOB 5: ML OUTBOX PROCESSOR — every 10 seconds
 *
 * Checks sync_outbox for PENDING rows and pings FastAPI ML worker.
 * ══════════════════════════════════════════════════════════════
 */
function startMLOutboxCron() {
  // Using setInterval instead of cron for sub-minute frequency
  setInterval(async () => {
    try {
      const pending = await pool.query(
        `SELECT id, raw_payload FROM sentinel.sync_outbox
         WHERE status = 'PENDING'
         ORDER BY received_at ASC
         LIMIT 20`
      );
      if (pending.rowCount === 0) return;

      const ids = pending.rows.map(r => r.id);

      // Mark as PROCESSING
      await pool.query(
        `UPDATE sentinel.sync_outbox SET status = 'PROCESSING' WHERE id = ANY($1)`,
        [ids]
      );

      // Notify ML worker (fire and forget — ML worker polls PG anyway)
      const mlUrl = process.env.ML_WORKER_URL || 'http://localhost:8000';
      const eventIds = pending.rows.map(r => r.raw_payload?.event_id).filter(Boolean);

      if (eventIds.length > 0) {
        fetch(`${mlUrl}/score-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_ids: eventIds }),
          signal: AbortSignal.timeout(5000),
        }).then(async (r) => {
          if (r.ok) {
            await pool.query(
              `UPDATE sentinel.sync_outbox SET status = 'DONE', processed_at = NOW()
               WHERE id = ANY($1)`,
              [ids]
            );
          }
        }).catch((e) => {
          // ML worker down — mark failed so it retries
          pool.query(
            `UPDATE sentinel.sync_outbox SET status = 'PENDING', error_msg = $1
             WHERE id = ANY($2)`,
            [e.message, ids]
          ).catch(() => {});
        });
      } else {
        // No event IDs — mark done anyway
        await pool.query(
          `UPDATE sentinel.sync_outbox SET status = 'DONE', processed_at = NOW()
           WHERE id = ANY($1)`,
          [ids]
        );
      }
    } catch (err) {
      // Non-critical
    }
  }, 10000);

  console.log('[CRON] ML outbox processor running: every 10s');
}

/**
 * Start all cron jobs
 */
function startAllCrons() {
  startCurfewAuditCron();
  startReanonymizationCron();
  startTelemetryCron();
  startLambdaDecayCron();
  startMLOutboxCron();
  console.log('[CRON] All scheduled jobs active.');
}

module.exports = { startAllCrons };
