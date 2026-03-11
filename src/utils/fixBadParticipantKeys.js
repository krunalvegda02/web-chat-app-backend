import mongoose from 'mongoose';
import Room from '../models/room.model.js';
import Message from '../models/message.model.js';
import 'dotenv/config';

const fixBadParticipantKeys = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/webchat');
    console.log('📦 Connected to MongoDB\n');

    // Find all DIRECT and ADMIN_CHAT rooms
    const rooms = await Room.find({
      type: { $in: ['DIRECT', 'ADMIN_CHAT'] }
    });

    console.log(`🔍 Found ${rooms.length} DIRECT/ADMIN_CHAT rooms\n`);

    let fixed = 0;
    const duplicateGroups = new Map();

    for (const room of rooms) {
      if (room.participants.length === 2) {
        // Extract proper user IDs
        const sortedIds = room.participants
          .map(p => {
            const userId = p.userId?._id || p.userId;
            return userId.toString();
          })
          .sort()
          .join('_');
        
        const correctKey = `${room.type}_${sortedIds}`;
        
        // Check if key needs fixing
        if (room.participantKey !== correctKey) {
          console.log(`🔧 Fixing room ${room._id}`);
          console.log(`   Old key: ${room.participantKey?.substring(0, 50)}...`);
          console.log(`   New key: ${correctKey}`);
          
          room.participantKey = correctKey;
          await room.save();
          fixed++;
        }

        // Track for duplicate detection
        if (!duplicateGroups.has(correctKey)) {
          duplicateGroups.set(correctKey, []);
        }
        duplicateGroups.get(correctKey).push(room);
      }
    }

    console.log(`\n✅ Fixed ${fixed} rooms with bad participantKey\n`);

    // Find and merge duplicates
    const duplicates = Array.from(duplicateGroups.entries())
      .filter(([_, rooms]) => rooms.length > 1);

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} duplicate room groups\n`);

      for (const [key, dupRooms] of duplicates) {
        // Sort by creation date (keep oldest)
        dupRooms.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        const keepRoom = dupRooms[0];
        const removeRooms = dupRooms.slice(1);

        console.log(`📝 Merging duplicates for key: ${key}`);
        console.log(`   Keeping: ${keepRoom._id} (${keepRoom.createdAt})`);

        for (const dupRoom of removeRooms) {
          console.log(`   Removing: ${dupRoom._id} (${dupRoom.createdAt})`);

          // Move messages
          const result = await Message.updateMany(
            { roomId: dupRoom._id },
            { $set: { roomId: keepRoom._id } }
          );
          console.log(`   Moved ${result.modifiedCount} messages`);

          // Delete duplicate
          await Room.deleteOne({ _id: dupRoom._id });
        }

        // Update kept room metadata
        const lastMsg = await Message.findOne({ 
          roomId: keepRoom._id, 
          isDeleted: false 
        }).sort({ createdAt: -1 });

        if (lastMsg) {
          keepRoom.lastMessage = lastMsg._id;
          keepRoom.lastMessageTime = lastMsg.createdAt;
          await keepRoom.save();
        }
      }

      console.log(`\n✅ Merged ${duplicates.length} duplicate groups`);
    } else {
      console.log('✅ No duplicates found');
    }

    console.log('\n✅ All done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixBadParticipantKeys();
