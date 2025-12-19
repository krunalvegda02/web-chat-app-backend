import User from '../models/user.model.js';
import Room from '../models/room.model.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * ✅ CONTACT MANAGEMENT CONTROLLER
 * 
 * Handles all contact-based operations:
 * - Add contact by phone/email
 * - Get all contacts
 * - Search contacts
 * - Block/Unblock users
 * - Mark favorite contacts
 * - Contact-based chat creation
 */

/* ====================================================
   1. ADD CONTACT BY PHONE OR EMAIL
   ✅ Find user by phone/email and add as contact
   ✅ Support custom contact names
   ✅ Check if user exists
   ==================================================== */
export const addContact = async (req, res, next) => {
  try {
    const { identifier, contactName } = req.body; // identifier can be phone or email
    const userId = req.user._id;

    if (!identifier) {
      return errorResponse(res, 'Phone number or email is required', 400);
    }

    // ✅ Find user by phone or email
    const targetUser = await User.findOne({
      $or: [
        { phone: identifier },
        { email: identifier.toLowerCase() }
      ],
      _id: { $ne: userId }, // Don't add self
      status: 'ACTIVE'
    }).select('_id name email phone');

    if (!targetUser) {
      return errorResponse(res, 'User not found with this phone or email', 404);
    }

    // ✅ Get current user
    const currentUser = await User.findById(userId);

    // ✅ Check if contact already exists
    const existingContact = currentUser.getContact(targetUser._id);
    if (existingContact) {
      return errorResponse(res, 'Contact already exists', 400);
    }

    // ✅ Add contact
    currentUser.addContact(
      targetUser._id,
      targetUser.phone,
      targetUser.email,
      targetUser.name,
      contactName || targetUser.name
    );

    await currentUser.save();

    console.log(`✅ [CONTACT] Added contact: ${targetUser.phone || targetUser.email}`);

    return successResponse(res, {
      contact: {
        userId: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone,
        contactName: contactName || targetUser.name,
        addedAt: new Date(),
        isFavorite: false
      }
    }, 'Contact added successfully', 201);

  } catch (error) {
    console.error('❌ Error in addContact:', error);
    next(error);
  }
};

/* ====================================================
   2. GET ALL CONTACTS
   ✅ Get user's contact list
   ✅ Support pagination
   ✅ Support sorting (by name, date, favorite)
   ✅ Populate contact details
   ==================================================== */
