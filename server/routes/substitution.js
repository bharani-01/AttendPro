const express = require('express');
const router = express.Router();
const substitutionController = require('../controllers/substitutionController');
const { auth, roleCheck } = require('../middleware/auth');

router.route('/')
    .get(auth, roleCheck('admin'), substitutionController.getSubstitutions)
    .post(auth, roleCheck('admin'), substitutionController.createSubstitution);

router.route('/:id')
    .delete(auth, roleCheck('admin'), substitutionController.deleteSubstitution);

module.exports = router;
