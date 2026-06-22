// controllers/adminUserController.js
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

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

    async create(request, reply) {
        const { full_name, email, password, role, student_id, employee_id, department, phone, max_borrow_limit } = request.body;

        const validRoles = ['student', 'librarian', 'admin'];
        if (!validRoles.includes(role)) {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_ROLE', message: 'Invalid role.' } });
        }

        // Reject duplicate email / student / employee identifiers up front.
        if (await this.userModel.findByEmail(email)) {
            return reply.code(409).send({ success: false, error: { code: 'EMAIL_IN_USE', message: 'A user with this email already exists.' } });
        }
        if (student_id && await this.userModel.findByStudentOrEmployeeId(student_id, true)) {
            return reply.code(409).send({ success: false, error: { code: 'STUDENT_ID_IN_USE', message: 'That student ID is already in use.' } });
        }
        if (employee_id && await this.userModel.findByStudentOrEmployeeId(employee_id, false)) {
            return reply.code(409).send({ success: false, error: { code: 'EMPLOYEE_ID_IN_USE', message: 'That employee ID is already in use.' } });
        }

        const id = uuidv4();
        const password_hash = await bcrypt.hash(password, 12);
        await this.userModel.createUser({
            id, full_name, email, password_hash, role,
            student_id: student_id || null,
            employee_id: employee_id || null,
            department: department || null,
            phone: phone || null
        });

        // createUser leaves max_borrow_limit at its DB default; apply an override
        // if one was supplied.
        if (max_borrow_limit !== undefined && max_borrow_limit !== null) {
            await this.userModel.adminUpdate(id, { max_borrow_limit });
        }

        await this.auditLogModel.log(uuidv4(), request.user.id, 'CREATE_USER', 'users', id, { role });
        return reply.code(201).send({ success: true, data: { user_id: id } });
    }

    async remove(request, reply) {
        const targetId = request.params.id;

        // An admin must not delete their own account.
        if (targetId === request.user.id) {
            return reply.code(400).send({ success: false, error: { code: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account.' } });
        }

        const target = await this.userModel.findById(targetId);
        if (!target) {
            return reply.code(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
        }

        await this.userModel.softDelete(targetId);
        await this.auditLogModel.log(uuidv4(), request.user.id, 'DELETE_USER', 'users', targetId, { role: target.role });
        return reply.send({ success: true, message: 'User deleted.' });
    }

    async updateStatus(request, reply) {
        const { is_active } = request.body;
        await this.userModel.adminUpdate(request.params.id, { is_active });
        await this.auditLogModel.log(uuidv4(), request.user.id, 'UPDATE_USER_STATUS', 'users', request.params.id, { is_active });
        return reply.send({ success: true, message: `User account ${is_active ? 'activated' : 'deactivated'}.` });
    }

    async updateRole(request, reply) {
        const { role } = request.body;
        const validRoles = ['student', 'librarian', 'admin'];
        if (!validRoles.includes(role)) return reply.code(400).send({ success: false, message: 'Invalid role.' });

        await this.userModel.adminUpdate(request.params.id, { role });
        await this.auditLogModel.log(uuidv4(), request.user.id, 'UPDATE_USER_ROLE', 'users', request.params.id, { role });
        return reply.send({ success: true, message: 'User role updated.' });
    }

    async updateBorrowLimit(request, reply) {
        const { max_borrow_limit } = request.body;
        await this.userModel.adminUpdate(request.params.id, { max_borrow_limit });
        await this.auditLogModel.log(uuidv4(), request.user.id, 'UPDATE_USER_BORROW_LIMIT', 'users', request.params.id, { max_borrow_limit });
        return reply.send({ success: true, message: 'User borrow limit updated.' });
    }
}

module.exports = AdminUserController;