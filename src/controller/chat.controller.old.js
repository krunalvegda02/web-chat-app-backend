
import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Tenant from "../models/tenant.model.js";
import Contact from "../models/contact.model.js";
import MESSAGE from "../constants/message.js";
import { successResponse, errorResponse } from "../utils/response.js";



/* ====================================================
   1. GET AVAILABLE USERS TO CHAT WITH (FOR PLUS BUTTON)
   ✅ NEW FUNCTION - Shows who current user can chat with
   ✅ SUPER_ADMIN: All ADMINs
   ✅ ADMIN: SUPER_ADMIN + Tenant USERS
   ✅ USER: Tenant ADMIN + Other USERS + Contacts
   ==================================================== */
export const getAvailableUsersToChat = async (req, res, next) => {
    try {
        const userRole = req.user.role;
        const userId = req.user._id;
        const tenantId = req.user.tenantId;
        const contactsOnly = req.query.contactsOnly === 'true';

        let availableUsers = [];

        // ✅ SUPER_ADMIN: Can chat with all ADMIN users
        if (userRole === 'SUPER_ADMIN') {
            availableUsers = await User.find({
                role: { $in: ['ADMIN', 'TENANT_ADMIN'] },
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role phone')
                .lean();
        }
        // ✅ ADMIN/TENANT_ADMIN: Can chat with SUPER_ADMIN + Tenant members
        else if (userRole === 'ADMIN' || userRole === 'TENANT_ADMIN') {
            const superAdmin = await User.find({
                role: 'SUPER_ADMIN',
                status: 'ACTIVE'
            }).select('_id name email avatar role phone').lean();

            const tenantMembers = await User.find({
                tenantId: tenantId,
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role phone')
                .lean();

            availableUsers = [...superAdmin, ...tenantMembers];
        }
        // ✅ USER: Can chat with tenant ADMIN + Other tenant members + Contacts
        else if (userRole === 'USER') {
            const tenant = await Tenant.findById(tenantId).lean();
            const tenantAdmin = tenant ? await User.findById(tenant.adminId).select('_id name email avatar role phone').lean() : null;

            const otherMembers = await User.find({
                tenantId: tenantId,
                _id: { $ne: userId },
                status: 'ACTIVE'
            })
                .select('_id name email avatar role phone')
                .lean();

            availableUsers = tenantAdmin ? [tenantAdmin, ...otherMembers] : otherMembers;
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

        // Get user's contacts for display name mapping
        const userContacts = await Contact.find({ userId }).populate('contactUserId', '_id name phone').lean();
        const contactMap = new Map();
        userContacts.forEach(contact => {
            if (contact.contactUserId) {
                contactMap.set(contact.contactUserId._id.toString(), {
                    contactName: contact.contactName,
                    phone: contact.contactUserId.phone
                });
            }
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
                const otherUserId = otherParticipant?.userId?._id?.toString();
                const contactInfo = otherUserId ? contactMap.get(otherUserId) : null;
                
                // Priority: contactName > userName > phone
                if (contactInfo?.contactName) {
                    displayName = contactInfo.contactName;
                } else if (otherParticipant?.userId?.name) {
                    displayName = otherParticipant.userId.name;
                } else if (otherParticipant?.userId?.phone) {
                    displayName = otherParticipant.userId.phone;
                }
                
                displayPhone = otherParticipant?.userId?.phone || null;
                console.log(`[ROOM ${room._id}] Type: ${room.type}, Display name: ${displayName}, Phone: ${displayPhone}`);
            }

            const otherParticipants = room.participants.filter(p =>
                p.userId && p.userId._id && p.userId._id.toString() !== userId.toString()
            );

            let firstUnreadMessage = null;
            if (unreadCount > 0) {
                firstUnreadMessage = await Message.findOne({
                    roomId: room._id,
                    senderId: { $in: otherParticipantIds },
                    isDeleted: false,
                    'readBy.userId': { $ne: userId }
                })
                    .sort({ createdAt: 1 })
                    .select('content createdAt type media')
                    .lean();
            }

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
                firstUnreadMessage: firstUnreadMessage ? {
                    content: firstUnreadMessage.content?.substring(0, 50) || '',
                    createdAt: firstUnreadMessage.createdAt,
                    type: firstUnreadMessage.type,
                    media: firstUnreadMessage.media
                } : null,
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

        const isBlocked = otherUser.blockedUsers?.some(
            b => b.userId?.toString() === currentUserId.toString()
        );

        if (isBlocked) {
            return errorResponse(res, "User has blocked you", 403);
        }

        // ✅ Validation: Permission check based on roles
        let canChat = false;

        if (currentUserRole === 'SUPER_ADMIN') {
            // SUPER_ADMIN can chat with anyone
            canChat = true;
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

        // ✅ Check if room already exists using participantKey (check both DIRECT and ADMIN_CHAT)
        const sortedParticipants = [currentUserId.toString(), otherUserId.toString()].sort();
        const directKey = `DIRECT_${sortedParticipants.join('_')}`;
        const adminChatKey = `ADMIN_CHAT_${sortedParticipants.join('_')}`;
        
        const existingRoom = await Room.findOne({
            participantKey: { $in: [directKey, adminChatKey] }
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage');

        if (existingRoom) {
            console.log(`✅ [DIRECT_ROOM] Found existing room: ${existingRoom._id} (type: ${existingRoom.type})`);
            return successResponse(res, { room: existingRoom }, "Room already exists", 200);
        }

        // ✅ Create new DIRECT room with proper roles
        const participantKey = directKey; // Use DIRECT key for new room
        const room = new Room({
            name: `Chat - ${currentUserId} & ${otherUserId}`,
            type: 'DIRECT',
            tenantId: req.user.tenantId,
            createdVia: 'direct',
            participants: [
                {
                    userId: currentUserId,
                    role: 'INITIATOR'  // ✅ Creator
                },
                {
                    userId: otherUserId,
                    role: 'PARTICIPANT'  // ✅ Other user
                }
            ].sort((a, b) => a.userId.toString().localeCompare(b.userId.toString())), // Sort for consistency
            lastMessageTime: new Date()
        });

        try {
            await room.save();
        } catch (error) {
            // Handle duplicate key error (race condition)
            if (error.code === 11000) {
                console.log(`⚠️ [RACE_CONDITION] Room already created, fetching existing room`);
                const existingRoom = await Room.findOne({
                    participantKey: { $in: [directKey, adminChatKey] }
                })
                    .populate('participants.userId', 'name email avatar role')
                    .populate('lastMessage');
                
                return successResponse(res, { room: existingRoom }, "Room already exists", 200);
            }
            throw error;
        }
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

        // ✅ Check if room already exists using participantKey (check both DIRECT and ADMIN_CHAT)
        const sortedParticipants = [initiatorId.toString(), adminId.toString()].sort();
        const directKey = `DIRECT_${sortedParticipants.join('_')}`;
        const adminChatKey = `ADMIN_CHAT_${sortedParticipants.join('_')}`;
        
        const existingRoom = await Room.findOne({
            participantKey: { $in: [directKey, adminChatKey] }
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage');

        if (existingRoom) {
            console.log(`✅ [ADMIN_CHAT] Found existing room: ${existingRoom._id} (type: ${existingRoom.type})`);
            return successResponse(res, { room: existingRoom }, "Chat already exists", 200);
        }

        // ✅ Create new ADMIN_CHAT room with proper roles
        const participantKey = adminChatKey; // Use ADMIN_CHAT key for new room
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
            ].sort((a, b) => a.userId.toString().localeCompare(b.userId.toString())), // Sort for consistency
            lastMessageTime: new Date()
        });

        try {
            await room.save();
        } catch (error) {
            // Handle duplicate key error (race condition)
            if (error.code === 11000) {
                console.log(`⚠️ [RACE_CONDITION] Admin chat already created, fetching existing room`);
                const existingRoom = await Room.findOne({
                    participantKey: { $in: [directKey, adminChatKey] }
                })
                    .populate('participants.userId', 'name email avatar role')
                    .populate('lastMessage');
                
                return successResponse(res, { room: existingRoom }, "Chat already exists", 200);
            }
            throw error;
        }
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
        const limit = parseInt(req.query.limit) || 60;
        const skip = (page - 1) * limit;
        const readOnly = req.query.readOnly === 'true';

        const room = await Room.findById(roomId).populate('participants.userId', 'name email avatar role');
        if (!room) return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);

        const isParticipant = room.participants.some(
            p => p.userId && req.user._id && (p.userId._id?.toString() === req.user._id.toString() || p.userId.toString() === req.user._id.toString())
        );

        if (!isParticipant && req.user.role !== 'SUPER_ADMIN' && !['ADMIN', 'TENANT_ADMIN'].includes(req.user.role)) {
            console.error('❌ Authorization failed:', {
                userId: req.user._id.toString(),
                roomId,
                participants: room.participants.map(p => ({ userId: p.userId?._id || p.userId, role: p.role })),
                isParticipant
            });
            return errorResponse(res, 'Unauthorized access', 403);
        }

        // ✅ Fetch only active (not deleted) messages - DESCENDING ORDER (newest first)
        const messages = await Message.find({ roomId, isDeleted: false })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .populate('replyTo')
            .populate('callLog.callerId', 'name email avatar')
            .populate('callLog.receiverId', 'name email avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments({ roomId, isDeleted: false });

        // Get user's contacts for display name mapping
        const userId = req.user._id;
        const userContacts = await Contact.find({ userId }).populate('contactUserId', '_id name phone').lean();
        const contactMap = new Map();
        userContacts.forEach(contact => {
            if (contact.contactUserId) {
                contactMap.set(contact.contactUserId._id.toString(), {
                    contactName: contact.contactName,
                    phone: contact.contactUserId.phone
                });
            }
        });

        // Compute display name for DIRECT/ADMIN_CHAT rooms
        let displayName = room.name;
        let displayPhone = null;
        if (room.type === 'DIRECT' || room.type === 'ADMIN_CHAT') {
            const otherParticipant = room.participants.find(p =>
                p.userId && p.userId._id && p.userId._id.toString() !== req.user._id.toString()
            );
            const otherUserId = otherParticipant?.userId?._id?.toString();
            const contactInfo = otherUserId ? contactMap.get(otherUserId) : null;
            
            // Priority: contactName > userName > phone
            if (contactInfo?.contactName) {
                displayName = contactInfo.contactName;
            } else if (otherParticipant?.userId?.name) {
                displayName = otherParticipant.userId.name;
            } else if (otherParticipant?.userId?.phone) {
                displayName = otherParticipant.userId.phone;
            }
            
            displayPhone = otherParticipant?.userId?.phone || null;
        }

        // ✅ Optimize media URLs with Cloudinary transformations
        const messagesWithReadStatus = messages.map(msg => {
            const optimizedMsg = {
                ...msg,
                isRead: msg.status === 'read',
            };

            // Optimize media URLs for better performance
            if (msg.media && msg.media.length > 0) {
                optimizedMsg.media = msg.media.map(mediaItem => {
                    if (mediaItem.url && mediaItem.url.includes('cloudinary.com')) {
                        const isImage = mediaItem.type === 'image';
                        const isVideo = mediaItem.type === 'video';
                        
                        // Add Cloudinary transformations for thumbnails
                        if (isImage) {
                            return {
                                ...mediaItem,
                                thumbnail: mediaItem.url.replace('/upload/', '/upload/w_400,h_400,c_limit,q_auto,f_auto/'),
                                url: mediaItem.url.replace('/upload/', '/upload/q_auto,f_auto/')
                            };
                        } else if (isVideo) {
                            return {
                                ...mediaItem,
                                thumbnail: mediaItem.url.replace('/upload/', '/upload/w_400,h_400,c_fill,so_0,q_auto,f_jpg/'),
                                url: mediaItem.url.replace('/upload/', '/upload/q_auto/')
                            };
                        }
                    }
                    return mediaItem;
                });
            }

            return optimizedMsg;
        });

        return successResponse(res, {
            roomId,
            room: {
                _id: room._id,
                name: displayName,
                displayPhone: displayPhone,
                type: room.type,
                participants: room.participants
            },
            messages: messagesWithReadStatus,
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

        // ✅ Fetch all rooms EXCLUDING rooms where SuperAdmin is a participant
        const rooms = await Room.find({
            'participants.userId': { $ne: req.user._id }
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .skip(skip)
            .limit(limit)
            .sort({ lastMessageTime: -1 })
            .lean();

        const total = await Room.countDocuments({
            'participants.userId': { $ne: req.user._id }
        });

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
        if (!admin || (admin.role !== 'ADMIN')) {
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

        // Format chat list with message count
        const chats = await Promise.all(
            rooms.flatMap(room => {
                const otherParticipants = room.participants.filter(p =>
                    p.userId && p.userId._id.toString() !== adminId
                );

                return otherParticipants.map(async participant => {
                    const messageCount = await Message.countDocuments({
                        roomId: room._id,
                        isDeleted: false
                    });

                    return {
                        roomId: room._id,
                        roomType: room.type,
                        participantId: participant.userId._id,
                        participantName: participant.userId.name,
                        participantEmail: participant.userId.email,
                        participantAvatar: participant.userId.avatar,
                        participantRole: participant.userId.role,
                        lastMessage: room.lastMessage?.content || "No messages yet",
                        lastMessageTime: room.lastMessageTime || room.createdAt,
                        messageCount
                    };
                });
            })
        );

        return successResponse(res, {
            adminId,
            adminName: admin.name,
            chats: chats.filter(c => c),
            count: chats.filter(c => c).length
        });

    } catch (error) {
        console.error('❌ Error in getAdminChatsById:', error);
        next(error);
    }
};



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
                deletedAt: null,
                optimistic: false,
            };
            io.of('/chat').to(`room:${roomId}`).emit('message_received', messageData);
            console.log(`📡 [MEDIA_MSG] Broadcasted to room ${roomId}`);
        }

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

// ✅ FIXED: Delete message (soft delete) + Delete media from Cloudinary
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

        // ✅ Delete media from Cloudinary if message has media
        if (message.media && message.media.length > 0) {
            const { deleteFromCloudinary } = await import('../utils/cloudinary.js');
            
            for (const mediaItem of message.media) {
                if (mediaItem.url && mediaItem.url.includes('cloudinary.com')) {
                    try {
                        await deleteFromCloudinary(mediaItem.url);
                        console.log(`✅ Deleted media from Cloudinary: ${mediaItem.url}`);
                    } catch (error) {
                        console.error(`⚠️ Failed to delete media from Cloudinary: ${mediaItem.url}`, error);
                        // Continue even if Cloudinary delete fails
                    }
                }
            }
        }

        // ✅ Soft delete message
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


// ✅ CREATE OR GET ROOM - Universal room creation with duplicate prevention
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
        const currentUserIsAdmin = ['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(currentUserRole);
        const otherUserIsAdmin = ['ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(otherUser.role);
        
        const roomType = (currentUserIsAdmin && otherUserIsAdmin) ? 'ADMIN_CHAT' : 'DIRECT';
        const participantKey = roomType === 'ADMIN_CHAT' ? adminChatKey : directKey;

        const room = new Room({
            name: `Chat - ${currentUserId} & ${userId}`,
            type: roomType,
            tenantId: req.user.tenantId,
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







/* ====================================================
   1. GET ALL MEMBER CHATS (FOR ADMIN)
   ✅ Admin only
   ✅ Shows all member conversations in tenant
   ✅ Returns formatted chat list with stats
   ✅ Pagination support
   ==================================================== */
export const getAdminMemberChats = async (req, res, next) => {
    try {
        // ✅ Authorization: ADMIN/TENANT_ADMIN only
        if (!['ADMIN', 'TENANT_ADMIN'].includes(req.user.role)) {
            return errorResponse(res, "Only admins can view member chats", 403);
        }

        const tenantId = req.user.tenantId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        if (page < 1 || limit < 1 || limit > 100) {
            return errorResponse(res, "Invalid pagination parameters", 400);
        }

        // ✅ Get all members (excluding admin)
        const members = await User.find({
            tenantId,
            role: 'USER',
            status: 'ACTIVE',
            _id: { $ne: req.user._id }
        })
            .select('_id name email avatar')
            .lean();

        const memberIds = members.map(m => m._id);

        if (memberIds.length === 0) {
            return successResponse(res, {
                members: [],
                totalMembers: 0,
                pagination: { page, limit, total: 0, pages: 0 }
            });
        }

        // ✅ Get all rooms where members are participants BUT admin is NOT a participant
        const rooms = await Room.find({
            tenantId,
            'participants.userId': { $in: memberIds, $ne: req.user._id }
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .lean();

        // ✅ Group chats by member
        const memberChatsMap = new Map();

        rooms.forEach(room => {
            room.participants.forEach(participant => {
                const userId = participant.userId?._id?.toString();

                if (userId && memberIds.some(m => m.toString() === userId)) {
                    if (!memberChatsMap.has(userId)) {
                        memberChatsMap.set(userId, []);
                    }
                    memberChatsMap.get(userId).push(room);
                }
            });
        });

        // ✅ Format member chats
        const memberChatsData = Array.from(memberChatsMap.entries())
            .map(([memberId, memberRooms]) => {
                const member = members.find(m => m._id.toString() === memberId);

                // Calculate stats
                const totalChats = memberRooms.length;
                const directChats = memberRooms.filter(r => r.type === 'DIRECT' || r.type === 'ADMIN_CHAT').length;
                const groupChats = memberRooms.filter(r => r.type === 'GROUP').length;

                const totalMessages = memberRooms.reduce((sum, room) => {
                    return sum + (room.messageCount || 0);
                }, 0);

                const lastActive = memberRooms.length > 0
                    ? memberRooms[0].lastMessageTime
                    : member?.createdAt;

                return {
                    memberId: member._id,
                    memberName: member.name,
                    memberEmail: member.email,
                    memberAvatar: member.avatar,
                    totalChats,
                    directChats,
                    groupChats,
                    totalMessages,
                    lastActive,
                    recentChats: memberRooms.slice(0, 5).map(room => ({
                        roomId: room._id,
                        roomName: room.name,
                        roomType: room.type,
                        participantCount: room.participants.length,
                        lastMessage: room.lastMessage?.content?.substring(0, 50) || "No messages",
                        lastMessageTime: room.lastMessageTime,
                        messageCount: room.messageCount || 0,
                        participants: room.participants.map(p => ({
                            userId: p.userId?._id,
                            name: p.userId?.name,
                            role: p.role
                        }))
                    }))
                };
            })
            .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
            .slice(skip, skip + limit);

        const total = memberChatsMap.size;

        return successResponse(res, {
            memberChats: memberChatsData,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Error in getAdminMemberChats:', error);
        next(error);
    }
};


/* ====================================================
   2. GET SPECIFIC MEMBER CHATS (DETAILED VIEW)
   ✅ Admin views all chats of specific member
   ✅ Returns: All conversations + message count
   ✅ Filter by: Room type (direct, group, admin)
   ==================================================== */
export const getSpecificMemberChats = async (req, res, next) => {
    try {
        const { memberId } = req.params;
        const { filter } = req.query; // 'direct', 'group', 'admin', 'all'

        // ✅ Authorization
        if (!['ADMIN', 'TENANT_ADMIN'].includes(req.user.role)) {
            return errorResponse(res, "Only admins can view member chats", 403);
        }

        // ✅ Verify member exists in tenant
        const member = await User.findOne({
            _id: memberId,
            tenantId: req.user.tenantId,
            role: 'USER'
        }).select('_id name email avatar');

        if (!member) {
            return errorResponse(res, "Member not found in your tenant", 404);
        }

        // ✅ Build filter query
        const filterQuery = {
            tenantId: req.user.tenantId,
            'participants.userId': memberId
        };

        if (filter && filter !== 'all') {
            if (filter === 'direct') {
                filterQuery.type = { $in: ['DIRECT', 'ADMIN_CHAT'] };
            } else if (filter === 'group') {
                filterQuery.type = 'GROUP';
            } else if (filter === 'admin') {
                filterQuery.type = 'ADMIN_CHAT';
            }
        }

        // ✅ Get all member chats
        const chats = await Room.find(filterQuery)
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .lean();

        // ✅ Format chat data with message count
        const formattedChats = await Promise.all(
            chats.map(async (chat) => {
                const messageCount = await Message.countDocuments({
                    roomId: chat._id,
                    isDeleted: false
                });

                // Get other participants
                const otherParticipants = chat.participants.filter(p =>
                    p.userId && p.userId._id.toString() !== memberId
                );

                return {
                    roomId: chat._id,
                    roomName: chat.name,
                    roomType: chat.type,
                    createdAt: chat.createdAt,
                    lastMessageTime: chat.lastMessageTime,
                    lastMessage: chat.lastMessage?.content?.substring(0, 100) || "No messages",
                    messageCount,
                    participantCount: chat.participants.length,
                    participants: chat.participants.map(p => ({
                        userId: p.userId?._id,
                        name: p.userId?.name,
                        email: p.userId?.email,
                        role: p.role
                    })),
                    otherParticipants: otherParticipants.map(p => ({
                        userId: p.userId?._id,
                        name: p.userId?.name,
                        avatar: p.userId?.avatar,
                        role: p.userId?.role
                    }))
                };
            })
        );

        // ✅ Calculate stats
        const stats = {
            totalChats: formattedChats.length,
            totalMessages: formattedChats.reduce((sum, chat) => sum + chat.messageCount, 0),
            directChats: formattedChats.filter(c => c.roomType === 'DIRECT' || c.roomType === 'ADMIN_CHAT').length,
            groupChats: formattedChats.filter(c => c.roomType === 'GROUP').length,
            lastActive: formattedChats.length > 0 ? formattedChats[0].lastMessageTime : null
        };

        return successResponse(res, {
            member: {
                id: member._id,
                name: member.name,
                email: member.email,
                avatar: member.avatar
            },
            stats,
            chats: formattedChats,
            filter: filter || 'all'
        });

    } catch (error) {
        console.error('❌ Error in getSpecificMemberChats:', error);
        next(error);
    }
};


/* ====================================================
   3. GET MEMBER CHAT HISTORY (MESSAGES)
   ✅ View all messages in member's chat room
   ✅ Pagination support
   ✅ Admin monitoring capability
   ==================================================== */
export const getMemberChatHistory = async (req, res, next) => {
    try {
        const { memberId, roomId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // ✅ Authorization
        if (!['ADMIN', 'TENANT_ADMIN'].includes(req.user.role)) {
            return errorResponse(res, "Only admins can view chat history", 403);
        }

        // ✅ Verify member exists
        const member = await User.findOne({
            _id: memberId,
            tenantId: req.user.tenantId,
            role: 'USER'
        });

        if (!member) {
            return errorResponse(res, "Member not found", 404);
        }

        // ✅ Verify room exists and member is participant
        const room = await Room.findOne({
            _id: roomId,
            tenantId: req.user.tenantId,
            'participants.userId': memberId
        })
            .populate('participants.userId', 'name email avatar role')
            .lean();

        if (!room) {
            return errorResponse(res, "Room not found or member is not participant", 404);
        }

        // ✅ Get messages
        const messages = await Message.find({
            roomId,
            isDeleted: false
        })
            .populate('senderId', 'name email avatar role')
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments({
            roomId,
            isDeleted: false
        });

        return successResponse(res, {
            member: {
                id: member._id,
                name: member.name,
                email: member.email
            },
            room: {
                id: room._id,
                name: room.name,
                type: room.type,
                createdAt: room.createdAt,
                participants: room.participants
            },
            messages: messages.map(msg => ({
                messageId: msg._id,
                sender: {
                    id: msg.senderId?._id,
                    name: msg.senderId?.name,
                    email: msg.senderId?.email,
                    role: msg.senderId?.role
                },
                content: msg.content,
                type: msg.type,
                createdAt: msg.createdAt,
                editedAt: msg.editedAt,
                status: msg.status,
                reactions: msg.reactions || [],
                readBy: msg.readBy?.length || 0
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Error in getMemberChatHistory:', error);
        next(error);
    }
};


// ✅ EXPORT ALL FUNCTIONS
/* ====================================================
   CREATE CHAT FROM CONTACT
   ✅ Creates direct chat room from contact list
   ✅ Verifies contact relationship exists
   ==================================================== */
export const createChatFromContact = async (req, res, next) => {
    try {
        const { contactId } = req.body;

        if (!contactId) {
            return errorResponse(res, "Contact ID is required", 400);
        }

        // Verify contact exists in user's contact list
        const currentUser = await User.findById(req.user._id).select('contacts');
        const isContact = currentUser.contacts?.some(
            c => c.userId?.toString() === contactId.toString()
        );

        if (!isContact) {
            return errorResponse(res, "User is not in your contacts", 403);
        }

        // Delegate to createDirectRoom
        req.body.userId = contactId;
        return createDirectRoom(req, res, next);
    } catch (error) {
        next(error);
    }
};

/* ====================================================
   FORWARD MESSAGE
   ✅ Forward message to multiple rooms
   ✅ Preserves media and content
   ==================================================== */
export const forwardMessage = async (req, res, next) => {
    try {
        const { messageId, roomIds } = req.body;

        if (!messageId || !roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
            return errorResponse(res, "Message ID and room IDs are required", 400);
        }

        const originalMessage = await Message.findById(messageId);
        if (!originalMessage || originalMessage.isDeleted) {
            return errorResponse(res, "Message not found", 404);
        }

        const forwardedMessages = [];
        const io = req.app.get('io');

        for (const roomId of roomIds) {
            const room = await Room.findById(roomId);
            if (!room) continue;

            const isParticipant = room.participants.some(
                p => p.userId && p.userId.toString() === req.user._id.toString()
            );

            if (!isParticipant) continue;

            const newMessage = new Message({
                roomId,
                senderId: req.user._id,
                content: originalMessage.content,
                type: originalMessage.type,
                media: originalMessage.media,
                status: 'sent',
                sentAt: new Date(),
                isForwarded: true
            });

            await newMessage.save();
            await newMessage.populate('senderId', 'name email avatar role');

            room.lastMessage = newMessage._id;
            room.lastMessageTime = new Date();
            await room.save();

            forwardedMessages.push(newMessage);

            if (io) {
                io.of('/chat').to(`room:${roomId}`).emit('message_received', {
                    _id: newMessage._id,
                    roomId,
                    content: newMessage.content,
                    type: newMessage.type,
                    media: newMessage.media,
                    senderId: newMessage.senderId._id,
                    sender: {
                        _id: newMessage.senderId._id,
                        name: newMessage.senderId.name,
                        email: newMessage.senderId.email,
                        avatar: newMessage.senderId.avatar,
                        role: newMessage.senderId.role,
                    },
                    createdAt: newMessage.createdAt,
                    status: 'sent',
                    isForwarded: true,
                    optimistic: false,
                });
            }
        }

        return successResponse(res, { forwardedCount: forwardedMessages.length }, 'Message forwarded');
    } catch (error) {
        console.error('❌ Error forwarding message:', error);
        next(error);
    }
};

/* ====================================================
   GET USER ROOMS (SUPER ADMIN MONITORING)
   ✅ Super admin can view all rooms of any user
   ✅ Returns formatted room list with participants
   ==================================================== */
export const getUserRooms = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (req.user.role !== 'SUPER_ADMIN') {
            return errorResponse(res, 'Unauthorized', 403);
        }

        if (!userId) {
            return errorResponse(res, 'User ID is required', 400);
        }

        const user = await User.findById(userId);
        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        const rooms = await Room.find({
            'participants.userId': userId
        })
            .populate('participants.userId', 'name email avatar role')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .lean();

        const formattedRooms = rooms.map(room => {
            const otherParticipants = room.participants.filter(p =>
                p.userId && p.userId._id.toString() !== userId
            );

            return {
                _id: room._id,
                roomId: room._id,
                name: room.name,
                type: room.type,
                participants: room.participants,
                otherParticipants: otherParticipants.map(p => p.userId),
                lastMessage: room.lastMessage?.content || 'No messages',
                lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || 'No messages',
                lastMessageTime: room.lastMessageTime,
                createdAt: room.createdAt
            };
        });

        return successResponse(res, { rooms: formattedRooms });
    } catch (error) {
        console.error('❌ Error in getUserRooms:', error);
        next(error);
    }
};

/* ====================================================
   DELETE ROOM (WITH ALL MESSAGES & MEDIA)
   ✅ Deletes room completely
   ✅ Deletes all messages in room
   ✅ Deletes all Cloudinary media files
   ✅ Emits socket event to notify participants
   ==================================================== */
export const deleteRoom = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user._id;
        const userRole = req.user.role;

        console.log(`🗑️ [DELETE_ROOM] Starting deletion for room ${roomId} by user ${userId} (${userRole})`);

        if (!roomId) {
            return errorResponse(res, "Room ID is required", 400);
        }

        const room = await Room.findById(roomId).populate('participants.userId', '_id');
        if (!room) {
            return errorResponse(res, "Room not found", 404);
        }

        console.log(`📋 [DELETE_ROOM] Room found: ${room.name} (Type: ${room.type})`);

        // ✅ Permission check
        const isParticipant = room.participants.some(p => 
            p.userId && p.userId._id.toString() === userId.toString()
        );
        const canDelete = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'TENANT_ADMIN' || isParticipant;

        if (!canDelete) {
            console.log(`❌ [DELETE_ROOM] Permission denied for user ${userId}`);
            return errorResponse(res, "You don't have permission to delete this room", 403);
        }

        console.log(`✅ [DELETE_ROOM] Permission granted`);

        // ✅ Get all messages with media
        const messages = await Message.find({ roomId }).lean();
        console.log(`📨 [DELETE_ROOM] Found ${messages.length} messages in room`);

        const mediaUrls = [];
        const mediaByType = {
            image: [],
            video: [],
            audio: [],
            voice: [],
            file: [],
            thumbnail: []
        };

        messages.forEach((msg, index) => {
            if (msg.media && msg.media.length > 0) {
                console.log(`📎 [DELETE_ROOM] Message ${index + 1}/${messages.length} has ${msg.media.length} media items`);
                msg.media.forEach((mediaItem, mediaIndex) => {
                    if (mediaItem.url && mediaItem.url.includes('cloudinary.com')) {
                        mediaUrls.push(mediaItem.url);
                        const type = mediaItem.type || 'unknown';
                        if (mediaByType[type]) {
                            mediaByType[type].push(mediaItem.url);
                        }
                        console.log(`  📷 [${type.toUpperCase()}] ${mediaIndex + 1}: ${mediaItem.url}`);
                        
                        if (mediaItem.thumbnail && mediaItem.thumbnail.includes('cloudinary.com')) {
                            mediaUrls.push(mediaItem.thumbnail);
                            mediaByType.thumbnail.push(mediaItem.thumbnail);
                            console.log(`  🖼️  [THUMBNAIL] ${mediaItem.thumbnail}`);
                        }
                    }
                });
            }
        });

        console.log(`\n📊 [DELETE_ROOM] Media Summary:`);
        console.log(`  Total media files: ${mediaUrls.length}`);
        console.log(`  Images: ${mediaByType.image.length}`);
        console.log(`  Videos: ${mediaByType.video.length}`);
        console.log(`  Audio: ${mediaByType.audio.length}`);
        console.log(`  Voice: ${mediaByType.voice.length}`);
        console.log(`  Files: ${mediaByType.file.length}`);
        console.log(`  Thumbnails: ${mediaByType.thumbnail.length}`);

        // ✅ Delete all Cloudinary media
        if (mediaUrls.length > 0) {
            console.log(`\n🔥 [DELETE_ROOM] Starting Cloudinary deletion for ${mediaUrls.length} files...`);
            const { deleteMultipleFromCloudinary } = await import('../utils/cloudinary.js');
            const deleteResult = await deleteMultipleFromCloudinary(mediaUrls);
            
            console.log(`\n✅ [DELETE_ROOM] Cloudinary deletion complete:`);
            console.log(`  Successfully deleted: ${deleteResult.successCount}/${mediaUrls.length}`);
            console.log(`  Failed: ${mediaUrls.length - deleteResult.successCount}`);
            
            if (deleteResult.errors && deleteResult.errors.length > 0) {
                console.log(`\n⚠️ [DELETE_ROOM] Deletion errors:`);
                deleteResult.errors.forEach((err, i) => {
                    console.log(`  ${i + 1}. ${err.url}: ${err.error}`);
                });
            }
        } else {
            console.log(`\n📭 [DELETE_ROOM] No media files to delete`);
        }

        // ✅ Delete all messages
        const deletedMessages = await Message.deleteMany({ roomId });
        console.log(`\n🗑️ [DELETE_ROOM] Deleted ${deletedMessages.deletedCount} messages from database`);

        // ✅ Get participant IDs before deleting room
        const participantIds = room.participants
            .filter(p => p.userId && p.userId._id)
            .map(p => p.userId._id.toString());

        console.log(`👥 [DELETE_ROOM] Notifying ${participantIds.length} participants: ${participantIds.join(', ')}`);

        // ✅ Delete room
        await Room.findByIdAndDelete(roomId);
        console.log(`✅ [DELETE_ROOM] Room ${roomId} deleted from database`);

        // ✅ Emit socket event to all participants
        const io = req.app.get('io');
        if (io) {
            participantIds.forEach(participantId => {
                io.of('/chat').to(`user:${participantId}`).emit('room_deleted', {
                    roomId,
                    deletedBy: userId.toString(),
                    timestamp: new Date()
                });
            });
            console.log(`📡 [DELETE_ROOM] Socket events emitted to all participants`);
        }

        console.log(`\n🎉 [DELETE_ROOM] Complete deletion summary:`);
        console.log(`  Room: ${room.name}`);
        console.log(`  Messages deleted: ${deletedMessages.deletedCount}`);
        console.log(`  Media files deleted: ${mediaUrls.length}`);
        console.log(`  Participants notified: ${participantIds.length}`);

        return successResponse(res, {
            message: 'Room deleted successfully',
            deletedMessages: deletedMessages.deletedCount,
            deletedMedia: mediaUrls.length,
            mediaByType: {
                images: mediaByType.image.length,
                videos: mediaByType.video.length,
                audio: mediaByType.audio.length,
                voice: mediaByType.voice.length,
                files: mediaByType.file.length,
                thumbnails: mediaByType.thumbnail.length
            }
        });

    } catch (error) {
        console.error('❌ [DELETE_ROOM] Error:', error);
        next(error);
    }
};

export default {
    getAvailableUsersToChat,
    getAllActiveRooms,
    createDirectRoom,
    createGroupRoom,
    createAdminChat,
    searchMessages,
    markRoomAsRead,
    getAllChats,
    getAdminChatsById,
    getUserRooms,
    editMessage,
    deleteMessage,
    markMessageAsDelivered,
    sendMessageWithMedia,
    createOrGetRoom,
    getRoomMessages,
    getAdminMemberChats,
    getSpecificMemberChats,
    getMemberChatHistory,
    createChatFromContact,
    forwardMessage,
    deleteRoom,
};