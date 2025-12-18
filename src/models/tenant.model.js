import mongoose from 'mongoose';

const themeSchema = new mongoose.Schema({
  appName: {
    type: String,
    default: 'Chat App',
  },
  logoUrl: String,
  logoHeight: {
    type: Number,
    default: 40,
  },
  primaryColor: {
    type: String,
    default: '#3B82F6',
  },
  secondaryColor: {
    type: String,
    default: '#E8F0FE',
  },
  accentColor: {
    type: String,
    default: '#06B6D4',
  },
  backgroundColor: {
    type: String,
    default: '#FFFFFF',
  },
  borderColor: {
    type: String,
    default: '#E2E8F0',
  },
  headerBackground: {
    type: String,
    default: '#F8FAFC',
  },
  headerText: {
    type: String,
    default: '#1F2937',
  },
  chatBackgroundImage: String,
  chatBubbleAdmin: {
    type: String,
    default: '#3B82F6',
  },
  chatBubbleUser: {
    type: String,
    default: '#F3F4F6',
  },
  chatBubbleAdminText: {
    type: String,
    default: '#FFFFFF',
  },
  chatBubbleUserText: {
    type: String,
    default: '#1F2937',
  },
  messageFontSize: {
    type: Number,
    default: 14,
  },
  messageBorderRadius: {
    type: Number,
    default: 12,
  },
  bubbleStyle: {
    type: String,
    enum: ['rounded', 'square', 'pill'],
    default: 'rounded',
  },
  blurEffect: {
    type: Number,
    default: 0.1,
  },
  showAvatars: {
    type: Boolean,
    default: true,
  },
  showReadStatus: {
    type: Boolean,
    default: true,
  },
  enableTypingIndicator: {
    type: Boolean,
    default: true,
  },
});











const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tenant name is required'],
  },
  slug: {
    type: String,
    required: [true, 'Slug is required'],
    unique: true,
    lowercase: true,
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  theme: {
    type: themeSchema,
    default: () => ({}),
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  inviteToken: {
    token: String,
    expiresAt: Date,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE',
  },

  inviteToken: {
    token: String,
    expiresAt: Date,
    invitedEmail: String,      // Email of invited person
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acceptedAt: Date,          // When user accepted
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  inviteHistory: [              // Track all invites (optional)
    {
      email: String,
      sentAt: Date,
      expiresAt: Date,
      acceptedAt: Date,
      status: {
        type: String,
        enum: ['PENDING', 'ACCEPTED', 'EXPIRED'],
        default: 'PENDING'
      }
    }
  ],


  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

tenantSchema.index({ slug: 1, adminId: 1 });

const Tenant = mongoose.model('Tenant', tenantSchema);

export default Tenant;