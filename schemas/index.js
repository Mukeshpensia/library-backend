// schemas/index.js
// Central registry of Fastify JSON schemas, keyed by route group. These power
// BOTH request validation and the OpenAPI docs at /docs.
//
// Design notes:
//  - Request schemas (body/params/querystring) validate input -> Fastify returns
//    400 on violations. Bodies use `additionalProperties: true` so extra client
//    fields are tolerated rather than rejected.
//  - Response schemas are intentionally PERMISSIVE. Fastify serializes responses
//    with fast-json-stringify, which DROPS any property not described. To avoid
//    silently stripping existing payload fields, `data` is left open (`{}` = any,
//    serialized via JSON.stringify) and every envelope allows additionalProperties.

const bearer = [{ bearerAuth: [] }];

// ---- reusable fragments -------------------------------------------------
const idParam = (name = 'id') => ({
    type: 'object',
    required: [name],
    properties: {
        [name]: { type: 'string', description: 'UUID v4 identifier' }
    }
});

const errorEnvelope = {
    type: 'object',
    additionalProperties: true,
    properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string' },
        error: {
            type: 'object',
            additionalProperties: true,
            properties: {
                code: { type: 'string' },
                message: { type: 'string' }
            }
        }
    }
};

// success envelope whose `data` is an object (single resource)
const okObject = (dataDescription) => ({
    type: 'object',
    additionalProperties: true,
    properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' },
        meta: { type: 'object', additionalProperties: true },
        data: { description: dataDescription, type: 'object', additionalProperties: true }
    }
});

// success envelope whose `data` is a list
const okList = (itemDescription) => ({
    type: 'object',
    additionalProperties: true,
    properties: {
        success: { type: 'boolean', example: true },
        meta: { type: 'object', additionalProperties: true },
        data: { description: itemDescription, type: 'array', items: {} }
    }
});

// success envelope with only a message (no data)
const okMessage = {
    type: 'object',
    additionalProperties: true,
    properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' }
    }
};

const err = { 400: errorEnvelope, 401: errorEnvelope, 403: errorEnvelope, 404: errorEnvelope, 409: errorEnvelope };

// ========================================================================
// auth
// ========================================================================
const auth = {
    register: {
        tags: ['auth'], summary: 'Register a new student account',
        body: {
            type: 'object', additionalProperties: true,
            required: ['full_name', 'email', 'password'],
            properties: {
                full_name: { type: 'string', minLength: 1 },
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 6 },
                student_id: { type: 'string' },
                department: { type: 'string' },
                phone: { type: 'string' }
            }
        },
        response: { 201: okObject('Created user id + email'), ...err }
    },
    login: {
        tags: ['auth'], summary: 'Log in, receive an access token (refresh token set as httpOnly cookie)',
        body: {
            type: 'object', additionalProperties: true,
            required: ['email', 'password'],
            properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string' }
            }
        },
        response: { 200: okObject('access_token, token_type, expires_in, user'), ...err }
    },
    refresh: {
        tags: ['auth'], summary: 'Rotate refresh cookie and issue a new access token',
        response: { 200: okObject('New access_token'), ...err }
    },
    forgotPassword: {
        tags: ['auth'], summary: 'Request a password reset link',
        body: {
            type: 'object', additionalProperties: true,
            required: ['email'],
            properties: { email: { type: 'string', format: 'email' } }
        },
        response: { 200: okMessage, ...err }
    },
    resetPassword: {
        tags: ['auth'], summary: 'Reset password using a token',
        body: {
            type: 'object', additionalProperties: true,
            required: ['token', 'newPassword'],
            properties: {
                token: { type: 'string' },
                newPassword: { type: 'string', minLength: 6 }
            }
        },
        response: { 200: okMessage, ...err }
    },
    verifyEmail: {
        tags: ['auth'], summary: 'Verify an email address',
        body: { type: 'object', additionalProperties: true, properties: { token: { type: 'string' } } },
        response: { 200: okMessage, ...err }
    },
    me: {
        tags: ['auth'], summary: 'Get the current user profile', security: bearer,
        response: { 200: okObject('Current user'), ...err }
    },
    updateMe: {
        tags: ['auth'], summary: 'Update own profile', security: bearer,
        body: {
            type: 'object', additionalProperties: true,
            properties: {
                full_name: { type: 'string' },
                phone: { type: 'string' },
                department: { type: 'string' },
                profile_pic: { type: 'string' }
            }
        },
        response: { 200: okMessage, ...err }
    },
    updateProfilePic: {
        tags: ['auth'], summary: 'Upload a profile picture (multipart/form-data)',
        security: bearer, consumes: ['multipart/form-data'],
        response: { 200: okObject('profile_pic_url'), ...err }
    },
    logout: {
        tags: ['auth'], summary: 'Log out and revoke the refresh token', security: bearer,
        response: { 200: okMessage, ...err }
    },
    changePassword: {
        tags: ['auth'], summary: 'Change own password', security: bearer,
        body: {
            type: 'object', additionalProperties: true,
            required: ['currentPassword', 'newPassword'],
            properties: {
                currentPassword: { type: 'string' },
                newPassword: { type: 'string', minLength: 6 }
            }
        },
        response: { 200: okMessage, ...err }
    }
};

