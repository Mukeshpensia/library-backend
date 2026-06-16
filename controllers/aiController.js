// controllers/aiController.js
class AIController {
    constructor(aiService) {
        this.aiService = aiService;
    }

    async getHistoryMatrix(request, reply) {
        const data = await this.aiService.getInteractionMatrix();
        return reply.send({ success: true, data });
    }

    async getMyRecommendations(request, reply) {
        const data = await this.aiService.getRecommendations(request.user.id);
        return reply.send({ success: true, data: { recommendations: data } });
    }
}

module.exports = AIController;