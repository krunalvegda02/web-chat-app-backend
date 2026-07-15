import mongoose from 'mongoose';



const platformSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Platform name is required'],
    trim: true,
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
  
  // External Platform Integration
  externalClientId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  apiEndpoint: {
    type: String,
    trim: true,
  },
  apiKey: {
    type: String,
    trim: true,
  },
  apiKeyCreatedAt: {
    type: Date,
  },
  sessionTokens: [{
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    userData: { type: mongoose.Schema.Types.Mixed },
  }],

  integrationMetadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },
  
  senderCharge: {
    type: Boolean,
    default: false,
  },

  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
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

platformSchema.index({ slug: 1, adminId: 1 });
platformSchema.index({ externalClientId: 1 });
platformSchema.index({ status: 1 });
platformSchema.index({ createdAt: -1 });

const Platform = mongoose.model('Platform', platformSchema);

export default Platform;
