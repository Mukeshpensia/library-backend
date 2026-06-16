// services/reportService.js
const ReportModel = require('../models/reportModel');

class ReportService {
    constructor(fastify) {
        this.reportModel = new ReportModel(fastify.mysql);
    }

    async getSummary() {
        const stats = await this.reportModel.getDashboardStats();
        const trending = await this.reportModel.getTrendingBooks();
        const categories = await this.reportModel.getPopularCategories();
        
        return {
            stats,
            trending_books: trending,
            popular_categories: categories
        };
    }
}

module.exports = ReportService;