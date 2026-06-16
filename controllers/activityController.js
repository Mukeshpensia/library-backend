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
        const data = await this.activityService.getGlobalActivity();
        return reply.send({ success: true, data });
    }
}

module.exports = ActivityController;