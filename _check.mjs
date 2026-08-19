// /* =========================================================
   dashboard.js  –  Tribunal Notice Board  — Full API-wired version
   ========================================================= */

const API = (function () {
  if (window.location.protocol === 'file:') {
    return 'http://localhost:3000/api';
  }
  return `${window.location.protocol}//${window.location.host}/api`;
})();

let CURRENT_USER   = null;
let rejectTargetId = null;
let pubSelectedFile = null;

// Live data from API
let mockNotices   = [];
let mockDocuments = [];

// Calendar events (local state — no dedicated API endpoint)
let calendarEvents = [
  { id: 1, title: 'Panel B sitting venue maintenance',  date: '2026-07-20T10:00', details: 'Remodelling session for sitting chamber 4' },
  { id: 2, title: 'Staff training: E-filing tools',     date: '2026-07-22T09:00', details: 'Mandatory half-day refresher on workflow' },
  { id: 3, title: 'Official sitting: Sports Tribunal',  date: '2026-07-24T08:30', details: 'Hearings for Nairobi Division appeal files' }
];

/* =========================================================
   VIEWS
   ========================================================= */
const views = ['feed', 'publish', 'calendar', 'approvals', 'users', 'documents', 'upload-doc', 'profile'];

function showView(name) {
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === name ? '' : 'none';
  });
  document.querySelectorAll('.nav-link').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));

  if (name === 'feed')      loadNotices();
  if (name === 'approvals') loadApprovals();
  if (name === 'users')     loadUsers();
  if (name === 'documents') loadDocuments();
  if (name === 'calendar')  loadCalendarEvents();
}

document.querySelectorAll('.nav-link').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch (_) {}
  localStorage.removeItem('user');
  redirectToLogin();
});

/* =========================================================
   UTILITIES
   ========================================================= */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d      = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins   = Math.floor(diffMs / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7)  return days + 'd ago';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  const n = Number(bytes);
  if (isNaN(n)) return bytes;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function docTypeIcon(type) {
  const icons = { Announcement: '📢', Memo: '📄', Invoice: '🧾', Circular: '📌', Report: '📊', Document: '📁' };
  return icons[type] || '📁';
}

/* =========================================================
   TOAST NOTIFICATIONS
   ========================================================= */
