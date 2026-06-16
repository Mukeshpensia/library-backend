// plugins/authorizationPlugin.js
const fp = require('fastify-plugin');

async function authorizationPlugin(fastify, options) {
    /**
     * Decorates Fastify with an `authorize` utility function.
     * This function is intended to be used as a preHandler to check user roles.
     *
     * @param {string[]} allowedRoles - An array of roles that are permitted to access the route.
     * @returns {function(request, reply): Promise<void>} A preHandler function.
     */
    fastify.decorate('authorize', (allowedRoles) => async (request, reply) => {
        try {
            // Ensure authentication has run and request.user is populated
            // If fastify.authenticate was not called, request.user might be undefined.
            // If this is a public route that still uses authorize, ensure it's handled.
            if (!request.user) {
                // If authenticate hasn't run or user is not found for some reason,
                // and authorization is required, it's an unauthorized access.
                fastify.log.warn('Authorization attempted without authenticated user (request.user is null/undefined).');
                return reply.code(401).send({ message: 'Unauthorized: Authentication required.' });
            }
            const userRole = request.user.role; // Assuming user role is stored in request.user.role

            if (!userRole) {
                fastify.log.warn(`User ${request.user.id} has no role defined.`);
                return reply.code(403).send({ message: 'Forbidden: User role not defined.' });
            }

            if (!allowedRoles.includes(userRole)) {
                fastify.log.warn(`User ${request.user.id} with role '${userRole}' attempted to access forbidden resource. Required roles: ${allowedRoles.join(', ')}`);
                return reply.code(403).send({ message: 'Forbidden: Insufficient permissions.' });
            }
        } catch (error) {
            fastify.log.error('Authorization error:', error);
            reply.code(500).send({ message: 'Internal server error during authorization.' });
        }
    });
}

module.exports = fp(authorizationPlugin, {
    name: 'authorization-plugin',
    dependencies: ['jwt-plugin']
});