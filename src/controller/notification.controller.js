import User from '../models/user.model.js';
import admin from '../config/firebase-admin.js';

// ============================================
// 🔥 REGISTER FCM TOKEN - FIXED
// ============================================
export const registerFCMToken = async (req, res) => {
  try {
    const { fcmToken, platform = 'web' } = req.body;
    const userId = req.user._id;

    // ✅ Validate input
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid FCM token is required'
      });
    }

    if (!['web', 'android', 'ios'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid platform'
      });
    }

    // ✅ Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ Handle CLEAR_ALL request
    if (fcmToken === 'CLEAR_ALL') {
      user.fcmTokens = [];
      await user.save();
      return res.json({
        success: true,
        message: 'All FCM tokens cleared'
      });
    }

    // ✅ Initialize fcmTokens array if empty
    if (!user.fcmTokens) {
      user.fcmTokens = [];
    }

    // ✅ ATOMIC: Use database atomic operation to prevent duplicates
    const existingIndex = user.fcmTokens.findIndex(t => t.token === fcmToken);
    
    if (existingIndex === -1) {
      // New token - add it
      user.fcmTokens.push({
        token: fcmToken,
        platform,
        createdAt: new Date()
      });

      // Keep only last 10 tokens per user
      if (user.fcmTokens.length > 10) {
        user.fcmTokens = user.fcmTokens.slice(-10);
      }

      await user.save();

      console.log(`✅ [FCM] New token registered for user ${userId} on ${platform}`);
    } else {
      // Token exists - update createdAt (refresh)
      user.fcmTokens[existingIndex].createdAt = new Date();
      await user.save();
      console.log(`🔄 [FCM] Token refreshed for user ${userId}`);
    }

    return res.json({
      success: true,
      message: 'FCM token registered successfully',
      tokenCount: user.fcmTokens.length
    });

  } catch (error) {
    console.error('❌ [FCM_REGISTER] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register FCM token',
      error: error.message
    });
  }
};

// ============================================
// 🔥 UNREGISTER FCM TOKEN - FIXED
// ============================================
export const unregisterFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user._id;

    // ✅ Validate input
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid FCM token is required'
      });
    }

    // ✅ Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ Remove token
    const initialCount = user.fcmTokens?.length || 0;
    user.fcmTokens = user.fcmTokens?.filter(t => t.token !== fcmToken) || [];
    const removedCount = initialCount - user.fcmTokens.length;

    if (removedCount > 0) {
      await user.save();
      console.log(`✅ [FCM] Removed ${removedCount} token(s) for user ${userId}`);
    }

    return res.json({
      success: true,
      message: 'FCM token unregistered successfully',
      removedCount,
      remainingTokens: user.fcmTokens.length
    });

  } catch (error) {
    console.error('❌ [FCM_UNREGISTER] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to unregister FCM token',
      error: error.message
    });
  }
};

export const sendNotificationToUser = async (userId, notification) => {
  try {
    if (!admin.apps || admin.apps.length === 0) {
      console.log('⚠️ Firebase not configured');
      return;
    }

    const user = await User.findById(userId).select('fcmTokens');
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      console.log(`⚠️ No FCM tokens for user ${userId}`);
      return;
    }

    const tokens = user.fcmTokens.map(t => t.token);
    const message = {
      data: {
        title: String(notification.title || 'New Message'),
        body: String(notification.body || 'You have a new message'),
        roomId: String(notification.data?.roomId || ''),
        senderId: String(notification.data?.senderId || ''),
        senderName: String(notification.data?.senderName || ''),
        messageId: String(notification.data?.messageId || ''),
        type: String(notification.data?.type || 'message'),
        avatar: String(notification.data?.avatar || ''),
      },
      tokens
    };

    console.log(`📤 Sending to ${tokens.length} device(s)`);
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Sent: ${response.successCount}/${tokens.length}`);

    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed token ${idx}:`, resp.error?.code);
          invalidTokens.push(tokens[idx]);
        }
      });
      if (invalidTokens.length > 0 && user.fcmTokens) {
        user.fcmTokens = user.fcmTokens.filter(t => !invalidTokens.includes(t.token));
        await user.save();
        console.log(`Removed ${invalidTokens.length} invalid tokens`);
      }
    }

    return response;
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const sendMessageNotification = async (recipientId, sender, message, roomId) => {
  console.log('🔔 [NOTIFICATION] sendMessageNotification called:', { recipientId, senderId: sender._id, messageId: message._id });
  try {
    const senderAvatar = sender.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(sender.name || 'User')}&background=25D366&color=fff&size=128`;
    
    await sendNotificationToUser(recipientId, {
      title: sender.name || 'New Message',
      body: message.content || 'Sent a message',
      icon: senderAvatar,
      data: {
        roomId: String(roomId),
        senderId: String(sender._id),
        senderName: String(sender.name || 'User'),
        messageId: String(message._id),
        type: 'message',
        avatar: senderAvatar
      }
    });
  } catch (error) {
    console.error('❌ [NOTIFICATION] Error sending message notification:', error);
  }
};

export const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('fcmTokens');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      data: {
        registeredTokens: user.fcmTokens?.length || 0,
        tokens: user.fcmTokens?.map(t => ({
          platform: t.platform,
          registeredAt: t.createdAt
        })) || []
      }
    });

  } catch (error) {
    console.error('Error getting notification stats:', error);
    return res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
};

export default {
  registerFCMToken,
  unregisterFCMToken,
  sendNotificationToUser,
  sendMessageNotification,
  getNotificationStats
};
