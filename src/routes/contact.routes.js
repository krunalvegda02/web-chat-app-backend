import express from 'express';
import {
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
} from '../controllers/contact.controller.js';
import { verifyJWT , requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();


/**
 * POST /api/contacts/add
 * Add contact by phone or email
 * 
 * Body:
 * {
 *   "identifier": "9876543210 or email@example.com",
 *   "contactName": "Optional custom name"
 * }
 */
router.post('/add', verifyJWT, addContact);

/**
 * GET /api/contacts
 * Get all contacts with pagination and sorting
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 50)
 * - sort: 'name' | 'date' | 'favorite' (default: 'name')
 */
router.get('/', verifyJWT, getAllContacts);

/**
 * GET /api/contacts/search
 * Search contacts by name, email, or phone
 * 
 * Query Parameters:
 * - query: string (required)
 * - page: number (default: 1)
 * - limit: number (default: 20)
 */
router.get('/search', verifyJWT, searchContacts);

/**
 * GET /api/contacts/favorites
 * Get only favorite contacts
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 50)
 */
router.get('/favorites', verifyJWT, getFavoriteContacts);

/**
 * GET /api/contacts/blocked
 * Get list of blocked users
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 50)
 */
router.get('/blocked', verifyJWT, getBlockedUsers);

/**
 * PUT /api/contacts/:contactId
 * Update contact name
 * 
 * Params:
 * - contactId: string (user ID)
 * 
 * Body:
 * {
 *   "contactName": "New contact name"
 * }
 */
router.put('/:contactId', verifyJWT, updateContactName);

/**
 * DELETE /api/contacts/:contactId
 * Remove contact
 * 
 * Params:
 * - contactId: string (user ID)
 */
router.delete('/:contactId', verifyJWT, removeContact);

/**
 * POST /api/contacts/:contactId/favorite
 * Mark contact as favorite
 * 
 * Params:
 * - contactId: string (user ID)
 */
router.post('/:contactId/favorite', verifyJWT, markFavorite);

/**
 * DELETE /api/contacts/:contactId/favorite
 * Unmark contact from favorites
 * 
 * Params:
 * - contactId: string (user ID)
 */
router.delete('/:contactId/favorite', verifyJWT, unmarkFavorite);

/**
 * POST /api/contacts/block
 * Block user
 * 
 * Body:
 * {
 *   "userId": "user ID to block"
 * }
 */
router.post('/block', verifyJWT, blockUser);

/**
 * POST /api/contacts/unblock
 * Unblock user
 * 
 * Body:
 * {
 *   "userId": "user ID to unblock"
 * }
 */
router.post('/unblock', verifyJWT, unblockUser);

export default router;