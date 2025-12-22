import express from "express";
import userController from "../controller/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { API } from "../constants/endpoints.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = express.Router();

router.get(API.USER.BY_ID, verifyJWT, userController.getUserById);
router.put(API.USER.PROFILE, verifyJWT, upload.single('avatar'), userController.updateProfile);
router.get(API.USER.NOTIFICATIONS, verifyJWT, userController.getNotifications);
router.put(API.USER.NOTIFICATION_BY_ID, verifyJWT, userController.markNotificationAsRead);

export default router;
