// routes/reportRoutes.js
const ReportController = require('../controllers/reportController');
const ReportService = require('../services/reportService');
const { reports: schema } = require('../schemas');

async function reportRoutes(fastify, options) {
    const reportService = new ReportService(fastify);
    const reportController = new ReportController(reportService);

    // Librarian+ access for reports
    fastify.get('/reports/dashboard', {
        onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])],
        schema: schema.dashboard
    }, reportController.getDashboard.bind(reportController));

    // Borrow counts bucketed by day/week/month for the dashboard line chart.
    fastify.get('/reports/trends', {
        onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])],
        schema: schema.trends
    }, reportController.getTrends.bind(reportController));
}

module.exports = reportRoutes;