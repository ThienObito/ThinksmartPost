/**
 * Authentication Routes — Login, Register, Me, Logout
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  loadUsers,
  saveUsers,
  findUserByUsername,
  generateToken,
  authRequired,
} = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/register ─────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { username, password, fullName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Thiếu username hoặc password' });
    }
    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Username tối thiểu 3 ký tự, password tối thiểu 6 ký tự' });
    }

    const users = loadUsers();

    if (findUserByUsername(username)) {
      return res.status(409).json({ success: false, message: 'Username đã tồn tại' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: `user-${uuidv4().slice(0, 8)}`,
      username,
      password: hashedPassword,
      fullName: fullName || username,
      role: 'sale',
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    saveUsers(users);

    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        fullName: newUser.fullName,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Thiếu username hoặc password' });
    }

    const user = findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────

router.get('/me', authRequired, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ── GET /api/auth/users (admin only) ────────────────────────────

router.get('/users', authRequired, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Chỉ admin mới có quyền' });
  }

  const users = loadUsers().map(({ password, ...rest }) => rest);
  res.json({ success: true, users });
});

module.exports = router;
