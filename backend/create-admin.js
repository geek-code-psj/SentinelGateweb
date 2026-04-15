require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const result = await pool.query(
      `INSERT INTO sentinel.users (roll_number, password_hash, role, full_name, is_active) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (roll_number) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      ['admin-001', '$2b$10$PVrSfsODm5N80ZDln6/yWOUw7ztQBl/2bfP4BorEFsZ3Mn2PVPhHa', 'admin', 'Test Admin', true]
    );
    console.log('✓ Admin user created in Neon:', result.rowCount);
    await pool.end();
    process.exit(0);
  } catch(e) {
    console.log('✗ Error:', e.message);
    process.exit(1);
  }
})();
