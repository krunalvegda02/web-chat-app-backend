import mongoose from 'mongoose';

const themeSchema = new mongoose.Schema({
  appName: { type: String, default: null },
  logoUrl: { type: String, default: null },
  logoHeight: { type: Number, default: null },
  
  // Sidebar/Room List Colors
  sidebarBackgroundColor: { type: String, default: null },
  sidebarHeaderColor: { type: String, default: null },
  sidebarTextColor: { type: String, default: null },
  sidebarHoverColor: { type: String, default: null },
  sidebarActiveColor: { type: String, default: null },
  sidebarBorderColor: { type: String, default: null },
  
  // Bottom Navigation Colors
  bottomNavBackgroundColor: { type: String, default: null },
  bottomNavActiveColor: { type: String, default: null },
  bottomNavInactiveColor: { type: String, default: null },
  bottomNavBorderColor: { type: String, default: null },
  
  // Header/Top Bar Colors
  headerBackgroundColor: { type: String, default: null },
  headerTextColor: { type: String, default: null },
  headerIconColor: { type: String, default: null },
  
  // Chat Background
  chatBackgroundColor: { type: String, default: null },
  chatBackgroundImage: { type: String, default: null },
  
  // Sender Bubble (Your Messages)
  senderBubbleColor: { type: String, default: null },
  senderTextColor: { type: String, default: null },
  senderBubbleRadius: { type: Number, default: null },
  
  // Receiver Bubble (Other's Messages)
  receiverBubbleColor: { type: String, default: null },
  receiverTextColor: { type: String, default: null },
  receiverBubbleRadius: { type: Number, default: null },
  
  // Message Input
  inputBackgroundColor: { type: String, default: null },
  inputTextColor: { type: String, default: null },
  inputBorderColor: { type: String, default: null },
  inputPlaceholderColor: { type: String, default: null },
  sendButtonColor: { type: String, default: null },
  sendButtonIconColor: { type: String, default: null },
  
  // Call Logs
  callLogHeaderColor: { type: String, default: null },
  callLogBackgroundColor: { type: String, default: null },
  callLogItemHoverColor: { type: String, default: null },
  
  // Badges & Indicators
  unreadBadgeColor: { type: String, default: null },
  unreadBadgeTextColor: { type: String, default: null },
  onlineIndicatorColor: { type: String, default: null },
  typingIndicatorColor: { type: String, default: null },
  
  // Buttons
  primaryButtonColor: { type: String, default: null },
  primaryButtonTextColor: { type: String, default: null },
  secondaryButtonColor: { type: String, default: null },
  secondaryButtonTextColor: { type: String, default: null },
  
  // Avatars
  avatarBackgroundColor: { type: String, default: null },
  avatarTextColor: { type: String, default: null },
  
  // Timestamps & Meta
  timestampColor: { type: String, default: null },
  dateHeaderColor: { type: String, default: null },
  dateHeaderBackgroundColor: { type: String, default: null },
  
  // Legacy fields (keep for backward compatibility)
  primaryColor: { type: String, default: null },
  secondaryColor: { type: String, default: null },
  accentColor: { type: String, default: null },
  backgroundColor: { type: String, default: null },
  borderColor: { type: String, default: null },
  headerBackground: { type: String, default: null },
  headerText: { type: String, default: null },
  chatBubbleAdmin: { type: String, default: null },
  chatBubbleUser: { type: String, default: null },
  chatBubbleAdminText: { type: String, default: null },
  chatBubbleUserText: { type: String, default: null },
  messageFontSize: { type: Number, default: null },
  messageBorderRadius: { type: Number, default: null },
  bubbleStyle: { type: String, enum: ['rounded', 'square', 'pill'], default: null },
  blurEffect: { type: Number, default: null },
  showAvatars: { type: Boolean, default: null },
  showReadStatus: { type: Boolean, default: null },
  enableTypingIndicator: { type: Boolean, default: null },
});

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
  webhookUrl: {
    type: String,
    trim: true,
  },
  integrationMetadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },
  
  // Theme customization
  theme: {
    type: themeSchema,
    default: () => ({}),
  },
  
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'ACTIVE',
  },
  
  // Subscription/Billing
  subscriptionPlan: {
    type: String,
    enum: ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'],
    default: 'FREE',
  },
  subscriptionExpiry: {
    type: Date,
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
