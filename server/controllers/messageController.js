const { Conversation, Message, User } = require('../models');
const { getAdminConfigSetting } = require('../services/emailPolicyService');

function canUsersMessageEachOther(senderRole, receiverRole) {
  // Only student-to-student messaging is forbidden.
  return !(senderRole === 'student' && receiverRole === 'student');
}

const messageController = {
  // Start a new conversation or get an existing one
  async getOrCreateConversation(req, res) {
    try {
      const { receiverId } = req.body;
      const senderId = req.user._id;

      if (!receiverId) {
        return res.status(400).json({ error: 'Receiver ID is required' });
      }

      // Prevent users from starting conversations with themselves
      if (senderId.toString() === receiverId.toString()) {
        return res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
      }

      const [sender, receiver] = await Promise.all([
        User.findById(senderId).select('role'),
        User.findById(receiverId).select('role')
      ]);

      if (!sender || !receiver) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!canUsersMessageEachOther(sender.role, receiver.role)) {
        return res.status(403).json({ error: 'Student to student conversation is not allowed.' });
      }

      const participants = [senderId, receiverId].sort();

      let conversation = await Conversation.findOne({
        participants: { $all: participants }
      });

      if (!conversation) {
        conversation = new Conversation({
          participants
        });
        await conversation.save();
      }

      res.status(200).json({ conversationId: conversation._id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get or create conversation: ' + error.message });
    }
  },

  // Send a new message
  async sendMessage(req, res) {
    try {
      const { conversationId, receiverId, content, replyToMessageId } = req.body;
      const senderId = req.user._id;

      if (!conversationId || !content) {
        return res.status(400).json({ error: 'Conversation ID and content are required' });
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Ensure the sender is a participant of the conversation
      if (!conversation.participants.includes(senderId)) {
        return res.status(403).json({ error: 'You are not a participant of this conversation' });
      }

      let resolvedReceiverId = receiverId;
      if (!resolvedReceiverId) {
        resolvedReceiverId = conversation.participants.find(
          (participantId) => String(participantId) !== String(senderId)
        );
      }

      if (!resolvedReceiverId) {
        return res.status(400).json({ error: 'Receiver ID is required' });
      }

      const [sender, receiver] = await Promise.all([
        User.findById(senderId).select('role'),
        User.findById(resolvedReceiverId).select('role')
      ]);

      if (!sender || !receiver) {
        return res.status(404).json({ error: 'Sender or receiver not found' });
      }

      if (!canUsersMessageEachOther(sender.role, receiver.role)) {
        return res.status(403).json({ error: 'Student to student messaging is not allowed.' });
      }

      const settings = await getAdminConfigSetting();
      const rules = settings.communicationRules;
      const moderated = rules.applyToDirectMessages && rules.approvalWorkflowEnabled && req.user.role !== 'admin';

      let expiresAt = null;
      let scheduledDeleteAt = null;

      if (rules.applyToDirectMessages) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Number(rules.defaultVisibilityDays || 7));

        scheduledDeleteAt = new Date();
        scheduledDeleteAt.setDate(scheduledDeleteAt.getDate() + Number(rules.autoDeleteAfterDays || 90));
      }

      let replyTo = null;
      if (replyToMessageId) {
        const parentMessage = await Message.findById(replyToMessageId).select('conversationId');
        if (!parentMessage) {
          return res.status(400).json({ error: 'Reply target message not found.' });
        }
        if (String(parentMessage.conversationId) !== String(conversationId)) {
          return res.status(400).json({ error: 'Reply target must belong to the same conversation.' });
        }
        replyTo = parentMessage._id;
      }

      const message = new Message({
        conversationId,
        sender: senderId,
        receiver: resolvedReceiverId,
        content,
        replyTo,
        approvalStatus: moderated ? 'pending' : 'approved',
        approvedBy: moderated ? null : senderId,
        approvedAt: moderated ? null : new Date(),
        expiresAt,
        scheduledDeleteAt,
      });

      await message.save();

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'name role')
        .populate('receiver', 'name role')
        .populate({
          path: 'replyTo',
          select: 'content sender createdAt',
          populate: {
            path: 'sender',
            select: 'name role'
          }
        });

      // Update the last message in the conversation
      conversation.lastMessage = message._id;
      await conversation.save();

      const io = req.app.get('io');
      if (io && !moderated) {
        const payload = {
          conversationId: String(conversationId),
          message: populatedMessage
        };

        io.to(`user:${String(senderId)}`).emit('message:new', payload);
        if (resolvedReceiverId) {
          io.to(`user:${String(resolvedReceiverId)}`).emit('message:new', payload);
        }
      }

      // TODO: Implement real-time notifications (e.g., WebSockets)

      res.status(201).json({
        message: moderated ? 'Message submitted for approval' : 'Message sent successfully',
        data: populatedMessage,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send message: ' + error.message });
    }
  },

  // Get all messages for a conversation
  async getMessages(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Ensure the user is a participant
      if (!conversation.participants.includes(userId)) {
        return res.status(403).json({ error: 'You are not authorized to view these messages' });
      }

      const messages = await Message.find({
        conversationId,
        approvalStatus: 'approved',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
      })
        .populate('sender', 'name role')
        .populate('receiver', 'name role')
        .populate({
          path: 'replyTo',
          select: 'content sender createdAt',
          populate: {
            path: 'sender',
            select: 'name role'
          }
        })
        .sort({ createdAt: 'asc' });

      // Mark messages as read
      const readResult = await Message.updateMany(
        { conversationId: conversationId, receiver: userId, isRead: false },
        { $set: { isRead: true } }
      );

      const io = req.app.get('io');
      if (io && (readResult.modifiedCount || 0) > 0) {
        conversation.participants.forEach((participantId) => {
          io.to(`user:${String(participantId)}`).emit('message:read', {
            conversationId: String(conversationId),
            readBy: String(userId),
          });
        });
      }

      res.status(200).json({ messages });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve messages: ' + error.message });
    }
  },

  // Get all conversations for the current user
  async getConversations(req, res) {
    try {
      const userId = req.user._id;
      const io = req.app.get('io');
      const isUserOnline = (targetUserId) => {
        if (!io || !io.sockets || !io.sockets.adapter || !io.sockets.adapter.rooms) {
          return false;
        }
        const room = io.sockets.adapter.rooms.get(`user:${String(targetUserId)}`);
        return Boolean(room && room.size > 0);
      };

      const conversations = await Conversation.find({ participants: userId })
        .populate('participants', 'name role email')
        .populate({
          path: 'lastMessage',
          populate: {
            path: 'sender',
            select: 'name'
          }
        })
        .sort({ updatedAt: -1 });

      const conversationsWithUnread = await Promise.all(conversations.map(async (convo) => {
        const unreadCount = await Message.countDocuments({
          conversationId: convo._id,
          receiver: userId,
          isRead: false
        });
        const convoObj = convo.toObject();
        convoObj.participants = (convoObj.participants || []).map((participant) => ({
          ...participant,
          isOnline: isUserOnline(participant._id)
        }));

        return {
          ...convoObj,
          unreadCount
        };
      }));

      res.status(200).json({ conversations: conversationsWithUnread });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve conversations: ' + error.message });
    }
  },

  async getConversationUserProfile(req, res) {
    try {
      const requesterId = req.user._id;
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const isSelf = String(requesterId) === String(userId);
      if (!isSelf) {
        const hasConversation = await Conversation.exists({
          participants: { $all: [requesterId, userId] }
        });

        if (!hasConversation) {
          return res.status(403).json({ error: 'Not authorized to view this profile' });
        }
      }

      const profile = await User.findById(userId)
        .select('name email role uniqueId department batch year phone parentEmail parentPhone parentPhones dob assignedClass assignedSubjects createdAt')
        .populate('assignedClass', 'className department batch year section')
        .populate('assignedSubjects', 'subjectName subjectCode');

      if (!profile) {
        return res.status(404).json({ error: 'User not found' });
      }

      const io = req.app.get('io');
      const room = io?.sockets?.adapter?.rooms?.get(`user:${String(userId)}`);
      const isOnline = Boolean(room && room.size > 0);

      const profileObj = profile.toObject();
      profileObj.isOnline = isOnline;

      return res.status(200).json({ profile: profileObj });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch user profile: ' + error.message });
    }
  },

  // Get a list of users a student can message (their faculty)
  async getStudentMessagableUsers(req, res) {
    try {
        const studentId = req.user._id;

        const messagableUsers = await User.find({
          _id: { $ne: studentId },
          role: { $ne: 'student' }
        })
          .select('name email role uniqueId')
          .sort({ name: 1 });

        res.status(200).json({ messagableUsers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messagable users: ' + error.message });
    }
  },

  // Get a list of users a faculty can message (their students)
  async getFacultyMessagableUsers(req, res) {
    try {
        const facultyId = req.user._id;

        const messagableUsers = await User.find({
          _id: { $ne: facultyId }
        })
          .select('name email role uniqueId')
          .sort({ name: 1 });

        res.status(200).json({ messagableUsers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messagable users: ' + error.message });
    }
  },

  async getPendingMessages(req, res) {
    try {
      const pendingMessages = await Message.find({ approvalStatus: 'pending' })
        .populate('sender', 'name role email')
        .populate('receiver', 'name role email')
        .sort({ createdAt: -1 })
        .limit(200);

      return res.status(200).json({ pendingMessages });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get pending messages: ' + error.message });
    }
  },

  async reviewMessage(req, res) {
    try {
      const { id } = req.params;
      const { decision, reason } = req.body || {};

      if (!['approve', 'reject'].includes(String(decision || '').toLowerCase())) {
        return res.status(400).json({ error: 'decision must be approve or reject' });
      }

      const message = await Message.findById(id);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      if (String(decision).toLowerCase() === 'approve') {
        message.approvalStatus = 'approved';
        message.approvedBy = req.user._id;
        message.approvedAt = new Date();
        message.rejectedReason = '';
      } else {
        message.approvalStatus = 'rejected';
        message.approvedBy = req.user._id;
        message.approvedAt = new Date();
        message.rejectedReason = String(reason || '').trim();
      }

      await message.save();

      return res.status(200).json({
        message: 'Message review updated',
        reviewedMessage: message,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to review message: ' + error.message });
    }
  }
};

module.exports = messageController;
