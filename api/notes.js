/**
 * Notes API — Sticky notes / quick notes for workspace.
 * Each note: id, content, color, pinned, userId, createdAt, updatedAt
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '..', 'data', 'notes.json');

const NOTE_COLORS = [
  { id: 'amber',  bg: '#fbbf24', text: '#1c1917' },
  { id: 'lime',   bg: '#a3e635', text: '#1a2e05' },
  { id: 'sky',    bg: '#38bdf8', text: '#0c4a6e' },
  { id: 'rose',   bg: '#fb7185', text: '#4c0519' },
  { id: 'violet', bg: '#a78bfa', text: '#2e1065' },
  { id: 'emerald',bg: '#34d399', text: '#022c22' },
  { id: 'orange', bg: '#fb923c', text: '#431407' },
  { id: 'stone',  bg: '#a8a29e', text: '#1c1917' },
];

function loadNotes() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveNotes(notes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2), 'utf-8');
}

// ── GET /api/notes ──────────────────────────────────────────────
router.get('/', authRequired, (req, res) => {
  const all = loadNotes();
  const userNotes = req.user.role === 'admin'
    ? all
    : all.filter(n => n.userId === req.user.id);
  // Pinned first, then by updatedAt desc
  userNotes.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  res.json({ success: true, notes: userNotes, colors: NOTE_COLORS });
});

// ── POST /api/notes ──────────────────────────────────────────────
router.post('/', authRequired, (req, res) => {
  const { content, color = 'amber' } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: 'Nội dung ghi chú không được để trống' });
  }
  const notes = loadNotes();
  const note = {
    id: `note-${uuidv4().slice(0, 8)}-${Date.now()}`,
    content: content.trim(),
    color,
    pinned: false,
    userId: req.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  notes.push(note);
  saveNotes(notes);
  res.status(201).json({ success: true, note });
});

// ── PUT /api/notes/:id ───────────────────────────────────────────
router.put('/:id', authRequired, (req, res) => {
  const notes = loadNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Ghi chú không tồn tại' });
  if (req.user.role !== 'admin' && notes[idx].userId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Không có quyền' });
  }
  const { content, color, pinned } = req.body;
  if (content !== undefined) notes[idx].content = content.trim();
  if (color !== undefined) notes[idx].color = color;
  if (pinned !== undefined) notes[idx].pinned = pinned;
  notes[idx].updatedAt = new Date().toISOString();
  saveNotes(notes);
  res.json({ success: true, note: notes[idx] });
});

// ── DELETE /api/notes/:id ────────────────────────────────────────
router.delete('/:id', authRequired, (req, res) => {
  let notes = loadNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Ghi chú không tồn tại' });
  if (req.user.role !== 'admin' && notes[idx].userId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Không có quyền' });
  }
  notes.splice(idx, 1);
  saveNotes(notes);
  res.json({ success: true });
});

module.exports = router;
