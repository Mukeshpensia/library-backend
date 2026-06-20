// plugins/jwt.js
const fp = require('fastify-plugin');
const fastifyJwt = require('@fastify/jwt');
const config = require('../config');

async function jwtPlugin(fastify, options) {
    await fastify.register(fastifyJwt, {
        secret: config.jwt.secret,
        // Fall back to the `access_token` cookie when no Authorization header is
        // present. The frontend sends the Bearer header (which takes
        // precedence), but the access token is also stored in a readable cookie
        // that is sent on every request, so this keeps auth working even if the
        // header is missing. Requires @fastify/cookie (registered before this).
        cookie: {
            cookieName: 'access_token',
            signed: false
        }
    });

    fastify.decorate('authenticate', async (request, reply) => {
        try {
            await request.jwtVerify();
            // Normalize sub → id for convenience across the codebase
            if (!request.user.id && request.user.sub) {
                request.user.id = request.user.sub;
            }
        } catch (err) {
            return reply.code(401).send({ message: 'Unauthorized', error: err.message });
        }

        // Revoke access the moment an account is deactivated or deleted, rather
        // than waiting for the short-lived access token to expire. A valid JWT is
        // necessary but not sufficient — the account must still be active.
        const [rows] = await fastify.mysql.query(
            'SELECT is_active, deleted_at FROM users WHERE id = ?',
            [request.user.id]
        );
        const account = rows[0];
        if (!account || account.deleted_at || !account.is_active) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'ACCOUNT_INACTIVE',
                    message: 'Your account is inactive. Please contact an administrator.'
                }
            });
        }
    });
}

module.exports = fp(jwtPlugin, { name: 'jwt-plugin' });