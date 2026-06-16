// utils/scheduler.js
const cron = require('node-cron');
const NotificationService = require('../services/notificationService');

function setupScheduler(fastify) {
    const notificationService = new NotificationService(fastify);

    // Run every day at midnight
    cron.schedule('0 0 * * *', async () => {
        fastify.log.info('Running scheduled job: Check Overdue Borrows');
        try {
            await notificationService.checkAndSendOverdueReminders();
        } catch (error) {
            fastify.log.error('Error in scheduled job:', error);
        }
    });

    fastify.log.info('Scheduler initialized.');
}

module.exports = setupScheduler;