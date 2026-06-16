// models/categoryModel.js
class CategoryModel {
    constructor(db) {
        this.db = db;
    }

    async findAll() {
        const [rows] = await this.db.query('SELECT * FROM categories ORDER BY name ASC');
        return rows;
    }

    async findById(id) {
        const [rows] = await this.db.query('SELECT * FROM categories WHERE id = ?', [id]);
        return rows[0] || null;
    }

    async create(categoryData) {
        const { id, name, slug, parent_id, description } = categoryData;
        await this.db.query(
            'INSERT INTO categories (id, name, slug, parent_id, description) VALUES (?, ?, ?, ?, ?)',
            [id, name, slug, parent_id, description]
        );
        return id;
    }

    async update(id, updateData) {
        const fields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updateData), id];
        await this.db.query(`UPDATE categories SET ${fields} WHERE id = ?`, values);
    }

    async delete(id) {
        // Check if empty as per doc (implied by foreign keys or logic)
        const [books] = await this.db.query('SELECT book_id FROM book_categories WHERE category_id = ?', [id]);
        if (books.length > 0) throw new Error('Category is not empty.');
        
        await this.db.query('DELETE FROM categories WHERE id = ?', [id]);
    }
}

module.exports = CategoryModel;