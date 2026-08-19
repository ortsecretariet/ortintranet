PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tribunals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    short_code TEXT NOT NULL UNIQUE,
    color_hex  TEXT NOT NULL DEFAULT '#123423'
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    email         TEXT UNIQUE,
    role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    tribunal_id   INTEGER NOT NULL REFERENCES tribunals(id) ON DELETE RESTRICT,
    department    TEXT NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS notices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ref           TEXT NOT NULL UNIQUE,
    tribunal_id   INTEGER REFERENCES tribunals(id) ON DELETE SET NULL,
    is_public     INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    notice_date   TEXT NOT NULL,
    is_urgent     INTEGER NOT NULL DEFAULT 0 CHECK (is_urgent IN (0, 1)),
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason TEXT,
    posted_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id   INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    file_size   TEXT,
    file_url    TEXT,
    mime_type   TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS resources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    file_url      TEXT NOT NULL,
    file_size     TEXT,
    tribunal_id   INTEGER REFERENCES tribunals(id) ON DELETE SET NULL,
    is_public     INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
    uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resource_date TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    event_date    TEXT NOT NULL,
    details       TEXT,
    event_scope   TEXT NOT NULL DEFAULT 'general' CHECK (event_scope IN ('general', 'department')),
    department    TEXT,
    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    meta        TEXT,
    notice_ref  TEXT,
    is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notices_tribunal     ON notices(tribunal_id);
CREATE INDEX IF NOT EXISTS idx_notices_status       ON notices(status);
CREATE INDEX IF NOT EXISTS idx_notices_date         ON notices(notice_date DESC);
CREATE INDEX IF NOT EXISTS idx_notices_submitted_by ON notices(submitted_by);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_resources_tribunal   ON resources(tribunal_id);

-- Seed tribunals (all 28)
INSERT OR IGNORE INTO tribunals (name, short_code, color_hex) VALUES
  ('Co-operative Tribunal',                              'CT',    '#64615A'),
  ('Copyright Tribunal',                                 'CPT',   '#2C5F7C'),
  ('Communication & Multimedia Appeals Tribunal',        'CMAT',  '#1E6B44'),
  ('HIV & AIDS Tribunal',                                'HAT',   '#7A2E2E'),
  ('Micro & Small Enterprises Tribunal',                 'MSET',  '#4A5A3E'),
  ('Business Premises Rent Tribunal',                    'BPRT',  '#8C7220'),
  ('Legal Education Appeals Tribunal',                   'LEAT',  '#3B5998'),
  ('National Civil Aviation Administrative Review Tribunal', 'NCAART', '#5A3E6B'),
  ('National Environment Tribunal',                      'NET',   '#2E7D32'),
  ('Transport Licensing Appeals Board',                  'TLAB',  '#6D4C41'),
  ('Sports Disputes Tribunal',                           'SDT',   '#1565C0'),
  ('Standards Tribunal',                                 'ST',    '#4E342E'),
  ('Political Parties Disputes Tribunal',                'PPDT',  '#880E4F'),
  ('Public Private Partnerships Petition Committee',     'PPPPC', '#37474F'),
  ('Energy & Petroleum Tribunal',                        'EPT',   '#E65100'),
  ('National Examinations Appeals Tribunal',             'NEAT',  '#1A237E'),
  ('Retirement Benefits Appeals Tribunal',               'RBAT',  '#4A148C'),
  ('Water Tribunal',                                     'WT',    '#01579B'),
  ('The Financial Centre Tribunal',                      'FCT',   '#006064'),
  ('Public Benefits Organizations Disputes Tribunal',    'PBODT', '#33691E'),
  ('Capital Markets Tribunal',                           'CMT',   '#BF360C'),
  ('Education Appeals Tribunal',                         'EAT',   '#1B5E20'),
  ('Industrial Property Tribunal',                       'IPT',   '#3E2723'),
  ('Tax Appeals Tribunal',                               'TAT',   '#212121'),
  ('Rent Restriction Tribunal',                          'RRT',   '#B71C1C'),
  ('Land Acquisition Tribunal',                          'LAT',   '#827717'),
  ('Competition Tribunal',                               'COMP',  '#263238'),
  ('Sugar Arbitration Tribunal',                         'SAT',   '#558B2F');

-- NOTE: Admin account is seeded by running: node setup.js
-- This is intentionally not in SQL because bcrypt hashes must be generated at runtime.

