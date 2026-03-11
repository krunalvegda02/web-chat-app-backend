import mongoose from 'mongoose';
import Platform from '../src/models/platform.model.js';
import User from '../src/models/user.model.js';
import dotenv from 'dotenv';

dotenv.config();

const fixPlatformAdmins = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all platforms
    const platforms = await Platform.find();
    console.log(`📦 Found ${platforms.length} platforms`);

    let updatedCount = 0;

    for (const platform of platforms) {
      if (platform.adminId) {
        const adminUser = await User.findById(platform.adminId);
        if (adminUser) {
          if (!adminUser.platformId) {
            adminUser.platformId = platform._id;
            await adminUser.save();
            updatedCount++;
            console.log(`✅ Updated admin ${adminUser.email} with platformId ${platform._id}`);
          } else {
            console.log(`⏭️ Admin ${adminUser.email} already has platformId`);
          }
        }
      }
    }

    console.log(`\n✅ Migration complete! Updated ${updatedCount} platform admins`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixPlatformAdmins();
