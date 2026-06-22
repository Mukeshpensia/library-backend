// scripts/seed.js
// Resets the demo database to a known, RICHLY-populated state:
//   - staff + students (incl. an inactive account)
//   - categories (CBSE / NCERT / competitive + subjects, with a small tree)
//   - books across school + general subjects, with physical copies
//   - full circulation history: returned / active / overdue borrows + fines
//   - reservations, favorites, ratings & reviews, notifications,
//     recommendations, book views, and an audit-log timeline
//
// Run with:  npm run seed
//
// DESTRUCTIVE: it truncates the application tables first so re-running yields a
// clean, predictable dataset. It refuses to run when NODE_ENV=production.
//
// Every seeded account logs in with the password "Password@123".

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed: NODE_ENV=production.');
    process.exit(1);
}

const TABLES = [
    'audit_logs', 'book_views', 'recommendations', 'book_ratings', 'favorites',
    'notifications', 'reservations', 'borrows', 'book_copies', 'book_categories',
    'books', 'categories', 'password_reset_tokens', 'refresh_tokens', 'users'
];

const FINE_PER_DAY = 2;     // ₹ per overdue day
const LOAN_DAYS = 14;       // standard loan window

// ---- small helpers ------------------------------------------------------
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDateTime = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const now = () => new Date();
const daysAgo = (n) => { const d = now(); d.setDate(d.getDate() - n); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weightedPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

async function main() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false },
        connectTimeout: 10000,
        multipleStatements: true
    });

    console.log(`Seeding "${process.env.DB_NAME}" on ${process.env.DB_HOST} ...`);

    const audits = []; // { userId, action, entityType, entityId, metadata, when }
    const pushAudit = (userId, action, entityType, entityId, metadata, when) =>
        audits.push({ userId, action, entityType, entityId, metadata, when: when || now() });

    try {
        // ---- clean slate -------------------------------------------------
        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of TABLES) await db.query(`TRUNCATE TABLE \`${t}\``);
        await db.query('SET FOREIGN_KEY_CHECKS = 1');

        // ================================================================
        // USERS
        // ================================================================
        const password_hash = await bcrypt.hash('Password@123', 10);
        const userDefs = [
            { key: 'admin', role: 'admin', full_name: 'Alice Admin', email: 'admin@library.local', employee_id: 'EMP-0001', department: 'Administration', active: 1, limit: 20, lastLogin: 1 },
            { key: 'liam', role: 'librarian', full_name: 'Liam Librarian', email: 'librarian@library.local', employee_id: 'EMP-0002', department: 'Circulation', active: 1, limit: 20, lastLogin: 2 },
            { key: 'emma', role: 'librarian', full_name: 'Emma Library', email: 'emma@library.local', employee_id: 'EMP-0003', department: 'Acquisitions', active: 1, limit: 20, lastLogin: 3 },
            { key: 'sara', role: 'student', full_name: 'Sara Student', email: 'sara@student.local', student_id: 'STU-1001', department: 'Computer Science', active: 1, limit: 5, lastLogin: 2 },
            { key: 'raj', role: 'student', full_name: 'Raj Student', email: 'raj@student.local', student_id: 'STU-1002', department: 'Mathematics', active: 1, limit: 5, lastLogin: 2 },
            { key: 'mia', role: 'student', full_name: 'Mia Student', email: 'mia@student.local', student_id: 'STU-1003', department: 'Physics', active: 1, limit: 5, lastLogin: 4 },
            { key: 'aisha', role: 'student', full_name: 'Aisha Khan', email: 'aisha@student.local', student_id: 'STU-1004', department: 'Biology', active: 1, limit: 5, lastLogin: 1 },
            { key: 'vikram', role: 'student', full_name: 'Vikram Rao', email: 'vikram@student.local', student_id: 'STU-1005', department: 'Chemistry', active: 1, limit: 6, lastLogin: 5 },
            { key: 'neha', role: 'student', full_name: 'Neha Gupta', email: 'neha@student.local', student_id: 'STU-1006', department: 'English', active: 1, limit: 5, lastLogin: 3 },
            { key: 'arjun', role: 'student', full_name: 'Arjun Mehta', email: 'arjun@student.local', student_id: 'STU-1007', department: 'Commerce', active: 1, limit: 5, lastLogin: 7 },
            { key: 'karan', role: 'student', full_name: 'Karan Old', email: 'karan@student.local', student_id: 'STU-1008', department: 'History', active: 0, limit: 5, lastLogin: 60 }
        ];
        const U = {}; // key -> id
        for (const u of userDefs) {
            const id = uuid();
            U[u.key] = id;
            await db.query(
                `INSERT INTO users (id, full_name, email, password_hash, role, student_id, employee_id, department, phone, is_active, max_borrow_limit, email_verified_at, last_login_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
                [id, u.full_name, u.email, password_hash, u.role, u.student_id || null, u.employee_id || null,
                 u.department, null, u.active, u.limit, fmtDateTime(daysAgo(u.lastLogin))]
            );
            pushAudit(id, 'LOGIN', 'users', id, { email: u.email }, daysAgo(u.lastLogin));
        }
        // Admin "created" the extra accounts beyond the original 5.
        for (const k of ['aisha', 'vikram', 'neha', 'arjun', 'karan', 'emma']) {
            const def = userDefs.find((d) => d.key === k);
            pushAudit(U.admin, 'CREATE_USER', 'users', U[k], { email: def.email, role: def.role }, daysAgo(def.lastLogin + 1));
        }

        const activeStudents = ['sara', 'raj', 'mia', 'aisha', 'vikram', 'neha', 'arjun'];
        const issuers = ['liam', 'emma', 'admin'];

        // ================================================================
        // CATEGORIES  (parents first so FK parent_id resolves)
        // ================================================================
        const catDefs = [
            { name: 'NCERT', parent: null, desc: 'NCERT prescribed textbooks' },
            { name: 'CBSE', parent: null, desc: 'CBSE board resources' },
            { name: 'Competitive Exams', parent: null, desc: 'Entrance & competitive exam prep' },
            { name: 'NCERT Class 9', parent: 'NCERT', desc: 'Class IX textbooks' },
            { name: 'NCERT Class 10', parent: 'NCERT', desc: 'Class X textbooks' },
            { name: 'NCERT Class 11', parent: 'NCERT', desc: 'Class XI textbooks' },
            { name: 'NCERT Class 12', parent: 'NCERT', desc: 'Class XII textbooks' },
            { name: 'CBSE Sample Papers', parent: 'CBSE', desc: 'Sample question papers' },
            { name: 'CBSE Reference', parent: 'CBSE', desc: 'Reference & guide books' },
            { name: 'Mathematics', parent: null, desc: 'Mathematics titles' },
            { name: 'Physics', parent: null, desc: 'Physics titles' },
            { name: 'Chemistry', parent: null, desc: 'Chemistry titles' },
            { name: 'Biology', parent: null, desc: 'Biology titles' },
            { name: 'Science', parent: null, desc: 'General science titles' },
            { name: 'English', parent: null, desc: 'English language & literature' },
            { name: 'Hindi', parent: null, desc: 'Hindi language & literature' },
            { name: 'Social Science', parent: null, desc: 'Social science titles' },
            { name: 'History', parent: null, desc: 'History titles' },
            { name: 'Geography', parent: null, desc: 'Geography titles' },
            { name: 'Economics', parent: null, desc: 'Economics titles' },
            { name: 'Computer Science', parent: null, desc: 'Computer science titles' },
            { name: 'General Knowledge', parent: null, desc: 'GK & current affairs' },
            { name: 'Fiction', parent: null, desc: 'Fiction & literature' }
        ];
        const cat = {}; // name -> id
        for (const c of catDefs) {
            const id = uuid();
            cat[c.name] = id;
            await db.query(
                'INSERT INTO categories (id, name, slug, parent_id, description) VALUES (?, ?, ?, ?, ?)',
                [id, c.name, slugify(c.name), c.parent ? cat[c.parent] : null, c.desc]
            );
        }

        // ================================================================
        // BOOKS + COPIES + CATEGORY LINKS
        // ================================================================
        const bookDefs = [
            // ---- NCERT textbooks ----
            { isbn: '9788174506498', title: 'Mathematics — Textbook for Class X', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 372, cats: ['Mathematics', 'NCERT Class 10'], copies: 5, loc: 'A1-01' },
            { isbn: '9788174506504', title: 'Science — Textbook for Class X', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 308, cats: ['Science', 'NCERT Class 10'], copies: 5, loc: 'A1-02' },
            { isbn: '9788174506115', title: 'Mathematics — Textbook for Class IX', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 348, cats: ['Mathematics', 'NCERT Class 9'], copies: 4, loc: 'A1-03' },
            { isbn: '9788174506122', title: 'Science — Textbook for Class IX', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 280, cats: ['Science', 'NCERT Class 9'], copies: 4, loc: 'A1-04' },
            { isbn: '9788174507112', title: 'Physics Part I — Class XII', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 256, cats: ['Physics', 'NCERT Class 12'], copies: 3, loc: 'A2-01' },
            { isbn: '9788174507129', title: 'Physics Part II — Class XII', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 268, cats: ['Physics', 'NCERT Class 12'], copies: 3, loc: 'A2-02' },
            { isbn: '9788174507136', title: 'Chemistry Part I — Class XII', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 240, cats: ['Chemistry', 'NCERT Class 12'], copies: 3, loc: 'A2-03' },
            { isbn: '9788174507143', title: 'Biology — Class XII', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 332, cats: ['Biology', 'NCERT Class 12'], copies: 3, loc: 'A2-04' },
            { isbn: '9788174507150', title: 'Mathematics Part I — Class XII', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 320, cats: ['Mathematics', 'NCERT Class 12'], copies: 3, loc: 'A2-05' },
            { isbn: '9788174506801', title: 'Physics Part I — Class XI', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 232, cats: ['Physics', 'NCERT Class 11'], copies: 3, loc: 'A3-01' },
            { isbn: '9788174506818', title: 'Chemistry Part I — Class XI', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 228, cats: ['Chemistry', 'NCERT Class 11'], copies: 3, loc: 'A3-02' },
            { isbn: '9788174506825', title: 'Biology — Class XI', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 300, cats: ['Biology', 'NCERT Class 11'], copies: 3, loc: 'A3-03' },
            { isbn: '9788174505057', title: 'Beehive — English Class IX', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 152, cats: ['English', 'NCERT Class 9'], copies: 4, loc: 'B1-01' },
            { isbn: '9788174505743', title: 'First Flight — English Class X', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 168, cats: ['English', 'NCERT Class 10'], copies: 4, loc: 'B1-02' },
            { isbn: '9788174505750', title: 'Kshitij Bhag 2 — Hindi Class X', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 176, cats: ['Hindi', 'NCERT Class 10'], copies: 3, loc: 'B1-03' },
            { isbn: '9788174506610', title: 'India and the Contemporary World — II (History X)', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 140, cats: ['History', 'Social Science', 'NCERT Class 10'], copies: 3, loc: 'B2-01' },
            { isbn: '9788174506627', title: 'Contemporary India — II (Geography X)', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 120, cats: ['Geography', 'Social Science', 'NCERT Class 10'], copies: 3, loc: 'B2-02' },
            { isbn: '9788174506634', title: 'Democratic Politics — II (Civics X)', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 112, cats: ['Social Science', 'NCERT Class 10'], copies: 3, loc: 'B2-03' },
            { isbn: '9788174506641', title: 'Understanding Economic Development (Economics X)', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 104, cats: ['Economics', 'Social Science', 'NCERT Class 10'], copies: 3, loc: 'B2-04' },
            // ---- CBSE reference / guides ----
            { isbn: '9789352838899', title: 'Mathematics for Class 10', authors: ['R.D. Sharma'], publisher: 'Dhanpat Rai', year: 2023, pages: 880, cats: ['Mathematics', 'CBSE Reference'], copies: 4, loc: 'C1-01' },
            { isbn: '9789352535606', title: 'Secondary School Mathematics for Class 10', authors: ['R.S. Aggarwal'], publisher: 'Bharati Bhawan', year: 2022, pages: 760, cats: ['Mathematics', 'CBSE Reference'], copies: 3, loc: 'C1-02' },
            { isbn: '9788121927949', title: 'Science for Class 10', authors: ['Lakhmir Singh', 'Manjit Kaur'], publisher: 'S. Chand', year: 2022, pages: 720, cats: ['Science', 'CBSE Reference'], copies: 3, loc: 'C1-03' },
            { isbn: '9789326196475', title: 'All In One Science Class 10', authors: ['Arihant Experts'], publisher: 'Arihant', year: 2023, pages: 640, cats: ['Science', 'CBSE Reference'], copies: 2, loc: 'C1-04' },
            { isbn: '9789355953681', title: 'CBSE Sample Question Papers Class 10', authors: ['Oswaal Editorial Board'], publisher: 'Oswaal Books', year: 2024, pages: 320, cats: ['CBSE Sample Papers'], copies: 4, loc: 'C2-01' },
            { isbn: '9788174509321', title: 'NCERT Exemplar Problems — Mathematics Class 10', authors: ['NCERT'], publisher: 'NCERT', year: 2023, pages: 220, cats: ['Mathematics', 'CBSE Reference'], copies: 2, loc: 'C2-02' },
            // ---- Competitive / general ----
            { isbn: '9788177092325', title: 'Concepts of Physics — Volume 1', authors: ['H.C. Verma'], publisher: 'Bharati Bhawan', year: 2021, pages: 456, cats: ['Physics', 'Competitive Exams'], copies: 3, loc: 'D1-01' },
            { isbn: '9789388127196', title: 'Objective NCERT at your Fingertips — Biology', authors: ['MTG Editorial Board'], publisher: 'MTG', year: 2023, pages: 720, cats: ['Biology', 'Competitive Exams'], copies: 2, loc: 'D1-02' },
            { isbn: '9780140816594', title: 'Word Power Made Easy', authors: ['Norman Lewis'], publisher: 'Penguin', year: 2011, pages: 686, cats: ['English', 'Competitive Exams'], copies: 3, loc: 'D1-03' },
            { isbn: '9789390298556', title: 'Manorama Yearbook 2024', authors: ['Mammen Mathew'], publisher: 'Malayala Manorama', year: 2024, pages: 1024, cats: ['General Knowledge', 'Competitive Exams'], copies: 2, loc: 'D1-04' },
            // ---- classics / CS / fiction ----
            { isbn: '9780262033848', title: 'Introduction to Algorithms', authors: ['Cormen', 'Leiserson', 'Rivest', 'Stein'], publisher: 'MIT Press', year: 2009, pages: 1312, cats: ['Computer Science'], copies: 3, loc: 'E1-01' },
            { isbn: '9780132350884', title: 'Clean Code', authors: ['Robert C. Martin'], publisher: 'Prentice Hall', year: 2008, pages: 464, cats: ['Computer Science'], copies: 2, loc: 'E1-02' },
            { isbn: '9780131103627', title: 'The C Programming Language', authors: ['Brian W. Kernighan', 'Dennis M. Ritchie'], publisher: 'Prentice Hall', year: 1988, pages: 272, cats: ['Computer Science'], copies: 2, loc: 'E1-03' },
            { isbn: '9780486612720', title: 'Calculus Made Easy', authors: ['Silvanus P. Thompson'], publisher: 'Dover', year: 1998, pages: 250, cats: ['Mathematics'], copies: 2, loc: 'E2-01' },
            { isbn: '9780743273565', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], publisher: 'Scribner', year: 2004, pages: 180, cats: ['Fiction'], copies: 4, loc: 'F1-01' },
            { isbn: '9788173711466', title: 'Wings of Fire: An Autobiography', authors: ['A.P.J. Abdul Kalam', 'Arun Tiwari'], publisher: 'Universities Press', year: 1999, pages: 180, cats: ['General Knowledge', 'History'], copies: 3, loc: 'F1-02' },
            { isbn: '9780553380163', title: 'A Brief History of Time', authors: ['Stephen Hawking'], publisher: 'Bantam', year: 1998, pages: 212, cats: ['Physics', 'General Knowledge'], copies: 2, loc: 'F1-03' },
            { isbn: '9780553296983', title: 'The Diary of a Young Girl', authors: ['Anne Frank'], publisher: 'Bantam', year: 1993, pages: 283, cats: ['History', 'Fiction'], copies: 3, loc: 'F1-04' }
        ];

        const books = []; // { id, title, cats, copies: [{id, status}] }
        const copyAll = []; // flat {id, bookId, status}
        let copyCount = 0;
        let seq = 1;
        for (const b of bookDefs) {
            const bookId = uuid();
            const description = `${b.title} — ${b.authors.join(', ')}. ${b.publisher}, ${b.year}.`;
            await db.query(
                `INSERT INTO books (id, isbn, title, authors, publisher, published_year, language, pages, description, location_code, total_copies, available_copies)
                 VALUES (?, ?, ?, ?, ?, ?, 'en', ?, ?, ?, ?, ?)`,
                [bookId, b.isbn, b.title, JSON.stringify(b.authors), b.publisher, b.year, b.pages, description, b.loc, b.copies, b.copies]
            );
            for (const cname of b.cats) {
                await db.query('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)', [bookId, cat[cname]]);
            }
            const copies = [];
            for (let i = 1; i <= b.copies; i++) {
                copyCount++;
                const id = uuid();
                const condition = i === 1 ? 'new' : pick(['good', 'good', 'fair']);
                await db.query(
                    `INSERT INTO book_copies (id, book_id, barcode, condition_enum, status_enum, acquired_date)
                     VALUES (?, ?, ?, ?, 'available', ?)`,
                    [id, bookId, `BC-${String(seq).padStart(5, '0')}-${i}`, condition, fmtDate(daysAgo(randInt(120, 800)))]
                );
                const c = { id, bookId, status: 'available' };
                copies.push(c);
                copyAll.push(c);
            }
            seq++;
            books.push({ id: bookId, title: b.title, cats: b.cats, copies });
        }

        // A few copies out of circulation (damaged / lost) for realism.
        for (const c of shuffle(copyAll).slice(0, 5)) {
            const status = pick(['damaged', 'damaged', 'lost']);
            await db.query('UPDATE book_copies SET status_enum = ? WHERE id = ?', [status, c.id]);
            c.status = status;
        }

        // ================================================================
        // BORROWS  (returned history + active + overdue)
        // ================================================================
        const reviewPool = [
            'Very helpful for exam prep.', 'Clear explanations and good examples.',
            'A must-read for every student.', 'Helped me understand the basics.',
            'Excellent reference book.', 'Concepts explained simply.', 'Great for quick revision.',
            'Loved working through this.', null, null, null
        ];
        const ratingWeighted = [3, 3, 4, 4, 4, 4, 5, 5, 5, 2];

        const holds = {}; // studentKey -> current active/overdue count
        activeStudents.forEach((s) => (holds[s] = 0));
        const ratingsMade = new Set(); // `${student}|${bookId}`
        let borrowCount = 0, returnedCount = 0, activeCount = 0, overdueCount = 0;
        let finesPaid = 0, finesOutstanding = 0;

        const insertBorrow = async (row) => {
            await db.query(
                `INSERT INTO borrows (id, user_id, book_copy_id, issued_by, returned_by, issued_at, due_date, returned_at, status_enum, fine_amount, fine_paid, renewal_count, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [row.id, row.user_id, row.book_copy_id, row.issued_by, row.returned_by || null,
                 fmtDateTime(row.issued_at), fmtDate(row.due_date), row.returned_at ? fmtDateTime(row.returned_at) : null,
                 row.status, row.fine_amount, row.fine_paid ? 1 : 0, row.renewal_count || 0, row.notes || null, fmtDateTime(row.issued_at)]
            );
            borrowCount++;
        };

        const anyCopyOf = (book) => pick(book.copies);
        const availableCopyOf = (book) => book.copies.find((c) => c.status === 'available');

        // --- returned history (spread over ~90 days) ---
        for (let i = 0; i < 55; i++) {
            const student = pick(activeStudents);
            const book = pick(books);
            const copy = anyCopyOf(book);
            const issued = daysAgo(randInt(15, 95));
            const due = addDays(issued, LOAN_DAYS);
            const heldDays = randInt(4, 24);
            const returned = addDays(issued, heldDays);
            if (returned > now()) continue;
            const lateDays = Math.max(0, heldDays - LOAN_DAYS);
            const fine = lateDays * FINE_PER_DAY;
            const paid = fine === 0 ? true : Math.random() < 0.8;
            const issuer = pick(issuers);
            const returner = pick(issuers);
            const id = uuid();
            await insertBorrow({
                id, user_id: U[student], book_copy_id: copy.id, issued_by: U[issuer], returned_by: U[returner],
                issued_at: issued, due_date: due, returned_at: returned, status: 'returned',
                fine_amount: fine.toFixed(2), fine_paid: paid, renewal_count: Math.random() < 0.15 ? 1 : 0
            });
            returnedCount++;
            if (fine > 0) { paid ? (finesPaid += fine) : (finesOutstanding += fine); }
            pushAudit(U[issuer], 'ISSUE_BOOK', 'borrows', id, { book: book.title, student }, issued);
            pushAudit(U[returner], 'RETURN_BOOK', 'borrows', id, { book: book.title, fine }, returned);
            if (fine > 0 && paid) pushAudit(U[returner], 'PAY_FINE', 'borrows', id, { amount: fine }, returned);

            // The reader often rates a book they returned.
            const key = `${student}|${book.id}`;
            if (Math.random() < 0.55 && !ratingsMade.has(key)) {
                ratingsMade.add(key);
                const rating = pick(ratingWeighted);
                const review = pick(reviewPool);
                const rid = uuid();
                await db.query(
                    'INSERT INTO book_ratings (id, user_id, book_id, rating, review, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [rid, U[student], book.id, rating, review, fmtDateTime(addDays(returned, 1))]
                );
                pushAudit(U[student], 'RATE_BOOK', 'books', book.id, { rating }, addDays(returned, 1));
            }
        }

        // --- active borrows (currently held, due in the future) ---
        const activeBorrows = []; // { student, book, copy, due }
        for (let i = 0; i < 16; i++) {
            const student = pick(activeStudents);
            if (holds[student] >= 5) continue;
            const candidates = shuffle(books).filter((b) => availableCopyOf(b));
            const book = candidates[0];
            if (!book) break;
            const copy = availableCopyOf(book);
            copy.status = 'borrowed';
            await db.query('UPDATE book_copies SET status_enum = ? WHERE id = ?', ['borrowed', copy.id]);
            const issued = daysAgo(randInt(1, 12));
            const due = addDays(issued, LOAN_DAYS);
            const issuer = pick(issuers);
            const id = uuid();
            await insertBorrow({
                id, user_id: U[student], book_copy_id: copy.id, issued_by: U[issuer],
                issued_at: issued, due_date: due, status: 'active', fine_amount: '0.00', fine_paid: false,
                renewal_count: Math.random() < 0.2 ? 1 : 0
            });
            activeCount++;
            holds[student]++;
            activeBorrows.push({ student, book, copy, due });
            pushAudit(U[issuer], 'ISSUE_BOOK', 'borrows', id, { book: book.title, student }, issued);
        }

        // --- overdue borrows (held past due, fine accruing & unpaid) ---
        const overdueBorrows = [];
        for (let i = 0; i < 7; i++) {
            const student = pick(activeStudents);
            if (holds[student] >= 5) continue;
            const candidates = shuffle(books).filter((b) => availableCopyOf(b));
            const book = candidates[0];
            if (!book) break;
            const copy = availableCopyOf(book);
            copy.status = 'borrowed';
            await db.query('UPDATE book_copies SET status_enum = ? WHERE id = ?', ['borrowed', copy.id]);
            const issued = daysAgo(randInt(20, 45));
            const due = addDays(issued, LOAN_DAYS);
            const lateDays = Math.max(1, Math.round((now() - due) / 86400000));
            const fine = lateDays * FINE_PER_DAY;
            const issuer = pick(issuers);
            const id = uuid();
            await insertBorrow({
                id, user_id: U[student], book_copy_id: copy.id, issued_by: U[issuer],
                issued_at: issued, due_date: due, status: 'overdue', fine_amount: fine.toFixed(2), fine_paid: false
            });
            overdueCount++;
            finesOutstanding += fine;
            holds[student]++;
            overdueBorrows.push({ student, book, due, fine });
            pushAudit(U[issuer], 'ISSUE_BOOK', 'borrows', id, { book: book.title, student }, issued);
        }

        // ================================================================
        // RESERVATIONS
        // ================================================================
        let reservationCount = 0;
        const fulfilledRes = []; // { student, book }
        for (let i = 0; i < 12; i++) {
            const student = pick(activeStudents);
            const book = pick(books);
            const reservedAt = daysAgo(randInt(0, 30));
            const status = pick(['pending', 'pending', 'pending', 'fulfilled', 'cancelled', 'expired']);
            const expires = status === 'pending' ? addDays(now(), randInt(1, 6)) : addDays(reservedAt, 3);
            await db.query(
                'INSERT INTO reservations (id, user_id, book_id, status, reserved_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
                [uuid(), U[student], book.id, status, fmtDateTime(reservedAt), fmtDateTime(expires)]
            );
            reservationCount++;
            if (status === 'fulfilled') fulfilledRes.push({ student, book });
        }

        // ================================================================
        // FAVORITES
        // ================================================================
        let favoriteCount = 0;
        for (const student of activeStudents) {
            for (const book of shuffle(books).slice(0, randInt(3, 6))) {
                try {
                    await db.query(
                        'INSERT INTO favorites (id, user_id, book_id, created_at) VALUES (?, ?, ?, ?)',
                        [uuid(), U[student], book.id, fmtDateTime(daysAgo(randInt(0, 40)))]
                    );
                    favoriteCount++;
                } catch (e) { /* unique (user,book) — skip dupes */ }
            }
        }

        // ================================================================
        // NOTIFICATIONS
        // ================================================================
        let notificationCount = 0;
        const notify = async (student, type, title, message, isRead, when) => {
            await db.query(
                'INSERT INTO notifications (id, user_id, type, title, message, is_read, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuid(), U[student], type, title, message, isRead ? 1 : 0, fmtDateTime(when)]
            );
            notificationCount++;
        };
        for (const student of activeStudents) {
            await notify(student, 'WELCOME', 'Welcome to the library', 'Your account is active. Browse the catalog to get started.', true, daysAgo(randInt(30, 60)));
        }
        for (const ab of activeBorrows) {
            const daysLeft = Math.round((ab.due - now()) / 86400000);
            if (daysLeft <= 3) {
                await notify(ab.student, 'DUE_DATE_REMINDER', 'Book due soon',
                    `"${ab.book.title}" is due on ${fmtDate(ab.due)}.`, false, daysAgo(0));
            }
        }
        for (const ob of overdueBorrows) {
            await notify(ob.student, 'OVERDUE_ALERT', 'Overdue book',
                `"${ob.book.title}" was due on ${fmtDate(ob.due)}. A fine of ₹${ob.fine} is accruing.`, false, daysAgo(randInt(0, 2)));
        }
        for (const fr of fulfilledRes) {
            await notify(fr.student, 'RESERVATION_READY', 'Reservation ready for pickup',
                `"${fr.book.title}" is now available. Please collect it within 3 days.`, false, daysAgo(randInt(0, 3)));
        }

        // ================================================================
        // RECOMMENDATIONS  (offline-job style rows; powers "Recommended for you")
        // ================================================================
        let recommendationCount = 0;
        for (const student of activeStudents) {
            const picks = shuffle(books).slice(0, 6);
            let rank = 1;
            for (const book of picks) {
                try {
                    await db.query(
                        'INSERT INTO recommendations (id, user_id, book_id, score, algorithm, rank_position, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [uuid(), U[student], book.id, Number((1 - rank * 0.12).toFixed(3)), pick(['hybrid', 'hybrid', 'collaborative', 'content']), rank, fmtDateTime(daysAgo(1))]
                    );
                    recommendationCount++;
                    rank++;
                } catch (e) { /* unique (user,book) — skip */ }
            }
        }

        // ================================================================
        // BOOK VIEWS  (interaction signal)
        // ================================================================
        let viewCount = 0;
        for (let i = 0; i < 80; i++) {
            const student = pick(activeStudents);
            const book = pick(books);
            await db.query(
                'INSERT INTO book_views (id, user_id, book_id, source, viewed_at) VALUES (?, ?, ?, ?, ?)',
                [uuid(), U[student], book.id, pick(['search', 'detail', 'category', 'recommendation']), fmtDateTime(daysAgo(randInt(0, 45)))]
            );
            viewCount++;
        }

        // ================================================================
        // DERIVED BOOK FIELDS  (authoritative recompute from copies + borrows)
        // ================================================================
        await db.query(`
            UPDATE books b SET
              total_copies = (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id),
              available_copies = (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id AND c.status_enum = 'available')
        `);
        await db.query(`
            UPDATE books b SET popularity_score = (
              SELECT COUNT(*) FROM borrows br
              JOIN book_copies c ON c.id = br.book_copy_id
              WHERE c.book_id = b.id
            )
        `);

        // ================================================================
        // AUDIT LOGS  (insert the timeline we accumulated)
        // ================================================================
        for (const a of audits) {
            await db.query(
                'INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuid(), a.userId, a.action, a.entityType, a.entityId, a.metadata ? JSON.stringify(a.metadata) : null, fmtDateTime(a.when)]
            );
        }

        // ---- summary -----------------------------------------------------
        console.log('\nSeed complete:');
        console.log(`  users:           ${userDefs.length} (1 admin, 2 librarians, ${userDefs.filter((u) => u.role === 'student').length} students incl. 1 inactive)`);
        console.log(`  categories:      ${catDefs.length} (incl. NCERT/CBSE/Competitive trees)`);
        console.log(`  books:           ${bookDefs.length}`);
        console.log(`  copies:          ${copyCount}`);
        console.log(`  borrows:         ${borrowCount} (${returnedCount} returned, ${activeCount} active, ${overdueCount} overdue)`);
        console.log(`  reservations:    ${reservationCount}`);
        console.log(`  favorites:       ${favoriteCount}`);
        console.log(`  ratings:         ${ratingsMade.size}`);
        console.log(`  notifications:   ${notificationCount}`);
        console.log(`  recommendations: ${recommendationCount}`);
        console.log(`  book views:      ${viewCount}`);
        console.log(`  audit logs:      ${audits.length}`);
        console.log(`  fines:           ₹${finesOutstanding.toFixed(2)} outstanding, ₹${finesPaid.toFixed(2)} collected`);
        console.log('\nLogin for every seeded account:  password "Password@123"');
        console.log('  admin@library.local · librarian@library.local · emma@library.local');
        console.log('  sara@student.local · raj@student.local · mia@student.local · aisha@student.local ...');
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
