// services/bookService.js
const { v4: uuidv4 } = require('uuid');
const BookModel = require('../models/bookModel');
const AuditLogModel = require('../models/auditLogModel');

class BookService {
    constructor(fastify) {
        this.bookModel = new BookModel(fastify.mysql);
        this.auditLogModel = new AuditLogModel(fastify.mysql);
        this.fastify = fastify;
    }

    async getBooks(options) {
        const books = await this.bookModel.findAll(options);
        const total = await this.bookModel.countAll(options);
        return {
            books,
            meta: {
                page: options.page || 1,
                limit: options.limit || 20,
                total,
                total_pages: Math.ceil(total / (options.limit || 20))
            }
        };
    }

    async getBookById(id) {
        const book = await this.bookModel.findById(id);
        if (!book) return null;
        const copies = await this.bookModel.getCopies(id);
        return { ...book, copies };
    }

    async createBook(bookData) {
        const id = uuidv4();
        await this.bookModel.create({ ...bookData, id });
        return id;
    }

    async updateBook(id, updateData) {
        await this.bookModel.update(id, updateData);
        return true;
    }

    async deleteBook(id) {
        await this.bookModel.softDelete(id);
        return true;
    }

    async addCopy(bookId, copyData) {
        const id = uuidv4();
        await this.bookModel.addCopy({ ...copyData, id, book_id: bookId });
        return id;
    }

    async updateCopy(copyId, updateData) {
        await this.bookModel.updateCopy(copyId, updateData);
        return true;
    }

    async rateBook(userId, bookId, rating, review) {
        const id = uuidv4();
        await this.bookModel.addRating({ id, user_id: userId, book_id: bookId, rating, review });
        await this.auditLogModel.log(uuidv4(), userId, 'RATE_BOOK', 'books', bookId, { rating });
        return id;
    }

    async getRatings(bookId) {
        return await this.bookModel.getRatings(bookId);
    }
}

module.exports = BookService;