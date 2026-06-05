/*!
 * QTPosterPro v3.1 — AutoContentPoster Pro Dashboard
 * Senior Frontend Engineer — May 2026
 *
 * Architecture:
 *   QTP.* namespace isolates modules → Auth, App, Articles, Templates,
 *   Queue, Report, WP, Users, Settings, Analytics, Media, Notes,
 *   Images, Chat
 *
 * Every function called from index.html's inline onclick handlers
 * is mapped 1:1 below.
 *
 * ── Design Principles ──
 * • Modern ES6+ (arrow functions, async/await, template literals)
 * • Zero dependencies beyond Chart.js (loaded via CDN in HTML)
 * • Defensive: every API call wrapped in try/catch
 * • Reactive: state in QTP.*, UI updates via render() patterns
 * • Toast-based UX (no alert()/confirm() — uses custom modals)
 *
 * ── Token Flow ──
 *   Login → JWT stored in localStorage → Bearer header on every fetch
 *   Logout → clear localStorage → show landing page
 */
'use strict';

/* ===================================================================
   SECTION 1 — DOM Helpers & Core Utilities
   =================================================================== */

/** Shorthand for document.getElementById */
const $id = (id) => document.getElementById(id);

/** Shorthand for document.querySelector */
const $q = (sel) => document.querySelector(sel);

/** Shorthand for document.querySelectorAll */
const $qa = (sel) => document.querySelectorAll(sel);

/** Auto-detect API base URL: use proxy if embedded in other domain */
const API_BASE = (() => {
  // If loaded from iflow or another domain, use sotviet.site
  if (window.location.hostname !== 'localhost' &&
      window.location.hostname !== 'sotviet.site' &&
      window.location.hostname !== '127.0.0.1') {
    console.warn('Embedded mode detected at', window.location.hostname, '→ using sotviet.site API');
    return 'https://sotviet.site';
  }
  return '';
})();

/**
 * Generic API client — prepends /api, injects Bearer token,
 * parses JSON response.  One function for the entire app.
 * @param {string} path  — e.g. '/auth/login' (no /api prefix)
 * @param {object} [opts] — fetch options (method, body, etc.)
 * @returns {Promise<object>} parsed JSON
 */
/** Auto‑relogin if server rejects our token */
async function ensureToken() {
  const token = localStorage.getItem('qtp_token');
  if (token) {
    // Quick check — is token still valid?
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) return token;
  }
  // Token bad or missing — re‑login with default creds
  try {
    const r = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const d = await r.json();
    if (d.success) {
      localStorage.setItem('qtp_token', d.token);
      localStorage.setItem('qtp_user', JSON.stringify(d.user));
      QTP._token = d.token;
      QTP._user = d.user;
      return d.token;
    }
  } catch {}
  return null;
}

async function api(path, opts = {}) {
  let token = localStorage.getItem('qtp_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${API_BASE}/api${path}`;
  let res = await fetch(url, {
    ...opts,
    headers: { ...headers, ...opts.headers },
  });

  // Token expired? Auto‑relogin and retry once
  if (res.status === 401) {
    token = await ensureToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      res = await fetch(url, {
        ...opts,
        headers: { ...headers, ...opts.headers },
      });
    }
  }

  // Handle non-JSON responses gracefully
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  // Fallback for non-JSON responses (HTML errors, etc.)
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    return { success: false, message: `Server returned ${res.status}: ${text.substring(0, 200)}` };
  }
}

/** Escape HTML entities (XSS prevention) */
function esc(str) {
  if (typeof str !== 'string') return str ?? '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format ISO date → Vietnamese locale (dd/mm/yyyy) */
function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Truncate string with ellipsis */
function trunc(s, n = 50) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Simple UUID v4 for temporary client IDs */
function uid() {
  return 'xxxx-xxxx'.replace(/x/g, () =>
    ((Math.random() * 16) | 0).toString(16)
  );
}

/* ===================================================================
   SECTION 2 — Toast & Confirm Modals (replaces alert/confirm)
   =================================================================== */

/**
 * Show a toast notification
 * @param {string} msg  — message text
 * @param {'success'|'error'|'warning'|'loading'} type
 */
function showToast(msg, type = 'success') {
  const container = $id('toastC');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'toast-el';

  const bgMap = {
    success: 'linear-gradient(135deg,#16a34a,#22c55e)',
    error: 'linear-gradient(135deg,#dc2626,#ef4444)',
    warning: 'linear-gradient(135deg,#f59e0b,#eab308)',
    loading: 'linear-gradient(135deg,#14b8a6,#22d3ee)',
  };
  const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    loading: 'fa-spinner fa-spin',
  };

  el.style.background = bgMap[type] ?? bgMap.success;
  el.innerHTML = `<i class="fas ${iconMap[type] ?? iconMap.success}"></i> ${msg}`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-hide');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/**
 * Custom confirm modal (replaces browser confirm())
 * @param {string}   msg    — question
 * @param {Function} onYes  — called on confirm
 * @param {Function} [onNo] — called on cancel
 */
function showConfirm(msg, onYes, onNo) {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    'background:rgba(0,0,0,0.7);backdrop-filter:blur(4px)',
    'display:flex;align-items:center;justify-content:center;padding:20px',
  ].join(';');

  overlay.innerHTML = `
    <div style="background:var(--color-card);border:1px solid var(--color-border);
                border-radius:16px;max-width:400px;width:100%;padding:24px;
                box-shadow:0 24px 80px rgba(0,0,0,.5)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <i class="fas fa-question-circle" style="font-size:28px;color:var(--color-accent)"></i>
        <h3 style="font-size:18px;font-weight:700;margin:0">Xác nhận</h3>
      </div>
      <p style="color:var(--color-sub);font-size:14px;line-height:1.6;margin-bottom:20px">${msg}</p>
      <div style="display:flex;gap:12px">
        <button id="cfNo" style="flex:1;padding:10px;border-radius:10px;
                background:var(--color-card-2);border:1px solid var(--color-border);
                color:var(--color-sub);font-weight:600;font-family:inherit;cursor:pointer">Hủy</button>
        <button id="cfYes" style="flex:1;padding:10px;border-radius:10px;
                background:linear-gradient(135deg,var(--color-accent),#d4550f);border:none;
                color:#fff;font-weight:600;font-family:inherit;cursor:pointer">Xác nhận</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#cfYes').onclick = () => {
    overlay.remove();
    onYes?.();
  };
  overlay.querySelector('#cfNo').onclick = () => {
    overlay.remove();
    onNo?.();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onNo?.();
    }
  };
}

/* ===================================================================
   SECTION 3 — QTP Namespace (global app state)
   =================================================================== */

/**
 * QTP — single global namespace mirroring the index.html inline handlers.
 * Sub-namespaces are lazily populated below.
 */
const QTP = {
  _token: localStorage.getItem('qtp_token'),
  _fakeMode: localStorage.getItem('qtp_fake') === 'true',
  _user: (() => {
    try {
      const u = localStorage.getItem('qtp_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })(),
  _articles: [],
  _templates: [],
  _notes: [],
  _analyticsChart: null,
  _fakeArticles: null,
  _fakeTemplates: null,
};

/* ── Fake Data Store ── */
QTP._fake = {
  /** Generate fake articles array */
  get articles() {
    if (QTP._fakeArticles) return QTP._fakeArticles;
    const titles = [
      'Hướng dẫn SEO WordPress Toàn Diện 2026',
      'Cách Viết Content Chuẩn Google AI',
      'Top 10 Công Cụ AI Cho Content Marketing',
      'Chiến Lược Social Media Cho Doanh Nghiệp Nhỏ',
      'Tối Ưu Tốc Độ Website WordPress',
      'Xu Hướng Thiết Kế Web 2026',
      'Bí Quyết Tăng Traffic Tự Nhiên',
      'Hướng Dẫn Làm Video Shorts Cho Marketing',
      'Email Marketing Automation Cơ Bản',
      'Phân Tích Đối Thủ Cạnh Tranh SEO',
      'Cách Tối Ưu Hình Ảnh Cho Web',
      'Xây Dựng Backlink Chất Lượng',
      'Google Analytics Cho Người Mới',
      'Chiến Lược Content Marketing 2026',
      'Hướng Dẫn Làm Landing Page Chuyển Đổi Cao',
    ];
    const categories = ['SEO', 'Content', 'Marketing', 'WordPress', 'Social Media', 'AI Tools'];
    const statuses = ['published', 'published', 'published', 'draft'];
    const now = new Date();
    const articles = [];
    for (let i = 0; i < 42; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      const title = titles[i % titles.length] + (i >= titles.length ? ' #' + (i + 1) : '');
      articles.push({
        file: `article-${i + 1}.json`,
        title,
        summary: `Bài viết chuyên sâu về ${title.toLowerCase()}. Cung cấp kiến thức hữu ích cho người mới bắt đầu và chuyên gia.`,
        category_slug: categories[i % categories.length],
        published: statuses[i % statuses.length] === 'published',
        createdAt: d.toISOString(),
        publishedAt: statuses[i % statuses.length] === 'published' ? d.toISOString() : null,
        wpId: statuses[i % statuses.length] === 'published' ? 100 + i : null,
        wpUrl: statuses[i % statuses.length] === 'published' ? `https://thinksmart.vn/article-${i}` : '',
        images: i % 3 === 0 ? ['https://picsum.photos/800/400?random=' + i] : [],
        userId: i === 0 ? 'admin-001' : 'user-' + ((i % 5) + 1),
      });
    }
    QTP._fakeArticles = articles;
    return articles;
  },

  /** Generate fake stats */
  get stats() {
    const arts = this.articles;
    const total = arts.length;
    const published = arts.filter(a => a.published).length;
    const draft = total - published;
    return { totalArticles: total, published, draft, withImages: arts.filter(a => a.images?.length).length };
  },

  /** Generate fake templates */
  get templates() {
    if (QTP._fakeTemplates) return QTP._fakeTemplates;
    const t = [
      { id: 't1', name: 'Blog SEO Chuẩn', category: 'SEO', tone: 'Chuyên nghiệp', tags: ['seo', 'blog', 'wordpress'], variables: ['title', 'keywords', 'meta_desc'] },
      { id: 't2', name: 'Bài Viết Social Media', category: 'Marketing', tone: 'Thân thiện', tags: ['social', 'marketing', 'short'], variables: ['title', 'hashtags', 'cta'] },
      { id: 't3', name: 'Hướng Dẫn Từng Bước', category: 'Content', tone: 'Dễ hiểu', tags: ['tutorial', 'guide', 'howto'], variables: ['title', 'steps', 'tips'] },
      { id: 't4', name: 'Review Sản Phẩm', category: 'E-commerce', tone: 'Khách quan', tags: ['review', 'product', 'compare'], variables: ['product', 'pros', 'cons'] },
      { id: 't5', name: 'Tin Tức & Cập Nhật', category: 'News', tone: 'Trung lập', tags: ['news', 'update', 'breaking'], variables: ['headline', 'source', 'date'] },
      { id: 't6', name: 'Case Study Chi Tiết', category: 'Content', tone: 'Phân tích', tags: ['case-study', 'data', 'results'], variables: ['title', 'metrics', 'outcome'] },
    ];
    QTP._fakeTemplates = t;
    return t;
  },

  /** Generate fake templates summary */
  get templatesSummary() {
    const now = new Date();
    return [
      { id: 101, title: { rendered: 'Hướng dẫn SEO WordPress Toàn Diện 2026' }, date: new Date(now - 86400000).toISOString(), status: 'publish', link: 'https://thinksmart.vn/seo-wordpress-2026' },
      { id: 102, title: { rendered: 'Cách Viết Content Chuẩn Google AI' }, date: new Date(now - 172800000).toISOString(), status: 'publish', link: 'https://thinksmart.vn/content-google-ai' },
      { id: 103, title: { rendered: 'Top 10 Công Cụ AI Cho Content Marketing' }, date: new Date(now - 259200000).toISOString(), status: 'publish', link: 'https://thinksmart.vn/ai-content-tools' },
      { id: 104, title: { rendered: 'Bí Quyết Tăng Traffic Tự Nhiên' }, date: new Date(now - 345600000).toISOString(), status: 'draft', link: 'https://thinksmart.vn/tang-traffic' },
      { id: 105, title: { rendered: 'Xu Hướng Thiết Kế Web 2026' }, date: new Date(now - 432000000).toISOString(), status: 'publish', link: 'https://thinksmart.vn/thiet-ke-web-2026' },
      { id: 106, title: { rendered: 'Email Marketing Automation Cơ Bản' }, date: new Date(now - 518400000).toISOString(), status: 'publish', link: 'https://thinksmart.vn/email-automation' },
      { id: 107, title: { rendered: 'Phân Tích Đối Thủ Cạnh Tranh SEO' }, date: new Date(now - 604800000).toISOString(), status: 'draft', link: 'https://thinksmart.vn/phan-tich-doi-thu-seo' },
    ];
  },

  /** Generate fake users */
  get users() {
    const now = new Date();
    return [
      { id: 'admin-001', username: 'admin', fullName: 'Admin Chính', role: 'admin', status: 'active', createdAt: new Date(now - 86400000 * 365).toISOString() },
      { id: 'user-1', username: 'minhanh', fullName: 'Minh Anh Nguyễn', role: 'editor', status: 'active', createdAt: new Date(now - 86400000 * 180).toISOString() },
      { id: 'user-2', username: 'thanhha', fullName: 'Thanh Hà Trần', role: 'writer', status: 'active', createdAt: new Date(now - 86400000 * 90).toISOString() },
      { id: 'user-3', username: 'lanphuong', fullName: 'Lan Phương Lê', role: 'writer', status: 'active', createdAt: new Date(now - 86400000 * 45).toISOString() },
      { id: 'user-4', username: 'congson', fullName: 'Công Sơn Phạm', role: 'sale', status: 'inactive', createdAt: new Date(now - 86400000 * 30).toISOString() },
      { id: 'user-5', username: 'hongnhung', fullName: 'Hồng Nhung Vũ', role: 'sale', status: 'active', createdAt: new Date(now - 86400000 * 15).toISOString() },
    ];
  },

  /** Generate fake notes */
  get notes() {
    const now = new Date();
    return [
      { id: 'n1', title: 'Ý tưởng bài viết SEO tháng tới', content: 'Lên danh sách 10 keyword chính cần viết trong tháng 6. Ưu tiên các chủ đề về AI và Google SGE.', createdAt: new Date(now - 3600000).toISOString() },
      { id: 'n2', title: 'Lịch đăng bài tuần này', content: 'Thứ 2: Bài SEO WordPress\nThứ 4: Content về AI Tools\nThứ 6: Case Study Social Media', createdAt: new Date(now - 86400000).toISOString() },
      { id: 'n3', title: 'Ghi chú meeting khách hàng', content: 'Khách hàng muốn tập trung vào content dạng video ngắn. Cần nghiên cứu thêm về TikTok SEO.', createdAt: new Date(now - 172800000).toISOString() },
      { id: 'n4', title: 'Cập nhật Google Algorithm', content: 'Google vừa ra mắt bản update mới về nội dung AI. Cần review lại các bài viết cũ.', createdAt: new Date(now - 259200000).toISOString() },
      { id: 'n5', title: 'Kế hoạch quảng cáo tháng 7', content: 'Ngân sách: 5M VND cho Facebook Ads\nMục tiêu: 1000 leads\nKPI: CPA dưới 50K', createdAt: new Date(now - 345600000).toISOString() },
    ];
  },

  /** Generate fake media images */
  get media() {
    return this.articles.filter(a => a.images?.length).map(a => ({
      url: a.images[0],
      title: a.title,
    })).concat([
      { url: 'https://picsum.photos/800/400?random=100', title: 'Banner SEO 2026' },
      { url: 'https://picsum.photos/800/400?random=101', title: 'Infographic Content AI' },
      { url: 'https://picsum.photos/800/400?random=102', title: 'Social Media Template' },
      { url: 'https://picsum.photos/800/400?random=103', title: 'WordPress Theme Preview' },
    ]);
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
};

/* ===================================================================
   SECTION 4 — QTP.App (Navigation & Bootstrap)
   =================================================================== */

