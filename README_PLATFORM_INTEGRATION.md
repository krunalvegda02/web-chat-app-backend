# Secure Platform Integration System

## Overview

This system provides a secure, scalable API for external platforms to integrate with your chat application. It includes proper authentication, rate limiting, input validation, and comprehensive security measures.

## 🔐 Security Features

- **API Key Authentication**: Unique API keys for each platform
- **Token Hashing**: API keys stored as hashed values in database
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Comprehensive validation of all inputs
- **Platform Isolation**: Users are isolated by platform
- **JWT Security**: Secure token generation with proper expiration
- **CORS Protection**: Configurable CORS policies
- **Request Logging**: Comprehensive logging for security monitoring

## 📁 File Structure

```
Backend/
├── src/
│   ├── controller/
│   │   ├── platform.controller.js           # Original platform controller
│   │   └── platform-integration.controller.js # New secure integration controller
│   ├── middlewares/
│   │   └── platform-auth.middleware.js      # API key authentication middleware
│   ├── routes/
│   │   └── platform-integration.routes.js   # Secure integration routes
│   └── models/
│       └── platform.model.js               # Enhanced platform model
├── scripts/
│   └── setup-integration.js                # Setup script for integration
├── docs/
│   └── PLATFORM_INTEGRATION_API.md         # API documentation
└── public/
    └── test-chat.html                       # Updated test page
```

## 🚀 Quick Start

### 1. Run Setup Script

```bash
cd Backend
node scripts/setup-integration.js
```

This will:
- Create a test platform if needed
- Generate API keys
- Show integration examples

### 2. Test Integration

Open `http://localhost:5500/test-chat.html` to test the integration.

### 3. Production Setup

1. **Generate API Key** for your platform:
```bash
POST /api/v1/platforms/{platformId}/generate-api-key
Authorization: Bearer {admin_jwt_token}
```

2. **Use the secure endpoint**:
```bash
POST /api/v1/platforms/integration/chat-login
X-API-Key: pk_your_api_key_here
```

## 🔧 API Endpoints

### Authentication Endpoints
- `POST /platforms/{platformId}/generate-api-key` - Generate API key (Admin only)

### Integration Endpoints (Require API Key)
- `POST /platforms/integration/chat-login` - Secure user login
- `GET /platforms/integration/users/external/{externalUserId}` - Get user by external ID
- `PUT /platforms/integration/users/{userId}` - Update user
- `GET /platforms/integration/stats` - Get platform statistics
- `POST /platforms/integration/webhook` - Webhook endpoint

## 💡 Key Improvements Over Original

### Security Enhancements
1. **API Key Authentication**: Replaces platform ID-based authentication
2. **Hashed Storage**: API keys stored securely as hashes
3. **Rate Limiting**: Prevents abuse and DoS attacks
4. **Input Validation**: Comprehensive validation of all inputs
5. **Error Handling**: Consistent error responses without information leakage

### Developer Experience
1. **Test Mode**: Special test API key for development
2. **Comprehensive Documentation**: Detailed API docs with examples
3. **Setup Script**: Automated setup for quick start
4. **Integration Examples**: Ready-to-use code examples

### Scalability Features
1. **Platform Isolation**: Users properly isolated by platform
2. **External User ID Support**: Map to your existing user system
3. **Webhook Support**: Real-time updates from your platform
4. **Statistics API**: Monitor usage and performance

## 🔄 Migration from Original API

### Old Endpoint (Legacy)
```javascript
// ❌ Less secure - uses platformId in request body
fetch('/api/v1/platforms/chat-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    platformId: 'platform_id_here',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890'
  })
});
```

### New Endpoint (Secure)
```javascript
// ✅ More secure - uses API key authentication
fetch('/api/v1/platforms/integration/chat-login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'pk_your_secure_api_key_here'
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    externalUserId: 'your_user_id_123'
  })
});
```

## 🛡️ Security Best Practices

### For Platform Owners
1. **Store API keys securely** - Never expose in client-side code
2. **Use HTTPS** - Always use secure connections in production
3. **Rotate API keys** - Regularly generate new API keys
4. **Monitor usage** - Keep track of API usage and unusual patterns
5. **Implement rate limiting** - On your side as well for additional protection

### For Integration
1. **Validate responses** - Always check success status
2. **Handle errors gracefully** - Implement proper error handling
3. **Use webhooks** - For real-time updates instead of polling
4. **Cache user data** - Avoid repeated API calls for same user

## 📊 Monitoring & Analytics

The system provides comprehensive logging and monitoring:

- **Request Logging**: All API requests are logged with timestamps
- **Error Tracking**: Failed requests with error details
- **Usage Statistics**: API usage patterns and trends
- **Security Events**: Authentication failures and suspicious activity

## 🔧 Configuration

### Environment Variables
```env
# Required
MONGODB_URI=mongodb://localhost:27017/webchatapp
JWT_SECRET=your_jwt_secret_here

# Optional
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### Rate Limiting Configuration
```javascript
// Customize in platform-integration.controller.js
export const platformIntegrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // requests per window
  message: { error: 'Too many requests' }
});
```

## 🚨 Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": 400
}
```

Common error codes:
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/missing API key)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## 📞 Support

For technical support:
- Check the API documentation in `/docs/PLATFORM_INTEGRATION_API.md`
- Review the setup script in `/scripts/setup-integration.js`
- Test with the demo page at `/test-chat.html`

## 🎯 Next Steps

1. **Test the integration** using the provided test page
2. **Generate production API keys** for your platforms
3. **Implement the secure endpoints** in your applications
4. **Set up monitoring** for API usage and errors
5. **Configure webhooks** for real-time updates

This secure platform integration system provides enterprise-grade security while maintaining ease of use for developers. It's designed to scale with your platform's growth while keeping user data secure and isolated.