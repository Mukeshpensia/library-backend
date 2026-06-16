// controllers/reportController.js
class ReportController {
    constructor(reportService) {
        this.reportService = reportService;
    }

    async getDashboard(request, reply) {
        const data = await this.reportService.getSummary();
        return reply.send({ success: true, data });
    }
}

module.exports = ReportController;