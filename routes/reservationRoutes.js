// routes/reservationRoutes.js
const ReservationController = require('../controllers/reservationController');
const ReservationService = require('../services/reservationService');
const { reservations: schema } = require('../schemas');

async function reservationRoutes(fastify, options) {
    const reservationService = new ReservationService(fastify);
    const reservationController = new ReservationController(reservationService);

    fastify.post('/reservations', { onRequest: [fastify.authenticate], schema: schema.create }, reservationController.create.bind(reservationController));
    fastify.get('/reservations/my', { onRequest: [fastify.authenticate], schema: schema.my }, reservationController.my.bind(reservationController));
    fastify.delete('/reservations/:id', { onRequest: [fastify.authenticate], schema: schema.cancel }, reservationController.cancel.bind(reservationController));

    // Librarian view
    fastify.get('/reservations', {
        onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])],
        schema: schema.list
    }, reservationController.list.bind(reservationController));
}

module.exports = reservationRoutes;