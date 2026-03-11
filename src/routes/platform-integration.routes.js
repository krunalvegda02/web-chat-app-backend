import express from 'express';
import {
  generatePlatformApiKey,
  platformIntegrationRateLimit,
  securePlatformChatLogin,
  getPlatformUserByExternalId,
  updatePlatformUser,
  getPlatformStats,
  handlePlatformWebhook
} from '../controller/platform-integration.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { handleTestApiKey, verifyPlatformApiKeyEnhanced } from '../middlewares/platform-auth.middleware.js';

const router = express.Router();

// ============================================
// PLATFORM ADMIN ROUTES (Require Authentication)
// ============================================

// Generate API key for platform (Platform Admin only)
router.post('/:platformId/generate-api-key', 
  authenticateToken, 
  generatePlatformApiKey
);

// ============================================
// EXTERNAL PLATFORM INTEGRATION ROUTES (Require API Key)
// ============================================

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