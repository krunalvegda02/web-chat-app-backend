import Room from "../models/room.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Platform from "../models/platform.model.js";
import Contact from "../models/contact.model.js";
import MESSAGE from "../constants/message.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { translateText, translateVoiceMessage } from '../services/translationService.js';

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
                senderId: { $ne: userId },
                isDeleted: false,
                deletedForUsers: { $ne: userId },
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

        const messages = await Message.find({ roomId })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .populate('replyTo')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments({ roomId });

        // Ensure isForwarded field is included in the response
        const messagesWithForwarded = messages.map(msg => ({
            ...msg,
            isForwarded: msg.isForwarded || false,
            forwarded: msg.isForwarded || false
        }));

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
            messages: messagesWithForwarded,
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

        const userId = req.user._id.toString();
        const messages = await Message.find({
            roomId,
            deletedForUsers: { $ne: userId }
        })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .populate('replyTo')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments({
            roomId,
            deletedForUsers: { $ne: userId }
        });

        // Ensure isForwarded field is included in the response
        const messagesWithForwarded = messages.map(msg => ({
            ...msg,
            isForwarded: msg.isForwarded || false,
            forwarded: msg.isForwarded || false
        }));

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
            messages: messagesWithForwarded,
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
        const { roomId, content, type, media, replyTo, tempId, isForwarded, forwarded } = req.body;

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

        // ✅ Check if recipient is online to set initial status
        const io = req.app.get('io');
        let recipientOnline = false;

        if (io) {
            const otherParticipants = room.participants.filter(p => p.userId.toString() !== req.user._id.toString());
            for (const p of otherParticipants) {
                const recipientId = p.userId.toString();
                const recipientSockets = await io.of('/chat').in(`user:${recipientId}`).fetchSockets();
                if (recipientSockets.length > 0) {
                    recipientOnline = true;
                    break;
                }
            }
        }

        const message = new Message({
            roomId,
            senderId: req.user._id,
            content: content || '',
            type: type || 'text',
            media: media || [],
            status: recipientOnline ? 'delivered' : 'sent',
            sentAt: new Date(),
            replyTo: replyTo || undefined,
            isForwarded: isForwarded || forwarded || false
        });

        await message.save();
        await message.populate('senderId', 'name email avatar role');

        room.lastMessage = message._id;
        room.lastMessageTime = new Date();
        await room.save();

        // ✅ Emit IMMEDIATE confirmation back to sender for API-sent messages
        if (io) {
            const confirmationData = {
                tempId,
                messageId: message._id,
                status: message.status,
                roomId
            };
            io.of('/chat').to(`user:${req.user._id}`).emit('message_sent', confirmationData);
            console.log(`📡 [SEND_MEDIA] Confirmation sent to user ${req.user._id} for tempId ${tempId}`);
        }

        // Broadcast via socket - Both to room and to individual users
        if (io) {
            console.log(`📡 [SEND_MEDIA] Broadcasting message ${message._id} to room ${roomId}`);
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
                createdAt: message.createdAt || new Date(),
                sentAt: message.sentAt || new Date(),
                status: message.status,
                tempId,
                readBy: [],
                reactions: [],
                isEdited: false,
                deletedAt: null,
                optimistic: false,
                isForwarded: message.isForwarded,
                forwarded: message.isForwarded
            };

            // Emit to room (for active viewers)
            io.of('/chat').to(`room:${roomId}`).emit('message_received', messageData);

            // Also emit to individual users (for notifications and background updates)
            room.participants.forEach(p => {
                const participantId = p.userId.toString();
                if (participantId !== req.user._id.toString()) {
                    io.of('/chat').to(`user:${participantId}`).emit('message_received', messageData);
                    console.log(`📤 [SEND_MEDIA] Direct emit to user ${participantId}`);
                }
            });
        }

        // ✅ ASYNC TRANSLATION: Fire-and-forget (runs after response is sent)
        // Broadened role check to allow testing by admins as well
        const isUserOrAdmin = ['USER', 'PLATFORM_ADMIN'].includes(req.user.role);

        if (isUserOrAdmin && io) {
            const msgId = message._id;
            const msgRoomId = roomId;
            const msgType = message.type;
            const msgContent = message.content;
            const msgMedia = message.media;
            const roomParticipants = room.participants;

            process.nextTick(async () => {
                console.log(`🌐 [TRANSLATE] background task started for message: ${msgId} (type: ${msgType})`);
                try {
                    const translationUpdate = {};
                    let hasTranslation = false;

                    // 1. Voice/audio → full pipeline (Whisper + Translate + TTS)
                    if ((msgType === 'voice' || msgType === 'audio') && msgMedia?.length > 0) {
                        const audioUrl = msgMedia[0].url;
                        console.log(`🎙️ [TRANSLATE] Starting voice pipeline for messageId: ${msgId}`);
                        const voiceResult = await translateVoiceMessage(audioUrl);

                        if (voiceResult) {
                            translationUpdate['translation.transcription'] = voiceResult.transcription;
                            translationUpdate['translation.originalLanguage'] = voiceResult.originalLanguage;
                            translationUpdate['translation.translatedTranscription'] = voiceResult.translatedTranscription;
                            translationUpdate['translation.translatedAudioUrl'] = voiceResult.translatedAudioUrl;
                            translationUpdate['translation.isTranslated'] = voiceResult.isTranslated;

                            // Important: Use the translated text for the message bubble too
                            translationUpdate['translation.translatedContent'] = voiceResult.translatedTranscription || voiceResult.transcription;

                            hasTranslation = true;
                            console.log(`✅ [TRANSLATE] Voice pipeline success for ${msgId}`);
                        }
                    }

                    // 2. Text content → translate (captions/text)
                    // SKIP translation if it's just a generic placeholder like "Voice message" or if voice pipeline already handled it
                    const normalizedContent = msgContent?.trim().toLowerCase();
                    const isGenericPlaceholder = [
                        'voice message', 'image', 'video', 'file', 'audio',
                        'sent a voice message', 'sent an image', 'sent a video'
                    ].includes(normalizedContent);

                    if (msgContent && msgContent.trim().length > 0 && !isGenericPlaceholder && !hasTranslation) {
                        console.log(`📝 [TRANSLATE] Starting text translation for: "${msgContent.substring(0, 30)}..."`);
                        const textResult = await translateText(msgContent.trim());
                        if (textResult && !textResult.skipped) {
                            translationUpdate['translation.translatedContent'] = textResult.translatedText;
                            translationUpdate['translation.originalLanguage'] = translationUpdate['translation.originalLanguage'] || textResult.detectedLanguage;
                            translationUpdate['translation.isTranslated'] = true;
                            hasTranslation = true;
                        }
                    } else if (isGenericPlaceholder) {
                        console.log(`ℹ️ [TRANSLATE] Skipping generic placeholder text: "${msgContent}"`);
                    }

                    if (hasTranslation) {
                        await Message.findByIdAndUpdate(msgId, translationUpdate);

                        // Emit translation event
                        const translationData = {
                            messageId: msgId.toString(),
                            roomId: msgRoomId,
                            translation: {
                                originalLanguage: translationUpdate['translation.originalLanguage'] || 'auto',
                                translatedContent: translationUpdate['translation.translatedContent'] || null,
                                translatedAudioUrl: translationUpdate['translation.translatedAudioUrl'] || null,
                                transcription: translationUpdate['translation.transcription'] || null,
                                translatedTranscription: translationUpdate['translation.translatedTranscription'] || null,
                                isTranslated: true,
                            },
                        };

                        io.of('/chat').to(`room:${msgRoomId}`).emit('message_translated', translationData);
                        roomParticipants.forEach(p => {
                            if (p.userId) {
                                const pid = p.userId.toString();
                                io.of('/chat').to(`user:${pid}`).emit('message_translated', translationData);
                            }
                        });
                        console.log(`🌐 [TRANSLATE] Translation processed for message ${msgId}`);
                    }
                } catch (translationError) {
                    console.error(`⚠️ [TRANSLATE] Translation error for ${msgId}:`, translationError.message);
                }
            });
        }

        return successResponse(res, { message: { ...message.toObject(), tempId } }, 'Message sent', 201);

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

        // 1. Update the messages in the database
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

        // 2. Find the messages we just updated to notify senders in real-time
        const updatedMessages = await Message.find({
            roomId,
            senderId: { $ne: req.user._id },
            'readBy.userId': req.user._id
        }).select('_id senderId');

        if (updatedMessages.length > 0) {
            const updatedMessageIds = updatedMessages.map(m => m._id);
            const io = req.app.get('io');

            if (io) {
                const readReceiptData = {
                    roomId,
                    messageIds: updatedMessageIds,
                    readBy: req.user._id
                };

                // Notify room
                io.of('/chat').to(`room:${roomId}`).emit('messages_read', readReceiptData);

                // Notify individual senders
                const uniqueSenders = [...new Set(updatedMessages.map(m => m.senderId.toString()))];
                uniqueSenders.forEach(senderId => {
                    io.of('/chat').to(`user:${senderId}`).emit('messages_read', readReceiptData);
                });

                console.log(`📡 [MARK_READ] Notified ${uniqueSenders.length} senders about ${updatedMessageIds.length} read messages`);
            }
        }

        return successResponse(res, null, "Room marked as read");

    } catch (error) {
        console.error('❌ Error in markRoomAsRead:', error);
        next(error);
    }
};

