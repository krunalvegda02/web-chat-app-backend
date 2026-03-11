import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Platform from "../models/platform.model.js";
import Contact from "../models/contact.model.js";
import MESSAGE from "../constants/message.js";
import { successResponse, errorResponse } from "../utils/response.js";

// ✅ GET AVAILABLE USERS TO CHAT WITH
export const getAvailableUsersToChat = async (req, res, next) => {
    try {
        const userRole = req.user.role;
        const userId = req.user._id;
        const platformId = req.user.platformId;
        const contactsOnly = req.query.contactsOnly === 'true';

        let availableUsers = [];

        // ✅ SUPER_ADMIN: Can chat with all PLATFORM_ADMIN users
        if (userRole === 'SUPER_ADMIN') {
            availableUsers = await User.find({
                role: 'PLATFORM_ADMIN',
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role phone')
                .lean();
        }
        // ✅ PLATFORM_ADMIN: Can chat with SUPER_ADMIN + Platform users
        else if (userRole === 'PLATFORM_ADMIN') {
            const superAdmin = await User.find({
                role: 'SUPER_ADMIN',
                status: 'ACTIVE'
            }).select('_id name email avatar role phone').lean();

            const platformUsers = await User.find({
                platformId: platformId,
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role phone')
                .lean();

            availableUsers = [...superAdmin, ...platformUsers];
        }
        // ✅ USER: Can chat with platform ADMIN + Other platform users + Contacts
        else if (userRole === 'USER') {
            const platform = await Platform.findById(platformId).lean();
            const platformAdmin = platform ? await User.findById(platform.adminId).select('_id name email avatar role phone').lean() : null;

            const otherUsers = await User.find({
                platformId: platformId,
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role phone')
                .lean();

            availableUsers = platformAdmin ? [platformAdmin, ...otherUsers] : otherUsers;
        }

        // ✅ Filter by contacts if requested
        if (contactsOnly) {
            const user = await User.findById(userId).select('contacts');
            const contactIds = user.contacts.map(c => c.userId.toString());
            availableUsers = availableUsers.filter(u =>
                contactIds.includes(u._id.toString())
            );
        }

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

// ✅ CREATE OR GET ROOM - Universal room creation
export const createOrGetRoom = async (req, res, next) => {
    try {
        const { userId } = req.body;
        const currentUserId = req.user._id;
        const currentUserRole = req.user.role;

        if (!userId) {
            return errorResponse(res, 'User ID is required', 400);
        }

        if (currentUserId.toString() === userId) {
            return errorResponse(res, 'Cannot create room with yourself', 400);
        }

        const otherUser = await User.findById(userId);
        if (!otherUser) {
            return errorResponse(res, 'User not found', 404);
        }

        if (otherUser.status !== 'ACTIVE') {
            return errorResponse(res, 'User is not active', 400);
        }

        // ✅ Check for existing room (both DIRECT and ADMIN_CHAT types)
        const sortedParticipants = [currentUserId.toString(), userId.toString()].sort();
        const directKey = `DIRECT_${sortedParticipants.join('_')}`;
        const adminChatKey = `ADMIN_CHAT_${sortedParticipants.join('_')}`;
        
        const existingRoom = await Room.findOne({
            participantKey: { $in: [directKey, adminChatKey] }
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage');

        if (existingRoom) {
            console.log(`✅ [CREATE_OR_GET] Found existing room: ${existingRoom._id} (type: ${existingRoom.type})`);
            return successResponse(res, { room: existingRoom }, 'Room found', 200);
        }

        // ✅ Determine room type based on user roles
        const currentUserIsAdmin = ['PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(currentUserRole);
        const otherUserIsAdmin = ['PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(otherUser.role);
        
        const roomType = (currentUserIsAdmin && otherUserIsAdmin) ? 'ADMIN_CHAT' : 'DIRECT';
        const participantKey = roomType === 'ADMIN_CHAT' ? adminChatKey : directKey;

        const room = new Room({
            name: `Chat - ${currentUserId} & ${userId}`,
            type: roomType,
            platformId: req.user.platformId,
            createdVia: 'direct',
            participantKey: participantKey,
            participants: [
                { userId: currentUserId, role: 'INITIATOR' },
                { userId: userId, role: 'PARTICIPANT' }
            ].sort((a, b) => a.userId.toString().localeCompare(b.userId.toString())),
            lastMessageTime: new Date()
        });

        try {
            await room.save();
        } catch (error) {
            if (error.code === 11000) {
                console.log(`⚠️ [RACE_CONDITION] Room already created`);
                const existingRoom = await Room.findOne({
                    participantKey: { $in: [directKey, adminChatKey] }
                })
                    .populate('participants.userId', 'name email avatar role')
                    .populate('lastMessage');
                
                return successResponse(res, { room: existingRoom }, 'Room found', 200);
            }
            throw error;
        }

        await room.populate('participants.userId', 'name email avatar role');
        console.log(`✅ [CREATE_OR_GET] Created new ${roomType} room: ${room._id}`);

        // ✅ Emit socket event to notify participants about new room
        const io = req.app.get('io');
        if (io) {
            room.participants.forEach(participant => {
                const participantId = participant.userId._id.toString();
                io.of('/chat').to(`user:${participantId}`).emit('room_created', { room });
                console.log(`📡 [ROOM_CREATED] Emitted to user ${participantId}`);
            });
        }

        return successResponse(res, { room }, 'Room created', 201);

    } catch (error) {
        console.error('❌ Error in createOrGetRoom:', error);
        next(error);
    }
};

// ✅ GET ALL ACTIVE ROOMS
export const getAllActiveRooms = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        if (page < 1 || limit < 1 || limit > 100) {
            return errorResponse(res, "Invalid pagination parameters", 400);
        }

        const rooms = await Room.find({
            participants: {
                $elemMatch: { userId: userId }
            },
            isArchived: false
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Room.countDocuments({
            participants: {
                $elemMatch: { userId: userId }
            },
            isArchived: false
        });

        const formattedRooms = await Promise.all(rooms.map(async room => {
            const otherParticipantIds = room.participants
                .filter(p => p.userId && p.userId._id.toString() !== userId.toString())
                .map(p => p.userId._id);

            const unreadCount = await Message.countDocuments({
                roomId: room._id,
                senderId: { $in: otherParticipantIds },
                isDeleted: false,
                'readBy.userId': { $ne: userId }
            });

            let displayName = room.name;
            let displayPhone = null;
            if (room.type === 'DIRECT' || room.type === 'ADMIN_CHAT') {
                const otherParticipant = room.participants.find(p =>
                    p.userId && p.userId._id && p.userId._id.toString() !== userId.toString()
                );
                
                if (otherParticipant?.userId?.name) {
                    displayName = otherParticipant.userId.name;
                } else if (otherParticipant?.userId?.phone) {
                    displayName = otherParticipant.userId.phone;
                }
                
                displayPhone = otherParticipant?.userId?.phone || null;
            }

            const otherParticipants = room.participants.filter(p =>
                p.userId && p.userId._id && p.userId._id.toString() !== userId.toString()
            );

            return {
                _id: room._id,
                name: displayName,
                displayPhone: displayPhone,
                type: room.type,
                participants: room.participants,
                otherParticipants: otherParticipants.map(p => p.userId),
                lastMessage: room.lastMessage,
                lastMessageTime: room.lastMessageTime,
                lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || "No messages yet",
                unreadCount: unreadCount,
                participantCount: room.participants.length,
                createdAt: room.createdAt,
                isPinned: room.isPinned || false
            };
        }));

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

// ✅ GET ROOM MESSAGES - PUBLIC (No authentication required)
export const getRoomMessagesPublic = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 60;
        const skip = (page - 1) * limit;

        const room = await Room.findById(roomId).populate('participants.userId', 'name email avatar role');
        if (!room) return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);

        console.log(`📖 [PUBLIC] Fetching messages for room ${roomId}`);

        const messages = await Message.find({ roomId, isDeleted: false })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .populate('replyTo')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments({ roomId, isDeleted: false });

        let displayName = room.name;
        let displayPhone = null;
        if (room.type === 'DIRECT' || room.type === 'ADMIN_CHAT') {
            const otherParticipant = room.participants.find(p =>
                p.userId && p.userId._id
            );
            
            if (otherParticipant?.userId?.name) {
                displayName = otherParticipant.userId.name;
            } else if (otherParticipant?.userId?.phone) {
                displayName = otherParticipant.userId.phone;
            }
            
            displayPhone = otherParticipant?.userId?.phone || null;
        }

        return successResponse(res, {
            roomId,
            room: {
                _id: room._id,
                name: displayName,
                displayPhone: displayPhone,
                type: room.type,
                participants: room.participants
            },
            messages: messages,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
};

// ✅ GET ROOM MESSAGES
export const getRoomMessages = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 60;
        const skip = (page - 1) * limit;

        const room = await Room.findById(roomId).populate('participants.userId', 'name email avatar role');
        if (!room) return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);

        const isParticipant = room.participants.some(
            p => p.userId && req.user._id && (p.userId._id?.toString() === req.user._id.toString() || p.userId.toString() === req.user._id.toString())
        );

        if (!isParticipant && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'PLATFORM_ADMIN') {
            return errorResponse(res, 'Unauthorized access', 403);
        }

        const messages = await Message.find({ roomId, isDeleted: false })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .populate('replyTo')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments({ roomId, isDeleted: false });

        let displayName = room.name;
        let displayPhone = null;
        if (room.type === 'DIRECT' || room.type === 'ADMIN_CHAT') {
            const otherParticipant = room.participants.find(p =>
                p.userId && p.userId._id && p.userId._id.toString() !== req.user._id.toString()
            );
            
            if (otherParticipant?.userId?.name) {
                displayName = otherParticipant.userId.name;
            } else if (otherParticipant?.userId?.phone) {
                displayName = otherParticipant.userId.phone;
            }
            
            displayPhone = otherParticipant?.userId?.phone || null;
        }

        return successResponse(res, {
            roomId,
            room: {
                _id: room._id,
                name: displayName,
                displayPhone: displayPhone,
                type: room.type,
                participants: room.participants
            },
            messages: messages,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
};

// ✅ SEND MESSAGE WITH MEDIA
export const sendMessageWithMedia = async (req, res, next) => {
    try {
        const { roomId, content, type, media, replyTo } = req.body;

        if (!roomId || (!content && (!media || media.length === 0))) {
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

        const message = new Message({
            roomId,
            senderId: req.user._id,
            content: content || '',
            type: type || 'text',
            media: media || [],
            status: 'sent',
            sentAt: new Date(),
            replyTo: replyTo || undefined
        });

        await message.save();
        await message.populate('senderId', 'name email avatar role');

        room.lastMessage = message._id;
        room.lastMessageTime = new Date();
        await room.save();

        // Broadcast via socket
        const io = req.app.get('io');
        if (io) {
            const messageData = {
                _id: message._id,
                roomId,
                content: message.content,
                type: message.type,
                media: message.media,
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
                optimistic: false,
            };
            io.of('/chat').to(`room:${roomId}`).emit('message_received', messageData);
        }

        return successResponse(res, { message }, 'Message sent', 201);

    } catch (error) {
        console.error('Error sending message:', error);
        next(error);
    }
};

// ✅ MARK ROOM AS READ
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

        if (room.unreadCount && room.unreadCount.has(userId)) {
            room.unreadCount.delete(userId);
            await room.save();
        }

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

export default {
    getAvailableUsersToChat,
    createOrGetRoom,
    getAllActiveRooms,
    getRoomMessages,
    getRoomMessagesPublic,
    sendMessageWithMedia,
    markRoomAsRead,
};
