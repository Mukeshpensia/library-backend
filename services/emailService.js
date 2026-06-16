// services/emailService.js
const sgMail = require('@sendgrid/mail');
const path = require('path');
const fs = require('fs/promises'); // Use fs.promises for async file operations
const config = require('../config');

class EmailService {
    constructor() {
        sgMail.setApiKey(config.sendgrid.apiKey);
        this.senderEmail = config.sendgrid.senderEmail;
        this.emailTemplatesPath = path.join(__dirname, '../emails'); // Path to templates folder
    }

    /**
     * Reads an HTML email template and replaces placeholders.
     * @param {string} templateName - The name of the HTML template file (e.g., 'password-reset').
     * @param {object} replacements - An object where keys are placeholder names and values are their replacements.
     * @returns {Promise<string>} The processed HTML content.
     */
    async _loadTemplate(templateName, replacements) {
        try {
            const templatePath = path.join(this.emailTemplatesPath, `${templateName}.html`);
            let html = await fs.readFile(templatePath, 'utf8');

            for (const key in replacements) {
                if (Object.hasOwnProperty.call(replacements, key)) {
                    const placeholder = new RegExp(`{{${key}}}`, 'g'); // Create regex for global replacement
                    html = html.replace(placeholder, replacements[key]);
                }
            }
            return html;
        } catch (error) {
            console.error(`Error loading email template '${templateName}':`, error);
            throw new Error(`Failed to load email template: ${templateName}`);
        }
    }

    async sendPasswordResetEmail(recipientEmail, resetToken) {
        const resetLink = `${process.env.WEBSITE_URL || 'https://oneagro.in'}/account/reset-password?token=${resetToken}`;
        const supportLink = `${process.env.WEBSITE_URL || 'https://oneagro.in'}/contact-us`; // Example support link

        // Load and populate the HTML template
        const htmlContent = await this._loadTemplate('password-reset', {
            resetLink: resetLink,
            supportLink: supportLink
        });

        const msg = {
            to: recipientEmail,
            from: 'noreply@oneagro.in',
            subject: 'Password Reset Request for Your Account',
            html: htmlContent, // Send the HTML content
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.
                   Please click on the following link, or paste this into your browser to complete the process: ${resetLink}
                   If you did not request this, please ignore this email and your password will remain unchanged.`,
        };

        try {
            await sgMail.send(msg);
            return true;
        } catch (error) {
            console.error('SendGrid Email Error:', error);
            if (error.response) {
                console.error(error.response.body);
            }
            throw new Error('Failed to send password reset email.');
        }
    }

    async sendWelcomeEmail(recipientEmail, username) {
        const websiteLink = `${process.env.WEBSITE_URL || 'https://oneagro.in'}`; // Example website link
        const supportLink = `${process.env.WEBSITE_URL || 'https://oneagro.in'}/contact-us`; // Example support link

        // Load and populate the HTML template
        const htmlContent = await this._loadTemplate('welcome', {
            username: username,
            websiteLink: websiteLink,
            supportLink: supportLink
        });

        const msg = {
            to: recipientEmail,
            from: 'noreply@oneagro.in',
            subject: 'Welcome to One Agro!',
            html: htmlContent, // Send the HTML content
            text: `Hello ${username},\n\nWelcome to One Agro! We're glad to have you.\n\nBest regards,\nThe Team`,
        };
        try {
            await sgMail.send(msg);
            return true;
        } catch (error) {
            console.error('SendGrid Welcome Email Error:', error);
            if (error.response) {
                console.error(error.response.body);
            }
            throw new Error('Failed to send welcome email.');
        }
    }
}

module.exports = EmailService;