// ✅ GET ADMIN MEMBER CHATS
export const getAdminMemberChats = async (req, res, next) => {
    try {
        const requestingUserRole = req.user.role;
        const platformId = req.user.platformId;

        // Only platform admins can access this endpoint
        if (!['PLATFORM_ADMIN'].includes(requestingUserRole)) {
            return errorResponse(res, 'Unauthorized access', 403);
        }

        // Get all users in the same platform
        const users = await User.find({
            platformId: platformId,
            _id: { $ne: req.user._id },
            status: 'ACTIVE'
        })
            .select('_id name email avatar role phone')
            .lean();

        return successResponse(res, {
            users: users,
            count: users.length
        });

    } catch (error) {
        console.error('❌ Error in getAdminMemberChats:', error);
        next(error);
    }
};

// ✅ GET SPECIFIC MEMBER CHATS
export const getSpecificMemberChats = async (req, res, next) => {
    try {
        const { memberId } = req.params;
        const requestingUserRole = req.user.role;
        const platformId = req.user.platformId;

        // Only platform admins can access this endpoint
        if (!['PLATFORM_ADMIN'].includes(requestingUserRole)) {
            return errorResponse(res, 'Unauthorized access', 403);
        }

        if (!memberId) {
            return errorResponse(res, "Member ID is required", 400);
        }

        const targetUser = await User.findOne({
            _id: memberId,
            platformId: platformId
        });

        if (!targetUser) {
            return errorResponse(res, 'User not found or not in your platform', 404);
        }

        const rooms = await Room.find({
            participants: {
                $elemMatch: { userId: memberId }
            },
            platformId: platformId,
            isArchived: false
        })
            .populate('participants.userId', 'name email avatar role phone')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .lean();

        const formattedRooms = rooms.map(room => {
            const otherParticipants = room.participants.filter(p =>
                p.userId && p.userId._id && p.userId._id.toString() !== memberId.toString()
            );

            return {
                _id: room._id,
                name: room.name,
                type: room.type,
                participants: room.participants,
                otherParticipants: otherParticipants.map(p => p.userId),
                lastMessage: room.lastMessage,
                lastMessageTime: room.lastMessageTime,
                lastMessagePreview: room.lastMessage?.content?.substring(0, 50) || "No messages yet",
                participantCount: room.participants.length,
                createdAt: room.createdAt
            };
        });

        return successResponse(res, {
            rooms: formattedRooms,
            user: {
                _id: targetUser._id,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role
            }
        });

    } catch (error) {
        console.error('❌ Error in getSpecificMemberChats:', error);
        next(error);
    }
};

