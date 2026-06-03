/**
 * Admin API — User management.
 * All routes require auth + admin role check.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { loadUsers, saveUsers, authRequired } = require('../middleware/auth');

const router = express.Router();
const DATA_DIR = require('path').join(__dirname, '..', 'data');

// ── Helper: admin check ─────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'dev') {
    return res.status(403).json({ success: false, message: 'Chỉ admin/dev mới có quyền' });
  }
  next();
}

// ── GET /api/admin/users ────────────────────────────────────────
router.get('/users', authRequired, requireAdmin, (req, res) => {
  try {
    const users = loadUsers().map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      status: u.status || 'active',
      createdAt: u.createdAt,
    }));
    res.json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /api/admin/users ───────────────────────────────────────
router.post('/users', authRequired, requireAdmin, async (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username và password bắt buộc' });
    }
    const users = loadUsers();
    if (users.find(u => u.username === username)) {
      return res.status(409).json({ success: false, message: 'Username đã tồn tại' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
      id: `user-${uuidv4().slice(0, 8)}`,
      username,
      password: hashed,
      fullName: fullName || username,
      role: role === 'admin' ? 'admin' : role === 'dev' ? 'dev' : 'sale',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    saveUsers(users);
    res.status(201).json({
      success: true,
      user: { id: newUser.id, username: newUser.username, fullName: newUser.fullName, role: newUser.role, status: newUser.status, createdAt: newUser.createdAt },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── PUT /api/admin/users/:id ────────────────────────────────────
router.put('/users/:id', authRequired, requireAdmin, async (req, res) => {
  try {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });

    const { fullName, role, password } = req.body;
    if (fullName !== undefined) users[idx].fullName = fullName;
    if (role !== undefined) users[idx].role = role === 'admin' ? 'admin' : role === 'dev' ? 'dev' : 'sale';
    if (password) users[idx].password = await bcrypt.hash(password, 10);

    saveUsers(users);
    res.json({
      success: true,
      user: { id: users[idx].id, username: users[idx].username, fullName: users[idx].fullName, role: users[idx].role, status: users[idx].status, createdAt: users[idx].createdAt },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── PATCH /api/admin/users/:id/status ───────────────────────────
router.patch('/users/:id/status', authRequired, requireAdmin, (req, res) => {
  try {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });

    const newStatus = users[idx].status === 'active' ? 'inactive' : 'active';
    users[idx].status = newStatus;
    saveUsers(users);
    res.json({ success: true, user: { id: users[idx].id, username: users[idx].username, status: users[idx].status } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── DELETE /api/admin/users/:id ─────────────────────────────────
router.delete('/users/:id', authRequired, requireAdmin, (req, res) => {
  try {
    let users = loadUsers();
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
    if ((users[idx].role === 'admin' || users[idx].role === 'dev') && users.filter(u => u.role === users[idx].role).length <= 1) {
      return res.status(400).json({ success: false, message: 'Không thể xóa admin/dev cuối cùng' });
    }
    users.splice(idx, 1);
    saveUsers(users);
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
