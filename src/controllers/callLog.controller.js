import CallLog from '../models/callLog.model.js';
import { NotFoundError, ForbiddenError } from '../utils/error.js';

export const getMyCallLogs = async (req, res) => {
  try {
  const userId = req.user._id;
  const { page = 1, limit = 50 } = req.query;

  const callLogs = await CallLog.find({
    $or: [{ callerId: userId }, { receiverId: userId }]
  })
    .populate('callerId', 'name avatar phone email')
    .populate('receiverId', 'name avatar phone email')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await CallLog.countDocuments({
    $or: [{ callerId: userId }, { receiverId: userId }]
  });

  return res.status(200).json({
    success: true,
    data: { callLogs, total, page: parseInt(page), pages: Math.ceil(total / limit) },
    message: 'Call logs fetched successfully'
  });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
  }
};

export const deleteCallLog = async (req, res) => {
  try {
  const { callLogId } = req.params;
  const userId = req.user._id;

  const callLog = await CallLog.findById(callLogId);

  if (!callLog) {
    throw new NotFoundError('Call log not found');
  }

  if (callLog.callerId.toString() !== userId.toString() && 
      callLog.receiverId.toString() !== userId.toString()) {
    throw new ForbiddenError('Not authorized to delete this call log');
  }

  await callLog.deleteOne();

  return res.status(200).json({
    success: true,
    message: 'Call log deleted successfully'
  });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
  }
};
