const crypto = require('crypto');
const { User, AuditLog, Subject, Class, AppSetting } = require('../models');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeAccessToken,
  decodeTokenExpiry,
  JWT_REFRESH_SECRET
} = require('../middleware/auth');
const {
  sendAdminGeneratedPasswordEmail,
  sendPasswordResetEmail,
  sendTemplatedEmail,
  getEmailTemplateKeys
} = require('../services/emailService');
const { evaluateAutomaticEmailPolicy } = require('../services/emailPolicyService');
const { logEmailEvent } = require('../services/emailEventService');

const IP_WINDOW_MS = 15 * 60 * 1000;
const ipLoginAttempts = new Map();
const SOFT_LOCK_MAX_ATTEMPTS = parseInt(process.env.SOFT_LOCK_MAX_ATTEMPTS || '5', 10);
const SOFT_LOCK_MINUTES = parseInt(process.env.SOFT_LOCK_MINUTES || '15', 10);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueTokenPair(user) {
  const accessToken = generateAccessToken(user._id, user.tokenVersion || 0);
  const refreshToken = generateRefreshToken(user._id, user.tokenVersion || 0);
  const refreshHash = hashToken(refreshToken);
  const refreshExpiry = decodeTokenExpiry(refreshToken, JWT_REFRESH_SECRET);

  if (refreshExpiry) {
    user.refreshTokens.push({
      tokenHash: refreshHash,
      expiresAt: refreshExpiry
    });
  }

  user.refreshTokens = (user.refreshTokens || []).filter((entry) => {
    if (!entry) return false;
    const isExpired = entry.expiresAt && new Date(entry.expiresAt) <= new Date();
    return !isExpired;
  });

  return { accessToken, refreshToken, refreshHash };
}

function getClientIp(req) {
  return req.ip || req.connection.remoteAddress || 'Unknown';
}

function getRecentIpAttemptCount(ipAddress) {
  const now = Date.now();
  const timestamps = ipLoginAttempts.get(ipAddress) || [];
  const recent = timestamps.filter((ts) => now - ts <= IP_WINDOW_MS);
  ipLoginAttempts.set(ipAddress, recent);
  return recent.length;
}

function recordIpFailedAttempt(ipAddress) {
  const now = Date.now();
  const timestamps = ipLoginAttempts.get(ipAddress) || [];
  const recent = timestamps.filter((ts) => now - ts <= IP_WINDOW_MS);
  recent.push(now);
  ipLoginAttempts.set(ipAddress, recent);
}

function clearIpFailedAttempts(ipAddress) {
  ipLoginAttempts.delete(ipAddress);
}

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * chars.length);
    password += chars[idx];
  }
  return password;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizePhoneList(input) {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map((item) => normalizeOptionalString(item)).filter(Boolean)));
  }

  const raw = normalizeOptionalString(input);
  if (!raw) return [];

  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((part) => normalizeOptionalString(part))
        .filter(Boolean)
    )
  );
}