function showToast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const toast     = document.createElement('div');
  toast.className = 'toast' + (type ? ' toast-' + type : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* =========================================================
   NOTIFICATION PANEL  (real API)
   ========================================================= */
let _notifData = [];

async function loadNotifications() {
  try {
    const res = await fetch(`${API}/notifications`, { credentials: 'include' });
    if (res.ok) {
      _notifData = await res.json();
      renderNotifList();
      updateNotifDot();
    }
  } catch (_) {}
}

function renderNotifList() {
  const el = document.getElementById('notifList');
  if (!_notifData.length) {
    el.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  el.innerHTML = _notifData.map(n => `
    <div class="notif-item${n.is_read ? '' : ' unread'}">
      <div class="notif-title">${escapeHtml(n.title)}</div>
      <div class="notif-meta">${escapeHtml(n.meta || n.notice_ref || '')}${n.created_at ? ' · ' + timeAgo(n.created_at) : ''}</div>
    </div>`).join('');
}

function updateNotifDot() {
  const dot = document.getElementById('notifDot');
  const hasUnread = _notifData.some(n => !n.is_read);
  dot.style.display = hasUnread ? '' : 'none';
}

async function toggleNotifPanel() {
  const panel    = document.getElementById('notifPanel');
  const backdrop = document.getElementById('notifBackdrop');
  const isOpen   = panel.classList.contains('open');
  panel.classList.toggle('open');
  backdrop.classList.toggle('open');

  if (!isOpen) {
    // Mark all read on open
    try {
      await fetch(`${API}/notifications/read`, { method: 'PATCH', credentials: 'include' });
      _notifData.forEach(n => n.is_read = 1);
      renderNotifList();
      updateNotifDot();
    } catch (_) {}
  }
}

function closeNotifPanel() {
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('notifBackdrop').classList.remove('open');
}

/* =========================================================
   ONLINE USERS (sidebar)
   ========================================================= */
function loadOnlineUsers() {
  // Show current user as online
  const list = document.getElementById('onlineUsersList');
  if (CURRENT_USER) {
    list.innerHTML = `<div class="online-item"><b>${escapeHtml(CURRENT_USER.full_name)}</b><span>${escapeHtml(CURRENT_USER.department)} · just now</span></div>`;
  } else {
    list.innerHTML = '<div class="online-empty">No users online.</div>';
  }
}

/* =========================================================
   PENDING BADGE
   ========================================================= */
function updatePendingBadge() {
  const count = mockNotices.filter(n => n.status === 'pending').length;
  const badge = document.getElementById('pendingBadge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline-flex' : 'none'; }
}

/* =========================================================
   NOTICE FEED  (real API)
   ========================================================= */
document.getElementById('searchBox').addEventListener('input', renderFeed);
document.getElementById('categoryFilter').addEventListener('change', renderFeed);
document.getElementById('dateFilter').addEventListener('change', renderFeed);
document.getElementById('urgentFilter').addEventListener('change', renderFeed);

function getVisibleNotices() {
  let list = mockNotices;
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    list = list.filter(n => n.status === 'approved');
  }

  const q          = document.getElementById('searchBox').value.toLowerCase();
  const cat        = document.getElementById('categoryFilter').value;
  const dateVal    = document.getElementById('dateFilter').value;
  const urgentOnly = document.getElementById('urgentFilter').value === 'urgent';

  if (q)          list = list.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  if (cat)        list = list.filter(n => n.tribunal_name === cat);
  if (dateVal)    list = list.filter(n => (n.notice_date || n.created_at || '').slice(0, 10) === dateVal);
  if (urgentOnly) list = list.filter(n => n.is_urgent);

  return list;
}

function noticeRowHTML(n) {
  const urgentTag = n.is_urgent
    ? '<span class="row-pill urgent">⚠ Urgent</span>' : '';
  const catPill = n.is_public
    ? '<span class="row-pill general">Public</span>'
    : `<span class="row-pill dept">${escapeHtml(n.tribunal_name || '')}</span>`;
  const byline = n.posted_by_name || n.submitted_by_name || '';
  const dateDisplay = n.notice_date || n.created_at;
  return `
    <div class="notice-row${n.is_urgent ? ' notice-row-urgent' : ''}" onclick="openDetail(${n.id})" role="button" tabindex="0">
      <div class="notice-row-left">
        <div class="notice-row-pills">${urgentTag}${catPill}</div>
        <div class="notice-row-title">${escapeHtml(n.title)}</div>
        <div class="notice-row-meta">
          ${n.ref ? `<span class="ref-tag-sm">${escapeHtml(n.ref)}</span>` : ''}
          ${byline ? `<span>${escapeHtml(byline)}</span>` : ''}
        </div>
      </div>
      <div class="notice-row-right">
        <span class="notice-row-date">${timeAgo(dateDisplay)}</span>
        <span class="notice-row-chevron">›</span>
      </div>
    </div>`;
}

function renderFeed() {
  const list    = getVisibleNotices();
  const pinned  = list.filter(n => n.is_urgent);
  const regular = list.filter(n => !n.is_urgent);

  // Fetch categories from API
  fetch(`${API}/users/categories`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      const catSelect = document.getElementById('categoryFilter');
      const existing  = new Set([...catSelect.options].map(o => o.value));
      (data.categories || []).forEach(c => {
        if (!existing.has(c)) {
          const opt = document.createElement('option');
          opt.value = c; opt.textContent = c;
          catSelect.appendChild(opt);
        }
      });
    }).catch(console.error);

  const pinnedSection = document.getElementById('pinnedSection');
  const pinnedList    = document.getElementById('pinnedList');
  const allLabel      = document.getElementById('allNoticesLabel');
  const noticeList    = document.getElementById('noticeList');

  if (pinned.length) {
    pinnedSection.style.display = '';
    pinnedList.innerHTML = pinned.map(noticeRowHTML).join('');
  } else {
    pinnedSection.style.display = 'none';
  }

  allLabel.style.display = regular.length ? '' : 'none';
  noticeList.innerHTML = regular.length
    ? regular.map(noticeRowHTML).join('')
    : (pinned.length ? '' : '<div class="empty-state">No notices match your search.</div>');
}

async function loadNotices() {
  try {
    const res = await fetch(`${API}/notices`, { credentials: 'include' });
    if (res.status === 401) { redirectToLogin(); return; }
    mockNotices = await res.json();
  } catch {
    showToast('Could not load notices. Is the backend running?', 'error');
  }
  renderFeed();
  updatePendingBadge();
}

/* =========================================================
   NOTICE READER (modal)
   ========================================================= */
let currentDetailId = null;

