import Platform from '../models/platform.model.js';
import User from '../models/user.model.js';
import Room from '../models/room.model.js';
import { successResponse, errorResponse } from '../../src/utils/response.js';
import { generateAccessToken, saveRefreshToken } from '../utils/tokenUtils.js';

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

    await platform.save();

    // Update admin user with platformId
    adminUser.platformId = platform._id;
    await adminUser.save();

    await platform.populate('adminId', 'name email phone');

    return successResponse(res, {
      platform: {
        ...platform.toObject(),
        admin: platform.adminId,
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
// CREATE PLATFORM USER (WhatsApp Test)
// ============================================
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
// PLATFORM CHAT LOGIN - Create/Get User & Generate Token & Create/Get Room
// ⚠️ LEGACY ENDPOINT - Use /api/v1/platforms/integration/chat-login for new integrations
// ============================================
export const platformChatLogin = async (req, res) => {
  try {
    const { platformId, name, email, phone, password } = req.body;

    if (!platformId || !email || !phone) {
      return errorResponse(res, 'Platform ID, email, and phone are required', 400);
    }

    // Check if platform exists
    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
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
    const platformAdmin = await User.findById(platform.adminId);
    
    if (!platformAdmin) {
      return errorResponse(res, 'Platform admin not found', 404);
    }

    // Create room key
    const sortedParticipants = [user._id.toString(), platformAdmin._id.toString()].sort();
    const roomKey = `DIRECT_${sortedParticipants.join('_')}`;

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
        await room.save();
        await room.populate('participants.userId', 'name email avatar role phone');
        console.log(`✅ [PLATFORM_CHAT] Created new room: ${room._id}`);
      } catch (error) {
        if (error.code === 11000) {
          // Room already exists (race condition)
          room = await Room.findOne({ participantKey: roomKey })
            .populate('participants.userId', 'name email avatar role phone')
            .populate('lastMessage');
          console.log(`⚠️ [PLATFORM_CHAT] Room already exists: ${room._id}`);
        } else {
          throw error;
        }
      }
    } else {
      console.log(`✅ [PLATFORM_CHAT] Found existing room: ${room._id}`);
    }

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
