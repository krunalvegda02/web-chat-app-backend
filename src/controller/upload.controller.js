import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { successResponse, errorResponse } from '../utils/response.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export default {
  uploadThemeImage,
};