function openDetail(id) {
  const n = mockNotices.find(n => n.id === id);
  if (!n) return;
  currentDetailId = id;

  document.getElementById('detailRef').textContent   = n.ref || '';
  document.getElementById('detailDate').textContent  = fmtDate(n.notice_date || n.created_at);
  document.getElementById('detailCat').textContent   = n.tribunal_name || (n.is_public ? 'General' : '');
  document.getElementById('detailTitle').textContent = n.title;
  document.getElementById('detailBody').textContent  = n.body;

  const bylineParts = [];
  if (n.posted_by_name)    bylineParts.push('Posted by '    + n.posted_by_name);
  if (n.submitted_by_name) bylineParts.push('Submitted by ' + n.submitted_by_name);
  document.getElementById('detailByline').textContent = bylineParts.join(' · ');

  // Print block
  document.getElementById('printRefPrint').textContent   = n.ref || '';
  document.getElementById('printDatePrint').textContent  = fmtDate(n.notice_date || n.created_at);
  document.getElementById('printTribunal').textContent   = n.tribunal_name || (n.is_public ? 'All Departments' : '');
  document.getElementById('printRefBody').textContent    = n.ref || '';
  document.getElementById('printDateBody').textContent   = fmtDate(n.notice_date || n.created_at);
  document.getElementById('printCatBody').textContent    = n.tribunal_name || '';
  document.getElementById('printTitleBody').textContent  = n.title;
  document.getElementById('printBodyContent').textContent = n.body;
  document.getElementById('printBylineBody').textContent = bylineParts.join(' · ');

  // Attachment
  const attachEl = document.getElementById('detailAttach');
  if (n.attachments && n.attachments.length > 0) {
    const att = n.attachments[0];
    attachEl.style.display = 'block';
    attachEl.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;background:var(--gray-50);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:24px;">📄</span>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--green-950);">${escapeHtml(att.file_name)}</div>
            <div style="font-size:12px;color:var(--ink-600);">${formatFileSize(att.file_size)}</div>
          </div>
        </div>
        <button class="btn-secondary-sm" onclick="openPreview('${escapeHtml(att.file_url)}', '${escapeHtml(att.file_name)}')">Preview / Download</button>
      </div>
    `;
  } else {
    attachEl.style.display = 'none';
  }

  // Status banner
  const banner = document.getElementById('readerStatusBanner');
  if (n.status === 'pending') {
    banner.textContent = '⏳ This memo is pending admin approval.';
    banner.className   = 'reader-status-banner status-pending';
    banner.style.display = '';
  } else if (n.status === 'rejected') {
    banner.textContent = '✕ This memo was rejected.' + (n.reject_reason ? ' Reason: ' + n.reject_reason : '');
    banner.className   = 'reader-status-banner status-rejected';
    banner.style.display = '';
  } else {
    banner.style.display = 'none';
  }

  // Admin delete button
  const delBtn = document.getElementById('readerDeleteBtn');
  delBtn.style.display = (CURRENT_USER && CURRENT_USER.role === 'admin') ? '' : 'none';

  // Staff withdraw button (only own pending)
  const wdBtn = document.getElementById('readerWithdrawBtn');
  wdBtn.style.display = (
    CURRENT_USER && n.status === 'pending' && n.submitted_by === CURRENT_USER.id
  ) ? '' : 'none';

  document.getElementById('noticeReaderBackdrop').classList.add('open');
}

function closeDetail() {
  document.getElementById('noticeReaderBackdrop').classList.remove('open');
  currentDetailId = null;
}

async function deleteCurrentNotice() {
  if (!currentDetailId) return;
  if (!confirm('Are you sure you want to delete this notice?')) return;

  try {
    const res = await fetch(`${API}/notices/${currentDetailId}`, {
      method: 'DELETE', credentials: 'include'
    });
    if (!res.ok) {
      const d = await res.json();
      showToast(d.error || 'Delete failed.', 'error');
      return;
    }
    mockNotices = mockNotices.filter(n => n.id !== currentDetailId);
    closeDetail();
    renderFeed();
    showToast('Notice deleted.');
  } catch {
    showToast('Could not delete notice.', 'error');
  }
}

async function withdrawCurrentMemo() {
  if (!currentDetailId) return;
  if (!confirm('Withdraw this memo submission?')) return;

  try {
    const res = await fetch(`${API}/notices/${currentDetailId}`, {
      method: 'DELETE', credentials: 'include'
    });
    if (!res.ok) {
      const d = await res.json();
      showToast(d.error || 'Withdraw failed.', 'error');
      return;
    }
    mockNotices = mockNotices.filter(n => n.id !== currentDetailId);
    closeDetail();
    renderFeed();
    showToast('Memo withdrawn.');
  } catch {
    showToast('Could not withdraw memo.', 'error');
  }
}

/* =========================================================
   PRINT
   ========================================================= */
function togglePrintMenu() {
  document.getElementById('printMenu').classList.toggle('open');
}

function doPrint(withAttach) {
  const section = document.getElementById('printAttachSectionPrint');
  section.style.display = (withAttach && section.innerHTML.trim()) ? '' : 'none';
  document.getElementById('printMenu').classList.remove('open');
  requestAnimationFrame(() => window.print());
}

document.addEventListener('click', e => {
  if (!e.target.closest('.print-menu-wrap')) {
    document.getElementById('printMenu')?.classList.remove('open');
  }
});

/* =========================================================
   UNIFIED PUBLISH / SUBMIT FORM  (real API)
   ========================================================= */
function handlePubFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('File exceeds 10 MB limit.', 'error');
    input.value = '';
    return;
  }
  pubSelectedFile = file;
  document.getElementById('pubUploadLabel').textContent = '✓ ' + file.name;
  document.getElementById('pubUploadZone').classList.add('has-file');
}

document.getElementById('unifiedPublishForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title    = document.getElementById('pub_title').value.trim();
  const body     = document.getElementById('pub_body').value.trim();
  const dateVal  = document.getElementById('pub_date').value;

  if (!title || !body) { showToast('Please fill in the title and details.', 'error'); return; }
  if (!dateVal)        { showToast('Please enter a date.', 'error'); return; }

  const isAdmin  = CURRENT_USER.role === 'admin';
  const isPublic = isAdmin
    ? (document.getElementById('pub_general')?.checked || false)
    : (document.getElementById('pub_audience')?.value === 'general');
  const isUrgent = isAdmin && document.getElementById('pub_urgent')?.value === 'urgent';

  const btn = document.getElementById('pubSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('body', body);
    formData.append('notice_date', dateVal);
    formData.append('is_urgent', isUrgent ? 1 : 0);
    formData.append('is_public', isPublic ? 1 : 0);
    if (pubSelectedFile) formData.append('file', pubSelectedFile);

    const res = await fetch(`${API}/notices`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to submit.', 'error');
      return;
    }

    document.getElementById('unifiedPublishForm').reset();
    pubSelectedFile = null;
    document.getElementById('pubUploadLabel').textContent = 'Click to attach a file';
    document.getElementById('pubUploadZone').classList.remove('has-file');

    showToast(isAdmin
      ? `Notice published: "${title}"`
      : `Memo submitted for approval: "${title}"`
    );
    showView('feed');
  } catch {
    showToast('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = isAdmin ? 'Publish Notice' : 'Submit for Approval';
  }
});

/* =========================================================
   EVENTS CALENDAR
   ========================================================= */
function loadCalendarEvents() {
  const listEl = document.getElementById('calendarEventsList');
  if (!listEl) return;

  if (!calendarEvents.length) {
    listEl.innerHTML = '<div class="empty-state">No upcoming events.</div>';
    return;
  }

  const sorted = [...calendarEvents].sort((a, b) => new Date(a.date) - new Date(b.date));
  listEl.innerHTML = sorted.map(ev => {
    const dt            = new Date(ev.date);
    const dateFormatted = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeFormatted = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="notice-card" style="padding:12px 14px;border:1px solid var(--border);border-radius:8px;cursor:pointer;" onclick="window.open('https://calendar.google.com','_blank')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <h4 style="margin:0;font-size:13.5px;color:var(--green-950);">${escapeHtml(ev.title)}</h4>
          <span style="font-size:11px;font-weight:700;background:#eaf1ee;color:var(--green-800);padding:2px 8px;border-radius:999px;">${dateFormatted}</span>
        </div>
        <p style="margin:6px 0 0;font-size:12px;color:var(--ink-600);">${escapeHtml(ev.details || '')}</p>
        <div style="margin-top:8px;font-size:10.5px;color:var(--ink-soft);display:flex;align-items:center;gap:4px;">
          <span>🕒 ${timeFormatted}</span>
          <span style="margin-left:auto;color:var(--gold-500);font-weight:600;">View Calendar ›</span>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('addEventForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title   = document.getElementById('ev_title').value.trim();
  const dtVal   = document.getElementById('ev_datetime').value;
  const details = document.getElementById('ev_details').value.trim();

  if (!title || !dtVal) { showToast('Please fill in title and datetime.', 'error'); return; }

  calendarEvents.push({ id: Date.now(), title, date: dtVal, details });
  document.getElementById('addEventForm').reset();
  loadCalendarEvents();
  showToast(`📅 Event added: "${title}"`);
});

/* =========================================================
   APPROVALS  (real API — admin only)
   ========================================================= */
let rejectTargetType = 'notice'; // 'notice' or 'resource'

async function loadApprovals() {
  const list = document.getElementById('approvalsList');
  list.innerHTML = '<div class="empty-state">Loading…</div>';

  try {
    // Fetch both pending notices AND pending resources in parallel
    const [noticesRes, resourcesRes] = await Promise.all([
      fetch(`${API}/notices?status=pending`, { credentials: 'include' }),
      fetch(`${API}/resources`, { credentials: 'include' })
    ]);

    const pendingNotices   = noticesRes.ok   ? await noticesRes.json()   : [];
    const allResources     = resourcesRes.ok ? await resourcesRes.json() : [];
    const pendingResources = allResources.filter(r => r.status === 'pending');

    const totalCount = pendingNotices.length + pendingResources.length;

    if (totalCount === 0) {
      list.innerHTML = '<div class="empty-state">No items waiting for approval. All caught up. ✓</div>';
      const badge = document.getElementById('pendingBadge');
      if (badge) badge.style.display = 'none';
      return;
    }

    // Render pending notices
    const noticeCards = pendingNotices.map(n => `
      <div class="notice-card" id="pending-item-notice-${n.id}">
        <div class="notice-card-head">
          <div>
            <span class="pill dept">${escapeHtml(n.tribunal_name || 'General')}</span>
            <span class="pill" style="background:#e8f4fd;color:#1a6fa0;margin-left:4px;">📝 Memo</span>
            <h3 style="margin:4px 0 0;">${escapeHtml(n.title)}</h3>
          </div>
          <span class="card-date">${timeAgo(n.created_at)}</span>
        </div>
        <div class="notice-meta">Submitted by <strong>${escapeHtml(n.submitted_by_name || '—')}</strong> · ${fmtDate(n.notice_date)}</div>
        <div class="notice-body">${escapeHtml((n.body || '').slice(0, 200))}${(n.body || '').length > 200 ? '…' : ''}</div>
        <div class="notice-actions" onclick="event.stopPropagation()">
          <button class="btn-small approve" onclick="approveNotice(${n.id})">✓ Approve</button>
          <button class="btn-small reject"  onclick="openReject(${n.id}, 'notice')">✕ Reject</button>
        </div>
      </div>`);

    // Render pending resources (documents)
    const resourceCards = pendingResources.map(r => `
      <div class="notice-card" id="pending-item-resource-${r.id}">
        <div class="notice-card-head">
          <div>
            <span class="pill dept">${escapeHtml(r.tribunal_name || 'General')}</span>
            <span class="pill" style="background:#fef3e2;color:#a05a1a;margin-left:4px;">📎 Document</span>
            <h3 style="margin:4px 0 0;">${escapeHtml(r.name)}</h3>
          </div>
          <span class="card-date">${timeAgo(r.created_at)}</span>
        </div>
        <div class="notice-meta">Uploaded by <strong>${escapeHtml(r.uploaded_by_name || '—')}</strong> · ${fmtDate(r.resource_date)}</div>
        ${r.description ? `<div class="notice-body">${escapeHtml(r.description)}</div>` : ''}
        <div class="notice-meta" style="margin-top:6px;">
          <a href="${escapeHtml(r.file_url || '')}" target="_blank" style="color:var(--green-800);font-size:12px;">🔗 View File</a>
          ${r.file_size ? ` · ${formatFileSize(r.file_size)}` : ''}
        </div>
        <div class="notice-actions" onclick="event.stopPropagation()">
          <button class="btn-small approve" onclick="approveResource(${r.id})">✓ Approve</button>
          <button class="btn-small reject"  onclick="openReject(${r.id}, 'resource')">✕ Reject</button>
        </div>
      </div>`);

    list.innerHTML = [...noticeCards, ...resourceCards].join('');

    // Update badge count
    const badge = document.getElementById('pendingBadge');
    if (badge) { badge.textContent = totalCount; badge.style.display = totalCount > 0 ? 'inline-flex' : 'none'; }

  } catch (err) {
    console.error(err);
    list.innerHTML = '<div class="empty-state">Could not load approvals.</div>';
  }
}

async function approveNotice(id) {
  try {
    const res = await fetch(`${API}/notices/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'approved' })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Approve failed.', 'error'); return; }
    document.getElementById('pending-item-notice-' + id)?.remove();
    showToast('Memo approved.');
    loadApprovals();
  } catch {
    showToast('Could not approve notice.', 'error');
  }
}

