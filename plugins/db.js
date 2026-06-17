// plugins/db.js
const fp = require('fastify-plugin');
const mysql = require('mysql2/promise');

async function dbConnector(fastify, options) {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false },
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    });

    // Verify connectivity at startup
    try {
        const conn = await pool.getConnection();
        conn.release();
        fastify.log.info('MySQL pool connected successfully.');
    } catch (err) {
        fastify.log.error('Failed to connect to MySQL:', err);
        process.exit(1);
    }

    fastify.decorate('mysql', pool);

    fastify.addHook('onClose', async (instance) => {
        fastify.log.info('Closing MySQL pool...');
        await instance.mysql.end();
    });
}

module.exports = fp(dbConnector);