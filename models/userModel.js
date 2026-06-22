// models/userModel.js
const USER_UPDATABLE_FIELDS = new Set(['full_name', 'department', 'phone', 'profile_pic']);
// Fields only an admin may change (via the user-management screens). Kept
// separate from self-profile updates so a user can never escalate their role.
const ADMIN_UPDATABLE_FIELDS = new Set(['role', 'is_active', 'max_borrow_limit']);

class UserModel {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        const [rows] = await this.db.query(
            'SELECT id, full_name, email, role, profile_pic, student_id, employee_id, department, phone, is_active, max_borrow_limit, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
            [id]
        );
        return rows[0] || null;
    }

    async findByEmail(email) {
        const [rows] = await this.db.query(
            'SELECT id, full_name, email, password_hash, role, is_active FROM users WHERE email = ? AND deleted_at IS NULL',
            [email]
        );
        return rows[0] || null;
    }

    async findByStudentOrEmployeeId(idValue, isStudent = true) {
        const column = isStudent ? 'student_id' : 'employee_id';
        const [rows] = await this.db.query(
            `SELECT id FROM users WHERE ${column} = ? AND deleted_at IS NULL`,
            [idValue]
        );
        return rows[0] || null;
    }

    async createUser(userData) {
        const { id, full_name, email, password_hash, role, student_id, employee_id, department, phone } = userData;
        await this.db.query(
            'INSERT INTO users (id, full_name, email, password_hash, role, student_id, employee_id, department, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, full_name, email, password_hash, role, student_id, employee_id, department, phone]
        );
        return id;
    }

    async updateProfile(id, updateData) {
        const safeData = Object.fromEntries(
            Object.entries(updateData).filter(([k]) => USER_UPDATABLE_FIELDS.has(k))
        );
        if (Object.keys(safeData).length === 0) return;
        const fields = Object.keys(safeData).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(safeData), id];
        await this.db.query(`UPDATE users SET ${fields} WHERE id = ?`, values);
    }

    // Admin-only updates (role / active / borrow limit). Uses a separate
    // allowlist so these privileged fields can't be set via self-profile edits.
    async adminUpdate(id, updateData) {
        const safeData = Object.fromEntries(
            Object.entries(updateData).filter(([k]) => ADMIN_UPDATABLE_FIELDS.has(k))
        );
        if (Object.keys(safeData).length === 0) return;
        const fields = Object.keys(safeData).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(safeData), id];
        await this.db.query(`UPDATE users SET ${fields} WHERE id = ?`, values);
    }

    async updatePassword(id, hashedPassword) {
        await this.db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, id]);
    }

    async softDelete(id) {
        await this.db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [id]);
    }

    async updateLastLogin(id) {
        await this.db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
    }

    // Lightweight lookup for circulation (librarian+admin): match name, email,
    // student_id, or employee_id. Returns the fields needed to pick a borrower.
    async search(q, limit = 10) {
        const like = `%${q}%`;
        const [rows] = await this.db.query(
            `SELECT id, full_name, email, role, student_id, employee_id, is_active, max_borrow_limit
             FROM users
             WHERE deleted_at IS NULL
               AND (full_name LIKE ? OR email LIKE ? OR student_id LIKE ? OR employee_id LIKE ?)
             ORDER BY full_name ASC
             LIMIT ?`,
            [like, like, like, like, limit]
        );
        return rows;
    }

    async findAll({ filters = {}, limit = 20, offset = 0 }) {
        let query = 'SELECT id, full_name, email, role, profile_pic, department, is_active, max_borrow_limit, last_login_at, created_at FROM users WHERE deleted_at IS NULL';
        const params = [];

        if (filters.role) {
            query += ' AND role = ?';
            params.push(filters.role);
        }
        if (filters.search) {
            query += ' AND (full_name LIKE ? OR email LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [rows] = await this.db.query(query, params);
        return rows;
    }

    async countAll({ filters = {} }) {
        let query = 'SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL';
        const params = [];

        if (filters.role) {
            query += ' AND role = ?';
            params.push(filters.role);
        }
        if (filters.search) {
            query += ' AND (full_name LIKE ? OR email LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        const [rows] = await this.db.query(query, params);
        return rows[0].count;
    }
}

module.exports = UserModel;