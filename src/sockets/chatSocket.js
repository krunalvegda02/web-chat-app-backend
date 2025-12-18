import Message from '../models/message.model.js';
import Room from '../models/room.model.js';
import User from '../models/user.model.js';
import { decodeToken } from '../utils/tokenUtils.js';

// ============ CONSTANTS ============

const RATE_LIMITS = {
  send_message: { limit: 20, window: 60000 },
  start_typing: { limit: 10, window: 60000 },
  mark_read: { limit: 30, window: 60000 },
  add_reaction: { limit: 50, window: 60000 },
  edit_message: { limit: 10, window: 60000 },
  delete_message: { limit: 10, window: 60000 },
};

// ============ GLOBAL STATE ============

const userSockets = new Map();
const userRateLimiters = new Map();
const activeRoomUsers = new Map();
const typingUsers = new Map();

// ============ HELPER CLASSES ============

class RateLimiter {
  constructor(userId) {
    this.userId = userId;
    this.limits = new Map();
  }

  check(event) {
    if (!RATE_LIMITS[event]) return true;

    const { limit, window } = RATE_LIMITS[event];
    const key = `${event}`;
    const now = Date.now();
    const requests = this.limits.get(key) || [];

    const validRequests = requests.filter(time => now - time < window);

    if (validRequests.length >= limit) {
      return false;
    }

    validRequests.push(now);
    this.limits.set(key, validRequests);
    return true;
  }

  clear() {
    this.limits.clear();
  }
}

// ============ HELPER FUNCTIONS ============

/**
 * ✅ FIXED: Verify user has access to room - Works for ALL roles
 */
const verifyRoomAccess = (room, userId, userRole = null) => {
  if (!room) {
    console.warn(`⚠️ [ACCESS] Room not found`);
    return { valid: false, error: 'Room not found' };
  }

  // ✅ SUPER_ADMIN, ADMIN, TENANT_ADMIN have universal access
  const universalRoles = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
  if (userRole && universalRoles.includes(userRole)) {
    console.log(`✅ [ACCESS] ${userRole} has universal room access`);
    return { valid: true };
  }

  // ✅ Check if user is a participant (for regular USER role)
  const isMember = room.participants.some(p => {
    if (!p.userId) return false;
    const userId_str = userId.toString ? userId.toString() : userId;
    // Handle both populated (p.userId._id) and unpopulated (p.userId) participants
    const participantId = p.userId._id || p.userId;
    const participantId_str = participantId.toString ? participantId.toString() : participantId;
    return participantId_str === userId_str;
  });

  if (!isMember) {
    console.warn(`⚠️ [ACCESS] User ${userId} (${userRole}) is not a member of room ${room._id}`);
    return { valid: false, error: 'Not authorized to access this room' };
  }

  console.log(`✅ [ACCESS] User ${userId} (${userRole}) is authorized for room ${room._id}`);
  return { valid: true };
};

/**
 * Verify user owns message
 */
const verifyMessageOwnership = (message, userId) => {
  if (!message) return { valid: false, error: 'Message not found' };
  if (message.senderId.toString() !== userId.toString()) {
    return { valid: false, error: 'Not authorized to modify this message' };
  }
  return { valid: true };
};

/**
 * Emit event to specific room
 */
const emitToRoom = (io, roomId, event, data) => {
  io.of('/chat').to(`room:${roomId}`).emit(event, data);
};

/**
 * Emit event to specific user
 */
const emitToUser = (io, userId, event, data) => {
  io.of('/chat').to(`user:${userId}`).emit(event, data);
};

/**
 * Broadcast to all connected clients
 */
const broadcastToAll = (io, event, data) => {
  io.of('/chat').emit(event, data);
};

/**
 * Get online users list
 */
const getOnlineUsers = () => {
  return Array.from(userSockets.keys());
};

/**
 * Update active room users
 */
const updateActiveRoomUsers = (io, roomId) => {
  const usersInRoom = activeRoomUsers.get(roomId) || new Set();
  emitToRoom(io, roomId, 'room_users_online', {
    users: Array.from(usersInRoom),
    count: usersInRoom.size,
    timestamp: new Date(),
  });
};

/**
 * Clean up user data on disconnect
 */
