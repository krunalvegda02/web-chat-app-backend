import express from 'express';
import chatController from '../controller/chat.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';

const router = express.Router();

// ✅ Universal routes (all roles)
router.get(API.CHAT.AVAILABLE_USERS, verifyJWT, chatController.getAvailableUsersToChat);
router.get(API.CHAT.ROOMS, verifyJWT, chatController.getAllActiveRooms);
router.get(API.CHAT.ROOM_MESSAGES, verifyJWT, chatController.getRoomMessages);
router.post(API.CHAT.MARK_AS_READ, verifyJWT, chatController.markRoomAsRead);
router.get(API.CHAT.SEARCH_MESSAGES, verifyJWT, chatController.searchMessages);

// ✅ Room creation routes
router.post(API.CHAT.DIRECT, verifyJWT, chatController.createDirectRoom);
router.post(API.CHAT.ADMIN_CHAT, verifyJWT, chatController.createAdminChat);

// ✅ Super admin routes
router.get(API.CHAT.ALL_CHATS, verifyJWT, requireRole('SUPER_ADMIN'), chatController.getAllChats);
router.get(API.CHAT.ADMIN_CHATS_BY_ID, verifyJWT, requireRole('SUPER_ADMIN'), chatController.getAdminChatsById);

export default router;

