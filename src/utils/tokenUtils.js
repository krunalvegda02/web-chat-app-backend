
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import MESSAGE from "../constants/message.js";

// ✅ CRITICAL FIX: Load secrets dynamically to ensure .env is loaded
// Trim whitespace to handle dotenv quirks
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    return secret ? secret.trim() : undefined;
};
const getJwtExpire = () => {
    const expire = process.env.JWT_EXPIRE;
    return expire ? expire.trim() : undefined;
};

// ============================================================================
// EXISTING FUNCTIONS (Keep these as-is)
// ============================================================================

/**
 * Generate JWT Access Token
 */
const generateAccessToken = (userId, email, role, contextId) => {
    const payload = { userId, email, role };
    
    // Add context based on role
    if (role === 'PLATFORM_ADMIN') {
        payload.platformId = contextId || null;
    } else {
        payload.tenantId = contextId || null;
    }
    
    const secret = getJwtSecret();
    if (!secret) {
        throw new Error('JWT_SECRET is not configured in environment variables');
    }
    
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
    console.log(`✅ [TOKEN] Generating token | Secret length: ${secret.length} | Hash: ${secretHash}...`);
    
    return jwt.sign(
        payload,
        secret,
        { expiresIn: getJwtExpire() || '24h' }
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
        // Use atomic operation to avoid version conflicts
        const result = await User.findByIdAndUpdate(
            userId,
            {
                $push: {
                    refreshTokens: {
                        $each: [{
                            token,
                            expiresAt,
                            ipAddress,
                            userAgent,
                            createdAt: new Date()
                        }],
                        $slice: -5 // Keep only last 5 tokens
                    }
                },
                $pull: {
                    refreshTokens: {
                        $or: [
                            { expiresAt: { $lt: new Date() } }, // Remove expired
                            { revokedAt: { $exists: true } }    // Remove revoked
                        ]
                    }
                }
            },
            { new: true }
        );

        if (!result) {
            throw new Error(MESSAGE.USER_NOT_FOUND);
        }

        return token;
    } catch (error) {
        console.error('Error saving refresh token:', error);
        // Fallback to original method if atomic operation fails
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error(MESSAGE.USER_NOT_FOUND);
            }

            // Add token (auto-cleans via method)
            user.addRefreshToken(token, expiresAt, ipAddress, userAgent);
            await user.save();

            return token;
        } catch (fallbackError) {
            console.error('Fallback save refresh token also failed:', fallbackError);
            throw fallbackError;
        }
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
        // Use atomic operation to avoid version conflicts
        const result = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    'refreshTokens.$[elem].revokedAt': new Date()
                }
            },
            {
                arrayFilters: [{ 'elem.token': token }],
                new: true
            }
        );

        if (!result) {
            throw new Error(MESSAGE.USER_NOT_FOUND);
        }
    } catch (error) {
        console.error('Error revoking refresh token:', error);
        // Fallback to original method
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error(MESSAGE.USER_NOT_FOUND);
            }

            user.revokeRefreshToken(token);
            await user.save();
        } catch (fallbackError) {
            console.error('Fallback revoke refresh token also failed:', fallbackError);
            throw fallbackError;
        }
    }
};

/**
 * Revoke all refresh tokens (logout all devices)
 */
