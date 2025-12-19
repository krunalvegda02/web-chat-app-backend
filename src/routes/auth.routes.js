// src/routes/authRoutes.js (MERGED APPROACH)
import express from 'express';
import authController from '../controller/auth.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';


const router = express.Router();

// Public routes
router.post(API.AUTH.REGISTER, authController.register);
router.post(API.AUTH.LOGIN, authController.login);
router.post(API.AUTH.REFRESH_TOKEN, authController.refreshToken);
router.post(API.AUTH.FORGOT_PASSWORD, authController.forgotPassword);
router.post(API.AUTH.RESET_PASSWORD, authController.resetPassword);


router.post(API.AUTH.REGISTER_WITH_INVITE, authController.registerWithInvite);
router.get(API.AUTH.INVITE_INFO, authController.getInviteInfo);



// Protected routes
router.get(API.AUTH.ME, verifyJWT, authController.me);
router.post(API.AUTH.LOGOUT, verifyJWT, authController.logout);
router.post(API.AUTH.LOGOUT_ALL, verifyJWT, authController.logoutAll);
router.get(API.AUTH.SESSIONS, verifyJWT, authController.getSessions);
router.post(API.AUTH.REVOKE_SESSION, verifyJWT, authController.revokeSession);



export default router;