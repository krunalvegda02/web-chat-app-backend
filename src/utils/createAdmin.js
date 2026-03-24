import User from "../models/user.model.js";
import MESSAGE from "../constants/message.js";

export const createAdmin = async () => {
    try {
        const admin = await User.findOne({ email: "admin@vfx247.com" });

        if (!admin) {
            console.log("Admin Not Registered, Creating Admin: Email = admin@vfx247.com");

            const registerAdmin = await User.create({
                email: "admin@vfx247.com",
                password: "admin@5656@",
                role: "SUPER_ADMIN",
                name: "Super Admin",
                phone: "9999999999",
                status: "ACTIVE"
            });

            console.log("Admin registered successfully:", {
                _id: registerAdmin._id,
                name: registerAdmin.name,
                email: registerAdmin.email,
                role: registerAdmin.role
            });
        } else {
            console.log("Admin already exists:", {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            });
        }
    } catch (error) {
        console.error("Admin Registration error:", error.message);
        console.error(MESSAGE.ADMIN_REGISTER_FAILED);
    }
}