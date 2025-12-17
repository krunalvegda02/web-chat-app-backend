import mongoose from 'mongoose';

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
    logoUrl: String,
    primaryColor: {
      type: String,
      default: '#2563eb',
    },
    secondaryColor: {
      type: String,
      default: '#1e293b',
    },
    accentColor: {
      type: String,
      default: '#10b981',
    },
    chatBubbleAdmin: {
      type: String,
      default: '#3b82f6',
    },
    chatBubbleUser: {
      type: String,
      default: '#1f2937',
    },
    backgroundImageUrl: String,
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

const Tenant = mongoose.model("Tenant", tenantSchema);

export default Tenant;

