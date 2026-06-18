// services/activityService.js
const AuditLogModel = require('../models/auditLogModel');

class ActivityService {
    constructor(fastify) {
        this.auditLogModel = new AuditLogModel(fastify.mysql);
    }

    async getMyActivity(userId) {
        return await this.auditLogModel.findByUser(userId);
    }

    async getGlobalActivity({ page = 1, limit = 20 } = {}) {
        const offset = (page - 1) * limit;
        const [items, total] = await Promise.all([
            this.auditLogModel.findAll(limit, offset),
            this.auditLogModel.count()
        ]);
        return {
            items,
            meta: { page, limit, total, total_pages: Math.ceil(total / limit) }
        };
    }
}

module.exports = ActivityService;