// routes/activityRoutes.js
const ActivityController = require('../controllers/activityController');
const ActivityService = require('../services/activityService');
const { activity: schema } = require('../schemas');

async function activityRoutes(fastify, options) {
    const activityService = new ActivityService(fastify);
    const activityController = new ActivityController(activityService);

    fastify.get('/activities/my', { onRequest: [fastify.authenticate], schema: schema.my }, activityController.myActivity.bind(activityController));

    // Librarian+ for global activity
    fastify.get('/activities', {
        onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])],
        schema: schema.global
    }, activityController.globalActivity.bind(activityController));
}

module.exports = activityRoutes;