async function approveResource(id) {
  try {
    const res = await fetch(`${API}/resources/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'approved' })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Approve failed.', 'error'); return; }
    document.getElementById('pending-item-resource-' + id)?.remove();
    showToast('Document approved.');
    loadApprovals();
  } catch {
    showToast('Could not approve document.', 'error');
  }
}

function openReject(id, type = 'notice') {
  rejectTargetId   = id;
  rejectTargetType = type;
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectBackdrop').classList.add('open');
}

function closeReject() {
  rejectTargetId = null;
  document.getElementById('rejectBackdrop').classList.remove('open');
}

async function confirmReject() {
  const reason = document.getElementById('rejectReason').value.trim();

  try {
    const endpoint = rejectTargetType === 'resource'
      ? `${API}/resources/${rejectTargetId}/status`
      : `${API}/notices/${rejectTargetId}/status`;

    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'rejected', reject_reason: reason })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Reject failed.', 'error'); return; }
    closeReject();
    showToast(rejectTargetType === 'resource' ? 'Document rejected.' : 'Memo rejected.');
    loadApprovals();
  } catch {
    showToast('Could not reject item.', 'error');
  }
}

/* =========================================================
   USERS VIEW  (real API — admin only)
   ========================================================= */
async function loadUsers() {
  const wrap = document.getElementById('usersTableWrap');
  wrap.innerHTML = '<div class="empty-state">Loading users…</div>';

  try {
    const res = await fetch(`${API}/users`, { credentials: 'include' });
    if (!res.ok) { wrap.innerHTML = '<div class="empty-state">Could not load users.</div>'; return; }
    const users = await res.json();

    if (!users.length) {
      wrap.innerHTML = '<div class="empty-state">No users found.</div>';
      return;
    }

    wrap.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
          <thead>
            <tr style="background:var(--sidebar);color:var(--white);text-align:left;">
              <th style="padding:10px 14px;">Name</th>
              <th style="padding:10px 14px;">Staff ID</th>
              <th style="padding:10px 14px;">Department</th>
              <th style="padding:10px 14px;">Tribunal</th>
              <th style="padding:10px 14px;">Role</th>
              <th style="padding:10px 14px;">Status</th>
              <th style="padding:10px 14px;">Last Login</th>
              <th style="padding:10px 14px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr id="user-row-${u.id}" style="border-bottom:1px solid var(--border);">
                <td style="padding:10px 14px;font-weight:600;">${escapeHtml(u.full_name)}</td>
                <td style="padding:10px 14px;color:var(--ink-600);">${escapeHtml(u.user_id)}</td>
                <td style="padding:10px 14px;">${escapeHtml(u.department)}</td>
                <td style="padding:10px 14px;">${escapeHtml(u.tribunal_name || '—')}</td>
                <td style="padding:10px 14px;">
                  <span style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;
                    background:${u.role === 'admin' ? '#d4edda' : '#e9ecef'};
                    color:${u.role === 'admin' ? '#1E6B44' : '#495057'};">
                    ${u.role}
                  </span>
                </td>
                <td style="padding:10px 14px;">
                  <span style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;
                    background:${u.is_active ? '#d4edda' : '#f8d7da'};
                    color:${u.is_active ? '#155724' : '#721c24'};">
                    ${u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style="padding:10px 14px;color:var(--ink-600);font-size:12px;">${u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</td>
                <td style="padding:10px 14px;">
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${u.id !== CURRENT_USER.id ? `
                      <button class="btn-small ${u.is_active ? 'reject' : 'approve'}"
                        onclick="toggleUser(${u.id}, ${u.is_active})">
                        ${u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button class="btn-small" style="background:var(--gold-50);color:var(--gold-700);border:1px solid var(--gold-300);"
                        onclick="changeRole(${u.id}, '${u.role === 'admin' ? 'staff' : 'admin'}')">
                        Make ${u.role === 'admin' ? 'Staff' : 'Admin'}
                      </button>
                    ` : '<span style="color:var(--ink-soft);font-size:12px;">You</span>'}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch {
    wrap.innerHTML = '<div class="empty-state">Could not load users.</div>';
  }
}

async function toggleUser(id, currentlyActive) {
  try {
    const res  = await fetch(`${API}/users/${id}/toggle`, { method: 'PATCH', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed.', 'error'); return; }
    showToast(data.message);
    loadUsers();
  } catch {
    showToast('Could not update user.', 'error');
  }
}

async function changeRole(id, newRole) {
  if (!confirm(`Change this user's role to ${newRole}?`)) return;
  try {
    const res  = await fetch(`${API}/users/${id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role: newRole })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed.', 'error'); return; }
    showToast(data.message);
    loadUsers();
  } catch {
    showToast('Could not update user role.', 'error');
  }
}

/* =========================================================
   DOCUMENTS  (real API via resources endpoint)
   ========================================================= */
document.getElementById('docSearch').addEventListener('input', renderDocuments);
document.getElementById('docTypeFilter').addEventListener('change', renderDocuments);
document.getElementById('docDateFilter').addEventListener('change', renderDocuments);

function renderDocuments() {
  const q          = document.getElementById('docSearch').value.toLowerCase();
  const typeFilter = document.getElementById('docTypeFilter').value;
  const dateFilter = document.getElementById('docDateFilter').value;

  let docs = mockDocuments.filter(d => {
    const matchQ    = !q || d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q);
    const matchType = !typeFilter || d.doc_type === typeFilter;
    const matchDate = !dateFilter || (d.resource_date || d.created_at || '').slice(0, 10) === dateFilter;
    return matchQ && matchType && matchDate;
  });

  const list = document.getElementById('documentList');
  if (!docs.length) {
    list.innerHTML = '<div class="empty-state">No documents found. Upload the first one using the sidebar.</div>';
    return;
  }

  list.innerHTML = docs.map(d => {
    // Build an absolute URL so preview works regardless of serving method
    const fileUrl = d.file_url
      ? (d.file_url.startsWith('http') ? d.file_url : `${window.location.protocol}//${window.location.host}${d.file_url}`)
      : '#';
    return `
    <div class="notice-card doc-card">
      <div class="notice-card-head">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:28px;line-height:1;">${docTypeIcon(d.doc_type || 'Document')}</span>
          <div>
            <h3 style="margin:0;font-size:15.5px;">${escapeHtml(d.name)}</h3>
            <div class="notice-meta" style="margin:2px 0 0;">
              ${d.is_public
                ? '<span class="pill general">Public</span>'
                : `<span class="pill dept">${escapeHtml(d.tribunal_name || '')}</span>`}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-secondary-sm" onclick="openPreview(this.dataset.url, this.dataset.name)" data-url="${fileUrl.replace(/"/g, '&amp;quot;')}" data-name="${escapeHtml(d.name)}">👁️ Preview</button>
          <a href="${fileUrl}" target="_blank" download class="btn-gold"
             style="padding:7px 14px;font-size:13px;text-decoration:none;border-radius:8px;">⬇ Download</a>
        </div>
      </div>
      ${d.description ? `<div class="notice-body" style="margin-top:10px;">${escapeHtml(d.description)}</div>` : ''}
      <div class="notice-meta" style="margin-top:10px;">
        Uploaded by ${escapeHtml(d.uploaded_by_name || '—')} · ${timeAgo(d.created_at)}
        ${d.file_size ? ' · ' + formatFileSize(d.file_size) : ''}
      </div>
    </div>`;
  }).join('');
}

async function loadDocuments() {
  try {
    const res = await fetch(`${API}/resources`, { credentials: 'include' });
    if (res.ok) mockDocuments = await res.json();
  } catch {
    showToast('Could not load documents.', 'error');
  }
  renderDocuments();
}

/* =========================================================
   UPLOAD DOCUMENT FORM  (real API)
   ========================================================= */
document.getElementById('docUploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title    = document.getElementById('d_title').value.trim();
  const type     = document.getElementById('d_type').value;
  const desc     = document.getElementById('d_description').value.trim();
  const file     = document.getElementById('d_file').files[0];
  const isPublic = document.getElementById('d_general')?.checked || false;

  if (!title || !type) { showToast('Please fill in all required fields.', 'error'); return; }
  if (!file)           { showToast('Please select a file.', 'error'); return; }

  const btn = document.getElementById('docUploadBtn');
  btn.disabled = true;
  btn.textContent = 'Uploading…';

  try {
    const formData = new FormData();
    formData.append('name', title);
    formData.append('doc_type', type);
    formData.append('description', desc);
    formData.append('is_public', isPublic ? 1 : 0);
    formData.append('resource_date', new Date().toISOString().slice(0, 10));
    formData.append('file', file);

    const res = await fetch(`${API}/resources`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Upload failed.', 'error');
      return;
    }

    document.getElementById('docUploadForm').reset();

    // Tell user the right message depending on their role
    const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';
    showToast(isAdmin
      ? 'Document uploaded and published.'
      : 'File sent for approval.');
    showView('documents');
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Could not reach the server. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload Document';
  }
});

/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDetail();
    closeReject();
    closeNotifPanel();
  }
});

