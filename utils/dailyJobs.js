// utils/dailyJobs.js
// Centralized daily maintenance jobs. Called from BOTH places so the logic
// lives in exactly one spot:
//   - utils/scheduler.js  (in-process node-cron, on always-on hosts)
//   - routes/cronRoutes.js (POST /cron/daily, triggered by an external Render
//     Cron Job on the free tier, where the web service sleeps and node-cron
//     can't fire reliably).
const NotificationService = require('../services/notificationService');

async function runDailyJobs(fastify) {
    const notificationService = new NotificationService(fastify);

    const summary = {};
    // Due-soon + overdue reminders. Add future daily jobs (reservation expiry,
    // popularity recompute, ...) here and they run from both triggers for free.
    summary.overdueReminders = await notificationService.checkAndSendOverdueReminders();

    return summary;
}

module.exports = runDailyJobs;
