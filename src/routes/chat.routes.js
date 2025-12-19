import express from 'express';
import chatController from '../controller/chat.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';

const router = express.Router();

router.use(verifyJWT);

// Discovery routes
router.get(API.CHAT.AVAILABLE_USERS, chatController.getAvailableUsersToChat);

// Room listing
router.get(API.CHAT.ROOMS, chatController.getAllActiveRooms);

// Room creation
router.post(API.CHAT.DIRECT, chatController.createDirectRoom);
router.post('/contact-chat', chatController.createChatFromContact);
router.post(API.CHAT.ADMIN_CHAT, requireRole('ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'), chatController.createAdminChat);

// Message routes
router.get(API.CHAT.ROOM_MESSAGES, chatController.getRoomMessages);
router.post('/send-message', chatController.sendMessageWithMedia);
router.get(API.CHAT.SEARCH_MESSAGES, chatController.searchMessages);

// Read status
router.post(API.CHAT.MARK_AS_READ, chatController.markRoomAsRead);

// Super admin routes
router.get(API.CHAT.ALL_CHATS, requireRole('SUPER_ADMIN'), chatController.getAllChats);
router.get(API.CHAT.ADMIN_CHATS_BY_ID, requireRole('SUPER_ADMIN'), chatController.getAdminChatsById);

// Admin member chat monitoring routes
router.get('/admin/member-chats', requireRole('ADMIN', 'TENANT_ADMIN'), chatController.getAdminMemberChats);
router.get('/admin/member-chats/:memberId', requireRole('ADMIN', 'TENANT_ADMIN'), chatController.getSpecificMemberChats);
router.get('/admin/member-chats/:memberId/room/:roomId', requireRole('ADMIN', 'TENANT_ADMIN'), chatController.getMemberChatHistory);

export default router;
