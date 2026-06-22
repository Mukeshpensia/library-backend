// services/borrowService.js
const { v4: uuidv4 } = require('uuid');
const BorrowModel = require('../models/borrowModel');
const AuditLogModel = require('../models/auditLogModel');
const ReservationService = require('./reservationService');

class BorrowService {
    constructor(fastify) {
        this.borrowModel = new BorrowModel(fastify.mysql);
        this.auditLogModel = new AuditLogModel(fastify.mysql);
        this.reservationService = new ReservationService(fastify);
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

        // Default the due date to today + the configured loan period (14 days)
        // when the caller doesn't supply one.
        let due = dueDate;
        if (!due) {
            const loanDays = parseInt(process.env.DEFAULT_LOAN_DAYS, 10) || 14;
            const d = new Date();
            d.setDate(d.getDate() + loanDays);
            due = d.toISOString().slice(0, 10); // YYYY-MM-DD
        }

        const id = uuidv4();
        await this.borrowModel.create({
            id,
            user_id: userId,
            book_copy_id: bookCopyId,
            issued_by: issuedBy,
            due_date: due,
            notes
        });

        await this.auditLogModel.log(uuidv4(), userId, 'ISSUE_BOOK', 'borrows', id, { issued_by: issuedBy, book_copy_id: bookCopyId });

        return { success: true, borrowId: id };
    }

    async returnBook(borrowId, returnedBy, condition, notes) {
        const result = await this.borrowModel.returnBook(borrowId, returnedBy, condition, notes);
        if (result) {
            // Find the borrow's user (for logging) and the book (for reservations).
            const [borrow] = await this.fastify.mysql.query(
                `SELECT b.user_id, bc.book_id
                 FROM borrows b JOIN book_copies bc ON b.book_copy_id = bc.id
                 WHERE b.id = ?`,
                [borrowId]
            );
            const userId = borrow[0].user_id;
            await this.auditLogModel.log(uuidv4(), userId, 'RETURN_BOOK', 'borrows', borrowId, { returned_by: returnedBy, fine: result.fineAmount });

            // The freed copy may satisfy a waiting reservation: fulfil the next
            // person in the queue and notify them to collect the book.
            await this.reservationService.notifyNextInQueue(borrow[0].book_id);
        }
        return result;
    }

    async getMyBorrows(userId) {
        return await this.borrowModel.findByUser(userId);
    }

    async renewBook(borrowId, userId, userRole) {
        const borrow = await this.borrowModel.findById(borrowId);
        if (!borrow) return { success: false, message: 'Borrow record not found.' };

        // A student may only renew their own borrow; librarians/admins may renew
        // any borrow (e.g. from the circulation console).
        const isStaff = userRole === 'librarian' || userRole === 'admin';
        if (!isStaff && borrow.user_id !== userId) {
            return { success: false, message: 'Borrow record not found.' };
        }
        if (borrow.status_enum !== 'active') return { success: false, message: 'Only active borrows can be renewed.' };

        // Check for reservations
        const [copy] = await this.fastify.mysql.query('SELECT book_id FROM book_copies WHERE id = ?', [borrow.book_copy_id]);
        const [reservations] = await this.fastify.mysql.query(`SELECT id FROM reservations WHERE book_id = ? AND status = 'pending'`, [copy[0].book_id]);
        
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

    async payFine(borrowId, staffId) {
        const borrow = await this.borrowModel.findById(borrowId);
        if (!borrow) return { success: false, message: 'Borrow record not found.' };
        const ok = await this.borrowModel.markFinePaid(borrowId);
        if (ok) {
            await this.auditLogModel.log(uuidv4(), staffId, 'PAY_FINE', 'borrows', borrowId, { amount: borrow.fine_amount });
        }
        return { success: true };
    }
}

module.exports = BorrowService;