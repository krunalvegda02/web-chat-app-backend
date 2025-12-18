
import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Tenant from "../models/tenant.model.js";
import MESSAGE from "../constants/message.js";
import { successResponse, errorResponse } from "../utils/response.js";


/**
 * ✅ COMPLETE CHAT CONTROLLER - PRODUCTION READY
 * 
 * Features:
 * 1. getAvailableUsersToChat() - WHO TO CHAT WITH (Plus button)
 * 2. getAllActiveRooms() - GET MY ROOMS (Chat list)
 * 3. createDirectRoom() - CREATE 1-ON-1
 * 4. createGroupRoom() - CREATE GROUP (ADMIN)
 * 5. createAdminChat() - CREATE ADMIN CHAT
 * 6. getRoomMessages() - GET MESSAGES
 * 7. searchMessages() - SEARCH MESSAGES
 * 8. markRoomAsRead() - MARK AS READ
 * 9. getAllChats() - SUPER ADMIN VIEW ALL
 * 10. getAdminChatsById() - SUPER ADMIN VIEW ADMIN'S CHATS
 */


/* ====================================================
   1. GET AVAILABLE USERS TO CHAT WITH (FOR PLUS BUTTON)
   ✅ NEW FUNCTION - Shows who current user can chat with
   ✅ SUPER_ADMIN: All ADMINs
   ✅ ADMIN: SUPER_ADMIN + Tenant USERS
   ✅ USER: Tenant ADMIN + Other USERS
   ==================================================== */
