import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false, // Don't include password in queries by default
    },
    avatar: {
        type: String,
        default: null,
    },
    role: {
        type: String,
        enum: ['USER', 'ADMIN', 'SUPER_ADMIN'],
        default: 'USER',
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        default: null,
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'BANNED'],
        default: 'ACTIVE',
    },

    refreshTokens: [
        {
            token: {
                type: String,
                required: true,
            },
            expiresAt: {
                type: Date,
                required: true,
            },
            revokedAt: {
                type: Date,
                default: null,
            },
            ipAddress: String,
            userAgent: String,
            createdAt: {
                type: Date,
                default: Date.now,
            },
        },
    ],

    lastLogin: Date,
    lastPasswordChange: Date,
    twoFactorEnabled: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// ========== INDEXES ==========
userSchema.index({ email: 1 });
userSchema.index({ tenantId: 1 });
userSchema.index({ createdAt: -1 });

// ========== MIDDLEWARE ==========

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(bcryptRounds);
        this.password = await bcrypt.hash(this.password, salt);
        this.lastPasswordChange = new Date();
        next();
    } catch (error) {
        next(error);
    }
});

// Auto-clean expired and revoked tokens before saving
userSchema.pre('save', function (next) {
    // Remove expired or revoked tokens
    this.refreshTokens = this.refreshTokens.filter(
        (token) => token.expiresAt > new Date() && !token.revokedAt
    );

    // Keep only last 5 active tokens (SMART LIMIT)
    if (this.refreshTokens.length > 5) {
        this.refreshTokens = this.refreshTokens.slice(-5); // Keep newest 5
    }

    next();
});

// ========== METHODS ==========

/**
 * Compare password for login
 */
userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

/**
 * Add refresh token (auto-cleans old ones)
 */
userSchema.methods.addRefreshToken = function (token, expiresAt, ipAddress, userAgent) {
    // Remove old tokens first
    this.refreshTokens = this.refreshTokens.filter(
        (t) => t.expiresAt > new Date() && !t.revokedAt
    );

    // Add new token
    this.refreshTokens.push({
        token,
        expiresAt,
        ipAddress,
        userAgent,
    });

    // Keep only 5 tokens (limit device sessions)
    if (this.refreshTokens.length > 5) {
        this.refreshTokens = this.refreshTokens.slice(-5);
    }

    return this;
};

/**
 * Verify if token exists and is valid
 */
userSchema.methods.verifyRefreshToken = function (token) {
    const tokenRecord = this.refreshTokens.find(
        (t) =>
            t.token === token &&
            t.expiresAt > new Date() &&
            !t.revokedAt
    );
    return tokenRecord !== undefined;
};

/**
 * Revoke single token (logout one device)
 */
userSchema.methods.revokeRefreshToken = function (token) {
    const tokenRecord = this.refreshTokens.find((t) => t.token === token);
    if (tokenRecord) {
        tokenRecord.revokedAt = new Date();
    }
    return this;
};

/**
 * Revoke all tokens (logout all devices)
 */
userSchema.methods.revokeAllRefreshTokens = function () {
    this.refreshTokens.forEach((token) => {
        token.revokedAt = new Date();
    });
    return this;
};

/**
 * Get all active sessions
 */
userSchema.methods.getActiveSessions = function () {
    return this.refreshTokens
        .filter((t) => t.expiresAt > new Date() && !t.revokedAt)
        .map((t) => ({
            ipAddress: t.ipAddress,
            userAgent: t.userAgent,
            createdAt: t.createdAt,
            expiresAt: t.expiresAt,
        }));
};

/**
 * Revoke session by user agent (logout specific device)
 */
userSchema.methods.revokeSessionByAgent = function (userAgent) {
    const tokenRecord = this.refreshTokens.find((t) => t.userAgent === userAgent);
    if (tokenRecord) {
        tokenRecord.revokedAt = new Date();
    }
    return this;
};

/**
 * Return user without sensitive data
 */
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    // Optionally hide token details in response
    obj.refreshTokens = undefined;
    return obj;
};

const User = mongoose.model("User", userSchema);

export default User;


