// src/routes/authRoutes.js (MERGED APPROACH)
import express from 'express';
import authController from '../controller/auth.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';


const router = express.Router();

// Public routes
router.post(API.AUTH.LOGIN, authController.login);
router.post(API.AUTH.REFRESH_TOKEN, authController.refreshToken);



// Protected routes
router.get(API.AUTH.ME, verifyJWT, authController.me);
router.post(API.AUTH.LOGOUT, verifyJWT, authController.logout);
router.post(API.AUTH.LOGOUT_ALL, verifyJWT, authController.logoutAll);
router.get(API.AUTH.SESSIONS, verifyJWT, authController.getSessions);
router.post(API.AUTH.REVOKE_SESSION, verifyJWT, authController.revokeSession);
router.post('/change-password', verifyJWT, authController.changePassword);

export default router;