// services/authService.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const EmailService = require('./emailService');
const RefreshTokenModel = require('../models/refreshTokenModel');
const AuditLogModel = require('../models/auditLogModel');

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

class AuthService {
    constructor(userModel, fastify) {
        this.userModel = userModel;
        this.fastify = fastify;
        this.emailService = new EmailService();
        this.refreshTokenModel = new RefreshTokenModel(fastify.mysql);
        this.auditLogModel = new AuditLogModel(fastify.mysql);
    }

    async registerUser(userData) {
        const { full_name, email, password, student_id, department, phone } = userData;

        const id = uuidv4();
        const password_hash = await bcrypt.hash(password, 12);

        await this.userModel.createUser({
            id,
            full_name,
            email,
            password_hash,
            role: 'student',
            student_id,
            department,
            phone
        });

        await this.auditLogModel.log(uuidv4(), id, 'REGISTER', 'users', id, { role: 'student' });

        try {
            await this.emailService.sendWelcomeEmail(email, full_name);
        } catch (emailError) {
            this.fastify.log.error('Failed to send welcome email:', emailError.message);
        }

        return { id, email };
    }

    async loginUser(email, password) {
        const user = await this.userModel.findByEmail(email);
        if (!user || !user.is_active) {
            return { success: false, message: 'Invalid credentials or account inactive.' };
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return { success: false, message: 'Invalid credentials.' };
        }

        const accessToken = this.fastify.jwt.sign(
            { sub: user.id, email: user.email, role: user.role, name: user.full_name },
            { expiresIn: '15m' }
        );

        const refreshTokenValue = crypto.randomBytes(40).toString('hex');
        const refreshTokenHash = hashToken(refreshTokenValue);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await this.refreshTokenModel.create(uuidv4(), user.id, refreshTokenHash, expiresAt);
        await this.userModel.updateLastLogin(user.id);
        await this.auditLogModel.log(uuidv4(), user.id, 'LOGIN', 'users', user.id);

        return {
            success: true,
            accessToken,
            refreshToken: refreshTokenValue,
            user: { id: user.id, name: user.full_name, role: user.role }
        };
    }

    async refreshAccessToken(refreshTokenValue) {
        const tokenData = await this.refreshTokenModel.findByTokenHash(hashToken(refreshTokenValue));

        if (!tokenData) {
            return { success: false, message: 'Invalid or expired refresh token.' };
        }

        const user = await this.userModel.findById(tokenData.user_id);
        if (!user || !user.is_active) {
            return { success: false, message: 'User not found or inactive.' };
        }

        // Rotate token
        await this.refreshTokenModel.revoke(tokenData.id);
        
        const newAccessToken = this.fastify.jwt.sign(
            { sub: user.id, email: user.email, role: user.role, name: user.full_name },
            { expiresIn: '15m' }
        );

        const newRefreshTokenValue = crypto.randomBytes(40).toString('hex');
        const newRefreshTokenHash = hashToken(newRefreshTokenValue);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.refreshTokenModel.create(uuidv4(), user.id, newRefreshTokenHash, expiresAt);

        return {
            success: true,
            accessToken: newAccessToken,
            refreshToken: newRefreshTokenValue
        };
    }

    async logout(userId, refreshTokenValue) {
        if (refreshTokenValue) {
            await this.refreshTokenModel.revokeByHash(hashToken(refreshTokenValue), userId);
        } else {
            await this.refreshTokenModel.revokeAllForUser(userId);
        }
        await this.auditLogModel.log(uuidv4(), userId, 'LOGOUT', 'users', userId);
        return { success: true };
    }

    async getUserProfile(userId) {
        const user = await this.userModel.findById(userId);
        if (!user) return { success: false, message: 'User not found.' };
        return { success: true, user };
    }

    async updateProfile(userId, updateData) {
        await this.userModel.updateProfile(userId, updateData);
        await this.auditLogModel.log(uuidv4(), userId, 'UPDATE_PROFILE', 'users', userId, updateData);
        return { success: true };
    }

    async updateProfilePicture(userId, profilePicUrl) {
        await this.userModel.updateProfile(userId, { profile_pic: profilePicUrl });
        await this.auditLogModel.log(uuidv4(), userId, 'UPDATE_PROFILE_PIC', 'users', userId, { profile_pic: profilePicUrl });
        return { success: true, profilePicUrl };
    }

    async changePassword(userId, currentPassword, newPassword) {
        const [rows] = await this.fastify.mysql.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
        const user = rows[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) return { success: false, message: 'Current password incorrect.' };

        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        await this.userModel.updatePassword(userId, hashedNewPassword);
        await this.auditLogModel.log(uuidv4(), userId, 'CHANGE_PASSWORD', 'users', userId);
        return { success: true };
    }

    async forgotPassword(email) {
        const user = await this.userModel.findByEmail(email);
        // Always return success to prevent user enumeration
        if (!user || !user.is_active) return { success: true };

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await this.fastify.mysql.query(
            'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
            [uuidv4(), user.id, tokenHash, expiresAt]
        );

        try {
            await this.emailService.sendPasswordResetEmail(email, rawToken);
        } catch (emailError) {
            this.fastify.log.error('Failed to send password reset email:', emailError.message);
        }

        return { success: true };
    }

    async resetPassword(rawToken, newPassword) {
        const tokenHash = hashToken(rawToken);
        const [rows] = await this.fastify.mysql.query(
            'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = FALSE AND expires_at > NOW()',
            [tokenHash]
        );
        const tokenRecord = rows[0];

        if (!tokenRecord) {
            return { success: false, message: 'Invalid or expired reset token.' };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await this.userModel.updatePassword(tokenRecord.user_id, hashedPassword);

        // Invalidate token and revoke all refresh tokens for security
        await this.fastify.mysql.query(
            'UPDATE password_reset_tokens SET used = TRUE WHERE id = ?',
            [tokenRecord.id]
        );
        await this.refreshTokenModel.revokeAllForUser(tokenRecord.user_id);

        await this.auditLogModel.log(uuidv4(), tokenRecord.user_id, 'RESET_PASSWORD', 'users', tokenRecord.user_id);
        return { success: true };
    }
}

module.exports = AuthService;