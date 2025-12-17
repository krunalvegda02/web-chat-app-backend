
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import MESSAGE from "../constants/message.js";

const jwtSecret = process.env.JWT_SECRET
const jwtExpire = process.env.JWT_EXPIRE

/**
 * Generate JWT Access Token
 */
const generateAccessToken = (userId, email, role, tenantId) => {
    return jwt.sign(
        { userId, email, role, tenantId },
        jwtSecret,
        { expiresIn: jwtExpire || '24h' }
    );
};

/**
 * Generate random refresh token
 */
const generateRefreshToken = () => {
    return crypto.randomBytes(40).toString('hex');
};

/**
 * Save refresh token to user document
 * Auto-cleans old tokens, keeps max 5
 */
const saveRefreshToken = async (userId, ipAddress = null, userAgent = null) => {
    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error(MESSAGE.USER_NOT_FOUND);
        }

        // Add token (auto-cleans via method)
        user.addRefreshToken(token, expiresAt, ipAddress, userAgent);
        await user.save();

        return token;
    } catch (error) {
        console.error('Error saving refresh token:', error);
        throw error;
    }
};

/**
 * Verify refresh token is valid
 */
const verifyRefreshToken = async (token, userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return false;
        }

        return user.verifyRefreshToken(token);
    } catch (error) {
        console.error('Error verifying refresh token:', error);
        return false;
    }
};

/**
 * Revoke single refresh token
 */
const revokeRefreshToken = async (token, userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error(MESSAGE.USER_NOT_FOUND);
        }

        user.revokeRefreshToken(token);
        await user.save();
    } catch (error) {
        console.error('Error revoking refresh token:', error);
        throw error;
    }
};

/**
 * Revoke all refresh tokens (logout all devices)
 */
const revokeAllRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error(MESSAGE.USER_NOT_FOUND);
        }

        user.revokeAllRefreshTokens();
        await user.save();
    } catch (error) {
        console.error('Error revoking all tokens:', error);
        throw error;
    }
};

/**
 * Get all active sessions for a user
 */
const getUserSessions = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return [];
        }

        return user.getActiveSessions();
    } catch (error) {
        console.error('Error getting user sessions:', error);
        return [];
    }
};

/**
 * Revoke session by user agent
 */
const revokeUserSessionByAgent = async (userId, userAgent) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error(MESSAGE.USER_NOT_FOUND);
        }

        user.revokeSessionByAgent(userAgent);
        await user.save();
    } catch (error) {
        console.error('Error revoking session:', error);
        throw error;
    }
};

/**
 * Decode JWT token
 */
const decodeToken = (token) => {
    try {
        return jwt.verify(token, jwtSecret);
    } catch (error) {
        console.error('Error decoding token:', error);
        return null;
    }
};

/**
 * Clean up all expired tokens for all users
 * Run this periodically (e.g., daily cron job)
 */
const cleanupExpiredTokens = async () => {
    try {
        const users = await User.find({ 'refreshTokens.expiresAt': { $lt: new Date() } });

        for (const user of users) {
            user.refreshTokens = user.refreshTokens.filter(
                (t) => t.expiresAt > new Date() && !t.revokedAt
            );
            await user.save();
        }

        return users.length;
    } catch (error) {
        console.error('Error cleaning up expired tokens:', error);
        return 0;
    }
};

export {
    generateAccessToken,
    generateRefreshToken,
    saveRefreshToken,
    verifyRefreshToken,
    revokeRefreshToken,
    revokeAllRefreshTokens,
    getUserSessions,
    revokeUserSessionByAgent,
    cleanupExpiredTokens,
    decodeToken,
};