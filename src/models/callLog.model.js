import mongoose from 'mongoose';

const callLogSchema = new mongoose.Schema({
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
  },
  callType: {
    type: String,
    enum: ['audio', 'video'],
    default: 'audio',
  },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed'],
    default: 'initiated',
  },
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
  },
  duration: {
    type: Number, // in seconds
    default: 0,
  },
}, {
  timestamps: true,
});

callLogSchema.index({ callerId: 1, createdAt: -1 });
callLogSchema.index({ receiverId: 1, createdAt: -1 });
callLogSchema.index({ roomId: 1 });

const CallLog = mongoose.model('CallLog', callLogSchema);

export default CallLog;
