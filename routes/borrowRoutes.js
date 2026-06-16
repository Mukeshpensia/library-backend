// routes/borrowRoutes.js
const BorrowController = require('../controllers/borrowController');
const BorrowService = require('../services/borrowService');
const { borrows: schema } = require('../schemas');

async function borrowRoutes(fastify, options) {
    const borrowService = new BorrowService(fastify);
    const borrowController = new BorrowController(borrowService);

    fastify.get('/borrows/my', { onRequest: [fastify.authenticate], schema: schema.my }, borrowController.myBorrows.bind(borrowController));
    fastify.post('/borrows/:id/renew', { onRequest: [fastify.authenticate], schema: schema.renew }, borrowController.renew.bind(borrowController));

    // Librarian+ routes
    fastify.get('/borrows', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.list }, borrowController.list.bind(borrowController));
    fastify.post('/borrows', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.issue }, borrowController.issue.bind(borrowController));
    fastify.post('/borrows/:id/return', { onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])], schema: schema.returnBook }, borrowController.returnBook.bind(borrowController));
}

module.exports = borrowRoutes;