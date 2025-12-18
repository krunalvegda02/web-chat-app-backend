import express from 'express';
import uploadController from '../controller/upload.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { uploadImage } from '../utils/multerConfig.js';

const router = express.Router();

router.post(
  '/theme-image',
  verifyJWT,
  requireRole('ADMIN'),
  uploadImage.single('image'),
  uploadController.uploadThemeImage
);

export default router;
