import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config({ path: './.env' });

const secret = process.env.JWT_SECRET;

console.log('=== TOKEN GENERATION AND VERIFICATION TEST ===\n');
console.log(`Secret: ${secret}`);
console.log(`Secret length: ${secret.length}\n`);

// Create a test token
const payload = { userId: 'test123', email: 'test@example.com', role: 'USER', tenantId: 'platform123' };
console.log('Creating token with payload:', payload);

const token = jwt.sign(payload, secret, { expiresIn: '24h' });
console.log(`\n✅ Token created: ${token.substring(0, 50)}...\n`);

// Verify the token
try {
  const decoded = jwt.verify(token, secret);
  console.log(`✅ Token verified successfully!`);
  console.log(`Decoded payload:`, decoded);
} catch (error) {
  console.error(`❌ Token verification failed:`, error.message);
}

// Now test with the exact same token that would be sent via socket
console.log('\n=== SIMULATING SOCKET TRANSMISSION ===\n');

// Simulate what happens when token is sent via socket
const socketToken = token; // This is what gets sent
console.log(`Socket token: ${socketToken.substring(0, 50)}...\n`);

try {
  const decoded = jwt.verify(socketToken, secret);
  console.log(`✅ Socket token verified successfully!`);
  console.log(`Decoded payload:`, decoded);
} catch (error) {
  console.error(`❌ Socket token verification failed:`, error.message);
}
