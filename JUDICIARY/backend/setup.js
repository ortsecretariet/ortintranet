/**
 * setup.js — Run once after installation to seed the admin account.
 * Usage: node setup.js
 */
const bcrypt = require('bcryptjs');
const db     = require('./db');

const ADMIN_ID       = 'ADMIN001';
const ADMIN_PASSWORD = 'Admin@1234';
const ADMIN_NAME     = 'System Administrator';
const ADMIN_EMAIL    = 'admin@tribunal.go.ke';

// Check if admin already exists
const existing = db.prepare('SELECT id FROM users WHERE user_id = ?').get(ADMIN_ID);

if (existing) {
  console.log(`✅  Admin account already exists (Staff ID: ${ADMIN_ID})`);
  process.exit(0);
}

const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

// Get first tribunal id
const tribunal = db.prepare('SELECT id FROM tribunals ORDER BY id LIMIT 1').get();
if (!tribunal) {
  console.error('❌  No tribunals found. Check schema.sql seeding.');
  process.exit(1);
}

db.prepare(`
  INSERT INTO users (user_id, password_hash, full_name, email, role, tribunal_id, department)
  VALUES (?, ?, ?, ?, 'admin', ?, 'IT Services')
`).run(ADMIN_ID, hash, ADMIN_NAME, ADMIN_EMAIL, tribunal.id);

console.log('\n✅  Admin account created!');
console.log(`    Staff ID : ${ADMIN_ID}`);
console.log(`    Password : ${ADMIN_PASSWORD}`);
console.log(`    Email    : ${ADMIN_EMAIL}\n`);
console.log('    Start the server: node server.js\n');
