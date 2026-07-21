import User from '../models/user.model.js';
import WalletTransaction from '../models/walletTransaction.model.js';
import SuperAdminBank from '../models/superAdminBank.model.js';
import Platform from '../models/platform.model.js';
import Setting from '../models/setting.model.js';
import { successResponse, errorResponse } from '../utils/response.js';
// ============================================
// WALLET SYSTEM CONTROLLERS
// ============================================

/**
 * REQUEST CREDIT – Platform Admin creates a CREDIT_REQUEST transaction.
 * Bank details are returned so the frontend can generate the QR code.
 */
export const requestCredit = async (req, res) => {
  try {
    const { amount, utr, screenshotUrl } = req.body;

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return errorResponse(res, 'Amount must be a positive number', 400);
    }
    if (amount > 1000000) {
      return errorResponse(res, 'Maximum credit request is 1,000,000 ChatCoin', 400);
    }

    // Validate UTR (Indian UTR pattern: alphanumeric, 12-22 chars)
    if (!utr || typeof utr !== 'string') {
      return errorResponse(res, 'UTR (transaction reference) is required', 400);
    }
    const utrClean = utr.trim();
    if (!/^[A-Za-z0-9]{12,22}$/.test(utrClean)) {
      return errorResponse(res, 'UTR must be 12‑22 alphanumeric characters', 400);
    }

    // Check for duplicate UTR
    const existingUtr = await WalletTransaction.findOne({ utr: utrClean });
    if (existingUtr) {
      return errorResponse(res, 'This UTR has already been used in a previous request', 400);
    }

    // Get Super Admin bank details (QR is generated on the frontend)
    const bank = await SuperAdminBank.findOne();

    const transaction = new WalletTransaction({
      userId: req.user._id,
      amount,
      type: 'CREDIT_REQUEST',
      status: 'PENDING',
      utr: utrClean,
      screenshotUrl: screenshotUrl || null,
      createdBy: req.user._id,
    });

    await transaction.save();

    console.log(`💰 [WALLET] Credit request created by ${req.user.email} for ${amount} ChatCoin`);

    return successResponse(res, {
      transaction,
      bankDetails: bank ? {
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        ifscCode: bank.ifscCode,
        upiId: bank.upiId,
      } : null,
    }, 'Credit request submitted, awaiting approval', 201);
  } catch (error) {
    console.error('Request credit error:', error);
    return errorResponse(res, error.message, 500);
  }
};





/**
 * GET WALLET BALANCE – Returns current balance and currency for the authenticated user.
 */
export const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletBalance walletCurrency');
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }
    return successResponse(res, {
      balance: user.walletBalance,
      currency: user.walletCurrency || 'ChatCoin',
    }, 'Balance retrieved');
  } catch (error) {
    console.error('Get wallet balance error:', error);
    return errorResponse(res, error.message, 500);
  }
};




/**
 * GET WALLET HISTORY – Returns all transactions for the authenticated user (or all for Super Admin).
 */
export const getWalletHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const skip = (page - 1) * parseInt(limit);

    const query = {};
    if (req.user.role === 'PLATFORM_ADMIN') {
      query.userId = req.user._id;
    }
    if (status) query.status = status;
    if (type) query.type = type;
    if (req.query.excludeType) query.type = { $ne: req.query.excludeType };

    const transactions = await WalletTransaction.find(query)
      .populate('userId', 'name email')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await WalletTransaction.countDocuments(query);

    return successResponse(res, {
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    }, 'Transaction history retrieved');
  } catch (error) {
    console.error('Get wallet history error:', error);
    return errorResponse(res, error.message, 500);
  }
};




/**
 * GET PENDING REQUESTS – Super Admin fetches all pending credit requests.
 */
export const getPendingRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * parseInt(limit);

    const transactions = await WalletTransaction.find({
      type: 'CREDIT_REQUEST',
      status: 'PENDING',
    })
      .populate('userId', 'name email walletBalance')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await WalletTransaction.countDocuments({
      type: 'CREDIT_REQUEST',
      status: 'PENDING',
    });

    return successResponse(res, {
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    }, 'Pending requests retrieved');
  } catch (error) {
    console.error('Get pending requests error:', error);
    return errorResponse(res, error.message, 500);
  }
};




/**
 * APPROVE CREDIT – Super Admin approves a pending credit request.
 * Increments the user's walletBalance.
 */
