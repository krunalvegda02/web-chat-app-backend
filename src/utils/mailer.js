import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { welcomeEmailTemplate, inviteEmailTemplate } from './emailTemplates.js';
dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const sendWelcomeEmail = async (email, name, tenantName) => {
    try {
        await transporter.sendMail({
            from: `"${tenantName || 'Chat App'}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Welcome to ${tenantName || 'Chat App'}! 🎉`,
            html: welcomeEmailTemplate(name, tenantName)
        });
        console.log(`✅ Welcome email sent to ${email}`);
    } catch (error) {
        console.error('❌ Failed to send welcome email:', error.message);
    }
};

export const sendInviteEmail = async (email, tenantName, inviteUrl) => {
    try {
        await transporter.sendMail({
            from: `"${tenantName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `You're invited to join ${tenantName}! 🎉`,
            html: inviteEmailTemplate(tenantName, inviteUrl)
        });
        console.log(`✅ Invite email sent to ${email}`);
    } catch (error) {
        console.error('❌ Failed to send invite email:', error.message);
    }
};

export { transporter };