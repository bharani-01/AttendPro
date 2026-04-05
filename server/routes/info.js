const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');

const { getPublicInfoSnapshot, resetMetrics } = require('../services/infoMetrics');

router.get('/', (req, res) => {
  res.json({
    message: 'AttendPro public info endpoint',
    note: 'No sensitive data is returned. Metrics are aggregated and operational only.'
  });
});

router.get('/metrics', auth, roleCheck('admin'), async (req, res) => {
  try {
    const snapshot = await getPublicInfoSnapshot();
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate info metrics snapshot' });
  }
});

router.post('/metrics/reset', auth, roleCheck('admin'), (req, res) => {
  resetMetrics();
  res.json({ message: 'Metrics reset successful' });
});

module.exports = router;
