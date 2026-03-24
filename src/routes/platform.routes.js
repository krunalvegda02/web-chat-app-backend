import express from 'express';
import {
  createPlatform,
  getAllPlatforms,
  getPublicPlatforms,
  getPlatformById,
  updatePlatform,
  togglePlatformStatus,
  deletePlatform,
  getPlatformUsers,
  getUserById,
  updateUserStatus,
  fixPlatformAdmins,
  createPlatformUser,
  platformChatLogin,
  debugJwtSecret,
  verifyTokenDebug,
  getPlatformTheme,
  updatePlatformTheme,
  generateApiKey,
  getApiKey,
  revokeApiKey,
} from '../controller/platform.controller.js';
import {verifyJWT as authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = express.Router();

// Handle OPTIONS requests for all routes
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, Cache-Control, Pragma');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Debug endpoints — Super Admin only
router.get('/debug/jwt-secret', authenticate, requireRole(['SUPER_ADMIN']), debugJwtSecret);
router.post('/debug/verify-token', authenticate, requireRole(['SUPER_ADMIN']), verifyTokenDebug);

// Public endpoints (no authentication required)
router.get('/public/list', getPublicPlatforms);
// /create-user requires a valid API key — handled inside the controller
router.post('/create-user', platformChatLogin); // reuses API key validation
router.post('/chat-login', platformChatLogin);

// Migration endpoint (one-time fix)
router.post('/fix/admins', authenticate, requireRole(['SUPER_ADMIN']), fixPlatformAdmins);

// Platform management (Super Admin only)
router.post('/', authenticate, requireRole(['SUPER_ADMIN']), createPlatform);
router.get('/', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getAllPlatforms);
router.get('/:platformId', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getPlatformById);
router.put('/:platformId', authenticate, requireRole(['SUPER_ADMIN']), updatePlatform);
router.patch('/:platformId/toggle-status', authenticate, requireRole(['SUPER_ADMIN']), togglePlatformStatus);
router.delete('/:platformId', authenticate, requireRole(['SUPER_ADMIN']), deletePlatform);

// User management (Platform Admin can manage their own users)
router.get('/:platformId/users', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getPlatformUsers);
router.get('/users/:userId', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getUserById);
router.patch('/users/:userId/status', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), updateUserStatus);

// Platform theme management
router.get('/:platformId/theme', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getPlatformTheme);
router.put('/:platformId/theme', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), updatePlatformTheme);

// API Key management
router.post('/:platformId/api-key/generate', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), generateApiKey);
router.get('/:platformId/api-key', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getApiKey);
router.delete('/:platformId/api-key', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), revokeApiKey);

// ============================================
// PLATFORM INTEGRATION ROUTES (Secure API)
// ============================================

// Handle OPTIONS requests for all integration routes
router.options('/integration/*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, Cache-Control, Pragma');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Secure chat login endpoint - use existing platformChatLogin
router.post('/integration/chat-login', platformChatLogin);

export default router;
