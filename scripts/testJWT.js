import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config({ path: './.env' });

const secret = process.env.JWT_SECRET;
console.log('=== JWT TEST ===');
console.log(`Secret: ${secret}`);
console.log(`Secret length: ${secret.length}`);

// Create a test token
const payload = { userId: '123', email: 'test@example.com', role: 'USER' };
const token = jwt.sign(payload, secret, { expiresIn: '24h' });
console.log(`\n✅ Token created: ${token.substring(0, 50)}...`);

// Try to verify it
try {
  const decoded = jwt.verify(token, secret);
  console.log(`✅ Token verified successfully`);
  console.log(`Decoded payload:`, decoded);
} catch (error) {
  console.error(`❌ Token verification failed:`, error.message);
}

// Try with a different secret
const wrongSecret = 'wrong_secret_key_min_32_characters_long_here';
try {
  const decoded = jwt.verify(token, wrongSecret);
  console.log(`❌ Token verified with wrong secret (this should not happen)`);
} catch (error) {
  console.log(`✅ Token correctly rejected with wrong secret:`, error.message);
}
