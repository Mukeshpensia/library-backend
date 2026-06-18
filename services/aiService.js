// services/aiService.js
class AIService {
    constructor(fastify) {
        this.db = fastify.mysql;
        this.fastify = fastify;
    }

    /**
     * Preprocesses borrowing history into a user-item interaction matrix.
     * This data is used by the ML models (SVD, Matrix Factorization).
     */
    async getInteractionMatrix() {
        const query = `
            SELECT 
                b.user_id, 
                bc.book_id, 
                COUNT(*) as borrow_count,
                MAX(br.rating) as user_rating
            FROM borrows b
            JOIN book_copies bc ON b.book_copy_id = bc.id
            LEFT JOIN book_ratings br ON b.user_id = br.user_id AND bc.book_id = br.book_id
            GROUP BY b.user_id, bc.book_id
        `;
        const [rows] = await this.db.query(query);
        
        // Format for AI consumption (e.g., CSV-like or JSON array)
        return rows.map(row => ({
            userId: row.user_id,
            bookId: row.book_id,
            weight: (row.borrow_count * 2) + (row.user_rating || 0) // Heuristic weight
        }));
    }

    /**
     * Personalized recommendations for a user.
     *
     * Per the system design, the backend is DECOUPLED from the model: an offline
     * Python batch job writes ranked rows into the `recommendations` table and we
     * only READ them here. When that table has no rows for the user (cold start,
     * or the batch job hasn't run yet) we fall back to the most popular books so
     * the endpoint always returns something useful.
     */
    async getRecommendations(userId, limit = 10) {
        const [rows] = await this.db.query(
            `SELECT b.id, b.title, b.authors, b.cover_image_url, b.popularity_score,
                    r.score, r.algorithm, r.rank_position, r.generated_at
             FROM recommendations r
             JOIN books b ON b.id = r.book_id
             WHERE r.user_id = ? AND b.deleted_at IS NULL
             ORDER BY r.score DESC, r.rank_position ASC
             LIMIT ?`,
            [userId, limit]
        );

        if (rows.length > 0) {
            return rows.map(book => ({
                ...book,
                reason: 'Recommended for you'
            }));
        }

        // Cold-start fallback: top books by popularity.
        return this.getPopularFallback(limit);
    }

    async getPopularFallback(limit = 10) {
        const [rows] = await this.db.query(
            `SELECT b.id, b.title, b.authors, b.cover_image_url, b.popularity_score
             FROM books b
             WHERE b.deleted_at IS NULL
             ORDER BY b.popularity_score DESC
             LIMIT ?`,
            [limit]
        );
        return rows.map(book => ({
            ...book,
            score: book.popularity_score,
            algorithm: 'popularity',
            reason: 'Popular in your library'
        }));
    }
}

module.exports = AIService;