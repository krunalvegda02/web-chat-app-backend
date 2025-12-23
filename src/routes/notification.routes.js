import express from 'express';
import { registerFCMToken, unregisterFCMToken, getNotificationStats } from '../controller/notification.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/register-token', verifyJWT, registerFCMToken);
router.post('/unregister-token', verifyJWT, unregisterFCMToken);

// ✅ Get notification stats
router.get('/stats', verifyJWT, getNotificationStats);
export default router;
