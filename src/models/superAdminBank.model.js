import mongoose from 'mongoose';

const superAdminBankSchema = new mongoose.Schema({
  bankName: { type: String, default: null, trim: true },
  accountNumber: { type: String, default: null, trim: true },
  ifscCode: { type: String, default: null, trim: true },
  upiId: { type: String, default: null, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update updatedAt on every save
superAdminBankSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const SuperAdminBank = mongoose.model('SuperAdminBank', superAdminBankSchema);
export default SuperAdminBank;
