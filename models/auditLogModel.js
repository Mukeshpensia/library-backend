// models/auditLogModel.js
class AuditLogModel {
    constructor(db) {
        this.db = db;
    }

    async log(id, userId, action, entityType, entityId, metadata) {
        await this.db.query(
            'INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
            [id, userId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null]
        );
    }

    async findByUser(userId, limit = 50) {
        const [rows] = await this.db.query(
            'SELECT al.*, u.full_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.user_id = ? ORDER BY al.created_at DESC LIMIT ?',
            [userId, limit]
        );
        return rows;
    }

    async findAll(limit = 100) {
        const [rows] = await this.db.query(
            'SELECT al.*, u.full_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT ?',
            [limit]
        );
        return rows;
    }
}

module.exports = AuditLogModel;