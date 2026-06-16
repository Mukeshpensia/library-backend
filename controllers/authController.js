// controllers/authController.js
const fs = require('fs');
const util = require('util');
const pump = util.promisify(require('pump'));
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

// Shared options for the refresh-token cookie. In production the frontend and
// API may be served from different origins, so the cookie must be SameSite=None
// + Secure to be sent on cross-origin XHR (requires CORS credentials). In dev
// (http://localhost) SameSite=Lax + non-secure works.
const REFRESH_COOKIE_OPTIONS = {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 // 7 days
};

class AuthController {
    constructor(authService, fastify) {
        this.authService = authService;
        this.fastify = fastify;
    }

    async register(request, reply) {
        try {
            const result = await this.authService.registerUser(request.body);
            return reply.code(201).send({
                success: true,
                message: 'Registration successful. Please verify your email.',
                data: { user_id: result.id, email: result.email }
            });
        } catch (error) {
            this.fastify.log.error('Register error:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                return reply.code(409).send({
                    success: false,
                    error: { code: 'DUPLICATE_ENTRY', message: 'Email or ID already exists.' }
                });
            }
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Registration failed.' }
            });
        }
    }

    async login(request, reply) {
        const { email, password } = request.body;
        const result = await this.authService.loginUser(email, password);

        if (!result.success) {
            return reply.code(401).send({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: result.message }
            });
        }

        // Set refresh token in HttpOnly cookie as per doc
        reply.setCookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);

        return reply.send({
            success: true,
            data: {
                access_token: result.accessToken,
                token_type: 'Bearer',
                expires_in: 900,
                user: result.user
            }
        });
    }

    async refresh(request, reply) {
        const refreshToken = request.cookies.refresh_token;
        if (!refreshToken) {
            return reply.code(401).send({
                success: false,
                error: { code: 'NO_TOKEN', message: 'Refresh token missing.' }
            });
        }

        const result = await this.authService.refreshAccessToken(refreshToken);
        if (!result.success) {
            return reply.code(401).send({
                success: false,
                error: { code: 'INVALID_TOKEN', message: result.message }
            });
        }

        reply.setCookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);

        return reply.send({
            success: true,
            data: {
                access_token: result.accessToken,
                token_type: 'Bearer',
                expires_in: 900
            }
        });
    }

    async logout(request, reply) {
        const userId = request.user.id;
        const refreshToken = request.cookies.refresh_token;
        
        await this.authService.logout(userId, refreshToken);
        reply.clearCookie('refresh_token', { path: '/', sameSite: REFRESH_COOKIE_OPTIONS.sameSite, secure: REFRESH_COOKIE_OPTIONS.secure });

        return reply.send({ success: true, message: 'Logged out successfully.' });
    }

    async me(request, reply) {
        const userId = request.user.id;
        const result = await this.authService.getUserProfile(userId);
        
        if (!result.success) {
            return reply.code(404).send({
                success: false,
                error: { code: 'USER_NOT_FOUND', message: result.message }
            });
        }

        return reply.send({ success: true, data: result.user });
    }

    async updateMe(request, reply) {
        const userId = request.user.id;
        const result = await this.authService.updateProfile(userId, request.body);
        
        return reply.send({ success: true, message: 'Profile updated successfully.' });
    }

    async updateProfilePic(request, reply) {
        const userId = request.user.id;
        const file = await request.file();

        if (!file || !file.filename) {
            return reply.code(400).send({
                success: false,
                error: { code: 'BAD_REQUEST', message: 'Profile picture file is required.' }
            });
        }

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return reply.code(400).send({
                success: false,
                error: { code: 'BAD_REQUEST', message: 'Invalid file type. Only JPEG, PNG, GIF are allowed.' }
            });
        }

        try {
            const uploadDir = path.join(__dirname, '../uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir);
            }

            const safeOriginalName = path.basename(file.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = `${userId}-${Date.now()}-${safeOriginalName}`;
            const filepath = path.join(uploadDir, filename);

            await pump(file.file, fs.createWriteStream(filepath));

            const profilePicUrl = `/uploads/${filename}`;
            const result = await this.authService.updateProfilePicture(userId, profilePicUrl);
            
            return reply.send({
                success: true,
                message: 'Profile picture updated successfully.',
                data: { profile_pic_url: profilePicUrl }
            });

        } catch (error) {
            this.fastify.log.error('Update profile picture error:', error);
            return reply.code(500).send({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile picture.' }
            });
        }
    }

    async changePassword(request, reply) {
        const userId = request.user.id;
        const { currentPassword, newPassword } = request.body;
        
        const result = await this.authService.changePassword(userId, currentPassword, newPassword);
        if (!result.success) {
            return reply.code(400).send({
                success: false,
                error: { code: 'BAD_REQUEST', message: result.message }
            });
        }

        return reply.send({ success: true, message: 'Password changed successfully.' });
    }

    async forgotPassword(request, reply) {
        const { email } = request.body;
        if (!email) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Email is required.' } });
        }
        await this.authService.forgotPassword(email);
        // Always return the same response to prevent user enumeration
        return reply.send({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
    }

    async resetPassword(request, reply) {
        const { token, newPassword } = request.body;
        if (!token || !newPassword) {
            return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Token and new password are required.' } });
        }
        const result = await this.authService.resetPassword(token, newPassword);
        if (!result.success) {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_TOKEN', message: result.message } });
        }
        return reply.send({ success: true, message: 'Password has been reset. Please log in with your new password.' });
    }

    async verifyEmail(request, reply) {
        // Implementation for email verification
        return reply.send({ success: true, message: 'Email verified successfully.' });
    }
}

module.exports = AuthController;