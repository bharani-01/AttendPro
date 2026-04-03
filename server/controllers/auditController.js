const { AuditLog } = require('../models');

const auditController = {
  async logAudit(data) {
    try {
      const auditEntry = new AuditLog({
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        action: data.action,
        details: data.details,
        entityType: data.entityType || 'OTHER',
        entityId: data.entityId,
        ipAddress: data.ipAddress || 'Unknown',
        userAgent: data.userAgent || '',
        status: data.status || 'SUCCESS'
      });
      
      await auditEntry.save();
      return auditEntry;
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  },

  async getAuditLogs(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        action, 
        userId, 
        startDate, 
        endDate,
        entityType 
      } = req.query;
      
      const query = {};
      
      if (action) {
        query.action = action;
      }
      
      if (userId) {
        query.userId = userId;
      }
      
      if (entityType) {
        query.entityType = entityType;
      }
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.timestamp.$lte = end;
        }
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('userId', 'name email role'),
        AuditLog.countDocuments(query)
      ]);
      
      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ message: 'Error fetching audit logs' });
    }
  },

  async getRecentActivity(req, res) {
    try {
      const { limit = 10 } = req.query;
      
      const logs = await AuditLog.find()
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'name email role');
      
      res.json({ logs });
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({ message: 'Error fetching recent activity' });
    }
  },

  async getStats(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const [todayLogs, weekLogs, actionStats] = await Promise.all([
        AuditLog.countDocuments({ timestamp: { $gte: today } }),
        AuditLog.countDocuments({ timestamp: { $gte: weekAgo } }),
        AuditLog.aggregate([
          { $match: { timestamp: { $gte: weekAgo } } },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      ]);
      
      res.json({
        todayLogs,
        weekLogs,
        actionStats
      });
    } catch (error) {
      console.error('Error fetching audit stats:', error);
      res.status(500).json({ message: 'Error fetching audit stats' });
    }
  }
};

module.exports = auditController;
