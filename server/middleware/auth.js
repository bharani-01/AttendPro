const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, RevokedToken } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_app_secret_key_2024';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}_refresh`;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

function generateJti() {
  return crypto.randomBytes(16).toString('hex');
}

const decodeTokenExpiry = (token, secret) => {
  const decoded = jwt.verify(token, secret);
  if (!decoded.exp) return null;
  return new Date(decoded.exp * 1000);
};

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. Invalid token format.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }

    if (decoded.jti) {
      const revoked = await RevokedToken.findOne({ jti: decoded.jti });
      if (revoked) {
        return res.status(401).json({ error: 'Token has been revoked.' });
      }
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    if (typeof decoded.tokenVersion === 'number' && decoded.tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Token is no longer valid.' });
    }

    req.user = user;
    req.token = token;
    req.tokenPayload = decoded;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    res.status(500).json({ error: 'Server error during authentication.' });
  }
};

const roleCheck = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

const generateAccessToken = (userId, tokenVersion = 0) => {
  return jwt.sign(
    {
      userId,
      tokenVersion,
      type: 'access',
      jti: generateJti()
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
};

const generateRefreshToken = (userId, tokenVersion = 0) => {
  return jwt.sign(
    {
      userId,
      tokenVersion,
      type: 'refresh',
      jti: generateJti()
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};

const verifyRefreshToken = (token) => jwt.verify(token, JWT_REFRESH_SECRET);

const revokeAccessToken = async (decodedToken, reason = 'revoked') => {
  if (!decodedToken || !decodedToken.jti || !decodedToken.exp) return;
  try {
    await RevokedToken.updateOne(
      { jti: decodedToken.jti },
      {
        $setOnInsert: {
          jti: decodedToken.jti,
          userId: decodedToken.userId || null,
          expiresAt: new Date(decodedToken.exp * 1000),
          reason
        }
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Failed to revoke access token:', err.message);
  }
};

module.exports = {
  auth,
  roleCheck,
  generateToken: generateAccessToken,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeAccessToken,
  decodeTokenExpiry,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  verifyToken: auth,
  requireRole: roleCheck
};
