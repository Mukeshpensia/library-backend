// models/reportModel.js
class ReportModel {
    constructor(db) {
        this.db = db;
    }

    async getDashboardStats() {
        const [total_books] = await this.db.query('SELECT COUNT(*) as count FROM books WHERE deleted_at IS NULL');
        const [total_copies] = await this.db.query('SELECT COUNT(*) as count FROM book_copies');
        const [available_copies] = await this.db.query(`SELECT COUNT(*) as count FROM book_copies WHERE status_enum = 'available'`);
        const [active_borrows] = await this.db.query(`SELECT COUNT(*) as count FROM borrows WHERE status_enum = 'active'`);
        const [overdue_borrows] = await this.db.query(`SELECT COUNT(*) as count FROM borrows WHERE status_enum = 'overdue' OR (status_enum = 'active' AND due_date < CURDATE())`);
        const [total_users] = await this.db.query('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
        const [total_fines] = await this.db.query('SELECT SUM(fine_amount) as total FROM borrows WHERE fine_paid = FALSE');

        return {
            total_books: total_books[0].count,
            total_copies: total_copies[0].count,
            available_copies: available_copies[0].count,
            active_borrows: active_borrows[0].count,
            overdue_borrows: overdue_borrows[0].count,
            total_users: total_users[0].count,
            total_fines_outstanding: total_fines[0].total || 0
        };
    }

    async getTrendingBooks(limit = 10) {
        const query = `
            SELECT b.id, b.title, b.authors, COUNT(br.id) as borrow_count
            FROM books b
            JOIN book_copies bc ON b.id = bc.book_id
            JOIN borrows br ON bc.id = br.book_copy_id
            WHERE b.deleted_at IS NULL
            GROUP BY b.id
            ORDER BY borrow_count DESC
            LIMIT ?
        `;
        const [rows] = await this.db.query(query, [limit]);
        return rows;
    }

    async getPopularCategories() {
        const query = `
            SELECT c.name, COUNT(br.id) as borrow_count
            FROM categories c
            JOIN book_categories bcat ON c.id = bcat.category_id
            JOIN borrows br ON bcat.book_id = (SELECT book_id FROM book_copies WHERE id = br.book_copy_id)
            GROUP BY c.id
            ORDER BY borrow_count DESC
            LIMIT 5
        `;
        const [rows] = await this.db.query(query);
        return rows;
    }
}

module.exports = ReportModel;