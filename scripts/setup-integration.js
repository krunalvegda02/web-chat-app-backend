#!/usr/bin/env node

/**
 * Platform Integration Setup Script
 * 
 * This script helps set up secure platform integration by:
 * 1. Creating a platform if needed
 * 2. Generating API keys
 * 3. Providing integration examples
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Platform from '../src/models/platform.model.js';
import User from '../src/models/user.model.js';
import { hashToken } from '../src/utils/tokenUtils.js';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/webchatapp';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function createTestPlatform() {
  try {
    // Check if test platform already exists
    let platform = await Platform.findOne({ slug: 'test-platform' });
    
    if (platform) {
      console.log('✅ Test platform already exists:', platform.name);
      return platform;
    }

    // Create admin user for test platform
    const adminUser = new User({
      name: 'Test Platform Admin',
      email: 'admin@testplatform.com',
      password: 'Admin@123',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    });

    await adminUser.save();
    console.log('✅ Created test platform admin user');

    // Create test platform
    platform = new Platform({
      name: 'Test Platform',
      slug: 'test-platform',
      adminId: adminUser._id,
      description: 'Test platform for integration testing',
      status: 'ACTIVE',
      theme: {
        appName: 'Test Platform Chat',
        primaryColor: '#008069',
        secondaryColor: '#F0F2F5',
        accentColor: '#25D366',
      },
    });

    await platform.save();

    // Update admin user with platformId
    adminUser.platformId = platform._id;
    await adminUser.save();

    console.log('✅ Created test platform:', platform.name);
    return platform;

  } catch (error) {
    console.error('❌ Error creating test platform:', error);
    throw error;
  }
}

async function generateApiKey(platform) {
  try {
    // Generate secure API key
    const apiKey = `pk_${crypto.randomBytes(32).toString('hex')}`;
    const hashedApiKey = hashToken(apiKey);

    // Update platform with hashed API key
    platform.apiKey = hashedApiKey;
    await platform.save();

    console.log('✅ Generated API key for platform:', platform.name);
    console.log('🔑 API Key:', apiKey);
    console.log('⚠️  Store this API key securely. It will not be shown again.');

    return apiKey;

  } catch (error) {
    console.error('❌ Error generating API key:', error);
    throw error;
  }
}

function printIntegrationExample(apiKey, platformId) {
  console.log('\n📋 Integration Example:');
  console.log('='.repeat(50));
  
  console.log('\n1. Frontend JavaScript:');
  console.log(`
async function initiateChatLogin(userData) {
  try {
    const response = await fetch('/api/v1/platforms/integration/chat-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': '${apiKey}'
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
      window.location.href = \`https://your-chat-domain.com\${result.data.redirectUrl}\`;
    } else {
      console.error('Login failed:', result.error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}
`);

  console.log('\n2. cURL Example:');
  console.log(`
curl -X POST http://localhost:5500/api/v1/platforms/integration/chat-login \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "externalUserId": "user_123"
  }'
`);

  console.log('\n3. Test the integration:');
  console.log('   - Open: http://localhost:5500/test-chat.html');
  console.log('   - The test page will use the secure API automatically');
  
  console.log('\n📚 Documentation:');
  console.log('   - API Docs: /Backend/docs/PLATFORM_INTEGRATION_API.md');
  console.log('   - Platform ID:', platformId);
}

async function main() {
  console.log('🚀 Platform Integration Setup');
  console.log('='.repeat(50));

  try {
    await connectDB();

    // Create test platform
    const platform = await createTestPlatform();

    // Generate API key if not exists
    let apiKey;
    if (!platform.apiKey) {
      apiKey = await generateApiKey(platform);
    } else {
      console.log('✅ Platform already has an API key');
      console.log('ℹ️  Use the existing API key or regenerate a new one');
      apiKey = '[EXISTING_API_KEY]';
    }

    // Print integration examples
    printIntegrationExample(apiKey, platform._id);

    console.log('\n✅ Setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the setup
main().catch(console.error);