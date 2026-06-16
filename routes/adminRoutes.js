// routes/adminRoutes.js
const AdminUserController = require('../controllers/adminUserController');
const UserModel = require('../models/userModel');
const AuditLogModel = require('../models/auditLogModel');
const { users: schema } = require('../schemas');

async function adminRoutes(fastify, options) {
    const userModel = new UserModel(fastify.mysql);
    const auditLogModel = new AuditLogModel(fastify.mysql);
    const adminUserController = new AdminUserController(userModel, auditLogModel);

    // All routes in this file require Admin role
    fastify.addHook('onRequest', async (request, reply) => {
        await fastify.authenticate(request, reply);
        await fastify.authorize(['admin'])(request, reply);
    });

    fastify.get('/users', { schema: schema.list }, adminUserController.list.bind(adminUserController));
    fastify.patch('/users/:id/status', { schema: schema.updateStatus }, adminUserController.updateStatus.bind(adminUserController));
    fastify.patch('/users/:id/role', { schema: schema.updateRole }, adminUserController.updateRole.bind(adminUserController));
    fastify.patch('/users/:id/borrow-limit', { schema: schema.updateBorrowLimit }, adminUserController.updateBorrowLimit.bind(adminUserController));
}

module.exports = adminRoutes;