// controllers/bookController.js
const { saveCoverImage, deleteCoverImage } = require('../utils/imageProcessor');

class BookController {
    constructor(bookService) {
        this.bookService = bookService;
    }

    async list(request, reply) {
        const { q, author, language, category_id, page = 1, limit = 20, sort, order } = request.query;
        const result = await this.bookService.getBooks({
            filters: { q, author, language, category_id },
            page: parseInt(page),
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit),
            sort,
            order
        });
        return reply.send({ success: true, data: result.books, meta: result.meta });
    }

    async get(request, reply) {
        const book = await this.bookService.getBookById(request.params.id);
        if (!book) return reply.code(404).send({ success: false, error: { code: 'BOOK_NOT_FOUND', message: 'Book not found.' } });
        return reply.send({ success: true, data: book });
    }

    async create(request, reply) {
        const bookId = await this.bookService.createBook(request.body);
        return reply.code(201).send({ success: true, data: { book_id: bookId } });
    }

    async update(request, reply) {
        await this.bookService.updateBook(request.params.id, request.body);
        return reply.send({ success: true, message: 'Book updated successfully.' });
    }

    async delete(request, reply) {
        await this.bookService.deleteBook(request.params.id);
        return reply.send({ success: true, message: 'Book deleted successfully.' });
    }

    async uploadCover(request, reply) {
        const bookId = request.params.id;

        const book = await this.bookService.getBookById(bookId);
        if (!book) {
            return reply.code(404).send({ success: false, error: { code: 'BOOK_NOT_FOUND', message: 'Book not found.' } });
        }

        const file = await request.file();
        if (!file || !file.filename) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Cover image file is required.' } });
        }
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid file type. Only image files are allowed.' } });
        }

        // Convert to webp/avif and store it, then point the book at the new file.
        const coverUrl = await saveCoverImage(file, bookId);
        await this.bookService.updateBook(bookId, { cover_image_url: coverUrl });

        // Remove the previous locally-stored cover, if any.
        deleteCoverImage(book.cover_image_url);

        return reply.send({ success: true, message: 'Cover uploaded successfully.', data: { cover_image_url: coverUrl } });
    }

    async addCopy(request, reply) {
        const copyId = await this.bookService.addCopy(request.params.id, request.body);
        return reply.code(201).send({ success: true, data: { copy_id: copyId } });
    }

    async updateCopy(request, reply) {
        await this.bookService.updateCopy(request.params.copyId, request.body);
        return reply.send({ success: true, message: 'Copy updated successfully.' });
    }

    async rate(request, reply) {
        const { rating, review } = request.body;
        const userId = request.user.id;
        await this.bookService.rateBook(userId, request.params.id, rating, review);
        return reply.send({ success: true, message: 'Rating submitted successfully.' });
    }

    async getRatings(request, reply) {
        const ratings = await this.bookService.getRatings(request.params.id);
        return reply.send({ success: true, data: ratings });
    }
}

module.exports = BookController;