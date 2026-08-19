const express = require('express');
const db      = require('../db');
const upload  = require('../utils/upload');
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

// GET /api/resources
router.get('/', requireAuth, (req, res) => {
  const { user } = req.session;

  if (user.role === 'admin') {
    const { tribunal_id, issuing_office } = req.query;
    let query = `
      SELECT r.*, t.name AS tribunal_name, u.full_name AS uploaded_by_name
      FROM resources r
      LEFT JOIN tribunals t ON r.tribunal_id = t.id
      LEFT JOIN users u ON r.uploaded_by = u.id
      WHERE 1=1
    `;
    const params = [];
    if (tribunal_id)    { query += ' AND r.tribunal_id = ?';    params.push(tribunal_id); }
    if (issuing_office) { query += ' AND r.issuing_office = ?'; params.push(issuing_office); }
    query += ' ORDER BY r.resource_date DESC';
    return res.json(db.prepare(query).all(...params));
  }

  // Staff sees approved documents for their tribunal OR public
  const resources = db.prepare(`
    SELECT r.*, t.name AS tribunal_name, u.full_name AS uploaded_by_name
    FROM resources r
    LEFT JOIN tribunals t ON r.tribunal_id = t.id
    LEFT JOIN users u ON r.uploaded_by = u.id
    WHERE r.status = 'approved' AND (r.tribunal_id = ? OR r.is_public = 1)
    ORDER BY r.resource_date DESC
  `).all(user.tribunal_id);

  res.json(resources);
});

// POST /api/resources
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  const { user } = req.session;
  let { name, description, tribunal_id, is_public, resource_date, doc_type, issuing_office } = req.body;
  
  is_public = is_public == '1';

  if (!name || !resource_date) {
    return res.status(400).json({ error: 'name and resource_date are required.' });
  }

  const scopedTribunal = is_public ? null : (tribunal_id || user.tribunal_id);
  const status = user.role === 'admin' ? 'approved' : 'pending';
  
  let file_url = req.body.file_url || null;
  let file_size = req.body.file_size || null;

  if (req.file) {
    file_url = '/uploads/' + req.file.filename;
    file_size = req.file.size.toString();
  } else if (!file_url) {
    return res.status(400).json({ error: 'A file is required.' });
  }

  const result = db.prepare(`
    INSERT INTO resources (name, description, file_url, file_size, tribunal_id, is_public, uploaded_by, resource_date, doc_type, issuing_office, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, description || null, file_url, file_size, scopedTribunal, is_public ? 1 : 0, user.id, resource_date, doc_type || 'Document', issuing_office || null, status);

  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, title, meta)
    VALUES (?, ?, ?)
  `);

  if (user.role === 'admin') {
    // Notify all active users that a new document has been published
    const targets = is_public
      ? db.prepare('SELECT id, email FROM users WHERE is_active = 1').all()
      : db.prepare('SELECT id, email FROM users WHERE tribunal_id = ? AND is_active = 1').all(scopedTribunal);

    const officeLabel = issuing_office ? ` — ${issuing_office}` : '';
    const notifyAll = db.transaction((users) => {
      for (const u of users) {
        insertNotif.run(u.id, `New document published: "${name}"`, issuing_office || null);
        if (u.email) {
          sendEmail(
            u.email,
            `New Document Published${officeLabel}`,
            `A new document has been published on the Tribunal Notice Board.\n\nTitle: ${name}\nIssuing Office: ${issuing_office || 'N/A'}\nType: ${doc_type || 'Document'}\n\nLog in to view and download it.`
          );
        }
      }
    });
    notifyAll(targets);
  } else {
    insertNotif.run(user.id, 'Document successfully sent for approval', name);
    if (user.email) sendEmail(user.email, 'Document sent for approval', `Your document "${name}" has been submitted for approval.`);

    const admins = db.prepare("SELECT id, email FROM users WHERE role = 'admin' AND is_active = 1").all();
    for (const a of admins) {
      insertNotif.run(a.id, 'New Document requires approval', name);
      if (a.email) sendEmail(a.email, 'New Document Requires Approval', `Staff user ${user.full_name} uploaded a new document: "${name}"`);
    }
  }

  res.status(201).json({ message: 'Resource added.', id: result.lastInsertRowid });
});

// PATCH /api/resources/:id/status (For admin to approve/reject documents)
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status, reject_reason } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected.' });
  }

  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });

  db.prepare(`
    UPDATE resources SET status = ?, reject_reason = ? WHERE id = ?
  `).run(status, reject_reason || null, req.params.id);

  if (resource.uploaded_by) {
    const uploader = db.prepare('SELECT email FROM users WHERE id = ?').get(resource.uploaded_by);
    const notifTitle = status === 'approved'
      ? `Your document "${resource.name}" was approved`
      : `Your document "${resource.name}" was rejected`;
      
    db.prepare(`
      INSERT INTO notifications (user_id, title, meta)
      VALUES (?, ?, ?)
    `).run(resource.uploaded_by, notifTitle, reject_reason || null);

    if (uploader && uploader.email) {
      sendEmail(uploader.email, 'Document Status Updated', `${notifTitle}\n${reject_reason ? 'Reason: ' + reject_reason : ''}`);
    }
  }

  res.json({ message: `Resource ${status}.` });
});

// DELETE /api/resources/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const resource = db.prepare('SELECT id FROM resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });

  db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
  res.json({ message: 'Resource deleted.' });
});

module.exports = router;
