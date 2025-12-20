import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const clearCallMessages = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const result = await mongoose.connection.db.collection('messages').deleteMany({ type: 'call' });
    console.log(`🗑️ Deleted ${result.deletedCount} call messages`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

clearCallMessages();
