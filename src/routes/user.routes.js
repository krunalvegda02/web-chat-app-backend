import express from "express";
import userController from "../controller/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { API } from "../constants/endpoints.js";

const router = express.Router();

router.put(API.USER.PROFILE, verifyJWT, userController.updateProfile);
router.get(API.USER.NOTIFICATIONS, verifyJWT, userController.getNotifications);
router.put(API.USER.NOTIFICATION_BY_ID, verifyJWT, userController.markNotificationAsRead);

export default router;
