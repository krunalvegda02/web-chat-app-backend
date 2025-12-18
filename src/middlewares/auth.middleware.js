import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const verifyJWT = async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    console.log("===================================", token);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized — token missing",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    console.log(decoded)

    const user = await User.findById(decoded?.userId).select(
      "-password -refreshToken"
    );
    console.log(user)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("verifyJWT error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};




export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    console.log(req.user)

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden — insufficient permissions",
      });
    }

    next();
  };
};


