const express = require('express');
const db      = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated.' });
  next();
}

// GET /api/notifications — current user's notifications, newest first
router.get('/', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.session.user.id);

  res.json(notifications);
});

// GET /api/notifications/count — unread count for badge
router.get('/count', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND is_read = 0
  `).get(req.session.user.id);

  res.json({ count: row.count });
});

// PATCH /api/notifications/read — mark all unread as read
router.patch('/read', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE notifications SET is_read = 1
    WHERE user_id = ? AND is_read = 0
  `).run(req.session.user.id);

  res.json({ message: 'All notifications marked as read.' });
});

module.exports = router;
