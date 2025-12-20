# File Storage Configuration

## Current Issue: Cloudinary "Untrusted Customer" Error

Your Cloudinary account is showing an "untrusted customer" error. This typically happens when:
- Free account email is not verified
- Account flagged for suspicious activity
- New account without verification

## ✅ IMMEDIATE FIX: Local Storage (Currently Active)

Files are now saved to your server instead of Cloudinary.

**Location**: `Backend/uploads/`
- `uploads/chat/images/` - Image files
- `uploads/chat/videos/` - Video files  
- `uploads/chat/audios/` - Audio/voice files
- `uploads/chat/files/` - Documents
- `uploads/theme/logos/` - Theme logos
- `uploads/theme/backgrounds/` - Theme backgrounds

**Access URL**: `http://localhost:5500/uploads/chat/images/filename.jpg`

## How to Fix Cloudinary

### Option 1: Verify Your Account
1. Check email for Cloudinary verification link
2. Click verification link
3. Wait 5-10 minutes
4. Switch back to Cloudinary (see below)

### Option 2: Create New Account
1. Go to https://cloudinary.com/users/register/free
2. Use a different email address
3. Verify email immediately
4. Update `.env` with new credentials:
   ```
   CLOUDINARY_CLOUD_NAME=your_new_cloud_name
   CLOUDINARY_API_KEY=your_new_api_key
   CLOUDINARY_API_SECRET=your_new_api_secret
   ```
5. Switch back to Cloudinary (see below)

## Switching Between Storage Methods

### Use Local Storage (Current)
In `Backend/src/controller/upload.controller.js`:
```javascript
const USE_LOCAL_STORAGE = true;  // ✅ Currently active
```

### Use Cloudinary Storage
In `Backend/src/controller/upload.controller.js`:
```javascript
const USE_LOCAL_STORAGE = false;  // Switch to Cloudinary
```

## Advantages & Disadvantages

### Local Storage
✅ Works immediately  
✅ No external dependencies  
✅ Free unlimited storage  
✅ Fast for local development  
❌ Files lost if server crashes  
❌ No CDN optimization  
❌ Harder to scale  

### Cloudinary Storage
✅ CDN delivery (faster globally)  
✅ Automatic image optimization  
✅ Video transcoding  
✅ Persistent storage  
✅ Easy to scale  
❌ Requires account verification  
❌ Free tier limits (25GB storage, 25GB bandwidth/month)  

## Production Recommendation

For production, use:
1. **Cloudinary** - For images, videos (CDN benefits)
2. **AWS S3** - For large files, backups
3. **Local Storage** - Only for temporary files

## Need Help?

If Cloudinary issues persist:
1. Contact Cloudinary support: https://support.cloudinary.com
2. Consider AWS S3 as alternative
3. Keep using local storage for development
