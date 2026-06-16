// plugins/swagger.js
// Registers OpenAPI generation (@fastify/swagger) + interactive docs UI
// (@fastify/swagger-ui at /docs). Must be registered BEFORE the route plugins
// so @fastify/swagger's onRoute hook can collect every route definition.
const fp = require('fastify-plugin');
const fastifySwagger = require('@fastify/swagger');
const fastifySwaggerUi = require('@fastify/swagger-ui');

async function swaggerPlugin(fastify, options) {
    await fastify.register(fastifySwagger, {
        openapi: {
            openapi: '3.0.3',
            info: {
                title: 'Library Management System API',
                description:
                    'REST API for a college library management system — auth, catalog, ' +
                    'inventory, circulation, reservations, notifications, AI recommendations ' +
                    'and analytics.',
                version: '1.0.0'
            },
            servers: [
                {
                    url: `http://localhost:${process.env.PORT || 4000}`,
                    description: 'Local development'
                }
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Paste the access token returned by /auth/login.'
                    }
                }
            },
            tags: [
                { name: 'auth', description: 'Authentication & account' },
                { name: 'users', description: 'Admin user management' },
                { name: 'categories', description: 'Book categories' },
                { name: 'books', description: 'Catalog' },
                { name: 'copies', description: 'Physical copy inventory' },
                { name: 'borrows', description: 'Circulation (issue/return/renew)' },
                { name: 'reservations', description: 'Holds & reservation queue' },
                { name: 'favorites', description: 'User favorites' },
                { name: 'notifications', description: 'User notifications' },
                { name: 'recommendations', description: 'AI recommendations' },
                { name: 'analytics', description: 'Dashboards & reports' },
                { name: 'activity', description: 'Audit logs / activity feed' }
            ]
        }
    });

    await fastify.register(fastifySwaggerUi, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: true,
            persistAuthorization: true
        }
    });
}

module.exports = fp(swaggerPlugin, { name: 'swagger-plugin' });
