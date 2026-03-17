import Platform from '../models/platform.model.js';
import { errorResponse } from '../utils/response.js';
import { hashToken } from '../utils/tokenUtils.js';

// Development middleware to handle test API key
export const handleTestApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    // Check if it's the test API key
    if (apiKey === 'test-api-key') {
      const { platformName } = req.body;

      let platform;
      if (platformName) {
        // Find specific platform by name if provided (case-insensitive)
        platform = await Platform.findOne({
          name: { $regex: new RegExp(`^${platformName}$`, 'i') },
          status: 'ACTIVE'
        }).populate('adminId', 'name email');
      }

      if (!platform) {
        // Fallback to first active platform if name not found or not provided
        platform = await Platform.findOne({ status: 'ACTIVE' })
          .populate('adminId', 'name email');
      }

      if (!platform) {
        return errorResponse(res, 'No active platform found for testing', 404);
      }

      // Attach platform to request for testing
      req.platform = platform;
      req.platformId = platform._id;
      req.isTestMode = true;

      console.log(`🧪 [TEST_MODE] Using test API key with platform: ${platform.name}`);
      return next();
    }

    // If not test key, proceed with normal API key verification
    next();
  } catch (error) {
    console.error('Test API key handler error:', error);
    return errorResponse(res, 'API key verification failed', 401);
  }
};

// Enhanced API key verification that handles both test and production keys
export const verifyPlatformApiKeyEnhanced = async (req, res, next) => {
  try {
    // Skip if already handled by test middleware
    if (req.platform && req.isTestMode) {
      return next();
    }

    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return errorResponse(res, 'API key is required', 401);
    }

    if (!apiKey.startsWith('pk_')) {
      return errorResponse(res, 'Invalid API key format', 401);
    }

    const hashedApiKey = hashToken(apiKey);

    // Find platform by hashed API key
    const platform = await Platform.findOne({
      apiKey: hashedApiKey,
      status: 'ACTIVE'
    }).populate('adminId', 'name email');

    if (!platform) {
      return errorResponse(res, 'Invalid or inactive API key', 401);
    }

    // Attach platform to request
    req.platform = platform;
    req.platformId = platform._id;
    req.isTestMode = false;

    console.log(`✅ [PRODUCTION] Valid API key for platform: ${platform.name}`);
    next();
  } catch (error) {
    console.error('API key verification error:', error);
    return errorResponse(res, 'API key verification failed', 401);
  }
};