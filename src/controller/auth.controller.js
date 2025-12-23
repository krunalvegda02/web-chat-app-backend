import { User } from '../models/index.model.js';
import Tenant from '../models/tenant.model.js';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  saveRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  generatePhoneVerificationToken,
  generatePasswordResetToken
} from '../utils/tokenUtils.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { validateEmail, validatePassword, validatePhone } from '../utils/validators.js';
import { sendWelcomeEmail, sendPhoneVerificationSMS, sendPasswordResetEmail, sendOTPEmail, sendPasswordChangedEmail } from '../utils/mailer.js';
import MESSAGE from '../constants/message.js';
import { getInviteInfo } from './tenant.controller.js';

// ===============================
// 1. REGISTER - WITH PHONE & CONTACT
// ===============================
const register = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword, phone } = req.body;

    // ✅ Validate required fields
    if (!name || !email || !password) {
      return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);
    }

    // ✅ Validate email format
    validateEmail(email);

    // ✅ Validate password strength
    validatePassword(password);

    // ✅ Validate passwords match
    if (password !== confirmPassword) {
      return errorResponse(res, MESSAGE.PASSWORDS_NOT_MATCH, 400);
    }

    // ✅ Validate and normalize phone if provided
    let normalizedPhone = null;
    if (phone) {
      validatePhone(phone);
      normalizedPhone = phone.replace(/\D/g, ''); // Remove non-digits
      
      // Check if phone already exists
      const existingPhoneUser = await User.findOne({ phone: normalizedPhone });
      if (existingPhoneUser) {
        return errorResponse(res, 'Phone number already registered', 400);
      }
    }

    // ✅ Check email doesn't exist
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, MESSAGE.EMAIL_ALREADY_REGISTERED, 400);
    }

    // ✅ Create user with phone field
    const user = new User({
      name: name.trim(),
      email,
      password,
      phone: normalizedPhone,
      phoneVerified: false,
      role: 'USER',
      status: 'ACTIVE',
      contacts: [],
      blockedUsers: []
    });

    await user.save();

    // ✅ Generate phone verification token if phone provided
    let phoneVerificationToken = null;
    if (normalizedPhone) {
      phoneVerificationToken = generatePhoneVerificationToken();
      user.phoneVerificationToken = phoneVerificationToken;
      await user.save();

      // Send verification SMS
      sendPhoneVerificationSMS(normalizedPhone, phoneVerificationToken).catch(err =>
        console.error('Phone verification SMS failed:', err)
      );
    }

    // ✅ Send welcome email
    sendWelcomeEmail(email, name, 'Chat App').catch(err =>
      console.error('Welcome email failed:', err)
    );

    // ✅ Generate tokens
    const accessToken = generateAccessToken(user._id, user.email, user.role, user.tenantId);
    const refreshToken = await saveRefreshToken(
      user._id,
      req.ip,
      req.headers['user-agent']
    );

    console.log(`✅ [REGISTER] User ${email} registered with${phone ? ' phone' : 'out phone'}`);

    return successResponse(res, {
      user: user.toJSON(),
      accessToken,
      refreshToken,
      phoneVerificationRequired: !!normalizedPhone
    }, MESSAGE.REGISTRATION_SUCCESSFUL, 201);

  } catch (error) {
    next(error);
  }
};

// ===============================
// 2. LOGIN - WITH CONTACT VERIFICATION
// ===============================
const login = async (req, res, next) => {
  try {
    const { email, password, phone } = req.body;

    // ✅ Validate inputs
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

    if (user.status === 'BANNED') {
      return errorResponse(res, MESSAGE.ACCOUNT_BANNED, 403);
    }

    // ✅ Check if phone requires verification
    if (user.phone && !user.phoneVerified && req.query.requirePhoneVerification === 'true') {
      return successResponse(res, {
        requiresPhoneVerification: true,
        userId: user._id,
        phone: user.phone.slice(-4) // Last 4 digits
      }, 'Phone verification required', 202);
    }

    // ✅ Update last login
    user.lastLogin = new Date();
    await user.save();

    // ✅ Generate tokens
    const accessToken = generateAccessToken(user._id, user.email, user.role, user.tenantId);
    const refreshToken = await saveRefreshToken(
      user._id,
      req.ip,
      req.headers['user-agent']
    );

    console.log(`✅ [LOGIN] User ${user.email} logged in`);

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
// 3. SEND PHONE VERIFICATION CODE
// ===============================
export const sendPhoneVerification = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.body.userId;

    if (!userId) {
      return errorResponse(res, 'User ID required', 400);
    }

    const user = await User.findById(userId);

    if (!user) {
      return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    }

    if (!user.phone) {
      return errorResponse(res, 'No phone number registered', 400);
    }

    if (user.phoneVerified) {
      return errorResponse(res, 'Phone already verified', 400);
    }

    // Generate 6-digit verification code
    const verificationCode = generatePhoneVerificationToken();
    user.phoneVerificationToken = verificationCode;
    await user.save();

    // Send SMS
    sendPhoneVerificationSMS(user.phone, verificationCode).catch(err =>
      console.error('Phone verification SMS failed:', err)
    );

    console.log(`✅ [PHONE_VERIFY] Code sent to ${user.phone}`);

    return successResponse(res, null, 'Verification code sent successfully');

  } catch (error) {
    next(error);
  }
};

