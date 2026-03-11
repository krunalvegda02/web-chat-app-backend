import express from 'express';
import chatController from '../controller/chat.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';

const router = express.Router();

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
   5. MESSAGE ACTIONS
   ===================================================== */
router.post(
    '/messages/send',
    chatController.sendMessageWithMedia
);

export default router;
