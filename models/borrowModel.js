// models/borrowModel.js
class BorrowModel {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        const [rows] = await this.db.query('SELECT * FROM borrows WHERE id = ?', [id]);
        return rows[0] || null;
    }

    async create(borrowData) {
        const { id, user_id, book_copy_id, issued_by, due_date, notes } = borrowData;
        await this.db.query(
            'INSERT INTO borrows (id, user_id, book_copy_id, issued_by, due_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [id, user_id, book_copy_id, issued_by, due_date, notes]
        );
        
        // Update copy status to borrowed
        await this.db.query(`UPDATE book_copies SET status_enum = 'borrowed' WHERE id = ?`, [book_copy_id]);
    }

    async returnBook(id, returnedBy, condition, notes) {
        const [borrow] = await this.db.query('SELECT book_copy_id, due_date FROM borrows WHERE id = ?', [id]);
        if (!borrow[0]) return null;

        const returnedAt = new Date();
        const dueDate = new Date(borrow[0].due_date);
        let fineAmount = 0;

        if (returnedAt > dueDate) {
            const diffTime = Math.abs(returnedAt - dueDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // Simple fine logic: 2 per day as per doc
            fineAmount = diffDays * 2; 
        }

        await this.db.query(
            `UPDATE borrows SET returned_by = ?, returned_at = ?, status_enum = 'returned', fine_amount = ?, notes = CONCAT(IFNULL(notes, ''), ?) WHERE id = ?`,
            [returnedBy, returnedAt, fineAmount, `\nReturn notes: ${notes}, condition: ${condition}`, id]
        );

        // Update copy status back to available
        await this.db.query(`UPDATE book_copies SET status_enum = 'available', condition_enum = ? WHERE id = ?`, [condition, borrow[0].book_copy_id]);
        
        return { fineAmount, returnedAt };
    }

    async renew(id, newDueDate) {
        await this.db.query(
            'UPDATE borrows SET due_date = ?, renewal_count = renewal_count + 1 WHERE id = ?',
            [newDueDate, id]
        );
    }

    async markFinePaid(id) {
        const [res] = await this.db.query(
            'UPDATE borrows SET fine_paid = TRUE WHERE id = ?',
            [id]
        );
        return res.affectedRows > 0;
    }

    async findByUser(userId) {
        const [rows] = await this.db.query(
            `SELECT b.*, bc.barcode,
                    bk.id AS book_id, bk.title AS book_title,
                    bk.authors AS book_authors, bk.cover_image_url AS book_cover
             FROM borrows b
             JOIN book_copies bc ON b.book_copy_id = bc.id
             JOIN books bk ON bc.book_id = bk.id
             WHERE b.user_id = ?
             ORDER BY b.issued_at DESC`,
            [userId]
        );
        return rows;
    }

    async findAll({ filters = {}, limit = 20, offset = 0 }) {
        let query = `SELECT b.*, u.full_name as user_name, bc.barcode,
                            bk.id AS book_id, bk.title AS book_title
                     FROM borrows b
                     JOIN users u ON b.user_id = u.id
                     JOIN book_copies bc ON b.book_copy_id = bc.id
                     JOIN books bk ON bc.book_id = bk.id
                     WHERE 1=1`;
        const params = [];

        if (filters.status) {
            query += ' AND b.status_enum = ?';
            params.push(filters.status);
        }
        if (filters.user_id) {
            query += ' AND b.user_id = ?';
            params.push(filters.user_id);
        }

        query += ' ORDER BY b.issued_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [rows] = await this.db.query(query, params);
        return rows;
    }
}

module.exports = BorrowModel;