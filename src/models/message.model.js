
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true
    },
    
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // ✅ Message content - can be text or media URL
    content: {
      type: String,
      default: ''
    },

    // ✅ NEW: Media support
    media: [
      {
        type: {
          type: String,
          enum: ['image', 'video', 'audio', 'file'],
          default: 'image'
        },
        url: String,
        mimeType: String,
        size: Number,
        duration: Number, // for audio/video in seconds
        thumbnail: String // for video thumbnail
      }
    ],

    // ✅ Message type
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file', 'system'],
      default: 'text'
    },

    // ✅ FIXED: Delivery status tracking
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read'],
      default: 'sending'
    },

    // ✅ When message was sent (by sender)
    sentAt: {
      type: Date,
      default: Date.now
    },

    // ✅ When message was delivered (when recipient came online/connected)
    deliveredAt: Date,

    // ✅ Track who read the message and when
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        readAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // ✅ Edit tracking
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: Date,

    // ✅ Delete tracking (soft delete)
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // ✅ Reply to another message
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },

    // ✅ Reactions from users
    reactions: [
      {
        emoji: String,
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }
    ]
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
  }
);

// ✅ Index for efficient queries
messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ roomId: 1, isDeleted: 1 });

// ✅ Virtual for checking if user has read
messageSchema.virtual('isRead').get(function() {
  return this.readBy && this.readBy.length > 0;
});

// ✅ Method to mark as delivered
messageSchema.methods.markAsDelivered = function() {
  if (this.status === 'sending') {
    this.status = 'delivered';
    this.deliveredAt = new Date();
  }
  return this.save();
};

// ✅ Method to mark as read by user
messageSchema.methods.markAsReadBy = function(userId) {
  const alreadyRead = this.readBy.some(r => r.userId.toString() === userId.toString());
  if (!alreadyRead) {
    this.readBy.push({
      userId,
      readAt: new Date()
    });
    this.status = 'read';
    return this.save();
  }
  return Promise.resolve(this);
};

// ✅ Method to soft delete message
messageSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// ✅ Query middleware to exclude deleted messages by default
messageSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

const Message = mongoose.model('Message', messageSchema);

export default Message;