import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function fixPhoneIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Drop the existing phone index
    try {
      await usersCollection.dropIndex('phone_1');
      console.log('✅ Dropped old phone_1 index');
    } catch (error) {
      console.log('ℹ️ phone_1 index does not exist or already dropped');
    }

    // Create new sparse unique index
    await usersCollection.createIndex(
      { phone: 1 },
      { unique: true, sparse: true }
    );
    console.log('✅ Created new sparse unique index on phone');

    console.log('✅ Phone index fixed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing phone index:', error);
    process.exit(1);
  }
}

fixPhoneIndex();