// ===============================
// 4. VERIFY PHONE NUMBER
// ===============================
export const verifyPhoneNumber = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.body.userId;
    const { code } = req.body;

    if (!userId || !code) {
      return errorResponse(res, 'User ID and verification code required', 400);
    }

    const user = await User.findById(userId);

    if (!user) {
      return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    }

    if (!user.phoneVerificationToken) {
      return errorResponse(res, 'No active phone verification', 400);
    }

    if (user.phoneVerificationToken !== code) {
      return errorResponse(res, 'Invalid verification code', 401);
    }

    user.phoneVerified = true;
    user.phoneVerificationToken = null;
    await user.save();

    console.log(`✅ [PHONE_VERIFIED] User ${user.email} verified phone ${user.phone}`);

    return successResponse(res, { user: user.toJSON() }, 'Phone verified successfully');

  } catch (error) {
    next(error);
  }
};

// ===============================
// 5. FORGOT PASSWORD - SEND OTP
// ===============================
const forgotPassword = async (req, res, next) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return errorResponse(res, 'Email or phone required', 400);
    }

    let query = {};
    if (email) {
      validateEmail(email);
      query.email = email;
    } else {
      validatePhone(phone);
      query.phone = phone.replace(/\D/g, '');
    }

    const user = await User.findOne(query);

    if (!user) {
      return errorResponse(res, 'Account not found', 404);
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.passwordResetToken = otp;
    user.passwordResetExpiry = otpExpiry;
    await user.save();

    // Send OTP
    if (email) {
      await sendOTPEmail(user.email, user.name, otp);
    } else if (user.phone) {
      sendPhoneVerificationSMS(user.phone, otp).catch(err =>
        console.error('OTP SMS failed:', err)
      );
    }

    console.log(`✅ [FORGOT_PASSWORD] OTP sent to ${email || phone}`);

    return successResponse(res, null, 'OTP sent successfully');

  } catch (error) {
    next(error);
  }
};

// ===============================
// 6. VERIFY OTP
// ===============================
const verifyResetOTP = async (req, res, next) => {
  try {
    const { email, phone, otp } = req.body;

    if (!otp) {
      return errorResponse(res, 'OTP is required', 400);
    }

    if (!email && !phone) {
      return errorResponse(res, 'Email or phone required', 400);
    }

    let query = {};
    if (email) {
      query.email = email;
    } else {
      query.phone = phone.replace(/\D/g, '');
    }

    const user = await User.findOne({
      ...query,
      passwordResetToken: otp,
      passwordResetExpiry: { $gt: new Date() }
    });

    if (!user) {
      return errorResponse(res, 'Invalid or expired OTP', 401);
    }

    console.log(`✅ [VERIFY_OTP] OTP verified for ${email || phone}`);

    return successResponse(res, { verified: true }, 'OTP verified successfully');

  } catch (error) {
    next(error);
  }
};

// ===============================
// 7. RESET PASSWORD - WITH OTP
// ===============================
const resetPassword = async (req, res, next) => {
  try {
    const { email, phone, otp, password, confirmPassword } = req.body;

    if (!otp || !password || !confirmPassword) {
      return errorResponse(res, 'OTP and passwords are required', 400);
    }

    if (!email && !phone) {
      return errorResponse(res, 'Email or phone required', 400);
    }

    validatePassword(password);

    if (password !== confirmPassword) {
      return errorResponse(res, MESSAGE.PASSWORDS_NOT_MATCH, 400);
    }

    let query = {};
    if (email) {
      query.email = email;
    } else {
      query.phone = phone.replace(/\D/g, '');
    }

    const user = await User.findOne({
      ...query,
      passwordResetToken: otp,
      passwordResetExpiry: { $gt: new Date() }
    });

    if (!user) {
      return errorResponse(res, 'Invalid or expired OTP', 401);
    }

    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;
    await user.save();

    // Send success email
    if (user.email) {
      sendPasswordChangedEmail(user.email, user.name).catch(err =>
        console.error('Password changed email failed:', err)
      );
    }

    console.log(`✅ [RESET_PASSWORD] Password reset for ${email || phone}`);

    return successResponse(res, null, MESSAGE.PASSWORD_RESET_SUCCESSFUL);

  } catch (error) {
    next(error);
  }
};

