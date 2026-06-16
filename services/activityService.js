// services/activityService.js
const AuditLogModel = require('../models/auditLogModel');

class ActivityService {
    constructor(fastify) {
        this.auditLogModel = new AuditLogModel(fastify.mysql);
    }

    async getMyActivity(userId) {
        return await this.auditLogModel.findByUser(userId);
    }

    async getGlobalActivity() {
        return await this.auditLogModel.findAll();
    }
}

module.exports = ActivityService;