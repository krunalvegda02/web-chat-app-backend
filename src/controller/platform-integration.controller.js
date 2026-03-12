import Platform from '../models/platform.model.js';
import User from '../models/user.model.js';
import Room from '../models/room.model.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { generateAccessToken, saveRefreshToken, hashToken } from '../utils/tokenUtils.js';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

// Rate limiting for platform integration endpoints
export const platformIntegrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================
// GENERATE API KEY FOR PLATFORM
// ============================================
export const generatePlatformApiKey = async (req, res) => {
  try {
    const { platformId } = req.params;

    // Verify platform exists and user has access
    const platform = await Platform.findById(platformId);
    if (!platform) {
      return errorResponse(res, 'Platform not found', 404);
    }

    // Check authorization
    if (req.user.role !== 'SUPER_ADMIN' && req.user._id.toString() !== platform.adminId.toString()) {
      return errorResponse(res, 'Unauthorized', 403);
    }

    // Generate secure API key
    const apiKey = `pk_${crypto.randomBytes(32).toString('hex')}`;
    const hashedApiKey = hashToken(apiKey);

    // Update platform with hashed API key
    platform.apiKey = hashedApiKey;
    platform.updatedAt = new Date();
    await platform.save();

    console.log(`✅ [API_KEY] Generated API key for platform ${platform.name}`);

    return successResponse(res, {
      apiKey, // Return plain key only once
      platformId: platform._id,
      message: 'Store this API key securely. It will not be shown again.'
    }, 'API key generated successfully', 201);

  } catch (error) {
    console.error('Generate API key error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// MIDDLEWARE: VERIFY PLATFORM API KEY
// ============================================
export const verifyPlatformApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return errorResponse(res, 'API key is required', 401);
    }

    if (!apiKey.startsWith('pk_')) {
      return errorResponse(res, 'Invalid API key format', 401);
    }

    const hashedApiKey = hashToken(apiKey);

    // Find platform by hashed API key
    const platform = await Platform.findOne({
      apiKey: hashedApiKey,
      status: 'ACTIVE'
    }).populate('adminId', 'name email');

    if (!platform) {
      return errorResponse(res, 'Invalid or inactive API key', 401);
    }

    // Attach platform to request
    req.platform = platform;
    req.platformId = platform._id;

    next();
  } catch (error) {
    console.error('API key verification error:', error);
    return errorResponse(res, 'API key verification failed', 401);
  }
};

