import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    getContacts,
    addContact,
    removeContact,
    searchUsersByContact
} from '../controller/contacts.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyJWT);

// Get user's contacts
router.get('/', getContacts);

// Search users by phone/email/name
router.get('/search', searchUsersByContact);

// Add contact
router.post('/', addContact);

// Remove contact
router.delete('/:userId', removeContact);

export default router;
