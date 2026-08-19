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

// Generate next ref number: INT/NTC/YYYY/NNN
function generateRef() {
  const year = new Date().getFullYear();
  const last  = db.prepare(
    "SELECT ref FROM notices WHERE ref LIKE ? ORDER BY id DESC LIMIT 1"
  ).get(`INT/NTC/${year}/%`);

  let seq = 1;
  if (last) {
    const parts = last.ref.split('/');
    seq = parseInt(parts[3], 10) + 1;
  }
  return `INT/NTC/${year}/${String(seq).padStart(3, '0')}`;
}

// GET /api/notices
router.get('/', requireAuth, (req, res) => {
  const { user } = req.session;

  if (user.role === 'admin') {
    const { tribunal_id, status } = req.query;
    let query = `
      SELECT n.*, u.full_name AS posted_by_name, s.full_name AS submitted_by_name,
             t.name AS tribunal_name
      FROM notices n
      LEFT JOIN users u ON n.posted_by = u.id
      LEFT JOIN users s ON n.submitted_by = s.id
      LEFT JOIN tribunals t ON n.tribunal_id = t.id
      WHERE 1=1
    `;
    const params = [];
    if (tribunal_id) { query += ' AND n.tribunal_id = ?'; params.push(tribunal_id); }
    if (status)      { query += ' AND n.status = ?';      params.push(status); }
    query += ' ORDER BY n.is_urgent DESC, n.notice_date DESC';
    const notices = db.prepare(query).all(...params);
    
    // Attachments
    const getAttachments = db.prepare('SELECT * FROM attachments WHERE notice_id = ?');
    for (let n of notices) {
      n.attachments = getAttachments.all(n.id);
    }
    return res.json(notices);
  }

  // Staff: approved notices for their tribunal OR public
  const notices = db.prepare(`
    SELECT n.*, u.full_name AS posted_by_name, s.full_name AS submitted_by_name, t.name AS tribunal_name
    FROM notices n
    LEFT JOIN users u ON n.posted_by = u.id
    LEFT JOIN users s ON n.submitted_by = s.id
    LEFT JOIN tribunals t ON n.tribunal_id = t.id
    WHERE n.status = 'approved'
      AND (n.tribunal_id = ? OR n.is_public = 1)
    ORDER BY n.is_urgent DESC, n.notice_date DESC
  `).all(user.tribunal_id);

  const getAttachments = db.prepare('SELECT * FROM attachments WHERE notice_id = ?');
  for (let n of notices) {
    n.attachments = getAttachments.all(n.id);
  }

  res.json(notices);
});

// GET /api/notices/my-submissions
router.get('/my-submissions', requireAuth, (req, res) => {
  const submissions = db.prepare(`
    SELECT n.*, t.name AS tribunal_name
    FROM notices n
    LEFT JOIN tribunals t ON n.tribunal_id = t.id
    WHERE n.submitted_by = ?
    ORDER BY n.created_at DESC
  `).all(req.session.user.id);
  
  const getAttachments = db.prepare('SELECT * FROM attachments WHERE notice_id = ?');
  for (let n of submissions) {
    n.attachments = getAttachments.all(n.id);
  }

  res.json(submissions);
});