// ============================================
// SECURE PLATFORM CHAT LOGIN
// ============================================
export const securePlatformChatLogin = async (req, res) => {
  try {
    const { name, email, phone, password, externalUserId } = req.body;
    const platform = req.platform; // From middleware

    // Validate required fields
    if (!email || !phone) {
      return errorResponse(res, 'Email and phone are required', 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 'Invalid email format', 400);
    }

    // Validate phone format (basic)
    const normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.length < 10) {
      return errorResponse(res, 'Invalid phone number', 400);
    }

    let user = null;
    let isNewUser = false;

    // Check if user exists by email or phone within this platform
    user = await User.findOne({
      $or: [
        { email, platformId: platform._id },
        { phone: normalizedPhone, platformId: platform._id }
      ]
    });

    // If user doesn't exist, create new user
    if (!user) {
      if (!name) {
        return errorResponse(res, 'Name is required for new user', 400);
      }

      // Check for duplicate email/phone across all platforms
      const duplicateEmail = await User.findOne({ email });
      const duplicatePhone = await User.findOne({ phone: normalizedPhone });

      if (duplicateEmail && duplicateEmail.platformId.toString() !== platform._id.toString()) {
        return errorResponse(res, 'Email already registered on another platform', 400);
      }

      if (duplicatePhone && duplicatePhone.platformId.toString() !== platform._id.toString()) {
        return errorResponse(res, 'Phone already registered on another platform', 400);
      }

      user = new User({
        name: name.trim(),
        email,
        phone: normalizedPhone,
        password: password || 'TempPassword@123',
        role: 'USER',
        platformId: platform._id,
        status: 'ACTIVE',
        phoneVerified: false,
        externalUserId: externalUserId || null,
        contacts: [],
        blockedUsers: [],
      });

      await user.save();
      isNewUser = true;
      console.log(`✅ [SECURE_LOGIN] Created user ${email} for platform ${platform.name}`);
    } else {
      console.log(`✅ [SECURE_LOGIN] Found existing user ${email} for platform ${platform.name}`);

      // Update external user ID if provided
      if (externalUserId && user.externalUserId !== externalUserId) {
        user.externalUserId = externalUserId;
        await user.save();
      }

      // Clear old refresh tokens for security
      user.refreshTokens = [];
      await user.save();
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user._id, user.email, user.role, user.platformId);
    const refreshToken = await saveRefreshToken(
      user._id,
      req.ip || '0.0.0.0',
      req.headers['user-agent'] || 'platform-integration'
    );

    // Get or create room with platform admin
    const platformAdmin = await User.findById(platform.adminId);
    if (!platformAdmin) {
      return errorResponse(res, 'Platform admin not found', 404);
    }

    // Create room key with platform scaling (Matches Room model pre-save hook)
    const sortedParticipants = [user._id.toString(), platformAdmin._id.toString()].sort();
    const roomKey = `DIRECT_PLATFORM_${platform._id}_${sortedParticipants.join('_')}`;

    // Check if room exists
    let room = await Room.findOne({ participantKey: roomKey })
      .populate('participants.userId', 'name email avatar role phone')
      .populate('lastMessage');

    // Create room if it doesn't exist
    if (!room) {
      room = new Room({
        name: `Chat - ${user.name} & ${platformAdmin.name}`,
        type: 'DIRECT',
        platformId: platform._id,
        createdVia: 'platform-integration',
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
        console.log(`✅ [SECURE_LOGIN] Created room: ${room._id}`);
      } catch (error) {
        if (error.code === 11000) {
          // Handle race condition
          room = await Room.findOne({ participantKey: roomKey })
            .populate('participants.userId', 'name email avatar role phone')
            .populate('lastMessage');
        } else {
          throw error;
        }
      }
    }

    // Return secure response
    return successResponse(res, {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        avatar: user.avatar,
        externalUserId: user.externalUserId
      },
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
      platform: {
        _id: platform._id,
        name: platform.name,
        theme: platform.theme
      },
      redirectUrl: `/user/chats/${room._id}`,
    }, 'Login successful', 200);

  } catch (error) {
    console.error('Secure platform login error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET PLATFORM USER BY EXTERNAL ID
// ============================================
export const getPlatformUserByExternalId = async (req, res) => {
  try {
    const { externalUserId } = req.params;
    const platform = req.platform;

    const user = await User.findOne({
      externalUserId,
      platformId: platform._id
    }).select('-password -refreshTokens');

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, { user });
  } catch (error) {
    console.error('Get user by external ID error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// UPDATE PLATFORM USER
// ============================================
export const updatePlatformUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, phone, avatar, status } = req.body;
    const platform = req.platform;

    const user = await User.findOne({
      _id: userId,
      platformId: platform._id
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Update allowed fields
    if (name) user.name = name.trim();
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10) {
        user.phone = normalizedPhone;
      }
    }
    if (avatar) user.avatar = avatar;
    if (status && ['ACTIVE', 'INACTIVE'].includes(status)) {
      user.status = status;
    }

    user.updatedAt = new Date();
    await user.save();

    return successResponse(res, {
      user: user.toJSON()
    }, 'User updated successfully');

  } catch (error) {
    console.error('Update platform user error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// GET PLATFORM STATS
// ============================================
export const getPlatformStats = async (req, res) => {
  try {
    const platform = req.platform;

    const [totalUsers, activeUsers, totalRooms, activeRooms] = await Promise.all([
      User.countDocuments({ platformId: platform._id, role: 'USER' }),
      User.countDocuments({ platformId: platform._id, role: 'USER', status: 'ACTIVE' }),
      Room.countDocuments({ platformId: platform._id }),
      Room.countDocuments({
        platformId: platform._id,
        lastMessageTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Active in last 30 days
      })
    ]);

    return successResponse(res, {
      platform: {
        _id: platform._id,
        name: platform.name,
        status: platform.status
      },
      stats: {
        totalUsers,
        activeUsers,
        totalRooms,
        activeRooms,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    console.error('Get platform stats error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// ============================================
// WEBHOOK ENDPOINT FOR EXTERNAL PLATFORMS
// ============================================
export const handlePlatformWebhook = async (req, res) => {
  try {
    const platform = req.platform;
    const { event, data } = req.body;

    console.log(`📥 [WEBHOOK] Received ${event} for platform ${platform.name}:`, data);

    // Handle different webhook events
    switch (event) {
      case 'user.created':
      case 'user.updated':
        // Handle user events from external platform
        if (data.externalUserId && data.email) {
          const user = await User.findOne({
            externalUserId: data.externalUserId,
            platformId: platform._id
          });

          if (user) {
            // Update existing user
            if (data.name) user.name = data.name;
            if (data.phone) user.phone = data.phone.replace(/\D/g, '');
            if (data.avatar) user.avatar = data.avatar;
            await user.save();
          }
        }
        break;

      case 'user.deleted':
        if (data.externalUserId) {
          await User.findOneAndUpdate(
            { externalUserId: data.externalUserId, platformId: platform._id },
            { status: 'INACTIVE' }
          );
        }
        break;

      default:
        console.log(`⚠️ [WEBHOOK] Unhandled event: ${event}`);
    }

    return successResponse(res, { received: true }, 'Webhook processed');

  } catch (error) {
    console.error('Webhook processing error:', error);
    return errorResponse(res, error.message, 500);
  }
};