function normalizeDob(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function getConfiguredDefaultUserPassword() {
  try {
    const setting = await AppSetting.findOne({ key: 'adminConfig' }).select('value');
    const configured = normalizeOptionalString(setting?.value?.defaultUserPassword);
    return configured || 'password';
  } catch (_error) {
    return 'password';
  }
}

async function upsertLoginFailureLog({
  userId = null,
  userName = 'unknown',
  userRole = 'unknown',
  attemptedEmail = '',
  ipAddress = 'Unknown',
  routePath = '/api/auth/login',
  userAgent = '',
  details = 'Failed login attempt'
}) {
  const now = new Date();

  const baseQuery = {
    action: 'LOGIN_FAILED',
    status: 'FAILED',
    ipAddress,
    routePath,
    attemptedEmail: attemptedEmail || ''
  };

  if (userId) {
    baseQuery.userId = userId;
  }

  const existing = await AuditLog.findOne(baseQuery).sort({ timestamp: -1 });
  if (existing) {
    existing.attemptCount = (existing.attemptCount || 1) + 1;
    existing.lastAttemptAt = now;
    existing.details = `${details} (attempts: ${existing.attemptCount})`;
    await existing.save();
    return existing;
  }

  return AuditLog.create({
    userId,
    userName,
    userRole,
    action: 'LOGIN_FAILED',
    details: `${details} (attempts: 1)`,
    entityType: 'AUTH',
    ipAddress,
    routePath,
    userAgent,
    attemptedEmail: attemptedEmail || '',
    attemptCount: 1,
    firstAttemptAt: now,
    lastAttemptAt: now,
    status: 'FAILED'
  });
}

const authController = {
  async register(req, res) {
    try {
      const {
        name,
        email,
        password,
        department,
        uniqueId,
        phone,
        parentEmail,
        parentPhone,
        parentPhones,
        dob,
        batch,
        year
      } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const userData = {
        name,
        email: email.toLowerCase(),
        password,
        role: 'student',
        assignedClass: null,
        assignedSubjects: []
      };
      
      if (department) userData.department = department;
      if (uniqueId) userData.uniqueId = uniqueId;
      if (batch !== undefined) userData.batch = batch;
      if (year !== undefined && year !== null && year !== '') userData.year = parseInt(year, 10);

      const normalizedPhone = normalizeOptionalString(phone);
      const normalizedParentEmail = normalizeOptionalString(parentEmail).toLowerCase();
      const mergedParentPhones = normalizePhoneList(parentPhones && Array.isArray(parentPhones) ? parentPhones : (parentPhones || parentPhone));
      const normalizedDob = normalizeDob(dob);

      if (normalizedPhone) userData.phone = normalizedPhone;
      if (normalizedParentEmail) userData.parentEmail = normalizedParentEmail;
      if (mergedParentPhones.length) {
        userData.parentPhones = mergedParentPhones;
        userData.parentPhone = mergedParentPhones[0];
      }
      if (normalizedDob) userData.dob = normalizedDob;

      const user = new User(userData);

      await user.save();

      const { accessToken, refreshToken } = issueTokenPair(user);

      await user.save();

      await AuditLog.create({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'CREATE',
        details: `New ${user.role} user registered: ${user.email}`,
        entityType: 'USER',
        entityId: user._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: user.toJSON(),
        token: accessToken,
        refreshToken
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;
      const ipAddress = getClientIp(req);
      const userAgent = req.get('user-agent') || '';

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        await upsertLoginFailureLog({
          userId: null,
          userName: email,
          userRole: 'unknown',
          attemptedEmail: email.toLowerCase(),
          ipAddress,
          routePath: req.originalUrl,
          userAgent,
          details: `Failed login with non-existent email: ${email}. IP attempt count (15m): ${getRecentIpAttemptCount(ipAddress) + 1}`
        });
        recordIpFailedAttempt(ipAddress);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (user.isBlocked) {
        await upsertLoginFailureLog({
          userId: user._id,
          userName: user.name,
          userRole: user.role,
          attemptedEmail: user.email,
          ipAddress,
          routePath: req.originalUrl,
          userAgent,
          details: `Blocked user login attempt: ${user.email}. Block reason: ${user.blockedReason || 'Not provided'}`
        });

        return res.status(403).json({
          error: 'Your account is blocked by admin. Please contact administrator.'
        });
      }

      if (user.loginLockUntil && new Date(user.loginLockUntil) > new Date()) {
        const remainingMs = new Date(user.loginLockUntil).getTime() - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));

        await upsertLoginFailureLog({
          userId: user._id,
          userName: user.name,
          userRole: user.role,
          attemptedEmail: user.email,
          ipAddress,
          routePath: req.originalUrl,
          userAgent,
          details: `Login denied: account temporarily locked for ${remainingMinutes} more minute(s)`
        });

        return res.status(423).json({
          error: `Account temporarily locked due to repeated failed logins. Try again in ${remainingMinutes} minute(s) or contact admin.`
        });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        user.lastFailedLoginAt = new Date();

        if (user.failedLoginAttempts >= SOFT_LOCK_MAX_ATTEMPTS) {
          user.loginLockUntil = new Date(Date.now() + SOFT_LOCK_MINUTES * 60 * 1000);
        }

        await user.save();

        await upsertLoginFailureLog({
          userId: user._id,
          userName: user.name,
          userRole: user.role,
          attemptedEmail: user.email,
          ipAddress,
          routePath: req.originalUrl,
          userAgent,
          details: `Failed login attempt for user: ${user.email}. User failed attempts: ${user.failedLoginAttempts}. IP attempt count (15m): ${getRecentIpAttemptCount(ipAddress) + 1}${user.loginLockUntil ? `. Soft lock until: ${user.loginLockUntil.toISOString()}` : ''}`
        });

        recordIpFailedAttempt(ipAddress);

        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (user.failedLoginAttempts || user.lastFailedLoginAt) {
        user.failedLoginAttempts = 0;
        user.lastFailedLoginAt = null;
      }

      if (user.loginLockUntil) {
        user.loginLockUntil = null;
      }

      clearIpFailedAttempts(ipAddress);

      const { accessToken, refreshToken } = issueTokenPair(user);

      await user.save();

      await AuditLog.create({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'LOGIN',
        details: `User logged in: ${user.email}`,
        entityType: 'AUTH',
        ipAddress,
        routePath: req.originalUrl,
        userAgent,
        status: 'SUCCESS'
      });

      res.json({
        message: 'Login successful',
        user: user.toJSON(),
        token: accessToken,
        refreshToken
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async logout(req, res) {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown';
      const userAgent = req.get('user-agent') || '';
      const providedRefreshToken = req.body?.refreshToken;

      if (providedRefreshToken) {
        const refreshHash = hashToken(providedRefreshToken);
        await User.updateOne(
          { _id: req.user._id, 'refreshTokens.tokenHash': refreshHash },
          {
            $set: {
              'refreshTokens.$.revokedAt': new Date()
            }
          }
        );
      }

      await revokeAccessToken(req.tokenPayload, 'logout');

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'LOGOUT',
        details: `User logged out: ${req.user.email}`,
        entityType: 'AUTH',
        ipAddress,
        userAgent,
        status: 'SUCCESS'
      });

      res.json({ message: 'Logout successful' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id)
        .populate('assignedClass')
        .populate('assignedSubjects');

      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getAllUsers(req, res) {
    try {
      const {
        role,
        search,
        department,
        year,
        batch,
        classId,
        page,
        limit,
      } = req.query;

      const query = {};
      if (role) query.role = role;
      if (department) query.department = department;
      if (year) query.year = parseInt(year, 10);
      if (batch) query.batch = batch;
      if (classId) query.assignedClass = classId;

      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { uniqueId: searchRegex },
        ];
      }

      const parsedLimit = Number(limit || 0);
      const parsedPage = Math.max(Number(page || 1), 1);

      const userQuery = User.find(query)
        .populate('assignedClass', 'className department year batch')
        .populate('assignedSubjects', 'subjectName subjectCode')
        .sort({ createdAt: -1 });

      if (parsedLimit > 0) {
        const safeLimit = Math.min(Math.max(parsedLimit, 1), 500);
        const skip = (parsedPage - 1) * safeLimit;

        userQuery.skip(skip).limit(safeLimit);

        const [users, total] = await Promise.all([
          userQuery,
          User.countDocuments(query),
        ]);

        return res.json({
          users,
          pagination: {
            page: parsedPage,
            limit: safeLimit,
            total,
            hasMore: skip + users.length < total,
          },
        });
      }

      const users = await userQuery;

      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getUserStats(req, res) {
    try {
      const [totalStudents, totalFaculty, totalSubjects, totalClasses] = await Promise.all([
        User.countDocuments({ role: 'student' }),
        User.countDocuments({ role: 'faculty' }),
        Subject.countDocuments(),
        Class.countDocuments(),
      ]);

      res.json({
        stats: {
          totalStudents,
          totalFaculty,
          totalSubjects,
          totalClasses,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const {
        name,
        email,
        password,
        assignedClass,
        assignedSubjects,
        phone,
        parentEmail,
        parentPhone,
        parentPhones,
        dob
      } = req.body;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const changes = [];
      if (name && name !== user.name) changes.push(`name: "${user.name}" -> "${name}"`);
      if (email && email.toLowerCase() !== user.email) changes.push(`email: "${user.email}" -> "${email}"`);
      if (assignedClass !== undefined) changes.push(`class changed`);
      if (assignedSubjects !== undefined) changes.push(`subjects changed`);
      if (phone !== undefined) changes.push('phone changed');
      if (parentEmail !== undefined) changes.push('parent email changed');
      if (parentPhone !== undefined || parentPhones !== undefined) changes.push('parent numbers changed');
      if (dob !== undefined) changes.push('dob changed');
      if (password) changes.push('password changed');

      if (name) user.name = name;
      if (email) user.email = email.toLowerCase();
      if (assignedClass !== undefined) user.assignedClass = assignedClass;
      if (assignedSubjects !== undefined) user.assignedSubjects = assignedSubjects;
      if (phone !== undefined) user.phone = normalizeOptionalString(phone);
      if (parentEmail !== undefined) user.parentEmail = normalizeOptionalString(parentEmail).toLowerCase();
      if (parentPhone !== undefined || parentPhones !== undefined) {
        const normalized = normalizePhoneList(parentPhones && Array.isArray(parentPhones) ? parentPhones : (parentPhones || parentPhone));
        user.parentPhones = normalized;
        user.parentPhone = normalized[0] || '';
      }
      if (dob !== undefined) {
        user.dob = normalizeDob(dob);
      }
      if (password) user.password = password;

      await user.save();

      const updatedUser = await User.findById(id)
        .populate('assignedClass')
        .populate('assignedSubjects');

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE',
        details: `Updated user ${user.email}: ${changes.join(', ')}`,
        entityType: 'USER',
        entityId: user._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      res.json({ message: 'User updated successfully', user: updatedUser.toJSON() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await User.findByIdAndDelete(id);

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'DELETE',
        details: `Deleted user: ${user.email} (${user.role})`,
        entityType: 'USER',
        entityId: user._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async addStudent(req, res) {
    try {
      const {
        name,
        email,
        uniqueId,
        year,
        department,
        batch,
        assignedClass,
        phone,
        parentEmail,
        parentPhone,
        parentPhones,
        dob
      } = req.body;

      if (!name || !email || !uniqueId || !year || !department) {
        return res.status(400).json({ error: 'Name, email, unique ID, year, and department are required' });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const existingUniqueId = await User.findOne({ uniqueId });
      if (existingUniqueId) {
        return res.status(400).json({ error: 'Unique ID already exists' });
      }

      const defaultPassword = await getConfiguredDefaultUserPassword();

      const student = new User({
        name,
        email: email.toLowerCase(),
        password: defaultPassword,
        role: 'student',
        uniqueId,
        year: parseInt(year),
        department,
        batch: batch || '',
        assignedClass: assignedClass || null
      });

      const normalizedPhone = normalizeOptionalString(phone);
      const normalizedParentEmail = normalizeOptionalString(parentEmail).toLowerCase();
      const mergedParentPhones = normalizePhoneList(parentPhones && Array.isArray(parentPhones) ? parentPhones : (parentPhones || parentPhone));
      const normalizedDob = normalizeDob(dob);

      if (normalizedPhone) student.phone = normalizedPhone;
      if (normalizedParentEmail) student.parentEmail = normalizedParentEmail;
      if (mergedParentPhones.length) {
        student.parentPhones = mergedParentPhones;
        student.parentPhone = mergedParentPhones[0];
      }
      if (normalizedDob) student.dob = normalizedDob;

      await student.save();

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE',
        details: `New student added: ${student.email} (${uniqueId})`,
        entityType: 'USER',
        entityId: student._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      res.status(201).json({
        message: 'Student added successfully',
        student: student.toJSON()
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Email or Unique ID already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  },

  async addFaculty(req, res) {
    try {
      const {
        name,
        email,
        uniqueId,
        department,
        password,
        assignedSubjects,
        phone,
        parentEmail,
        parentPhone,
        parentPhones,
        dob,
        batch,
        year,
        assignedClass
      } = req.body;

      if (!name || !email || !uniqueId || !department) {
        return res.status(400).json({ error: 'Name, email, unique ID, and department are required' });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const existingUniqueId = await User.findOne({ uniqueId });
      if (existingUniqueId) {
        return res.status(400).json({ error: 'Unique ID already exists' });
      }

      const defaultPassword = await getConfiguredDefaultUserPassword();

      let resolvedSubjectIds = [];
      if (Array.isArray(assignedSubjects) && assignedSubjects.length > 0) {
        const subjectDocs = await Subject.find({ _id: { $in: assignedSubjects } }).select('_id');
        resolvedSubjectIds = subjectDocs.map((doc) => doc._id);
      }

      const faculty = new User({
        name,
        email: email.toLowerCase(),
        password: normalizeOptionalString(password) || defaultPassword,
        role: 'faculty',
        uniqueId,
        department,
        batch: normalizeOptionalString(batch),
        year: year ? parseInt(year, 10) : undefined,
        assignedClass: assignedClass || null,
        assignedSubjects: resolvedSubjectIds
      });

      const normalizedPhone = normalizeOptionalString(phone);
      const normalizedParentEmail = normalizeOptionalString(parentEmail).toLowerCase();
      const mergedParentPhones = normalizePhoneList(parentPhones && Array.isArray(parentPhones) ? parentPhones : (parentPhones || parentPhone));
      const normalizedDob = normalizeDob(dob);

      if (normalizedPhone) faculty.phone = normalizedPhone;
      if (normalizedParentEmail) faculty.parentEmail = normalizedParentEmail;
      if (mergedParentPhones.length) {
        faculty.parentPhones = mergedParentPhones;
        faculty.parentPhone = mergedParentPhones[0];
      }
      if (normalizedDob) faculty.dob = normalizedDob;

      await faculty.save();

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE',
        details: `New faculty added: ${faculty.email} (${uniqueId})`,
        entityType: 'USER',
        entityId: faculty._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      return res.status(201).json({
        message: 'Faculty added successfully',
        faculty: faculty.toJSON()
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Email or Unique ID already exists' });
      }
      return res.status(500).json({ error: error.message });
    }
  },

  async bulkAddFaculty(req, res) {
    try {
      const { faculty } = req.body;

      if (!faculty || !Array.isArray(faculty) || faculty.length === 0) {
        return res.status(400).json({ error: 'faculty array is required' });
      }

      const defaultPassword = await getConfiguredDefaultUserPassword();

      const results = { success: [], failed: [] };

      for (const facultyData of faculty) {
        try {
          let {
            name,
            email,
            uniqueId,
            department,
            password,
            assignedSubjects,
            assignedSubjectCodes,
            phone,
            parentEmail,
            parentPhone,
            parentPhones,
            dob,
            batch,
            year,
            assignedClass
          } = facultyData;

          if (typeof name === 'string') name = name.trim();
          if (typeof email === 'string') email = email.trim().toLowerCase();
          if (typeof uniqueId === 'string') uniqueId = uniqueId.trim();
          if (typeof department === 'string') department = department.trim();
          if (typeof batch === 'string') batch = batch.trim();
          if (typeof phone === 'string') phone = phone.trim();
          if (typeof parentEmail === 'string') parentEmail = parentEmail.trim().toLowerCase();

          if (!name || !email || !uniqueId || !department) {
            results.failed.push({ email: email || 'unknown', reason: 'Missing required fields' });
            continue;
          }

          const existingUser = await User.findOne({ email });
          if (existingUser) {
            results.failed.push({ email, reason: 'Email already exists' });
            continue;
          }

          const existingUniqueId = await User.findOne({ uniqueId });
          if (existingUniqueId) {
            results.failed.push({ email, reason: 'Unique ID already exists' });
            continue;
          }

          let resolvedSubjectIds = [];
          if (Array.isArray(assignedSubjects) && assignedSubjects.length) {
            const byId = await Subject.find({ _id: { $in: assignedSubjects } }).select('_id');
            resolvedSubjectIds = byId.map((doc) => doc._id);
          } else {
            const rawCodes = Array.isArray(assignedSubjectCodes)
              ? assignedSubjectCodes
              : normalizeOptionalString(assignedSubjectCodes).split(/[\n,;|]+/);
            const codes = rawCodes.map((item) => normalizeOptionalString(item).toUpperCase()).filter(Boolean);
            if (codes.length) {
              const byCode = await Subject.find({ subjectCode: { $in: codes } }).select('_id');
              resolvedSubjectIds = byCode.map((doc) => doc._id);
            }
          }

          const facultyUser = new User({
            name,
            email,
            password: normalizeOptionalString(password) || defaultPassword,
            role: 'faculty',
            uniqueId,
            department,
            batch: normalizeOptionalString(batch),
            year: year ? parseInt(year, 10) : undefined,
            assignedClass: assignedClass || null,
            assignedSubjects: resolvedSubjectIds
          });

          const normalizedParentPhones = normalizePhoneList(
            parentPhones && Array.isArray(parentPhones) ? parentPhones : (parentPhones || parentPhone)
          );
          const normalizedDob = normalizeDob(dob);

          if (phone) facultyUser.phone = phone;
          if (parentEmail) facultyUser.parentEmail = parentEmail;
          if (normalizedParentPhones.length) {
            facultyUser.parentPhones = normalizedParentPhones;
            facultyUser.parentPhone = normalizedParentPhones[0];
          }
          if (normalizedDob) facultyUser.dob = normalizedDob;

          await facultyUser.save();
          results.success.push({ email: facultyUser.email, uniqueId: facultyUser.uniqueId });
        } catch (err) {
          results.failed.push({ email: facultyData?.email || 'unknown', reason: err.message });
        }
      }

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE',
        details: `Bulk faculty addition: ${results.success.length} added, ${results.failed.length} failed`,
        entityType: 'USER',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: results.failed.length > 0 ? 'FAILED' : 'SUCCESS'
      });

      return res.json({
        message: `Added ${results.success.length} faculty`,
        results
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async bulkAddStudents(req, res) {
    try {
      const { students } = req.body;

      if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'Students array is required' });
      }

      const defaultPassword = await getConfiguredDefaultUserPassword();

      console.log('Received students data:', JSON.stringify(students).substring(0, 500));
      console.log('Received students data:', JSON.stringify(students).substring(0, 1000));
      const results = { success: [], failed: [] };

      for (const studentData of students) {
        try {
          let {
            name,
            email,
            uniqueId,
            year,
            department,
            batch,
            assignedClass,
            phone,
            parentEmail,
            parentPhone,
            parentPhones,
            dob
          } = studentData;

          // Trim all string values
          if (typeof name === 'string') name = name.trim();
          if (typeof email === 'string') email = email.trim();
          if (typeof uniqueId === 'string') uniqueId = uniqueId.trim();
          if (typeof department === 'string') department = department.trim();
          if (typeof batch === 'string') batch = batch ? batch.trim() : '';
          if (typeof phone === 'string') phone = phone.trim();
          if (typeof parentEmail === 'string') parentEmail = parentEmail.trim().toLowerCase();
          if (typeof parentPhone === 'string') parentPhone = parentPhone.trim();
          
          // Convert year to number BEFORE validation
          if (year !== undefined && year !== null && year !== '') {
            year = parseInt(year);
            if (isNaN(year)) {
              year = null;
            }
          }

          console.log('Processing student:', { name, email, uniqueId, year, department, type: typeof year });

          if (!name || !email || !uniqueId || !year || !department) {
            results.failed.push({ email: email || 'unknown', reason: `Missing fields - name:${!!name} email:${!!email} uid:${!!uniqueId} year:${year} dept:${!!department}` });
            continue;
          }

          const existingUser = await User.findOne({ email: email.toLowerCase() });
          if (existingUser) {
            results.failed.push({ email, reason: 'Email already exists' });
            continue;
          }

          const existingUniqueId = await User.findOne({ uniqueId });
          if (existingUniqueId) {
            results.failed.push({ email, reason: 'Unique ID already exists' });
            continue;
          }

          const student = new User({
            name,
            email: email.toLowerCase(),
            password: defaultPassword,
            role: 'student',
            uniqueId,
            year: parseInt(year),
            department,
            batch: batch || '',
            assignedClass: assignedClass || null
          });

          const normalizedParentPhones = normalizePhoneList(
            parentPhones && Array.isArray(parentPhones) ? parentPhones : (parentPhones || parentPhone)
          );
          const normalizedDob = normalizeDob(dob);

          if (phone) student.phone = phone;
          if (parentEmail) student.parentEmail = parentEmail;
          if (normalizedParentPhones.length) {
            student.parentPhones = normalizedParentPhones;
            student.parentPhone = normalizedParentPhones[0];
          }
          if (normalizedDob) student.dob = normalizedDob;

          await student.save();
          results.success.push({ email: student.email, uniqueId: student.uniqueId });
        } catch (err) {
          results.failed.push({ email: studentData.email, reason: err.message });
        }
      }

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE',
        details: `Bulk student addition: ${results.success.length} added, ${results.failed.length} failed`,
        entityType: 'USER',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent') || '',
        status: results.failed.length > 0 ? 'FAILED' : 'SUCCESS'
      });

      res.json({
        message: `Added ${results.success.length} students`,
        results
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const normalizedEmail = String(email || '').toLowerCase().trim();
      if (!normalizedEmail) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        // Return a generic response to avoid account enumeration.
        return res.status(200).json({ message: 'If the account exists, a reset link will be sent.' });
      }

      const policy = await evaluateAutomaticEmailPolicy('passwordReset');
      if (!policy.allowed) {
        await logEmailEvent({
          triggerKey: 'passwordReset',
          templateKey: 'password_reset',
          recipientEmail: user.email,
          status: 'skipped',
          source: 'auto',
          actorUserId: user._id,
          errorMessage: policy.reason === 'within-quiet-hours'
            ? 'Skipped due to configured quiet hours'
            : 'Automatic email disabled by admin settings',
          metadata: {
            flow: 'forgot-password',
            policyReason: policy.reason,
          },
        });
        return res.status(200).json({ message: 'If the account exists, a reset link will be sent.' });
      }

      // Generate token
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(20).toString('hex');

      // Hash token and set to resetPasswordToken field
      user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Set expire
      user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hr

      await user.save();

      // Also log the reset link to the console for easy local testing
      if (process.env.NODE_ENV !== 'production' && process.env.LOG_PASSWORD_RESET_LINKS === 'true') {
        const resetLink = `${process.env.BASE_URL || 'http://localhost:3000'}/html/reset-password.html?token=${resetToken}`;
        console.log(`\n--- PASSWORD RESET LINK FOR ${user.email} ---\n${resetLink}\n------------------------------------------\n`);
      }

      let emailSent = false;
      let emailError = '';
      try {
        emailSent = await sendPasswordResetEmail(user.email, resetToken);
      } catch (err) {
        emailError = err.message;
      }

      await logEmailEvent({
        triggerKey: 'passwordReset',
        templateKey: 'password_reset',
        recipientEmail: user.email,
        status: emailSent ? 'success' : 'failed',
        source: 'auto',
        actorUserId: user._id,
        errorMessage: emailSent ? '' : emailError || 'Email service returned failure',
        metadata: {
          flow: 'forgot-password',
        },
      });

      if (emailSent) {
        res.status(200).json({ message: 'Email sent' });
      } else {
        // In local development, we can still return 200 so the user isn't stuck
        if (process.env.NODE_ENV !== 'production') {
            res.status(200).json({ message: 'Fallback: Check terminal logs for the reset link.', details: emailError });
        } else {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save();
            res.status(500).json({ error: 'Email could not be sent.', details: emailError });
        }
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      // Get hashed token
      const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

      const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Set new password
      user.password = newPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.refreshTokens = [];
      
      await user.save();

      res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async adminResetUserPassword(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const tempPassword = generateRandomPassword(12);
      user.password = tempPassword;
      user.failedLoginAttempts = 0;
      user.lastFailedLoginAt = null;
      user.loginLockUntil = null;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.refreshTokens = [];
      await user.save();

      let emailSent = false;
      let emailError = '';
      let emailSkippedBySettings = false;
      const policy = await evaluateAutomaticEmailPolicy('adminPasswordReset');

      if (!policy.allowed) {
        emailSkippedBySettings = true;
        await logEmailEvent({
          triggerKey: 'adminPasswordReset',
          templateKey: 'admin_password_reset',
          recipientEmail: user.email,
          status: 'skipped',
          source: 'auto',
          actorUserId: req.user._id,
          errorMessage: policy.reason === 'within-quiet-hours'
            ? 'Skipped due to configured quiet hours'
            : 'Automatic email disabled by admin settings',
          metadata: {
            targetUserId: user._id,
            flow: 'admin-reset-password',
            policyReason: policy.reason,
          },
        });
      } else {
        try {
          await sendAdminGeneratedPasswordEmail(user.email, tempPassword);
          emailSent = true;
        } catch (err) {
          emailError = err.message;
        }

        await logEmailEvent({
          triggerKey: 'adminPasswordReset',
          templateKey: 'admin_password_reset',
          recipientEmail: user.email,
          status: emailSent ? 'success' : 'failed',
          source: 'auto',
          actorUserId: req.user._id,
          errorMessage: emailSent ? '' : emailError || 'Email service returned failure',
          metadata: {
            targetUserId: user._id,
            flow: 'admin-reset-password',
          },
        });
      }

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE',
        details: `Admin reset password for user ${user.email}. Email sent: ${emailSent}`,
        entityType: 'AUTH',
        entityId: user._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        routePath: req.originalUrl,
        userAgent: req.get('user-agent') || '',
        status: emailSent ? 'SUCCESS' : 'FAILED'
      });

      if (emailSkippedBySettings) {
        return res.json({
          message: 'Password reset completed. Admin-password email trigger is disabled by settings.'
        });
      }

      if (!emailSent) {
        if (process.env.NODE_ENV !== 'production') {
          return res.json({
            message: 'Password reset done, but email failed. Temporary password returned for local testing only.',
            tempPassword,
            emailError
          });
        }

        return res.status(500).json({ error: `Password reset done but email failed: ${emailError}` });
      }

      res.json({ message: 'Password reset successfully and sent to user email.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async sendTemplatedEmailToUser(req, res) {
    try {
      const { id } = req.params;
      const { templateKey, subject, variables } = req.body || {};

      if (!templateKey) {
        return res.status(400).json({ error: 'templateKey is required' });
      }

      const allowedTemplates = getEmailTemplateKeys();
      if (!allowedTemplates.includes(templateKey)) {
        return res.status(400).json({
          error: 'Invalid templateKey',
          availableTemplates: allowedTemplates
        });
      }

      const user = await User.findById(id).select('email name role');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await sendTemplatedEmail({
        to: user.email,
        templateKey,
        subject,
        variables: {
          recipientName: user.name,
          recipientRole: user.role,
          ...(variables || {})
        }
      });

      await logEmailEvent({
        triggerKey: 'customTemplated',
        templateKey,
        recipientEmail: user.email,
        status: 'success',
        source: 'manual',
        actorUserId: req.user._id,
        metadata: {
          flow: 'admin-send-templated-email',
          targetUserId: user._id,
        },
      });

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE',
        details: `Admin sent templated email "${templateKey}" to ${user.email}`,
        entityType: 'AUTH',
        entityId: user._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        routePath: req.originalUrl,
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      return res.json({
        message: 'Templated email sent successfully',
        sentTo: user.email,
        templateKey
      });
    } catch (error) {
      await logEmailEvent({
        triggerKey: 'customTemplated',
        templateKey: String(req.body?.templateKey || ''),
        recipientEmail: '',
        status: 'failed',
        source: 'manual',
        actorUserId: req.user?._id || null,
        errorMessage: error.message,
        metadata: {
          flow: 'admin-send-templated-email',
          targetUserId: req.params?.id || '',
        },
      });

      return res.status(500).json({ error: error.message });
    }
  },

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }

      const decoded = verifyRefreshToken(refreshToken);
      if (decoded.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid refresh token type' });
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      if (user.isBlocked) {
        return res.status(403).json({ error: 'Account is blocked' });
      }

      if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
        user.refreshTokens = [];
        await user.save();
        return res.status(401).json({ error: 'Refresh token is no longer valid' });
      }

      const incomingHash = hashToken(refreshToken);
      const existingTokenEntry = (user.refreshTokens || []).find((entry) => entry.tokenHash === incomingHash);

      if (!existingTokenEntry) {
        user.refreshTokens = [];
        await user.save();
        return res.status(401).json({ error: 'Refresh token not recognized' });
      }

      if (existingTokenEntry.revokedAt) {
        user.refreshTokens = [];
        await user.save();
        return res.status(401).json({ error: 'Refresh token has been revoked' });
      }

      if (new Date(existingTokenEntry.expiresAt) <= new Date()) {
        user.refreshTokens = user.refreshTokens.filter((entry) => entry.tokenHash !== incomingHash);
        await user.save();
        return res.status(401).json({ error: 'Refresh token has expired' });
      }

      const { accessToken, refreshToken: rotatedRefreshToken, refreshHash: newRefreshHash } = issueTokenPair(user);

      const existingIdx = user.refreshTokens.findIndex((entry) => entry.tokenHash === incomingHash);
      if (existingIdx >= 0) {
        user.refreshTokens[existingIdx].revokedAt = new Date();
        user.refreshTokens[existingIdx].replacedByTokenHash = newRefreshHash;
      }

      await user.save();

      return res.json({
        token: accessToken,
        refreshToken: rotatedRefreshToken,
        user: user.toJSON()
      });
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }
};

module.exports = authController;
