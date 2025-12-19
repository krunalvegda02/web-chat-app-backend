import express from 'express';
import uploadController from '../controller/upload.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { uploadImage, uploadChatMedia } from '../utils/multerConfig.js';

const router = express.Router();

router.post(
  '/theme-image',
  verifyJWT,
  requireRole('ADMIN'),
  uploadImage.single('image'),
  uploadController.uploadThemeImage
);

router.post(
  '/chat-media',
  verifyJWT,
  uploadChatMedia.array('files', 5),
  uploadController.uploadChatMedia
);

export default router;