export const approveCredit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { remark } = req.body;

    const transaction = await WalletTransaction.findById(transactionId);
    if (!transaction) {
      return errorResponse(res, 'Transaction not found', 404);
    }
    if (transaction.status !== 'PENDING') {
      return errorResponse(res, `Transaction is already ${transaction.status}`, 400);
    }
    if (transaction.type !== 'CREDIT_REQUEST') {
      return errorResponse(res, 'Only credit requests can be approved', 400);
    }

    // Approve the transaction
    transaction.status = 'APPROVED';
    transaction.type = 'CREDIT_APPROVED';
    transaction.approvedBy = req.user._id;
    if (remark) transaction.remark = remark;
    await transaction.save();

    // Increment the user's wallet balance
    const targetUser = await User.findByIdAndUpdate(
      transaction.userId,
      { $inc: { walletBalance: transaction.amount } },
      { new: true }
    );

    console.log(`✅ [WALLET] Credit approved: ${transaction.amount} ChatCoin for user ${targetUser?.email}`);

    return successResponse(res, {
      transaction,
      newBalance: targetUser?.walletBalance || 0,
    }, `${transaction.amount} ChatCoin approved successfully`);
  } catch (error) {
    console.error('Approve credit error:', error);
    return errorResponse(res, error.message, 500);
  }
};

/**
 * REJECT CREDIT – Super Admin rejects a pending credit request.
 */
export const rejectCredit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason, remark } = req.body;

    const transaction = await WalletTransaction.findById(transactionId);
    if (!transaction) {
      return errorResponse(res, 'Transaction not found', 404);
    }
    if (transaction.status !== 'PENDING') {
      return errorResponse(res, `Transaction is already ${transaction.status}`, 400);
    }
    if (transaction.type !== 'CREDIT_REQUEST') {
      return errorResponse(res, 'Only credit requests can be rejected', 400);
    }

    transaction.status = 'REJECTED';
    transaction.type = 'CREDIT_REJECTED';
    transaction.approvedBy = req.user._id;
    if (remark || reason) transaction.remark = remark || reason;
    await transaction.save();

    console.log(`❌ [WALLET] Credit rejected: ${transaction.amount} ChatCoin for user ${transaction.userId}. Reason: ${reason || 'N/A'}`);

    return successResponse(res, { transaction }, 'Credit request rejected');
  } catch (error) {
    console.error('Reject credit error:', error);
    return errorResponse(res, error.message, 500);
  }
};


/**
 * ADD CREDITS MANUALLY – Super Admin adds credits directly to a Platform Admin's wallet.
 * No request/approval flow; instant credit.
 */
export const addCreditsManually = async (req, res) => {
  try {
    const { userId, amount, remark } = req.body;

    if (!userId) {
      return errorResponse(res, 'User ID is required', 400);
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return errorResponse(res, 'Amount must be a positive number', 400);
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return errorResponse(res, 'User not found', 404);
    }
    if (targetUser.role !== 'PLATFORM_ADMIN') {
      return errorResponse(res, 'Credits can only be added to Platform Admins', 400);
    }

    // Create a transaction record
    const transaction = new WalletTransaction({
      userId,
      amount,
      type: 'CREDIT_APPROVED',
      status: 'APPROVED',
      remark,
      createdBy: req.user._id,
      approvedBy: req.user._id,
    });
    await transaction.save();

    // Increment the user's wallet balance
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: amount } },
      { new: true }
    );

    console.log(`💎 [WALLET] Super Admin manually added ${amount} ChatCoin to ${targetUser.email}`);

    return successResponse(res, {
      transaction,
      newBalance: updatedUser.walletBalance,
    }, `${amount} ChatCoin added successfully`);
  } catch (error) {
    console.error('Add credits manually error:', error);
    return errorResponse(res, error.message, 500);
  }
};







/**
 * DEDUCT CREDITS FOR MESSAGE – Helper function called during message sending.
 * Uses Production-Standard Per-Message Pricing:
 * - 5 ChatCoin per 160 character block of text.
 * - 20 ChatCoin flat rate for media.
 * Returns { success, error, newBalance }.
 */