// ========================================================================
// books + copies + ratings
// ========================================================================
const bookBody = {
    type: 'object', additionalProperties: true,
    properties: {
        isbn: { type: 'string' },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        authors: { type: 'array', items: { type: 'string' }, description: 'Author names' },
        publisher: { type: 'string' },
        published_year: { type: 'integer' },
        edition: { type: 'string' },
        language: { type: 'string' },
        pages: { type: 'integer' },
        description: { type: 'string' },
        cover_image_url: { type: 'string' },
        location_code: { type: 'string' }
    }
};

const copyBody = {
    type: 'object', additionalProperties: true,
    properties: {
        barcode: { type: 'string' },
        condition_enum: { type: 'string', enum: ['new', 'good', 'fair', 'poor'] },
        status_enum: { type: 'string', enum: ['available', 'borrowed', 'reserved', 'lost', 'damaged'] },
        acquired_date: { type: 'string' }
    }
};

const books = {
    list: {
        tags: ['books'], summary: 'List / search books', security: bearer,
        querystring: {
            type: 'object', additionalProperties: true,
            properties: {
                q: { type: 'string', description: 'Full-text search on title + description' },
                author: { type: 'string' },
                language: { type: 'string' },
                page: { type: 'integer', minimum: 1, default: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                sort: { type: 'string' },
                order: { type: 'string', enum: ['asc', 'desc', 'ASC', 'DESC'] }
            }
        },
        response: { 200: okList('Books'), ...err }
    },
    get: {
        tags: ['books'], summary: 'Get a book with its copies', security: bearer,
        params: idParam(), response: { 200: okObject('Book + copies'), ...err }
    },
    create: {
        tags: ['books'], summary: 'Create a book', security: bearer,
        body: { ...bookBody, required: ['isbn', 'title', 'authors'] },
        response: { 201: okObject('book_id'), ...err }
    },
    update: {
        tags: ['books'], summary: 'Update a book', security: bearer,
        params: idParam(), body: bookBody, response: { 200: okMessage, ...err }
    },
    remove: {
        tags: ['books'], summary: 'Soft-delete a book', security: bearer,
        params: idParam(), response: { 200: okMessage, ...err }
    },
    addCopy: {
        tags: ['copies'], summary: 'Add a physical copy to a book', security: bearer,
        params: idParam(), body: { ...copyBody, required: ['barcode', 'condition_enum'] },
        response: { 201: okObject('copy_id'), ...err }
    },
    updateCopy: {
        tags: ['copies'], summary: 'Update a copy (condition/status)', security: bearer,
        params: {
            type: 'object', required: ['id', 'copyId'],
            properties: { id: { type: 'string' }, copyId: { type: 'string' } }
        },
        body: copyBody, response: { 200: okMessage, ...err }
    },
    rate: {
        tags: ['books'], summary: 'Rate / review a book', security: bearer,
        params: idParam(),
        body: {
            type: 'object', additionalProperties: true, required: ['rating'],
            properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5 },
                review: { type: 'string' }
            }
        },
        response: { 200: okMessage, ...err }
    },
    getRatings: {
        tags: ['books'], summary: 'List a book\'s ratings', security: bearer,
        params: idParam(), response: { 200: okList('Ratings'), ...err }
    }
};

