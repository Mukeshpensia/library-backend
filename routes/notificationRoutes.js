// routes/notificationRoutes.js
const NotificationController = require('../controllers/notificationController');
const NotificationService = require('../services/notificationService');
const { notifications: schema } = require('../schemas');

async function notificationRoutes(fastify, options) {
    const notificationService = new NotificationService(fastify);
    const notificationController = new NotificationController(notificationService);

    // User-scoped notifications. `/notifications/my` matches the `/borrows/my`,
    // `/reservations/my`, `/recommendations/my` convention used elsewhere; the
    // bare `/notifications` path is kept as an alias for backward compatibility.
    fastify.get('/notifications/my', { onRequest: [fastify.authenticate], schema: schema.list }, notificationController.list.bind(notificationController));
    fastify.get('/notifications', { onRequest: [fastify.authenticate], schema: schema.list }, notificationController.list.bind(notificationController));
    fastify.patch('/notifications/:id/read', { onRequest: [fastify.authenticate], schema: schema.markRead }, notificationController.markRead.bind(notificationController));
    fastify.post('/notifications/read-all', { onRequest: [fastify.authenticate], schema: schema.markAllRead }, notificationController.markAllRead.bind(notificationController));
}

module.exports = notificationRoutes;