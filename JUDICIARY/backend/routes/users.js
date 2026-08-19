const express = require('express');
const db      = require('../db');
const upload  = require('../utils/upload');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// GET /api/users/categories - get all departments and tribunals
router.get('/categories', requireAuth, (req, res) => {
  const depts = db.prepare('SELECT DISTINCT department FROM users').all().map(r => r.department).filter(Boolean);
  const tribunals = db.prepare('SELECT name FROM tribunals').all().map(r => r.name);
  
  res.json({ categories: [...new Set([...depts, ...tribunals])] });
});

// GET /api/users/me/profile
router.get('/me/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, user_id, full_name, email, role, department, profile_picture FROM users WHERE id = ?').get(req.session.user.id);
  res.json(user);
});

// PATCH /api/users/me/profile - Update profile details and picture
router.patch('/me/profile', requireAuth, upload.single('profile_picture'), (req, res) => {
  const { full_name, email } = req.body;
  let updateQuery = 'UPDATE users SET full_name = ?, email = ?';
  const params = [full_name || req.session.user.full_name, email || null];

  if (req.file) {
    updateQuery += ', profile_picture = ?';
    params.push('/uploads/' + req.file.filename);
  }

  updateQuery += ' WHERE id = ?';
  params.push(req.session.user.id);

  db.prepare(updateQuery).run(...params);
  res.json({ message: 'Profile updated' });
});

// GET /api/users
router.get('/', requireAdmin, (req, res) => {
  const { tribunal_id, department } = req.query;

  let query = `
    SELECT u.id, u.user_id, u.full_name, u.email, u.role, u.department,
           u.is_active, u.created_at, u.last_login_at, u.profile_picture,
           t.name AS tribunal_name
    FROM users u
    LEFT JOIN tribunals t ON u.tribunal_id = t.id
    WHERE 1=1
  `;
  const params = [];
  if (tribunal_id) { query += ' AND u.tribunal_id = ?'; params.push(tribunal_id); }
  if (department)  { query += ' AND u.department = ?';  params.push(department); }
  query += ' ORDER BY u.full_name ASC';

  res.json(db.prepare(query).all(...params));
});

// PATCH /api/users/:id/toggle
router.patch('/:id/toggle', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const newState = user.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newState, req.params.id);
  res.json({ message: newState ? 'User activated.' : 'User deactivated.', is_active: newState });
});

// PATCH /api/users/:id/role
router.patch('/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or staff.' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: `User role updated to ${role}.` });
});

module.exports = router;
