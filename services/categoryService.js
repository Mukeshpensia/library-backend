// services/categoryService.js
const { v4: uuidv4 } = require('uuid');
const CategoryModel = require('../models/categoryModel');

class CategoryService {
    constructor(fastify) {
        this.categoryModel = new CategoryModel(fastify.mysql);
    }

    async getCategories() {
        return await this.categoryModel.findAll();
    }

    async createCategory(categoryData) {
        const id = uuidv4();
        if (!categoryData.slug) categoryData.slug = categoryData.name.toLowerCase().replace(/ /g, '-');
        await this.categoryModel.create({ ...categoryData, id });
        return id;
    }

    async updateCategory(id, updateData) {
        await this.categoryModel.update(id, updateData);
        return true;
    }

    async deleteCategory(id) {
        await this.categoryModel.delete(id);
        return true;
    }
}

module.exports = CategoryService;