// services/borrowService.js
const { v4: uuidv4 } = require('uuid');
const BorrowModel = require('../models/borrowModel');
const AuditLogModel = require('../models/auditLogModel');

class BorrowService {
    constructor(fastify) {
        this.borrowModel = new BorrowModel(fastify.mysql);
        this.auditLogModel = new AuditLogModel(fastify.mysql);
        this.fastify = fastify;
    }

    async issueBook(userId, bookCopyId, issuedBy, dueDate, notes) {
        const [copies] = await this.fastify.mysql.query(
            'SELECT status_enum FROM book_copies WHERE id = ? FOR UPDATE',
            [bookCopyId]
        );
        if (!copies[0]) {
            return { success: false, message: 'Book copy not found.' };
        }
        if (copies[0].status_enum !== 'available') {
            return { success: false, message: `Book copy is not available (current status: ${copies[0].status_enum}).` };
        }

        const id = uuidv4();
        await this.borrowModel.create({
            id,
            user_id: userId,
            book_copy_id: bookCopyId,
            issued_by: issuedBy,
            due_date: dueDate,
            notes
        });

        await this.auditLogModel.log(uuidv4(), userId, 'ISSUE_BOOK', 'borrows', id, { issued_by: issuedBy, book_copy_id: bookCopyId });

        return { success: true, borrowId: id };
    }

    async returnBook(borrowId, returnedBy, condition, notes) {
        const result = await this.borrowModel.returnBook(borrowId, returnedBy, condition, notes);
        if (result) {
            // Find user_id for logging
            const [borrow] = await this.fastify.mysql.query('SELECT user_id FROM borrows WHERE id = ?', [borrowId]);
            const userId = borrow[0].user_id;
            await this.auditLogModel.log(uuidv4(), userId, 'RETURN_BOOK', 'borrows', borrowId, { returned_by: returnedBy, fine: result.fineAmount });
        }
        return result;
    }

    async getMyBorrows(userId) {
        return await this.borrowModel.findByUser(userId);
    }

    async renewBook(borrowId, userId) {
        const borrow = await this.borrowModel.findById(borrowId);
        if (!borrow || borrow.user_id !== userId) return { success: false, message: 'Borrow record not found.' };
        if (borrow.status_enum !== 'active') return { success: false, message: 'Only active borrows can be renewed.' };

        // Check for reservations
        const [copy] = await this.fastify.mysql.query('SELECT book_id FROM book_copies WHERE id = ?', [borrow.book_copy_id]);
        const [reservations] = await this.fastify.mysql.query('SELECT id FROM reservations WHERE book_id = ? AND status = "pending"', [copy[0].book_id]);
        
        if (reservations.length > 0) {
            return { success: false, message: 'Book cannot be renewed as it has pending reservations.' };
        }

        const newDueDate = new Date(borrow.due_date);
        newDueDate.setDate(newDueDate.getDate() + 14); // Extend by 14 days

        await this.borrowModel.renew(borrowId, newDueDate);
        await this.auditLogModel.log(uuidv4(), userId, 'RENEW_BOOK', 'borrows', borrowId, { new_due_date: newDueDate });

        return { success: true, new_due_date: newDueDate };
    }

    async getAllBorrows(options) {
        return await this.borrowModel.findAll(options);
    }
}

module.exports = BorrowService;