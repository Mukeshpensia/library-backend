// controllers/activityController.js
class ActivityController {
    constructor(activityService) {
        this.activityService = activityService;
    }

    async myActivity(request, reply) {
        const data = await this.activityService.getMyActivity(request.user.id);
        return reply.send({ success: true, data });
    }

    async globalActivity(request, reply) {
        const { page, limit } = request.query;
        const { items, meta } = await this.activityService.getGlobalActivity({ page, limit });
        return reply.send({ success: true, data: items, meta });
    }
}

module.exports = ActivityController;