export const getAvailableUsersToChat = async (req, res, next) => {
    try {
        const userRole = req.user.role;
        const userId = req.user._id;
        const tenantId = req.user.tenantId;

        let availableUsers = [];

        // ✅ SUPER_ADMIN: Can chat with all ADMIN users
        if (userRole === 'SUPER_ADMIN') {
            availableUsers = await User.find({
                role: { $in: ['ADMIN', 'TENANT_ADMIN'] },
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role')
                .lean();
        }
        // ✅ ADMIN/TENANT_ADMIN: Can chat with SUPER_ADMIN + Tenant members
        else if (userRole === 'ADMIN' || userRole === 'TENANT_ADMIN') {
            // Get SUPER_ADMIN
            const superAdmin = await User.find({
                role: 'SUPER_ADMIN',
                status: 'ACTIVE'
            }).select('_id name email avatar role').lean();

            // Get all tenant members (excluding self)
            const tenantMembers = await User.find({
                tenantId: tenantId,
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role')
                .lean();

            availableUsers = [...superAdmin, ...tenantMembers];
        }
        // ✅ USER: Can chat with tenant ADMIN + Other tenant members
        else if (userRole === 'USER') {
            // Get tenant admin
            const tenant = await Tenant.findById(tenantId).lean();
            const tenantAdmin = tenant ? await User.findById(tenant.adminId).select('_id name email avatar role').lean() : null;

            // Get other tenant members (excluding self)
            const otherMembers = await User.find({
                tenantId: tenantId,
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role')
                .lean();

            availableUsers = tenantAdmin ? [tenantAdmin, ...otherMembers] : otherMembers;
        }

        // Remove duplicates
        const uniqueUsers = Array.from(
            new Map(availableUsers.map(u => [u._id.toString(), u])).values()
        );

        return successResponse(res, {
            users: uniqueUsers,
            count: uniqueUsers.length
        });

    } catch (error) {
        console.error('❌ Error in getAvailableUsersToChat:', error);
        next(error);
    }
};


/* ====================================================
   2. GET ALL ACTIVE ROOMS (PARTICIPANT'S ROOMS ONLY)
   ✅ FIXED: Simple participant filtering
   ✅ Returns only rooms where current user is participant
   ✅ Supports pagination and sorting
   ==================================================== */
export const getAllActiveRooms = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        if (page < 1 || limit < 1 || limit > 100) {
            return errorResponse(res, "Invalid pagination parameters", 400);
        }

        // ✅ SIMPLE QUERY: Just find rooms where user is participant
        const query = {
            'participants.userId': userId,
            isArchived: false // Exclude archived rooms
        };

        const rooms = await Room.find(query)
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Room.countDocuments(query);

        // Format rooms with display info
        const formattedRooms = rooms.map(room => {
            const unreadCount = room.unreadCount?.get?.(userId.toString()) || 0;

            // Get display name based on room type
            let displayName = room.name;
            if (room.type === 'DIRECT' || room.type === 'ADMIN_CHAT') {
                const otherParticipant = room.participants.find(p =>
                    p.userId && p.userId._id && p.userId._id.toString() !== userId.toString()
                );
                displayName = otherParticipant?.userId?.name || room.name;
            }

            // Get other participants
            const otherParticipants = room.participants.filter(p =>
                p.userId && p.userId._id && p.userId._id.toString() !== userId.toString()
            );

            return {
                _id: room._id,
                name: displayName,
                type: room.type,
                participants: room.participants,
                otherParticipants: otherParticipants.map(p => p.userId),
                lastMessage: room.lastMessage,
                lastMessageTime: room.lastMessageTime,
                lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || "No messages yet",
                unreadCount,
                participantCount: room.participants.length,
                createdAt: room.createdAt,
                isPinned: room.isPinned || false
            };
        });

        return successResponse(res, {
            rooms: formattedRooms,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Error in getAllActiveRooms:', error);
        next(error);
    }
};


/* ====================================================
   3. CREATE DIRECT ROOM (1-ON-1 CHAT)
   ✅ FIXED: Proper role assignment
   ✅ Validates: Users can chat
   ✅ Prevents: Self-messaging
   ✅ Returns: Room with INITIATOR & PARTICIPANT roles
   ==================================================== */
export const createDirectRoom = async (req, res, next) => {
    try {
        const { userId: otherUserId } = req.body;
        const currentUserId = req.user._id;
        const currentUserRole = req.user.role;

        // ✅ Validation: Required fields
        if (!otherUserId) {
            return errorResponse(res, "Other user ID is required", 400);
        }

        // ✅ Validation: No self-messaging
        if (currentUserId.toString() === otherUserId) {
            return errorResponse(res, "Cannot create room with yourself", 400);
        }

        // ✅ Validation: Other user exists
        const otherUser = await User.findById(otherUserId);
        if (!otherUser) {
            return errorResponse(res, "User not found", 404);
        }

        if (otherUser.status !== 'ACTIVE') {
            return errorResponse(res, "User is not active", 400);
        }

        // ✅ Validation: Permission check based on roles
        let canChat = false;

        if (currentUserRole === 'SUPER_ADMIN') {
            // SUPER_ADMIN can chat with ADMIN/TENANT_ADMIN
            canChat = ['ADMIN', 'TENANT_ADMIN'].includes(otherUser.role);
        } else if (currentUserRole === 'ADMIN' || currentUserRole === 'TENANT_ADMIN') {
            // ADMIN can chat with SUPER_ADMIN or tenant members
            if (otherUser.role === 'SUPER_ADMIN') {
                canChat = true;
            } else if (otherUser.role === 'USER' && otherUser.tenantId?.toString() === req.user.tenantId?.toString()) {
                canChat = true;
            }
        } else if (currentUserRole === 'USER') {
            // USER can chat with tenant admin or other users
            if (otherUser.tenantId?.toString() === req.user.tenantId?.toString()) {
                canChat = true;
            }
        }

        if (!canChat) {
            return errorResponse(res, "You cannot chat with this user", 403);
        }

        // ✅ Check if room already exists
        const existingRoom = await Room.findOne({
            type: 'DIRECT',
            'participants.userId': {
                $all: [currentUserId, otherUserId]
            }
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage');

        if (existingRoom) {
            return successResponse(res, { room: existingRoom }, "Room already exists", 200);
        }

        // ✅ Create new DIRECT room with proper roles
        const room = new Room({
            name: `Chat - ${currentUserId} & ${otherUserId}`,
            type: 'DIRECT',
            tenantId: req.user.tenantId,
            participants: [
                {
                    userId: currentUserId,
                    role: 'INITIATOR'  // ✅ Creator
                },
                {
                    userId: otherUserId,
                    role: 'PARTICIPANT'  // ✅ Other user
                }
            ],
            lastMessageTime: new Date()
        });

        await room.save();
        await room.populate('participants.userId', 'name email avatar role');

        console.log(`✅ [DIRECT_ROOM] Created between ${currentUserId} and ${otherUserId}`);

        return successResponse(res, { room }, "Room created successfully", 201);

    } catch (error) {
        console.error('❌ Error in createDirectRoom:', error);
        next(error);
    }
};


/* ====================================================
   4. CREATE GROUP ROOM (ADMIN ONLY)
   ✅ Admin only
   ✅ Multiple participants
   ✅ Proper initialization
   ==================================================== */
export const createGroupRoom = async (req, res, next) => {
    try {
        const { name, participantIds, tenantId } = req.body;

        // ✅ Authorization: ADMIN only
        if (req.user.role !== 'ADMIN' && req.user.role !== 'TENANT_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, "Only admins can create group rooms", 403);
        }

        // ✅ Validation
        if (!name || name.trim().length === 0) {
            return errorResponse(res, "Room name is required", 400);
        }

        if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
            return errorResponse(res, "At least one participant is required", 400);
        }

        if (!tenantId) {
            return errorResponse(res, "Tenant ID is required", 400);
        }

        // ✅ Ensure initiator is in participants
        const participants = [...new Set([req.user._id.toString(), ...participantIds.map(p => p.toString())])];

        if (participants.length < 2) {
            return errorResponse(res, "Group must have at least 2 participants", 400);
        }

        // ✅ Verify all participants exist and are active
        const allUsers = await User.find({ _id: { $in: participants }, status: 'ACTIVE' });
        if (allUsers.length !== participants.length) {
            return errorResponse(res, "One or more participants not found or inactive", 404);
        }

        // ✅ Create or get room
        let room = await Room.findOne({
            type: 'GROUP',
            name: name,
            tenantId: tenantId
        });

        if (room) {
            await room.populate('participants.userId', 'name email avatar role');
            return successResponse(res, { room }, "Group room already exists", 200);
        }

        // Create new group room
        const participantDocs = participants.map((pId, index) => ({
            userId: pId,
            role: pId.toString() === req.user._id.toString() ? 'ADMIN' : 'PARTICIPANT',
            joinedAt: new Date()
        }));

        room = new Room({
            name,
            type: 'GROUP',
            tenantId,
            participants: participantDocs,
            lastMessageTime: new Date()
        });

        await room.save();
        await room.populate('participants.userId', 'name email avatar role');

        console.log(`✅ [GROUP_ROOM] Created: ${name} with ${participants.length} participants`);

        return successResponse(res, { room }, "Group room created successfully", 201);

    } catch (error) {
        console.error('❌ Error in createGroupRoom:', error);
        next(error);
    }
};


/* ====================================================
   5. CREATE ADMIN CHAT ROOM (ADMIN COMMUNICATION)
   ✅ SUPER_ADMIN & ADMIN only
   ✅ One-on-one admin communication
   ✅ FIXED: Proper participant roles
   ==================================================== */
export const createAdminChat = async (req, res, next) => {
    try {
        const { adminId } = req.body;
        const initiatorId = req.user._id;
        const initiatorRole = req.user.role;

        // ✅ Authorization
        if (initiatorRole !== 'SUPER_ADMIN' && initiatorRole !== 'ADMIN' && initiatorRole !== 'TENANT_ADMIN') {
            return errorResponse(res, "Unauthorized to create admin chat", 403);
        }

        // ✅ Validation
        if (!adminId) {
            return errorResponse(res, "Admin ID is required", 400);
        }

        if (initiatorId.toString() === adminId) {
            return errorResponse(res, "Cannot chat with yourself", 400);
        }

        // ✅ Verify other user exists and has appropriate role
        const otherUser = await User.findById(adminId);
        if (!otherUser) {
            return errorResponse(res, "User not found", 404);
        }

        if (otherUser.status !== 'ACTIVE') {
            return errorResponse(res, "User is not active", 400);
        }

        // ✅ Validate role compatibility
        const validRoles = ['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'];
        if (!validRoles.includes(otherUser.role)) {
            return errorResponse(res, `User must be ${validRoles.join(' or ')}`, 403);
        }

        // ✅ Permission check: SUPER_ADMIN can chat with ADMIN, ADMIN can chat with SUPER_ADMIN
        let canChat = false;
        if (initiatorRole === 'SUPER_ADMIN' && ['ADMIN', 'TENANT_ADMIN'].includes(otherUser.role)) {
            canChat = true;
        } else if (['ADMIN', 'TENANT_ADMIN'].includes(initiatorRole) && otherUser.role === 'SUPER_ADMIN') {
            canChat = true;
        }

        if (!canChat) {
            return errorResponse(res, "Permission denied for admin chat", 403);
        }

        // ✅ Check if room already exists
        const existingRoom = await Room.findOne({
            type: 'ADMIN_CHAT',
            'participants.userId': {
                $all: [initiatorId, adminId]
            }
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage');

        if (existingRoom) {
            return successResponse(res, { room: existingRoom }, "Admin chat already exists", 200);
        }

        // ✅ Create new ADMIN_CHAT room with proper roles
        const room = new Room({
            name: `Admin Chat - ${initiatorRole} & ${otherUser.role}`,
            type: 'ADMIN_CHAT',
            participants: [
                {
                    userId: initiatorId,
                    role: initiatorRole  // ✅ Preserve initiator role
                },
                {
                    userId: adminId,
                    role: otherUser.role  // ✅ Use actual user role
                }
            ],
            lastMessageTime: new Date()
        });

        await room.save();
        await room.populate('participants.userId', 'name email avatar role');

        console.log(`✅ [ADMIN_CHAT] Created between ${initiatorRole} (${initiatorId}) and ${otherUser.role} (${adminId})`);

        return successResponse(res, { room }, "Admin chat created successfully", 201);

    } catch (error) {
        console.error('❌ Error in createAdminChat:', error);
        next(error);
    }
};


/* ====================================================
   6. GET ROOM MESSAGES (PAGINATED + MARK READ)
   ✅ Pagination: page, limit
   ✅ Auto marks: Messages as read
   ✅ Populates: Sender, read by info
   ==================================================== */
export const getRoomMessages = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;

        if (!roomId) {
            return errorResponse(res, "Room ID is required", 400);
        }

        if (page < 1 || limit < 1 || limit > 100) {
            return errorResponse(res, "Invalid pagination parameters", 400);
        }

        const skip = (page - 1) * limit;

        // ✅ Verify room exists
        const room = await Room.findById(roomId);
        if (!room) {
            return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);
        }

        // ✅ Verify user is participant or super admin
        const isParticipant = room.participants.some(p =>
            p.userId && p.userId.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        // Fetch messages
        const messages = await Message.find({ roomId })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: 1 })
            .lean();

        const total = await Message.countDocuments({ roomId });

        // ✅ Mark messages as read for current user
        await Message.updateMany(
            {
                roomId,
                senderId: { $ne: req.user._id },
                'readBy.userId': { $ne: req.user._id }
            },
            {
                $push: {
                    readBy: {
                        userId: req.user._id,
                        readAt: new Date()
                    }
                }
            }
        );

        // ✅ Calculate status for each message
        const messagesWithStatus = messages.map(msg => {
            let status = 'sent';

            // Only calculate status for messages sent by current user
            if (msg.senderId._id.toString() === req.user._id.toString()) {
                if (msg.readBy && msg.readBy.length > 0) {
                    status = 'read';
                } else {
                    status = 'delivered';
                }
            }

            return {
                ...msg,
                status
            };
        });

        return successResponse(res, {
            roomId,
            messages: messagesWithStatus,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        })

    } catch (error) {
        console.error('❌ Error in getRoomMessages:', error);
        next(error);
    }
};


/* ====================================================
   7. SEARCH MESSAGES IN ROOM
   ✅ Text search with regex
   ✅ Authorization check
   ✅ Limits results
   ==================================================== */
export const searchMessages = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { query } = req.query;

        if (!roomId) {
            return errorResponse(res, "Room ID is required", 400);
        }

        if (!query || query.trim().length === 0) {
            return errorResponse(res, "Search query is required", 400);
        }

        // ✅ Verify room exists and user is participant
        const room = await Room.findById(roomId);
        if (!room) {
            return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);
        }

        const isParticipant = room.participants.some(p =>
            p.userId && p.userId.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        // Search messages
        const messages = await Message.find({
            roomId,
            content: { $regex: query, $options: 'i' }
        })
            .populate('senderId', 'name email avatar role')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        return successResponse(res, {
            messages,
            count: messages.length,
            query
        });

    } catch (error) {
        console.error('❌ Error in searchMessages:', error);
        next(error);
    }
};


/* ====================================================
   8. MARK ROOM AS READ
   ✅ Updates: unreadCount map
   ✅ Marks: All messages as read
   ==================================================== */
export const markRoomAsRead = async (req, res, next) => {
    try {
        const { roomId } = req.params;

        if (!roomId) {
            return errorResponse(res, "Room ID is required", 400);
        }

        const room = await Room.findById(roomId);
        if (!room) {
            return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);
        }

        const userId = req.user._id.toString();

        // ✅ Clear unread count for this user
        if (room.unreadCount && room.unreadCount.has(userId)) {
            room.unreadCount.delete(userId);
            await room.save();
        }

        // ✅ Mark all messages as read
        await Message.updateMany(
            {
                roomId,
                senderId: { $ne: req.user._id },
                'readBy.userId': { $ne: req.user._id }
            },
            {
                $push: {
                    readBy: {
                        userId: req.user._id,
                        readAt: new Date()
                    }
                }
            }
        );

        return successResponse(res, null, "Room marked as read");

    } catch (error) {
        console.error('❌ Error in markRoomAsRead:', error);
        next(error);
    }
};


/* ====================================================
   9. GET ALL CHATS (SUPER ADMIN ONLY)
   ✅ Admin: Can see all chats system-wide
   ✅ Pagination: Included
   ✅ Stats: Message count, participants
   ==================================================== */
export const getAllChats = async (req, res, next) => {
    try {
        // ✅ Authorization: SUPER_ADMIN only
        if (req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;

        if (page < 1 || limit < 1 || limit > 100) {
            return errorResponse(res, "Invalid pagination parameters", 400);
        }

        const skip = (page - 1) * limit;

        // Fetch all rooms
        const rooms = await Room.find()
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .skip(skip)
            .limit(limit)
            .sort({ lastMessageTime: -1 })
            .lean();

        const total = await Room.countDocuments();

        const roomsWithStats = rooms.map(room => ({
            ...room,
            participantCount: room.participants.length,
            type: room.type,
            lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || 'No messages'
        }));

        return successResponse(res, {
            rooms: roomsWithStats,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Error in getAllChats:', error);
        next(error);
    }
};


/* ====================================================
   10. GET ADMIN CHATS FOR SPECIFIC ADMIN
   ✅ Super admin: View all chats of an admin
   ✅ Returns: Formatted chat list with users
   ==================================================== */
export const getAdminChatsById = async (req, res, next) => {
    try {
        const { adminId } = req.params;

        // ✅ Authorization
        if (req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        if (!adminId) {
            return errorResponse(res, "Admin ID is required", 400);
        }

        // ✅ Verify admin exists
        const admin = await User.findById(adminId);
        if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'TENANT_ADMIN')) {
            return errorResponse(res, "Admin not found", 404);
        }

        // Find all rooms where admin is participant
        const rooms = await Room.find({
            'participants.userId': adminId
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .lean();

        // Format chat list
        const chats = rooms.flatMap(room => {
            const otherParticipants = room.participants.filter(p =>
                p.userId && p.userId._id.toString() !== adminId
            );

            return otherParticipants.map(participant => ({
                roomId: room._id,
                roomType: room.type,
                participantId: participant.userId._id,
                participantName: participant.userId.name,
                participantEmail: participant.userId.email,
                participantAvatar: participant.userId.avatar,
                participantRole: participant.userId.role,
                lastMessage: room.lastMessage?.content || "No messages yet",
                lastMessageTime: room.lastMessageTime || room.createdAt,
                messageCount: room.messageCount || 0
            }));
        });

        return successResponse(res, {
            adminId,
            adminName: admin.name,
            chats,
            count: chats.length
        });

    } catch (error) {
        console.error('❌ Error in getAdminChatsById:', error);
        next(error);
    }
};


// ✅ EXPORT ALL FUNCTIONS
export default {
    getAvailableUsersToChat,  // ✅ NEW
    getAllActiveRooms,        // ✅ NEW (replaces getRoomsByRole)
    createDirectRoom,         // ✅ IMPROVED (replaces createOrGetDirectRoom)
    createGroupRoom,          // ✅ IMPROVED
    createAdminChat,          // ✅ IMPROVED (replaces createOrGetAdminChatRoom)
    getRoomMessages,
    searchMessages,
    markRoomAsRead,
    getAllChats,
    getAdminChatsById
};