const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth, roleCheck } = require('../middleware/auth');

router.post('/register', authController.register);

router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);

router.post('/logout', auth, authController.logout);

router.get('/profile', auth, authController.getProfile);

router.get('/users/stats', auth, roleCheck('admin'), authController.getUserStats);

router.get('/users', auth, roleCheck('admin'), authController.getAllUsers);

router.put('/users/:id', auth, roleCheck('admin'), authController.updateUser);
router.post('/users/:id/reset-password-random', auth, roleCheck('admin'), authController.adminResetUserPassword);
router.post('/users/:id/send-templated-email', auth, roleCheck('admin'), authController.sendTemplatedEmailToUser);

router.delete('/users/:id', auth, roleCheck('admin'), authController.deleteUser);

router.post('/students/add', auth, roleCheck('admin', 'faculty'), authController.addStudent);

router.post('/students/bulk', auth, roleCheck('admin', 'faculty'), authController.bulkAddStudents);

router.post('/faculty/add', auth, roleCheck('admin'), authController.addFaculty);

router.post('/faculty/bulk', auth, roleCheck('admin'), authController.bulkAddFaculty);

router.post('/forgot-password', authController.forgotPassword);

router.post('/reset-password', authController.resetPassword);

module.exports = router;
