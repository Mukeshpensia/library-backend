// controllers/reservationController.js
class ReservationController {
    constructor(reservationService) {
        this.reservationService = reservationService;
    }

    async create(request, reply) {
        const { book_id } = request.body;
        const result = await this.reservationService.reserveBook(request.user.id, book_id);
        if (!result.success) return reply.code(400).send(result);
        return reply.code(201).send(result);
    }

    async my(request, reply) {
        const data = await this.reservationService.getMyReservations(request.user.id);
        return reply.send({ success: true, data });
    }

    async list(request, reply) {
        const { page = 1, limit = 20 } = request.query;
        const data = await this.reservationService.getAllReservations({
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });
        return reply.send({ success: true, data });
    }

    async cancel(request, reply) {
        await this.reservationService.cancelReservation(request.params.id, request.user.id);
        return reply.send({ success: true, message: 'Reservation cancelled.' });
    }
}

module.exports = ReservationController;