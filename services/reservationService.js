// services/reservationService.js
const { v4: uuidv4 } = require('uuid');
const ReservationModel = require('../models/reservationModel');
const NotificationService = require('./notificationService');

class ReservationService {
    constructor(fastify) {
        this.reservationModel = new ReservationModel(fastify.mysql);
        this.notificationService = new NotificationService(fastify);
    }

    async reserveBook(userId, bookId) {
        // Check if user already has an active reservation for this book
        const active = await this.reservationModel.findActiveByBook(bookId);
        if (active.some(r => r.user_id === userId)) {
            return { success: false, message: 'You already have an active reservation for this book.' };
        }

        const id = uuidv4();
        // Reservation expires in 7 days if not fulfilled
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.reservationModel.create({ id, user_id: userId, book_id: bookId, expires_at: expiresAt });
        return { success: true, reservation_id: id };
    }

    async getMyReservations(userId) {
        return await this.reservationModel.findByUser(userId);
    }

    async getAllReservations(options) {
        return await this.reservationModel.findAll(options);
    }

    async cancelReservation(id, userId) {
        await this.reservationModel.cancel(id, userId);
        return { success: true };
    }

    // Called when a copy of `bookId` becomes available (e.g. on return). Fulfils
    // the oldest pending reservation by marking it fulfilled and notifying that
    // user to come collect the book. Returns the fulfilled reservation, if any.
    async notifyNextInQueue(bookId) {
        const reservations = await this.reservationModel.findActiveByBook(bookId);
        if (reservations.length === 0) return null;

        const next = reservations[0];
        await this.reservationModel.updateStatus(next.id, 'fulfilled');
        await this.notificationService.createNotification(
            next.user_id,
            'RESERVATION_READY',
            'Reserved Book Available',
            `A book you reserved is now available. Please visit the library to collect it.`
        );
        return next;
    }
}

module.exports = ReservationService;