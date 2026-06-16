// routes/aiRoutes.js
const AIController = require('../controllers/aiController');
const AIService = require('../services/aiService');
const { ai: schema } = require('../schemas');

async function aiRoutes(fastify, options) {
    const aiService = new AIService(fastify);
    const aiController = new AIController(aiService);

    // AI/ML Data Export (Admin only)
    fastify.get('/ai/borrow-history-matrix', {
        onRequest: [fastify.authenticate, fastify.authorize(['admin'])],
        schema: schema.historyMatrix
    }, aiController.getHistoryMatrix.bind(aiController));

    // Personalized Recommendations
    fastify.get('/recommendations/my', {
        onRequest: [fastify.authenticate],
        schema: schema.myRecommendations
    }, aiController.getMyRecommendations.bind(aiController));
}

module.exports = aiRoutes;