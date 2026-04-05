const { EmailEventLog } = require('../models');

function getUtcDayStart(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function logEmailEvent({
  triggerKey,
  templateKey = '',
  recipientEmail = '',
  status,
  source = 'auto',
  errorMessage = '',
  actorUserId = null,
  metadata = null,
}) {
  if (!triggerKey || !status) return null;

  try {
    return await EmailEventLog.create({
      triggerKey,
      templateKey,
      recipientEmail,
      status,
      source,
      errorMessage,
      actorUserId,
      metadata,
    });
  } catch (error) {
    console.error('Failed to log email event:', error.message);
    return null;
  }
}

async function getEmailAttemptStats() {
  const now = new Date();
  const dayStart = getUtcDayStart(now);
  const sevenDayStart = new Date(dayStart);
  sevenDayStart.setUTCDate(sevenDayStart.getUTCDate() - 6);

  const countedStatuses = ['success', 'failed'];
  const totalByStatusPipeline = [
    { $match: { status: { $in: countedStatuses } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ];

  const [dailyAttempts, sevenDayAttempts, lifetimeAttempts, byTriggerAggregation, totalsByStatus] = await Promise.all([
    EmailEventLog.countDocuments({ status: { $in: countedStatuses }, createdAt: { $gte: dayStart } }),
    EmailEventLog.countDocuments({ status: { $in: countedStatuses }, createdAt: { $gte: sevenDayStart } }),
    EmailEventLog.countDocuments({ status: { $in: countedStatuses } }),
    EmailEventLog.aggregate([
      { $match: { status: { $in: countedStatuses } } },
      {
        $group: {
          _id: '$triggerKey',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    EmailEventLog.aggregate(totalByStatusPipeline),
  ]);

  const byTrigger = byTriggerAggregation.reduce((acc, item) => {
    if (item && item._id) {
      acc[item._id] = item.count;
    }
    return acc;
  }, {});

  const totals = totalsByStatus.reduce((acc, item) => {
    if (item && item._id) {
      acc[item._id] = item.count;
    }
    return acc;
  }, { success: 0, failed: 0 });

  const successRate = lifetimeAttempts > 0
    ? Number(((totals.success / lifetimeAttempts) * 100).toFixed(2))
    : 0;
  const failureRate = lifetimeAttempts > 0
    ? Number(((totals.failed / lifetimeAttempts) * 100).toFixed(2))
    : 0;

  return {
    dailyAttempts,
    sevenDayAttempts,
    lifetimeAttempts,
    successCount: totals.success,
    failedCount: totals.failed,
    successRate,
    failureRate,
    byTrigger,
    asOf: now,
  };
}

module.exports = {
  logEmailEvent,
  getEmailAttemptStats,
};
