import User from "../models/user.model.js";
import { successResponse, errorResponse } from "../utils/response.js";

// Get user's contacts
export const getContacts = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id)
            .select('contacts')
            .populate('contacts.userId', 'name email avatar phone role status');

        const activeContacts = user.contacts.filter(c => 
            c.userId && c.userId.status === 'ACTIVE'
        );

        return successResponse(res, {
            contacts: activeContacts,
            count: activeContacts.length
        });
    } catch (error) {
        console.error('❌ Error in getContacts:', error);
        next(error);
    }
};

// Add contact
export const addContact = async (req, res, next) => {
    try {
        const { userId, contactName } = req.body;

        if (!userId) {
            return errorResponse(res, "User ID is required", 400);
        }

        const contactUser = await User.findById(userId);
        if (!contactUser) {
            return errorResponse(res, "User not found", 404);
        }

        if (contactUser.status !== 'ACTIVE') {
            return errorResponse(res, "User is not active", 400);
        }

        const user = await User.findById(req.user._id);
        
        // Check if already in contacts
        const existing = user.contacts.find(c => 
            c.userId.toString() === userId
        );

        if (existing) {
            return errorResponse(res, "Contact already exists", 400);
        }

        user.addContact(
            contactUser._id,
            contactUser.phone,
            contactUser.email,
            contactUser.name,
            contactName || contactUser.name
        );

        await user.save();

        return successResponse(res, null, "Contact added successfully", 201);
    } catch (error) {
        console.error('❌ Error in addContact:', error);
        next(error);
    }
};

// Remove contact
export const removeContact = async (req, res, next) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(req.user._id);
        user.removeContact(userId);
        await user.save();

        return successResponse(res, null, "Contact removed successfully");
    } catch (error) {
        console.error('❌ Error in removeContact:', error);
        next(error);
    }
};

// Search users by phone/email
export const searchUsersByContact = async (req, res, next) => {
    try {
        const { query } = req.query;

        if (!query || query.length < 3) {
            return errorResponse(res, "Query must be at least 3 characters", 400);
        }

        const users = await User.find({
            $or: [
                { phone: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } }
            ],
            _id: { $ne: req.user._id },
            status: 'ACTIVE'
        })
        .select('_id name email phone avatar role')
        .limit(20)
        .lean();

        return successResponse(res, {
            users,
            count: users.length
        });
    } catch (error) {
        console.error('❌ Error in searchUsersByContact:', error);
        next(error);
    }
};