// ===============================
// 8. REGISTER WITH INVITE - WITH CONTACT
// ===============================
export const registerWithInvite = async (req, res, next) => {
  try {
    const { token, tenantId, name, password, confirmPassword, phone } = req.body;

    // ✅ Validate all inputs
    if (!token || !tenantId || !name || !password || !confirmPassword) {
      return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);
    }

    if (password !== confirmPassword) {
      return errorResponse(res, MESSAGE.PASSWORDS_NOT_MATCH, 400);
    }

    validatePassword(password);

    if (name.trim().length < 2) {
      return errorResponse(res, 'Name must be at least 2 characters', 400);
    }

    // ✅ Check tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    // ✅ Validate invite token
    const inviteToken = tenant.inviteToken;
    if (!inviteToken) {
      return errorResponse(res, 'No active invite found', 400);
    }

    if (inviteToken.token !== token) {
      return errorResponse(res, 'Invalid invite token', 401);
    }

    if (inviteToken.acceptedAt) {
      return errorResponse(res, 'This invite was already accepted', 400);
    }

    if (new Date() > new Date(inviteToken.expiresAt)) {
      return errorResponse(res, 'Invite link has expired', 401);
    }

    // ✅ Validate and normalize phone (use from invite or request)
    let normalizedPhone = null;
    const phoneToUse = phone || inviteToken.invitedPhone;
    console.log('📞 [REGISTER] Phone from request:', phone);
    console.log('📞 [REGISTER] Phone from invite token:', inviteToken.invitedPhone);
    console.log('📞 [REGISTER] Phone to use:', phoneToUse);
    
    if (phoneToUse) {
      validatePhone(phoneToUse);
      normalizedPhone = phoneToUse.replace(/\D/g, '');
      console.log('📞 [REGISTER] Normalized phone:', normalizedPhone);
      
      const existingPhoneUser = await User.findOne({ phone: normalizedPhone });
      if (existingPhoneUser) {
        return errorResponse(res, 'Phone number already registered', 400);
      }
    } else {
      console.log('⚠️ [REGISTER] No phone provided in request or invite token');
    }

    // ✅ Check email not already registered
    const existingUser = await User.findOne({ email: inviteToken.invitedEmail });
    if (existingUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // ✅ Create user with phone and contact fields
    const user = new User({
      name: name.trim(),
      email: inviteToken.invitedEmail,
      password,
      phone: normalizedPhone,
      phoneVerified: false,
      role: 'USER',
      tenantId,
      status: 'ACTIVE',
      contacts: [],
      blockedUsers: []
    });

    await user.save();

    // ✅ Send phone verification SMS if phone provided
    if (normalizedPhone) {
      const phoneVerificationToken = generatePhoneVerificationToken();
      user.phoneVerificationToken = phoneVerificationToken;
      await user.save();

      sendPhoneVerificationSMS(normalizedPhone, phoneVerificationToken).catch(err =>
        console.error('Phone verification SMS failed:', err)
      );
    }

    // ✅ Update tenant - mark invite as accepted
    tenant.inviteToken = {
      ...tenant.inviteToken,
      acceptedAt: new Date(),
      acceptedBy: user._id
    };

    if (!tenant.members) tenant.members = [];
    tenant.members.push(user._id);

    // Update invite history
    if (tenant.inviteHistory && tenant.inviteHistory.length > 0) {
      const lastInvite = tenant.inviteHistory[tenant.inviteHistory.length - 1];
      if (lastInvite.email === inviteToken.invitedEmail) {
        lastInvite.status = 'ACCEPTED';
        lastInvite.acceptedAt = new Date();
      }
    }

    await tenant.save();

    // ✅ Generate tokens (auto-login)
    const accessToken = generateAccessToken(user._id, user.email, user.role, user.tenantId);
    const refreshToken = await saveRefreshToken(
      user._id,
      req.ip,
      req.headers['user-agent']
    );

    console.log(`✅ [INVITE_ACCEPTED] User ${user.email} joined tenant ${tenantId}${normalizedPhone ? ' with phone' : ''}`);

    return successResponse(res, {
      user: user.toJSON(),
      accessToken,
      refreshToken,
      tenantId,
      phoneVerificationRequired: !!normalizedPhone
    }, 'Welcome! Registration successful! 🎉', 201);

  } catch (error) {
    next(error);
  }
};

// ===============================
// 9. UPDATE PROFILE - WITH PHONE
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
        user.phoneVerified = false; // Require re-verification
        
        // Send new verification code
        const phoneVerificationToken = generatePhoneVerificationToken();
        user.phoneVerificationToken = phoneVerificationToken;
        sendPhoneVerificationSMS(normalizedPhone, phoneVerificationToken).catch(err =>
          console.error('Phone verification SMS failed:', err)
        );
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

    const newAccessToken = generateAccessToken(
      user._id, user.email, user.role, user.tenantId
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

    await revokeRefreshToken(refreshToken, req.userId);
    return successResponse(res, null, MESSAGE.LOGOUT_SUCCESSFUL);

  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).populate('tenantId');
    if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    return successResponse(res, { user });
  } catch (error) {
    next(error);
  }
};

const logoutAll = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
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
    const user = await User.findById(req.userId);
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

    const user = await User.findById(req.userId);
    if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

    user.revokeSessionByAgent(userAgent);
    await user.save();

    return successResponse(res, null, 'Session revoked');
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  getSessions,
  revokeSession,
  sendPhoneVerification,
  verifyPhoneNumber,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  registerWithInvite,
  updateProfile,
  me,
  getInviteInfo,
};