/* =========================================================
   INIT — verify session first, then bootstrap UI
   ========================================================= */
function redirectToLogin() {
  window.location.href = window.location.port === '3000' ? '/index.html' : '../JUDICIARY/index.html';
}

async function init() {
  try {
    const meRes = await fetch(`${API}/auth/me`, { credentials: 'include' });
    if (meRes.ok) {
      CURRENT_USER = await meRes.json();
      localStorage.setItem('user', JSON.stringify(CURRENT_USER));
    } else {
      const stored = localStorage.getItem('user');
      if (stored) { CURRENT_USER = JSON.parse(stored); }
      else { redirectToLogin(); return; }
    }
  } catch {
    const stored = localStorage.getItem('user');
    if (stored) { CURRENT_USER = JSON.parse(stored); }
    else { redirectToLogin(); return; }
  }

  const isAdmin = CURRENT_USER.role === 'admin';

  // ── Sidebar & topbar ──
  document.getElementById('sbUserName').textContent = CURRENT_USER.full_name;
  document.getElementById('sbUserDept').textContent = isAdmin
    ? 'Admin · ' + CURRENT_USER.department
    : CURRENT_USER.department;

  document.getElementById('welcomeTitle').textContent = 'Welcome back, ' + CURRENT_USER.full_name.split(' ')[0];
  document.getElementById('welcomeSub').textContent   = isAdmin
    ? 'You can view and manage all notices, memos and users.'
    : 'Here are the notices and memos for your tribunal and department.';

  // ── Profile picture ──
  const rawPic    = CURRENT_USER.profile_picture;
  const picSrc    = rawPic
    ? (rawPic.startsWith('http') ? rawPic : `${window.location.protocol}//${window.location.host}${rawPic}`)
    : `${window.location.protocol}//${window.location.host}/logo.png`;
  ['sbProfilePic', 'topProfilePic', 'profilePreview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.src = picSrc; el.style.display = 'block'; }
  });

  // ── Profile form fields ──
  document.getElementById('p_fullname').value = CURRENT_USER.full_name || '';
  document.getElementById('p_email').value    = CURRENT_USER.email     || '';
  const staffIdEl = document.getElementById('p_staffid_display');
  const deptEl    = document.getElementById('p_dept_display');
  const roleEl    = document.getElementById('p_role_display');
  if (staffIdEl) staffIdEl.textContent = CURRENT_USER.user_id   || '—';
  if (deptEl)    deptEl.textContent    = CURRENT_USER.department || '—';
  if (roleEl)    roleEl.textContent    = CURRENT_USER.role
    ? CURRENT_USER.role.charAt(0).toUpperCase() + CURRENT_USER.role.slice(1) : '—';

  // ── Admin-only nav links ──
  if (isAdmin) {
    document.getElementById('approvalsLink').style.display = '';
    document.getElementById('usersLink').style.display     = '';

    document.getElementById('publishFormTitle').textContent    = 'Post a new notice';
    document.getElementById('publishFormSubtitle').textContent = 'Add a department notice or circular instantly.';
    document.getElementById('audienceFieldWrap').style.display   = 'none';
    document.getElementById('pubGeneralCheckWrap').style.display = 'flex';
    document.getElementById('priorityFieldWrap').style.display   = 'block';
    document.getElementById('pubSubmitBtn').textContent          = 'Publish Notice';
    document.getElementById('adminEventCreator').style.display   = 'block';
    document.getElementById('docGeneralWrap').style.display      = 'flex';
  } else {
    document.getElementById('publishFormTitle').textContent    = 'Submit a memo';
    document.getElementById('publishFormSubtitle').textContent = 'Send a new memo for admin review and approval.';
    document.getElementById('audienceFieldWrap').style.display   = 'block';
    document.getElementById('pubGeneralCheckWrap').style.display = 'none';
    document.getElementById('priorityFieldWrap').style.display   = 'none';
    document.getElementById('pubSubmitBtn').textContent          = 'Submit for Approval';
  }

  await loadNotifications();
  showView('feed');
  loadOnlineUsers();
  setInterval(loadNotifications, 60000);
}

