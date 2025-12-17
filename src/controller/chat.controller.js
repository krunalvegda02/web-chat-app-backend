// src/controllers/chatController.js (PURE ARROW FUNCTIONS)

import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import MESSAGE from "../constants/message.js";
import { successResponse, errorResponse } from "../utils/response.js";

/* ===============================
   GET ROOMS FOR  
(tenant rooms OR admin rooms)
================================ */
const getRooms = async (req, res, next) => {
    try {
        const { tenantId } = req.query;

        // ✅ If tenantId provided, fetch tenant-based rooms
        if (tenantId) {
            const rooms = await Room.find({
                tenantId,
                type: { $ne: 'ADMIN_CHAT' }, // Exclude ADMIN_CHAT
                "participants.userId": req.user._id
            })
                .populate("participants.userId", "name email avatar")
                .populate("lastMessage")
                .sort({ lastMessageTime: -1 });

            const roomsWithPreview = rooms.map(room => ({
                ...room.toObject(),
                lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || "No messages yet",
                unreadCount: room.unreadCount?.get(req.user._id.toString()) || 0
            }));

            return successResponse(res, { rooms: roomsWithPreview });
        }

        // ✅ If no tenantId, return error (should always have tenantId for tenant users)
        return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);

    } catch (error) {
        next(error);
    }
};




/* ===============================
   GET ROOM DETAILS
================================ */
const getRoomDetails = async (req, res, next) => {
    try {
        const { roomId } = req.params;

        const room = await Room.findById(roomId)
            .populate("participants.userId", "name email avatar")
            .populate("lastMessage");

        if (!room) {
            return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);
        }

        const isParticipant = room.participants.some(
            p => p.userId && p.userId._id && req.user._id && p.userId._id.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== "SUPER_ADMIN") {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        return successResponse(res, { room });

    } catch (error) {
        next(error);
    }
};


/* ===============================
   GET ROOM MESSAGES
================================ */
const getRoomMessages = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const room = await Room.findById(roomId);
        if (!room) return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);

        const isParticipant = room.participants.some(
            p => p.userId && req.user._id && p.userId.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== "SUPER_ADMIN") {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        const messages = await Message.find({ roomId })
            .populate("senderId", "name email avatar role")
            .populate("readBy.userId", "name")
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: 1 });

        const total = await Message.countDocuments({ roomId });

        // Mark unread messages as read
        await Message.updateMany(
            { roomId, "readBy.userId": { $ne: req.user._id } },
            { $push: { readBy: { userId: req.user._id, readAt: new Date() } } }
        );

        return successResponse(res, {
            roomId,
            messages,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
};


/* ===============================
   SEARCH MESSAGES
================================ */
const searchMessages = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { query } = req.query;

        if (!query) {
            return errorResponse(res, "Search query is required", 400);
        }

        const room = await Room.findById(roomId);
        if (!room) return errorResponse(res, "Room not found", 404);

        const isParticipant = room.participants.some(
            p => p.userId && req.user._id && p.userId.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== "SUPER_ADMIN") {
            return errorResponse(res, "Unauthorized", 403);
        }

        const messages = await Message.find({
            roomId,
            content: { $regex: query, $options: "i" }
        })
            .populate("senderId", "name email avatar role")
            .sort({ createdAt: -1 })
            .limit(50);

        return successResponse(res, { messages });

    } catch (error) {
        next(error);
    }
};


/* ===============================
   CREATE ROOM
================================ */
const createRoom = async (req, res, next) => {
    try {
        const { name, type, tenantId, participants } = req.body;

        if (!name || !tenantId) {
            return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);
        }

        const room = new Room({
            name,
            type: type || "GROUP",
            tenantId,
            participants: participants || [{ userId: req.user._id }]
        });

        await room.save();
        await room.populate("participants.userId", "name email avatar");

        return successResponse(res, { room }, MESSAGE.ROOM_CREATED, 201);

    } catch (error) {
        next(error);
    }
};


/* ===============================
   MARK ROOM AS READ
================================ */
const markAsRead = async (req, res, next) => {
    try {
        const { roomId } = req.params;

        const room = await Room.findById(roomId);
        if (!room) return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);

        if (req.user._id) {
            room.unreadCount.delete(req.user._id.toString());
        }
        await room.save();

        return successResponse(res, null, MESSAGE.MARKED_AS_READ);

    } catch (error) {
        next(error);
    }
};


