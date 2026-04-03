const { AuditLog, User } = require('../models');

const securityController = {
  async getAttackAttempts(req, res) {
    try {
      const { limit = 100 } = req.query;

      const logs = await AuditLog.find({ action: 'LOGIN_FAILED' })
        .sort({ timestamp: -1 })
        .limit(parseInt(limit, 10))
        .populate('userId', 'name email role isBlocked blockedReason');

      const attempts = logs.map((log) => {
        const emailMatch = typeof log.details === 'string'
          ? log.details.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
          : null;

        return {
          id: log._id,
          ipAddress: log.ipAddress || 'Unknown',
          routePath: log.routePath || '/api/auth/login',
          attemptedAt: log.timestamp,
          attemptedEmail: log.attemptedEmail || (emailMatch ? emailMatch[0] : (log.userId?.email || log.userName || 'Unknown')),
          attemptCount: log.attemptCount || 1,
          firstAttemptAt: log.firstAttemptAt || log.timestamp,
          lastAttemptAt: log.lastAttemptAt || log.timestamp,
          details: log.details || '',
          user: log.userId
            ? {
                _id: log.userId._id,
                name: log.userId.name,
                email: log.userId.email,
                role: log.userId.role,
                isBlocked: !!log.userId.isBlocked,
                blockedReason: log.userId.blockedReason || ''
              }
            : null
        };
      });

      res.json({ attempts });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getBlockedUsers(req, res) {
    try {
      const users = await User.find({ isBlocked: true })
        .select('name email role blockedAt blockedReason blockedBy')
        .populate('blockedBy', 'name email')
        .sort({ blockedAt: -1 });

      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async blockUser(req, res) {
    try {
      const { userId, reason } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      user.isBlocked = true;
      user.blockedAt = new Date();
      user.blockedReason = reason || 'Blocked by admin due to suspicious activity';
      user.blockedBy = req.user._id;
      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE',
        details: `Admin blocked user ${user.email}. Reason: ${user.blockedReason}`,
        entityType: 'AUTH',
        entityId: user._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        routePath: req.originalUrl,
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      res.json({ message: 'User blocked successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async unblockUser(req, res) {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      user.isBlocked = false;
      user.blockedAt = null;
      user.blockedReason = '';
      user.blockedBy = null;
      user.failedLoginAttempts = 0;
      user.lastFailedLoginAt = null;
      user.loginLockUntil = null;
      await user.save();

      await AuditLog.create({
        userId: req.user._id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE',
        details: `Admin unblocked user ${user.email}`,
        entityType: 'AUTH',
        entityId: user._id,
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        routePath: req.originalUrl,
        userAgent: req.get('user-agent') || '',
        status: 'SUCCESS'
      });

      res.json({ message: 'User unblocked successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = securityController;
