// config/index.js
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable must be set in production.');
}

module.exports = {
    jwt: {
        secret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me'
    },
    database: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        name: process.env.DB_NAME || 'library_db'
    },
    sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY,
        senderEmail: process.env.SENDGRID_SENDER_EMAIL || process.env.EMAIL_FROM
    }
};