// ✅ GET MEMBER CHAT HISTORY
export const getMemberChatHistory = async (req, res, next) => {
    try {
        const { memberId, roomId } = req.params;
        const requestingUserRole = req.user.role;
        const platformId = req.user.platformId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // Only platform admins can access this endpoint
        if (!['PLATFORM_ADMIN'].includes(requestingUserRole)) {
            return errorResponse(res, 'Unauthorized access', 403);
        }

        const room = await Room.findOne({
            _id: roomId,
            platformId: platformId,
            participants: {
                $elemMatch: { userId: memberId }
            }
        }).populate('participants.userId', 'name email avatar role');

        if (!room) {
            return errorResponse(res, 'Room not found or access denied', 404);
        }

        const messages = await Message.find({
            roomId,
            deletedForUsers: { $ne: memberId }
        })
            .populate('senderId', 'name email avatar role')
            .populate('readBy.userId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Message.countDocuments({
            roomId,
            deletedForUsers: { $ne: memberId }
        });

        // Ensure isForwarded field is included in the response
        const messagesWithForwarded = messages.map(msg => ({
            ...msg,
            isForwarded: msg.isForwarded || false,
            forwarded: msg.isForwarded || false
        }));

        return successResponse(res, {
            roomId,
            room: {
                _id: room._id,
                name: room.name,
                type: room.type,
                participants: room.participants
            },
            messages: messagesWithForwarded,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Error in getMemberChatHistory:', error);
        next(error);
    }
};
export const getUserRooms = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const requestingUserRole = req.user.role;

        // Only admins can access this endpoint
        if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(requestingUserRole)) {
            return errorResponse(res, 'Unauthorized access', 403);
        }

        if (!userId) {
            return errorResponse(res, "User ID is required", 400);
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return errorResponse(res, 'User not found', 404);
        }

        const rooms = await Room.find({
            participants: {
                $elemMatch: { userId: userId }
            },
            isArchived: false
        })
            .populate('participants.userId', 'name email avatar role phone')
            .populate('lastMessage')
            .sort({ lastMessageTime: -1 })
            .lean();

        const formattedRooms = await Promise.all(rooms.map(async room => {
            const otherParticipantIds = room.participants
                .filter(p => p.userId && p.userId._id.toString() !== userId.toString())
                .map(p => p.userId._id);

            const unreadCount = await Message.countDocuments({
                roomId: room._id,
                senderId: { $ne: userId },
                isDeleted: false,
                deletedForUsers: { $ne: userId },
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
            user: {
                _id: targetUser._id,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role
            }
        });

    } catch (error) {
        console.error('❌ Error in getUserRooms:', error);
        next(error);
    }
};
export const deleteRoom = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user._id;
        const userRole = req.user.role;

        if (!roomId) {
            return errorResponse(res, "Room ID is required", 400);
        }

        const room = await Room.findById(roomId);
        if (!room) {
            return errorResponse(res, MESSAGE.ROOM_NOT_FOUND, 404);
        }

        // Check if user is a participant or admin
        const isParticipant = room.participants.some(
            p => p.userId && p.userId.toString() === userId.toString()
        );
        const isAdmin = ['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(userRole);

        if (!isParticipant && !isAdmin) {
            return errorResponse(res, 'Unauthorized to delete this room', 403);
        }

        // Delete all messages in the room
        await Message.deleteMany({ roomId });

        // Delete the room
        await Room.findByIdAndDelete(roomId);

        // Emit socket event to notify participants
        const io = req.app.get('io');
        if (io) {
            room.participants.forEach(participant => {
                const participantId = participant.userId.toString();
                io.of('/chat').to(`user:${participantId}`).emit('room_deleted', { roomId });
                console.log(`📡 [ROOM_DELETED] Emitted to user ${participantId}`);
            });
        }

        console.log(`🗑️ [DELETE_ROOM] Room ${roomId} deleted by user ${userId}`);
        return successResponse(res, null, 'Room deleted successfully');

    } catch (error) {
        console.error('❌ Error in deleteRoom:', error);
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
    deleteRoom,
    getUserRooms,
    getAdminMemberChats,
    getSpecificMemberChats,
    getMemberChatHistory,
};
