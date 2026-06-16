// services/favoriteService.js
const { v4: uuidv4 } = require('uuid');
const FavoriteModel = require('../models/favoriteModel');

class FavoriteService {
    constructor(fastify) {
        this.favoriteModel = new FavoriteModel(fastify.mysql);
    }

    async toggleFavorite(userId, bookId) {
        const exists = await this.favoriteModel.isFavorite(userId, bookId);
        if (exists) {
            await this.favoriteModel.remove(userId, bookId);
            return { action: 'removed' };
        } else {
            await this.favoriteModel.add(uuidv4(), userId, bookId);
            return { action: 'added' };
        }
    }

    async getMyFavorites(userId) {
        return await this.favoriteModel.findByUser(userId);
    }
}

module.exports = FavoriteService;