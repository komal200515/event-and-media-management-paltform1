const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes — must be logged in

// ✅ EXISTING — blocks request if no/invalid token
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// ✅ NEW — attaches user IF token valid, but never blocks
// Use on routes where guests allowed but logged-in users get more
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      req.user = null; // bad token = treat as guest
    }
  }
  next();
};


// Usage in other files:
// const auth = require('../middleware/auth');
// const { optionalAuth } = require('../middleware/auth');

// Role guard — call after auth
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ message: 'Forbidden' });
  next();
};

module.exports = { auth, optionalAuth, requireRole };