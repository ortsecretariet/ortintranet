const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../db');
const { sendEmail } = require('../utils/email');

const router = express.Router();

const VALID_DEPARTMENTS = [
  'Office of the Registrar, Tribunals',
  'Human Resource',
  'Finance & Accounts',
  'ICT',
  'Supply Chain Management',
  'Administration',
  'Legal Services',
  'Public Relations & Communication',
  'Internal Audit'
];

const TRIBUNAL_DEPARTMENTS = ['Office of the Registrar, Tribunals'];

// GET /api/auth/tribunals — public, used to populate the register form dropdown
router.get('/tribunals', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, color_hex FROM tribunals ORDER BY id').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch tribunals.' });
  }
});

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { full_name, user_id, email, department, tribunal_id, password } = req.body;

  if (!full_name || !user_id || !email || !department || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (!VALID_DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: 'Invalid department.' });
  }

  // Tribunal staff must select a tribunal; other offices get assigned tribunal_id = 1 as a placeholder
  const needsTribunal = TRIBUNAL_DEPARTMENTS.includes(department);
  if (needsTribunal && !tribunal_id) {
    return res.status(400).json({ error: 'Please select your tribunal.' });
  }

  const resolvedTribunalId = needsTribunal ? tribunal_id : 1;

  const tribunal = db.prepare('SELECT id FROM tribunals WHERE id = ?').get(resolvedTribunalId);
  if (!tribunal) return res.status(400).json({ error: 'Invalid tribunal.' });

  const existing = db.prepare('SELECT id FROM users WHERE user_id = ? OR email = ?').get(user_id, email);
  if (existing) return res.status(409).json({ error: 'Staff ID or email already registered.' });

  const password_hash = bcrypt.hashSync(password, 12);

  const result = db.prepare(`
    INSERT INTO users (user_id, password_hash, full_name, email, role, tribunal_id, department)
    VALUES (?, ?, ?, ?, 'staff', ?, ?)
  `).run(user_id, password_hash, full_name, email, resolvedTribunalId, department);

  // Welcome email
  const tribunalRow = needsTribunal
    ? db.prepare('SELECT name FROM tribunals WHERE id = ?').get(resolvedTribunalId)
    : null;

  sendEmail(
    email,
    'Welcome to the Tribunals Notice Board',
    `Dear ${full_name},

Your account has been created successfully on the Judiciary of Kenya — Tribunals Notice Board.

Your login details:
  Staff ID   : ${user_id}
  Department : ${department}${tribunalRow ? ' — ' + tribunalRow.name : ''}
  Role       : Staff

Sign in at:
http://10.77.105.91:3000/index.html

For security, please change your password after your first login.

If you did not create this account, contact the IT Desk immediately.

IT Support: it-support@tribunal.go.ke | +254 729 838 268`
  );

  res.status(201).json({ message: 'Account created successfully.', id: result.lastInsertRowid });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { user_id, password } = req.body;

  if (!user_id || !password) {
    return res.status(400).json({ error: 'Staff ID and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(user_id);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid staff ID or password.' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Your account has been deactivated. Contact the IT Desk.' });
  }

  // Update last_login_at
  db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id);

  // Store safe user info in session
  req.session.user = {
    id:              user.id,
    user_id:         user.user_id,
    full_name:       user.full_name,
    email:           user.email,
    role:            user.role,
    tribunal_id:     user.tribunal_id,
    department:      user.department,
    profile_picture: user.profile_picture
  };

  res.json({ message: 'Login successful.', user: req.session.user });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  const { user_id, email } = req.body;
  if (!user_id || !email) {
    return res.status(400).json({ error: 'Staff ID and email are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE user_id = ? AND email = ?').get(user_id, email);

  // Always return success — don't reveal whether the account exists
  if (!user) {
    return res.json({ message: 'If that account exists, a reset link has been sent.' });
  }

  // Invalidate any existing unused tokens for this user
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

  // Generate a secure random token, expires in 1 hour
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, token, expiresAt);

  // Build reset URL — works on both localhost and LAN IP
  const host     = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const resetUrl = `${protocol}://${host}/reset-password.html?token=${token}`;

  sendEmail(
    user.email,
    'Password Reset — Tribunals Notice Board',
    `Hello ${user.full_name},

You requested a password reset for your Tribunals Notice Board account.

Click the link below to set a new password. This link expires in 1 hour.

${resetUrl}

If you did not request this, ignore this email — your password will not change.`
  );

  res.json({ message: 'If that account exists, a reset link has been sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const record = db.prepare(`
    SELECT t.*, u.id AS uid FROM password_reset_tokens t
    JOIN users u ON t.user_id = u.id
    WHERE t.token = ? AND t.used = 0
  `).get(token);

  if (!record) {
    return res.status(400).json({ error: 'Invalid or already used reset link.' });
  }

  // Check expiry
  const expires = new Date(record.expires_at + '+03:00');
  if (Date.now() > expires.getTime()) {
    return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, record.uid);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);

  res.json({ message: 'Password updated successfully.' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

// GET /api/auth/me — returns current session user
router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated.' });
  
  // Always fetch latest to ensure profile pic and email are up-to-date
  const user = db.prepare('SELECT id, user_id, full_name, email, role, tribunal_id, department, profile_picture FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(401).json({ error: 'User no longer exists.' });
  
  // Update session
  req.session.user = user;
  res.json(user);
});

module.exports = router;
