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
} from '../controller/platform.controller.js';
import {
  generatePlatformApiKey,
  platformIntegrationRateLimit,
  securePlatformChatLogin,
  getPlatformUserByExternalId,
  updatePlatformUser,
  getPlatformStats,
  handlePlatformWebhook
} from '../controller/platform-integration.controller.js';
import { handleTestApiKey, verifyPlatformApiKeyEnhanced } from '../middlewares/platform-auth.middleware.js';
import {verifyJWT as authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = express.Router();

// Debug endpoints
router.get('/debug/jwt-secret', debugJwtSecret);
router.post('/debug/verify-token', verifyTokenDebug);

// Public endpoints (no authentication required)
router.get('/public/list', getPublicPlatforms);
router.post('/create-user', createPlatformUser);
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

// ============================================
// PLATFORM INTEGRATION ROUTES (Secure API)
// ============================================

// Generate API key for platform (Platform Admin only)
router.post('/:platformId/generate-api-key', 
  authenticate, 
  generatePlatformApiKey
);

// Apply rate limiting to all integration routes
router.use('/integration', platformIntegrationRateLimit);

// Secure chat login endpoint
router.post('/integration/chat-login', 
  handleTestApiKey,
  verifyPlatformApiKeyEnhanced,
  securePlatformChatLogin
);

// Get user by external ID
router.get('/integration/users/external/:externalUserId',
  handleTestApiKey,
  verifyPlatformApiKeyEnhanced,
  getPlatformUserByExternalId
);

// Update platform user
router.put('/integration/users/:userId',
  handleTestApiKey,
  verifyPlatformApiKeyEnhanced,
  updatePlatformUser
);

// Get platform statistics
router.get('/integration/stats',
  handleTestApiKey,
  verifyPlatformApiKeyEnhanced,
  getPlatformStats
);

// Webhook endpoint for external platforms
router.post('/integration/webhook',
  handleTestApiKey,
  verifyPlatformApiKeyEnhanced,
  handlePlatformWebhook
);

export default router;
