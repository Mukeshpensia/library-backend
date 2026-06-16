// routes/authRoutes.js
const AuthController = require('../controllers/authController');
const AuthService = require('../services/authService');
const UserModel = require('../models/userModel');
const { auth: schema } = require('../schemas');

async function authRoutes(fastify, options) {
    const userModel = new UserModel(fastify.mysql);
    const authService = new AuthService(userModel, fastify);
    const authController = new AuthController(authService, fastify);

    // Tight rate limits on the credential-guessing / email-spam surfaces.
    const loginLimit = { rateLimit: { max: 5, timeWindow: '1 minute' } };
    const forgotLimit = { rateLimit: { max: 3, timeWindow: '1 minute' } };

    // Public routes
    fastify.post('/register', { schema: schema.register }, authController.register.bind(authController));
    fastify.post('/login', { schema: schema.login, config: loginLimit }, authController.login.bind(authController));
    fastify.post('/refresh', { schema: schema.refresh }, authController.refresh.bind(authController));
    fastify.post('/forgot-password', { schema: schema.forgotPassword, config: forgotLimit }, authController.forgotPassword.bind(authController));
    fastify.post('/reset-password', { schema: schema.resetPassword }, authController.resetPassword.bind(authController));
    fastify.post('/verify-email', { schema: schema.verifyEmail }, authController.verifyEmail.bind(authController));

    // Protected routes
    fastify.get('/me', { onRequest: [fastify.authenticate], schema: schema.me }, authController.me.bind(authController));
    fastify.patch('/me', { onRequest: [fastify.authenticate], schema: schema.updateMe }, authController.updateMe.bind(authController));
    fastify.post('/update-profile-pic', { onRequest: [fastify.authenticate], schema: schema.updateProfilePic }, authController.updateProfilePic.bind(authController));
    fastify.post('/logout', { onRequest: [fastify.authenticate], schema: schema.logout }, authController.logout.bind(authController));
    fastify.patch('/change-password', { onRequest: [fastify.authenticate], schema: schema.changePassword }, authController.changePassword.bind(authController));
}

module.exports = authRoutes;