QTP.App = {
  /** Bootstrap on DOM ready — called once from DOMContentLoaded */
  init() {
    if (QTP._token && QTP._user) {
      this.showApp();
    } else {
      $id('landingPage').style.display = 'block';
      $id('appWrap').style.display = 'none';
    }
    // Bind sidebar nav items (these lack inline onclick in HTML)
    $qa('.nav-item').forEach((el) => {
      const sec = el.dataset.section;
      if (sec && !el.id.startsWith('nav-')) {
        el.onclick = () => QTP.App.go(sec);
      }
    });
    // Navigate to dashboard (loads stats if authenticated)
    if (QTP._token) this.go('dashboard');
  },

  /** Toggle mobile sidebar */
  toggleSidebar() {
    $id('sidebar').classList.toggle('open');
    $id('sideOvl').classList.toggle('open');
    // Prevent body scroll when sidebar open on mobile
    if (window.innerWidth <= 767) {
      document.body.style.overflow = $id('sidebar').classList.contains('open') ? 'hidden' : '';
    }
  },

  /** Navigate to a section by name (e.g. 'dashboard', 'articles') */
  go(section) {
    // 1. Hide all sections
    $qa('.sec').forEach((s) => s.classList.remove('active'));
    // 2. Deactivate all nav items
    $qa('.nav-item').forEach((n) => n.classList.remove('active'));
    // 3. Show target section
    const target = $id(`sec-${section}`);
    if (target) target.classList.add('active');
    // 4. Activate nav item
    const navItem = $q(`[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');
    // 5. Close sidebar on mobile
    if (window.innerWidth <= 767) {
      $id('sidebar').classList.remove('open');
      $id('sideOvl').classList.remove('open');
    }
    // 6. Lazy-load section data
    const loaders = {
      dashboard: 'loadDashboard',
      articles: 'Articles.load',
      templates: 'Templates.load',
      wp: 'WP.load',
      users: 'Users.load',
      analytics: 'Analytics.load',
      notes: 'Notes.load',
      media: 'Media.load',
      library: 'Library.load',
      schedule: 'Schedule.load',
      sites: 'Sites.load',
      settings: 'Settings.load',
    };
    const loader = loaders[section];
    if (!loader) return;
    const [ns, method] = loader.includes('.') ? loader.split('.') : ['App', loader];
    QTP[ns]?.[method]?.();
  },

  /** Show dashboard app (hide landing page) */
  showApp() {
    $id('landingPage').style.display = 'none';
    $id('appWrap').style.display = 'block';
    // Show mobile topbar if on small screen
    const mb = $id('mobileTopbar');
    if (mb) mb.style.display = window.innerWidth <= 767 ? 'flex' : 'none';
    this.setUserInfo();
    // Pre‑load AI Personas (Tính Cách AI) so dropdown is ready when user opens create form
    if (QTP._templates && !QTP._templates.length) {
      QTP.Templates.load().catch(() => {});
    }
  },

  /** Load WP categories into Danh Mục dropdown */
  /* Danh mục moved to Site management */

  /** Subscribe to SSE for real-time category updates */
  /* Category SSE moved to Site management */

  /** Update dropdown from SSE data (reuses loadCategories logic) */
  
  /** Populate sidebar user info */
  setUserInfo() {
    const u = QTP._user;
    if (!u) return;
    $id('userNm').textContent = u.fullName || u.username;
    $id('userAv').innerHTML = '<img src="img/default-avatar.jpg" class="avatar-img" alt="">';
    $id('roleT').textContent = u.role || 'user';
    const navUsers = $id('nav-users');
    if (navUsers) navUsers.style.display = (u.role === 'admin' || u.role === 'dev') ? 'flex' : 'none';
  },

  /** Load dashboard stats & recent articles */
  async loadDashboard() {
    // ══ Fake Data ══
    if (QTP._fakeMode) {
      const s = QTP._fake.stats;
      $id('sTotal').textContent = s.totalArticles;
      $id('sPub').textContent = s.published;
      $id('sDraft').textContent = s.draft;
      $id('sImg').textContent = s.withImages;

      const arts = QTP._fake.articles;
      QTP._articles = arts;
      const recent = arts.slice(0, 6);
      const container = $id('recentArts');
      container.innerHTML = recent
        .map(
          (a, i) => `
        <div class="dashboard-article-item" style="animation: fade-slide-up 400ms var(--ease-out) ${i * 80}ms both">
          <div class="item-left">
            <span class="item-icon">📄</span>
            <div class="item-content">
              <h3 class="item-title">${esc(a.title)}</h3>
              <div class="item-meta">
                <span>📅 ${fmtDate(a.createdAt)}</span>
                <span>📂 ${a.category_slug || 'Chung'}</span>
              </div>
            </div>
          </div>
          <div class="item-right">
            <span class="item-badge ${a.published ? 'status-published' : 'status-draft'}">${a.published ? 'Đã đăng' : 'Bản nháp'}</span>
            <button class="item-action-btn" onclick="event.stopPropagation();QTP.Articles.preview('${a.file}')" title="Xem bài viết">✎</button>
          </div>
        </div>`
        )
        .join('');
      return;
    }

    try {
      const res = await api('/stats');
      if (res.success && res.stats) {
        const s = res.stats;
        $id('sTotal').textContent = s.totalArticles ?? 0;
        $id('sPub').textContent = s.published ?? 0;
        $id('sDraft').textContent = s.draft ?? 0;
        $id('sImg').textContent = s.withImages ?? 0;
      }
    } catch {
      /* stats are best-effort */
    }

    try {
      const arts = await api('/articles');
      if (Array.isArray(arts)) {
        QTP._articles = arts;
        const recent = arts.slice(0, 6);
        const container = $id('recentArts');
        if (!recent.length) {
          container.innerHTML =
            '<div style="padding:40px;text-align:center;color:var(--color-muted);font-size:13px">Chưa có bài viết nào</div>';
          return;
        }
        container.innerHTML = recent
          .map(
            (a, i) => `
          <div class="dashboard-article-item" style="animation: fade-slide-up 400ms var(--ease-out) ${i * 80}ms both">
            <div class="item-left">
              <span class="item-icon">📄</span>
              <div class="item-content">
                <h3 class="item-title">${esc(a.title)}</h3>
                <div class="item-meta">
                  <span>📅 ${fmtDate(a.createdAt)}</span>
                  <span>📂 ${a.category_slug || 'Chung'}</span>
                </div>
              </div>
            </div>
            <div class="item-right">
              <span class="item-badge ${a.published ? 'status-published' : 'status-draft'}">${a.published ? 'Đã đăng' : 'Bản nháp'}</span>
              <button class="item-action-btn" onclick="event.stopPropagation();QTP.Articles.preview('${a.file}')" title="Xem bài viết">✎</button>
            </div>
          </div>`
          )
          .join('');
      }
    } catch {
      /* best-effort */
    }
  },

  /** Toggle fake/demo data mode (persisted in localStorage) */
  toggleFakeMode(on) {
    if (QTP._user?.role !== 'dev') {
      showToast('❌ Chỉ tài khoản Dev mới được bật dữ liệu mẫu', 'error');
      return;
    }
    QTP._fakeMode = !!on;
    localStorage.setItem('qtp_fake', QTP._fakeMode ? 'true' : 'false');
    this._syncFakeBtn();
    showToast(QTP._fakeMode ? '✅ Chế độ dữ liệu mẫu đã bật' : '✅ Chế độ dữ liệu thật đã bật');
  },

  /** Sync ON/OFF buttons to match _fakeMode */
  _syncFakeBtn() {
    const el = $id('fakeOnOff');
    if (el) el.className = 'fake-onoff ' + (QTP._fakeMode ? 'on' : 'off');
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.App

/* ===================================================================
   SECTION 5 — QTP.Auth (Login / Register / Logout)
   =================================================================== */

QTP.Auth = {
  showLogin() {
    $id('loginModal').classList.add('open');
    $id('logForm').style.display = 'block';
    $id('regForm').style.display = 'none';
  },
  hideLogin() {
    $id('loginModal').classList.remove('open');
  },
  showReg() {
    $id('logForm').style.display = 'none';
    $id('regForm').style.display = 'block';
    $id('regErr').style.display = 'none';
  },
  showLog() {
    $id('regForm').style.display = 'none';
    $id('logForm').style.display = 'block';
    $id('logErr').style.display = 'none';
  },

  async doLogin() {
    const username = $id('hUser').value.trim();
    const password = $id('hPass').value.trim();
    const errEl = $id('logErr');
    if (!username || !password) {
      errEl.textContent = 'Vui lòng nhập đầy đủ!';
      errEl.style.display = 'block';
      return;
    }
    const btn = $id('logBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng nhập…';

    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (res.success) {
        QTP._token = res.token;
        QTP._user = res.user;
        localStorage.setItem('qtp_token', res.token);
        localStorage.setItem('qtp_user', JSON.stringify(res.user));
        this.hideLogin();
        QTP.App.showApp();
        QTP.App.go('dashboard');
        showToast('Đăng nhập thành công!');
      } else {
        errEl.textContent = res.message || 'Sai tài khoản hoặc mật khẩu';
        errEl.style.display = 'block';
      }
    } catch {
      errEl.textContent = 'Lỗi kết nối server!';
      errEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-right:6px"></i> Sign In';
  },

  async doReg() {
    const name = $id('rName').value.trim();
    const username = $id('rUser').value.trim();
    const password = $id('rPass').value.trim();
    const errEl = $id('regErr');
    if (!username || !password) {
      errEl.textContent = 'Vui lòng nhập đầy đủ!';
      errEl.style.display = 'block';
      return;
    }
    if (password.length < 6) {
      errEl.textContent = 'Mật khẩu tối thiểu 6 ký tự';
      errEl.style.display = 'block';
      return;
    }
    const btn = $id('regForm').querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng ký…';

    try {
      const res = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          fullName: name || username,
        }),
      });
      if (res.success) {
        QTP._token = res.token;
        QTP._user = res.user;
        localStorage.setItem('qtp_token', res.token);
        localStorage.setItem('qtp_user', JSON.stringify(res.user));
        this.hideLogin();
        QTP.App.showApp();
        showToast('Đăng ký thành công!');
      } else {
        errEl.textContent = res.message || 'Đăng ký thất bại';
        errEl.style.display = 'block';
      }
    } catch {
      errEl.textContent = 'Lỗi kết nối server!';
      errEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus" style="margin-right:6px"></i> Sign Up';
  },

  logout() {
    showConfirm('Bạn có chắc muốn đăng xuất?', () => {
      QTP._token = null;
      QTP._user = null;
      localStorage.removeItem('qtp_token');
      localStorage.removeItem('qtp_user');
      $id('appWrap').style.display = 'none';
      $id('landingPage').style.display = 'block';
    });
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Auth

/* ===================================================================
   SECTION 6 — QTP.Articles (Create / List / Preview / Delete / Publish)
   =================================================================== */

QTP.Articles = {
  /** Smart image state */
  _imgEnabled: false,
  _imgCount: 2,

  setImgMode(mode) {
    QTP.Articles._imgEnabled = mode === 'on';
    $id('imgOn').classList.toggle('active', mode === 'on');
    $id('imgOff').classList.toggle('active', mode === 'off');
    $id('imgOptions').style.display = mode === 'on' ? 'block' : 'none';
    $id('imgCountLabel').textContent = mode === 'on' ? QTP.Articles._imgCount + ' ảnh' : '0 ảnh';
  },

  setImgCount(n) {
    QTP.Articles._imgCount = n;
    $qa('.img-cnt-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.n) === n));
    $id('imgCountLabel').textContent = n + ' ảnh';
  },

  /** Load all articles and render grid + pre‑load templates for create form */
  async load() {
    // Pre‑load templates if not already loaded (for the create-article dropdown)
    if (!QTP._templates.length) {
      QTP.Templates.load().catch(() => {});
    }

    // ══ Fake Data ══
    if (QTP._fakeMode) {
      const arts = QTP._fake.articles;
      QTP._articles = arts;
      const container = $id('artList');
      container.innerHTML = arts
        .map(
          (a) => `
        <div class="article-card">
          <div class="article-card-head">
            <span class="article-cat">${esc(a.category_slug ?? 'other')}</span>
            <span class="article-status ${a.published ? 'pub' : 'drf'}">${a.published ? 'Đã đăng' : 'Bản nháp'}</span>
          </div>
          <h3 class="article-title">${esc(a.title)}</h3>
          <p class="article-summary">${trunc(esc(a.summary ?? ''), 120)}</p>
          <div class="article-meta">
            <span><i class="far fa-calendar"></i> ${fmtDate(a.createdAt)}</span>
            ${a.images?.length ? `<span><i class="fas fa-image"></i> ${a.images.length} ảnh</span>` : ''}
            ${a.wpId ? '<span><i class="fas fa-globe"></i> WP</span>' : ''}
          </div>
          <div class="article-actions">
            <button onclick="QTP.Articles.preview('${a.file}')" class="btn btn-ghost btn-sm" title="Xem trước"><i class="fas fa-eye"></i> Xem</button>
            <button onclick="QTP.Articles.publish('${a.file}')" class="btn btn-sm" style="background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2)"><i class="fas fa-upload"></i> Đăng WP</button>
            <button onclick="QTP.Articles.del('${a.file}')" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)" title="Xóa"><i class="fas fa-trash"></i></button>
          </div>
        </div>`
        )
        .join('');
      return;
    }

    const container = $id('artList');
    container.innerHTML =
      '<div style="grid-column:1/-1" class="loading-state"><div class="spinner"></div><p>Đang tải danh sách bài viết…</p></div>';

    try {
      const arts = await api('/articles');
      if (!Array.isArray(arts)) throw new Error('Invalid response');
      QTP._articles = arts;

      if (!arts.length) {
        container.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--color-muted)">
            <i class="fas fa-newspaper" style="font-size:48px;opacity:0.3;margin-bottom:16px"></i>
            <h3 style="font-size:18px;margin-bottom:8px;color:var(--color-sub)">Chưa có bài viết</h3>
            <p style="font-size:13px">Tạo bài viết đầu tiên từ mục <strong>Tạo Bài</strong></p>
          </div>`;
        return;
      }

      container.innerHTML = arts
        .map(
          (a) => `
        <div class="article-card">
          <div class="article-card-head">
            <span class="article-cat">${esc(a.category_slug ?? 'other')}</span>
            <span class="article-status ${a.published ? 'pub' : 'drf'}">${a.published ? 'Đã đăng' : 'Bản nháp'}</span>
          </div>
          <h3 class="article-title">${esc(a.title)}</h3>
          <p class="article-summary">${trunc(esc(a.summary ?? ''), 120)}</p>
          <div class="article-meta">
            <span><i class="far fa-calendar"></i> ${fmtDate(a.createdAt)}</span>
            ${a.images?.length ? `<span><i class="fas fa-image"></i> ${a.images.length} ảnh</span>` : ''}
            ${a.wpId ? '<span><i class="fas fa-globe"></i> WP</span>' : ''}
          </div>
          <div class="article-actions">
            <button onclick="QTP.Articles.preview('${a.file}')" class="btn btn-ghost btn-sm" title="Xem trước"><i class="fas fa-eye"></i> Xem</button>
            <button onclick="QTP.Articles.publish('${a.file}')" class="btn btn-sm" style="background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2)"><i class="fas fa-upload"></i> Đăng WP</button>
            <button onclick="QTP.Articles.del('${a.file}')" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)" title="Xóa"><i class="fas fa-trash"></i></button>
          </div>
        </div>`
        )
        .join('');
    } catch (e) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-danger)">
          <i class="fas fa-exclamation-triangle" style="font-size:36px;margin-bottom:12px"></i>
          <p>${esc(e.message)}</p>
        </div>`;
    }
  },

  /** Create new article(s) via AI */
  async create() {
    const topic = $id('topic').value.trim();
    const qty = parseInt($id('qty').value) || 1;
    const instruction = $id('aiInstruction').value.trim();

    if (!topic) {
      showToast('Vui lòng nhập chủ đề!', 'error');
      return;
    }

    const btn = $id('crtBtn');
    const progress = $id('crtProg');
    const fill = $id('progFill');
    const text = $id('progTxt');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo…';
    progress.style.display = 'block';
    fill.style.width = '20%';
    text.textContent = `Đang tạo ${qty} bài viết…`;

    try {
      const res = await api('/create-article', {
        method: 'POST',
        body: JSON.stringify({
          topics: Array.from({ length: qty }, () => topic),
          category,
          smart_images: QTP.Articles._imgEnabled,
          image_count: QTP.Articles._imgCount,
          ai_instruction: instruction || undefined,
        }),
      });

      if (res.success) {
        fill.style.width = '100%';
        const ok = (res.results ?? []).filter((r) => r.success).length;
        text.textContent = `✅ Đã tạo ${ok}/${qty} bài viết!`;
        showToast(`Hoàn thành ${ok}/${qty} bài viết!`);

        setTimeout(() => {
          progress.style.display = 'none';
          fill.style.width = '0%';
          $id('topic').value = '';
          QTP.App.go('articles');
        }, 1200);
      } else {
        showToast(res.message || 'Lỗi tạo bài viết', 'error');
        progress.style.display = 'none';
      }
    } catch {
      showToast('Lỗi kết nối server!', 'error');
      progress.style.display = 'none';
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket" style="margin-right:6px"></i>Tạo Bài Viết';
  },

  /** Preview article content in modal */
  async preview(filename) {
    try {
      const arts = await api('/articles');
      const a = Array.isArray(arts) ? arts.find((x) => x.file === filename) : null;
      if (!a) {
        showToast('Không tìm thấy bài viết', 'error');
        return;
      }
      $id('previewModalTitle').textContent = a.title || 'Xem trước';
      $id('previewModalBody').innerHTML = a.content || '<p>Không có nội dung</p>';
      $id('previewModal').classList.add('open');
    } catch {
      showToast('Lỗi tải bài viết', 'error');
    }
  },

  closePreview() {
    $id('previewModal').classList.remove('open');
  },

  /** Publish single article to WordPress */
  publish(filename) {
    showConfirm('Đăng bài viết này lên WordPress?', async () => {
      showToast('Đang đăng…', 'loading');
      try {
        // Get default category from active site
        let defaultCategory = '';
        try {
          const sitesRes = await api('/sites');
          const activeSite = (sitesRes.sites || []).find(s => s.isActive && s.defaultCategory);
          if (activeSite) defaultCategory = activeSite.defaultCategory;
        } catch {}
        const res = await api('/post-all', {
          method: 'POST',
          body: JSON.stringify({ files: [filename], defaultCategory }),
        });
        if (res.success) {
          showToast('✅ Đã đăng lên WordPress!');
          this.load();
        } else {
          showToast('Lỗi: ' + (res.message || ''), 'error');
        }
      } catch {
        showToast('Lỗi kết nối!', 'error');
      }
    });
  },

  /** Delete article */
  del(filename) {
    showConfirm('Xóa bài viết này?', async () => {
      try {
        await api(`/articles/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        showToast('Đã xóa bài viết!');
        this.load();
      } catch {
        showToast('Lỗi xóa!', 'error');
      }
    });
  },

  /** Open AI suggest topics modal */
  async suggestTopics() {
    const modal = $id('sugMod');
    const container = $id('sugRes');
    modal.classList.add('open');
    container.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>AI đang gợi ý chủ đề…</p></div>';

    try {
      const res = await api('/suggest-topics', {
        method: 'POST',
        body: JSON.stringify({ category: '' }),
      });

      if (res.success && Array.isArray(res.suggestions)) {
        container.innerHTML = res.suggestions
          .map(
            (s) => `
          <div class="suggest-item" onclick="QTP.Articles.pickTopic('${esc(s.topic)}')">
            <div class="suggest-topic">${esc(s.topic)}</div>
            <div class="suggest-reason">${esc(s.reason ?? '')}</div>
            <div class="suggest-tags">
              <span class="suggest-tag">${esc(s.type ?? '')}</span>
              <span class="suggest-score">Độ phù hợp: ${s.score ?? '?'}/10</span>
            </div>
          </div>`
          )
          .join('');
      } else {
        container.innerHTML =
          '<div style="text-align:center;padding:24px;color:var(--color-muted)">Không có gợi ý nào</div>';
      }
    } catch {
      container.innerHTML =
        '<div style="text-align:center;padding:24px;color:var(--color-danger)">Lỗi kết nối AI</div>';
    }
  },

  closeSuggest() {
    $id('sugMod').classList.remove('open');
  },

  /** Pick a suggested topic into the input field */
  pickTopic(topic) {
    $id('topic').value = topic;
    this.closeSuggest();
  },

  /** 🎲 Random topics: generate N topics + auto-fill + auto-generate articles */
  async randomTopic() {
    const qty = parseInt($id('qty').value) || 1;
    const tmpl = $id('tmplSelect').value;
    const instruction = $id('aiInstruction').value.trim();

    if (!tmpl) {
      showToast('Vui lòng chọn Tính Cách AI trước!', 'error');
      return;
    }

    $id('topic').value = '';
    const btn = $id('crtBtn');
    const progress = $id('crtProg');
    const fill = $id('progFill');
    const text = $id('progTxt');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-dice"></i> Đang gợi ý topic…';
    progress.style.display = 'block';
    fill.style.width = '20%';
    text.textContent = `🎲 Đang gợi ý ${qty} chủ đề ngẫu nhiên…`;

    try {
      // Step 1: Get random topics from AI
      const sugRes = await api('/suggest-topics', {
        method: 'POST',
        body: JSON.stringify({
          category: cat,
          count: qty,
          template_id: tmpl,
          auto_fill: true,
          ai_instruction: instruction || undefined,
        }),
      });

      if (!sugRes.success || !Array.isArray(sugRes.suggestions) || sugRes.suggestions.length === 0) {
        throw new Error('AI không gợi ý được chủ đề nào');
      }

      // Pick topics from suggestions
      const topics = sugRes.suggestions.map(s => s.topic);
      fill.style.width = '50%';
      text.textContent = `✅ Đã gợi ý ${topics.length} chủ đề. Đang tạo bài viết…`;

      // Step 2: Automatically generate articles with these topics
      const res = await api('/create-article', {
        method: 'POST',
        body: JSON.stringify({
          topics,
          category: cat,
          template_id: tmpl,
          smart_images: QTP.Articles._imgEnabled,
          image_count: QTP.Articles._imgCount,
          ai_instruction: instruction || undefined,
        }),
      });

      if (res.success) {
        fill.style.width = '100%';
        const ok = (res.results ?? []).filter((r) => r.success).length;
        text.textContent = `✅ Đã tạo xong ${ok}/${topics.length} bài viết!`;
        showToast(`Hoàn thành ${ok}/${topics.length} bài viết!`);

        setTimeout(() => {
          progress.style.display = 'none';
          fill.style.width = '0%';
          QTP.App.go('articles');
        }, 1200);
      } else {
        showToast(res.message || 'Lỗi tạo bài viết', 'error');
        progress.style.display = 'none';
      }
    } catch (e) {
      showToast(e.message || 'Lỗi kết nối server!', 'error');
      progress.style.display = 'none';
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic"></i> Tạo Bài Viết';
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Articles

/* ===================================================================
   SECTION 7 — QTP.Templates (CRUD + AI Suggest + Search)
   =================================================================== */

QTP.Templates = {
  _editingId: null,
  _aiSuggestion: null,

  /** Fetch all templates and render */
  async load() {
    // ══ Fake Data ══
    if (QTP._fakeMode) {
      QTP._templates = QTP._fake.templates;
      this.render(QTP._fake.templates);
      return;
    }

    const container = $id('tmplList');
    container.innerHTML =
      '<div style="grid-column:1/-1" class="loading-state"><div class="spinner"></div><p>Đang tải templates…</p></div>';

    try {
      const res = await api('/templates');
      if (res.success && Array.isArray(res.templates)) {
        QTP._templates = res.templates;
        this.render(res.templates);
      }
    } catch {
      container.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-muted)">Lỗi tải templates</div>';
    }
  },

  /** Render template cards into grid + populate select dropdown */
  render(templates) {
    const container = $id('tmplList');

    if (!templates.length) {
      container.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-layer-group" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Chưa có template nào</div>';
      return;
    }

    // Update the select dropdown on the Create page
    const sel = $id('tmplSelect');
    sel.innerHTML =
      '<option value="">— Chọn tính cách —</option>' +
      templates
        .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
        .join('');

    container.innerHTML = templates
      .map(
        (t) => `
      <div class="article-card">
        <div class="article-card-head">
          <span class="article-cat">${esc(t.category || 'Blog')}</span>
          <span style="font-size:11px;color:var(--color-muted)">${(t.tags ?? []).slice(0, 2).join(', ')}</span>
        </div>
        <h3 class="article-title">${esc(t.name)}</h3>
        <p class="article-summary">Tone: ${esc(t.tone || 'Chuyên nghiệp')} · ${(t.variables ?? []).length} biến</p>
        <div class="article-actions">
          <button onclick="QTP.Templates.edit('${t.id}')" class="btn btn-ghost btn-sm"><i class="fas fa-edit"></i></button>
          <button onclick="QTP.Templates.duplicate('${t.id}')" class="btn btn-ghost btn-sm"><i class="fas fa-copy"></i></button>
          <button onclick="QTP.Templates.del('${t.id}')" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)"><i class="fas fa-trash"></i></button>
        </div>
      </div>`
      )
      .join('');
  },

  /** Filter templates by search query */
  search() {
    const q = $id('tmplSearch').value.toLowerCase();
    const filtered = QTP._templates.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
    this.render(filtered);
  },

  /** Apply selected template to the Create form */
  applyTmpl() {
    const id = $id('tmplSelect').value;
    const info = $id('tmplInfo');
    const tmpl = QTP._templates.find((t) => t.id === id);
    if (!tmpl) {
      info.style.display = 'none';
      return;
    }
    $id('tmplInfoName').textContent = tmpl.name;
    $id('tmplInfoDetail').textContent = `${tmpl.tone || ''} · ${(tmpl.variables ?? []).length} biến`;
    info.style.display = 'block';

    const varsDiv = $id('tmplVarsInput');
    if (tmpl.variables?.length) {
      varsDiv.style.display = 'block';
      varsDiv.innerHTML = tmpl.variables
        .map(
          (v) => `
        <div style="margin-bottom:8px">
          <label style="font-size:12px;color:var(--color-sub);display:block;margin-bottom:4px">${esc(v)}</label>
          <input class="inp tmpl-var" data-var="${v}" placeholder="${esc(v)}">
        </div>`
        )
        .join('');
    } else {
      varsDiv.style.display = 'none';
    }
  },

  clearTmpl() {
    $id('tmplSelect').value = '';
    $id('tmplInfo').style.display = 'none';
  },

  /** Open the template form modal (create mode) */
  showForm() {
    this._editingId = null;
    this._resetForm('Tạo Template Mới');
    $id('tmplModal').classList.add('open');
  },

  closeForm() {
    $id('tmplModal').classList.remove('open');
  },

  /** Open edit mode for an existing template */
  edit(id) {
    const t = QTP._templates.find((x) => x.id === id);
    if (!t) return;
    this._editingId = id;
    $id('tfName').value = t.name || '';
    $id('tfTags').value = (t.tags || []).join(', ');
    $id('tfTone').value = t.tone || '';
    $id('tfPrompt').value = t.prompt_template || '';
    $id('tfId').value = id;
    $id('tmplFormTitle').textContent = 'Sửa Template';
    $id('tmplSaveBtn').innerHTML = '<i class="fas fa-save"></i> Update';
    $id('tmplModal').classList.add('open');
  },

  /** Save template (create or update) */
  async save() {
    const name = $id('tfName').value.trim();
    const prompt = $id('tfPrompt').value.trim();
    if (!name || !prompt) {
      showToast('Name và Prompt là bắt buộc', 'error');
      return;
    }
    const tags = $id('tfTags')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const tone = $id('tfTone').value.trim() || 'Chuyên nghiệp';

    try {
      if (this._editingId) {
        await api(`/templates/${this._editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ name, tags, tone, prompt_template: prompt }),
        });
        showToast('Đã cập nhật template!');
      } else {
        await api('/templates', {
          method: 'POST',
          body: JSON.stringify({ name, tags, tone, prompt_template: prompt }),
        });
        showToast('Đã tạo template!');
      }
      this.closeForm();
      this.load();
    } catch {
      showToast('Lỗi lưu template!', 'error');
    }
  },

  duplicate(id) {
    showConfirm('Nhân bản template này?', async () => {
      try {
        await api(`/templates/duplicate/${id}`, { method: 'POST' });
        showToast('Đã nhân bản!');
        this.load();
      } catch {
        showToast('Lỗi nhân bản!', 'error');
      }
    });
  },

  del(id) {
    showConfirm('Xóa template này?', async () => {
      try {
        await api(`/templates/${id}`, { method: 'DELETE' });
        showToast('Đã xóa!');
        this.load();
      } catch {
        showToast('Lỗi xóa!', 'error');
      }
    });
  },

  /** AI Suggest: open modal */
  suggestByAI() {
    $id('aiSuggestDesc').value = '';
    $id('aiSuggestRes').style.display = 'none';
    $id('aiSuggestBtn').disabled = false;
    $id('aiSuggestBtn').innerHTML = '<i class="fas fa-wand-magic-sparkles" style="margin-right:6px"></i>Gợi ý';
    $id('aiSuggestModal').classList.add('open');
  },

  closeAISuggest() {
    $id('aiSuggestModal').classList.remove('open');
  },

  /** Generate AI suggestion for a template */
  async doAISuggest() {
    const desc = $id('aiSuggestDesc').value.trim();
    if (!desc) {
      showToast('Vui lòng mô tả nội dung!', 'error');
      return;
    }
    const btn = $id('aiSuggestBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gợi ý…';

    try {
      const res = await api('/templates/suggest', {
        method: 'POST',
        body: JSON.stringify({ description: desc }),
      });

      if (res.success && res.suggestion) {
        const s = res.suggestion;
        $id('aiSuggestName').textContent = s.name || 'Template';
        $id('aiSuggestMeta').textContent = `Tone: ${s.tone || 'N/A'} · ${(s.variables || []).length} biến`;
        $id('aiSuggestPrompt').textContent = s.prompt_template || '';
        $id('aiSuggestRes').style.display = 'block';
        this._aiSuggestion = s;
      } else {
        showToast('AI không thể tạo gợi ý', 'error');
      }
    } catch {
      showToast('Lỗi kết nối AI!', 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-wand-magic-sparkles" style="margin-right:6px"></i>Gợi ý';
  },

  /** Apply AI-generated suggestion to the template form */
  applyAISuggest() {
    const s = this._aiSuggestion;
    if (!s) return;
    this._editingId = null;
    $id('tfName').value = s.name || '';
    $id('tfTags').value = (s.tags || []).join(', ');
    $id('tfTone').value = s.tone || 'Chuyên nghiệp';
    $id('tfPrompt').value = s.prompt_template || '';
    $id('tmplFormTitle').textContent = 'Tạo từ AI Suggest';
    $id('tmplSaveBtn').innerHTML = '<i class="fas fa-save"></i> Save';
    this.closeAISuggest();
    $id('tmplModal').classList.add('open');
  },

  /* ── internal ── */

  _resetForm(title) {
    $id('tfName').value = '';
    $id('tfTags').value = '';
    $id('tfTone').value = '';
    $id('tfPrompt').value = '';
    $id('tfId').value = '';
    $id('tmplFormTitle').textContent = title;
    $id('tmplSaveBtn').innerHTML = '<i class="fas fa-save"></i> Save';
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Templates

/* ===================================================================
   SECTION 8 — QTP.WP (WordPress Posts Management)
   =================================================================== */

QTP.WP = {
  async load() {
    // Always fetch real WP posts — no fake mode for this section
    const cont = $id('wpCont');
    cont.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Đang tải từ WordPress…</p></div>';

    // Show connection info
    this.showStatus();

    try {
      const posts = await api('/wp-posts');
      if (!Array.isArray(posts)) throw new Error();

      if (!posts.length) {
        cont.innerHTML =
          '<div style="text-align:center;padding:40px;color:var(--color-muted)"><i class="fas fa-globe" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Chưa có bài viết trên WordPress</div>';
        return;
      }

      cont.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:12px;color:var(--color-muted);margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;justify-content:space-between">
            <span>Tổng số: <strong style="color:var(--text)">${posts.length}</strong> bài viết</span>
            <span class="wp-sync-info"><i class="fas fa-check-circle" style="color:#22c55e;font-size:10px"></i> Đã đồng bộ</span>
          </div>
          ${posts
            .map(
              (p) => `
            <div class="report-card">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:14px">${esc(p.title?.rendered || 'Untitled')}</div>
                  <div style="font-size:11px;color:var(--color-muted);margin-top:2px">
                    <i class="far fa-calendar-alt" style="margin-right:3px"></i>${fmtDate(p.date)}
                    ${p.status ? `<span style="margin-left:8px;padding:1px 6px;border-radius:4px;font-size:10px;background:${p.status === 'publish' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'};color:${p.status === 'publish' ? '#22c55e' : '#f59e0b'}">${p.status === 'publish' ? 'Đã xuất bản' : 'Nháp'}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0">
                  <a href="${p.link || '#'}" target="_blank" class="btn btn-ghost btn-sm" title="Xem bài viết"><i class="fas fa-external-link-alt"></i></a>
                  <button onclick="QTP.WP.edit(${p.id})" class="btn btn-ghost btn-sm" title="Chỉnh sửa bài viết"><i class="fas fa-pen"></i></button>
                  <button onclick="QTP.WP.del(${p.id})" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)" title="Xóa khỏi WP"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            </div>`
            )
            .join('')}
        </div>`;
    } catch {
      cont.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--color-danger)"><i class="fas fa-exclamation-triangle" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Lỗi tải bài viết WordPress<br><span style="font-size:13px;color:var(--color-muted)">Kiểm tra kết nối hoặc URL WordPress trong Cài Đặt</span></div>';
    }
  },

  async testConn() {
    const btn = $id('wpTestBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0 auto"></div>';

    try {
      const res = await api('/wp-posts?per_page=1');
      if (Array.isArray(res)) {
        this.showStatus(true, `✅ Kết nối thành công! WordPress có bài viết.`);
      } else {
        this.showStatus(false, '❌ Kết nối thất bại. Kiểm tra URL và mật khẩu ứng dụng WP trong Cài Đặt.');
      }
    } catch {
      this.showStatus(false, '❌ Không thể kết nối WordPress. Kiểm tra cấu hình trong Cài Đặt.');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plug"></i> Kiểm tra';
  },

  showStatus(connected, msg) {
    const st = $id('wpStatus');
    const wpUrl = localStorage.getItem('qtp_wp_url') || 'https://thinksmart.vn';

    if (connected === undefined) {
      // Just show config info
      st.style.display = 'block';
      st.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:8px;background:rgba(237,105,24,0.1);display:flex;align-items:center;justify-content:center;color:var(--color-accent)">
              <i class="fas fa-globe"></i>
            </div>
            <div>
              <div style="font-weight:600;font-size:13px">WordPress</div>
              <div style="font-size:12px;color:var(--color-muted)">${esc(wpUrl)}</div>
            </div>
          </div>
          <div style="font-size:11px;padding:3px 10px;border-radius:20px;background:rgba(245,158,11,0.1);color:#f59e0b">
            <i class="fas fa-circle" style="font-size:6px;margin-right:4px"></i> Chưa kiểm tra
          </div>
        </div>`;
      return;
    }

    st.style.display = 'block';
    st.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:${connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};display:flex;align-items:center;justify-content:center;color:${connected ? '#22c55e' : '#ef4444'}">
            <i class="fas ${connected ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
          </div>
          <div>
            <div style="font-weight:600;font-size:13px">${esc(wpUrl)}</div>
            <div style="font-size:12px;color:var(--color-muted)">${esc(msg || '')}</div>
          </div>
        </div>
        <div style="font-size:11px;padding:3px 10px;border-radius:20px;background:${connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};color:${connected ? '#22c55e' : '#ef4444'};white-space:nowrap">
          <i class="fas fa-circle" style="font-size:6px;margin-right:4px"></i> ${connected ? 'Đã kết nối' : 'Lỗi kết nối'}
        </div>
      </div>`;
  },

  reset() {
    showConfirm('⚠️ Reset kết nối WordPress?\n\nĐiều này sẽ xoá URL & mật khẩu WP đã lưu.\nKhông ảnh hưởng bài viết trên WordPress.', async () => {
      try {
        const settings = JSON.parse(localStorage.getItem('qtp_settings') || '{}');
        delete settings.wpUrl;
        delete settings.wpPass;
        localStorage.setItem('qtp_settings', JSON.stringify(settings));
        // Also clear cached WP credentials
        localStorage.removeItem('qtp_wp_url');
        localStorage.removeItem('qtp_wp_pass');
        showToast('✅ Đã reset kết nối WordPress!');
        const st = $id('wpStatus');
        st.style.display = 'none';
        $id('wpCont').innerHTML =
          '<div style="text-align:center;padding:40px;color:var(--color-muted)"><i class="fas fa-plug" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Đã reset. Vui lòng cấu hình lại WP trong <a href="#" onclick="QTP.App.go(\\\'settings\\\')" style="color:var(--color-accent)">Cài Đặt</a>.</div>';
      } catch {
        showToast('❌ Lỗi khi reset!', 'error');
      }
    });
  },

  _editingId: null, // current WP post being edited

  edit(postId) {
    this._editingId = postId;
    const modal = $id('wpEditModal');
    const titleEl = $id('wpEditTitle');
    const contentEl = $id('wpEditContent');
    const btn = $id('wpEditSaveBtn');

    titleEl.value = 'Đang tải…';
    contentEl.value = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải…';
    modal.classList.add('open');
    this.hideImagePicker();

    // Fetch full post data
    api(`/wp-posts?include=${postId}`)
      .then(posts => {
        const post = Array.isArray(posts) ? posts.find(p => p.id === postId) : null;
        if (!post) throw new Error('Không tìm thấy bài viết');
        titleEl.value = post.title?.rendered || '';
        contentEl.value = post.content?.raw || post.content?.rendered || '';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Lưu thay đổi';
      })
      .catch(() => {
        showToast('❌ Không thể tải bài viết!', 'error');
        this.closeEdit();
      });
  },

  closeEdit() {
    $id('wpEditModal').classList.remove('open');
    this._editingId = null;
    this.hideImagePicker();
  },

  _saveEdit() {
    const id = this._editingId;
    const title = $id('wpEditTitle').value.trim();
    const content = $id('wpEditContent').value.trim();
    const btn = $id('wpEditSaveBtn');

    if (!title) { showToast('Vui lòng nhập tiêu đề!', 'error'); return; }
    if (!content) { showToast('Vui lòng nhập nội dung!', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu…';

    api(`/wp-posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, content }),
    })
      .then(r => {
        if (r.success) {
          showToast('✅ Đã cập nhật bài viết!');
          this.closeEdit();
          this.load();
        } else {
          showToast('❌ Lỗi lưu!', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-save"></i> Lưu thay đổi';
        }
      })
      .catch(() => {
        showToast('❌ Lỗi kết nối!', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Lưu thay đổi';
      });
  },

  showImagePicker() {
    const picker = $id('wpImagePicker');
    const grid = $id('wpImgGrid');
    if (picker.style.display === 'block') { this.hideImagePicker(); return; }

    picker.style.display = 'block';
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--color-muted);font-size:12px"><i class="fas fa-spinner fa-spin"></i> Đang tải thư viện…</div>';

    // Fetch from library API
    api('/library/images?limit=50')
      .then(res => {
        const images = res.success ? (res.images || []) : [];
        if (!images.length) {
          grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--color-muted);font-size:12px;padding:16px">Thư viện trống. Upload ảnh trước.</div>';
          return;
        }
        grid.innerHTML = images.map(img => {
          const name = img.alt || img.originalName || 'unknown';
          const thumbUrl = esc(img.thumb || img.url);
          const fullUrl = thumbUrl.startsWith('/') ? window.location.origin + thumbUrl : thumbUrl;
          // Proper JS string escaping for onclick
          const jsUrl = JSON.stringify(img.url || '');
          const jsAlt = JSON.stringify(name);
          return `
          <div onclick="QTP.WP._insertImage(${jsUrl}, ${jsAlt})" style="cursor:pointer;border-radius:6px;overflow:hidden;border:2px solid transparent;aspect-ratio:1;background:var(--color-card-2);transition:border-color 0.15s;position:relative" onmouseover="this.style.borderColor='#6366f1'" onmouseout="this.style.borderColor='transparent'">
            <img src="${fullUrl}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;text-align:center;font-size:10px;color:var(--color-muted);padding:4px;word-break:break-all;overflow:hidden">${esc(name)}</div>
          </div>
        `}).join('');
      })
      .catch(() => {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--color-danger);font-size:12px">Lỗi tải thư viện</div>';
      });
  },

  hideImagePicker() {
    $id('wpImagePicker').style.display = 'none';
  },

  _insertImage(url, alt) {
    const ta = $id('wpEditContent');
    // Convert relative paths to absolute using the app's domain
    const absUrl = url.startsWith('/') ? window.location.origin + url : url;
    const imgTag = `<figure><img src="${absUrl}" alt="${alt || ''}" style="max-width:100%;height:auto;border-radius:8px"><figcaption style="text-align:center;font-size:13px;color:var(--color-muted);margin-top:6px">${alt || ''}</figcaption></figure>\n`;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + imgTag + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + imgTag.length;
    ta.focus();
  },

  _insertTag(openTag, closeTag) {
    const ta = $id('wpEditContent');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    ta.value = ta.value.substring(0, start) + openTag + selected + closeTag + ta.value.substring(end);
    ta.selectionStart = start;
    ta.selectionEnd = start + openTag.length + selected.length + closeTag.length;
    ta.focus();
  },

  del(postId) {
    showConfirm('Xóa bài viết khỏi WordPress?', async () => {
      try {
        await api(`/wp-posts/${postId}`, { method: 'DELETE' });
        showToast('✅ Đã xóa!');
        this.load();
      } catch {
        showToast('❌ Lỗi!', 'error');
      }
    });
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.WP

/* ===================================================================
   SECTION 11 — QTP.Users (Admin User Management)
   =================================================================== */

QTP.Users = {
  _editingId: null,
  _users: [],

  async load() {
    // ══ Fake Data ══
    if (QTP._fakeMode) {
      const users = QTP._fake.users;
      this._users = users;
      $id('usersSubtitle').textContent = `${users.length} users`;
      $id('usersCont').innerHTML = `
        <table class="admin-table">
          <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td data-label="User"><strong>${esc(u.fullName || u.username)}</strong></td>
                <td data-label="Username">${esc(u.username)}</td>
                <td data-label="Role"><span class="article-status ${u.role === 'admin' || u.role === 'dev' ? 'pub' : 'draft'}">${u.role}</span></td>
                <td data-label="Status"><span style="color:${u.status === 'active' ? '#22c55e' : '#ef4444'};font-size:12px">${u.status || 'active'}</span></td>
                <td data-label="Created" style="font-size:12px;color:var(--color-muted)">${fmtDate(u.createdAt)}</td>
                <td>
                  <button onclick="QTP.Users.toggleStatus('${u.id}')" class="btn btn-ghost btn-sm" title="Đổi trạng thái"><i class="fas ${u.status === 'active' ? 'fa-pause' : 'fa-play'}"></i></button>
                  <button onclick="QTP.Users.edit('${u.id}')" class="btn btn-ghost btn-sm"><i class="fas fa-edit"></i></button>
                  <button onclick="QTP.Users.del('${u.id}')" class="btn btn-ghost btn-sm" style="color:var(--color-danger)"><i class="fas fa-trash"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      return;
    }

    const cont = $id('usersCont');
    cont.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Đang tải danh sách user…</p></div>';

    try {
      const res = await api('/admin/users');
      if (!res.success || !Array.isArray(res.users)) throw new Error();

      this._users = res.users;
      $id('usersSubtitle').textContent = `${res.users.length} users`;

      cont.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${res.users
              .map(
                (u) => `
              <tr>
                <td data-label="User"><strong>${esc(u.fullName || u.username)}</strong></td>
                <td data-label="Username">${esc(u.username)}</td>
                <td data-label="Role"><span class="article-status ${u.role === 'admin' || u.role === 'dev' ? 'pub' : 'draft'}">${u.role}</span></td>
                <td data-label="Status"><span style="color:${u.status === 'active' ? '#22c55e' : '#ef4444'};font-size:12px">${u.status || 'active'}</span></td>
                <td data-label="Created" style="font-size:12px;color:var(--color-muted)">${fmtDate(u.createdAt)}</td>
                <td>
                  <button onclick="QTP.Users.toggleStatus('${u.id}')" class="btn btn-ghost btn-sm" title="Đổi trạng thái"><i class="fas ${u.status === 'active' ? 'fa-pause' : 'fa-play'}"></i></button>
                  <button onclick="QTP.Users.edit('${u.id}')" class="btn btn-ghost btn-sm"><i class="fas fa-edit"></i></button>
                  <button onclick="QTP.Users.del('${u.id}')" class="btn btn-ghost btn-sm" style="color:var(--color-danger)"><i class="fas fa-trash"></i></button>
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
    } catch {
      cont.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--color-danger)">Lỗi tải danh sách user</div>';
    }
  },

  showForm() {
    this._editingId = null;
    $id('ufTitle').textContent = 'Thêm User';
    $id('ufName').value = '';
    $id('ufUser').value = '';
    $id('ufPass').value = '';
    $id('ufRole').value = 'sale';
    $id('ufErr').style.display = 'none';
    $id('ufSaveBtn').innerHTML = '<i class="fas fa-save"></i> Save';
    $id('ufModal').classList.add('open');
  },

  closeForm() {
    $id('ufModal').classList.remove('open');
  },

  edit(id) {
    const u = this._users.find((x) => x.id === id);
    if (!u) return;
    this._editingId = id;
    $id('ufTitle').textContent = 'Sửa User';
    $id('ufName').value = u.fullName || '';
    $id('ufUser').value = u.username;
    $id('ufPass').value = '';
    $id('ufRole').value = u.role || 'sale';
    $id('ufErr').style.display = 'none';
    $id('ufSaveBtn').innerHTML = '<i class="fas fa-save"></i> Update';
    $id('ufModal').classList.add('open');
  },

  async save() {
    const name = $id('ufName').value.trim();
    const username = $id('ufUser').value.trim();
    const password = $id('ufPass').value;
    const role = $id('ufRole').value;
    const errEl = $id('ufErr');
    if (!username) {
      errEl.textContent = 'Username bắt buộc';
      errEl.style.display = 'block';
      return;
    }

    try {
      if (this._editingId) {
        const body = { fullName: name || username, role };
        if (password) body.password = password;
        await api(`/admin/users/${this._editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        showToast('Đã cập nhật!');
      } else {
        if (!password) {
          errEl.textContent = 'Password bắt buộc khi tạo mới';
          errEl.style.display = 'block';
          return;
        }
        await api('/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            fullName: name || username,
            role,
          }),
        });
        showToast('Đã tạo user!');
      }
      this.closeForm();
      this.load();
    } catch {
      showToast('Lỗi lưu!', 'error');
    }
  },

  async toggleStatus(id) {
    try {
      await api(`/admin/users/${id}/status`, { method: 'PATCH' });
      showToast('Đã đổi trạng thái!');
      this.load();
    } catch {
      showToast('Lỗi!', 'error');
    }
  },

  del(id) {
    showConfirm('Xóa user này?', async () => {
      try {
        await api(`/admin/users/${id}`, { method: 'DELETE' });
        showToast('Đã xóa!');
        this.load();
      } catch {
        showToast('Lỗi xóa!', 'error');
      }
    });
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Users

/* ===================================================================
   SECTION 12 — QTP.Settings (API Keys Configuration)
   =================================================================== */

QTP.Settings = {
  load() {
    const keys = JSON.parse(localStorage.getItem('qtp_settings') || '{}');
    $id('sDK').value = keys.gemini || '';

    // Load WP config from server API
    api('/settings/wp')
      .then(r => {
        if (r.success) {
          $id('sWpUrl').value = r.wpUrl || 'https://thinksmart.vn';
          $id('sWpPass').value = r.wpPass || '';
        }
      })
      .catch(() => {
        // Fallback to localStorage
        $id('sWpUrl').value = keys.wpUrl || 'https://thinksmart.vn';
        $id('sWpPass').value = keys.wpPass || '';
      });

    // Sync fake data toggle - chỉ dev mới thấy
    const card = $id('fakeToggleCard');
    if (card) card.style.display = QTP._user?.role === 'dev' ? '' : 'none';
    QTP.App._syncFakeBtn();
  },

  async save() {
    const gemini = $id('sDK').value.trim();
    const wpUrl = $id('sWpUrl').value.trim();
    const wpPass = $id('sWpPass').value.trim();

    // Save Gemini key to localStorage (frontend only)\n    localStorage.setItem('qtp_settings', JSON.stringify({ gemini }));

    // Save WP config to server
    try {
      const r = await api('/settings/wp', {
        method: 'POST',
        body: JSON.stringify({ wpUrl, wpPass }),
      });
      if (r.success) {
        showToast('✅ Đã lưu cấu hình WordPress!');
      } else {
        showToast('❌ ' + (r.message || 'Lỗi lưu'), 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối server!', 'error');
    }
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Settings

/* ===================================================================
   SECTION 13 — QTP.Analytics (Smart Analytics Dashboard)
   =================================================================== */

QTP.Analytics = {
  _data: {},

  async load() {
    // ══ Fake Data Toggle ══
    if (QTP._fakeMode) {
      const period = parseInt($id('analyticsPeriod').value) || 30;
      this._loadFakeData(period);
      this.showTab('performance');
      return;
    }

    const period = parseInt($id('analyticsPeriod').value) || 30;

    try {
      const perf = await api(`/analytics/performance?period=${period}`);
      if (perf.success) {
        const k = perf.kpis;
        $id('anTotalViews').textContent = (k.anTotalViews || 0).toLocaleString();
        $id('anTotalViews').style.color = '#ed6918';
        $id('anTotalVisitors').textContent = (k.anTotalVisitors || 0).toLocaleString();
        $id('anTotalVisitors').style.color = '#3b82f6';
        $id('anEngagement').textContent = (k.anEngagement || 0).toFixed(1) + '%';
        $id('anEngagement').style.color = '#22c55e';
        $id('anBounce').textContent = (k.anBounce || 0).toFixed(1) + '%';
        $id('anBounce').style.color = '#ef4444';

        // Restore correct labels
        $q('#analyticsPerformance .stat-card:nth-child(1) .stat-lbl').textContent = 'Lượt xem';
        $q('#analyticsPerformance .stat-card:nth-child(2) .stat-lbl').textContent = 'Khách truy cập';
        $q('#analyticsPerformance .stat-card:nth-child(3) .stat-lbl').textContent = 'Tương tác';
        $q('#analyticsPerformance .stat-card:nth-child(4) .stat-lbl').textContent = 'Tỉ lệ thoát';

        // Timeline chart (articles created vs published per day)
        if (perf.trafficChart?.length) {
          this._renderTimeline(perf.trafficChart);
        }

        // Top articles
        const topCont = $id('anTrendingPosts');
        if (perf.topArticles?.length) {
          topCont.innerHTML = perf.topArticles
            .map(
              (a) => `
            <div class="report-row">
              <span class="report-label">${trunc(esc(a.title ?? ''), 40)}</span>
              <span style="font-size:11px;color:var(--color-muted)">${fmtDate(a.publishedAt || a.createdAt)}</span>
            </div>`
            )
            .join('');
        } else {
          topCont.innerHTML = '<div style="font-size:12px;color:var(--color-muted);padding:12px">Chưa có bài viết</div>';
        }

        // Articles table
        if (perf.articlesTable?.length) {
          $id('anArticlesCount').textContent = `${perf.anArticlesCount} bài viết`;
          $id('anArticlesTable').innerHTML = `
            <table class="admin-table">
              <thead><tr><th>Bài viết</th><th>Danh mục</th><th>Trạng thái</th><th>Ngày</th></tr></thead>
              <tbody>
                ${perf.articlesTable
                  .map(
                    (a) => `
                  <tr>
                    <td>${trunc(esc(a.title), 40)}</td>
                    <td>${esc(a.category)}</td>
                    <td><span class="article-status ${a.status === 'published' ? 'pub' : 'drf'}">${a.status === 'published' ? 'Đã đăng' : 'Nháp'}</span></td>
                    <td style="font-size:11px;color:var(--color-muted)">${fmtDate(a.createdAt)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`;
        }
      }
    } catch { /* best-effort */ }

    // Pre-fetch other tabs data
    try { this._data.keywords = await api(`/analytics/keywords?period=${period}`); } catch {}
    try { this._data.gap = await api(`/analytics/gap?period=${period}`); } catch {}
    try { this._data.roi = await api(`/analytics/roi?period=${period}`); } catch {}

    this.showTab('performance');
  },

  /* ── Growth Trend Chart (views + visitors line) ── */

  _renderGrowthChart(timeline) {
    const canvas = $id('trafficChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');

    if (QTP._analyticsChart) QTP._analyticsChart.destroy();

    const labels = timeline.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    });
    const views = timeline.map(d => d.views);
    const visitors = timeline.map(d => d.visitors);
    const step = Math.max(1, Math.floor(labels.length / 10));
    const tickLabels = labels.map((l, i) => (i % step === 0 ? l : ''));

    // Compute growth line (7-day moving average growth %)
    const growthPct = timeline.map((d, i) => {
      if (i < 7) return null;
      const avg7 = timeline.slice(i - 6, i + 1).reduce((s, x) => s + x.views, 0) / 7;
      const prev7 = timeline.slice(Math.max(0, i - 13), i - 6).reduce((s, x) => s + x.views, 0) / 7;
      return prev7 > 0 ? ((avg7 - prev7) / prev7 * 100) : 0;
    });
    const growthMax = Math.max(...growthPct.filter(Boolean).map(Math.abs), 5);
    const scaledGrowth = growthPct.map(v => v !== null ? (v / growthMax) * (Math.max(...views) * 0.3) : null);

    QTP._analyticsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Lượt xem',
            data: views,
            borderColor: '#ed6918',
            backgroundColor: 'rgba(237,105,24,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
            yAxisID: 'y',
          },
          {
            label: 'Khách',
            data: visitors,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.05)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
            yAxisID: 'y',
          },
          {
            label: 'Tăng trưởng %',
            data: scaledGrowth,
            borderColor: '#22c55e',
            backgroundColor: 'transparent',
            borderDash: [5, 3],
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 1.5,
            yAxisID: 'y',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12,12,22,0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(237,105,24,0.2)',
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              label: function(ctx) {
                if (ctx.datasetIndex === 2) {
                  const idx = ctx.dataIndex;
                  const val = growthPct[idx];
                  return val !== null ? `Tăng trưởng: ${val.toFixed(1)}%` : '';
                }
                return ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString();
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#52525b', font: { size: 9 }, maxTicksLimit: 12 },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#52525b', font: { size: 9 }, precision: 0 },
            grid: { color: 'rgba(255,255,255,0.03)' },
          },
        },
      },
    });
  },

  /* ── Articles per day bar chart ── */

  _renderArticlesDaily(timeline) {
    const canvas = $id('articlesDailyChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');

    if (this._dailyChart) this._dailyChart.destroy();

    const labels = timeline.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    });
    const created = timeline.map(d => d.articlesCreated);
    const published = timeline.map(d => d.articlesPublished);
    const step = Math.max(1, Math.floor(labels.length / 8));
    const tickLabels = labels.map((l, i) => (i % step === 0 ? l : ''));

    this._dailyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Tạo',
            data: created,
            backgroundColor: 'rgba(237,105,24,0.7)',
            borderColor: '#ed6918',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Đăng',
            data: published,
            backgroundColor: 'rgba(34,197,94,0.7)',
            borderColor: '#22c55e',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 6 },
          },
          tooltip: {
            backgroundColor: 'rgba(12,12,22,0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(237,105,24,0.2)',
            borderWidth: 1,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            ticks: { color: '#52525b', font: { size: 8 }, maxTicksLimit: 10 },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#52525b', font: { size: 8 }, precision: 0 },
            grid: { color: 'rgba(255,255,255,0.03)' },
          },
        },
      },
    });
  },

  showTab(tab) {
    $qa('.analytics-tab').forEach((t) => t.classList.remove('analytics-tab-active'));
    $q(`[data-atab="${tab}"]`).classList.add('analytics-tab-active');

    const panels = {
      performance: 'analyticsPerformance',
      keywords: 'analyticsKeywords',
      gap: 'analyticsGap',
      roi: 'analyticsROI',
    };
    $qa('.analytics-panel').forEach((p) => (p.style.display = 'none'));
    const panel = $id(panels[tab]);
    if (panel) panel.style.display = 'block';

    switch (tab) {
      case 'keywords':
        this._renderKeywords(this._data.keywords);
        break;
      case 'gap':
        this._renderGap(this._data.gap);
        break;
      case 'roi':
        this._renderROI(this._data.roi);
        break;
    }
  },

  /* ── Keywords Tab ── */

  _renderKeywords(data) {
    if (!data) return;
    $id('anKwCount').textContent = `${data.anKwCount || 0} keywords`;

    if (data.keywords) {
      $id('anKeywordsTable').innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Keyword</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Position</th></tr></thead>
          <tbody>
            ${data.keywords
              .map(
                (k) => `
              <tr>
                <td>${esc(k.keyword)}</td>
                <td>${(k.impressions || 0).toLocaleString()}</td>
                <td>${(k.clicks || 0).toLocaleString()}</td>
                <td>${k.ctr || 0}%</td>
                <td>#${k.position || '-'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
    }

    if (data.rising) {
      $id('anRisingKeywords').innerHTML =
        data.rising
          .map(
            (k) =>
              `<div class="report-row"><span class="report-label">${esc(k.keyword)}</span><span style="color:#22c55e">up ${(k.impressions || 0).toLocaleString()} luot</span></div>`
          )
          .join('') ||
        '<div style="font-size:12px;color:var(--color-muted)">Chua co du lieu</div>';
    }

    if (data.rankingPages) {
      $id('anRankingPages').innerHTML = `
        <table class="admin-table">
          <thead><tr><th>URL</th><th>Impressions</th><th>Clicks</th><th>Position</th></tr></thead>
          <tbody>
            ${data.rankingPages
              .map(
                (p) => `
              <tr>
                <td style="font-size:11px;word-break:break-all">${esc(p.url || p.keyword || '')}</td>
                <td>${(p.impressions || 0).toLocaleString()}</td>
                <td>${(p.clicks || 0).toLocaleString()}</td>
                <td>#${p.position || '?'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
    }
  },

  /* ── Gap Analysis Tab ── */

  _renderGap(data) {
    if (!data) return;
    $id('anGapCount').textContent = `${data.anGapCount || 0} co hoi`;
    $id('anGapEstTraffic').textContent = (data.anGapEstTraffic || 0).toLocaleString();

    if (data.gaps) {
      $id('anGapList').innerHTML = data.gaps
        .map(
          (g) => `
        <div class="report-row">
          <span class="report-label">${esc(g.keyword || g.topic)}</span>
          <span style="font-size:12px;color:${g.opportunity === 'Cao' ? '#22c55e' : g.opportunity === 'Trung binh' ? '#f59e0b' : '#ef4444'}">${g.opportunity || ''}</span>
        </div>`
        )
        .join('');
    }

    if (data.covered) {
      $id('anCoveredList').innerHTML = data.covered
        .map(
          (c) =>
            `<div class="report-row"><span class="report-label">${esc(c.name || c.slug || c)}</span><span style="color:#22c55e">${c.count || 0} bai</span></div>`
        )
        .join('');
    }

    if (data.competitorList) {
      $id('anCompetitorList').innerHTML = data.competitorList
        .map(
          (d) =>
            `<div style="padding:8px 14px;border-radius:8px;background:var(--color-card-2);border:1px solid var(--color-border);font-size:12px">${esc(d.domain)}<br><small style="color:var(--color-muted)">Bai viet: ${d.articles} | Diem: ${d.score}</small></div>`
        )
        .join('');
    }
  },

  /* ── ROI Tab ── */

  _renderROI(data) {
    if (!data) return;
    const k = data.kpis || {};
    $id('anHoursSaved').textContent = k.anHoursSaved ? k.anHoursSaved.toLocaleString() + 'h' : '-';
    $id('anMoneySaved').textContent = k.anMoneySaved ? (k.anMoneySaved / 1_000_000).toFixed(1) + 'M VND' : '-';
    $id('anQualityScore').textContent = k.anQualityScore ? k.anQualityScore + '/100' : '-';
    $id('anROI').textContent = data.roi ? data.roi.toFixed(0) + '%' : '-';
    $id('anQualityNum').textContent = (k.anQualityNum || '0/100');
    $id('anQualityBar').style.width = Math.min(100, k.anQualityBar || 0) + '%';

    if (data.beforeAfter) {
      const b = data.beforeAfter;
      $id('anBeforeMetrics').innerHTML = `
        <div class="report-row"><span class="report-label">Thoi gian/bai</span><span class="report-value">${b.before.timePerArticle} phut</span></div>
        <div class="report-row"><span class="report-label">SL/thang</span><span class="report-value">${b.before.monthlyOutput} bai</span></div>`;
      $id('anAfterMetrics').innerHTML = `
        <div class="report-row"><span class="report-label">Thoi gian/bai</span><span class="report-value" style="color:#22c55e">${b.after.timePerArticle} phut</span></div>
        <div class="report-row"><span class="report-label">SL/thang</span><span class="report-value" style="color:#22c55e">${b.after.monthlyOutput} bai</span></div>`;
    }
  },
  /* ── Fake Data Generator ── */

  _loadFakeData(period) {
    const now = new Date();

    // ── Generate data ──
    const timeline = [];
    let baseCreated = 2, basePublished = 1, baseViews = 1200, baseVisitors = 400;
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const growth = 1 + (period - i) / period * 0.5;
      const created = Math.round(baseCreated * growth * (0.5 + Math.random()));
      const published = Math.round(basePublished * growth * (0.4 + Math.random()));
      baseCreated += 0.1 + Math.random() * 0.3;
      basePublished += 0.1 + Math.random() * 0.2;
      timeline.push({
        date: dayStr,
        articlesCreated: Math.max(0, created),
        articlesPublished: Math.max(0, Math.min(created, published)),
        views: Math.round(baseViews * growth * (0.6 + Math.random() * 0.8)),
        visitors: Math.round(baseVisitors * growth * (0.5 + Math.random() * 0.6)),
      });
    }

    const totalViews = timeline.reduce((s, d) => s + d.views, 0);
    const totalVisitors = timeline.reduce((s, d) => s + d.visitors, 0);
    const avgEngagement = 62.4 + Math.random() * 8;
    const avgBounce = 30.2 + Math.random() * 6;

    // Last 7 days vs previous 7 for growth
    const last7 = timeline.slice(-7);
    const prev7 = timeline.slice(-14, -7);
    const viewsGrowth = prev7.length ? ((last7.reduce((s,d)=>s+d.views,0) - prev7.reduce((s,d)=>s+d.views,0)) / prev7.reduce((s,d)=>s+d.views,0) * 100).toFixed(1) : '+0.0';
    const visGrowth = prev7.length ? ((last7.reduce((s,d)=>s+d.visitors,0) - prev7.reduce((s,d)=>s+d.visitors,0)) / prev7.reduce((s,d)=>s+d.visitors,0) * 100).toFixed(1) : '+0.0';
    const engGrowth = '+' + (3.2 + Math.random() * 4).toFixed(1);
    const bounceGrowth = (-2.1 - Math.random() * 3).toFixed(1);

    // ── KPI Cards ──
    $id('anTotalViews').textContent = totalViews.toLocaleString();
    $id('anTotalVisitors').textContent = totalVisitors.toLocaleString();
    $id('anEngagement').textContent = avgEngagement.toFixed(1) + '%';
    $id('anBounce').textContent = avgBounce.toFixed(1) + '%';

    // ── Growth Badges ──
    const setBadge = (id, val, isGoodUp) => {
      const el = $id(id);
      if (!el) return;
      const num = parseFloat(val);
      const isUp = num > 0;
      el.style.display = 'inline-flex';
      el.className = 'an-growth-badge ' + (isUp ? 'an-growth-up' : 'an-growth-down');
      const arrow = isUp ? '↑' : '↓';
      el.innerHTML = `${arrow} ${Math.abs(num)}%`;
    };
    setBadge('anViewsGrowth', viewsGrowth, true);
    setBadge('anVisitorsGrowth', visGrowth, true);
    setBadge('anEngagementGrowth', engGrowth, true);
    setBadge('anBounceGrowth', bounceGrowth, false);

    // ── Growth Trend Chart (views + visitors + growth line) ──
    this._renderGrowthChart(timeline);

    // ── Trending Posts ──
    const trendingList = [
      { title: 'Hướng dẫn SEO WordPress Toàn Diện 2026', views: 2840, engagement: 68, growth: '+32%', badge: '🔥', badgeClass: 'trending-hot', label: 'Hot' },
      { title: 'Cách Viết Content Chuẩn Google AI', views: 2150, engagement: 72, growth: '+28%', badge: '📈', badgeClass: 'trending-trending', label: 'Trending' },
      { title: 'Top 10 Công Cụ AI Cho Content Marketing', views: 1890, engagement: 65, growth: '+45%', badge: '🔥', badgeClass: 'trending-hot', label: 'Hot' },
      { title: 'Chiến Lược Social Media Cho Doanh Nghiệp Nhỏ', views: 1560, engagement: 58, growth: '+18%', badge: '👍', badgeClass: 'trending-popular', label: 'Popular' },
      { title: 'Tối Ưu Tốc Độ Website WordPress', views: 1340, engagement: 71, growth: '+22%', badge: '📈', badgeClass: 'trending-trending', label: 'Trending' },
      { title: 'Xu Hướng Thiết Kế Web 2026', views: 1120, engagement: 55, growth: '+15%', badge: '👍', badgeClass: 'trending-popular', label: 'Popular' },
      { title: 'Bí Quyết Tăng Traffic Tự Nhiên', views: 980, engagement: 63, growth: '+40%', badge: '🆕', badgeClass: 'trending-new', label: 'New' },
      { title: 'Hướng Dẫn Làm Video Shorts Cho Marketing', views: 870, engagement: 60, growth: '+12%', badge: '🆕', badgeClass: 'trending-new', label: 'New' },
    ];

    $id('anTrendingCount').textContent = `${trendingList.length} bài`;
    $id('anTrendingPosts').innerHTML = trendingList.map((t, i) => {
      const rankClass = i < 3 ? `trending-rank-${i + 1}` : 'trending-rank-n';
      return `<div class="trending-card">
        <div class="trending-rank ${rankClass}">${i + 1}</div>
        <div class="trending-info">
          <div class="trending-title">${esc(t.title)}</div>
          <div class="trending-meta">
            <span><i class="fas fa-eye" style="font-size:8px"></i> ${t.views.toLocaleString()}</span>
            <span><i class="fas fa-chart-simple" style="font-size:8px"></i> ${t.engagement}%</span>
            <span style="color:#22c55e">${t.growth}</span>
          </div>
        </div>
        <span class="trending-badge ${t.badgeClass}">${t.badge} ${t.label}</span>
      </div>`;
    }).join('');

    // ── Articles per day bar chart ──
    this._renderArticlesDaily(timeline);

    // Article summary stats
    const totalArticles = timeline.reduce((s, d) => s + d.articlesCreated, 0);
    const totalPublished = timeline.reduce((s, d) => s + d.articlesPublished, 0);
    $id('anTotalArticles').textContent = totalArticles.toLocaleString();
    $id('anTotalPublished').textContent = totalPublished.toLocaleString();
    $id('anTotalDrafts').textContent = (totalArticles - totalPublished).toLocaleString();

    // ── Articles Table with per-article metrics ──
    const categories = ['SEO', 'Content', 'Marketing', 'WordPress', 'Social Media', 'AI Tools'];
    const statuses = ['published', 'published', 'published', 'draft'];
    const allArticles = [];
    const articleNames = [
      'Hướng dẫn SEO WordPress Toàn Diện 2026',
      'Cách Viết Content Chuẩn Google AI',
      'Top 10 Công Cụ AI Cho Content Marketing',
      'Chiến Lược Social Media Cho Doanh Nghiệp Nhỏ',
      'Tối Ưu Tốc Độ Website WordPress',
      'Xu Hướng Thiết Kế Web 2026',
      'Bí Quyết Tăng Traffic Tự Nhiên',
      'Hướng Dẫn Làm Video Shorts Cho Marketing',
      'Email Marketing Automation Cơ Bản',
      'Phân Tích Đối Thủ Cạnh Tranh SEO',
    ];
    for (let i = 0; i < totalArticles; i++) {
      const daysAgo = Math.floor(Math.random() * period);
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      allArticles.push({
        title: articleNames[i % articleNames.length] + (i >= articleNames.length ? ' #' + (i + 1) : ''),
        category: categories[i % categories.length],
        createdAt: d.toISOString(),
        status: statuses[i % statuses.length],
        views: Math.floor(100 + Math.random() * 5000),
        clicks: Math.floor(10 + Math.random() * 300),
        ctr: (3 + Math.random() * 12).toFixed(1),
      });
    }

    // Top articles first
    allArticles.sort((a, b) => b.views - a.views);

    $id('anArticlesCount').textContent = `${totalArticles} bài viết`;
    $id('anArticlesTable').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Bài viết</th><th>Danh mục</th><th>Lượt xem</th><th>Click</th><th>CTR</th><th>Trạng thái</th><th>Ngày</th></tr></thead>
        <tbody>
          ${allArticles.slice(0, 50).map(a => `
          <tr>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${trunc(esc(a.title), 35)}</td>
            <td><span style="font-size:10px;color:var(--color-muted)">${esc(a.category)}</span></td>
            <td style="color:#ed6918;font-weight:600">${a.views.toLocaleString()}</td>
            <td style="color:#3b82f6">${a.clicks.toLocaleString()}</td>
            <td style="color:#22c55e">${a.ctr}%</td>
            <td><span class="article-status ${a.status === 'published' ? 'pub' : 'drf'}">${a.status === 'published' ? 'Đã đăng' : 'Nháp'}</span></td>
            <td style="font-size:10px;color:var(--color-muted)">${fmtDate(a.createdAt)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    // ── Keywords ──
    const fakeKeywords = [
      { keyword: 'seo wordpress', impressions: 8450, clicks: 1234, ctr: 14.6, position: 4 },
      { keyword: 'content AI', impressions: 6200, clicks: 891, ctr: 14.4, position: 5 },
      { keyword: 'công cụ AI content', impressions: 5400, clicks: 756, ctr: 14.0, position: 3 },
      { keyword: 'học SEO online', impressions: 4800, clicks: 672, ctr: 14.0, position: 6 },
      { keyword: 'viết content marketing', impressions: 4100, clicks: 574, ctr: 14.0, position: 4 },
      { keyword: 'tối ưu web', impressions: 3600, clicks: 504, ctr: 14.0, position: 7 },
      { keyword: 'email marketing', impressions: 3200, clicks: 448, ctr: 14.0, position: 5 },
      { keyword: 'social media marketing', impressions: 2800, clicks: 392, ctr: 14.0, position: 8 },
      { keyword: 'wordpress plugin', impressions: 2500, clicks: 350, ctr: 14.0, position: 9 },
      { keyword: 'keyword research', impressions: 2100, clicks: 294, ctr: 14.0, position: 6 },
      { keyword: 'backlink building', impressions: 1800, clicks: 252, ctr: 14.0, position: 10 },
      { keyword: 'website speed', impressions: 1500, clicks: 210, ctr: 14.0, position: 7 },
    ];
    const risingKeywords = [
      { keyword: 'AI content marketing', impressions: 3200 },
      { keyword: 'Google SGE update', impressions: 2800 },
      { keyword: 'video marketing 2026', impressions: 2500 },
      { keyword: 'SEO podcast', impressions: 1800 },
      { keyword: 'local SEO strategy', impressions: 1200 },
    ];
    const rankingPages = [
      { url: '/huong-dan-seo-wordpress', impressions: 3400, clicks: 510, position: 3 },
      { url: '/content-ai-la-gi', impressions: 2900, clicks: 435, position: 2 },
      { url: '/cong-cu-ai-content', impressions: 2500, clicks: 375, position: 5 },
      { url: '/hoc-seo-online', impressions: 2100, clicks: 315, position: 4 },
      { url: '/viet-content-marketing', impressions: 1800, clicks: 270, position: 6 },
      { url: '/toi-uu-toc-do-web', impressions: 1400, clicks: 210, position: 7 },
      { url: '/email-marketing-automation', impressions: 1100, clicks: 165, position: 8 },
    ];

    this._data.keywords = {
      keywords: fakeKeywords,
      anKwCount: fakeKeywords.length,
      rising: risingKeywords,
      rankingPages,
    };

    // ── Gap Analysis ──
    const gaps = [
      { keyword: 'Google Core Web Vitals', category: 'SEO', impressions: 1200, clicks: 180, ctr: 15.0, position: '—', opportunity: 'Cao', estimatedTraffic: 180 },
      { keyword: 'AI viết content tự động', impressions: 950, clicks: 0, ctr: 0, position: '—', opportunity: 'Cao', estimatedTraffic: 142 },
      { keyword: 'Website bán hàng online', impressions: 800, clicks: 0, ctr: 0, position: '—', opportunity: 'Cao', estimatedTraffic: 120 },
      { keyword: 'Chatbot AI cho doanh nghiệp', impressions: 650, clicks: 0, ctr: 0, position: '—', opportunity: 'Trung bình', estimatedTraffic: 97 },
      { keyword: 'Google Business Profile SEO', impressions: 500, clicks: 0, ctr: 0, position: '—', opportunity: 'Trung bình', estimatedTraffic: 75 },
      { keyword: 'Content pillar strategy', impressions: 400, clicks: 0, ctr: 0, position: '—', opportunity: 'Trung bình', estimatedTraffic: 60 },
      { keyword: 'SEO cho hình ảnh', impressions: 300, clicks: 0, ctr: 0, position: '—', opportunity: 'Thấp', estimatedTraffic: 45 },
    ];
    const covered = [
      { slug: 'seo', name: 'SEO Tổng Quan', count: 12 },
      { slug: 'content', name: 'Content Marketing', count: 8 },
      { slug: 'marketing', name: 'Digital Marketing', count: 6 },
      { slug: 'wordpress', name: 'WordPress Tips', count: 10 },
      { slug: 'social-media', name: 'Social Media', count: 4 },
    ];
    const competitorList = [
      { domain: 'thinksmart.vn', articles: totalArticles, keywords: fakeKeywords.length, score: 85 },
      { domain: 'webseo24h.com', articles: 120, keywords: 48, score: 72 },
      { domain: 'marketingai.vn', articles: 85, keywords: 35, score: 68 },
      { domain: 'contentpro.vn', articles: 95, keywords: 42, score: 76 },
    ];

    this._data.gap = {
      gaps,
      anGapCount: gaps.length,
      anGapEstTraffic: gaps.reduce((s, g) => s + (g.estimatedTraffic || 0), 0),
      covered,
      competitorList,
    };

    // ── ROI ──
    const hoursSaved = 1248 + Math.floor(Math.random() * 200);
    const moneySaved = hoursSaved * 150000;
    const qualityScore = 82 + Math.floor(Math.random() * 10);
    const roi = 312 + Math.floor(Math.random() * 60);

    this._data.roi = {
      kpis: {
        anHoursSaved: hoursSaved,
        anMoneySaved: moneySaved,
        anQualityScore: qualityScore,
        anQualityNum: `${qualityScore}/100`,
        anQualityBar: qualityScore,
      },
      totalArticles,
      publishedArticles: Math.round(totalArticles * 0.72),
      totalCost: 1250000,
      contentValue: totalArticles * 200000,
      roi,
      beforeAfter: {
        before: { timePerArticle: 240, monthlyOutput: 7, monthlyCost: 10800000 },
        after: { timePerArticle: 30, monthlyOutput: 60, monthlyCost: 4200000 },
      },
    };
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Analytics

/* ===================================================================
   SECTION 14 — QTP.Media (AI Image Library)
   =================================================================== */

QTP.Media = {
  _images: [],

  async load() {
    // ══ Fake Data ══
    if (QTP._fakeMode) {
      this._images = QTP._fake.media.slice();
      this._render();
      return;
    }

    const cont = $id('mediaCont');
    cont.innerHTML =
      '<div class="loading-state" style="grid-column:1/-1"><div class="spinner"></div><p>Đang tải thư viện ảnh…</p></div>';

    try {
      const arts = await api('/articles');
      if (!Array.isArray(arts) || !arts.length) {
        cont.innerHTML =
          '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-images" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Chưa có ảnh nào</div>';
        return;
      }

      const allImages = [];
      arts.forEach((a) => {
        if (a.images?.length) {
          a.images.forEach((img) => allImages.push({ url: img, title: a.title, slug: a.slug }));
        }
        if (a.thumbnail) allImages.push({ url: a.thumbnail, title: a.title + ' (thumb)', slug: a.slug });
      });

      if (!allImages.length) {
        cont.innerHTML =
          '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-images" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Chưa có ảnh. Dùng "Tạo ảnh AI" từ bài viết.</div>';
        return;
      }

      this._images = allImages;
      this._render();
    } catch {
      cont.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-danger)">Lỗi tải thư viện ảnh</div>';
    }
  },

  /** Filter by keyword */
  filter() {
    const q = ($id('mediaSearch').value || '').toLowerCase().trim();
    const filtered = q
      ? this._images.filter(img => (img.title || '').toLowerCase().includes(q))
      : this._images;
    this._renderList(filtered);
  },

  refresh() {
    this.load();
  },

  /** Auto-generate titles for all images via Gemini */
  async autoTitleAll() {
    if (!this._images.length) return showToast('Không có ảnh nào để tạo tiêu đề', 'error');
    const count = this._images.length;
    // Collect unique article titles
    const uniqueTitles = [...new Set(this._images.map(i => i.title || '').filter(Boolean))];
    if (!uniqueTitles.length) return showToast('Không có tiêu đề bài viết để làm cơ sở', 'error');

    showToast(`Đang tạo tiêu đề AI cho ${this._images.length} ảnh...`, 'loading');
    try {
      const res = await api('/media/generate-titles-batch', {
        method: 'POST',
        body: JSON.stringify({ images: this._images.map(i => ({ title: i.title, summary: '' })) }),
      });
      if (res.success && Array.isArray(res.results)) {
        this._images.forEach((img, i) => {
          if (res.results[i]?.alt) img.generatedAlt = res.results[i].alt;
        });
        this._render();
        showToast(`✅ Đã tạo tiêu đề cho ${res.results.filter(r => r.alt).length}/${count} ảnh`, 'success');
      }
    } catch (e) {
      showToast('Lỗi khi tạo tiêu đề: ' + e.message, 'error');
    }
  },

  /** Render all images with delete button */
  _render() {
    this._renderList(this._images);
  },

  _renderList(images) {
    const cont = $id('mediaCont');
    if (!images.length) {
      cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-images" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Không tìm thấy ảnh nào</div>';
      return;
    }
    cont.innerHTML = images
      .slice(0, 100)
      .map(
        (img, idx) => `
        <div class="img-cell" onclick="window.open('${img.url}','_blank')">
          <img src="${esc(img.url)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
          <div class="img-cell-info">
            <div class="img-cell-title" title="${esc(img.generatedAlt || img.title)}">${esc(img.generatedAlt || img.title || '')}</div>
          </div>
          <button class="img-del-btn" onclick="event.stopPropagation();QTP.Media.del(${idx})" title="Xóa ảnh">✕</button>
        </div>`
      )
      .join('');
  },

  /** Delete an image by index */
  del(index) {
    showConfirm('Xóa ảnh này?', () => {
      this._images.splice(index, 1);
      this._render();
      showToast('✅ Đã xóa ảnh!');
    });
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Media

/* ===================================================================
   SECTION 15 — QTP.Notes (Sticky Notes)
   =================================================================== */

QTP.Notes = {
  _colors: [],

  async load() {
    // ══ Fake Data ══
    if (QTP._fakeMode) {
      this._colors = [
        { id: 'yellow', bg: '#fbbf24', text: '#1c1917' },
        { id: 'green', bg: '#4ade80', text: '#052e16' },
        { id: 'blue', bg: '#60a5fa', text: '#172554' },
        { id: 'pink', bg: '#f472b6', text: '#500724' },
        { id: 'purple', bg: '#a78bfa', text: '#2e1065' },
      ];
      QTP._notes = QTP._fake.notes;
      this._render(QTP._fake.notes);
      this._renderColorFilter();
      return;
    }

    const cont = $id('notesGrid');
    cont.innerHTML =
      '<div class="loading-state" style="grid-column:1/-1"><div class="spinner"></div><p>Đang tải ghi chú…</p></div>';

    try {
      const res = await api('/notes');
      if (res.success && Array.isArray(res.notes)) {
        QTP._notes = res.notes;
        this._colors = res.colors || [];
        this._render(res.notes);
        this._renderColorFilter();
      }
    } catch {
      cont.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-danger)">Lỗi tải ghi chú</div>';
    }
  },

  _render(notes) {
    const cont = $id('notesGrid');
    if (!notes.length) {
      cont.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-sticky-note" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Chưa có ghi chú</div>';
      return;
    }

    cont.innerHTML = notes
      .map((n) => {
        const colorDef = this._colors.find((c) => c.id === n.color) || {
          bg: '#fbbf24',
          text: '#1c1917',
        };
        return `<div class="note-card" style="background:${colorDef.bg};color:${colorDef.text};${n.pinned ? 'order:-1' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            ${n.pinned ? '<i class="fas fa-thumbtack" style="font-size:12px;opacity:0.6"></i>' : '<span></span>'}
            <button onclick="QTP.Notes.del('${n.id}')" style="background:none;border:none;cursor:pointer;color:inherit;opacity:0.5;font-size:14px;padding:0"><i class="fas fa-times"></i></button>
          </div>
          <div contenteditable="true" class="note-content" onblur="QTP.Notes.update('${n.id}',this.textContent)" style="font-size:13px;line-height:1.5;word-break:break-word;outline:none;min-height:40px">${esc(n.content)}</div>
          <div style="margin-top:8px;font-size:10px;opacity:0.5">${fmtDate(n.updatedAt)}</div>
        </div>`;
      })
      .join('');
  },

  _renderColorFilter() {
    const cont = $id('notesColorFilter');
    const active = this._filterColor || 'all';
    const allBtn =
      `<button class="notes-color-btn ${active === 'all' ? 'notes-color-btn-active' : ''}" data-color="all" onclick="QTP.Notes.filterColor('all')">All</button>`;

    cont.innerHTML =
      allBtn +
      this._colors
        .map(
          (c) =>
            `<button class="notes-color-btn ${active === c.id ? 'notes-color-btn-active' : ''}" data-color="${c.id}" onclick="QTP.Notes.filterColor('${c.id}')" style="background:${c.bg};${active === c.id ? 'border-color:' + c.bg : ''}"></button>`
        )
        .join('');
  },

  filterColor(color) {
    this._filterColor = color;
    this._renderColorFilter();
    this._render(color === 'all' ? QTP._notes : QTP._notes.filter((n) => n.color === color));
  },

  search(q) {
    this._render(
      QTP._notes.filter((n) => (n.content || '').toLowerCase().includes(q.toLowerCase()))
    );
  },

  async add() {
    try {
      const res = await api('/notes', {
        method: 'POST',
        body: JSON.stringify({ content: 'Ghi chú mới…', color: 'amber' }),
      });
      if (res.success) {
        showToast('Đã thêm ghi chú!');
        this.load();
      } else {
        showToast(res.message || 'Lỗi!', 'error');
      }
    } catch {
      showToast('Lỗi thêm ghi chú!', 'error');
    }
  },

  async update(id, content) {
    if (!content?.trim()) return;
    try {
      await api(`/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: content.trim() }),
      });
    } catch {
      /* silent — saves on blur */
    }
  },

  del(id) {
    showConfirm('Xóa ghi chú này?', async () => {
      try {
        await api(`/notes/${id}`, { method: 'DELETE' });
        showToast('Đã xóa!');
        this.load();
      } catch {
        showToast('Lỗi xóa!', 'error');
      }
    });
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Notes

/* ===================================================================
   SECTION 16 — QTP.Library (Media Library CRUD + AI Query)
   =================================================================== */

QTP.Library = {
  _currentFolder: 'all',
  _view: 'grid',
  _folders: [],
  _images: [],
  _editingId: null,
  _editingFolderId: null,

  async load() {
    const grid = $id('libGrid');
    grid.innerHTML =
      '<div style="grid-column:1/-1" class="loading-state"><div class="spinner"></div><p>Đang tải thư viện…</p></div>';

    await Promise.all([this._loadFolders(), this._loadImages()]);
  },

  /* ── Folders ── */

  async _loadFolders() {
    try {
      const res = await api('/library/folders');
      if (res.success) {
        this._folders = res.folders || [];
        this._renderFolderTabs(res.folders, res.uncategorized || 0);
      }
    } catch {
      /* best-effort */
    }
  },

  _renderFolderTabs(folders, uncategorized) {
    const tabs = $id('libFolderTabs');
    const current = this._currentFolder;

    let html =
      `<button class="lib-folder-tab ${current === 'all' ? 'active' : ''}" onclick="QTP.Library.filterFolder('all')">
        <i class="fas fa-th-large"></i> Tất cả
      </button>
      <button class="lib-folder-tab ${current === 'none' ? 'active' : ''}" onclick="QTP.Library.filterFolder('none')">
        <i class="fas fa-inbox"></i> Chưa phân loại
        ${uncategorized > 0 ? `<span class="lib-badge">${uncategorized}</span>` : ''}
      </button>`;

    html += folders
      .map(
        (f) => `
      <div class="lib-folder-group ${current === f.id ? 'active' : ''}">
        <button class="lib-folder-tab" onclick="QTP.Library.filterFolder('${f.id}')">
          <i class="fas fa-folder"></i> ${esc(f.name)}
          ${f.imageCount > 0 ? `<span class="lib-badge">${f.imageCount}</span>` : ''}
        </button>
        <button class="lib-folder-edit" onclick="event.stopPropagation();QTP.Library.editFolder('${f.id}')" title="Sửa"><i class="fas fa-pen"></i></button>
        <button class="lib-folder-del" onclick="event.stopPropagation();QTP.Library.delFolder('${f.id}')" title="Xóa"><i class="fas fa-times"></i></button>
      </div>`
      )
      .join('');

    tabs.innerHTML = html;
  },

  filterFolder(folderId) {
    this._currentFolder = folderId;
    this._loadImages();
  },

  showFolderForm() {
    this._editingFolderId = null;
    $id('libFolderTitle').innerHTML = '<i class="fas fa-folder" style="color:var(--color-accent);margin-right:8px"></i>Thư mục mới';
    $id('libFolderName').value = '';
    $id('libFolderDesc').value = '';
    $id('libFolderId').value = '';
    $id('libFolderErr').style.display = 'none';
    $id('libFolderSaveBtn').innerHTML = '<i class="fas fa-save"></i> Tạo';
    $id('libFolderModal').classList.add('open');
  },

  editFolder(id) {
    const f = this._folders.find((x) => x.id === id);
    if (!f) return;
    this._editingFolderId = id;
    $id('libFolderTitle').innerHTML = '<i class="fas fa-folder-open" style="color:var(--color-accent);margin-right:8px"></i>Sửa thư mục';
    $id('libFolderName').value = f.name || '';
    $id('libFolderDesc').value = f.description || '';
    $id('libFolderId').value = id;
    $id('libFolderErr').style.display = 'none';
    $id('libFolderSaveBtn').innerHTML = '<i class="fas fa-save"></i> Lưu';
    $id('libFolderModal').classList.add('open');
  },

  closeFolderForm() {
    $id('libFolderModal').classList.remove('open');
  },

  async saveFolder() {
    const name = $id('libFolderName').value.trim();
    const description = $id('libFolderDesc').value.trim();
    const errEl = $id('libFolderErr');
    if (!name) {
      errEl.textContent = 'Tên thư mục không được để trống';
      errEl.style.display = 'block';
      return;
    }

    const id = this._editingFolderId;
    try {
      if (id) {
        await api(`/library/folders/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description }),
        });
        showToast('Đã cập nhật thư mục!');
      } else {
        await api('/library/folders', {
          method: 'POST',
          body: JSON.stringify({ name, description }),
        });
        showToast('Đã tạo thư mục!');
      }
      this.closeFolderForm();
      this._loadFolders();
    } catch {
      showToast('Lỗi lưu thư mục!', 'error');
    }
  },

  delFolder(id) {
    showConfirm('Xóa thư mục này? Ảnh trong thư mục sẽ chuyển về "Chưa phân loại".', async () => {
      try {
        await api(`/library/folders/${id}`, { method: 'DELETE' });
        showToast('Đã xóa thư mục!');
        if (this._currentFolder === id) this._currentFolder = 'all';
        await Promise.all([this._loadFolders(), this._loadImages()]);
      } catch {
        showToast('Lỗi xóa!', 'error');
      }
    });
  },

  /* ── Images ── */

  async _loadImages() {
    try {
      const folderParam = this._currentFolder;
      const res = await api(`/library/images?folderId=${folderParam}&limit=100`);
      if (res.success) {
        this._images = res.images || [];
        $id('libCount').textContent = `${res.total || this._images.length} ảnh`;
        this._renderGrid(this._images);
      }
    } catch {
      $id('libGrid').innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-danger)">Lỗi tải ảnh</div>';
    }
  },

  _renderGrid(images) {
    const grid = $id('libGrid');
    if (!images.length) {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-image" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Chưa có ảnh nào. Upload ảnh đầu tiên!</div>';
      return;
    }

    if (this._view === 'grid') {
      grid.className = 'media-grid';
      grid.innerHTML = images
        .map(
          (img) => `
        <div class="img-cell" onclick="QTP.Library.openEdit('${img.id}')" title="${esc(img.alt || img.originalName)}">
          <img src="${esc(img.thumb || img.url)}" alt="${esc(img.alt || '')}" loading="lazy" onerror="this.parentElement.style.display='none'">
          <div class="img-cell-overlay">
            <i class="fas fa-pen"></i>
          </div>
        </div>`
        )
        .join('');
    } else {
      grid.className = '';
      grid.innerHTML = images
        .map(
          (img) => `
        <div class="report-card" style="cursor:pointer;margin-bottom:8px" onclick="QTP.Library.openEdit('${img.id}')">
          <div style="display:flex;gap:12px;align-items:center">
            <img src="${esc(img.thumb || img.url)}" alt="" style="width:60px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;background:var(--color-card-2)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px">${esc(img.alt || img.originalName)}</div>
              <div style="font-size:11px;color:var(--color-muted);margin-top:2px">
                ${img.width}x${img.height} · ${(img.fileSize / 1024).toFixed(0)}KB · ${fmtDate(img.createdAt)}
              </div>
              ${img.aiTags?.length ? '<div style="font-size:10px;color:var(--color-purple);margin-top:2px">' + img.aiTags.slice(0,3).join(', ') + '</div>' : ''}
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
              <button onclick="event.stopPropagation();QTP.Library.openEdit('${img.id}')" class="btn btn-ghost btn-sm"><i class="fas fa-edit"></i></button>
              <button onclick="event.stopPropagation();QTP.Library.delImage('${img.id}')" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>`
        )
        .join('');
    }
  },

  /* ── Upload ── */

  uploadClick() {
    $id('libFileInput').click();
  },

  async uploadFiles(input) {
    const files = input.files;
    if (!files.length) return;

    showToast(`Đang upload ${files.length} ảnh…`, 'loading');

    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.append('image', files[i]);
      fd.append('folderId', this._currentFolder !== 'all' && this._currentFolder !== 'none' ? this._currentFolder : '');
      fd.append('alt', files[i].name.replace(/\.[^.]+$/, ''));

      try {
        const res = await fetch('/api/library/images/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('qtp_token')}` },
          body: fd,
        });
        const data = await res.json();
        if (!data.success) {
          showToast(`Lỗi: ${files[i].name} — ${data.message}`, 'error');
        }
      } catch {
        showToast(`Lỗi upload ${files[i].name}!`, 'error');
      }
    }

    input.value = '';
    showToast(`✅ Upload xong ${files.length} ảnh!`);
    await Promise.all([this._loadFolders(), this._loadImages()]);
  },

  /* ── URL Import ── */

  showUrlImport() {
    $id('libUrlInput').value = '';
    $id('libUrlAlt').value = '';
    $id('libUrlErr').style.display = 'none';
    $id('libUrlModal').classList.add('open');
  },

  closeUrlImport() {
    $id('libUrlModal').classList.remove('open');
  },

  async importUrl() {
    const url = $id('libUrlInput').value.trim();
    const alt = $id('libUrlAlt').value.trim();
    if (!url) {
      $id('libUrlErr').textContent = 'Vui lòng nhập URL';
      $id('libUrlErr').style.display = 'block';
      return;
    }

    const btn = $id('libUrlBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang import…';

    try {
      const res = await api('/library/images/upload-url', {
        method: 'POST',
        body: JSON.stringify({
          url,
          alt: alt || '',
          folderId: this._currentFolder !== 'all' && this._currentFolder !== 'none' ? this._currentFolder : '',
        }),
      });
      if (res.success) {
        showToast('✅ Đã import ảnh từ URL!');
        this.closeUrlImport();
        await Promise.all([this._loadFolders(), this._loadImages()]);
      } else {
        $id('libUrlErr').textContent = res.message || 'Lỗi import';
        $id('libUrlErr').style.display = 'block';
      }
    } catch {
      $id('libUrlErr').textContent = 'Lỗi kết nối!';
      $id('libUrlErr').style.display = 'block';
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-download"></i> Import';
  },

  /* ── Edit Image ── */

  async openEdit(id) {
    const img = this._images.find((x) => x.id === id);
    if (!img) return;

    this._editingId = id;
    $id('libEditPreview').src = img.url;
    $id('libEditAlt').value = img.alt || '';
    $id('libEditTags').value = (img.aiTags || []).join(', ');
    $id('libEditId').value = id;

    // Populate folder dropdown
    const sel = $id('libEditFolder');
    sel.innerHTML =
      '<option value="">— Không có thư mục —</option>' +
      this._folders
        .map((f) => `<option value="${f.id}" ${f.id === img.folderId ? 'selected' : ''}>${esc(f.name)}</option>`)
        .join('');

    $id('libEditMeta').textContent =
      `${img.width}x${img.height} · ${(img.fileSize / 1024).toFixed(0)}KB · ${img.mimeType} · ${fmtDate(img.createdAt)}`;

    $id('libEditErr').style.display = 'none';
    $id('libEditModal').classList.add('open');
  },

  closeEdit() {
    $id('libEditModal').classList.remove('open');
  },

  async saveEdit() {
    const id = this._editingId;
    const alt = $id('libEditAlt').value.trim();
    const folderId = $id('libEditFolder').value;
    const tagsStr = $id('libEditTags').value.trim();
    const aiTags = tagsStr ? tagsStr.split(',').map((s) => s.trim()).filter(Boolean) : [];

    try {
      const res = await api(`/library/images/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ alt, folderId, aiTags }),
      });
      if (res.success) {
        showToast('✅ Đã cập nhật ảnh!');
        this.closeEdit();
        await Promise.all([this._loadFolders(), this._loadImages()]);
      } else {
        showToast(res.message || 'Lỗi!', 'error');
      }
    } catch {
      showToast('Lỗi cập nhật!', 'error');
    }
  },

  delImage(id) {
    showConfirm('Xóa ảnh này?', async () => {
      try {
        await api(`/library/images/${id}`, { method: 'DELETE' });
        showToast('Đã xóa ảnh!');
        await Promise.all([this._loadFolders(), this._loadImages()]);
      } catch {
        showToast('Lỗi xóa!', 'error');
      }
    });
  },

  /* ── View toggle ── */

  setView(view) {
    this._view = view;
    $id('libViewGrid').classList.toggle('active', view === 'grid');
    $id('libViewList').classList.toggle('active', view === 'list');
    this._renderGrid(this._images);
  },

  /* ── Search & AI Query ── */

  async search() {
    const query = $id('libAIQuery').value.trim();
    if (!query) {
      this._loadImages();
      return;
    }
    const q = query.toLowerCase();
    const filtered = this._images.filter(
      (img) =>
        (img.alt || '').toLowerCase().includes(q) ||
        (img.originalName || '').toLowerCase().includes(q) ||
        (img.aiTags || []).some((t) => t.toLowerCase().includes(q))
    );
    $id('libCount').textContent = `${filtered.length} kết quả tìm kiếm`;
    this._renderGrid(filtered);
  },

  async aiSearch() {
    const query = $id('libAIQuery').value.trim();
    if (!query) {
      showToast('Vui lòng nhập mô tả ảnh cần tìm!', 'warning');
      return;
    }

    const grid = $id('libGrid');
    grid.innerHTML =
      '<div style="grid-column:1/-1" class="loading-state"><div class="spinner"></div><p>AI đang tìm ảnh phù hợp…</p></div>';

    try {
      const res = await api('/library/ai-query', {
        method: 'POST',
        body: JSON.stringify({ query, limit: 24 }),
      });
      if (res.success) {
        $id('libCount').textContent = `${res.images.length} kết quả AI · ${res.explanation || ''}`;
        this._renderGrid(res.images);
        if (res.images.length === 0) {
          showToast('Không tìm thấy ảnh phù hợp. Hãy thử mô tả khác!', 'warning');
        }
      }
    } catch {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-danger)">Lỗi AI truy vấn. Đang dùng tìm kiếm text…</div>';
      this.search();
    }
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
}; // end QTP.Library

/* ===================================================================
   SECTION 16a — QTP.Sites (Multi-site Management)
   =================================================================== */

QTP.Sites = {
  async load() {
    const container = $id('sitesList');
    try {
      const res = await api('/sites');
      if (!res.success || !Array.isArray(res.sites)) {
        container.innerHTML = '<p style="text-align:center;color:var(--color-muted);padding:40px">Không có site nào</p>';
        return;
      }
      container.innerHTML = res.sites.map(s => `
        <div class="site-card" style="background:var(--color-card-2);border-radius:12px;padding:18px;margin-bottom:12px;border:1px solid var(--color-border);display:flex;align-items:center;gap:16px">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--color-accent),#d4550f);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0">${esc(s.name.charAt(0).toUpperCase())}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px">${esc(s.name)}</div>
            <div style="font-size:12px;color:var(--color-sub);margin-top:2px">${esc(s.url)}</div>
            <div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--color-muted)">
              <span>👤 ${esc(s.username)}</span>
              <span>📄 ${s.postCount || 0} bài</span>
              <span>📂 ${s.defaultCategory || 'Chưa PL'}</span>
              <span>📅 ${s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : ''}</span>
              <span style="color:${s.isActive ? '#22c55e' : '#ef4444'}">${s.isActive ? '✅ Hoạt động' : '⛔ Tắt'}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="QTP.Sites.test('${s.id}')" class="btn btn-ghost btn-sm" title="Test kết nối"><i class="fas fa-plug"></i></button>
            <button onclick="QTP.Sites.showEditForm('${s.id}')" class="btn btn-ghost btn-sm" title="Sửa"><i class="fas fa-edit"></i></button>
            <button onclick="QTP.Sites.toggleActive('${s.id}')" class="btn btn-ghost btn-sm" title="${s.isActive ? 'Tắt' : 'Bật'}">
              <i class="fas ${s.isActive ? 'fa-pause' : 'fa-play'}"></i>
            </button>
            <button onclick="QTP.Sites.del('${s.id}')" class="btn btn-ghost btn-sm" style="color:#ef4444" title="Xóa"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('');
    } catch {
      container.innerHTML = '<p style="text-align:center;color:var(--color-danger);padding:40px">Lỗi tải danh sách sites</p>';
    }
  },

  showAddForm() {
    // Modal form
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--color-card);border:1px solid var(--color-border);border-radius:16px;max-width:500px;width:100%;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.5)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <i class="fas fa-globe" style="font-size:24px;color:var(--color-accent)"></i>
          <h3 style="font-size:18px;font-weight:700;margin:0">Thêm WordPress Site</h3>
        </div>
        <div style="display:grid;gap:14px">
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">Tên site</label><input id="sFormName" class="inp" placeholder="VD: Blog Công Nghệ"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">URL WordPress</label><input id="sFormUrl" class="inp" placeholder="VD: https://thinksmart.vn"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">Username</label><input id="sFormUser" class="inp" placeholder="admin"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">App Password</label><input id="sFormPass" type="password" class="inp" placeholder="xxxx xxxx xxxx"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">Danh mục mặc định (WordPress)</label><div style="display:flex;gap:6px"><select id="sFormCategory" class="inp" style="flex:1"><option value="">— Bấm nút làm mới để lấy danh mục —</option></select><button onclick="QTP.Sites.refreshCat('sFormCategory')" class="btn btn-ghost btn-sm" title="Làm mới danh mục từ WP" style="flex-shrink:0;padding:0 10px;min-height:38px"><i class="fas fa-sync-alt"></i></button></div></div>
        </div>
        <p style="font-size:11px;color:var(--color-muted);margin-top:-8px">💡 Danh mục sẽ được áp dụng khi đăng bài lên site này</p>
        <div style="display:flex;gap:12px;margin-top:20px">
          <button onclick="this.closest('[style*=&quot;fixed&quot;]').remove()" style="flex:1;padding:10px;border-radius:10px;background:var(--color-card-2);border:1px solid var(--color-border);color:var(--color-sub);font-weight:600;font-family:inherit;cursor:pointer">Hủy</button>
          <button onclick="QTP.Sites.saveNew()" style="flex:1;padding:10px;border-radius:10px;background:linear-gradient(135deg,var(--color-accent),#d4550f);border:none;color:#fff;font-weight:600;font-family:inherit;cursor:pointer">Thêm Site</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  },

  async saveNew() {
    const name = $id('sFormName')?.value.trim();
    const url = $id('sFormUrl')?.value.trim();
    const username = $id('sFormUser')?.value.trim();
    const appPassword = $id('sFormPass')?.value.trim();
    const defaultCategory = $id('sFormCategory')?.value || '';

    if (!name || !url || !username || !appPassword) {
      showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
      return;
    }

    try {
      const res = await api('/sites', {
        method: 'POST',
        body: JSON.stringify({ name, url, username, appPassword, defaultCategory }),
      });
      if (res.success) {
        showToast('Đã thêm site!');
        document.querySelector('[style*="fixed"]')?.remove();
        this.load();
      } else {
        showToast(res.message || 'Lỗi thêm site', 'error');
      }
    } catch {
      showToast('Lỗi kết nối!', 'error');
    }
  },

  async test(id) {
    try {
      const res = await api(`/sites/${id}/test`, { method: 'POST' });
      showToast(res.success ? '✅ Kết nối thành công!' : '❌ ' + (res.error || 'Kết nối thất bại'), res.success ? 'success' : 'error');
    } catch {
      showToast('Lỗi test kết nối!', 'error');
    }
  },

  async toggleActive(id) {
    try {
      const res = await api(`/sites/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: undefined }), // toggle server-side
      });
      if (res.success) showToast('Đã thay đổi trạng thái');
      this.load();
    } catch { showToast('Lỗi!', 'error'); }
  },

  async del(id) {
    showConfirm('Xóa site này?', async () => {
      try {
        const res = await api(`/sites/${id}`, { method: 'DELETE' });
        if (res.success) { showToast('Đã xóa site'); this.load(); }
      } catch { showToast('Lỗi xóa!', 'error'); }
    });
  },

  async showEditForm(id) {
    let site;
    try {
      const res = await api('/sites');
      site = (res.sites || []).find(s => s.id === id);
      if (!site) { showToast('❌ Không tìm thấy site để chỉnh sửa', 'error'); return; }
    } catch (e) { showToast('❌ Lỗi tải dữ liệu site: ' + (e.message || 'Unknown error'), 'error'); return; }

    // Tạo modal form sửa
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--color-card);border:1px solid var(--color-border);border-radius:16px;max-width:500px;width:100%;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.5)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <i class="fas fa-edit" style="font-size:24px;color:var(--color-accent)"></i>
          <h3 style="font-size:18px;font-weight:700;margin:0">Sửa Site</h3>
        </div>
        <div style="display:grid;gap:14px">
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">Tên site</label><input id="sEditName" class="inp" value="${esc(site.name)}"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">URL WordPress</label><input id="sEditUrl" class="inp" value="${esc(site.url)}"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">Username</label><input id="sEditUser" class="inp" value="${esc(site.username)}"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">App Password <span style="color:var(--color-muted);font-size:11px">(để trống nếu giữ nguyên)</span></label><input id="sEditPass" type="password" class="inp" placeholder="**** **** ****"></div>
          <div><label style="font-size:12px;color:var(--color-sub);margin-bottom:4px;display:block">Danh mục mặc định (WordPress)</label><div style="display:flex;gap:6px"><select id="sEditCategory" class="inp" style="flex:1"><option value="">— Chưa phân loại —</option></select><button onclick="QTP.Sites.refreshCat('sEditCategory', '${id}')" class="btn btn-ghost btn-sm" title="Làm mới danh mục từ WP" style="flex-shrink:0;padding:0 10px;min-height:38px"><i class="fas fa-sync-alt"></i></button></div></div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px">
          <button onclick="this.closest('[style*=&quot;fixed&quot;]').remove()" style="flex:1;padding:10px;border-radius:10px;background:var(--color-card-2);border:1px solid var(--color-border);color:var(--color-sub);font-weight:600;font-family:inherit;cursor:pointer">Hủy</button>
          <button onclick="QTP.Sites.saveEdit('${id}')" style="flex:1;padding:10px;border-radius:10px;background:linear-gradient(135deg,var(--color-accent),#d4550f);border:none;color:#fff;font-weight:600;font-family:inherit;cursor:pointer">Lưu thay đổi</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Load categories for this specific site
    api(`/sites/${id}/categories`).then(res => {
      if (res.success && Array.isArray(res.categories) && res.categories.length) {
        const sel = $id('sEditCategory');
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === site.defaultCategory ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
      }
    }).catch(() => {});
  },

  async saveEdit(id) {
    const name = $id('sEditName')?.value.trim();
    const url = $id('sEditUrl')?.value.trim();
    const username = $id('sEditUser')?.value.trim();
    const appPassword = $id('sEditPass')?.value.trim();
    const defaultCategory = $id('sEditCategory')?.value || '';

    if (!name || !url || !username) {
      showToast('Tên, URL và Username không được để trống!', 'error');
      return;
    }

    const body = { name, url, username, defaultCategory };
    if (appPassword) body.appPassword = appPassword;

    try {
      const res = await api(`/sites/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (res.success) {
        showToast('Đã cập nhật site!');
        document.querySelector('[style*="fixed"]')?.remove();
        this.load();
      } else {
        showToast(res.message || 'Lỗi cập nhật', 'error');
      }
    } catch {
      showToast('Lỗi kết nối!', 'error');
    }
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
};

/* ===================================================================
   SECTION 16b — QTP.Schedule (Smart Scheduling)
   =================================================================== */

QTP.Schedule = {
  _selected: {},

  load() {
    this._selected = {};
    this.loadArticles();
    this.toggleMode();
  },

  async loadArticles() {
    const container = $id('scheduleArticles');
    try {
      const res = await api('/articles?status=all', { method: 'GET' });
      let articles = Array.isArray(res) ? res : [];

      if (!articles.length) {
        container.innerHTML = '<p style="text-align:center;color:var(--color-muted);padding:20px">Chưa có bài viết nào để lên lịch. Hãy tạo bài viết trước.</p>';
        return;
      }

      container.innerHTML = articles
        .filter(a => a.file && a.title)
        .map((a, i) => `
          <div class="sched-item ${this._selected[a.file] ? 'selected' : ''}"
               onclick="QTP.Schedule.toggle('${esc(a.file)}', this)">
            <input type="checkbox" class="sched-checkbox" ${this._selected[a.file] ? 'checked' : ''}>
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:13px">${esc(a.title)}</div>
              <div style="font-size:11px;color:var(--color-muted)">${esc(a.file)}</div>
            </div>
          </div>
        `).join('');
    } catch {
      container.innerHTML = '<p style="text-align:center;color:var(--color-danger);padding:20px">Lỗi tải danh sách bài viết</p>';
    }
  },

  toggle(filename, el) {
    if (this._selected[filename]) {
      delete this._selected[filename];
      el.classList.remove('selected');
      el.querySelector('input').checked = false;
    } else {
      this._selected[filename] = true;
      el.classList.add('selected');
      el.querySelector('input').checked = true;
    }
  },

  toggleMode() {
    const mode = $id('schedMode').value;
    $id('schedManualPicker').style.display = mode === 'manual' ? 'block' : 'none';
    $id('schedPreview').style.display = 'none';
    $id('schedWarnings').style.display = 'none';
    // Set ngày mặc định là hôm nay
    if (mode === 'manual') {
      const now = new Date();
      // Đề xuất giờ đẹp tiếp theo (làm tròn lên giờ chẵn + 2h so với hiện tại)
      now.setHours(now.getHours() + 2, 0, 0, 0);
      $id('schedDate').value = now.toISOString().split('T')[0];
      $id('schedTime').value = String(now.getHours()).padStart(2,'0') + ':00';
    }
  },

  async preview() {
    const files = Object.keys(this._selected);
    if (!files.length) {
      showToast('Vui lòng chọn bài viết!', 'error');
      return;
    }

    const btn = $id('schedBtn');
    const prog = $id('schedProg');
    const fill = $id('schedProgFill');
    const txt = $id('schedProgTxt');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xem trước…';
    prog.style.display = 'block';
    fill.style.width = '30%';
    txt.textContent = '📊 Đang phân tích lịch tối ưu…';

    try {
      const res = await api('/schedule-preview', {
        method: 'POST',
        body: JSON.stringify({
          articleFiles: files,
          mode: $id('schedMode').value,
        }),
      });

      fill.style.width = '80%';

      if (res.success && res.schedule.length) {
        const previewList = $id('schedPreviewList');
        previewList.innerHTML = res.schedule.map(s => `
          <div class="sched-line">
            <span class="time"><i class="far fa-calendar-alt"></i> ${esc(s.display)}</span>
            <span class="title">${esc(s.file)}</span>
          </div>
        `).join('');
        $id('schedPreview').style.display = 'block';

        if (res.warnings && res.warnings.length) {
          $id('schedWarnList').innerHTML = res.warnings.map(w =>
            `<div class="sched-warn"><i class="fas fa-exclamation-triangle"></i> ${esc(w)}</div>`
          ).join('');
          $id('schedWarnings').style.display = 'block';
        } else {
          $id('schedWarnings').style.display = 'none';
        }
      }
    } catch {
      showToast('Lỗi xem trước lịch!', 'error');
    }

    fill.style.width = '100%';
    txt.textContent = '✅ Hoàn tất xem trước';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-calendar-check"></i> Lên lịch đăng';
    setTimeout(() => { prog.style.display = 'none'; }, 1000);
  },

  async execute() {
    const files = Object.keys(this._selected);
    if (!files.length) {
      showToast('Vui lòng chọn bài viết!', 'error');
      return;
    }

    // Anti-spam check: nếu có cảnh báo, hỏi trước
    const mode = $id('schedMode').value;
    const prog = $id('schedProg');
    const fill = $id('schedProgFill');
    const txt = $id('schedProgTxt');

    prog.style.display = 'block';
    fill.style.width = '20%';
    txt.textContent = '⏳ Đang lên lịch…';

    try {
      const res = await api('/schedule-posts', {
        method: 'POST',
        body: JSON.stringify({
          articleFiles: files,
          mode,
          force: false,
        }),
      });

      if (!res.success && res.canForce) {
        // Có cảnh báo anti-spam — hỏi user
        const confirmed = await new Promise(resolve => {
          showConfirm(
            `${res.spam.warnings.join('<br>')}\n\nBạn có muốn tiếp tục không?`,
            () => resolve(true),
            () => resolve(false)
          );
        });
        if (!confirmed) {
          prog.style.display = 'none';
          return;
        }
        // Retry with force
        const res2 = await api('/schedule-posts', {
          method: 'POST',
          body: JSON.stringify({
            articleFiles: files,
            mode,
            force: true,
          }),
        });
        return this._showResult(res2, files.length);
      }

      this._showResult(res, files.length);
    } catch {
      showToast('Lỗi lên lịch!', 'error');
      prog.style.display = 'none';
    }
  },

  _showResult(res, total) {
    const fill = $id('schedProgFill');
    const txt = $id('schedProgTxt');
    fill.style.width = '100%';

    if (res.success) {
      const ok = res.summary?.ok || 0;
      txt.textContent = `✅ Đã lên lịch ${ok}/${total} bài viết!`;
      showToast(`Hoàn thành lên lịch ${ok}/${total} bài!`);
      setTimeout(() => {
        $id('schedProg').style.display = 'none';
        fill.style.width = '0%';
        this.load(); // reload
      }, 1500);
    } else {
      txt.textContent = `❌ ${res.message || 'Lỗi lên lịch'}`;
      showToast(res.message || 'Lỗi', 'error');
    }
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },

  /** Refresh category dropdown from WP */
  async refreshCat(selId, siteId = null) {
    const sel = $id(selId);
    if (!sel) return;
    const btn = sel.nextElementSibling;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      let res;
      let url = '', username = '', appPassword = '';
      if (selId === 'sFormCategory') {
        url = $id('sFormUrl')?.value;
        username = $id('sFormUser')?.value;
        appPassword = $id('sFormPass')?.value;
      } else if (selId === 'sEditCategory') {
        url = $id('sEditUrl')?.value;
        username = $id('sEditUser')?.value;
        appPassword = $id('sEditPass')?.value;
      }

      if (url && username) {
        if (!appPassword && siteId) {
           res = await api(`/sites/${siteId}/categories`);
        } else {
           res = await api('/sites/test-categories', {
             method: 'POST',
             body: JSON.stringify({ url, username, appPassword })
           });
        }
      } else {
         res = await api('/categories');
      }

      if (res && res.success && Array.isArray(res.categories) && res.categories.length) {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">— Chưa phân loại —</option>' +
          res.categories.map(c => `<option value="${c.slug}"${c.slug === currentVal ? ' selected' : ''}>${c.name || c.slug}</option>`).join('');
        showToast('✅ Đã cập nhật ' + res.categories.length + ' danh mục từ WP');
      } else {
        showToast(res ? res.message || '❌ Không lấy được danh mục từ WP' : 'Lỗi lấy danh mục', 'error');
      }
    } catch {
      showToast('❌ Lỗi kết nối WP', 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
  },
};

/* ===================================================================
   SECTION 17 — Bootstrap (DOMContentLoaded)
   =================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  // Restore saved AI instruction
  const saved = localStorage.getItem('qtp_ai_instruction');
  const ta = $id('aiInstruction');
  if (saved && ta) ta.value = saved;
  // Auto-save on input
  if (ta) ta.addEventListener('input', () => {
    localStorage.setItem('qtp_ai_instruction', ta.value);
  });

  const logBtn = $id('logBtn');
  if (logBtn) logBtn.addEventListener('click', () => QTP.Auth.doLogin());

  // ── Bootstrap the app ──
  QTP.App.init();
});
