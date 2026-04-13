#!/usr/bin/env node
/**
 * SentinelGate Bootstrap Script
 * Run ONCE after creating the database schema:
 *   node bootstrap.js
 *
 * This will:
 *  1. Generate TOTP secrets for all gates in the DB
 *  2. Create a default admin user (change password immediately!)
 *  3. Print a summary of all gate secrets (store securely)
 */
require('dotenv').config();
const { pool } = require('./src/db');
const { generateGateSecret } = require('./src/utils/totp');
const crypto = require('crypto');

async function bootstrap() {
  console.log('\n🔐 SentinelGate Bootstrap\n');

  // 1. Generate/update gate TOTP secrets
  const gates = await pool.query(`SELECT id, name, totp_secret_enc FROM sentinel.gates`);
  console.log(`Found ${gates.rowCount} gates.\n`);

  for (const gate of gates.rows) {
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

  // 2. Create default admin user (if not exists)
  const adminRoll = 'ADMIN-001';
  const existingAdmin = await pool.query(
    `SELECT id FROM sentinel.users WHERE roll_number = $1`,
    [adminRoll]
  );
  if (existingAdmin.rowCount === 0) {
    await pool.query(
      `INSERT INTO sentinel.users (roll_number, full_name, role)
       VALUES ($1, 'System Administrator', 'admin')`,
      [adminRoll]
    );
    console.log(`\n  Admin user created: roll=${adminRoll}`);
    console.log(`  ⚠ Add password support and change this credential before production deploy`);
  } else {
    console.log(`\n  Admin user ${adminRoll} already exists — skipping`);
  }

  console.log('\n✅ Bootstrap complete.\n');
  console.log('Next steps:');
  console.log('  1. Save gate secrets to a password manager');
  console.log('  2. Run: node src/server.js');
  console.log('  3. Gate display will fetch its secret via POST /gate/bootstrap\n');

  await pool.end();
}

bootstrap().catch(e => {
  console.error('Bootstrap failed:', e.message);
  process.exit(1);
});