// POST /api/notices
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  const { user } = req.session;
  let { title, body, notice_date, is_urgent, is_public, tribunal_id, issuing_office } = req.body;
  
  is_urgent = is_urgent == '1';
  is_public = is_public == '1';

  if (!title || !body || !notice_date) {
    return res.status(400).json({ error: 'title, body and notice_date are required.' });
  }

  const ref           = generateRef();
  const scopedTribunal = is_public ? null : (tribunal_id || user.tribunal_id);
  const status        = user.role === 'admin' ? 'approved' : 'pending';
  const posted_by     = user.role === 'admin' ? user.id : null;
  const submitted_by  = user.role === 'staff'  ? user.id : null;

  const result = db.prepare(`
    INSERT INTO notices (ref, tribunal_id, is_public, title, body, notice_date, is_urgent, status, posted_by, submitted_by, issuing_office)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ref, scopedTribunal, is_public ? 1 : 0, title, body, notice_date, is_urgent ? 1 : 0, status, posted_by, submitted_by, issuing_office || null);

  const noticeId = result.lastInsertRowid;

  // Insert attachment if exists
  if (req.file) {
    const file_url = '/uploads/' + req.file.filename;
    db.prepare(`
      INSERT INTO attachments (notice_id, file_name, file_size, file_url, mime_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(noticeId, req.file.originalname, req.file.size, file_url, req.file.mimetype);
  }

  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, title, meta, notice_ref)
    VALUES (?, ?, ?, ?)
  `);

  if (user.role === 'admin') {
    const targets = is_public
      ? db.prepare('SELECT id, email FROM users WHERE is_active = 1').all()
      : db.prepare('SELECT id, email FROM users WHERE tribunal_id = ? AND is_active = 1').all(scopedTribunal);

    const notifyMany = db.transaction((users) => {
      for (const u of users) {
        insertNotif.run(u.id, title, notice_date, ref);
        if (u.email) {
          sendEmail(u.email, 'New Notice Published', `Notice: ${title}\nRef: ${ref}`);
        }
      }
    });
    notifyMany(targets);
  } else {
    // Notify staff that it was sent for approval
    insertNotif.run(user.id, 'Memo successfully sent for approval', title, ref);
    if (user.email) {
      sendEmail(user.email, 'Memo sent for approval', `Your memo "${title}" has been submitted for approval.`);
    }

    // Notify admins
    const admins = db.prepare("SELECT id, email FROM users WHERE role = 'admin' AND is_active = 1").all();
    for (const a of admins) {
      insertNotif.run(a.id, 'New Memo requires approval', title, ref);
      if (a.email) {
        sendEmail(a.email, 'New Memo Requires Approval', `Staff user ${user.full_name} submitted a new memo: "${title}"`);
      }
    }
  }

  res.status(201).json({ message: 'Notice created.', ref, id: noticeId });
});

// PATCH /api/notices/:id/status
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status, reject_reason } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected.' });
  }

  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found.' });
  if (notice.status !== 'pending') return res.status(409).json({ error: 'Notice is not pending.' });

  db.prepare(`
    UPDATE notices SET status = ?, reject_reason = ?, posted_by = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, reject_reason || null, req.session.user.id, req.params.id);

  if (notice.submitted_by) {
    const submitter = db.prepare('SELECT email FROM users WHERE id = ?').get(notice.submitted_by);
    const notifTitle = status === 'approved'
      ? `Your memo "${notice.title}" was approved`
      : `Your memo "${notice.title}" was rejected`;
      
    db.prepare(`
      INSERT INTO notifications (user_id, title, meta, notice_ref)
      VALUES (?, ?, ?, ?)
    `).run(notice.submitted_by, notifTitle, reject_reason || null, notice.ref);

    if (submitter && submitter.email) {
      sendEmail(submitter.email, 'Memo Status Updated', `${notifTitle}\n${reject_reason ? 'Reason: ' + reject_reason : ''}`);
    }
  }

  res.json({ message: `Notice ${status}.` });
});

// DELETE /api/notices/:id
router.delete('/:id', requireAuth, (req, res) => {
  const { user } = req.session;
  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);

  if (!notice) return res.status(404).json({ error: 'Notice not found.' });

  if (user.role === 'admin') {
    db.prepare('DELETE FROM notices WHERE id = ?').run(req.params.id);
    return res.json({ message: 'Notice deleted.' });
  }

  if (notice.submitted_by !== user.id) {
    return res.status(403).json({ error: 'You can only withdraw your own submissions.' });
  }
  if (notice.status !== 'pending') {
    return res.status(409).json({ error: 'Only pending memos can be withdrawn.' });
  }

  db.prepare('DELETE FROM notices WHERE id = ?').run(req.params.id);
  res.json({ message: 'Memo withdrawn.' });
});

module.exports = router;
