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

    async getRecommendations(userId) {
        // In a real system, this would call a Python microservice (Flask/FastAPI)
        // For this prototype, we'll return trending books as a baseline recommendation.
        const query = `
            SELECT b.id, b.title, b.authors, b.cover_image_url, b.popularity_score
            FROM books b
            WHERE b.deleted_at IS NULL
            ORDER BY b.popularity_score DESC
            LIMIT 5
        `;
        const [rows] = await this.db.query(query);
        return rows.map(book => ({
            ...book,
            reason: 'Trending in your library',
            algorithm: 'popularity-baseline'
        }));
    }
}

module.exports = AIService;