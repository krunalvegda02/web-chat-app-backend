import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { successResponse, errorResponse } from '../utils/response.js';
import fs from 'fs';

const uploadThemeImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 400);
    }

    const { type, oldUrl } = req.body; // 'logo' or 'background'
    const folder = type === 'logo' ? 'theme/logos' : 'theme/backgrounds';

    // Delete old image from Cloudinary if exists
    if (oldUrl) {
      const { deleteFromCloudinary } = await import('../utils/cloudinary.js');
      await deleteFromCloudinary(oldUrl);
    }

    // Upload to Cloudinary
    const result = await uploadOnCloudinary(req.file.path, {
      folder,
      transformation: type === 'logo' 
        ? [{ width: 400, height: 200, crop: 'limit' }]
        : [{ width: 1920, height: 1080, crop: 'limit' }]
    });

    return successResponse(res, {
      url: result.secure_url,
      publicId: result.public_id,
    }, 'Image uploaded successfully');

  } catch (error) {
    // Clean up file if upload fails
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

const uploadChatMedia = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 'No files uploaded', 400);
    }

    const uploadedMedia = [];

    for (const file of req.files) {
      const fileType = file.mimetype.startsWith('image/') ? 'image' 
        : file.mimetype.startsWith('video/') ? 'video'
        : 'file';

      const result = await uploadOnCloudinary(file.path, {
        folder: `chat/${fileType}s`,
        resource_type: fileType === 'video' ? 'video' : fileType === 'file' ? 'raw' : 'image'
      });

      uploadedMedia.push({
        type: fileType,
        url: result.secure_url,
        mimeType: file.mimetype,
        size: file.size,
        publicId: result.public_id
      });

      // Clean up temp file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    return successResponse(res, { media: uploadedMedia }, 'Files uploaded successfully');

  } catch (error) {
    // Clean up files if upload fails
    if (req.files) {
      req.files.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    next(error);
  }
};

export default {
  uploadThemeImage,
  uploadChatMedia,
};