export const deductCreditsForMessage = async (userId, content, type = 'text', media = []) => {
  try {
    const user = await User.findById(userId);
    if (!user) return { success: false, error: 'User not found' };

    // Determine if this user should be charged and who to charge
    let shouldCharge = false;
    let accountToCharge = user; // Default to sender
    let platform = null;

    if (user.role === 'PLATFORM_ADMIN') {
      shouldCharge = true;
      if (user.platformId) {
        platform = await Platform.findById(user.platformId).lean();
      }
    } else if (user.role === 'USER') {
      // Check if the user's platform has senderCharge enabled
      if (user.platformId) {
        platform = await Platform.findById(user.platformId).lean();
      } else if (user.externalUserId) {
         // Fallback if platformId isn't directly on user but they are external
         platform = await Platform.findOne({ 'sessionTokens.userData.externalUserId': user.externalUserId }).lean();
      }

      if (platform && platform.senderCharge === true) {
         shouldCharge = true;
         // Charge the platform admin, not the user
         accountToCharge = await User.findById(platform.adminId);
         if (!accountToCharge) {
            return { success: false, error: 'Platform Admin account not found for deduction' };
         }
      }
    }

    if (!shouldCharge) return { success: true, cost: 0 };

    // 1. Fetch Global Pricing Base (always expected to exist)
    const globalPricing = await Setting.findOne({ key: 'MESSAGE_PRICING' }).lean();
    let textPrice = globalPricing?.value?.textCost;
    let mediaPrice = globalPricing?.value?.mediaCost;
    let textTranslationPrice = globalPricing?.value?.textTranslationCost;
    let voicePrice = globalPricing?.value?.voiceCost;
    let voiceTranslationPrice = globalPricing?.value?.voiceTranslationCost;

    // 2. Override with Custom Platform Pricing (if any)
    if (platform && platform.customPricing) {
      if (platform.customPricing.textCost !== undefined) textPrice = platform.customPricing.textCost;
      if (platform.customPricing.mediaCost !== undefined) mediaPrice = platform.customPricing.mediaCost;
      if (platform.customPricing.textTranslationCost !== undefined) textTranslationPrice = platform.customPricing.textTranslationCost;
      if (platform.customPricing.voiceCost !== undefined) voicePrice = platform.customPricing.voiceCost;
      if (platform.customPricing.voiceTranslationCost !== undefined) voiceTranslationPrice = platform.customPricing.voiceTranslationCost;
    }

    // Calculate Cost
    let cost = 0;
    
    // Process based on type and content
    if (type === 'voice-translation') {
       cost += voiceTranslationPrice;
    } else if (type === 'voice' || type === 'audio') {
       cost += voicePrice;
    } else if (type === 'text-translation') {
       if (content) {
          const blocks = Math.ceil(content.length / 160);
          cost += (blocks * textTranslationPrice);
       }
    } else {
       // Standard Text or Media
       if (media && media.length > 0) {
           cost += mediaPrice; 
       }
       if (content) {
           const blocks = Math.ceil(content.length / 160);
           cost += (blocks * textPrice);
       }
    }

    if (cost === 0) return { success: true, cost: 0 };



    if (accountToCharge.walletBalance < cost) {
      return {
        success: false,
        error: `Insufficient ChatCoin balance. This message costs ${cost} ChatCoin but you have ${accountToCharge.walletBalance}. Please purchase more credits.`,
        balance: accountToCharge.walletBalance,
        cost: cost,
      };
    }

    // Atomic deduction
    const updatedUser = await User.findOneAndUpdate(
      { _id: accountToCharge._id, walletBalance: { $gte: cost } },
      { $inc: { walletBalance: -cost } },
      { new: true }
    );

    if (!updatedUser) {
      return {
        success: false,
        error: 'Insufficient balance (concurrent deduction detected)',
      };
    }

    // Record debit transaction with message content as remark
    // User requested: dont store used credits in transaction
    /*
    let remarkText = '';
    if (media && media.length > 0) {
       remarkText = type === 'audio' ? 'Voice Message' : 'Media Message';
       if (content) remarkText += ` with text`;
    } else {
       remarkText = content ? (content.length > 100 ? content.substring(0, 100) + '...' : content) : 'Empty Message';
    }

    await WalletTransaction.create({
      userId,
      amount: -cost,
      type: 'MESSAGE_DEBIT',
      status: 'APPROVED',
      createdBy: userId,
      remark: remarkText,
    });
    */

    return { success: true, cost: cost, newBalance: updatedUser.walletBalance };
  } catch (error) {
    console.error('Deduct credits error:', error);
    return { success: false, error: error.message };
  }
};
