// models/notificationModel.js
class NotificationModel {
    constructor(db) {
        this.db = db;
    }

    async create(notificationData) {
        const { id, user_id, type, title, message } = notificationData;
        await this.db.query(
            'INSERT INTO notifications (id, user_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
            [id, user_id, type, title, message]
        );
    }

    async findByUser(userId) {
        const [rows] = await this.db.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_at DESC',
            [userId]
        );
        return rows;
    }

    async markAsRead(id, userId) {
        await this.db.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [id, userId]
        );
    }

    async markAllAsRead(userId) {
        await this.db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
            [userId]
        );
    }
}

module.exports = NotificationModel;