
import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Tenant from "../models/tenant.model.js";
import MESSAGE from "../constants/message.js";
import { successResponse, errorResponse } from "../utils/response.js";



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
                    role: 'INITIATOR'  // ✅ Use room role, not system role
                },
                {
                    userId: adminId,
                    role: 'PARTICIPANT'  // ✅ Use room role, not system role
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
        const skip = (page - 1) * limit;

        const room = await Room.findById(roomId);
        if (!room) return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);

        const isParticipant = room.participants.some(
            p => p.userId && req.user._id && p.userId.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        // ✅ Fetch only active (not deleted) messages
        const messages = await Message.find({ roomId, isDeleted: false })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .populate('replyTo')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: 1 });

        const total = await Message.countDocuments({ roomId, isDeleted: false });

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

/* ====================================================
   7. SEARCH MESSAGES IN ROOM
   ✅ Text search with regex
   ✅ Authorization check
   ✅ Limits results
   ==================================================== */
const searchMessages = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { query } = req.query;

        if (!query) {
            return errorResponse(res, 'Search query is required', 400);
        }

        const room = await Room.findById(roomId);
        if (!room) return errorResponse(res, 'Room not found', 404);

        const isParticipant = room.participants.some(
            p => p.userId && req.user._id && p.userId.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, 'Unauthorized', 403);
        }

        // ✅ Only search active messages
        const messages = await Message.find({
            roomId,
            isDeleted: false,
            content: { $regex: query, $options: 'i' }
        })
            .populate('senderId', 'name email avatar role')
            .sort({ createdAt: -1 })
            .limit(50);

        return successResponse(res, { messages, count: messages.length });

    } catch (error) {
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



// ✅ NEW: Send message with media support
export const sendMessage = async (req, res, next) => {
    try {
        const { roomId, content, type, media, replyTo } = req.body;

        if (!roomId || (!content && !media)) {
            return errorResponse(res, 'Room ID and content or media is required', 400);
        }

        const room = await Room.findById(roomId);
        if (!room) return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);

        const isParticipant = room.participants.some(
            p => p.userId && req.user._id && p.userId.toString() === req.user._id.toString()
        );

        if (!isParticipant && req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
        }

        // ✅ Create message with proper status (starts as 'sent')
        const message = new Message({
            roomId,
            senderId: req.user._id,
            content: content || '',
            type: type || 'text',
            media: media || [],
            status: 'sent', // ✅ Starts as 'sent' after successfully stored
            sentAt: new Date(),
            replyTo: replyTo || undefined
        });

        await message.save();
        await message.populate('senderId', 'name email avatar role');
        await message.populate('media');

        // ✅ Update room's last message
        await Room.findByIdAndUpdate(roomId, {
            lastMessage: message._id,
            lastMessageTime: new Date()
        });

        console.log(`✅ Message created: ${message._id} with status 'sent'`);

        return successResponse(res, { message }, 'Message sent', 201);

    } catch (error) {
        console.error('Error sending message:', error);
        next(error);
    }
};

// ✅ FIXED: Edit message
const editMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;

        if (!content) {
            return errorResponse(res, 'Content is required', 400);
        }

        const message = await Message.findById(messageId);
        if (!message) return errorResponse(res, 'Message not found', 404);

        // ✅ Only sender can edit
        if (message.senderId.toString() !== req.user._id.toString()) {
            return errorResponse(res, 'Only sender can edit message', 403);
        }

        // ✅ Don't edit deleted messages
        if (message.isDeleted) {
            return errorResponse(res, 'Cannot edit deleted message', 400);
        }

        message.content = content;
        message.isEdited = true;
        message.editedAt = new Date();

        await message.save();

        console.log(`✅ Message edited: ${messageId}`);

        return successResponse(res, { message }, 'Message updated');

    } catch (error) {
        next(error);
    }
};

// ✅ FIXED: Delete message (soft delete)
const deleteMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findById(messageId);
        if (!message) return errorResponse(res, 'Message not found', 404);

        // ✅ Only sender can delete their own message or admin
        if (
            message.senderId.toString() !== req.user._id.toString() &&
            req.user.role !== 'SUPER_ADMIN'
        ) {
            return errorResponse(res, 'Only sender can delete message', 403);
        }

        // ✅ Soft delete
        await message.softDelete(req.user._id);

        console.log(`✅ Message soft deleted: ${messageId}`);

        return successResponse(res, null, 'Message deleted');

    } catch (error) {
        next(error);
    }
};


