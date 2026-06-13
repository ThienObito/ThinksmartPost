# Frontend Style Guide — AutoContentPoster Pro

## 🎨 Design Identity

- **Theme:** Dark-first (bg: `#0a0a0a`)
- **Accent:** `#ed6918` (burnt orange)
- **Vibe:** Modern, clean, professional — "Liquid Glass" glassmorphism
- **Font:** Inter (weights: 400, 500, 600, 700, 800, 900)
- **Icons:** Font Awesome 6.6+

## 🪟 Glassmorphism System

```css
glass-bg:      oklch(0.07 0.01 280 / 0.72)
glass-blur:    18px
glass-border:  1px solid oklch(1 0 0 / 0.06)
glass-shadow:  inset 0 1px 0 oklch(1 0 0 / 0.06), 0 8px 32px oklch(0 0 0 / 0.35)
glass-glow:    0 0 30px oklch(from #ed6918 l c h / 0.08), 0 0 60px oklch(from #ed6918 l c h / 0.03)
```

## 📐 Component Guidelines

### Cards
- `glass` / `card-d` / `stat-card` — glassmorphism base
- Hover: `translateY(-3px)` + accent border glow
- Stats card: gradient top-border on hover

### Buttons
- **Primary:** gradient `#ed6918 → #d4550f` with glow shadow
- **Ghost:** subtle glass background, accent border on hover
- **Sizes:** default (12+24px), `.btn-sm` (8+16px)
- Hover reveal: shimmer sweep effect

### Inputs & Selects
- Dark bg (`#1a1a1e`), 2px border (`#333`)
- Focus: accent border + `4px` accent ring
- Selects: glass bg, custom chevron

### Modal
- Glass backdrop (`blur(24px)`)
- 85vh max height, flex column layout
- Head / Body / Foot sections

### Toast
- Fixed top-right, glass backdrop
- Slide in/out animations
- Pointer-events: none container

## ✨ Animation Guidelines

- `fadeIn` — 0.35s ease (section transitions)
- `fadeInUp` — subtle directional reveal
- `scaleIn` — overlay/lightbox entries
- `shimmer` — loading skeleton effect
- Keep animations subtle, purposeful, < 0.5s
- Use `cubic-bezier(0.4, 0, 0.2, 1)` as default easing

## 🎯 Code Standards

- **DO:** Write modular, reusable utility classes
- **DO:** Use CSS custom properties for theming
- **DO:** Prefer `oklch()` for all accent-derived colors (consistent luminance)
- **DO:** Responsive-first — mobile sidebar collapses, content fills
- **DON'T:** Repeat yourself — extract patterns into classes
- **DON'T:** Over-animate — subtle beats flashy
- **DON'T:** Hardcode accent hex everywhere — use `var(--color-accent)`
- **DON'T:** Write complex layouts without considering mobile

## 📁 Structure

```
public/
├── index.html          # Main SPA shell
├── src/
│   └── style.css       # Tailwind v4 + design system (build target)
├── dist/
│   └── style.css       # Built output (gitignored)
└── assets/             # Static assets (images, etc.)
```

## 🔧 Tailwind v4 Usage

```bash
# Dev (watch)
npm run dev:css

# Build for production
npm run build:css

# Full build
npm run build
```

- Use Tailwind utility classes in HTML where possible
- Fall back to `@apply` in style.css for complex/repeated patterns
- Custom theme values defined in `@theme` block in style.css

## 🏗️ Build Pipeline

```json
{
  "scripts": {
    "build:css": "tailwindcss --input public/src/style.css --output public/dist/style.css",
    "dev:css": "tailwindcss --input public/src/style.css --output public/dist/style.css --watch",
    "build": "npm run build:css",
    "start": "node server.js"
  }
}
```
