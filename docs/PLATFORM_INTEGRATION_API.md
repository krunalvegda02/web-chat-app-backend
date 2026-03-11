# Secure Platform Integration API

This document describes the secure API endpoints for integrating external platforms with our chat system.

## Overview

The Platform Integration API provides secure endpoints for external platforms to:
- Authenticate users and create chat sessions
- Manage user data
- Receive webhooks for real-time updates
- Access platform statistics

## Security Features

- **API Key Authentication**: Each platform gets a unique API key
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Comprehensive validation of all inputs
- **Token Hashing**: API keys are stored as hashed values
- **Platform Isolation**: Users are isolated by platform
- **Secure Token Generation**: JWT tokens with proper expiration

## Getting Started

### 1. Generate API Key

First, generate an API key for your platform:

```bash
POST /api/v1/platforms/{platformId}/generate-api-key
Authorization: Bearer {admin_jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "apiKey": "pk_a1b2c3d4e5f6...",
    "platformId": "64f1a2b3c4d5e6f7g8h9i0j1",
    "message": "Store this API key securely. It will not be shown again."
  }
}
```

⚠️ **Important**: Store the API key securely. It cannot be retrieved again.

### 2. Use API Key for Integration

Include the API key in all integration requests:

```bash
# Option 1: X-API-Key header (recommended)
X-API-Key: pk_a1b2c3d4e5f6...

# Option 2: Authorization header
Authorization: Bearer pk_a1b2c3d4e5f6...
```

## API Endpoints

### Chat Login

Create or authenticate a user and establish a chat session.

```bash
POST /api/v1/platforms/integration/chat-login
X-API-Key: pk_your_api_key_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "optional_password",
  "externalUserId": "your_user_id_123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "1234567890",
      "role": "USER",
      "status": "ACTIVE",
      "externalUserId": "your_user_id_123"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "a1b2c3d4e5f6g7h8i9j0...",
    "isNewUser": true,
    "room": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j2",
      "name": "Chat - John Doe & Platform Admin",
      "type": "DIRECT",
      "participants": [...],
      "lastMessage": null,
      "lastMessageTime": "2024-01-15T10:30:00.000Z"
    },
    "platform": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
      "name": "Your Platform",
      "theme": {...}
    },
    "redirectUrl": "/user/chats/64f1a2b3c4d5e6f7g8h9i0j2"
  },
  "message": "Login successful"
}
```

## Example Integration

```javascript
// Frontend integration example
async function initiateChatLogin(userData) {
  try {
    const response = await fetch('/api/v1/platforms/integration/chat-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'pk_your_api_key_here'
      },
      body: JSON.stringify({
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        externalUserId: userData.id
      })
    });

    const result = await response.json();
    
    if (result.success) {
      // Store auth tokens
      localStorage.setItem('authToken', result.data.accessToken);
      localStorage.setItem('refreshToken', result.data.refreshToken);
      
      // Redirect to chat
      window.location.href = `https://your-chat-domain.com${result.data.redirectUrl}`;
    } else {
      console.error('Login failed:', result.error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}
```