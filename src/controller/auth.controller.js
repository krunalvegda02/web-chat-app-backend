import { User } from '../models/index.model.js';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  saveRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken
} from '../utils/tokenUtils.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { validateEmail, validatePassword, validatePhone } from '../utils/validators.js';
import MESSAGE from '../constants/message.js';





const login = async (req, res, next) => {
  try {
    const { email, password, phone } = req.body;

    if (!email && !phone) {
      return errorResponse(res, 'Email or phone is required', 400);
    }

    if (!password) {
      return errorResponse(res, MESSAGE.EMAIL_PASSWORD_REQUIRED, 400);
    }

    // ✅ Find user by email or phone
    let query = {};
    if (email) {
      query.email = email;
    } else if (phone) {
      validatePhone(phone);
      query.phone = phone.replace(/\D/g, '');
    }

    const user = await User.findOne(query).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return errorResponse(res, MESSAGE.INVALID_CREDENTIALS, 401);
    }

    // ✅ Block direct login for USER role (only admins can login directly)
    if (user.role === 'USER') {
      return errorResponse(res, 'Direct login is disabled for users. Please use the platform integration.', 403);
    }

    if (user.status !== 'ACTIVE') {
      return errorResponse(res, 'Account has been deactivated', 403);
    }

    if (user.status === 'BANNED') {
      return errorResponse(res, MESSAGE.ACCOUNT_BANNED, 403);
    }

    // ✅ Update last login
    user.lastLogin = new Date();
    await user.save();

    // ✅ Generate tokens 
    const tokenContext = user.role === 'PLATFORM_ADMIN' ? user.platformId : null;
    const accessToken = generateAccessToken(user._id, user.email, user.role, tokenContext);
    const refreshToken = await saveRefreshToken(
      user._id,
      req.ip,
      req.headers['user-agent']
    );

    console.log(`✅ [LOGIN] User ${user.email} logged in with role ${user.role}`);

    return successResponse(res, {
      user: user.toJSON(),
      accessToken,
      refreshToken
    });

  } catch (error) {
    next(error);
  }
};



// ===============================
// 5. CHANGE PASSWORD (DIRECT FOR AUTHENTICATED ADMINS)
// ===============================
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user?._id || req.userId;

    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    if (!oldPassword || !newPassword || !confirmPassword) {
      return errorResponse(res, 'All password fields are required', 400);
    }

    if (newPassword !== confirmPassword) {
      return errorResponse(res, 'New passwords do not match', 400);
    }

    validatePassword(newPassword);

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return errorResponse(res, 'Incorrect current password', 400);
    }

    user.password = newPassword;
    await user.save();

    console.log(`✅ [CHANGE_PASSWORD] Password changed successfully for ${user.email}`);

    return successResponse(res, null, 'Password changed successfully');

  } catch (error) {
    next(error);
  }
};


// ===============================
// 6. UPDATE PROFILE
// ===============================
export const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;
    const userId = req.user._id;
    console.log(userId)

    const user = await User.findById(userId);
    console.log("user", user)

    if (!user) {
      return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    }

    // ✅ Update name
    if (name && name.trim().length >= 2) {
      user.name = name.trim();
    }

    // ✅ Update phone with validation
    if (phone) {
      validatePhone(phone);
      const normalizedPhone = phone.replace(/\D/g, '');

      // Check if phone already in use by another user
      if (normalizedPhone !== user.phone) {
        const existingPhoneUser = await User.findOne({ phone: normalizedPhone });
        if (existingPhoneUser) {
          return errorResponse(res, 'Phone number already registered', 400);
        }

        user.phone = normalizedPhone;
        user.phoneVerified = true; // Mark as verified directly
      }
    }

    // ✅ Update avatar
    if (avatar) {
      user.avatar = avatar;
    }

    await user.save();

    console.log(`✅ [UPDATE_PROFILE] User ${user.email} profile updated`);

    return successResponse(res, { user: user.toJSON() }, 'Profile updated successfully');

  } catch (error) {
    next(error);
  }
};

// ===============================
// EXPORT ALL FUNCTIONS
// ===============================
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return errorResponse(res, MESSAGE.REFRESH_TOKEN_REQUIRED, 400);
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse(res, MESSAGE.AUTH_HEADER_REQUIRED, 401);
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const decoded = jwt.decode(accessToken);

    if (!decoded?.userId) {
      return errorResponse(res, MESSAGE.INVALID_TOKEN, 401);
    }

    const isValid = await verifyRefreshToken(refreshToken, decoded.userId);
    if (!isValid) {
      return errorResponse(res, MESSAGE.INVALID_REFRESH_TOKEN, 401);
    }

    const user = await User.findById(decoded.userId);
    if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

    const tokenContext = user.role === 'PLATFORM_ADMIN' ? user.platformId : null;
    const newAccessToken = generateAccessToken(
      user._id, user.email, user.role, tokenContext
    );

    return successResponse(res, { accessToken: newAccessToken });

  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return errorResponse(res, MESSAGE.REFRESH_TOKEN_REQUIRED, 400);
    }

    const userId = req.user?._id || req.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    await revokeRefreshToken(refreshToken, userId);
    return successResponse(res, null, MESSAGE.LOGOUT_SUCCESSFUL);

  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const user = await User.findById(userId);
    if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    return successResponse(res, { user });
  } catch (error) {
    next(error);
  }
};

const logoutAll = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const user = await User.findById(userId);
    if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

    user.revokeAllRefreshTokens();
    await user.save();

    return successResponse(res, null, 'Logged out from all devices');
  } catch (error) {
    next(error);
  }
};

const getSessions = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const user = await User.findById(userId);
    if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

    const sessions = user.getActiveSessions();
    return successResponse(res, { sessions });
  } catch (error) {
    next(error);
  }
};

const revokeSession = async (req, res, next) => {
  try {
    const { userAgent } = req.body;
    if (!userAgent) return errorResponse(res, 'User agent required', 400);

    const userId = req.user?._id || req.userId;
    if (!userId) {
      return errorResponse(res, 'User not authenticated', 401);
    }

    const user = await User.findById(userId);
    if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

    user.revokeSessionByAgent(userAgent);
    await user.save();

    return successResponse(res, null, 'Session revoked');
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  refreshToken,
  logout,
  logoutAll,
  getSessions,
  revokeSession,
  changePassword,
  updateProfile,
  me,
};