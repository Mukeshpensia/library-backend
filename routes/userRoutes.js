// routes/userRoutes.js
// Librarian/admin-accessible user lookups (distinct from the admin-only user
// management in adminRoutes). Used by the circulation console to find a
// borrower when issuing a book.
const UserModel = require('../models/userModel');

async function userRoutes(fastify, options) {
    const userModel = new UserModel(fastify.mysql);

    fastify.get('/users/search', {
        onRequest: [fastify.authenticate, fastify.authorize(['librarian', 'admin'])],
        schema: {
            tags: ['users'],
            summary: 'Search users by name / email / ID (librarian+admin)',
            querystring: {
                type: 'object',
                required: ['q'],
                properties: {
                    q: { type: 'string', minLength: 1 },
                    limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
                }
            }
        }
    }, async (request, reply) => {
        const { q, limit = 10 } = request.query;
        const data = await userModel.search(q, parseInt(limit));
        return reply.send({ success: true, data });
    });
}

module.exports = userRoutes;
