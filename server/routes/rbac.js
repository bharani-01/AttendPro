const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');
const rbacController = require('../controllers/rbacController');

// All routes in this file are admin-only
router.use(auth, roleCheck('admin'));

// Permissions
router.get('/permissions', rbacController.getAllPermissions);
router.post('/permissions', rbacController.createPermission);

// Roles
router.get('/roles', rbacController.getAllRoles);
router.post('/roles', rbacController.createRole);
router.put('/roles/:id', rbacController.updateRole);
router.delete('/roles/:id', rbacController.deleteRole);

module.exports = router;
