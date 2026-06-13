# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Project: AutoContentPoster Pro

- **CWD:** `/home/z19/AI/ToolAI/AutoContentPoster`
- **Server:** Express on port 4001 (check .env PORT)
- **CSS build:** `npm run build:css` (Tailwind v4)
- **Frontend guide:** `FRONTEND.md`

## 🎨 Frontend Preferences

Always apply unless overridden:

- **Theme:** Dark (`#0a0a0a` bg)
- **Accent:** `#ed6918` — burnt orange
- **Style:** Glassmorphism / Liquid Glass with subtle glow
- **Font:** Inter (400-900)
- **Icons:** Font Awesome 6.6+
- **CSS:** Tailwind v4 + custom design system in `public/src/style.css`
- **Animation:** Subtle, purposeful, < 0.5s, cubic-bezier(0.4, 0, 0.2, 1)
- **Code:** Clean, modular, production-ready, no duplication

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## Related

- [Agent workspace](/concepts/agent-workspace)