/* ===============================
   CREATE ADMIN ROOM
================================ */
// ✅ FIXED: Create or fetch ADMIN_CHAT room (ensures Admin is participant)
const createAdminRoom = async (req, res, next) => {
    try {
        const { adminId } = req.body;

        if (req.user.role !== "SUPER_ADMIN") {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        if (!adminId) {
            return errorResponse(res, "Admin ID is required", 400);
        }

        // ✅ Verify admin exists
        const adminUser = await User.findById(adminId);
        if (!adminUser || adminUser.role !== 'ADMIN') {
            return errorResponse(res, "Admin not found", 404);
        }

        // ✅ Check if room already exists
        const existingRoom = await Room.findOne({
            type: "ADMIN_CHAT",
            "participants.userId": { $all: [req.user._id, adminId] }
        });

        if (existingRoom) {
            await existingRoom.populate("participants.userId", "name email avatar role");
            return successResponse(res, { room: existingRoom });
        }

        // ✅ Create new room
        const room = new Room({
            name: `Chat with ${adminUser.name}`,
            type: "ADMIN_CHAT",
            participants: [
                {
                    userId: req.user._id,
                    role: 'OWNER'
                },
                {
                    userId: adminId,
                    role: 'ADMIN'
                }
            ]
        });

        await room.save();
        await room.populate("participants.userId", "name email avatar role");

        console.log(`✅ [ADMIN_ROOM] Created room ${room._id} between Super Admin and Admin ${adminId}`);

        return successResponse(res, { room }, "Admin room created", 201);

    } catch (error) {
        console.error('Error creating admin room:', error);
        next(error);
    }
};



/* ===============================
   GET ADMIN ROOMS (SUPER ADMIN)
================================ */
const getAdminRooms = async (req, res, next) => {
    try {
        if (req.user.role !== "SUPER_ADMIN") {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        const rooms = await Room.find({
            type: "ADMIN_CHAT",
            "participants.userId": req.user._id
        })
            .populate("participants.userId", "name email avatar role")
            .populate("lastMessage")
            .sort({ lastMessageTime: -1 });

        const roomsWithPreview = rooms.map(room => {
            const otherParticipant = room.participants.find(p =>
                p.userId && p.userId._id && req.user._id &&
                p.userId._id.toString() !== req.user._id.toString()
            );

            const roomObj = room.toObject();
            const displayName = otherParticipant?.userId?.name || roomObj.name;

            return {
                ...roomObj,
                name: displayName,
                displayName,
                lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || "No messages yet",
                unreadCount: req.user._id ? (room.unreadCount?.get(req.user._id.toString()) || 0) : 0,
                otherParticipant: otherParticipant?.userId || null,
                type: 'ADMIN_CHAT'
            };
        });

        return successResponse(res, roomsWithPreview);

    } catch (error) {
        console.error('Error fetching admin rooms:', error);
        next(error);
    }
};



/* ===============================
   GET ALL CHATS (SUPER ADMIN)
================================ */
const getAllChats = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const chats = await Room.find()
            .populate("tenantId", "name")
            .populate("participants.userId", "name email")
            .populate("lastMessage")
            .skip(skip)
            .limit(limit)
            .sort({ lastMessageTime: -1 });

        const total = await Room.countDocuments();

        const chatsWithStats = chats.map(chat => ({
            ...chat.toObject(),
            participantCount: chat.participants.length,
            messageCount: chat.lastMessage ? 1 : 0
        }));

        return successResponse(res, {
            chats: chatsWithStats,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
};

/* ===============================
   GET ADMIN CHATS BY ADMIN ID (SUPER ADMIN)
================================ */
const getAdminChats = async (req, res, next) => {
    try {
        const { adminId } = req.params;

        if (req.user.role !== "SUPER_ADMIN") {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        if (!adminId) {
            return errorResponse(res, "Admin ID is required", 400);
        }

        // Find all rooms where the admin is a participant
        const rooms = await Room.find({
            "participants.userId": adminId
        })
            .populate("participants.userId", "name email avatar role")
            .populate("lastMessage")
            .sort({ lastMessageTime: -1 });

        const chatParticipants = [];

        for (const room of rooms) {
            const otherParticipants = room.participants.filter(p =>
                p.userId && p.userId._id.toString() !== adminId
            );

            // For each other participant, create a chat entry
            for (const participant of otherParticipants) {
                chatParticipants.push({
                    roomId: room._id,
                    participantId: participant.userId._id,
                    participantName: participant.userId.name,
                    participantEmail: participant.userId.email,
                    participantAvatar: participant.userId.avatar,
                    participantRole: participant.userId.role,
                    lastMessage: room.lastMessage?.content || "No messages yet",
                    lastMessageTime: room.lastMessageTime || room.createdAt
                });
            }
        }

        return successResponse(res, chatParticipants);

    } catch (error) {
        console.error('Error fetching admin chats:', error);
        next(error);
    }
};



// ✅ NEW: Get ADMIN_CHAT rooms for user (Admin or Super Admin)
const getAdminChatRooms = async (req, res, next) => {
    try {
        // ✅ Only ADMIN or SUPER_ADMIN can fetch admin rooms
        if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        // ✅ Fetch all ADMIN_CHAT rooms where user is participant
        const rooms = await Room.find({
            type: 'ADMIN_CHAT',
            "participants.userId": req.user._id
        })
            .populate("participants.userId", "name email avatar role")
            .populate("lastMessage")
            .sort({ lastMessageTime: -1 });

        // ✅ Format with other participant name as room name
        const roomsWithPreview = rooms.map(room => {
            const otherParticipant = room.participants.find(p =>
                p.userId && p.userId._id && req.user._id &&
                p.userId._id.toString() !== req.user._id.toString()
            );

            const displayName = otherParticipant?.userId?.name || room.name;

            return {
                ...room.toObject(),
                name: displayName,
                displayName,
                lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || "No messages yet",
                unreadCount: room.unreadCount?.get(req.user._id.toString()) || 0,
                otherParticipant: otherParticipant?.userId || null,
                type: 'ADMIN_CHAT'
            };
        });

        return successResponse(res, { rooms: roomsWithPreview });

    } catch (error) {
        next(error);
    }
};



// ✅ NEW: Get correct rooms based on user role
const getChatRoomsByRole = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    let rooms = [];

    if (userRole === 'SUPER_ADMIN') {
      // SUPER_ADMIN: See all ADMIN_CHAT rooms
      rooms = await Room.find({ type: 'ADMIN_CHAT', 'participants.userId': req.user._id })
        .populate('participants.userId', 'name email avatar role')
        .populate('lastMessage')
        .sort({ lastMessageTime: -1 });

    } else if (userRole === 'ADMIN' || userRole === 'TENANT_ADMIN') {
      // ADMIN/TENANT_ADMIN: See ADMIN_CHAT with SUPER_ADMIN + GROUP rooms
      rooms = await Room.find({
        $or: [
          { type: 'ADMIN_CHAT', 'participants.userId': req.user._id },
          { type: 'GROUP', 'participants.userId': req.user._id }
        ]
      })
        .populate('participants.userId', 'name email avatar role')
        .populate('lastMessage')
        .sort({ lastMessageTime: -1 });

    } else if (userRole === 'USER') {
      // USER: See only their assigned rooms
      const { tenantId } = req.query;
      rooms = await Room.find({
        type: { $ne: 'ADMIN_CHAT' },
        tenantId: tenantId || req.user.tenantId,
        'participants.userId': req.user._id
      })
        .populate('participants.userId', 'name email avatar role')
        .populate('lastMessage')
        .sort({ lastMessageTime: -1 });
    }

    const roomsWithPreview = rooms.map(room => ({
      ...room.toObject(),
      lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || 'No messages yet',
      unreadCount: room.unreadCount?.get(req.user._id.toString()) || 0
    }));

    return successResponse(res, { rooms: roomsWithPreview });

  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    next(error);
  }
};

// ✅ NEW: Create admin room - Ensure ADMIN is always participant
const createOrGetAdminRoom = async (req, res, next) => {
  try {
    const { adminId } = req.body;
    const initiatorRole = req.user.role;

    // ✅ Allow SUPER_ADMIN to initiate or ADMIN to initiate with SUPER_ADMIN
    if (initiatorRole === 'SUPER_ADMIN' && !adminId) {
      return errorResponse(res, 'Admin ID is required for SUPER_ADMIN', 400);
    }

    if (initiatorRole === 'ADMIN' && !req.body.superAdminId) {
      return errorResponse(res, 'Super Admin ID is required for ADMIN', 400);
    }

    let participant1, participant2;

    if (initiatorRole === 'SUPER_ADMIN') {
      participant1 = req.user._id;
      const adminUser = await User.findById(adminId);
      if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'TENANT_ADMIN')) {
        return errorResponse(res, 'Invalid admin ID', 404);
      }
      participant2 = adminId;
    } else if (initiatorRole === 'ADMIN' || initiatorRole === 'TENANT_ADMIN') {
      participant1 = req.user._id;
      participant2 = req.body.superAdminId;
      const superAdmin = await User.findById(participant2);
      if (!superAdmin || superAdmin.role !== 'SUPER_ADMIN') {
        return errorResponse(res, 'Invalid super admin ID', 404);
      }
    }

    // ✅ Check if room already exists
    const existingRoom = await Room.findOne({
      type: 'ADMIN_CHAT',
      'participants.userId': { $all: [participant1, participant2] }
    });

    if (existingRoom) {
      await existingRoom.populate('participants.userId', 'name email avatar role');
      return successResponse(res, { room: existingRoom });
    }

    // ✅ Create new room
    const room = new Room({
      name: `Admin Chat - ${new Date().getTime()}`,
      type: 'ADMIN_CHAT',
      participants: [
        { userId: participant1, role: initiatorRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN' },
        { userId: participant2, role: initiatorRole === 'SUPER_ADMIN' ? 'ADMIN' : 'SUPER_ADMIN' }
      ]
    });

    await room.save();
    await room.populate('participants.userId', 'name email avatar role');

    console.log(`✅ [ADMIN_ROOM] Created between ${initiatorRole} and counterpart`);
    return successResponse(res, { room }, 'Admin room created', 201);

  } catch (error) {
    console.error('Error creating admin room:', error);
    next(error);
  }
};

// Export in your controller
export default {
  getRooms,
  getRoomDetails,
  getRoomMessages,
  searchMessages,
  createRoom,
  markAsRead,
  getAdminRooms,
  createAdminRoom,
  getAdminChats,
  getAdminChatRooms,
  getChatRoomsByRole,      // ✅ NEW
  createOrGetAdminRoom,     // ✅ NEW
  getAllChats,
};


