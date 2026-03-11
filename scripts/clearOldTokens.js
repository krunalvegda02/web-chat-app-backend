import dotenv from 'dotenv';
import connectDB from '../src/db/index.js';
import User from '../src/models/user.model.js';

dotenv.config({ path: './.env' });

const clearOldTokens = async () => {
  try {
    console.log('🔄 Connecting to database...');
    await connectDB();
    console.log('✅ Connected to database');

    console.log('🗑️ Clearing all refresh tokens from all users...');
    const result = await User.updateMany(
      {},
      { $set: { refreshTokens: [] } }
    );

    console.log(`✅ Cleared refresh tokens for ${result.modifiedCount} users`);
    console.log('✅ All users will need to re-login with the new JWT secret');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

clearOldTokens();
