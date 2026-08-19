require('dotenv').config();

const express = require('express');
const session  = require('express-session');
const FileStore = require('session-file-store')(session);
const cors     = require('cors');
const path     = require('path');

const authRoutes          = require('./routes/auth');
const noticesRoutes       = require('./routes/notices');
const resourcesRoutes     = require('./routes/resources');
const notificationsRoutes = require('./routes/notifications');
const usersRoutes         = require('./routes/users');
const eventsRoutes        = require('./routes/events');

const app  = express();
const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const findFreePort = (startPort, maxPort = startPort + 9) => new Promise((resolve, reject) => {
  const net = require('net');
  const tryPort = (port) => {
    if (port > maxPort) {
      return reject(new Error(`No available port found between ${startPort} and ${maxPort}`));
    }
    const server = net.createServer();
    server.once('error', () => {
      server.close(() => tryPort(port + 1));
    });
    server.once('listening', () => {
      server.close(() => resolve(port));
    });
    server.listen(port, '0.0.0.0');
  };
  tryPort(startPort);
});

// Allow requests from any localhost origin (Live Server, direct file open, etc.)
// MUST be first — before express.json — so OPTIONS preflight gets CORS headers
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin (no Origin header), null (file://), localhost, and private LAN addresses.
    if (!origin || origin === 'null' ||
        /^(https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)(:\d+)?)$/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS: Not allowed'));
  },
  credentials: true
}));

app.use(express.json());

// Session middleware
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'sessions'),
    ttl: 28800,
    retries: 1
  }),
  secret: 'tribunal-intranet-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,       // set true when serving over HTTPS
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// Serve JUDICIARY frontend (login / register pages)
app.use(express.static(path.join(__dirname, '..')));

// Serve dashboard2 frontend
app.use(express.static(path.join(__dirname, '..', '..', 'dashboard2')));

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth',          authRoutes);
app.use('/api/notices',       noticesRoutes);
app.use('/api/resources',     resourcesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/events',        eventsRoutes);

// 404 fallback for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

// Start server — db is synchronous now, no promise needed
findFreePort(DEFAULT_PORT)
  .then((port) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`\n✅  Tribunal backend running at http://localhost:${port}`);
      console.log(`    Login page  → http://localhost:${port}/index.html`);
      console.log(`    Dashboard   → http://localhost:${port}/dashboard.html`);
      console.log(`\n    Default admin: ADMIN001 / Admin@1234\n`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌  Port ${port} is already in use.\n`);
        console.error(`    Either stop the process using this port or set PORT to another value.`);
      } else {
        console.error(err);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error(`\n❌  Failed to find an available port starting at ${DEFAULT_PORT}.`);
    console.error(err.message);
    process.exit(1);
  });
