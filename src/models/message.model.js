import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    content: {
        type: String,
        required: [true, 'Message content is required'],
    },
    type: {
        type: String,
        enum: ['TEXT', 'IMAGE', 'FILE'],
        default: 'TEXT',
    },
    attachments: [
        {
            url: String,
            type: String,
            name: String,
        },
    ],
    isEdited: {
        type: Boolean,
        default: false,
    },
    editedAt: Date,
    deletedAt: Date,
    readBy: [
        {
            userId: mongoose.Schema.Types.ObjectId,
            readAt: Date,
        },
    ],
    reactions: [
        {
            emoji: String,
            userId: mongoose.Schema.Types.ObjectId,
        },
    ],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