export const getAllContacts = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const sort = req.query.sort || 'name'; // name, date, favorite

    const user = await User.findById(userId)
      .populate({
        path: 'contacts.userId',
        select: 'name email phone avatar status'
      })
      .lean();

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Sort contacts
    let contacts = [...(user.contacts || [])];
    
    if (sort === 'favorite') {
      contacts.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    } else if (sort === 'date') {
      contacts.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    } else {
      // Default: sort by name
      contacts.sort((a, b) => {
        const nameA = (a.contactName || a.name || '').toLowerCase();
        const nameB = (b.contactName || b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }

    // ✅ Pagination
    const total = contacts.length;
    const paginatedContacts = contacts.slice(skip, skip + limit);

    // ✅ Format response
    const formattedContacts = paginatedContacts.map(contact => ({
      userId: contact.userId?._id,
      name: contact.userId?.name,
      email: contact.userId?.email,
      phone: contact.userId?.phone,
      avatar: contact.userId?.avatar,
      status: contact.userId?.status,
      contactName: contact.contactName,
      addedAt: contact.addedAt,
      isFavorite: contact.isFavorite
    }));

    return successResponse(res, {
      contacts: formattedContacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error in getAllContacts:', error);
    next(error);
  }
};

/* ====================================================
   3. SEARCH CONTACTS
   ✅ Search by name, email, or phone
   ✅ Support pagination
   ✅ Highlight matches
   ==================================================== */
export const searchContacts = async (req, res, next) => {
  try {
    const { query } = req.query;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!query) {
      return errorResponse(res, 'Search query is required', 400);
    }

    const user = await User.findById(userId)
      .populate({
        path: 'contacts.userId',
        select: 'name email phone avatar status'
      })
      .lean();

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Search in contacts
    const searchLower = query.toLowerCase();
    const matchedContacts = user.contacts.filter(contact => {
      const nameMatch = (contact.contactName || contact.name || '').toLowerCase().includes(searchLower);
      const emailMatch = (contact.userId?.email || '').toLowerCase().includes(searchLower);
      const phoneMatch = (contact.userId?.phone || '').includes(query);
      
      return nameMatch || emailMatch || phoneMatch;
    });

    // ✅ Pagination
    const total = matchedContacts.length;
    const paginatedContacts = matchedContacts.slice(skip, skip + limit);

    // ✅ Format response
    const formattedContacts = paginatedContacts.map(contact => ({
      userId: contact.userId?._id,
      name: contact.userId?.name,
      email: contact.userId?.email,
      phone: contact.userId?.phone,
      avatar: contact.userId?.avatar,
      contactName: contact.contactName,
      isFavorite: contact.isFavorite
    }));

    return successResponse(res, {
      results: formattedContacts,
      query,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error in searchContacts:', error);
    next(error);
  }
};

/* ====================================================
   4. REMOVE CONTACT
   ✅ Remove contact from list
   ==================================================== */
export const removeContact = async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Check if contact exists
    const contact = user.getContact(contactId);
    if (!contact) {
      return errorResponse(res, 'Contact not found', 404);
    }

    // ✅ Remove contact
    user.removeContact(contactId);
    await user.save();

    console.log(`✅ [CONTACT] Removed contact: ${contactId}`);

    return successResponse(res, null, 'Contact removed successfully');

  } catch (error) {
    console.error('❌ Error in removeContact:', error);
    next(error);
  }
};

/* ====================================================
   5. BLOCK USER
   ✅ Block user from sending messages
   ✅ Remove from contacts if exists
   ==================================================== */
export const blockUser = async (req, res, next) => {
  try {
    const { userId: blockUserId } = req.body;
    const userId = req.user._id;

    if (!blockUserId) {
      return errorResponse(res, 'User ID is required', 400);
    }

    // ✅ Prevent self-blocking
    if (userId.toString() === blockUserId) {
      return errorResponse(res, 'Cannot block yourself', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Check if already blocked
    if (user.isUserBlocked(blockUserId)) {
      return errorResponse(res, 'User is already blocked', 400);
    }

    // ✅ Block user
    user.blockUser(blockUserId);
    
    // ✅ Also remove from contacts if exists
    user.removeContact(blockUserId);

    await user.save();

    console.log(`✅ [BLOCK] Blocked user: ${blockUserId}`);

    return successResponse(res, null, 'User blocked successfully');

  } catch (error) {
    console.error('❌ Error in blockUser:', error);
    next(error);
  }
};

/* ====================================================
   6. UNBLOCK USER
   ✅ Unblock previously blocked user
   ==================================================== */
export const unblockUser = async (req, res, next) => {
  try {
    const { userId: unblockUserId } = req.body;
    const userId = req.user._id;

    if (!unblockUserId) {
      return errorResponse(res, 'User ID is required', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Check if user is blocked
    if (!user.isUserBlocked(unblockUserId)) {
      return errorResponse(res, 'User is not blocked', 400);
    }

    // ✅ Unblock user
    user.unblockUser(unblockUserId);
    await user.save();

    console.log(`✅ [UNBLOCK] Unblocked user: ${unblockUserId}`);

    return successResponse(res, null, 'User unblocked successfully');

  } catch (error) {
    console.error('❌ Error in unblockUser:', error);
    next(error);
  }
};

/* ====================================================
   7. GET BLOCKED USERS
   ✅ Get list of blocked users
   ==================================================== */
export const getBlockedUsers = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId)
      .populate({
        path: 'blockedUsers.userId',
        select: 'name email phone avatar'
      })
      .lean();

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Pagination
    const total = user.blockedUsers.length;
    const paginatedBlocked = user.blockedUsers.slice(skip, skip + limit);

    // ✅ Format response
    const formattedBlocked = paginatedBlocked.map(block => ({
      userId: block.userId?._id,
      name: block.userId?.name,
      email: block.userId?.email,
      phone: block.userId?.phone,
      avatar: block.userId?.avatar,
      blockedAt: block.blockedAt
    }));

    return successResponse(res, {
      blockedUsers: formattedBlocked,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error in getBlockedUsers:', error);
    next(error);
  }
};

/* ====================================================
   8. MARK FAVORITE CONTACT
   ✅ Mark contact as favorite
   ==================================================== */
export const markFavorite = async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Check if contact exists
    const contact = user.getContact(contactId);
    if (!contact) {
      return errorResponse(res, 'Contact not found', 404);
    }

    // ✅ Mark as favorite
    user.markContactAsFavorite(contactId);
    await user.save();

    console.log(`⭐ [FAVORITE] Marked contact as favorite: ${contactId}`);

    return successResponse(res, null, 'Contact marked as favorite');

  } catch (error) {
    console.error('❌ Error in markFavorite:', error);
    next(error);
  }
};

/* ====================================================
   9. UNMARK FAVORITE CONTACT
   ✅ Remove favorite status from contact
   ==================================================== */
export const unmarkFavorite = async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Check if contact exists
    const contact = user.getContact(contactId);
    if (!contact) {
      return errorResponse(res, 'Contact not found', 404);
    }

    // ✅ Unmark favorite
    user.unmarkContactAsFavorite(contactId);
    await user.save();

    console.log(`⭐ [UNFAVORITE] Unmarked contact: ${contactId}`);

    return successResponse(res, null, 'Contact unmarked from favorites');

  } catch (error) {
    console.error('❌ Error in unmarkFavorite:', error);
    next(error);
  }
};

/* ====================================================
   10. UPDATE CONTACT NAME
   ✅ Update custom contact name
   ==================================================== */
export const updateContactName = async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const { contactName } = req.body;
    const userId = req.user._id;

    if (!contactName) {
      return errorResponse(res, 'Contact name is required', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Check if contact exists
    const contact = user.getContact(contactId);
    if (!contact) {
      return errorResponse(res, 'Contact not found', 404);
    }

    // ✅ Update contact name
    contact.contactName = contactName;
    await user.save();

    console.log(`✏️ [CONTACT] Updated contact name: ${contactName}`);

    return successResponse(res, { contactName }, 'Contact name updated');

  } catch (error) {
    console.error('❌ Error in updateContactName:', error);
    next(error);
  }
};

/* ====================================================
   11. GET FAVORITE CONTACTS
   ✅ Get only favorite contacts
   ✅ Sorted and paginated
   ==================================================== */
export const getFavoriteContacts = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId)
      .populate({
        path: 'contacts.userId',
        select: 'name email phone avatar status'
      })
      .lean();

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // ✅ Filter favorite contacts
    const favoriteContacts = user.contacts.filter(c => c.isFavorite);

    // ✅ Pagination
    const total = favoriteContacts.length;
    const paginatedContacts = favoriteContacts.slice(skip, skip + limit);

    // ✅ Format response
    const formattedContacts = paginatedContacts.map(contact => ({
      userId: contact.userId?._id,
      name: contact.userId?.name,
      email: contact.userId?.email,
      phone: contact.userId?.phone,
      avatar: contact.userId?.avatar,
      contactName: contact.contactName,
      addedAt: contact.addedAt,
      isFavorite: contact.isFavorite
    }));

    return successResponse(res, {
      contacts: formattedContacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error in getFavoriteContacts:', error);
    next(error);
  }
};

// ✅ EXPORT ALL FUNCTIONS
export default {
  addContact,
  getAllContacts,
  searchContacts,
  removeContact,
  blockUser,
  unblockUser,
  getBlockedUsers,
  markFavorite,
  unmarkFavorite,
  updateContactName,
  getFavoriteContacts
};