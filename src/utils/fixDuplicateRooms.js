import mongoose from 'mongoose';
import Room from '../models/room.model.js';
import Message from '../models/message.model.js';

/**
 * Fix duplicate DIRECT and ADMIN_CHAT rooms
 * Keeps the oldest room and merges messages from duplicates
 */
export const fixDuplicateRooms = async () => {
  try {
    console.log('🔍 Searching for duplicate rooms...');

    // Find all DIRECT and ADMIN_CHAT rooms
    const rooms = await Room.find({
      type: { $in: ['DIRECT', 'ADMIN_CHAT'] }
    }).lean();

    // Group rooms by sorted participant IDs
    const roomGroups = new Map();

    rooms.forEach(room => {
      if (room.participants.length === 2) {
        const sortedIds = room.participants
          .map(p => p.userId.toString())
          .sort()
          .join('_');
        
        const key = `${room.type}_${sortedIds}`;
        
        if (!roomGroups.has(key)) {
          roomGroups.set(key, []);
        }
        roomGroups.get(key).push(room);
      }
    });

    // Find duplicates
    const duplicates = Array.from(roomGroups.entries())
      .filter(([_, rooms]) => rooms.length > 1);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate rooms found!');
      
      // Still need to add participantKey to existing rooms
      console.log('\n🔄 Adding participantKey to existing rooms...');
      let updated = 0;
      
      for (const room of rooms) {
        if (room.participants.length === 2) {
          const sortedIds = room.participants
            .map(p => p.userId.toString())
            .sort()
            .join('_');
          const participantKey = `${room.type}_${sortedIds}`;
          
          await Room.updateOne(
            { _id: room._id },
            { $set: { participantKey } }
          );
          updated++;
        }
      }
      
      console.log(`✅ Updated ${updated} rooms with participantKey`);
      return { fixed: 0, merged: 0, updated };
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate room groups`);

    let fixedCount = 0;
    let mergedMessages = 0;

    // Process each duplicate group
    for (const [key, duplicateRooms] of duplicates) {
      // Sort by creation date (keep oldest)
      duplicateRooms.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );

      const keepRoom = duplicateRooms[0];
      const removeRooms = duplicateRooms.slice(1);

      console.log(`\n📝 Processing duplicate group: ${key}`);
      console.log(`   Keeping room: ${keepRoom._id} (created: ${keepRoom.createdAt})`);

      // Merge messages from duplicate rooms to the kept room
      for (const dupRoom of removeRooms) {
        console.log(`   Removing duplicate: ${dupRoom._id} (created: ${dupRoom.createdAt})`);

        // Update all messages to point to the kept room
        const result = await Message.updateMany(
          { roomId: dupRoom._id },
          { $set: { roomId: keepRoom._id } }
        );

        mergedMessages += result.modifiedCount;
        console.log(`   Merged ${result.modifiedCount} messages`);

        // Delete the duplicate room
        await Room.deleteOne({ _id: dupRoom._id });
        fixedCount++;
      }

      // Update the kept room with participantKey and metadata
      const sortedIds = keepRoom.participants
        .map(p => p.userId.toString())
        .sort()
        .join('_');
      const participantKey = `${keepRoom.type}_${sortedIds}`;
      
      const messages = await Message.find({ 
        roomId: keepRoom._id,
        isDeleted: false 
      }).sort({ createdAt: -1 }).limit(1);

      const updateData = { participantKey };
      
      if (messages.length > 0) {
        const messageCount = await Message.countDocuments({ 
          roomId: keepRoom._id,
          isDeleted: false 
        });

        updateData.lastMessage = messages[0]._id;
        updateData.lastMessageTime = messages[0].createdAt;
        updateData.messageCount = messageCount;
      }

      await Room.updateOne({ _id: keepRoom._id }, { $set: updateData });
    }

    console.log(`\n✅ Fixed ${fixedCount} duplicate rooms`);
    console.log(`✅ Merged ${mergedMessages} messages`);

    return { fixed: fixedCount, merged: mergedMessages };

  } catch (error) {
    console.error('❌ Error fixing duplicate rooms:', error);
    throw error;
  }
};

/**
 * Rebuild unique index on Room collection
 */
export const rebuildRoomIndexes = async () => {
  try {
    console.log('\n🔨 Rebuilding room indexes...');
    
    const Room = mongoose.model('Room');
    
    // Rebuild all indexes
    await Room.syncIndexes();
    console.log('✅ Indexes rebuilt successfully');

  } catch (error) {
    console.error('❌ Error rebuilding indexes:', error);
    throw error;
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/webchat';
  
  mongoose.connect(dbUrl)
    .then(async () => {
      console.log('📦 Connected to MongoDB');
      
      await fixDuplicateRooms();
      await rebuildRoomIndexes();
      
      console.log('\n✅ Migration complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
