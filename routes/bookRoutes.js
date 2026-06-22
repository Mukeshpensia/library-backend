// routes/bookRoutes.js
const BookController = require('../controllers/bookController');
const BookService = require('../services/bookService');
const { books: schema } = require('../schemas');

async function bookRoutes(fastify, options) {
    const bookService = new BookService(fastify);
    const bookController = new BookController(bookService);

    fastify.get('/books', { onRequest: [fastify.authenticate], schema: schema.list }, bookController.list.bind(bookController));
    fastify.get('/books/:id', { onRequest: [fastify.authenticate], schema: schema.get }, bookController.get.bind(bookController));

    // Librarian+ routes
    fastify.post('/books', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.create }, bookController.create.bind(bookController));
    fastify.put('/books/:id', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.update }, bookController.update.bind(bookController));
    fastify.delete('/books/:id', { onRequest: [fastify.authenticate, fastify.authorize(['admin'])], schema: schema.remove }, bookController.delete.bind(bookController));

    // Cover image upload (multipart). The image is re-encoded to webp/avif.
    fastify.post('/books/:id/cover', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.uploadCover }, bookController.uploadCover.bind(bookController));

    // Copy management
    fastify.post('/books/:id/copies', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.addCopy }, bookController.addCopy.bind(bookController));
    fastify.patch('/books/:id/copies/:copyId', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.updateCopy }, bookController.updateCopy.bind(bookController));

    // Ratings & Reviews
    fastify.post('/books/:id/rate', { onRequest: [fastify.authenticate], schema: schema.rate }, bookController.rate.bind(bookController));
    fastify.get('/books/:id/ratings', { onRequest: [fastify.authenticate], schema: schema.getRatings }, bookController.getRatings.bind(bookController));
}

module.exports = bookRoutes;