import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
  },
  type: {
    type: String,
    enum: ['ADMIN_USER', 'GROUP', 'DIRECT', 'ADMIN_CHAT'], 
    default: 'ADMIN_USER',
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: function() {
      // ✅ NOT required for ADMIN_CHAT or DIRECT
      return this.type !== 'ADMIN_CHAT' && this.type !== 'DIRECT';
    },
  },
  participants: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      joinedAt: {
        type: Date,
        default: Date.now,
      },
      role: {
        type: String,
        enum: ['OWNER', 'ADMIN', 'MEMBER'],
        default: 'MEMBER',
      },
    },
  ],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
  },
  lastMessageTime: Date,
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  avatar: String,
  description: String,
  isArchived: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ✅ Index for ADMIN_CHAT rooms
roomSchema.index({ type: 1, 'participants.userId': 1 });
// ✅ Index for tenant-based rooms
roomSchema.index({ tenantId: 1, type: 1 });
// ✅ Index for participant lookup
roomSchema.index({ 'participants.userId': 1 });

const Room = mongoose.model("Room", roomSchema);

export default Room;
