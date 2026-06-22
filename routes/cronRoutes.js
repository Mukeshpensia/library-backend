// routes/cronRoutes.js
const runDailyJobs = require('../utils/dailyJobs');
const { AppError } = require('../utils/errors');

async function cronRoutes(fastify, options) {
    // Shared-secret guard. The external scheduler sends the secret in the
    // `x-cron-secret` header; reject anything else so this state-changing
    // endpoint can't be triggered by the public.
    function verifyCronSecret(request) {
        const expected = process.env.CRON_SECRET;
        if (!expected) {
            throw new AppError(503, 'CRON_NOT_CONFIGURED', 'CRON_SECRET is not configured on the server.');
        }
        if (request.headers['x-cron-secret'] !== expected) {
            throw new AppError(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.');
        }
    }

    fastify.post('/cron/daily', {
        schema: {
            tags: ['cron'],
            summary: 'Run daily maintenance jobs',
            description: 'Runs overdue/due-soon reminders (and any future daily jobs). '
                + 'Intended for a scheduled trigger such as a Render Cron Job. '
                + 'Requires the x-cron-secret header.',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        ranAt: { type: 'string' },
                        summary: {
                            type: 'object',
                            properties: {
                                overdueReminders: { type: 'integer' }
                            },
                            additionalProperties: true
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        verifyCronSecret(request);
        fastify.log.info('Running daily jobs via /cron/daily endpoint');
        const summary = await runDailyJobs(fastify);
        return { success: true, ranAt: new Date().toISOString(), summary };
    });
}

module.exports = cronRoutes;
