// utils/errors.js
// AppError + a single Fastify error handler that normalizes every failure into
// the project's consistent envelope:  { success: false, error: { code, message } }

/**
 * Throw `new AppError(statusCode, code, message)` anywhere in a service or
 * controller and the global handler will render it with the right HTTP status.
 */
class AppError extends Error {
    constructor(statusCode, code, message) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.isAppError = true;
    }
}

// Map a few common MySQL driver errors to friendly responses.
function mapDriverError(err) {
    switch (err.code) {
        case 'ER_DUP_ENTRY':
            return { statusCode: 409, code: 'DUPLICATE_ENTRY', message: 'A record with these details already exists.' };
        case 'ER_NO_REFERENCED_ROW':
        case 'ER_NO_REFERENCED_ROW_2':
            return { statusCode: 400, code: 'INVALID_REFERENCE', message: 'A referenced record does not exist.' };
        case 'ER_ROW_IS_REFERENCED':
        case 'ER_ROW_IS_REFERENCED_2':
            return { statusCode: 409, code: 'IN_USE', message: 'This record is referenced by other records and cannot be removed.' };
        default:
            return null;
    }
}

/**
 * Registers `fastify.setErrorHandler`. Order of precedence:
 *   1. AppError            -> its own status/code/message
 *   2. Schema validation   -> 400 VALIDATION_ERROR (Fastify sets err.validation)
 *   3. Known driver errors -> mapped status/code
 *   4. Tagged statusCode   -> e.g. 401/403/429 from other plugins
 *   5. Anything else        -> 500 INTERNAL_ERROR (full error logged, generic body)
 */
function registerErrorHandler(fastify) {
    fastify.setErrorHandler((error, request, reply) => {
        // 1. Application errors
        if (error.isAppError) {
            return reply.code(error.statusCode).send({
                success: false,
                error: { code: error.code, message: error.message }
            });
        }

        // 2. Request schema validation failures
        if (error.validation) {
            return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: error.message }
            });
        }

        // 3. Known MySQL driver errors
        const mapped = mapDriverError(error);
        if (mapped) {
            return reply.code(mapped.statusCode).send({
                success: false,
                error: { code: mapped.code, message: mapped.message }
            });
        }

        // 4. Errors that already carry a client-safe HTTP status (e.g. 4xx from
        //    rate-limit, auth). 5xx falls through to the generic handler below.
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
            return reply.code(error.statusCode).send({
                success: false,
                error: { code: error.code || 'REQUEST_ERROR', message: error.message }
            });
        }

        // 5. Unexpected — log everything, leak nothing.
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }
        });
    });

    // Consistent 404 for unmatched routes.
    fastify.setNotFoundHandler((request, reply) => {
        reply.code(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found.` }
        });
    });
}

module.exports = { AppError, registerErrorHandler };
