const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    if (req.path === '/mpesa-callback') {
      return next();
    }

    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.role = decoded.role || 'cashier';
    req.ownerUserId = decoded.ownerUserId || decoded.userId;
    req.scopeUserId = req.ownerUserId;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.role)) {
    return res.status(403).json({ error: 'You do not have permission for this action' });
  }
  next();
};

module.exports = {
  authMiddleware,
  requireRoles,
};
