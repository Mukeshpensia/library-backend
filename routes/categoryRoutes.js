// routes/categoryRoutes.js
const CategoryController = require('../controllers/categoryController');
const CategoryService = require('../services/categoryService');
const { categories: schema } = require('../schemas');

async function categoryRoutes(fastify, options) {
    const categoryService = new CategoryService(fastify);
    const categoryController = new CategoryController(categoryService);

    fastify.get('/categories', { onRequest: [fastify.authenticate], schema: schema.list }, categoryController.list.bind(categoryController));

    // Admin routes
    fastify.post('/categories', { onRequest: [fastify.authenticate, fastify.authorize(['admin'])], schema: schema.create }, categoryController.create.bind(categoryController));
    fastify.put('/categories/:id', { onRequest: [fastify.authenticate, fastify.authorize(['admin'])], schema: schema.update }, categoryController.update.bind(categoryController));
    fastify.delete('/categories/:id', { onRequest: [fastify.authenticate, fastify.authorize(['admin'])], schema: schema.remove }, categoryController.delete.bind(categoryController));
}

module.exports = categoryRoutes;