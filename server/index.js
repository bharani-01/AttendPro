require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const { auth, JWT_SECRET } = require('./middleware/auth');
const { User, RevokedToken } = require('./models');

const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const classRoutes = require('./routes/classes');
const timetableRoutes = require('./routes/timetable');
const attendanceRoutes = require('./routes/attendance');
const auditRoutes = require('./routes/audit');
const leaveRequestRoutes = require('./routes/leaveRequest');
const analyticsRoutes = require('./routes/analytics');
const qrCodeRoutes = require('./routes/qrcode');
const exportRoutes = require('./routes/export');
const userRoutes = require('./routes/user');
const messageRoutes = require('./routes/messages');
const announcementRoutes = require('./routes/announcements');
const rbacRoutes = require('./routes/rbac');
const substitutionRoutes = require('./routes/substitution');
const settingsRoutes = require('./routes/settings');
const securityRoutes = require('./routes/security');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

connectDB();

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (!allowedOrigins.length) {
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('CORS origin denied'));
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS origin denied'));
  }
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (!allowedOrigins.length) {
        if (process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        return callback(new Error('Socket origin denied'));
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Socket origin denied'));
    },
    credentials: true
  }
});

io.use(async (socket, next) => {
  try {
    const authToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (!authToken) {
      return next(new Error('Unauthorized'));
    }

    const token = authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type && decoded.type !== 'access') {
      return next(new Error('Invalid token type'));
    }

    if (decoded.jti) {
      const revoked = await RevokedToken.findOne({ jti: decoded.jti });
      if (revoked) {
        return next(new Error('Token revoked'));
      }
    }

    const user = await User.findById(decoded.userId).select('_id tokenVersion');
    if (!user) {
      return next(new Error('User not found'));
    }

    if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (user.tokenVersion || 0)) {
      return next(new Error('Token is no longer valid'));
    }

    socket.userId = String(user._id);
    return next();
  } catch (err) {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }
});

app.set('io', io);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getUnderstandableResponse(body) {
  if (body === undefined || body === null) {
    return '[no response body]';
  }

  if (Buffer.isBuffer(body)) {
    return `[binary response: ${formatBytes(body.length)}]`;
  }

  if (typeof body === 'string') {
    return body.length > 300 ? `${body.slice(0, 300)}... [truncated]` : body;
  }

  if (typeof body === 'object') {
    if (body.error) return `Error: ${body.error}`;
    if (body.message) return `Message: ${body.message}`;

    const keys = Object.keys(body);
    const keySummary = keys.length ? `Keys: ${keys.join(', ')}` : 'Empty JSON object';
    const jsonPreview = JSON.stringify(body);
    const limitedPreview = jsonPreview.length > 300
      ? `${jsonPreview.slice(0, 300)}... [truncated]`
      : jsonPreview;

    return `${keySummary} | Preview: ${limitedPreview}`;
  }

  return String(body);
}

app.use((req, res, next) => {
  if (!req.originalUrl.startsWith('/api/')) {
    return next();
  }

  const startTime = process.hrtime.bigint();
  const startedAt = new Date();
  const requestSize = Number(req.get('content-length') || 0);
  let responseBody;

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.send = (body) => {
    responseBody = body;
    return originalSend(body);
  };

  res.on('finish', () => {
    const endedAt = new Date();
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;

    let responseSize = Number(res.getHeader('content-length') || 0);
    if (!responseSize && responseBody !== undefined) {
      try {
        if (Buffer.isBuffer(responseBody)) {
          responseSize = responseBody.length;
        } else if (typeof responseBody === 'string') {
          responseSize = Buffer.byteLength(responseBody);
        } else {
          responseSize = Buffer.byteLength(JSON.stringify(responseBody));
        }
      } catch (err) {
        responseSize = 0;
      }
    }

    const understandableResponse = getUnderstandableResponse(responseBody);

    console.log('_____________________________________________________');
    console.log(`Route(Method) : ${req.originalUrl} (${req.method})`);
    console.log(`Time          : ${startedAt.toISOString()} -> ${endedAt.toISOString()}`);
    console.log(`Time Taken    : ${durationMs.toFixed(2)} ms`);
    console.log(`Status        : ${res.statusCode}`);
    console.log(`API Call Size : Request=${formatBytes(requestSize)} | Response=${formatBytes(responseSize)}`);
    console.log(`Response      : ${understandableResponse}`);
    console.log('_____________________________________________________');
  });

  next();
});

const clientPath = path.join(__dirname, '../client');
const htmlPath = path.join(clientPath, 'html');

app.use(express.static(clientPath));

const PUBLIC_API_ROUTES = new Set([
  '/api',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password'
]);

app.get('/api', (req, res) => {
  res.json({
    name: 'Attendance App API',
    status: 'ok',
    version: '1.0.0'
  });
});

app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const routePath = req.originalUrl.split('?')[0];
  if (PUBLIC_API_ROUTES.has(routePath)) {
    return next();
  }
  return auth(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/leave-requests', leaveRequestRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/qr', qrCodeRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/user', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/substitutions', substitutionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/security', securityRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/html/login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/html/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/html/register.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/html/admin-dashboard.html'));
});

app.get('/faculty-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/html/faculty-dashboard.html'));
});

app.get('/student-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/html/student-dashboard.html'));
});

app.get('/html/:file', (req, res) => {
  const file = req.params.file;
  if (file && file.endsWith('.html')) {
    res.sendFile(path.join(htmlPath, file));
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.get('/:file', (req, res, next) => {
  const file = req.params.file;
  if (file && file.endsWith('.html')) {
    res.sendFile(path.join(htmlPath, file));
  } else {
    next();
  }
});

app.use((req, res, next) => {
  if (req.accepts('html')) {
    res.status(404).sendFile(path.join(__dirname, '../client/html/login.html'));
  } else {
    res.status(404).json({ error: 'Route not found' });
  }
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

module.exports = app;
