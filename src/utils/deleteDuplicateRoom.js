import mongoose from 'mongoose';
import 'dotenv/config';

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/webchat');
    console.log('📦 Connected to MongoDB');

    const Room = mongoose.model('Room', new mongoose.Schema({}, { strict: false, collection: 'rooms' }));
    const Message = mongoose.model('Message', new mongoose.Schema({}, { strict: false, collection: 'messages' }));

    // The two duplicate rooms
    const directRoomId = '695b8d13c5b1869361bd6bec'; // DIRECT room (newer)
    const adminChatId = '6949044ef6a8b672599723c3';  // ADMIN_CHAT room (older)

    console.log('\n🔍 Checking rooms...');
    
    const directRoom = await Room.findById(directRoomId);
    const adminChat = await Room.findById(adminChatId);

    if (!directRoom) {
      console.log('❌ DIRECT room not found');
    } else {
      console.log(`✅ Found DIRECT room: ${directRoom._id}`);
      console.log(`   Participants: ${directRoom.participants.map(p => p.userId).join(', ')}`);
    }

    if (!adminChat) {
      console.log('❌ ADMIN_CHAT room not found');
    } else {
      console.log(`✅ Found ADMIN_CHAT room: ${adminChat._id}`);
      console.log(`   Participants: ${adminChat.participants.map(p => p.userId).join(', ')}`);
    }

    if (!directRoom || !adminChat) {
      console.log('\n⚠️  One or both rooms not found. They may have been deleted already.');
      process.exit(0);
    }

    // Merge messages from DIRECT room to ADMIN_CHAT room
    console.log('\n📝 Merging messages...');
    const result = await Message.updateMany(
      { roomId: directRoomId },
      { $set: { roomId: adminChatId } }
    );
    console.log(`✅ Moved ${result.modifiedCount} messages from DIRECT to ADMIN_CHAT`);

    // Update ADMIN_CHAT room metadata
    const lastMessage = await Message.findOne({ roomId: adminChatId, isDeleted: false })
      .sort({ createdAt: -1 });
    
    if (lastMessage) {
      await Room.updateOne(
        { _id: adminChatId },
        {
          $set: {
            lastMessage: lastMessage._id,
            lastMessageTime: lastMessage.createdAt,
            participantKey: 'ADMIN_CHAT_694903c20d780f4e14267577_69490410f6a8b67259972216'
          }
        }
      );
      console.log('✅ Updated ADMIN_CHAT metadata');
    }

    // Delete the duplicate DIRECT room
    await Room.deleteOne({ _id: directRoomId });
    console.log(`✅ Deleted duplicate DIRECT room: ${directRoomId}`);

    console.log('\n✅ Cleanup complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

run();
