const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');
const messageController = require('../controllers/messageController');
const { User } = require('../models');

// Get or create a conversation
router.post('/conversations', auth, messageController.getOrCreateConversation);

// Get all conversations for the logged-in user
router.get('/conversations', auth, messageController.getConversations);

// Get full profile for a user in the current user's conversation list
router.get('/users/:userId/profile', auth, messageController.getConversationUserProfile);

// Get messages for a specific conversation
router.get('/conversations/:conversationId', auth, messageController.getMessages);

// Send a message
router.post('/messages', auth, messageController.sendMessage);

// Get pending direct messages for moderation (admin)
router.get('/messages/pending', auth, roleCheck('admin'), messageController.getPendingMessages);

// Review a pending direct message (admin)
router.post('/messages/:id/review', auth, roleCheck('admin'), messageController.reviewMessage);

// Get users that the current user can message
router.get('/messagable-users', auth, (req, res) => {
    if (req.user.role === 'student') {
        return messageController.getStudentMessagableUsers(req, res);
    }
    if (req.user.role === 'faculty') {
        return messageController.getFacultyMessagableUsers(req, res);
    }

    // Admins can message anyone except themselves.
    return User.find({ _id: { $ne: req.user._id } })
        .select('name email role uniqueId')
        .then((users) => res.status(200).json({ messagableUsers: users }))
        .catch((err) => res.status(500).json({ error: 'Failed to get users: ' + err.message }));
});

module.exports = router;