// ========================================================================
// borrows
// ========================================================================
const borrows = {
    my: {
        tags: ['borrows'], summary: 'My borrow history', security: bearer,
        response: { 200: okList('Borrows'), ...err }
    },
    renew: {
        tags: ['borrows'], summary: 'Renew a borrow', security: bearer,
        params: idParam(), response: { 200: okObject('Renewed borrow'), ...err }
    },
    list: {
        tags: ['borrows'], summary: 'List all borrows (staff)', security: bearer,
        querystring: {
            type: 'object', additionalProperties: true,
            properties: {
                status: { type: 'string', enum: ['active', 'returned', 'overdue', 'lost'] },
                user_id: { type: 'string' },
                page: { type: 'integer', minimum: 1, default: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
            }
        },
        response: { 200: okList('Borrows'), ...err }
    },
    issue: {
        tags: ['borrows'], summary: 'Issue a copy to a user', security: bearer,
        body: {
            type: 'object', additionalProperties: true,
            required: ['user_id', 'book_copy_id'],
            properties: {
                user_id: { type: 'string' },
                book_copy_id: { type: 'string' },
                due_date: { type: 'string', description: 'YYYY-MM-DD (defaults to loan period)' },
                notes: { type: 'string' }
            }
        },
        response: { 201: okObject('borrow_id'), ...err }
    },
    returnBook: {
        tags: ['borrows'], summary: 'Return a borrowed copy', security: bearer,
        params: idParam(),
        body: {
            type: 'object', additionalProperties: true,
            properties: {
                copy_condition: { type: 'string', enum: ['new', 'good', 'fair', 'poor'] },
                notes: { type: 'string' }
            }
        },
        response: { 200: okObject('Return result (fine, etc.)'), ...err }
    }
};

// ========================================================================
// categories
// ========================================================================
const categories = {
    list: {
        tags: ['categories'], summary: 'List categories', security: bearer,
        response: { 200: okList('Categories'), ...err }
    },
    create: {
        tags: ['categories'], summary: 'Create a category', security: bearer,
        body: {
            type: 'object', additionalProperties: true, required: ['name'],
            properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                parent_id: { type: 'string' },
                description: { type: 'string' }
            }
        },
        response: { 201: okObject('id'), ...err }
    },
    update: {
        tags: ['categories'], summary: 'Update a category', security: bearer,
        params: idParam(),
        body: {
            type: 'object', additionalProperties: true,
            properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                parent_id: { type: 'string' },
                description: { type: 'string' }
            }
        },
        response: { 200: okMessage, ...err }
    },
    remove: {
        tags: ['categories'], summary: 'Delete a category', security: bearer,
        params: idParam(), response: { 200: okMessage, ...err }
    }
};

// ========================================================================
// reports / ai / activity / notifications / reservations / favorites / users
// ========================================================================
const reports = {
    dashboard: {
        tags: ['analytics'], summary: 'Dashboard summary metrics', security: bearer,
        response: { 200: okObject('Aggregated metrics'), ...err }
    },
    trends: {
        tags: ['analytics'], summary: 'Borrow counts bucketed by day/week/month', security: bearer,
        querystring: {
            type: 'object', additionalProperties: true,
            properties: {
                period: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' },
                days: { type: 'integer', minimum: 1, maximum: 365, default: 30, description: 'Lookback window in days' }
            }
        },
        response: { 200: okObject('Time-bucketed borrow counts'), ...err }
    }
};

const notifications = {
    list: {
        tags: ['notifications'], summary: 'My notifications', security: bearer,
        response: { 200: okList('Notifications'), ...err }
    },
    markRead: {
        tags: ['notifications'], summary: 'Mark a notification read', security: bearer,
        params: idParam(), response: { 200: okMessage, ...err }
    },
    markAllRead: {
        tags: ['notifications'], summary: 'Mark all notifications read', security: bearer,
        response: { 200: okMessage, ...err }
    }
};

