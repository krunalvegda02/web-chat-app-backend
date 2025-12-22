import User from "../models/user.model.js";
import { successResponse, errorResponse } from "../utils/response.js";
import MESSAGE from "../constants/message.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

/* ============================================
   GET USER BY ID
============================================ */
const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password -refreshTokens');
    if (!user) {
      return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    }

    // TODO: Check if user is in contacts, favorites, blocked
    const isContact = false;
    const isFavorite = false;
    const isBlocked = false;

    return successResponse(res, { user, isContact, isFavorite, isBlocked });
  } catch (error) {
    next(error);
  }
};

/* ============================================
   UPDATE USER PROFILE
============================================ */
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, bio } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    }

    // Update basic fields
    if (name) user.name = name.trim();
    if (phone) user.phone = phone.trim();
    if (bio !== undefined) user.bio = bio.trim();

    // Handle avatar upload if file is provided
    if (req.file) {
      try {
        // Delete old avatar from Cloudinary if exists
        if (user.avatar && user.avatar.includes('cloudinary.com')) {
          console.log('🗑️ Deleting old avatar:', user.avatar);
          await deleteFromCloudinary(user.avatar);
        }

        // Upload new avatar to Cloudinary
        console.log('📤 Uploading new avatar:', req.file.path);
        const uploadResult = await uploadOnCloudinary(req.file.path, {
          folder: 'avatars',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        });

        user.avatar = uploadResult.secure_url;
        console.log('✅ Avatar uploaded successfully:', user.avatar);
      } catch (uploadError) {
        console.error('❌ Avatar upload failed:', uploadError);
        return errorResponse(res, 'Failed to upload avatar', 500);
      }
    }

    user.updatedAt = new Date();
    await user.save();

    // Remove sensitive data before sending response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshTokens;

    return successResponse(res, { user: userResponse }, MESSAGE.PROFILE_UPDATED);
  } catch (error) {
    next(error);
  }
};

/* ============================================
   GET NOTIFICATIONS (Placeholder)
============================================ */
const getNotifications = async (req, res, next) => {
  try {
    // To be implemented later
    return successResponse(res, { notifications: [] });
  } catch (error) {
    next(error);
  }
};

/* ============================================
   MARK NOTIFICATION AS READ (Placeholder)
============================================ */
const markNotificationAsRead = async (req, res, next) => {
  try {
    // To be implemented later
    return successResponse(res, null, MESSAGE.NOTIFICATION_MARKED_READ);
  } catch (error) {
    next(error);
  }
};

/* ============================================
   DEFAULT EXPORT (Optional, for grouped import)
============================================ */
export default {
  getUserById,
  updateProfile,
  getNotifications,
  markNotificationAsRead,
};
