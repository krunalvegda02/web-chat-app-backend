import dotenv from 'dotenv';
import connectDB from '../src/db/index.js';
import User from '../src/models/user.model.js';

dotenv.config({ path: './.env' });

const resetAllTokens = async () => {
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
    
    console.log('\n📋 Current JWT_SECRET:');
    console.log(`Value: ${process.env.JWT_SECRET}`);
    console.log(`Length: ${process.env.JWT_SECRET.length}`);
    
    console.log('\n✅ All tokens have been reset. Users will need to log in again.');
    console.log('✅ New tokens will be created with the current JWT_SECRET.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

resetAllTokens();
