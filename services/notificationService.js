// services/notificationService.js
const { v4: uuidv4 } = require('uuid');
const NotificationModel = require('../models/notificationModel');

class NotificationService {
    constructor(fastify) {
        this.notificationModel = new NotificationModel(fastify.mysql);
        this.fastify = fastify;
    }

    async createNotification(userId, type, title, message) {
        const id = uuidv4();
        await this.notificationModel.create({ id, user_id: userId, type, title, message });
        return id;
    }

    async getMyNotifications(userId) {
        return await this.notificationModel.findByUser(userId);
    }

    async markRead(id, userId) {
        await this.notificationModel.markAsRead(id, userId);
    }

    async markAllRead(userId) {
        await this.notificationModel.markAllAsRead(userId);
    }

    // This method will be called by the scheduler
    async checkAndSendOverdueReminders() {
        this.fastify.log.info('Running overdue reminders check...');
        const query = `
            SELECT b.id, b.user_id, b.due_date, u.email, u.full_name, bk.title as book_title
            FROM borrows b
            JOIN users u ON b.user_id = u.id
            JOIN book_copies bc ON b.book_copy_id = bc.id
            JOIN books bk ON bc.book_id = bk.id
            WHERE b.status_enum = 'active' 
            AND b.due_date <= CURDATE()
        `;
        const [rows] = await this.fastify.mysql.query(query);

        for (const row of rows) {
            const isOverdue = new Date(row.due_date) < new Date();
            const type = isOverdue ? 'OVERDUE_ALERT' : 'DUE_DATE_REMINDER';
            const title = isOverdue ? 'Book Overdue Alert' : 'Book Due Tomorrow';
            const message = `Dear ${row.full_name}, your borrowed book "${row.book_title}" is ${isOverdue ? 'OVERDUE' : 'due soon'}. Please return it to avoid fines.`;

            await this.createNotification(row.user_id, type, title, message);
            // In a real app, also call emailService.send(...)
            this.fastify.log.info(`Notification sent to user ${row.user_id} for book ${row.book_title}`);
        }

        return rows.length;
    }
}

module.exports = NotificationService;