// controllers/favoriteController.js
class FavoriteController {
    constructor(favoriteService) {
        this.favoriteService = favoriteService;
    }

    async toggle(request, reply) {
        const { book_id } = request.body;
        const result = await this.favoriteService.toggleFavorite(request.user.id, book_id);
        return reply.send({ success: true, ...result });
    }

    async list(request, reply) {
        const data = await this.favoriteService.getMyFavorites(request.user.id);
        return reply.send({ success: true, data });
    }
}

module.exports = FavoriteController;