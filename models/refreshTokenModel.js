// models/refreshTokenModel.js
class RefreshTokenModel {
    constructor(db) {
        this.db = db;
    }

    async create(id, userId, tokenHash, expiresAt) {
        await this.db.query(
            'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
            [id, userId, tokenHash, expiresAt]
        );
    }

    async findByTokenHash(tokenHash) {
        const [rows] = await this.db.query(
            'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = FALSE AND expires_at > NOW()',
            [tokenHash]
        );
        return rows[0] || null;
    }

    async revoke(id) {
        await this.db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = ?', [id]);
    }

    async revokeByHash(tokenHash, userId) {
        await this.db.query(
            'UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ? AND user_id = ?',
            [tokenHash, userId]
        );
    }

    async revokeAllForUser(userId) {
        await this.db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?', [userId]);
    }
}

module.exports = RefreshTokenModel;