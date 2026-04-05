const { Announcement, Message } = require('../models');

const CLEANUP_INTERVAL_MS = Math.max(Number(process.env.RETENTION_CLEANUP_INTERVAL_MS || 60 * 60 * 1000), 60 * 1000);

async function runRetentionCleanup() {
  const now = new Date();

  try {
    const [announcementResult, messageResult] = await Promise.all([
      Announcement.deleteMany({
        scheduledDeleteAt: { $ne: null, $lte: now }
      }),
      Message.deleteMany({
        scheduledDeleteAt: { $ne: null, $lte: now }
      })
    ]);

    if ((announcementResult.deletedCount || 0) > 0 || (messageResult.deletedCount || 0) > 0) {
      console.log(`[retention-cleanup] deleted announcements=${announcementResult.deletedCount || 0}, messages=${messageResult.deletedCount || 0}`);
    }
  } catch (error) {
    console.error('[retention-cleanup] failed:', error.message);
  }
}

function startRetentionCleanupJob() {
  runRetentionCleanup();
  const timer = setInterval(runRetentionCleanup, CLEANUP_INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

module.exports = {
  runRetentionCleanup,
  startRetentionCleanupJob,
};
