// src/middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js'
// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Auth Header:', authHeader); // Debug
    const token = authHeader && authHeader.split(' ')[1];

    console.log('Extracted token:', token); // Debug
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded); // Debug
    const user = await User.findById(decoded.id).select('-password');

    console.log('Found user:', user?._id); // Debug
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log('Token verification error:', error); // Debug
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

// Check if user can process more videos
const checkVideoLimit = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user.canProcessVideo()) {
      return res.status(429).json({
        success: false,
        message: 'Monthly video processing limit exceeded',
        limit: user.usage.monthlyLimit,
        used: user.usage.videosProcessed,
        resetDate: new Date(user.usage.lastReset.getFullYear(), user.usage.lastReset.getMonth() + 1, 1)
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking video limit'
    });
  }
};

// Check if user has premium access
const requirePremium = (req, res, next) => {
  console.log('User plan:', req.user?.plan); // Debug
  if (req.user.plan !== 'premium') {
    return res.status(403).json({
      success: false,
      message: 'Premium subscription required for this feature'
    });
  }
  next();
};
// Optional authentication (for public routes that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication for optional routes
    next();
  }
};

export default {
  authenticateToken,
  checkVideoLimit,
  requirePremium,
  optionalAuth
};