import User from "../models/user.model.js";
import Contact from "../models/contact.model.js";
import { successResponse, errorResponse } from "../utils/response.js";

// Search user by phone or email (WhatsApp style)
export const searchUserByPhoneOrEmail = async (req, res, next) => {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    if (!query || query.length < 3) {
      return errorResponse(res, 'Search query must be at least 3 characters', 400);
    }

    const user = await User.findOne({
      $or: [
        { phone: query },
        { email: query.toLowerCase() }
      ],
      _id: { $ne: userId },
      status: 'ACTIVE'
    }).select('_id name email phone avatar status');

    if (user) {
      const existingContact = await Contact.findOne({
        userId,
        contactUserId: user._id
      });

      return successResponse(res, {
        found: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          status: user.status,
          isContact: !!existingContact
        }
      });
    } else {
      return successResponse(res, {
        found: false,
        query,
        message: 'User not found on platform'
      });
    }
  } catch (error) {
    console.error('❌ Error in searchUserByPhoneOrEmail:', error);
    next(error);
  }
};

// Add contact
export const addContact = async (req, res, next) => {
  try {
    const { userId: contactUserId, contactName, phone, email } = req.body;
    const userId = req.user._id;

    if (!contactUserId) {
      return errorResponse(res, 'Contact user ID is required', 400);
    }

    const contactUser = await User.findById(contactUserId).select('name email phone avatar');
    if (!contactUser) {
      return errorResponse(res, 'User not found', 404);
    }

    const existing = await Contact.findOne({ userId, contactUserId });
    if (existing) {
      return errorResponse(res, 'Contact already exists', 400);
    }

    const contact = await Contact.create({
      userId,
      contactUserId,
      contactName: contactName || contactUser.name,
      phone: phone || contactUser.phone,
      email: email || contactUser.email
    });

    const populatedContact = await Contact.findById(contact._id)
      .populate('contactUserId', 'name email phone avatar status');

    console.log(`✅ [CONTACT] Added contact: ${contactUser.name}`);

    return successResponse(res, { contact: populatedContact }, 'Contact added successfully', 201);
  } catch (error) {
    console.error('❌ Error in addContact:', error);
    next(error);
  }
};

// Get all contacts
export const getContacts = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const contacts = await Contact.find({ userId, isBlocked: false })
      .populate('contactUserId', 'name email phone avatar status')
      .sort({ contactName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Contact.countDocuments({ userId, isBlocked: false });

    return successResponse(res, {
      contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error in getContacts:', error);
    next(error);
  }
};

// Remove contact
export const removeContact = async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const userId = req.user._id;

    const contact = await Contact.findOneAndDelete({
      _id: contactId,
      userId
    });

    if (!contact) {
      return errorResponse(res, 'Contact not found', 404);
    }

    console.log(`✅ [CONTACT] Removed contact: ${contactId}`);

    return successResponse(res, null, 'Contact removed successfully');
  } catch (error) {
    console.error('❌ Error in removeContact:', error);
    next(error);
  }
};

// Update contact name
export const updateContactName = async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const { contactName } = req.body;
    const userId = req.user._id;

    if (!contactName || !contactName.trim()) {
      return errorResponse(res, 'Contact name is required', 400);
    }

    const contact = await Contact.findOneAndUpdate(
      { _id: contactId, userId },
      { contactName: contactName.trim() },
      { new: true }
    ).populate('contactUserId', 'name email phone avatar status');

    if (!contact) {
      return errorResponse(res, 'Contact not found', 404);
    }

    console.log(`✏️ [CONTACT] Updated contact name: ${contactName}`);

    return successResponse(res, { contact }, 'Contact name updated');
  } catch (error) {
    console.error('❌ Error in updateContactName:', error);
    next(error);
  }
};
