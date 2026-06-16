// controllers/adminUserController.js
class AdminUserController {
    constructor(userModel, auditLogModel) {
        this.userModel = userModel;
        this.auditLogModel = auditLogModel;
    }

    async list(request, reply) {
        const { role, search, page = 1, limit = 20 } = request.query;
        const users = await this.userModel.findAll({
            filters: { role, search },
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });
        const total = await this.userModel.countAll({ filters: { role, search } });
        return reply.send({ success: true, data: users, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
    }

    async updateStatus(request, reply) {
        const { is_active } = request.body;
        await this.userModel.updateProfile(request.params.id, { is_active });
        return reply.send({ success: true, message: `User account ${is_active ? 'activated' : 'deactivated'}.` });
    }

    async updateRole(request, reply) {
        const { role } = request.body;
        const validRoles = ['student', 'librarian', 'admin'];
        if (!validRoles.includes(role)) return reply.code(400).send({ success: false, message: 'Invalid role.' });
        
        await this.userModel.updateProfile(request.params.id, { role });
        return reply.send({ success: true, message: 'User role updated.' });
    }

    async updateBorrowLimit(request, reply) {
        const { max_borrow_limit } = request.body;
        await this.userModel.updateProfile(request.params.id, { max_borrow_limit });
        return reply.send({ success: true, message: 'User borrow limit updated.' });
    }
}

module.exports = AdminUserController;