const ai = {
    historyMatrix: {
        tags: ['recommendations'], summary: 'Borrow-history interaction matrix (admin, for the AI batch job)',
        security: bearer, response: { 200: okObject('Interaction matrix'), ...err }
    },
    myRecommendations: {
        tags: ['recommendations'], summary: 'My personalized recommendations', security: bearer,
        response: { 200: okObject('recommendations[]'), ...err }
    }
};

const activity = {
    my: {
        tags: ['activity'], summary: 'My recent activity', security: bearer,
        response: { 200: okList('Activity entries'), ...err }
    },
    global: {
        tags: ['activity'], summary: 'Global activity feed (staff), paginated', security: bearer,
        querystring: {
            type: 'object', additionalProperties: true,
            properties: {
                page: { type: 'integer', minimum: 1, default: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
            }
        },
        response: { 200: okList('Activity entries'), ...err }
    }
};

const reservations = {
    create: {
        tags: ['reservations'], summary: 'Reserve a book', security: bearer,
        body: {
            type: 'object', additionalProperties: true, required: ['book_id'],
            properties: { book_id: { type: 'string' } }
        },
        response: { 201: okObject('Reservation'), ...err }
    },
    my: {
        tags: ['reservations'], summary: 'My reservations', security: bearer,
        response: { 200: okList('Reservations'), ...err }
    },
    cancel: {
        tags: ['reservations'], summary: 'Cancel a reservation', security: bearer,
        params: idParam(), response: { 200: okMessage, ...err }
    },
    list: {
        tags: ['reservations'], summary: 'Reservation queue (staff)', security: bearer,
        querystring: {
            type: 'object', additionalProperties: true,
            properties: {
                page: { type: 'integer', minimum: 1, default: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
            }
        },
        response: { 200: okList('Reservations'), ...err }
    }
};

const favorites = {
    toggle: {
        tags: ['favorites'], summary: 'Toggle a book favorite', security: bearer,
        body: {
            type: 'object', additionalProperties: true, required: ['book_id'],
            properties: { book_id: { type: 'string' } }
        },
        response: { 200: okObject('Favorite state'), ...err }
    },
    list: {
        tags: ['favorites'], summary: 'My favorites', security: bearer,
        response: { 200: okList('Favorite books'), ...err }
    }
};

const users = {
    list: {
        tags: ['users'], summary: 'List users (admin)', security: bearer,
        querystring: {
            type: 'object', additionalProperties: true,
            properties: {
                role: { type: 'string', enum: ['student', 'librarian', 'admin'] },
                search: { type: 'string' },
                page: { type: 'integer', minimum: 1, default: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
            }
        },
        response: { 200: okList('Users'), ...err }
    },
    updateStatus: {
        tags: ['users'], summary: 'Activate / deactivate a user (admin)', security: bearer,
        params: idParam(),
        body: {
            type: 'object', additionalProperties: true, required: ['is_active'],
            properties: { is_active: { type: 'boolean' } }
        },
        response: { 200: okMessage, ...err }
    },
    updateRole: {
        tags: ['users'], summary: 'Change a user role (admin)', security: bearer,
        params: idParam(),
        body: {
            type: 'object', additionalProperties: true, required: ['role'],
            properties: { role: { type: 'string', enum: ['student', 'librarian', 'admin'] } }
        },
        response: { 200: okMessage, ...err }
    },
    updateBorrowLimit: {
        tags: ['users'], summary: 'Set a user borrow limit (admin)', security: bearer,
        params: idParam(),
        body: {
            type: 'object', additionalProperties: true, required: ['max_borrow_limit'],
            properties: { max_borrow_limit: { type: 'integer', minimum: 0 } }
        },
        response: { 200: okMessage, ...err }
    }
};

module.exports = {
    auth, books, borrows, categories, reports,
    notifications, ai, activity, reservations, favorites, users
};
