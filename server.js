// server.js
require('dotenv').config();
const fastify = require('fastify')({
    logger: true
});
const path = require('path');
const fastifyMultipart = require('@fastify/multipart');
const setupScheduler = require('./utils/scheduler');
const { registerErrorHandler } = require('./utils/errors');

// Consistent error + 404 responses for every route ({ success:false, error:{code,message} })
registerErrorHandler(fastify);

// Register plugins
// Security headers. CSP is disabled so the Swagger UI at /docs (inline
// scripts/styles) keeps working; all other hardening headers still apply.
fastify.register(require('@fastify/helmet'), { contentSecurityPolicy: false });

// Rate limiting. global:false => only routes that opt in via
// `config.rateLimit` are limited (currently /auth/login and /auth/forgot-password).
fastify.register(require('@fastify/rate-limit'), {
    global: false,
    // The plugin THROWS whatever this returns, so it must be an Error carrying a
    // statusCode. Our setErrorHandler then renders it as the standard envelope.
    errorResponseBuilder: (request, context) => {
        const err = new Error(`Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`);
        err.statusCode = context.statusCode; // 429
        err.code = 'RATE_LIMITED';
        return err;
    }
});

fastify.register(require('./plugins/swagger')); // OpenAPI + Swagger UI at /docs (must precede routes)
fastify.register(require('./plugins/db')); // Our custom DB plugin
fastify.register(require('@fastify/cookie')); // Handle cookies for refresh tokens
fastify.register(require('./plugins/jwt')); // Our custom JWT plugin
fastify.register(require('./plugins/authorizationPlugin')); // Register authorization plugin

fastify.register(fastifyMultipart, {
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

// Serve static files (for profile pictures)
fastify.register(require('@fastify/static'), { 
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/',
});

// Enable CORS. credentials:true is required so the browser sends/stores the
// HttpOnly refresh-token cookie on cross-origin requests; it also forces the
// reflected origin (never a wildcard), which the origin callback below provides.
fastify.register(require('@fastify/cors'), {
    credentials: true,
    origin: (origin, cb) => {
        if (origin === undefined || origin === null) {
            cb(null, true);
            return;
        }
        if (process.env.WEBSITE_URL !== undefined && process.env.WEBSITE_URL !== null && origin.includes(process.env.WEBSITE_URL)) {
            cb(null, true);
            return;
        }
        if (/localhost/.test(origin)) {
            cb(null, true);
            return;
        }
        cb(new Error('Not allowed by CORS'));
    },
});

// Register routes
fastify.register(require('./routes/authRoutes'), { prefix: '/api/v1/auth' });
fastify.register(require('./routes/bookRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/borrowRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/categoryRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/reportRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/notificationRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/aiRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/activityRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/reservationRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/favoriteRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/userRoutes'), { prefix: '/api/v1' });
fastify.register(require('./routes/adminRoutes'), { prefix: '/api/v1/admin' });

// Health check
fastify.get('/health', {
    schema: {
        tags: ['analytics'],
        summary: 'Liveness probe',
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    uptime: { type: 'number' }
                }
            }
        }
    }
}, async (request, reply) => {
    return { status: 'ok', uptime: process.uptime() };
});

const start = async () => {
    try {
        const port = process.env.PORT || 3000;
        await fastify.listen({ port: port, host: process.env.HOST || '0.0.0.0' });
        
        // Initialize Scheduler
        setupScheduler(fastify);
        
        fastify.log.info(`Server listening on ${fastify.server.address().port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();