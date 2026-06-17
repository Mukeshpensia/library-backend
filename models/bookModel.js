// models/bookModel.js
const BOOK_UPDATABLE_FIELDS = new Set([
    'isbn', 'title', 'subtitle', 'authors', 'publisher', 'published_year',
    'edition', 'language', 'pages', 'description', 'cover_image_url', 'location_code'
]);

const COPY_UPDATABLE_FIELDS = new Set([
    'barcode', 'condition_enum', 'status_enum', 'acquired_date'
]);

const BOOK_SORTABLE_FIELDS = new Set([
    'created_at', 'title', 'published_year', 'popularity_score', 'available_copies'
]);

class BookModel {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        const [rows] = await this.db.query(
            'SELECT * FROM books WHERE id = ? AND deleted_at IS NULL',
            [id]
        );
        return rows[0] || null;
    }

    async create(bookData) {
        const { id, isbn, title, subtitle, authors, publisher, published_year, edition, language, pages, description, cover_image_url, location_code } = bookData;
        await this.db.query(
            'INSERT INTO books (id, isbn, title, subtitle, authors, publisher, published_year, edition, language, pages, description, cover_image_url, location_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, isbn, title, subtitle, JSON.stringify(authors), publisher, published_year, edition, language, pages, description, cover_image_url, location_code]
        );
        return id;
    }

    async update(id, updateData) {
        const safeData = Object.fromEntries(
            Object.entries(updateData).filter(([k]) => BOOK_UPDATABLE_FIELDS.has(k))
        );
        if (Object.keys(safeData).length === 0) return;
        if (safeData.authors) safeData.authors = JSON.stringify(safeData.authors);
        const fields = Object.keys(safeData).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(safeData), id];
        await this.db.query(`UPDATE books SET ${fields} WHERE id = ?`, values);
    }

    async softDelete(id) {
        await this.db.query('UPDATE books SET deleted_at = NOW() WHERE id = ?', [id]);
    }

    async findAll({ filters = {}, limit = 20, offset = 0, sort = 'created_at', order = 'DESC' }) {
        const safeSort = BOOK_SORTABLE_FIELDS.has(sort) ? sort : 'created_at';
        const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        let query = 'SELECT * FROM books WHERE deleted_at IS NULL';
        const params = [];

        if (filters.q) {
            query += ' AND (title LIKE ? OR isbn LIKE ? OR authors LIKE ?)';
            params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
        }
        if (filters.author) {
            query += ' AND authors LIKE ?';
            params.push(`%${filters.author}%`);
        }
        if (filters.language) {
            query += ' AND language = ?';
            params.push(filters.language);
        }
        if (filters.category_id) {
            query += ' AND id IN (SELECT book_id FROM book_categories WHERE category_id = ?)';
            params.push(filters.category_id);
        }

        query += ` ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await this.db.query(query, params);
        return rows;
    }

    async countAll({ filters = {} }) {
        let query = 'SELECT COUNT(*) as count FROM books WHERE deleted_at IS NULL';
        const params = [];

        if (filters.q) {
            query += ' AND (title LIKE ? OR isbn LIKE ? OR authors LIKE ?)';
            params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
        }
        if (filters.author) {
            query += ' AND authors LIKE ?';
            params.push(`%${filters.author}%`);
        }
        if (filters.language) {
            query += ' AND language = ?';
            params.push(filters.language);
        }
        if (filters.category_id) {
            query += ' AND id IN (SELECT book_id FROM book_categories WHERE category_id = ?)';
            params.push(filters.category_id);
        }

        const [rows] = await this.db.query(query, params);
        return rows[0].count;
    }

    // Book Copies
    async addCopy(copyData) {
        const { id, book_id, barcode, condition_enum, status_enum, acquired_date } = copyData;
        await this.db.query(
            'INSERT INTO book_copies (id, book_id, barcode, condition_enum, status_enum, acquired_date) VALUES (?, ?, ?, ?, ?, ?)',
            [id, book_id, barcode, condition_enum, status_enum || 'available', acquired_date]
        );
        await this.updateCopyCounts(book_id);
    }

    async updateCopy(copyId, updateData) {
        const safeData = Object.fromEntries(
            Object.entries(updateData).filter(([k]) => COPY_UPDATABLE_FIELDS.has(k))
        );
        if (Object.keys(safeData).length === 0) return;
        const fields = Object.keys(safeData).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(safeData), copyId];
        await this.db.query(`UPDATE book_copies SET ${fields} WHERE id = ?`, values);
        
        // Update counts if status changed
        const [copy] = await this.db.query('SELECT book_id FROM book_copies WHERE id = ?', [copyId]);
        if (copy[0]) await this.updateCopyCounts(copy[0].book_id);
    }

    async getCopies(bookId) {
        const [rows] = await this.db.query('SELECT * FROM book_copies WHERE book_id = ?', [bookId]);
        return rows;
    }

    async updateCopyCounts(bookId) {
        const [total] = await this.db.query('SELECT COUNT(*) as count FROM book_copies WHERE book_id = ?', [bookId]);
        const [available] = await this.db.query(`SELECT COUNT(*) as count FROM book_copies WHERE book_id = ? AND status_enum = 'available'`, [bookId]);
        
        await this.db.query('UPDATE books SET total_copies = ?, available_copies = ? WHERE id = ?', [total[0].count, available[0].count, bookId]);
    }

    // Ratings & Reviews
    async addRating(ratingData) {
        const { id, user_id, book_id, rating, review } = ratingData;
        await this.db.query(
            'INSERT INTO book_ratings (id, user_id, book_id, rating, review) VALUES (?, ?, ?, ?, ?)',
            [id, user_id, book_id, rating, review]
        );
        
        // Update popularity score (simplified: average rating * total borrows)
        const [avgRating] = await this.db.query('SELECT AVG(rating) as avg FROM book_ratings WHERE book_id = ?', [book_id]);
        const [borrows] = await this.db.query('SELECT COUNT(*) as count FROM borrows b JOIN book_copies bc ON b.book_copy_id = bc.id WHERE bc.book_id = ?', [book_id]);
        
        const popularity = (avgRating[0].avg || 0) * (borrows[0].count || 1);
        await this.db.query('UPDATE books SET popularity_score = ? WHERE id = ?', [popularity, book_id]);
    }

    async getRatings(bookId) {
        const [rows] = await this.db.query('SELECT br.*, u.full_name FROM book_ratings br JOIN users u ON br.user_id = u.id WHERE br.book_id = ? ORDER BY br.created_at DESC', [bookId]);
        return rows;
    }
}

module.exports = BookModel;