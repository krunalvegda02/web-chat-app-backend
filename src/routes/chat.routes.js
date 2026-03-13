import express from 'express';
import chatController from '../controller/chat.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';

const router = express.Router();

/* =====================================================
   PUBLIC ROUTES (No authentication required)
   ===================================================== */
// ✅ Public endpoint for fetching room data and messages (for platform users)
router.get(
    '/public/room/:roomId',
    chatController.getRoomMessagesPublic
);

// ✅ Public endpoint for fetching messages only
router.get(
    '/public/rooms/:roomId/messages',
    chatController.getRoomMessagesPublic
);

/* =====================================================
   AUTH MIDDLEWARE
   ===================================================== */
router.use(verifyJWT);

/* =====================================================
   1. USER DISCOVERY
   ===================================================== */
router.get(
    '/available-users',
    chatController.getAvailableUsersToChat
);

/* =====================================================
   2. ROOM LISTING
   ===================================================== */
router.get(
    '/rooms',
    chatController.getAllActiveRooms
);

/* =====================================================
   3. ROOM CREATION
   ===================================================== */
router.post(
    '/create-or-get-room',
    chatController.createOrGetRoom
);

/* =====================================================
   4. ROOM MESSAGES
   ===================================================== */
router.get(
    '/rooms/:roomId/messages',
    chatController.getRoomMessages
);

router.patch(
    '/rooms/:roomId/mark-as-read',
    chatController.markRoomAsRead
);

/* =====================================================
   5. ROOM MANAGEMENT
   ===================================================== */
router.delete(
    '/rooms/:roomId',
    chatController.deleteRoom
);

/* =====================================================
   6. ADMIN MONITORING ROUTES
   ===================================================== */
router.get(
    '/user/:userId/rooms',
    chatController.getUserRooms
);

router.get(
    '/admin/member-chats',
    chatController.getAdminMemberChats
);

router.get(
    '/admin/member-chats/:memberId',
    chatController.getSpecificMemberChats
);

router.get(
    '/admin/member-chats/:memberId/room/:roomId',
    chatController.getMemberChatHistory
);

/* =====================================================
   7. MESSAGE ACTIONS
   ===================================================== */
router.post(
    '/messages/send',
    chatController.sendMessageWithMedia
);

export default router;