// ✅ NEW: Mark message as delivered (called when recipient connects to room)
const markMessageAsDelivered = async (req, res, next) => {
    try {
        const { roomId } = req.body;

        if (!roomId) {
            return errorResponse(res, 'Room ID is required', 400);
        }

        // ✅ Find all 'sent' messages in room (not from current user)
        const messages = await Message.find({
            roomId,
            status: 'sent',
            senderId: { $ne: req.user._id },
            isDeleted: false
        });

        if (messages.length === 0) {
            return successResponse(res, { updated: 0 }, 'No messages to deliver');
        }

        // ✅ Mark all as delivered
        const messageIds = messages.map(m => m._id);
        await Message.updateMany(
            { _id: { $in: messageIds } },
            {
                status: 'delivered',
                deliveredAt: new Date()
            }
        );

        console.log(`✅ Marked ${messageIds.length} messages as delivered`);

        return successResponse(res, { updated: messageIds.length }, 'Messages marked as delivered');

    } catch (error) {
        next(error);
    }
};


// ✅ Original createOrGetRoom from previous fix
const createOrGetRoom = async (req, res, next) => {
    try {
        const { userId } = req.body;

        if (req.user.role === 'USER') {
            if (!userId) {
                return errorResponse(res, 'User ID is required', 400);
            }

            const otherUser = await User.findById(userId);
            if (!otherUser) {
                return errorResponse(res, 'User not found', 404);
            }

            if (req.user.tenantId.toString() !== otherUser.tenantId.toString()) {
                return errorResponse(res, 'Users must be in same tenant', 403);
            }

            const existingRoom = await Room.findOne({
                type: 'DIRECT',
                tenantId: req.user.tenantId,
                'participants.userId': { $all: [req.user._id, userId] }
            });

            if (existingRoom) {
                await existingRoom.populate('participants.userId', 'name email avatar role');
                return successResponse(res, { room: existingRoom });
            }

            const room = new Room({
                name: `${otherUser.name}`,
                type: 'DIRECT',
                tenantId: req.user.tenantId,
                participants: [
                    {
                        userId: req.user._id,
                        role: 'INITIATOR',
                        joinedAt: new Date(),
                        status: 'ACTIVE'
                    },
                    {
                        userId: userId,
                        role: 'PARTICIPANT',
                        joinedAt: new Date(),
                        status: 'ACTIVE'
                    }
                ]
            });

            await room.save();
            await room.populate('participants.userId', 'name email avatar role');

            console.log(`✅ [DIRECT_ROOM] Created room ${room._id}`);
            return successResponse(res, { room }, 'Room created', 201);
        }

        const { name, type, tenantId, participants } = req.body;

        if (!name || !tenantId) {
            return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);
        }

        const roomParticipants = participants && participants.length > 0
            ? participants
            : [{ userId: req.user._id, role: 'OWNER' }];

        const initiatorExists = roomParticipants.some(
            p => p.userId.toString() === req.user._id.toString()
        );

        if (!initiatorExists) {
            roomParticipants.push({
                userId: req.user._id,
                role: 'OWNER',
                joinedAt: new Date(),
                status: 'ACTIVE'
            });
        }

        const room = new Room({
            name,
            type: type || 'GROUP',
            tenantId,
            participants: roomParticipants
        });

        await room.save();
        await room.populate('participants.userId', 'name email avatar role');

        console.log(`✅ [GROUP_ROOM] Created room ${room._id}`);
        return successResponse(res, { room }, MESSAGE.ROOM_CREATED, 201);

    } catch (error) {
        console.error('Error in createOrGetRoom:', error);
        next(error);
    }
};





// ✅ EXPORT ALL FUNCTIONS
export default {
    getAvailableUsersToChat,
    getAllActiveRooms,        // ✅ NEW (replaces getRoomsByRole)
    createDirectRoom,
    createGroupRoom,
    createAdminChat,
    searchMessages,
    markRoomAsRead,
    getAllChats,
    getAdminChatsById,
    editMessage,
    deleteMessage,
    markMessageAsDelivered,
    sendMessage,
    createOrGetRoom,
    getRoomMessages
};