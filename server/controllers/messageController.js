const { Conversation, Message, User, Class, Timetable } = require('../models');

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

      const participants = [senderId, receiverId].sort();

      let conversation = await Conversation.findOne({
        participants: { $all: participants }
      });

      if (!conversation) {
        // Ensure both users exist before creating a conversation
        const receiver = await User.findById(receiverId);
        if (!receiver) {
          return res.status(404).json({ error: 'Receiver not found' });
        }
        
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
      const { conversationId, receiverId, content } = req.body;
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

      const message = new Message({
        conversationId,
        sender: senderId,
        receiver: receiverId,
        content
      });

      await message.save();

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'name role')
        .populate('receiver', 'name role');

      // Update the last message in the conversation
      conversation.lastMessage = message._id;
      await conversation.save();

      const io = req.app.get('io');
      if (io) {
        const payload = {
          conversationId: String(conversationId),
          message: populatedMessage
        };

        io.to(`user:${String(senderId)}`).emit('message:new', payload);
        if (receiverId) {
          io.to(`user:${String(receiverId)}`).emit('message:new', payload);
        }
      }

      // TODO: Implement real-time notifications (e.g., WebSockets)

      res.status(201).json({ message: 'Message sent successfully', data: populatedMessage });
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

      const messages = await Message.find({ conversationId })
        .populate('sender', 'name role')
        .populate('receiver', 'name role')
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
        return {
          ...convo.toObject(),
          unreadCount
        };
      }));

      res.status(200).json({ conversations: conversationsWithUnread });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve conversations: ' + error.message });
    }
  },

  // Get a list of users a student can message (their faculty)
  async getStudentMessagableUsers(req, res) {
    try {
        const studentId = req.user._id;

        const student = await User.findById(studentId).select('assignedClass department batch year');
        if (!student) {
          return res.status(404).json({ error: 'Student not found' });
        }

        const classQuery = { students: studentId };
        if (student.assignedClass) {
          classQuery.$or = [
            { _id: student.assignedClass },
            { students: studentId }
          ];
          delete classQuery.students;
        }

        const studentClasses = await Class.find(classQuery).select('assignedSubjects _id');
        const classIds = [...new Set(studentClasses.map((c) => String(c._id)))];

        if (!classIds.length && student.assignedClass) {
          classIds.push(String(student.assignedClass));
        }

        const subjectIds = [...new Set(
          studentClasses
            .flatMap((c) => (Array.isArray(c.assignedSubjects) ? c.assignedSubjects : []))
            .map((id) => String(id))
        )];

        const facultyIdSet = new Set();

        if (subjectIds.length) {
          const subjectFaculty = await User.find({
            role: 'faculty',
            assignedSubjects: { $in: subjectIds }
          }).select('_id');
          subjectFaculty.forEach((u) => facultyIdSet.add(String(u._id)));
        }

        if (classIds.length) {
          const timetableRows = await Timetable.find({
            class: { $in: classIds }
          }).select('faculty');
          timetableRows.forEach((row) => {
            if (row.faculty) {
              facultyIdSet.add(String(row.faculty));
            }
          });
        }

        const existingConversations = await Conversation.find({ participants: studentId }).select('participants');
        existingConversations.forEach((convo) => {
          (convo.participants || []).forEach((participantId) => {
            const id = String(participantId);
            if (id !== String(studentId)) {
              facultyIdSet.add(id);
            }
          });
        });

        const query = { role: 'faculty' };
        if (facultyIdSet.size) {
          query._id = { $in: [...facultyIdSet] };
        } else if (student.department && student.year) {
          // Practical fallback for partially seeded data.
          query.department = student.department;
          query.year = student.year;
        }

        const messagableUsers = await User.find(query)
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

        const faculty = await User.findById(facultyId).select('assignedSubjects department year');
        const subjectIds = (faculty?.assignedSubjects || []).map((id) => id.toString());

        const classIdSet = new Set();
        const studentIdSet = new Set();

        if (subjectIds.length) {
          const classesBySubject = await Class.find({ assignedSubjects: { $in: subjectIds } }).select('students _id');
          classesBySubject.forEach((c) => {
            classIdSet.add(String(c._id));
            (Array.isArray(c.students) ? c.students : []).forEach((studentId) => {
              studentIdSet.add(String(studentId));
            });
          });
        }

        const timetableRows = await Timetable.find({ faculty: facultyId }).select('class');
        timetableRows.forEach((row) => {
          if (row.class) {
            classIdSet.add(String(row.class));
          }
        });

        if (classIdSet.size) {
          const classesByTimetable = await Class.find({ _id: { $in: [...classIdSet] } }).select('students');
          classesByTimetable.forEach((c) => {
            (Array.isArray(c.students) ? c.students : []).forEach((studentId) => {
              studentIdSet.add(String(studentId));
            });
          });
        }

        const existingConversations = await Conversation.find({ participants: facultyId }).select('participants');
        existingConversations.forEach((convo) => {
          (convo.participants || []).forEach((participantId) => {
            const id = String(participantId);
            if (id !== String(facultyId)) {
              studentIdSet.add(id);
            }
          });
        });

        const query = { role: 'student' };
        if (studentIdSet.size || classIdSet.size) {
          query.$or = [];
          if (studentIdSet.size) {
            query.$or.push({ _id: { $in: [...studentIdSet] } });
          }
          if (classIdSet.size) {
            query.$or.push({ assignedClass: { $in: [...classIdSet] } });
          }
        } else if (faculty?.department) {
          // Fallback for partially mapped seed data.
          query.department = faculty.department;
          if (faculty.year) {
            query.year = faculty.year;
          }
        }

        const messagableUsers = await User.find(query)
          .select('name email role uniqueId')
          .sort({ name: 1 });

        res.status(200).json({ messagableUsers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messagable users: ' + error.message });
    }
  }
};

module.exports = messageController;
