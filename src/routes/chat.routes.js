// src/routes/chatRoutes.js
import express from 'express';
import chatController from '../controller/chat.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';

const router = express.Router();

// Protected routes
router.get(API.CHAT.ROOMS, verifyJWT, chatController.getRooms);
router.post(API.CHAT.CREATE_ROOM, verifyJWT, chatController.createRoom);
router.get(API.CHAT.ROOM_DETAILS, verifyJWT, chatController.getRoomDetails);
router.get(API.CHAT.ROOM_MESSAGES, verifyJWT, chatController.getRoomMessages);
router.post(API.CHAT.MARK_AS_READ, verifyJWT, chatController.markAsRead);
router.get(API.CHAT.SEARCH_MESSAGES, verifyJWT, chatController.searchMessages);

// Super admin routes
router.get(API.CHAT.ALL_CHATS, verifyJWT, requireRole('SUPER_ADMIN'), chatController.getAllChats);
router.get(API.CHAT.ADMIN_ROOMS, verifyJWT, requireRole('SUPER_ADMIN'), chatController.getAdminRooms);
router.post(API.CHAT.CREATE_ADMIN_ROOM, verifyJWT, requireRole('SUPER_ADMIN'), chatController.createAdminRoom);
router.get(API.CHAT.ADMIN_CHATS, verifyJWT, requireRole('SUPER_ADMIN'), chatController.getAdminChats);

// Admin routes
router.get(API.CHAT.ADMIN_CHAT_ROOMS, verifyJWT, chatController.getAdminChatRooms);
router.post(API.CHAT.CREATE_OR_GET_ADMIN_ROOM, verifyJWT, chatController.createOrGetAdminRoom);

export default router;

