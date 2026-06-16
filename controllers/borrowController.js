// controllers/borrowController.js
class BorrowController {
    constructor(borrowService) {
        this.borrowService = borrowService;
    }

    async issue(request, reply) {
        const { user_id, book_copy_id, due_date, notes } = request.body;
        const issuedBy = request.user.id;
        const result = await this.borrowService.issueBook(user_id, book_copy_id, issuedBy, due_date, notes);
        if (!result.success) {
            return reply.code(409).send({ success: false, error: { code: 'COPY_UNAVAILABLE', message: result.message } });
        }
        return reply.code(201).send({ success: true, data: { borrow_id: result.borrowId } });
    }

    async returnBook(request, reply) {
        const { copy_condition, notes } = request.body;
        const returnedBy = request.user.id;
        const result = await this.borrowService.returnBook(request.params.id, returnedBy, copy_condition, notes);
        
        if (!result) return reply.code(404).send({ success: false, error: { message: 'Borrow record not found.' } });
        
        return reply.send({ success: true, data: result });
    }

    async myBorrows(request, reply) {
        const result = await this.borrowService.getMyBorrows(request.user.id);
        return reply.send({ success: true, data: result });
    }

    async renew(request, reply) {
        const result = await this.borrowService.renewBook(request.params.id, request.user.id);
        if (!result.success) return reply.code(400).send(result);
        return reply.send(result);
    }

    async list(request, reply) {
        const { status, user_id, page = 1, limit = 20 } = request.query;
        const result = await this.borrowService.getAllBorrows({
            filters: { status, user_id },
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });
        return reply.send({ success: true, data: result });
    }
}

module.exports = BorrowController;