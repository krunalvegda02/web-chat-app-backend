/**
 * Socket utility functions for managing user connections
 */

// Global socket state (shared with chatSocket.js)
let globalUserSockets = new Map();

/**
 * Set the global user sockets map (called from chatSocket.js)
 */
export const setUserSocketsMap = (userSocketsMap) => {
  globalUserSockets = userSocketsMap;
};

/**
 * Force disconnect a user from socket with a reason
 */
export const forceUserDisconnect = (io, userId, reason = 'Account deactivated') => {
  try {
    const socketId = globalUserSockets.get(userId.toString());
    
    if (socketId) {
      const socket = io.of('/chat').sockets.get(socketId);
      
      if (socket) {
        console.log(`🔌 [FORCE_DISCONNECT] Disconnecting user ${userId}: ${reason}`);
        
        // Send disconnect reason to client
        socket.emit('force_disconnect', {
          reason,
          timestamp: new Date()
        });
        
        // Disconnect the socket
        socket.disconnect(true);
        
        // Clean up from global map
        globalUserSockets.delete(userId.toString());
        
        return true;
      }
    }
    
    console.log(`⚠️ [FORCE_DISCONNECT] User ${userId} not found in active connections`);
    return false;
  } catch (error) {
    console.error(`❌ [FORCE_DISCONNECT] Error disconnecting user ${userId}:`, error.message);
    return false;
  }
};

/**
 * Get online users count
 */
export const getOnlineUsersCount = () => {
  return globalUserSockets.size;
};

/**
 * Check if user is online
 */
export const isUserOnline = (userId) => {
  return globalUserSockets.has(userId.toString());
};

/**
 * Get all online user IDs
 */
export const getOnlineUserIds = () => {
  return Array.from(globalUserSockets.keys());
};