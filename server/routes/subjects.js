const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const { auth, roleCheck } = require('../middleware/auth');

router.post('/', auth, roleCheck('admin'), subjectController.create);

router.get('/', auth, subjectController.getAll);

router.get('/:id', auth, subjectController.getById);

router.put('/:id', auth, roleCheck('admin'), subjectController.update);

router.delete('/:id', auth, roleCheck('admin'), subjectController.delete);

module.exports = router;
