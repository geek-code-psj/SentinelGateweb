#!/usr/bin/env node
/**
 * SentinelGate Bootstrap Script
 * Run ONCE after creating the database schema:
 *   node bootstrap.js
 *
 * This will:
 *  1. Seed default geofence zones and gates (if empty)
 *  2. Generate TOTP secrets for all gates in the DB
 *  3. Create default admin/warden/student users (change password immediately!)
 *  4. Print a summary of all gate secrets (store securely)
 */
require('dotenv').config();
const { pool } = require('./src/db');
const { generateGateSecret } = require('./src/utils/totp');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function bootstrap() {
  console.log('\n🔐 SentinelGate Bootstrap\n');

  // 0. Seed geofence zones if empty
  const zones = await pool.query(`SELECT id FROM sentinel.geofence_zones`);
  if (zones.rowCount === 0) {
    console.log('Seeding default geofence zones...');
    await pool.query(`
      INSERT INTO sentinel.geofence_zones (id, name, center_lat, center_lng, radius_meters, created_at)
      VALUES
        ('HOSTEL_A', 'Hostel A Block', 23.5204, 77.8038, 50, NOW()),
        ('HOSTEL_B', 'Hostel B Block', 23.5210, 77.8045, 50, NOW()),
        ('MAIN_GATE', 'Main Entrance', 23.5195, 77.8025, 50, NOW()),
        ('MARKET', 'Campus Market', 23.5220, 77.8050, 75, NOW())
    `);
    console.log('  Created 4 default geofence zones\n');
  } else {
    console.log(`Found ${zones.rowCount} geofence zones — skipping seed\n`);
  }

  // 0b. Seed gates if empty
  const gates = await pool.query(`SELECT id FROM sentinel.gates`);
  if (gates.rowCount === 0) {
    console.log('Seeding default gates...');
    await pool.query(`
      INSERT INTO sentinel.gates (id, name, geofence_id, mfa_mode, status, current_lambda, created_at)
      VALUES
        ('G-01', 'Hostel A Gate', 'HOSTEL_A', 'FULL', 'ACTIVE', 0, NOW()),
        ('G-02', 'Hostel B Gate', 'HOSTEL_B', 'FULL', 'ACTIVE', 0, NOW()),
        ('G-03', 'Main Gate', 'MAIN_GATE', 'FULL', 'ACTIVE', 0, NOW()),
        ('G-04', 'Market Gate', 'MARKET', 'TOTP_ONLY', 'ACTIVE', 0, NOW())
    `);
    console.log('  Created 4 default gates\n');
  } else {
    console.log(`Found ${gates.rowCount} gates — skipping seed\n`);
  }

  // 1. Generate/update gate TOTP secrets
  const gateList = await pool.query(`SELECT id, name, totp_secret_enc FROM sentinel.gates`);
  console.log(`Found ${gateList.rowCount} gates.\n`);

  for (const gate of gateList.rows) {
    if (gate.totp_secret_enc && gate.totp_secret_enc !== 'SEED_REPLACE_IN_BOOTSTRAP') {
      console.log(`  Gate ${gate.id} (${gate.name}): secret already set — skipping`);
      continue;
    }
    const secret = generateGateSecret();
    await pool.query(
      `UPDATE sentinel.gates SET totp_secret_enc = $1, updated_at = NOW() WHERE id = $2`,
      [secret, gate.id]
    );
    console.log(`  Gate ${gate.id} (${gate.name}): SECRET = ${secret}`);
    console.log(`    ⚠ Store this secret — it cannot be recovered from the DB without decryption key`);
  }

  // 2. Create default users (if not exists)
  const defaultUsers = [
    { roll: 'ADMIN-001', name: 'System Administrator', role: 'admin', password: 'admin123' },
    { roll: 'WAR-001', name: 'Warden Smith', role: 'warden', password: 'warden123' },
    { roll: 'STU-001', name: 'Test Student', role: 'student', block: 'A', room: '101', password: 'student123' },
  ];

  for (const u of defaultUsers) {
    const existing = await pool.query(
      `SELECT id FROM sentinel.users WHERE roll_number = $1`,
      [u.roll]
    );
    if (existing.rowCount === 0) {
      const passwordHash = u.password ? await bcrypt.hash(u.password, 10) : null;
      await pool.query(
        `INSERT INTO sentinel.users (roll_number, full_name, role, hostel_block, room_number, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.roll, u.name, u.role, u.block || null, u.room || null, passwordHash]
      );
      console.log(`  Created user: roll=${u.roll}, role=${u.role}, password=${u.password}`);
    } else {
      console.log(`  User ${u.roll} already exists — skipping`);
    }
  }

  console.log('\n✅ Bootstrap complete.\n');
  console.log('📝 DEFAULT CREDENTIALS:');
  console.log('   Admin:    ADMIN-001 / admin123');
  console.log('   Warden:   WAR-001 / warden123');
  console.log('   Student:  STU-001 / student123');
  console.log('\nNext steps:');
  console.log('  1. Save gate secrets to a password manager');
  console.log('  2. Change default passwords immediately in production!');
  console.log('  3. Run: node src/server.js');
  console.log('  4. Access admin dashboard at http://localhost/admin\n');

  await pool.end();
}

bootstrap().catch(e => {
  console.error('Bootstrap failed:', e.message);
  process.exit(1);
});
