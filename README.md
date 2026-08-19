# Judiciary of Kenya — Internal Notice Board

A web-based internal notice board for the Judiciary of Kenya's Tribunals. Tribunal admins post official notices and manage staff memo submissions. Staff get a clean, searchable feed of notices and shared documents scoped to their tribunal. All authenticated staff can submit memos and notices for admin review, with email notifications at every step.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [User Roles](#user-roles)
- [Tribunals](#tribunals)
- [Database](#database)
- [Tech Stack](#tech-stack)
- [Roadmap](#roadmap)

---

## Overview

Staff log in with their **Staff ID and password** and see only the notices and documents relevant to their tribunal, plus any system-wide public notices. The role (`admin` or `staff`) is stored in the database — no hardcoded IDs. Admins are created directly in the database; all self-registrations are staff accounts.

---

## Features

### For All Users
- 🔐 **Authenticated login** — Staff ID + password, session-based auth (8-hour session)
- 👤 **User Profiles** — View and update profile details, including uploading a profile picture.
- 📋 **Notice feed** — Searchable, filterable list of notices scoped to the user's tribunal
- 📌 **Pinned urgent notices** — Urgent items float to the top with a red treatment
- 📁 **Documents tab** — Browse shared resources and notice attachments
- 👁️ **Document Preview** — Built-in modal to preview images, PDFs, and Office documents (via Google Docs Viewer) before downloading.
- 🔔 **Notification bell** — In-app notifications with unread indicator, paired with email alerts.
- 🖨️ **Print support** — Print any notice with or without attachment details

### For Staff
- 📝 **Submit memos** — Draft and submit memos to a tribunal admin for review, complete with file attachments.
- 🏛️ **Issuing office** — Tag a memo with the relevant issuing office or directorate when submitting.
- 🌐 **Audience selector** — Choose to send a memo to your department only or to all staff (general).
- 📂 **My Submissions** — Track memo status (pending / approved / rejected)
- ↩️ **Withdraw memos** — Cancel a pending memo before the admin acts on it
- 📧 **Email Notifications** — Receive a welcome email on account creation, and alerts when a memo is submitted and when it is approved or rejected.

### For Admins
- 📣 **Post notices** — Publish notices immediately to one or all tribunals
- ✅ **Approvals queue** — Review, approve, or reject pending staff memo submissions and resource uploads.
- 📎 **Resource library** — Add shared documents (forms, circulars, templates) via local file upload.
- 👁️ **Cross-tribunal view** — Filter notices and documents dynamically across all tribunals and departments.

---

## Project Structure

```
tribunal_notice_board/
├── .gitignore
├── README.md
├── schema.md               # Full database schema documentation
│
├── JUDICIARY/              # Login & registration frontend
│   ├── index.html          # Login page
│   ├── register.html       # Staff registration page
│   ├── script.js           # Login logic — calls POST /api/auth/login
│   ├── register.js         # Registration logic — calls POST /api/auth/register
│   ├── style.css
│   ├── judiciary-logo.png
│   │
│   └── backend/            # Node.js / Express REST API
│       ├── server.js       # App entry point
│       ├── db.js           # SQLite connection & initialisation (sql.js)
│       ├── schema.sql      # Database schema + tribunal seed data
│       ├── package.json
│       ├── sessions/       # Session files (git-ignored)
│       ├── database.db     # SQLite database file (git-ignored)
│       └── routes/
│           ├── auth.js         # /api/auth/*
│           ├── notices.js      # /api/notices/*
│           ├── resources.js    # /api/resources/*
│           └── notifications.js # /api/notifications/*
│
└── dashboard2/             # Main dashboard frontend
    ├── dashboard.html
    ├── logo.png
    ├── css/
    │   └── style.css
    └── js/
        └── dashboard.js    # Dashboard logic — fetches from API
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- A modern browser (Chrome, Firefox, Edge, Safari)

### 1. Install dependencies

```bash
cd JUDICIARY/backend
npm install
```

### 2. Add the database file

Place the `database.db` file inside `JUDICIARY/backend/`. If you don't have one yet, the backend will create a fresh database automatically on first run using `schema.sql` (tribunals are seeded, but you will need to insert at least one admin user manually).

### 3. Start the backend

```bash
cd JUDICIARY/backend
npm start
# or for auto-reload during development:
npm run dev
```

The API will be available at `http://localhost:3000`.

### 4. Open the frontend

Open `JUDICIARY/index.html` directly in your browser **or** use VS Code Live Server:

1. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
2. Right-click `JUDICIARY/index.html` → **Open with Live Server**
3. App opens at `http://127.0.0.1:5500/JUDICIARY/index.html`

> The frontend expects the backend at `http://localhost:3000`. Both must be running at the same time.

### 5. Create your first admin user

Until the admin management panel is built, insert an admin directly into the database. Use a tool like [DB Browser for SQLite](https://sqlitebrowser.org/) or run:

```bash
cd JUDICIARY/backend
node -e "
const bcrypt = require('bcryptjs');
const { db, dbPromise } = require('./db');
dbPromise.then(() => {
  const hash = bcrypt.hashSync('YourPassword123', 12);
  db.prepare(\`INSERT INTO users (user_id, password_hash, full_name, email, role, tribunal_id, department)
    VALUES (?, ?, ?, ?, 'admin', 1, 'Registry')\`)
    .run('ADMIN-001', hash, 'Your Name', 'admin@tribunal.go.ke');
  console.log('Admin created.');
  process.exit(0);
});
"
```

---

## API Reference

All endpoints are prefixed with `/api`. Requests and responses use JSON. Session cookie is set on login and required for all protected routes.

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/tribunals` | Public | List all tribunals (for registration dropdown) |
| `POST` | `/api/auth/register` | Public | Register a new staff account |
| `POST` | `/api/auth/login` | Public | Login and start a session |
| `POST` | `/api/auth/logout` | Required | Destroy the session |
| `GET` | `/api/auth/me` | Required | Return the current session user |

### Notices

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/notices` | Required | Get notices (scoped by tribunal + role) |
| `GET` | `/api/notices/my-submissions` | Required | Staff: get own memo submissions |
| `POST` | `/api/notices` | Required | Admin: post notice. Staff: submit memo |
| `PATCH` | `/api/notices/:id/status` | Admin | Approve or reject a pending memo |
| `DELETE` | `/api/notices/:id` | Required | Staff: withdraw own pending memo |

### Resources

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/resources` | Required | Get shared documents (scoped by tribunal) |
| `POST` | `/api/resources` | Required | Upload a document. Admin: published immediately. Staff: sent for approval. |
| `PATCH` | `/api/resources/:id/status` | Admin | Approve or reject a pending document upload |
| `DELETE` | `/api/resources/:id` | Admin | Remove a resource |

### Notifications

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | Required | Get current user's notifications (latest 50) |
| `PATCH` | `/api/notifications/read` | Required | Mark all notifications as read |

---

## User Roles

| Role | Description |
|---|---|
| **admin** | Tribunal administrator. Posts notices immediately, manages approvals, uploads resources. Can see all tribunals. |
| **staff** | Regular employee. Reads notices for their tribunal + public notices, submits memos and notices for approval, downloads documents. |

- All self-registrations via `register.html` are created as `staff`.
- Admin accounts are created directly in the database.
- Role is determined entirely by the `role` column in the `users` table — no hardcoded IDs.
- Staff can submit notices/memos scoped to their department or to all staff — these go into the approvals queue before publishing.

---

## Tribunals

| Tribunal | Code |
|---|---|
| Sports Tribunal | ST |
| Employment Tribunal | ET |
| Rent Tribunal | RNT |
| Business Premises Rent Tribunal | BPRT |
| Rent Restriction Tribunal | RRT |
| Cooperative Tribunal | CT |

Notices can be scoped to a single tribunal or published as **Public** (visible to all staff).

---

## Database

The app uses **SQLite** via [sql.js](https://github.com/sql-js/sql.js) (pure JavaScript — no native build tools required).

- The database file is `JUDICIARY/backend/database.db` (git-ignored)
- On first run, `schema.sql` is executed automatically to create all tables and seed the six tribunals
- See [`schema.md`](schema.md) for full table definitions, column details, indexes, and sample seed data

### Tables

| Table | Purpose |
|---|---|
| `tribunals` | Master list of the six tribunals |
| `users` | Staff and admin accounts |
| `notices` | All notices and staff memo submissions |
| `attachments` | Files attached to notices |
| `resources` | Standalone shared documents |
| `notifications` | Per-user in-app notification records |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Vanilla CSS, Vanilla JavaScript (ES2020) |
| Fonts | Google Fonts — Inter |
| Backend | Node.js, Express 4 |
| Database | SQLite 3 via better-sqlite3 |
| Auth | express-session + session-file-store (8-hour sessions) |
| Password hashing | bcryptjs (cost factor 12) |
| Rate limiting | express-rate-limit (10 login attempts / 15 min per IP) |

---

## Environment Variables

Create a `.env` file in `JUDICIARY/backend/` (or set these in your environment) before running in production:

| Variable | Description | Default |
|---|---|---|
| `SESSION_SECRET` | Secret key used to sign session cookies | Insecure fallback string |
| `PORT` | Port the backend listens on | `3000` |

> **Never deploy without setting `SESSION_SECRET` to a long, random string.**

---

## Security Notes

- Login is rate-limited to **10 attempts per IP per 15 minutes** to prevent brute force attacks.
- Session cookies use `httpOnly` and `sameSite: lax`. Set `secure: true` and serve over HTTPS in production.
- The session secret must be set via the `SESSION_SECRET` environment variable in production.
- Request body size is capped at **1 MB** to prevent payload flooding.
- Registration inputs are validated for maximum length (name ≤ 100, staff ID ≤ 50, email ≤ 150 chars).
- Profile pictures and file uploads are stored in `JUDICIARY/backend/uploads/` (git-ignored).

---

## Departments

All staff register under one of the following offices or departments:

| Group | Name |
|---|---|
| Office | Office of the Registrar, Tribunals |
| Department | Human Resource |
| Department | Finance & Accounts |
| Department | ICT |
| Department | Supply Chain Management |
| Department | Administration |
| Department | Legal Services |
| Department | Public Relations & Communication |
| Department | Internal Audit |

Staff in the **Office of the Registrar, Tribunals** must also select their specific tribunal. All other departments are assigned to the system tribunal by default and see public notices.

---

## Roadmap

- [x] Fix post-login redirect — works for both Live Server (port 5500) and backend server (port 3000)
- [x] Wire dashboard.js publish form to `POST /api/notices`
- [x] Wire dashboard.js document upload to `POST /api/resources`
- [x] Wire approve / reject buttons to `PATCH /api/notices/:id/status`
- [x] Wire withdraw button to `DELETE /api/notices/:id`
- [x] Email notifications on memo approval / rejection
- [x] Load real notifications from `GET /api/notifications`
- [x] Admin user-management panel (activate / deactivate / change role)
- [x] Rate limiting on login endpoint
- [x] Profile picture always visible (defaults to logo)
- [x] Full department list on registration form (all 11 offices/departments)
- [x] Welcome email on account creation (includes staff ID, department, login URL, IT support contact)
- [x] Staff can submit notices/memos to all staff or department only, with issuing office tagging
- [ ] Audit log table for all admin actions
- [ ] HTTPS + secure cookie for production deployment
