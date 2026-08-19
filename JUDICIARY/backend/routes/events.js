const express = require('express');
const db = require('../db');
const { sendEmail } = require('../utils/email');

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

// GET /api/events
router.get('/', requireAuth, (req, res) => {
  const { user } = req.session;

  let query = `
    SELECT ce.*, u.full_name AS created_by_name
    FROM calendar_events ce
    LEFT JOIN users u ON ce.created_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (user.role !== 'admin') {
    query += ` AND (ce.event_scope = 'general' OR (ce.event_scope = 'department' AND ce.department = ?))`;
    params.push(user.department);
  }

  query += ' ORDER BY ce.event_date ASC';
  const events = db.prepare(query).all(...params);
  res.json(events);
});

// POST /api/events
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, event_date, details, event_scope, department } = req.body;
  const { user } = req.session;

  if (!title || !event_date) {
    return res.status(400).json({ error: 'title and event_date are required.' });
  }

  const scope = event_scope === 'department' ? 'department' : 'general';
  const targetDepartment = scope === 'department' ? (department || user.department) : null;

  if (scope === 'department' && !targetDepartment) {
    return res.status(400).json({ error: 'department is required for department-wide events.' });
  }

  const result = db.prepare(`
    INSERT INTO calendar_events (title, event_date, details, event_scope, department, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, event_date, details || null, scope, targetDepartment, user.id);

  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, title, meta)
    VALUES (?, ?, ?)
  `);

  const targets = scope === 'general'
    ? db.prepare("SELECT id, email FROM users WHERE is_active = 1").all()
    : db.prepare("SELECT id, email FROM users WHERE department = ? AND is_active = 1").all(targetDepartment);

  for (const target of targets) {
    insertNotif.run(target.id, `New event: ${title}`, `${scope === 'general' ? 'General event' : `Department event for ${targetDepartment}`} • ${event_date}`);
    if (target.email) {
      sendEmail(
        target.email,
        'New Calendar Event Posted',
        `A new ${scope === 'general' ? 'general' : 'department'} event has been added: ${title}\nDate: ${event_date}\n${details ? `Details: ${details}` : ''}`
      );
    }
  }

  res.status(201).json({ message: 'Event created and notifications sent.', id: result.lastInsertRowid });
});

module.exports = router;
