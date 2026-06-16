// models/reservationModel.js
class ReservationModel {
    constructor(db) {
        this.db = db;
    }

    async create(reservationData) {
        const { id, user_id, book_id, expires_at } = reservationData;
        await this.db.query(
            'INSERT INTO reservations (id, user_id, book_id, expires_at) VALUES (?, ?, ?, ?)',
            [id, user_id, book_id, expires_at]
        );
    }

    async findActiveByBook(bookId) {
        const [rows] = await this.db.query(
            'SELECT * FROM reservations WHERE book_id = ? AND status = "pending" ORDER BY reserved_at ASC',
            [bookId]
        );
        return rows;
    }

    async findByUser(userId) {
        const [rows] = await this.db.query(
            'SELECT r.*, b.title FROM reservations r JOIN books b ON r.book_id = b.id WHERE r.user_id = ? ORDER BY r.reserved_at DESC',
            [userId]
        );
        return rows;
    }

    async findAll({ limit = 20, offset = 0 }) {
        const [rows] = await this.db.query(
            'SELECT r.*, u.full_name, b.title FROM reservations r JOIN users u ON r.user_id = u.id JOIN books b ON r.book_id = b.id ORDER BY r.reserved_at DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
        return rows;
    }

    async updateStatus(id, status) {
        await this.db.query('UPDATE reservations SET status = ? WHERE id = ?', [status, id]);
    }

    async cancel(id, userId) {
        await this.db.query('UPDATE reservations SET status = "cancelled" WHERE id = ? AND user_id = ?', [id, userId]);
    }
}

module.exports = ReservationModel;