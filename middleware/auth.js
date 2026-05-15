/**
 * JWT Authentication Middleware
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ CRITICAL: JWT_SECRET not set in .env! Auth will fail.');
}
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// ── User helpers ────────────────────────────────────────────────

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function findUserById(id) {
  return loadUsers().find(u => u.id === id) || null;
}

function findUserByUsername(username) {
  return loadUsers().find(u => u.username === username) || null;
}

// ── Token helpers ───────────────────────────────────────────────

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Express middleware ──────────────────────────────────────────

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Token hết hạn hoặc không hợp lệ' });
  }

  const user = findUserById(decoded.id);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Người dùng không tồn tại' });
  }

  req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  next();
}

function authOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      const user = findUserById(decoded.id);
      if (user) {
        req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
      }
    }
  }
  next();
}

module.exports = {
  loadUsers,
  saveUsers,
  findUserById,
  findUserByUsername,
  generateToken,
  verifyToken,
  authRequired,
  authOptional,
  JWT_SECRET,
};