const revokeAllRefreshTokens = async (userId) => {
    try {
        // Use atomic operation to avoid version conflicts
        const result = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    refreshTokens: []
                }
            },
            { new: true }
        );

        if (!result) {
            throw new Error(MESSAGE.USER_NOT_FOUND);
        }
    } catch (error) {
        console.error('Error revoking all tokens:', error);
        // Fallback to original method
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error(MESSAGE.USER_NOT_FOUND);
            }

            user.revokeAllRefreshTokens();
            await user.save();
        } catch (fallbackError) {
            console.error('Fallback revoke all tokens also failed:', fallbackError);
            throw fallbackError;
        }
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
        const secret = getJwtSecret();
        if (!secret) {
            console.error('❌ [TOKEN] JWT_SECRET is undefined');
            throw new Error('JWT_SECRET is not configured in environment variables');
        }
        
        const secretHash = crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
        console.log(`🔍 [TOKEN] Verifying token | Secret length: ${secret.length} | Hash: ${secretHash}...`);
        
        // Decode without verification first to see what's inside
        const decoded = jwt.decode(token);
        console.log(`🔍 [TOKEN] Token payload:`, decoded);
        
        return jwt.verify(token, secret);
    } catch (error) {
        console.error('❌ [TOKEN] Error decoding token:', error.message);
        console.error('❌ [TOKEN] Full error:', error);
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

// ============================================================================
// ✅ NEW FUNCTIONS FOR CONTACT SUPPORT (Add these)
// ============================================================================

/**
 * Generate 6-digit phone verification code
 * Used for: SMS verification, OTP reset
 */
const generatePhoneVerificationToken = () => {
    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
};

/**
 * Generate password reset token (secure 32-byte hex)
 * Used for: Email/SMS password reset links
 * Expires in 30 minutes
 */
const generatePasswordResetToken = () => {
    // Generate cryptographically secure random token
    const token = crypto.randomBytes(32).toString('hex');
    return token;
};

/**
 * Generate email verification token (secure hex)
 * Used for: Email address verification
 */
const generateEmailVerificationToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    return token;
};

/**
 * Validate phone verification code format
 * Code must be 6 digits
 */
const isValidPhoneCode = (code) => {
    return /^\d{6}$/.test(code);
};

/**
 * Validate password reset token format
 * Token must be 64-character hex (32 bytes)
 */
const isValidResetToken = (token) => {
    return /^[a-f0-9]{64}$/.test(token);
};

/**
 * Check if token is expired
 * expiryTime: Date object or timestamp
 */
const isTokenExpired = (expiryTime) => {
    if (!expiryTime) return true;
    
    const expiryDate = typeof expiryTime === 'number' 
        ? new Date(expiryTime) 
        : expiryTime;
    
    return new Date() > expiryDate;
};

/**
 * Get token expiry time (30 minutes from now)
 * Used for: Password reset token expiry
 */
const getTokenExpiry = (minutesFromNow = 30) => {
    return new Date(Date.now() + minutesFromNow * 60 * 1000);
};

/**
 * Get phone verification code expiry time (10 minutes)
 * Used for: OTP expiry
 */
const getPhoneCodeExpiry = (minutesFromNow = 10) => {
    return new Date(Date.now() + minutesFromNow * 60 * 1000);
};

/**
 * Verify JWT and extract user data
 * Returns null if invalid or expired
 */
const verifyAndDecodeToken = (token) => {
    try {
        if (!token) return null;
        
        // Remove "Bearer " prefix if present
        const cleanToken = token.startsWith('Bearer ') 
            ? token.slice(7) 
            : token;
        
        const secret = getJwtSecret();
        if (!secret) {
            throw new Error('JWT_SECRET is not configured in environment variables');
        }
        
        return jwt.verify(cleanToken, secret);
    } catch (error) {
        console.error('Error verifying token:', error.message);
        return null;
    }
};

/**
 * Generate secure session token for 2FA
 * Used for: Two-factor authentication sessions
 */
const generateSessionToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Hash a token for secure storage
 * Used for: Storing tokens in database
 */
const hashToken = (token) => {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
};

/**
 * Validate hashed token
 * Used for: Comparing stored vs provided tokens
 */
const validateHashedToken = (token, hashedToken) => {
    const hash = hashToken(token);
    return hash === hashedToken;
};

// ============================================================================
// EXPORTS - All functions
// ============================================================================

export {
    // Existing functions
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
    
    // ✅ New contact/phone/password reset functions
    generatePhoneVerificationToken,
    generatePasswordResetToken,
    generateEmailVerificationToken,
    isValidPhoneCode,
    isValidResetToken,
    isTokenExpired,
    getTokenExpiry,
    getPhoneCodeExpiry,
    verifyAndDecodeToken,
    generateSessionToken,
    hashToken,
    validateHashedToken,
};