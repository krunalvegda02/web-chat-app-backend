import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    getContacts,
    addContact,
    removeContact,
    searchUserByPhoneOrEmail,
    updateContactName
} from '../controller/contacts.controller.js';

const router = express.Router();

router.use(verifyJWT);

router.get('/search-user', searchUserByPhoneOrEmail);
router.post('/', addContact);
router.get('/', getContacts);
router.delete('/:contactId', removeContact);
router.put('/:contactId', updateContactName);

export default router;
