import Platform from '../models/platform.model.js';
import User from '../models/user.model.js';
import Room from '../models/room.model.js';
import crypto from 'crypto';
import { successResponse, errorResponse } from '../../src/utils/response.js';
import { generateAccessToken, saveRefreshToken } from '../utils/tokenUtils.js';

// ============================================
// AES-256 ENCRYPTION HELPERS FOR API KEYS
// ============================================
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'fallback_secret').digest(); // 32 bytes
const IV_LENGTH = 16;

const encryptApiKey = (plainKey) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decryptApiKey = (encryptedKey) => {
  const [ivHex, encryptedHex] = encryptedKey.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

// Validate API key by decrypting stored value and comparing
const validateApiKey = (plainKey, storedKey) => {
  try {
    // Support both old SHA-256 hashed keys and new AES encrypted keys
    if (storedKey.includes(':')) {
      // New AES encrypted format
      return decryptApiKey(storedKey) === plainKey;
    } else {
      // Legacy SHA-256 hash format
      return crypto.createHash('sha256').update(plainKey).digest('hex') === storedKey;
    }
  } catch {
    return false;
  }
};

// ============================================
// DEBUG: Verify Token
// ============================================
export const verifyTokenDebug = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return errorResponse(res, 'Token is required', 400);
    }
    
    const { decodeToken } = await import('../utils/tokenUtils.js');
    const decoded = decodeToken(token);
    
    if (!decoded) {
      return errorResponse(res, 'Token verification failed', 401);
    }
    
    return successResponse(res, {
      decoded,
      message: 'Token verified successfully'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// DEBUG: Check JWT Secret
// ============================================
export const debugJwtSecret = async (req, res) => {
  try {
    const secret = process.env.JWT_SECRET;
    const secretTrimmed = secret ? secret.trim() : undefined;
    
    console.log('=== JWT SECRET DEBUG ===');
    console.log(`Raw secret length: ${secret ? secret.length : 'undefined'}`);
    console.log(`Trimmed secret length: ${secretTrimmed ? secretTrimmed.length : 'undefined'}`);
    console.log(`Raw secret: ${secret}`);
    console.log(`Trimmed secret: ${secretTrimmed}`);
    console.log(`Are they equal? ${secret === secretTrimmed}`);
    
    return successResponse(res, {
      rawLength: secret ? secret.length : null,
      trimmedLength: secretTrimmed ? secretTrimmed.length : null,
      rawSecret: secret,
      trimmedSecret: secretTrimmed,
      equal: secret === secretTrimmed,
    });
  } catch (error) {
    console.error('Debug error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// CREATE PLATFORM (Super Admin)
// ============================================
export const createPlatform = async (req, res) => {
  try {
    const { name, email, password = 'Admin@123', phone } = req.body;

    if (!name || !email) {
      return errorResponse(res, 'Platform name and admin email are required', 400);
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // Generate slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    // Check if platform slug exists
    const existingPlatform = await Platform.findOne({ slug });
    if (existingPlatform) {
      return errorResponse(res, 'Platform name already exists', 400);
    }

    // Create platform admin user first
    const adminUser = new User({
      name: `${name} Platform-Admin`,
      email,
      password,
      phone: phone || undefined,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    });

    await adminUser.save();

    // Create platform with adminId
    const platform = new Platform({
      name,
      slug,
      adminId: adminUser._id,
      description: `${name} platform`,
      theme: {
        appName: name,
        logoUrl: null,
        logoHeight: 40,
        primaryColor: '#008069',
        secondaryColor: '#F0F2F5',
        accentColor: '#25D366',
        backgroundColor: '#FFFFFF',
        borderColor: '#E9EDEF',
        headerBackground: '#008069',
        headerText: '#FFFFFF',
        chatBackgroundImage: null,
        chatBubbleAdmin: '#DCF8C6',
        chatBubbleUser: '#FFFFFF',
        chatBubbleAdminText: '#111B21',
        chatBubbleUserText: '#111B21',
        messageFontSize: 14,
        messageBorderRadius: 8,
        bubbleStyle: 'rounded',
        blurEffect: 0.1,
        showAvatars: true,
        showReadStatus: true,
        enableTypingIndicator: true,
      },
    });

    // Auto-generate API key on creation
    const apiKey = `pk_${crypto.randomBytes(32).toString('hex')}`;
    platform.apiKey = encryptApiKey(apiKey);
    platform.apiKeyCreatedAt = new Date();

    await platform.save();

    // Update admin user with platformId
    adminUser.platformId = platform._id;
    await adminUser.save();

    await platform.populate('adminId', 'name email phone');

    return successResponse(res, {
      platform: {
        ...platform.toObject(),
        admin: platform.adminId,
        apiKey, // Return plain key once on creation
      },
    }, 'Platform created successfully', 201);
  } catch (error) {
    console.error('Create platform error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET ALL PLATFORMS (Super Admin)
// ============================================
export const getAllPlatforms = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;

    const platforms = await Platform.find(query)
      .populate('adminId', 'name email phone')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    // Get client count for each platform
    const platformsWithCounts = await Promise.all(
      platforms.map(async (platform) => {
        const clientCount = await User.countDocuments({ platformId: platform._id, role: 'USER' });
        return {
          ...platform.toObject(),
          admin: platform.adminId,
          clientCount,
        };
      })
    );

    const total = await Platform.countDocuments(query);

    return successResponse(res, {
      platforms: platformsWithCounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get platforms error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET ALL PLATFORMS (Public - for test page)
// ============================================
export const getPublicPlatforms = async (req, res) => {
  try {
    const platforms = await Platform.find({ status: 'ACTIVE' })
      .populate('adminId', 'name email phone')
      .sort({ createdAt: -1 });

    const platformsWithCounts = await Promise.all(
      platforms.map(async (platform) => {
        const clientCount = await User.countDocuments({ platformId: platform._id, role: 'USER' });
        return {
          _id: platform._id,
          name: platform.name,
          slug: platform.slug,
          admin: platform.adminId,
          clientCount,
        };
      })
    );

    return successResponse(res, {
      platforms: platformsWithCounts,
    });
  } catch (error) {
    console.error('Get public platforms error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET PLATFORM BY ID
// ============================================
export const getPlatformById = async (req, res) => {
  try {
    const { platformId } = req.params;

    const platform = await Platform.findById(platformId).populate('adminId', 'name email phone');

    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check authorization
    if (req.user.role !== 'SUPER_ADMIN' && req.user._id.toString() !== platform.adminId._id.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    const clientCount = await User.countDocuments({ platformId: platform._id, role: 'USER' });

    return successResponse(res, {
      platform: {
        ...platform.toObject(),
        admin: platform.adminId,
        clientCount,
      },
    });
  } catch (error) {
    console.error('Get platform error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// UPDATE PLATFORM (Super Admin)
// ============================================
export const updatePlatform = async (req, res) => {
  try {
    const { platformId } = req.params;
    const { name, email, phone, status } = req.body;

    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Update platform name
    if (name && name !== platform.name) {
      platform.name = name;
      platform.slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');
    }

    if (status !== undefined) platform.status = status;

    // Update admin user
    if (email || phone) {
      const adminUser = await User.findById(platform.adminId);
      if (adminUser) {
        if (email && email !== adminUser.email) {
          const existingUser = await User.findOne({ email, _id: { $ne: adminUser._id } });
          if (existingUser) {
            return errorResponse(res, 'Email already registered', 400);
          }
          adminUser.email = email;
        }
        if (phone !== undefined) {
          adminUser.phone = phone || null;
        }
        await adminUser.save();
      }
    }

    platform.updatedAt = Date.now();
    await platform.save();
    await platform.populate('adminId', 'name email phone');

    return successResponse(res, {
      platform: {
        ...platform.toObject(),
        admin: platform.adminId,
      },
    }, 'Platform updated successfully');
  } catch (error) {
    console.error('Update platform error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// TOGGLE PLATFORM STATUS (Super Admin)
// ============================================
export const togglePlatformStatus = async (req, res) => {
  try {
    const { platformId } = req.params;

    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'Unauthorized', 403);
    }

    platform.status = platform.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await platform.save();

    // Update admin user status
    const adminUser = await User.findById(platform.adminId);
    if (adminUser) {
      adminUser.status = platform.status;
      
      // If deactivating, revoke all refresh tokens to force logout
      if (platform.status === 'INACTIVE') {
        adminUser.revokeAllRefreshTokens();
        
        // Force disconnect from socket if connected
        const { forceUserDisconnect } = await import('../sockets/socketUtils.js').catch(() => ({ forceUserDisconnect: null }));
        if (forceUserDisconnect) {
          forceUserDisconnect(req.app.get('io'), platform.adminId.toString(), 'Account has been deactivated');
        }
      }
      
      await adminUser.save();
    }

    await platform.populate('adminId', 'name email phone');

    return successResponse(res, {
      platform: {
        ...platform.toObject(),
        admin: platform.adminId,
      },
    }, `Platform ${platform.status === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`);
  } catch (error) {
    console.error('Toggle platform status error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// CHANGE ADMIN PASSWORD (Super Admin)
// ============================================
export const changeAdminPassword = async (req, res) => {
  try {
    const { platformId } = req.params;
    const { password } = req.body;

    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'Unauthorized', 403);
    }
    if (!password || password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', 400);
    }

    const platform = await Platform.findById(platformId);
    if (!platform) return errorResponse(res, 'Platform not found', 404);

    const adminUser = await User.findById(platform.adminId);
    if (!adminUser) return errorResponse(res, 'Admin user not found', 404);

    adminUser.password = password;
    await adminUser.save();

    return successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    console.error('Change admin password error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// DELETE PLATFORM (Super Admin)
// ============================================
export const deletePlatform = async (req, res) => {
  try {
    const { platformId } = req.params;

    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Delete all users belonging to this platform
    await User.deleteMany({ platformId });

    // Delete admin user
    await User.findByIdAndDelete(platform.adminId);

    // Delete platform
    await Platform.findByIdAndDelete(platformId);

    return successResponse(res, null, 'Platform deleted successfully');
  } catch (error) {
    console.error('Delete platform error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET PLATFORM USERS (Platform Admin)
// ============================================
export const getPlatformUsers = async (req, res) => {
  try {
    const { platformId } = req.params;
    const { status, search, page = 1, limit = 50 } = req.query;

    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check authorization
    if (req.user.role !== 'SUPER_ADMIN' && req.user._id.toString() !== platform.adminId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    const query = { platformId, role: 'USER' };
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    return successResponse(res, {
      users,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get platform users error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET USER BY ID
// ============================================
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password -refreshTokens')
      .populate('platformId', 'name externalClientId');

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, { user });
  } catch (error) {
    console.error('Get user error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// FIX PLATFORM ADMINS - Set platformId for existing admins
// ============================================
export const fixPlatformAdmins = async (req, res) => {
  try {
    // Find all platforms
    const platforms = await Platform.find();
    let updatedCount = 0;

    for (const platform of platforms) {
      if (platform.adminId) {
        const adminUser = await User.findById(platform.adminId);
        if (adminUser && !adminUser.platformId) {
          adminUser.platformId = platform._id;
          await adminUser.save();
          updatedCount++;
          console.log(`✅ [FIX] Updated admin ${adminUser.email} with platformId ${platform._id}`);
        }
      }
    }

    return successResponse(res, { updatedCount }, `Fixed ${updatedCount} platform admins`);
  } catch (error) {
    console.error('Fix platform admins error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET PLATFORM THEME
// ============================================
export const getPlatformTheme = async (req, res) => {
  try {
    const { platformId } = req.params;

    const platform = await Platform.findById(platformId).select('theme');

    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    return successResponse(res, { theme: platform.theme || {} });
  } catch (error) {
    console.error('Get platform theme error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// UPDATE PLATFORM THEME (Platform Admin)
// ============================================
export const updatePlatformTheme = async (req, res) => {
  try {
    const { platformId } = req.params;

    // Extract theme from body, excluding platformId
    const { platformId: _, ...themeUpdates } = req.body;

    const platform = await Platform.findById(platformId);

    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check if user is admin of this platform or super admin
    if (req.user.role !== 'SUPER_ADMIN' && req.user._id.toString() !== platform.adminId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Merge theme updates with existing theme
    platform.theme = {
      ...(platform.theme || {}),
      ...themeUpdates,
    };

    platform.updatedAt = Date.now();
    await platform.save();

    return successResponse(
      res,
      { theme: platform.theme },
      'Platform theme updated successfully'
    );
  } catch (error) {
    console.error('Update platform theme error:', error);
    return errorResponse(res, error.message, 500);
  }
};
export const createPlatformUser = async (req, res) => {
  try {
    const { platformId, name, email, phone } = req.body;

    if (!platformId || !name || !email || !phone) {
      return errorResponse(res, 'Platform ID, name, email, and phone are required', 400);
    }

    // Check if platform exists
    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // Check if phone already exists
    const normalizedPhone = phone.replace(/\D/g, '');
    const existingPhone = await User.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return errorResponse(res, 'Phone number already registered', 400);
    }

    // Create platform user
    const user = new User({
      name: name.trim(),
      email,
      phone: normalizedPhone,
      password: 'TempPassword@123',
      role: 'USER',
      platformId,
      status: 'ACTIVE',
      phoneVerified: false,
      contacts: [],
      blockedUsers: [],
    });

    await user.save();

    console.log(`✅ [PLATFORM_USER] Created user ${email} for platform ${platformId}`);

    return successResponse(res, {
      user: user.toJSON(),
      message: 'Platform user created successfully',
    }, 'User created successfully', 201);
  } catch (error) {
    console.error('Create platform user error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// UPDATE USER STATUS
// ============================================
export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    user.status = status;
    user.updatedAt = Date.now();
    await user.save();

    return successResponse(res, { user }, 'User status updated successfully');
  } catch (error) {
    console.error('Update user status error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GENERATE SESSION TOKEN (server-to-server)
// External platform calls this with API key to get a short-lived session token
// The session token is what goes in the URL — API key never touches the browser
// ============================================
export const generateSessionToken = async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !apiKey.startsWith('pk_')) {
      return errorResponse(res, 'Valid API key is required', 401);
    }

    const { name, email, phone, externalUserId } = req.body;
    if (!phone) return errorResponse(res, 'Phone is required', 400);

    const platforms = await Platform.find({ status: 'ACTIVE' });
    const platform = platforms.find(p => p.apiKey && validateApiKey(apiKey, p.apiKey));
    if (!platform) return errorResponse(res, 'Invalid or inactive API key', 401);

    // Generate a short-lived single-use session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Clean expired tokens first
    platform.sessionTokens = (platform.sessionTokens || []).filter(t => t.expiresAt > new Date() && !t.usedAt);

    platform.sessionTokens.push({
      token: sessionToken,
      expiresAt,
      usedAt: null,
      userData: { name, email, phone, externalUserId }
    });

    await platform.save();

    console.log(`✅ [SESSION_TOKEN] Generated session token for platform ${platform.name}`);

    return successResponse(res, {
      sessionToken,
      expiresAt,
      platformId: platform._id,
    }, 'Session token generated. Use this in the chat URL instead of the API key.');
  } catch (error) {
    console.error('Generate session token error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// CONSUME SESSION TOKEN (browser calls this)
// Validates the session token from URL, marks it used, performs login
// ============================================
export const consumeSessionToken = async (req, res) => {
  try {
    const { sessionToken } = req.body;
    if (!sessionToken) return errorResponse(res, 'Session token is required', 400);

    // Find platform with this token
    const platform = await Platform.findOne({
      'sessionTokens.token': sessionToken,
      status: 'ACTIVE'
    }).populate('adminId', 'name email phone role');

    if (!platform) return errorResponse(res, 'Invalid session token', 401);

    const tokenEntry = platform.sessionTokens.find(t => t.token === sessionToken);

    if (!tokenEntry) return errorResponse(res, 'Session token not found', 401);
    if (tokenEntry.usedAt) return errorResponse(res, 'Session token already used', 401);
    if (tokenEntry.expiresAt < new Date()) return errorResponse(res, 'Session token expired', 401);

    // Mark token as used immediately (single-use)
    tokenEntry.usedAt = new Date();
    await platform.save();

    // Now perform the actual login using the stored userData
    const { name, email, phone, externalUserId } = tokenEntry.userData;
    const normalizedPhone = phone.replace(/\D/g, '');
    const finalEmail = email || `user_${normalizedPhone}@${platform.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.local`;

    let user = await User.findOne({
      $and: [
        { $or: [{ platformId: platform._id }, { platformName: platform.name }] },
        { $or: [{ phone: normalizedPhone }, ...(email ? [{ email }] : [])] }
      ]
    });

    let isNewUser = false;
    if (!user) {
      user = new User({
        name: name?.trim() || `User_${normalizedPhone}`,
        email: finalEmail,
        phone: normalizedPhone,
        password: 'TempPassword@123',
        role: 'USER',
        platformId: platform._id,
        platformName: platform.name,
        status: 'ACTIVE',
        phoneVerified: false,
        externalUserId: externalUserId || null,
        contacts: [],
        blockedUsers: [],
      });
      await user.save();
      isNewUser = true;
    } else {
      await User.findByIdAndUpdate(user._id, {
        $set: { platformId: platform._id, platformName: platform.name, refreshTokens: [] }
      });
    }

    const accessToken = generateAccessToken(user._id, user.email, user.role, platform.name);
    const refreshToken = await saveRefreshToken(user._id, req.ip || '0.0.0.0', req.headers['user-agent'] || 'platform');

    // Get or create room with platform admin
    const platformAdmin = platform.adminId;
    const sortedParticipants = [user._id.toString(), platformAdmin._id.toString()].sort();
    const roomKey = `DIRECT_PLATFORM_${platform._id}_${sortedParticipants.join('_')}`;

    let room = await Room.findOne({ participantKey: roomKey });
    if (!room) {
      room = new Room({
        name: `Chat - ${user.name} & ${platformAdmin.name}`,
        type: 'DIRECT',
        platformId: platform._id,
        createdVia: 'direct',
        participantKey: roomKey,
        participants: [
          { userId: user._id, role: 'INITIATOR' },
          { userId: platformAdmin._id, role: 'PARTICIPANT' }
        ].sort((a, b) => a.userId.toString().localeCompare(b.userId.toString())),
        lastMessageTime: new Date()
      });
      try {
        await room.save();
      } catch (e) {
        if (e.code === 11000) {
          room = await Room.findOne({ participantKey: roomKey });
        } else throw e;
      }
    }

    console.log(`✅ [SESSION_TOKEN] Consumed token, logged in user ${normalizedPhone} for platform ${platform.name}`);

    return successResponse(res, {
      user: user.toJSON(),
      accessToken,
      refreshToken,
      isNewUser,
      room: { _id: room._id, name: room.name, type: room.type },
      redirectUrl: `/user/chats/${room._id}`,
    }, 'Login successful', 200);
  } catch (error) {
    console.error('Consume session token error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// PLATFORM CHAT LOGIN - Server-to-server only
// External platform backend calls this with X-API-Key header
// ============================================
export const platformChatLogin = async (req, res) => {
  try {
    // Validate API Key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return errorResponse(res, 'API key is required', 401);
    }

    if (!apiKey.startsWith('pk_')) {
      return errorResponse(res, 'Invalid API key format', 401);
    }

    // Validate API key — supports both AES encrypted (new) and SHA-256 hashed (legacy)
    const platform = await Platform.findOne({ status: 'ACTIVE' }).where('adminId').exists(true)
      .then(async () => {
        const platforms = await Platform.find({ status: 'ACTIVE' }).populate('adminId', 'name email phone role');
        return platforms.find(p => p.apiKey && validateApiKey(apiKey, p.apiKey));
      });
    if (!platform) {
      return errorResponse(res, 'Invalid or inactive API key', 401);
    }

    const { name, email, phone, password, externalUserId } = req.body;
    const platformId = platform._id;

    if (!email || !phone) {
      return errorResponse(res, 'Email and phone are required', 400);
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    let user = null;
    let isNewUser = false;

    // Check if user exists by email or phone
    user = await User.findOne({
      $or: [
        { email },
        { phone: normalizedPhone }
      ],
      platformId
    });

    // If user doesn't exist, create new user
    if (!user) {
      if (!name) {
        return errorResponse(res, 'Name is required for new user', 400);
      }

      user = new User({
        name: name.trim(),
        email,
        phone: normalizedPhone,
        password: password || 'TempPassword@123',
        role: 'USER',
        platformId,
        status: 'ACTIVE',
        phoneVerified: false,
        contacts: [],
        blockedUsers: [],
        externalUserId: externalUserId || null,
      });

      await user.save();
      isNewUser = true;
      console.log(`✅ [PLATFORM_CHAT] Created new user ${email} for platform ${platformId}`);
    } else {
      console.log(`✅ [PLATFORM_CHAT] Found existing user ${email} for platform ${platformId}`);
      // ✅ Clear old refresh tokens to force re-authentication with new secret
      user.refreshTokens = [];
      await user.save();
    }

    // Generate JWT tokens using utility functions
    const tokenContext = user.platformId;
    const accessToken = generateAccessToken(user._id, user.email, user.role, tokenContext);
    const refreshToken = await saveRefreshToken(
      user._id,
      req.ip || '0.0.0.0',
      req.headers['user-agent'] || 'unknown'
    );

    console.log(`✅ [PLATFORM_CHAT] Generated tokens for user ${email}`);

    // Create or get room with platform admin
    let platformAdmin = platform.adminId; // Already populated
    
    console.log(`🔍 [PLATFORM_CHAT] Initial platformAdmin:`, {
      exists: !!platformAdmin,
      type: typeof platformAdmin,
      isString: typeof platformAdmin === 'string',
      value: platformAdmin
    });
    
    // If not populated, fetch manually
    if (!platformAdmin || typeof platformAdmin === 'string') {
      console.log(`🔍 [PLATFORM_CHAT] Admin not populated, fetching manually: ${platform.adminId}`);
      try {
        platformAdmin = await User.findById(platform.adminId);
        console.log(`🔍 [PLATFORM_CHAT] Manual fetch result:`, {
          found: !!platformAdmin,
          id: platformAdmin?._id,
          email: platformAdmin?.email
        });
      } catch (fetchError) {
        console.error(`❌ [PLATFORM_CHAT] Error fetching platform admin:`, fetchError);
        return errorResponse(res, 'Error fetching platform admin. Please contact support.', 500);
      }
    }
    
    if (!platformAdmin) {
      console.error(`❌ [PLATFORM_CHAT] Platform admin not found for platform ${platformId}, adminId: ${platform.adminId}`);
      return errorResponse(res, 'Platform admin not found. Please contact support.', 500);
    }

    console.log(`✅ [PLATFORM_CHAT] Found platform admin: ${platformAdmin.email}`);

    // Validate platform admin has _id
    if (!platformAdmin._id) {
      console.error(`❌ [PLATFORM_CHAT] Platform admin missing _id:`, platformAdmin);
      return errorResponse(res, 'Platform admin data is invalid. Please contact support.', 500);
    }

    // Create room key - match existing format with platform prefix
    const sortedParticipants = [user._id.toString(), platformAdmin._id.toString()].sort();
    const roomKey = `DIRECT_PLATFORM_${platformId}_${sortedParticipants.join('_')}`;

    console.log(`🔑 [PLATFORM_CHAT] Creating room with key: ${roomKey}`);

    // Check if room exists
    let room = await Room.findOne({ participantKey: roomKey })
      .populate('participants.userId', 'name email avatar role phone')
      .populate('lastMessage');

    // If room doesn't exist, create it
    if (!room) {
      room = new Room({
        name: `Chat - ${user.name} & ${platformAdmin.name}`,
        type: 'DIRECT',
        platformId: platformId,
        createdVia: 'direct',
        participantKey: roomKey,
        participants: [
          { userId: user._id, role: 'INITIATOR' },
          { userId: platformAdmin._id, role: 'PARTICIPANT' }
        ].sort((a, b) => a.userId.toString().localeCompare(b.userId.toString())),
        lastMessageTime: new Date()
      });

      try {
        console.log(`💾 [PLATFORM_CHAT] Saving room...`);
        await room.save();
        console.log(`✅ [PLATFORM_CHAT] Room saved successfully: ${room._id}`);
        
        console.log(`🔄 [PLATFORM_CHAT] Populating room participants...`);
        await room.populate('participants.userId', 'name email avatar role phone');
        console.log(`✅ [PLATFORM_CHAT] Room populated successfully`);
        
        console.log(`✅ [PLATFORM_CHAT] Created new room: ${room._id}`);
      } catch (error) {
        console.error(`❌ [PLATFORM_CHAT] Room creation error:`, error);
        if (error.code === 11000) {
          // Room already exists (race condition)
          console.log(`⚠️ [PLATFORM_CHAT] Room already exists due to race condition, fetching existing room`);
          room = await Room.findOne({ participantKey: roomKey })
            .populate('participants.userId', 'name email avatar role phone')
            .populate('lastMessage');
          
          if (!room) {
            console.error(`❌ [PLATFORM_CHAT] Failed to fetch existing room after race condition`);
            return errorResponse(res, 'Failed to create or fetch room. Please try again.', 500);
          }
          
          console.log(`⚠️ [PLATFORM_CHAT] Room already exists: ${room._id}`);
        } else {
          throw error;
        }
      }
    } else {
      console.log(`✅ [PLATFORM_CHAT] Found existing room: ${room._id}`);
    }

    // Final validation before returning
    if (!room || !room._id) {
      console.error(`❌ [PLATFORM_CHAT] Room is null or missing _id after creation/fetch:`, room);
      return errorResponse(res, 'Failed to create or retrieve room. Please contact support.', 500);
    }

    console.log(`🎯 [PLATFORM_CHAT] Final room validation passed: ${room._id}`);

    return successResponse(res, {
      user: user.toJSON(),
      accessToken,
      refreshToken,
      isNewUser,
      room: {
        _id: room._id,
        name: room.name,
        type: room.type,
        participants: room.participants,
        lastMessage: room.lastMessage,
        lastMessageTime: room.lastMessageTime,
      },
      redirectUrl: `/user/chats/${room._id}`,
    }, 'Login successful', 200);

  } catch (error) {
    console.error('Platform chat login error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GENERATE API KEY FOR PLATFORM
// ============================================
export const generateApiKey = async (req, res) => {
  try {
    const { platformId } = req.params;
    
    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check authorization - only platform admin or super admin can generate API keys
    if (req.user.role !== 'SUPER_ADMIN' && req.user._id.toString() !== platform.adminId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Generate a secure API key and store encrypted (can be decrypted later)
    const apiKey = `pk_${crypto.randomBytes(32).toString('hex')}`;
    platform.apiKey = encryptApiKey(apiKey);
    platform.apiKeyCreatedAt = new Date();
    await platform.save();

    return successResponse(res, {
      apiKey,
      platformId,
      createdAt: platform.apiKeyCreatedAt
    }, 'API key generated successfully');

  } catch (error) {
    console.error('Generate API key error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET CURRENT API KEY FOR PLATFORM
// ============================================
export const getApiKey = async (req, res) => {
  try {
    const { platformId } = req.params;
    
    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check authorization
    if (req.user.role !== 'SUPER_ADMIN' && req.user._id.toString() !== platform.adminId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    if (!platform.apiKey) {
      return errorResponse(res, 'No API key found. Please generate one first.', 404);
    }

    // Decrypt and return the plain key
    let plainApiKey;
    try {
      if (platform.apiKey.includes(':')) {
        plainApiKey = decryptApiKey(platform.apiKey);
      } else {
        // Legacy SHA-256 key — cannot decrypt, prompt regeneration
        return successResponse(res, {
          hasApiKey: true,
          isLegacy: true,
          platformId,
          createdAt: platform.apiKeyCreatedAt,
        }, 'Legacy API key detected. Please regenerate to view it.');
      }
    } catch {
      return errorResponse(res, 'Failed to decrypt API key', 500);
    }

    return successResponse(res, {
      apiKey: plainApiKey,
      platformId,
      createdAt: platform.apiKeyCreatedAt,
    }, 'API key retrieved successfully');

  } catch (error) {
    console.error('Get API key error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// REVOKE API KEY FOR PLATFORM
// ============================================
export const revokeApiKey = async (req, res) => {
  try {
    const { platformId } = req.params;
    
    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check authorization
    if (req.user.role !== 'SUPER_ADMIN' && req.user._id.toString() !== platform.adminId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Remove API key
    platform.apiKey = null;
    platform.apiKeyCreatedAt = null;
    await platform.save();

    return successResponse(res, null, 'API key revoked successfully');

  } catch (error) {
    console.error('Revoke API key error:', error);
    return errorResponse(res, error.message, 500);
  }
};