// Expose functions called from inline HTML onclick attributes
window.toggleNotifPanel    = toggleNotifPanel;
window.closeNotifPanel     = closeNotifPanel;
window.closeDetail         = closeDetail;
window.deleteCurrentNotice = deleteCurrentNotice;
window.withdrawCurrentMemo = withdrawCurrentMemo;
window.togglePrintMenu     = togglePrintMenu;
window.doPrint             = doPrint;
window.openDetail          = openDetail;
window.openReject          = openReject;
window.closeReject         = closeReject;
window.confirmReject       = confirmReject;
window.approveNotice       = approveNotice;
 window.approveResource      = approveResource;
window.toggleUser          = toggleUser;
window.changeRole          = changeRole;
window.handlePubFileSelect = handlePubFileSelect;

/* =========================================================
   PROFILE FORM
   ========================================================= */
document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name  = document.getElementById('p_fullname').value.trim();
  const email = document.getElementById('p_email').value.trim();
  const file  = document.getElementById('p_picture').files[0];

  const btn = document.getElementById('profileSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const formData = new FormData();
  if (name)  formData.append('full_name', name);
  if (email) formData.append('email', email);
  if (file)  formData.append('profile_picture', file);

  try {
    const res = await fetch(`${API}/users/me/profile`, {
      method: 'PATCH', credentials: 'include', body: formData
    });
    if (res.ok) { showToast('Profile updated!'); init(); }
    else        { showToast('Failed to update profile.', 'error'); }
  } catch {
    showToast('Error updating profile.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

document.getElementById('p_picture').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const el = document.getElementById('profilePreview');
    el.src = URL.createObjectURL(file);
    el.style.display = 'block';
  }
});

