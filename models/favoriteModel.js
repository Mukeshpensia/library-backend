// models/favoriteModel.js
class FavoriteModel {
    constructor(db) {
        this.db = db;
    }

    async add(id, userId, bookId) {
        await this.db.query(
            'INSERT INTO favorites (id, user_id, book_id) VALUES (?, ?, ?)',
            [id, userId, bookId]
        );
    }

    async remove(userId, bookId) {
        await this.db.query('DELETE FROM favorites WHERE user_id = ? AND book_id = ?', [userId, bookId]);
    }

    async findByUser(userId) {
        const [rows] = await this.db.query(
            'SELECT f.*, b.title, b.authors, b.cover_image_url FROM favorites f JOIN books b ON f.book_id = b.id WHERE f.user_id = ?',
            [userId]
        );
        return rows;
    }

    async isFavorite(userId, bookId) {
        const [rows] = await this.db.query('SELECT id FROM favorites WHERE user_id = ? AND book_id = ?', [userId, bookId]);
        return rows.length > 0;
    }
}

module.exports = FavoriteModel;