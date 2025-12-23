import mongoose from 'mongoose';

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
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
  },
  // ✅ NEW: Phone number field for contact-based chat
  phone: {
    type: String,
    unique: true,
    sparse: true, // Allow null values without unique constraint conflict
    trim: true,
    default: null,
  },
  // ✅ NEW: Phone verification status
  phoneVerified: {
    type: Boolean,
    default: false,
  },
  // ✅ NEW: Phone verification token
  phoneVerificationToken: {
    type: String,
    default: null,
  },
  // Password reset fields
  passwordResetToken: {
    type: String,
    default: null,
  },
  passwordResetExpiry: {
    type: Date,
    default: null,
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
  // ✅ NEW: Contacts list - store other users' IDs with their phone/email
  contacts: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      phone: String,
      email: String,
      name: String,
      addedAt: {
        type: Date,
        default: Date.now,
      },
      isFavorite: {
        type: Boolean,
        default: false,
      },
      contactName: String, // Custom name for contact
    },
  ],
  // ✅ NEW: Blocked users
  blockedUsers: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      blockedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // FCM tokens for push notifications
  fcmTokens: [
    {
      token: {
        type: String,
        required: true,
      },
      platform: {
        type: String,
        enum: ['web', 'android', 'ios'],
        default: 'web',
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
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
userSchema.index({ phone: 1 }); 
userSchema.index({ tenantId: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'contacts.userId': 1 }); 
userSchema.index({ 'blockedUsers.userId': 1 }); 

// ========== MIDDLEWARE ==========

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const bcrypt = await import('bcryptjs');
    const salt = await bcrypt.default.genSalt(12);
    this.password = await bcrypt.default.hash(this.password, salt);
    this.lastPasswordChange = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Auto-clean expired and revoked tokens before saving
userSchema.pre('save', function (next) {
  // Remove expired or revoked tokens
  if (this.refreshTokens && Array.isArray(this.refreshTokens)) {
    this.refreshTokens = this.refreshTokens.filter(
      (token) => token.expiresAt > new Date() && !token.revokedAt
    );

    // Keep only last 5 active tokens
    if (this.refreshTokens.length > 5) {
      this.refreshTokens = this.refreshTokens.slice(-5);
    }
  }
  next();
});
    

// ========== METHODS ==========

/**
 * Compare password for login
 */
userSchema.methods.comparePassword = async function (password) {
  const bcrypt = await import('bcryptjs');
  return await bcrypt.default.compare(password, this.password);
};

/**
 * ✅ NEW: Add contact by phone or email
 */
userSchema.methods.addContact = function (userId, phone, email, name, contactName) {
  // Check if contact already exists
  const existingContact = this.contacts.find(
    (c) => c.userId.toString() === userId.toString()
  );

  if (!existingContact) {
    this.contacts.push({
      userId,
      phone,
      email,
      name,
      contactName: contactName || name,
      addedAt: new Date(),
    });
  }

  return this;
};

/**
 * ✅ NEW: Remove contact
 */
userSchema.methods.removeContact = function (userId) {
  this.contacts = this.contacts.filter(
    (c) => c.userId.toString() !== userId.toString()
  );
  return this;
};

/**
 * ✅ NEW: Get contact by phone
 */
userSchema.methods.getContactByPhone = function (phone) {
  return this.contacts.find((c) => c.phone === phone);
};

/**
 * ✅ NEW: Get contact by userId
 */
userSchema.methods.getContact = function (userId) {
  return this.contacts.find((c) => c.userId.toString() === userId.toString());
};

/**
 * ✅ NEW: Block user
 */
userSchema.methods.blockUser = function (userId) {
  // Check if already blocked
  const isBlocked = this.blockedUsers.some(
    (b) => b.userId.toString() === userId.toString()
  );

  if (!isBlocked) {
    this.blockedUsers.push({
      userId,
      blockedAt: new Date(),
    });
  }

  return this;
};

/**
 * ✅ NEW: Unblock user
 */
userSchema.methods.unblockUser = function (userId) {
  this.blockedUsers = this.blockedUsers.filter(
    (b) => b.userId.toString() !== userId.toString()
  );
  return this;
};

/**
 * ✅ NEW: Check if user is blocked
 */
userSchema.methods.isUserBlocked = function (userId) {
  return this.blockedUsers.some(
    (b) => b.userId.toString() === userId.toString()
  );
};

/**
 * ✅ NEW: Mark contact as favorite
 */
userSchema.methods.markContactAsFavorite = function (userId) {
  const contact = this.getContact(userId);
  if (contact) {
    contact.isFavorite = true;
  }
  return this;
};

/**
 * ✅ NEW: Unmark contact from favorite
 */
userSchema.methods.unmarkContactAsFavorite = function (userId) {
  const contact = this.getContact(userId);
  if (contact) {
    contact.isFavorite = false;
  }
  return this;
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

  // Keep only 5 tokens
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
  obj.refreshTokens = undefined;
  delete obj.phoneVerificationToken;
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;