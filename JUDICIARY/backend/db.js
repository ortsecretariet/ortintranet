const { DatabaseSync } = require('node:sqlite');
const path             = require('path');
const fs               = require('fs');

const DB_PATH     = path.join(__dirname, 'database.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const isNew = !fs.existsSync(DB_PATH);

class DatabaseWrapper {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath);
    this.isOpen = this.db.isOpen;
  }

  pragma(sql) {
    this.db.exec(`PRAGMA ${sql}`);
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    };
  }
}

const db = new DatabaseWrapper(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(tableName, columnName, definition) {
  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = tableInfo.some(col => col.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

// Bootstrap schema and apply migrations for existing databases
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Migration: rebuild users table to drop the old hardcoded department CHECK constraint
// SQLite cannot ALTER a CHECK constraint, so we recreate the table.
try {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  // Detect old constraint by checking if the new offices are rejected
  // We do this by checking if a known-new department value is in the check constraint.
  // Safest signal: try inserting a temp row and catch — instead just always run
  // the rebuild once by checking for a migration marker column.
  if (!cols.includes('_migrated_dept_check')) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE users_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name     TEXT NOT NULL,
        email         TEXT UNIQUE,
        role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
        tribunal_id   INTEGER NOT NULL REFERENCES tribunals(id) ON DELETE RESTRICT,
        department    TEXT NOT NULL,
        is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        profile_picture TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        last_login_at TEXT
      );
      INSERT INTO users_new SELECT id, user_id, password_hash, full_name, email, role, tribunal_id, department, is_active, profile_picture, created_at, last_login_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
} catch (e) {
  console.error('users table migration failed:', e.message);
}

ensureColumn('users', 'profile_picture', 'profile_picture TEXT');

// Password reset tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )
`);
ensureColumn('resources', 'doc_type', 'doc_type TEXT');
ensureColumn('resources', 'status', "status TEXT NOT NULL DEFAULT 'pending'");
ensureColumn('resources', 'reject_reason', 'reject_reason TEXT');
ensureColumn('resources', 'issuing_office', 'issuing_office TEXT');
ensureColumn('notices',   'issuing_office', 'issuing_office TEXT');
ensureColumn('calendar_events', 'event_scope', "event_scope TEXT NOT NULL DEFAULT 'general'");
ensureColumn('calendar_events', 'department', 'department TEXT');
ensureColumn('calendar_events', 'created_by', 'created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');

module.exports = db;