const cleanupUser = (io, userId) => {
  // Remove from active rooms
  for (const [roomId, users] of activeRoomUsers.entries()) {
    if (users.has(userId)) {
      users.delete(userId);
      updateActiveRoomUsers(io, roomId);
    }
  }

  // Remove from typing users
  for (const [roomId, users] of typingUsers.entries()) {
    if (users.has(userId)) {
      users.delete(userId);
      emitToRoom(io, roomId, 'user_typing', {
        userId,
        roomId,
        isTyping: false,
        timestamp: new Date(),
      });
    }
  }

  // Remove socket mapping
  userSockets.delete(userId);
  userRateLimiters.delete(userId);

  // Broadcast updated online users
  broadcastToAll(io, 'online_users', {
    users: getOnlineUsers(),
    count: getOnlineUsers().length,
    timestamp: new Date(),
  });
};

// ============ MAIN SOCKET HANDLER ============

export const registerChatSocket = (io) => {
  // ========== PERIODIC CLEANUP ==========
  setInterval(() => {
    const connectedSockets = io.of('/chat').sockets;
    const staleUsers = [];

    for (const [userId, socketId] of userSockets.entries()) {
      if (!connectedSockets.has(socketId)) {
        staleUsers.push(userId);
      }
    }

    staleUsers.forEach(userId => {
      cleanupUser(io, userId);
      console.log(`🧹 [CLEANUP] Removed stale connection for user ${userId}`);
    });
  }, 5 * 60 * 1000);

  // ========== CONNECTION HANDLER ==========
  io.of('/chat').on('connection', (socket) => {
    console.log(`✅ [SOCKET] New connection: ${socket.id}`);

    // ========== AUTHENTICATION ==========
    const origin = socket.handshake.headers.origin;
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];

    if (origin && !allowedOrigins.includes(origin)) {
      console.warn(`❌ [CORS] Invalid origin: ${origin}`);
      socket.disconnect(true);
      return;
    }

    const token = socket.handshake.auth.token;
    if (!token) {
      console.warn(`❌ [AUTH] No token provided for socket: ${socket.id}`);
      socket.emit('auth_error', { message: 'Authentication token required' });
      socket.disconnect(true);
      return;
    }

    let decoded;
    try {
      decoded = decodeToken(token);
      if (!decoded || !decoded.userId) {
        throw new Error('Invalid token payload');
      }
    } catch (error) {
      console.warn(`❌ [AUTH] Invalid token: ${error.message}`);
      socket.emit('auth_error', { message: 'Invalid authentication token' });
      socket.disconnect(true);
      return;
    }

    // ========== SETUP USER SESSION ==========
    const userId = decoded.userId;
    const userRole = decoded.role;
    userSockets.set(userId, socket.id);
    userRateLimiters.set(userId, new RateLimiter(userId));

    console.log(`👤 [AUTH] User ${userId} authenticated (role: ${userRole})`);
    console.log(`📊 [STATS] Total connections: ${io.of('/chat').sockets.size}`);

    // Join user's private room
    socket.join(`user:${userId}`);

    // Broadcast online users list
    broadcastToAll(io, 'online_users', {
      users: getOnlineUsers(),
      count: getOnlineUsers().length,
      timestamp: new Date(),
    });

    // Get rate limiter instance
    const rateLimiter = userRateLimiters.get(userId);

    // ========== EVENT: Join Room ==========
    socket.on('join_room', async ({ roomId }) => {
      try {
        if (!roomId || typeof roomId !== 'string') {
          return socket.emit('error', { message: 'Invalid room ID format' });
        }

        const room = await Room.findById(roomId);
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) {
          console.warn(`⚠️ [JOIN_ROOM] ${userId} (${userRole}) denied access to ${roomId}: ${access.error}`);
          return socket.emit('error', { message: access.error });
        }

        socket.join(`room:${roomId}`);

        if (!activeRoomUsers.has(roomId)) {
          activeRoomUsers.set(roomId, new Set());
        }
        activeRoomUsers.get(roomId).add(userId);

        console.log(`🏠 [ROOM] User ${userId} (${userRole}) joined room ${roomId}`);

        // Mark messages as read for this user
        const unreadMessages = await Message.find({
          roomId,
          senderId: { $ne: userId },
          'readBy.userId': { $ne: userId }
        }).populate('senderId', '_id');

        if (unreadMessages.length > 0) {
          const messageIds = unreadMessages.map(m => m._id);
          await Message.updateMany(
            { _id: { $in: messageIds } },
            { $push: { readBy: { userId, readAt: new Date() } } }
          );

          // Group messages by sender and emit to each sender
          const senderMessages = {};
          unreadMessages.forEach(msg => {
            const senderId = msg.senderId._id.toString();
            if (!senderMessages[senderId]) {
              senderMessages[senderId] = [];
            }
            senderMessages[senderId].push(msg._id);
          });

          // Emit messages_read event to each sender
          Object.keys(senderMessages).forEach(senderId => {
            emitToUser(io, senderId, 'messages_read', {
              roomId,
              messageIds: senderMessages[senderId],
              readBy: userId,
              timestamp: new Date()
            });
          });

          console.log(`📖 [READ] Marked ${messageIds.length} messages as read for user ${userId}`);
        }

        // Clear unread count for this user
        if (room.unreadCount && room.unreadCount.has(userId.toString())) {
          room.unreadCount.delete(userId.toString());
          await room.save();
        }

        // Broadcast updated room users
        updateActiveRoomUsers(io, roomId);

        // Notify room members
        emitToRoom(io, roomId, 'user_joined', {
          userId,
          timestamp: new Date(),
        });

      } catch (error) {
        console.error(`❌ [JOIN_ROOM] Error: ${error.message}`);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ========== EVENT: Leave Room ==========
    socket.on('leave_room', async ({ roomId }) => {
      try {
        if (!roomId || typeof roomId !== 'string') {
          return socket.emit('error', { message: 'Invalid room ID format' });
        }

        const room = await Room.findById(roomId);
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) {
          return socket.emit('error', { message: access.error });
        }

        socket.leave(`room:${roomId}`);

        const activeUsers = activeRoomUsers.get(roomId);
        if (activeUsers) {
          activeUsers.delete(userId);
        }

        const typingRoomUsers = typingUsers.get(roomId);
        if (typingRoomUsers) {
          typingRoomUsers.delete(userId);
        }

        console.log(`🚪 [ROOM] User ${userId} (${userRole}) left room ${roomId}`);

        updateActiveRoomUsers(io, roomId);

        emitToRoom(io, roomId, 'user_left', {
          userId,
          timestamp: new Date(),
        });

      } catch (error) {
        console.error(`❌ [LEAVE_ROOM] Error: ${error.message}`);
        socket.emit('error', { message: 'Failed to leave room' });
      }
    });

    // ========== EVENT: Send Message ==========
    socket.on('send_message', async ({ roomId, content }) => {
      try {
        // Rate limiting
        if (!rateLimiter.check('send_message')) {
          console.warn(`⚠️ [RATE_LIMIT] Send message rate limit exceeded for user ${userId}`);
          return socket.emit('error', { message: 'Too many messages, please slow down' });
        }

        // Validation
        if (!roomId || !content) {
          return socket.emit('error', { message: 'Room ID and content required' });
        }

        if (typeof content !== 'string' || content.trim().length === 0) {
          return socket.emit('error', { message: 'Message cannot be empty' });
        }

        if (content.trim().length > 5000) {
          return socket.emit('error', { message: 'Message is too long (max 5000 characters)' });
        }

        // Authorization - ✅ FIXED: All roles can send messages if authorized
        const room = await Room.findById(roomId).populate('participants.userId', 'name email avatar role');
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) {
          console.warn(`⚠️ [MSG] ${userId} (${userRole}) denied send in ${roomId}: ${access.error}`);
          return socket.emit('error', { message: access.error });
        }

        // Create message
        const message = new Message({
          roomId,
          senderId: userId,
          content: content.trim(),
          status: 'sent',
        });

        await message.save();
        await message.populate('senderId', 'name email avatar role');

        // Update room metadata
        room.lastMessage = message._id;
        room.lastMessageTime = new Date();

        // ✅ IMPORTANT: Don't update unreadCount for sender
        room.participants.forEach(participant => {
          if (participant.userId && participant.userId._id && participant.userId._id.toString() !== userId.toString()) {
            const currentCount = room.unreadCount.get(participant.userId._id.toString()) || 0;
            room.unreadCount.set(participant.userId._id.toString(), currentCount + 1);
          }
        });

        await room.save({ validateBeforeSave: false });

        // ========== BROADCAST MESSAGE ==========
        const messageData = {
          _id: message._id,
          roomId,
          content: message.content,
          senderId: message.senderId._id,
          sender: {
            _id: message.senderId._id,
            name: message.senderId.name,
            email: message.senderId.email,
            avatar: message.senderId.avatar,
            role: message.senderId.role,
          },
          createdAt: message.createdAt,
          status: 'sent',
          readBy: [],
          reactions: [],
          isEdited: false,
          deletedAt: null,
          optimistic: false,
        };

        // Broadcast to ALL in room (including sender)
        const roomSockets = await io.of('/chat').in(`room:${roomId}`).fetchSockets();
        console.log(`📡 [BROADCAST] Emitting to room ${roomId}, ${roomSockets.length} sockets in room`);
        emitToRoom(io, roomId, 'message_received', messageData);

        // ✅ Auto-mark as read for users currently active in the room (with delay)
        const activeUsers = activeRoomUsers.get(roomId) || new Set();
        const readByUsers = Array.from(activeUsers).filter(uid => uid !== userId.toString());
        
        if (readByUsers.length > 0) {
          // Delay to ensure sender's UI receives message first
          setTimeout(async () => {
            try {
              await Message.updateOne(
                { _id: message._id },
                { $push: { readBy: { $each: readByUsers.map(uid => ({ userId: uid, readAt: new Date() })) } } }
              );

              console.log(`📖 [AUTO_READ] Message ${message._id} marked as read in DB by ${readByUsers.length} users`);

              // Emit messages_read to sender
              emitToUser(io, userId.toString(), 'messages_read', {
                roomId,
                messageIds: [message._id],
                readBy: readByUsers,
                timestamp: new Date()
              });

              console.log(`📡 [AUTO_READ] Emitted messages_read to sender ${userId} for message ${message._id}`);
            } catch (err) {
              console.error(`❌ [AUTO_READ] Error:`, err);
            }
          }, 1000);
        } else {
          console.log(`⚠️ [AUTO_READ] No active users to mark message ${message._id} as read`);
        }

        // Stop typing indicator for sender
        emitToRoom(io, roomId, 'user_typing', {
          userId,
          roomId,
          isTyping: false,
          timestamp: new Date(),
        });

        // Remove from typing users
        const typingRoomUsers = typingUsers.get(roomId);
        if (typingRoomUsers) {
          typingRoomUsers.delete(userId);
        }

        // Notify other participants about unread count
        room.participants.forEach(participant => {
          if (participant.userId && participant.userId._id && participant.userId._id.toString() !== userId.toString()) {
            emitToUser(io, participant.userId._id.toString(), 'unread_count_updated', {
              roomId,
              unreadCount: room.unreadCount.get(participant.userId._id.toString()) || 0,
            });
          }
        });

        // ✅ ADMIN_CHAT specific notification
        if (room.type === 'ADMIN_CHAT') {
          const otherParticipant = room.participants.find(p =>
            p.userId && p.userId._id && p.userId._id.toString() !== userId.toString()
          );

          if (otherParticipant && otherParticipant.userId && otherParticipant.userId._id) {
            emitToUser(io, otherParticipant.userId._id.toString(), 'new_admin_message', {
              roomId,
              message: messageData,
            });
            console.log(`📬 [ADMIN_MSG] Notified ${otherParticipant.userId._id}`);
          }
        }

        // Emit room update
        emitToRoom(io, roomId, 'room_updated', {
          roomId,
          lastMessage: messageData,
          lastMessageTime: new Date(),
        });

        console.log(`💬 [MSG] Message ${message._id} sent in room ${roomId} by ${userId} (${userRole})`);

      } catch (error) {
        console.error(`❌ [SEND_MESSAGE] Error: ${error.message}`);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ========== EVENT: Start Typing ==========
    socket.on('start_typing', async ({ roomId }) => {
      try {
        if (!roomId || typeof roomId !== 'string') return;

        if (!rateLimiter.check('start_typing')) return;

        const room = await Room.findById(roomId);
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) return;

        if (!typingUsers.has(roomId)) {
          typingUsers.set(roomId, new Set());
        }
        typingUsers.get(roomId).add(userId);

        emitToRoom(io, roomId, 'user_typing', {
          userId,
          roomId,
          isTyping: true,
          timestamp: new Date(),
        });

        console.log(`⌨️ [TYPING] User ${userId} (${userRole}) started typing in room ${roomId}`);

      } catch (error) {
        console.error(`❌ [START_TYPING] Error: ${error.message}`);
      }
    });

    // ========== EVENT: Stop Typing ==========
    socket.on('stop_typing', async ({ roomId }) => {
      try {
        if (!roomId || typeof roomId !== 'string') return;

        const room = await Room.findById(roomId);
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) return;

        const typingRoomUsers = typingUsers.get(roomId);
        if (typingRoomUsers) {
          typingRoomUsers.delete(userId);
        }

        emitToRoom(io, roomId, 'user_typing', {
          userId,
          roomId,
          isTyping: false,
          timestamp: new Date(),
        });

        console.log(`🛑 [TYPING] User ${userId} stopped typing in room ${roomId}`);

      } catch (error) {
        console.error(`❌ [STOP_TYPING] Error: ${error.message}`);
      }
    });

    // ========== EVENT: Mark Room as Read ==========
    socket.on('mark_room_read', async ({ roomId }) => {
      try {
        if (!rateLimiter.check('mark_read')) return;
        if (!roomId) return;

        const room = await Room.findById(roomId);
        const access = verifyRoomAccess(room, userId, userRole);
        if (!access.valid) return;

        if (room.unreadCount && room.unreadCount.has(userId.toString())) {
          room.unreadCount.delete(userId.toString());
          await room.save();
        }

      } catch (error) {
        console.error(`❌ [MARK_READ] Error: ${error.message}`);
      }
    });

    // ========== EVENT: Mark Messages as Read ==========
    socket.on('mark_messages_read', async ({ roomId, messageIds }) => {
      try {
        if (!rateLimiter.check('mark_read')) return;
        if (!roomId || !messageIds || messageIds.length === 0) return;

        const room = await Room.findById(roomId);
        const access = verifyRoomAccess(room, userId, userRole);
        if (!access.valid) return;

        // Mark messages as read
        const result = await Message.updateMany(
          {
            _id: { $in: messageIds },
            senderId: { $ne: userId },
            'readBy.userId': { $ne: userId }
          },
          {
            $push: {
              readBy: {
                userId,
                readAt: new Date()
              }
            }
          }
        );

        if (result.modifiedCount > 0) {
          // Get unique senders
          const messages = await Message.find({ _id: { $in: messageIds } }).select('senderId');
          const senderIds = [...new Set(messages.map(m => m.senderId.toString()))];

          // Emit messages_read to each sender
          senderIds.forEach(senderId => {
            if (senderId !== userId.toString()) {
              emitToUser(io, senderId, 'messages_read', {
                roomId,
                messageIds,
                readBy: userId,
                timestamp: new Date()
              });
            }
          });

          console.log(`📖 [MARK_READ] User ${userId} marked ${result.modifiedCount} messages as read`);
        }

      } catch (error) {
        console.error(`❌ [MARK_MESSAGES_READ] Error: ${error.message}`);
      }
    });

    // ========== EVENT: Add Reaction ==========
    socket.on('add_reaction', async ({ messageId, emoji }) => {
      try {
        if (!rateLimiter.check('add_reaction')) {
          return socket.emit('error', { message: 'Reaction rate limit exceeded' });
        }

        if (!messageId || !emoji || typeof emoji !== 'string') {
          return socket.emit('error', { message: 'Invalid reaction data' });
        }

        if (emoji.length > 2) {
          return socket.emit('error', { message: 'Emoji must be single character' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }

        const room = await Room.findById(message.roomId);
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) {
          return socket.emit('error', { message: access.error });
        }

        const existingReaction = message.reactions.find(
          r => r.userId.toString() === userId && r.emoji === emoji
        );

        if (!existingReaction) {
          message.reactions.push({ emoji, userId });
          await message.save();

          emitToRoom(io, message.roomId, 'reaction_added', {
            messageId,
            emoji,
            userId,
            reactionCount: message.reactions.filter(r => r.emoji === emoji).length,
          });

          console.log(`😊 [REACTION] User ${userId} added ${emoji} to message ${messageId}`);
        }

      } catch (error) {
        console.error(`❌ [ADD_REACTION] Error: ${error.message}`);
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    // ========== EVENT: Remove Reaction ==========
    socket.on('remove_reaction', async ({ messageId, emoji }) => {
      try {
        if (!messageId || !emoji) {
          return socket.emit('error', { message: 'Invalid reaction data' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }

        const initialLength = message.reactions.length;
        message.reactions = message.reactions.filter(
          r => !(r.userId.toString() === userId && r.emoji === emoji)
        );

        if (message.reactions.length < initialLength) {
          await message.save();

          emitToRoom(io, message.roomId, 'reaction_removed', {
            messageId,
            emoji,
            userId,
          });

          console.log(`😔 [REACTION] User ${userId} removed ${emoji} from message ${messageId}`);
        }

      } catch (error) {
        console.error(`❌ [REMOVE_REACTION] Error: ${error.message}`);
      }
    });

    // ========== EVENT: Edit Message ==========
    socket.on('edit_message', async ({ messageId, content }) => {
      try {
        if (!rateLimiter.check('edit_message')) {
          return socket.emit('error', { message: 'Edit rate limit exceeded' });
        }

        if (!messageId || !content) {
          return socket.emit('error', { message: 'Message ID and content required' });
        }

        if (typeof content !== 'string' || content.trim().length === 0) {
          return socket.emit('error', { message: 'Edited message cannot be empty' });
        }

        if (content.trim().length > 5000) {
          return socket.emit('error', { message: 'Message is too long' });
        }

        const message = await Message.findById(messageId);
        const ownership = verifyMessageOwnership(message, userId);

        if (!ownership.valid) {
          console.warn(`⚠️ [EDIT] ${userId} tried to edit ${messageId}: ${ownership.error}`);
          return socket.emit('error', { message: ownership.error });
        }

        const room = await Room.findById(message.roomId);
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) {
          return socket.emit('error', { message: access.error });
        }

        message.content = content.trim();
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        emitToRoom(io, message.roomId, 'message_edited', {
          messageId,
          content: message.content,
          editedAt: message.editedAt,
        });

        console.log(`✏️ [EDIT] User ${userId} edited message ${messageId}`);

      } catch (error) {
        console.error(`❌ [EDIT_MESSAGE] Error: ${error.message}`);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // ========== EVENT: Delete Message ==========
    socket.on('delete_message', async ({ messageId }) => {
      try {
        if (!rateLimiter.check('delete_message')) {
          return socket.emit('error', { message: 'Delete rate limit exceeded' });
        }

        if (!messageId) {
          return socket.emit('error', { message: 'Message ID required' });
        }

        const message = await Message.findById(messageId);
        const ownership = verifyMessageOwnership(message, userId);

        if (!ownership.valid) {
          console.warn(`⚠️ [DELETE] ${userId} tried to delete ${messageId}: ${ownership.error}`);
          return socket.emit('error', { message: ownership.error });
        }

        const room = await Room.findById(message.roomId);
        const access = verifyRoomAccess(room, userId, userRole);

        if (!access.valid) {
          return socket.emit('error', { message: access.error });
        }

        message.deletedAt = new Date();
        await message.save();

        emitToRoom(io, message.roomId, 'message_deleted', {
          messageId,
          deletedAt: message.deletedAt,
        });

        console.log(`🗑️ [DELETE] User ${userId} deleted message ${messageId}`);

      } catch (error) {
        console.error(`❌ [DELETE_MESSAGE] Error: ${error.message}`);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // ========== EVENT: Disconnect ==========
    socket.on('disconnect', () => {
      cleanupUser(io, userId);
      console.log(`🔌 [DISCONNECT] User ${userId} (${userRole}) disconnected`);
      console.log(`📊 [STATS] Remaining connections: ${io.of('/chat').sockets.size}`);
    });

    // ========== ERROR HANDLING ==========
    socket.on('error', (error) => {
      console.error(`❌ [SOCKET_ERROR] ${userId} (${userRole}): ${error.message}`);
    });

  });

};

export default registerChatSocket;
