import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true }, // positive = credit, negative = debit
  type: { type: String, enum: ['CREDIT_REQUEST', 'CREDIT_APPROVED', 'CREDIT_REJECTED', 'MESSAGE_DEBIT'], required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  utr: { type: String },
  screenshotUrl: { type: String },
  paymentQrUrl: { type: String }, // data URI generated from SuperAdminBank.upiId
  remark: { type: String }, // optional remark when admin adds credits manually
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // platform admin who requested
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // super admin who approved
});

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
export default WalletTransaction;
