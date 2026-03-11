import mongoose from 'mongoose';
import Room from '../models/room.model.js';
import 'dotenv/config';

const testDuplicatePrevention = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/webchat');
    console.log('📦 Connected to MongoDB\n');

    // Test user IDs (use existing ones from your DB)
    const user1 = '69490410f6a8b67259972216';
    const user2 = '694903c20d780f4e14267577';

    console.log('🧪 Test 1: Creating first DIRECT room...');
    const room1 = new Room({
      name: 'Test Chat 1',
      type: 'DIRECT',
      participants: [
        { userId: user1, role: 'INITIATOR' },
        { userId: user2, role: 'PARTICIPANT' }
      ]
    });

    try {
      await room1.save();
      console.log(`✅ Room 1 created: ${room1._id}`);
      console.log(`   participantKey: ${room1.participantKey}\n`);
    } catch (err) {
      console.log(`❌ Failed to create room 1: ${err.message}\n`);
    }

    console.log('🧪 Test 2: Trying to create duplicate DIRECT room (should fail)...');
    const room2 = new Room({
      name: 'Test Chat 2',
      type: 'DIRECT',
      participants: [
        { userId: user2, role: 'INITIATOR' },  // Reversed order
        { userId: user1, role: 'PARTICIPANT' }
      ]
    });

    try {
      await room2.save();
      console.log(`❌ PROBLEM: Room 2 was created: ${room2._id} (should have been prevented!)\n`);
    } catch (err) {
      if (err.code === 11000) {
        console.log(`✅ Duplicate prevented! Error: ${err.message}\n`);
      } else {
        console.log(`❌ Unexpected error: ${err.message}\n`);
      }
    }

    console.log('🧪 Test 3: Creating ADMIN_CHAT with same users (should succeed - different type)...');
    const room3 = new Room({
      name: 'Admin Chat',
      type: 'ADMIN_CHAT',
      participants: [
        { userId: user1, role: 'INITIATOR' },
        { userId: user2, role: 'PARTICIPANT' }
      ]
    });

    try {
      await room3.save();
      console.log(`✅ ADMIN_CHAT created: ${room3._id}`);
      console.log(`   participantKey: ${room3.participantKey}\n`);
    } catch (err) {
      console.log(`❌ Failed: ${err.message}\n`);
    }

    console.log('🧪 Test 4: Trying to create duplicate ADMIN_CHAT (should fail)...');
    const room4 = new Room({
      name: 'Admin Chat 2',
      type: 'ADMIN_CHAT',
      participants: [
        { userId: user2, role: 'INITIATOR' },
        { userId: user1, role: 'PARTICIPANT' }
      ]
    });

    try {
      await room4.save();
      console.log(`❌ PROBLEM: Room 4 was created: ${room4._id} (should have been prevented!)\n`);
    } catch (err) {
      if (err.code === 11000) {
        console.log(`✅ Duplicate prevented! Error: ${err.message}\n`);
      } else {
        console.log(`❌ Unexpected error: ${err.message}\n`);
      }
    }

    // Cleanup
    console.log('🧹 Cleaning up test rooms...');
    await Room.deleteMany({
      _id: { $in: [room1._id, room3._id].filter(Boolean) }
    });
    console.log('✅ Cleanup complete\n');

    console.log('✅ All tests passed! Duplicate prevention is working correctly.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
};

testDuplicatePrevention();
