// controllers/categoryController.js
class CategoryController {
    constructor(categoryService) {
        this.categoryService = categoryService;
    }

    async list(request, reply) {
        const categories = await this.categoryService.getCategories();
        return reply.send({ success: true, data: categories });
    }

    async create(request, reply) {
        const id = await this.categoryService.createCategory(request.body);
        return reply.code(201).send({ success: true, data: { id } });
    }

    async update(request, reply) {
        await this.categoryService.updateCategory(request.params.id, request.body);
        return reply.send({ success: true, message: 'Category updated successfully.' });
    }

    async delete(request, reply) {
        try {
            await this.categoryService.deleteCategory(request.params.id);
            return reply.send({ success: true, message: 'Category deleted successfully.' });
        } catch (error) {
            return reply.code(400).send({ success: false, error: { message: error.message } });
        }
    }
}

module.exports = CategoryController;