/* =========================================================
   DOCUMENT PREVIEW MODAL
   ========================================================= */
function openPreview(url, name) {
  document.getElementById('previewTitle').textContent = name || 'Document Preview';
  document.getElementById('previewDownloadBtn').href  = url;

  const ext     = url.split('?')[0].split('.').pop().toLowerCase();
  const content = document.getElementById('previewContent');
  content.innerHTML = '';

  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) {
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;margin:auto;padding:20px;';
    content.appendChild(img);
  } else if (ext === 'pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    content.appendChild(iframe);
  } else {
    const absoluteUrl = url.startsWith('http') ? url : `${window.location.protocol}//${window.location.host}${url}`;
    const iframe      = document.createElement('iframe');
    iframe.src        = `https://docs.google.com/gview?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    const fallback    = document.createElement('div');
    fallback.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#666;';
    fallback.innerHTML = `<p>Preview unavailable.</p><a href="${url}" target="_blank" style="color:#1E6B44;font-weight:600;">⬇ Download instead</a>`;
    content.style.position = 'relative';
    content.appendChild(iframe);
    content.appendChild(fallback);
    iframe.onload = () => { fallback.style.display = 'none'; };
  }
  document.getElementById('previewBackdrop').classList.add('open');
}

function closePreview() {
  document.getElementById('previewBackdrop').classList.remove('open');
  document.getElementById('previewContent').innerHTML = '';
}

window.openPreview  = openPreview;
window.closePreview = closePreview;

// ── Boot ──
init();
