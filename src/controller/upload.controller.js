import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { successResponse, errorResponse } from '../utils/response.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ USE LOCAL STORAGE (Cloudinary fallback)
const USE_LOCAL_STORAGE = false;

const uploadThemeImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 400);
    }

    const { type, oldUrl } = req.body;
    
    if (USE_LOCAL_STORAGE) {
      // ✅ LOCAL STORAGE: Move file to permanent location
      const folder = type === 'logo' ? 'logos' : 'backgrounds';
      const uploadDir = path.join(__dirname, '../../uploads/theme', folder);
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const filename = `${Date.now()}_${req.file.originalname}`;
      const permanentPath = path.join(uploadDir, filename);
      
      fs.renameSync(req.file.path, permanentPath);
      
      // ✅ FIX: Use base URL without /api/v1/ for static files
      const baseUrl = process.env.CLIENT_URL.replace('/api/v1/', '');
      const url = `${baseUrl}/uploads/theme/${folder}/${filename}`;
      
      return successResponse(res, {
        url,
        publicId: filename,
      }, 'Image uploaded successfully');
    }

    // Cloudinary upload (original)
    const folder = type === 'logo' ? 'theme/logos' : 'theme/backgrounds';
    if (oldUrl) {
      const { deleteFromCloudinary } = await import('../utils/cloudinary.js');
      await deleteFromCloudinary(oldUrl);
    }

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
      let fileType = file.mimetype.startsWith('image/') ? 'image' 
        : file.mimetype.startsWith('video/') ? 'video'
        : file.mimetype.startsWith('audio/') ? 'audio'
        : 'file';

      if (USE_LOCAL_STORAGE) {
        // ✅ LOCAL STORAGE: Move file to permanent location
        const uploadDir = path.join(__dirname, '../../uploads/chat', `${fileType}s`);
        
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const filename = `${Date.now()}_${file.originalname}`;
        const permanentPath = path.join(uploadDir, filename);
        
        fs.renameSync(file.path, permanentPath);
        
        // ✅ FIX: Use base URL without /api/v1/ for static files
        const baseUrl = process.env.CLIENT_URL.replace('/api/v1/', '');
        const url = `${baseUrl}/uploads/chat/${fileType}s/${filename}`;
        
        // Check if it's a voice note
        if (fileType === 'audio' && file.mimetype.includes('webm')) {
          fileType = 'voice';
        }
        
        uploadedMedia.push({
          type: fileType,
          url,
          mimeType: file.mimetype,
          size: file.size,
          fileName: file.originalname,
          publicId: filename,
          isVoiceNote: fileType === 'voice'
        });
        
        console.log(`✅ [LOCAL] Uploaded ${fileType}: ${url}`);
      } else {
        // Cloudinary upload - use 'image' resource type for all (PDFs work as images)
        const result = await uploadOnCloudinary(file.path, {
          folder: `chat/${fileType}s`,
          resource_type: fileType === 'video' ? 'video' : 'image'
        });

        uploadedMedia.push({
          type: fileType,
          url: result.secure_url,
          mimeType: file.mimetype,
          size: file.size,
          fileName: file.originalname,
          publicId: result.public_id
        });

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    return successResponse(res, { media: uploadedMedia }, 'Files uploaded successfully');

  } catch (error) {
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

const downloadFile = async (req, res, next) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return errorResponse(res, 'URL is required', 400);
    }

    // Proxy the file from Cloudinary with proper headers
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (fileRes) => {
      // Set headers for download
      const fileName = url.split('/').pop().split('?')[0];
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', fileRes.headers['content-type'] || 'application/octet-stream');
      
      // Pipe the file to response
      fileRes.pipe(res);
    }).on('error', (error) => {
      console.error('Download proxy error:', error);
      return errorResponse(res, 'Failed to download file', 500);
    });

  } catch (error) {
    next(error);
  }
};

export default {
  uploadThemeImage,
  uploadChatMedia,
  downloadFile,
};
