// scripts/seed.js
// Resets the demo database to a known state: 1 admin, 1 librarian, sample
// students, categories, books and copies. Run with:  npm run seed
//
// DESTRUCTIVE: it truncates the application tables first so re-running yields a
// clean, predictable dataset. It refuses to run when NODE_ENV=production.
//
// Connects with the SAME config as plugins/db.js (host/user/password/database,
// default port) so the seed always targets the same server the app uses.

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed: NODE_ENV=production.');
    process.exit(1);
}

// Tables cleared before seeding, in FK-safe order is unnecessary because we
// toggle FOREIGN_KEY_CHECKS, but we keep the full set so demo state is clean.
const TABLES = [
    'audit_logs', 'book_views', 'recommendations', 'book_ratings', 'favorites',
    'notifications', 'reservations', 'borrows', 'book_copies', 'book_categories',
    'books', 'categories', 'password_reset_tokens', 'refresh_tokens', 'users'
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    console.log(`Seeding "${process.env.DB_NAME}" on ${process.env.DB_HOST} ...`);

    try {
        // ---- clean slate -------------------------------------------------
        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of TABLES) await db.query(`TRUNCATE TABLE \`${t}\``);
        await db.query('SET FOREIGN_KEY_CHECKS = 1');

        // ---- users -------------------------------------------------------
        const password_hash = await bcrypt.hash('Password@123', 10);
        const users = [
            { role: 'admin', full_name: 'Alice Admin', email: 'admin@library.local', employee_id: 'EMP-0001', department: 'Administration' },
            { role: 'librarian', full_name: 'Liam Librarian', email: 'librarian@library.local', employee_id: 'EMP-0002', department: 'Circulation' },
            { role: 'student', full_name: 'Sara Student', email: 'sara@student.local', student_id: 'STU-1001', department: 'Computer Science' },
            { role: 'student', full_name: 'Raj Student', email: 'raj@student.local', student_id: 'STU-1002', department: 'Mathematics' },
            { role: 'student', full_name: 'Mia Student', email: 'mia@student.local', student_id: 'STU-1003', department: 'Physics' }
        ];
        for (const u of users) {
            await db.query(
                'INSERT INTO users (id, full_name, email, password_hash, role, student_id, employee_id, department, phone, is_active, max_borrow_limit, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())',
                [uuid(), u.full_name, u.email, password_hash, u.role, u.student_id || null, u.employee_id || null, u.department, null, u.role === 'student' ? 5 : 20]
            );
        }

        // ---- categories --------------------------------------------------
        const categoryNames = ['Computer Science', 'Mathematics', 'Fiction', 'History'];
        const categoryIds = {};
        for (const name of categoryNames) {
            const id = uuid();
            categoryIds[name] = id;
            await db.query(
                'INSERT INTO categories (id, name, slug, description) VALUES (?, ?, ?, ?)',
                [id, name, slugify(name), `${name} titles`]
            );
        }

        // ---- books + copies + category links -----------------------------
        const books = [
            { isbn: '9780262033848', title: 'Introduction to Algorithms', authors: ['Cormen', 'Leiserson', 'Rivest', 'Stein'], publisher: 'MIT Press', published_year: 2009, language: 'en', pages: 1312, category: 'Computer Science', copies: 3 },
            { isbn: '9780132350884', title: 'Clean Code', authors: ['Robert C. Martin'], publisher: 'Prentice Hall', published_year: 2008, language: 'en', pages: 464, category: 'Computer Science', copies: 2 },
            { isbn: '9780486612720', title: 'Calculus Made Easy', authors: ['Silvanus P. Thompson'], publisher: 'Dover', published_year: 1998, language: 'en', pages: 250, category: 'Mathematics', copies: 2 },
            { isbn: '9780743273565', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', published_year: 2004, language: 'en', pages: 180, category: 'Fiction', copies: 4 }
        ];

        let copyCount = 0;
        for (const b of books) {
            const bookId = uuid();
            await db.query(
                'INSERT INTO books (id, isbn, title, authors, publisher, published_year, language, pages, description, total_copies, available_copies) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [bookId, b.isbn, b.title, JSON.stringify(b.authors), b.publisher, b.published_year, b.language, b.pages, `${b.title} — seeded demo record.`, b.copies, b.copies]
            );
            await db.query(
                'INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)',
                [bookId, categoryIds[b.category]]
            );
            for (let i = 1; i <= b.copies; i++) {
                copyCount++;
                await db.query(
                    'INSERT INTO book_copies (id, book_id, barcode, condition_enum, status_enum, acquired_date) VALUES (?, ?, ?, ?, ?, CURDATE())',
                    [uuid(), bookId, `BC-${b.isbn}-${i}`, i === 1 ? 'new' : 'good', 'available']
                );
            }
        }

        console.log('\nSeed complete:');
        console.log(`  users:      ${users.length} (1 admin, 1 librarian, ${users.filter(u => u.role === 'student').length} students)`);
        console.log(`  categories: ${categoryNames.length}`);
        console.log(`  books:      ${books.length}`);
        console.log(`  copies:     ${copyCount}`);
        console.log('\nLogin for every seeded account:  password "Password@123"');
        console.log('  admin@library.local / librarian@library.local / sara@student.local ...');
    } finally {
        await db.end();
    }
}

main().catch((err) => {
    console.error(`Seed failed: ${err.code || ''} ${err.message || ''}`.trim());
    if (err.code === 'ECONNREFUSED') {
        console.error('  -> Is MySQL running and reachable at DB_HOST on the default port (3306)?');
    }
    process.exit(1);
});
