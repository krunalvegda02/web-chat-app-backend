import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    // ✅ Room identification
    name: {
      type: String,
      required: true,
      trim: true
    },
    
    type: {
      type: String,
      enum: ['DIRECT', 'GROUP', 'ADMIN_CHAT'],
      default: 'GROUP',
      index: true
    },

    // ✅ Tenant association (for multi-tenant)
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      sparse: true,
      index: true
    },

    // ✅ FIXED: Participants with role information
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        
        role: {
          type: String,
          enum: ['INITIATOR', 'PARTICIPANT', 'MEMBER', 'ADMIN', 'OWNER'],
          default: 'PARTICIPANT'
        },
        
        joinedAt: {
          type: Date,
          default: Date.now
        },
        
        status: {
          type: String,
          enum: ['ACTIVE', 'INACTIVE', 'LEFT'],
          default: 'ACTIVE'
        }
      }
    ],

    // ✅ Last message tracking
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      sparse: true
    },

    lastMessageTime: {
      type: Date,
      sparse: true,
      index: { expireAfterSeconds: 7776000 } // 90 days TTL
    },

    // ✅ Unread message count per user
    unreadCount: {
      type: Map,
      of: Number,
      default: new Map()
    },

    // ✅ Room metadata
    description: {
      type: String,
      sparse: true
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },

    isPinned: {
      type: Boolean,
      default: false
    },

    messageCount: {
      type: Number,
      default: 0
    },

    // ✅ Room settings
    settings: {
      allowNotifications: {
        type: Boolean,
        default: true
      },
      isMuted: {
        type: Boolean,
        default: false
      },
      theme: {
        type: String,
        sparse: true
      }
    }
  },
  {
    timestamps: true,
    collection: 'rooms'
  }
);

// ✅ Indexes for better query performance
roomSchema.index({ type: 1, 'participants.userId': 1 });
roomSchema.index({ tenantId: 1, type: 1 });
roomSchema.index({ lastMessageTime: -1 });
roomSchema.index({ isArchived: 1 });
roomSchema.index({ createdAt: -1 });

// ✅ Methods

/**
 * Add participant to room
 */
roomSchema.methods.addParticipant = async function (userId, role = 'PARTICIPANT') {
  const exists = this.participants.some(p =>
    p.userId.toString() === userId.toString()
  );

  if (!exists) {
    this.participants.push({
      userId,
      role,
      joinedAt: new Date()
    });
    await this.save();
  }

  return this;
};

/**
 * Remove participant from room
 */
roomSchema.methods.removeParticipant = async function (userId) {
  this.participants = this.participants.filter(p =>
    p.userId.toString() !== userId.toString()
  );
  await this.save();
  return this;
};

/**
 * Get participant by userId
 */
roomSchema.methods.getParticipant = function (userId) {
  return this.participants.find(p =>
    p.userId.toString() === userId.toString()
  );
};

/**
 * Check if user is participant
 */
roomSchema.methods.isParticipant = function (userId) {
  return this.participants.some(p =>
    p.userId.toString() === userId.toString()
  );
};

/**
 * Update participant role
 */
roomSchema.methods.updateParticipantRole = async function (userId, newRole) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.role = newRole;
    await this.save();
  }
  return this;
};

/**
 * Increment unread count for user
 */
roomSchema.methods.incrementUnreadCount = function (userId, count = 1) {
  const userIdStr = userId.toString();
  const current = this.unreadCount.get(userIdStr) || 0;
  this.unreadCount.set(userIdStr, current + count);
};

/**
 * Clear unread count for user
 */
roomSchema.methods.clearUnreadCount = function (userId) {
  this.unreadCount.delete(userId.toString());
};

/**
 * Get unread count for user
 */
roomSchema.methods.getUnreadCount = function (userId) {
  return this.unreadCount.get(userId.toString()) || 0;
};

export default mongoose.model('Room', roomSchema);