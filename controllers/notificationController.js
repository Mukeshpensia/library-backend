// controllers/notificationController.js
class NotificationController {
    constructor(notificationService) {
        this.notificationService = notificationService;
    }

    async list(request, reply) {
        const notifications = await this.notificationService.getMyNotifications(request.user.id);
        return reply.send({ success: true, data: notifications });
    }

    async markRead(request, reply) {
        await this.notificationService.markRead(request.params.id, request.user.id);
        return reply.send({ success: true, message: 'Notification marked as read.' });
    }

    async markAllRead(request, reply) {
        await this.notificationService.markAllRead(request.user.id);
        return reply.send({ success: true, message: 'All notifications marked as read.' });
    }
}

module.exports = NotificationController;