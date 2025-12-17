import User from "../models/user.model.js";
import { successResponse, errorResponse } from "../utils/response.js";
import MESSAGE from "../constants/message.js";

/* ============================================
   UPDATE USER PROFILE
============================================ */
const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);
    }

    if (name) user.name = name;
    if (avatar) user.avatar = avatar;

    user.updatedAt = new Date();
    await user.save();

    return successResponse(res, { user }, MESSAGE.PROFILE_UPDATED);
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
  updateProfile,
  getNotifications,
  markNotificationAsRead,
};
