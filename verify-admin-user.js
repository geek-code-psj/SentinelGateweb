const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_scOVzCH2aw9Z@ep-gentle-dawn-a1qln1fw-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const result = await pool.query(
      `SELECT id, roll_number, role, full_name, is_active, password_hash 
       FROM sentinel.users 
       WHERE roll_number = $1`,
      ['admin-001']
    );
    
    if (result.rowCount === 0) {
      console.log('❌ Admin user NOT found');
    } else {
      const user = result.rows[0];
      console.log('✅ Admin user found:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Roll: ${user.roll_number}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Name: ${user.full_name}`);
      console.log(`   Active: ${user.is_active}`);
      console.log(`   Has password hash: ${!!user.password_hash}`);
    }
    
    await pool.end();
    process.exit(0);
  } catch(e) {
    console.log('❌ Error:', e.message);
    process.exit(1);
  }
})();
