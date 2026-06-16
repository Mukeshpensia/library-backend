// routes/favoriteRoutes.js
const FavoriteController = require('../controllers/favoriteController');
const FavoriteService = require('../services/favoriteService');
const { favorites: schema } = require('../schemas');

async function favoriteRoutes(fastify, options) {
    const favoriteService = new FavoriteService(fastify);
    const favoriteController = new FavoriteController(favoriteService);

    fastify.post('/favorites', { onRequest: [fastify.authenticate], schema: schema.toggle }, favoriteController.toggle.bind(favoriteController));
    fastify.get('/favorites', { onRequest: [fastify.authenticate], schema: schema.list }, favoriteController.list.bind(favoriteController));
}

module.exports = favoriteRoutes;