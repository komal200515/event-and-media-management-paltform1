const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes — must be logged in
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId).select('-password -faceDescriptor');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Optional auth — attach user if token exists, don't block if not
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId).select('-password');
    }
  } catch {}
  next();
};

// Role guard — call after auth
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ message: 'Forbidden' });
  next();
};

module.exports = { auth, optionalAuth, requireRole };