import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  contactUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  contactName: {
    type: String,
    trim: true,
  },
  phone: String,
  email: String,
  isFavorite: {
    type: Boolean,
    default: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

contactSchema.index({ userId: 1, contactUserId: 1 }, { unique: true });
contactSchema.index({ userId: 1, phone: 1 });
contactSchema.index({ userId: 1, email: 1 });

const Contact = mongoose.model('Contact', contactSchema);

export default Contact;
