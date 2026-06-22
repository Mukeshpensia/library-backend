// utils/scheduler.js
const cron = require('node-cron');
const runDailyJobs = require('./dailyJobs');

function setupScheduler(fastify) {
    // On the free tier the web service sleeps, so an external Render Cron Job
    // hits POST /cron/daily instead. Set CRON_EXTERNAL=true there to disable the
    // in-process scheduler and avoid running the daily jobs twice.
    if (process.env.CRON_EXTERNAL === 'true') {
        fastify.log.info('In-process scheduler disabled (CRON_EXTERNAL=true); daily jobs run via the /cron/daily endpoint.');
        return;
    }

    // Run every day at midnight (server time).
    cron.schedule('0 0 * * *', async () => {
        fastify.log.info('Running scheduled daily jobs');
        try {
            await runDailyJobs(fastify);
        } catch (error) {
            fastify.log.error('Error in scheduled daily jobs:', error);
        }
    });

    fastify.log.info('Scheduler initialized.');
}

module.exports = setupScheduler;
