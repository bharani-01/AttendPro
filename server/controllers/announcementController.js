const mongoose = require('mongoose');
const { Announcement, AnnouncementSeen, Class, User } = require('../models');
const { getAdminConfigSetting } = require('../services/emailPolicyService');

const announcementController = {
  // Create a new announcement
  async createAnnouncement(req, res) {
    try {
      const { title, content, targetRoles, expiresAt, targetClassId } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }

      const role = req.user.role;
      const settings = await getAdminConfigSetting();
      const rules = settings.communicationRules;

      const parsedExpiry = expiresAt ? new Date(expiresAt) : null;
      if (parsedExpiry && Number.isNaN(parsedExpiry.getTime())) {
        return res.status(400).json({ error: 'Invalid expiry date' });
      }

      let effectiveExpiry = parsedExpiry;
      if (!effectiveExpiry && rules.applyToAnnouncements) {
        effectiveExpiry = new Date();
        effectiveExpiry.setDate(effectiveExpiry.getDate() + Number(rules.defaultVisibilityDays || 7));
      }

      const requiresApproval = rules.applyToAnnouncements
        && rules.approvalWorkflowEnabled
        && role !== 'admin';

      const approvalStatus = requiresApproval ? 'pending' : 'approved';
      const approvedBy = requiresApproval ? null : req.user._id;
      const approvedAt = requiresApproval ? null : new Date();

      let scheduledDeleteAt = null;
      if (rules.applyToAnnouncements) {
        scheduledDeleteAt = new Date();
        scheduledDeleteAt.setDate(scheduledDeleteAt.getDate() + Number(rules.autoDeleteAfterDays || 90));
      }

      let normalizedRoles = Array.isArray(targetRoles) ? targetRoles : ['all'];
      let targetClass = null;

      if (role === 'faculty') {
        if (!req.user.assignedClass) {
          return res.status(400).json({ error: 'Faculty must be assigned to a class to publish announcements' });
        }

        normalizedRoles = ['student'];
        targetClass = req.user.assignedClass;
      } else {
        const allowedRoles = ['student', 'faculty', 'admin', 'all'];
        normalizedRoles = normalizedRoles.filter((r) => allowedRoles.includes(r));
        if (!normalizedRoles.length || normalizedRoles.includes('all')) {
          normalizedRoles = ['all'];
        }

        if (targetClassId) {
          if (!mongoose.Types.ObjectId.isValid(targetClassId)) {
            return res.status(400).json({ error: 'Invalid class selected' });
          }

          const classExists = await Class.exists({ _id: targetClassId });
          if (!classExists) {
            return res.status(400).json({ error: 'Selected class not found' });
          }

          targetClass = targetClassId;
        }
      }

      const announcement = new Announcement({
        title,
        content,
        createdBy: req.user._id,
        targetRoles: normalizedRoles,
        targetClass,
        expiresAt: effectiveExpiry,
        approvalStatus,
        approvedBy,
        approvedAt,
        scheduledDeleteAt,
      });

      await announcement.save();
      res.status(201).json({
        message: requiresApproval
          ? 'Announcement submitted for approval'
          : 'Announcement created successfully',
        announcement,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create announcement: ' + error.message });
    }
  },

  // Get announcements for the current user's role
  async getAnnouncements(req, res) {
    try {
      const userRole = req.user.role;
      const now = new Date();
      const seenRows = await AnnouncementSeen.find({ user: req.user._id }).select('announcement');
      const seenAnnouncementIds = seenRows.map((row) => row.announcement);
      const includeSeen = req.query.includeSeen === 'true' && userRole === 'faculty';

      const roleVisibilityFilter = {
        $and: [
          { $or: [{ targetRoles: 'all' }, { targetRoles: userRole }] },
          { approvalStatus: 'approved' },
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
        ]
      };

      if (userRole === 'student') {
        if (req.user.assignedClass) {
          roleVisibilityFilter.$and.push({
            $or: [
              { targetClass: null },
              { targetClass: req.user.assignedClass }
            ]
          });
        } else {
          roleVisibilityFilter.$and.push({ targetClass: null });
        }
      }

      let query = roleVisibilityFilter;

      if (userRole === 'faculty') {
        query = {
          $or: [
            roleVisibilityFilter,
            {
              createdBy: req.user._id,
              approvalStatus: { $in: ['approved', 'pending'] },
              $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
            }
          ]
        };
      }

      const finalQuery = includeSeen
        ? query
        : {
            ...query,
            _id: { $nin: seenAnnouncementIds }
          };

      const announcements = await Announcement.find(finalQuery)
        .populate('createdBy', 'name')
        .populate('targetClass', 'className')
        .sort({ createdAt: -1 });

      res.status(200).json({ announcements });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve announcements: ' + error.message });
    }
  },

  async reviewAnnouncement(req, res) {
    try {
      const { id } = req.params;
      const { decision, reason } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid announcement id' });
      }

      if (!['approve', 'reject'].includes(String(decision || '').toLowerCase())) {
        return res.status(400).json({ error: 'decision must be approve or reject' });
      }

      const announcement = await Announcement.findById(id);
      if (!announcement) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      if (String(decision).toLowerCase() === 'approve') {
        announcement.approvalStatus = 'approved';
        announcement.approvedBy = req.user._id;
        announcement.approvedAt = new Date();
        announcement.rejectedReason = '';
      } else {
        announcement.approvalStatus = 'rejected';
        announcement.approvedBy = req.user._id;
        announcement.approvedAt = new Date();
        announcement.rejectedReason = String(reason || '').trim();
      }

      await announcement.save();

      return res.status(200).json({
        message: 'Announcement review updated',
        announcement,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to review announcement: ' + error.message });
    }
  },

  async markAnnouncementsSeen(req, res) {
    try {
      const ids = Array.isArray(req.body?.announcementIds) ? req.body.announcementIds : [];
      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

      if (!validIds.length) {
        return res.status(200).json({ message: 'No valid announcements to mark' });
      }

      await AnnouncementSeen.bulkWrite(
        validIds.map((announcementId) => ({
          updateOne: {
            filter: { user: req.user._id, announcement: announcementId },
            update: {
              $setOnInsert: {
                user: req.user._id,
                announcement: announcementId,
                seenAt: new Date()
              }
            },
            upsert: true
          }
        })),
        { ordered: false }
      );

      return res.status(200).json({ message: 'Announcements marked as seen' });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to mark announcements as seen: ' + error.message });
    }
  },

  async getAnnouncementAnalytics(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid announcement id' });
      }

      const announcement = await Announcement.findById(id)
        .populate('createdBy', 'name')
        .populate('targetClass', 'className');

      if (!announcement) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      if (req.user.role === 'faculty' && String(announcement.createdBy?._id || announcement.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: 'Not authorized to view analytics for this announcement' });
      }

      const roles = (announcement.targetRoles || []).includes('all')
        ? ['admin', 'faculty', 'student']
        : announcement.targetRoles;

      const users = await User.find({ role: { $in: roles } })
        .select('_id role assignedClass name')
        .lean();

      const targetClassId = announcement.targetClass ? String(announcement.targetClass._id || announcement.targetClass) : null;
      const targetUsers = users.filter((u) => {
        if (u.role !== 'student' || !targetClassId) return true;
        return u.assignedClass && String(u.assignedClass) === targetClassId;
      });

      const targetUserIds = targetUsers.map((u) => u._id);
      const seenRows = await AnnouncementSeen.find({
        announcement: announcement._id,
        user: { $in: targetUserIds }
      }).select('user seenAt');

      const seenUserSet = new Set(seenRows.map((row) => String(row.user)));
      const totalTargets = targetUsers.length;
      const readCount = seenRows.length;
      const unseenCount = Math.max(totalTargets - readCount, 0);
      const readPercentage = totalTargets > 0
        ? Number(((readCount / totalTargets) * 100).toFixed(1))
        : 0;

      const studentTargets = targetUsers.filter((u) => u.role === 'student');
      const studentClassIds = Array.from(new Set(studentTargets
        .map((u) => (u.assignedClass ? String(u.assignedClass) : null))
        .filter(Boolean)));

      const classDocs = studentClassIds.length
        ? await Class.find({ _id: { $in: studentClassIds } }).select('_id className').lean()
        : [];
      const classNameById = new Map(classDocs.map((c) => [String(c._id), c.className]));

      const classWiseMap = new Map();
      studentTargets.forEach((student) => {
        const classId = student.assignedClass ? String(student.assignedClass) : 'unassigned';
        const className = classId === 'unassigned' ? 'Unassigned' : (classNameById.get(classId) || 'Unknown Class');

        if (!classWiseMap.has(classId)) {
          classWiseMap.set(classId, {
            classId,
            className,
            total: 0,
            read: 0,
            unseen: 0,
            readPercentage: 0
          });
        }

        const bucket = classWiseMap.get(classId);
        bucket.total += 1;
        if (seenUserSet.has(String(student._id))) {
          bucket.read += 1;
        }
      });

      const classWise = Array.from(classWiseMap.values()).map((row) => {
        const unseen = Math.max(row.total - row.read, 0);
        const percentage = row.total > 0 ? Number(((row.read / row.total) * 100).toFixed(1)) : 0;
        return {
          ...row,
          unseen,
          readPercentage: percentage
        };
      }).sort((a, b) => a.className.localeCompare(b.className));

      return res.status(200).json({
        analytics: {
          announcementId: announcement._id,
          title: announcement.title,
          totalTargets,
          readCount,
          unseenCount,
          readPercentage,
          classWise
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to retrieve analytics: ' + error.message });
    }
  },

  // Get all announcements (for admins)
  async getAllAnnouncements(req, res) {
    try {
      const announcements = await Announcement.find({})
        .populate('createdBy', 'name')
        .populate('targetClass', 'className')
        .sort({ createdAt: -1 });
      res.status(200).json({ announcements });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve all announcements: ' + error.message });
    }
  },

  // Delete an announcement
  async deleteAnnouncement(req, res) {
    try {
      const { id } = req.params;
      const announcement = await Announcement.findById(id);

      if (!announcement) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      if (req.user.role !== 'admin' && String(announcement.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: 'You are not authorized to delete this announcement' });
      }

      await announcement.remove();
      res.status(200).json({ message: 'Announcement deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete announcement: ' + error.message });
    }
  }
};

module.exports = announcementController;
