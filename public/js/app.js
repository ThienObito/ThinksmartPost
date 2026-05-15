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

/**
 * Generic API client — prepends /api, injects Bearer token,
 * parses JSON response.  One function for the entire app.
 * @param {string} path  — e.g. '/auth/login' (no /api prefix)
 * @param {object} [opts] — fetch options (method, body, etc.)
 * @returns {Promise<object>} parsed JSON
 */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('qtp_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { ...headers, ...opts.headers },
  });
  return res.json(); // always JSON (Express json() middleware)
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
      queue: 'Queue.load',
      wp: 'WP.load',
      users: 'Users.load',
      analytics: 'Analytics.load',
      notes: 'Notes.load',
      media: 'Media.load',
      library: 'Library.load',
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
    this.setUserInfo();
  },

  /** Populate sidebar user info */
  setUserInfo() {
    const u = QTP._user;
    if (!u) return;
    $id('userNm').textContent = u.fullName || u.username;
    $id('userAv').textContent = (u.fullName || u.username || 'U')[0].toUpperCase();
    $id('roleT').textContent = u.role || 'user';
    const navUsers = $id('nav-users');
    if (navUsers) navUsers.style.display = u.role === 'admin' ? 'flex' : 'none';
  },

  /** Load dashboard stats & recent articles */
  async loadDashboard() {
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
            '<div style="padding:24px;text-align:center;color:var(--color-muted);font-size:13px">Chưa có bài viết nào</div>';
          return;
        }
        container.innerHTML = recent
          .map(
            (a) => `
          <div class="recent-row" onclick="QTP.Articles.preview('${a.file}')">
            <div class="recent-dot ${a.published ? 'published' : 'draft'}"></div>
            <div class="recent-info">
              <div class="recent-title">${esc(a.title)}</div>
              <div class="recent-meta">${a.published ? 'Đã đăng' : 'Nháp'} · ${fmtDate(a.createdAt)}</div>
            </div>
            <span class="recent-status ${a.published ? 'pub' : 'drf'}">${a.published ? 'WP' : 'Draft'}</span>
          </div>`
          )
          .join('');
      }
    } catch {
      /* best-effort */
    }
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
}; // end QTP.Auth

/* ===================================================================
   SECTION 6 — QTP.Articles (Create / List / Preview / Delete / Publish)
   =================================================================== */

QTP.Articles = {
  /** Load all articles and render grid */
  async load() {
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
            <span class="article-status ${a.published ? 'pub' : 'drf'}">${a.published ? 'Published' : 'Draft'}</span>
          </div>
          <h3 class="article-title">${esc(a.title)}</h3>
          <p class="article-summary">${trunc(esc(a.summary ?? ''), 120)}</p>
          <div class="article-meta">
            <span><i class="far fa-calendar"></i> ${fmtDate(a.createdAt)}</span>
            ${a.images?.length ? `<span><i class="fas fa-image"></i> ${a.images.length}</span>` : ''}
            ${a.wpId ? '<span><i class="fas fa-globe"></i> WP</span>' : ''}
          </div>
          <div class="article-actions">
            <button onclick="QTP.Articles.preview('${a.file}')" class="btn btn-ghost btn-sm" title="Xem trước"><i class="fas fa-eye"></i></button>
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
    const category = $id('cat').value;
    const qty = parseInt($id('qty').value) || 1;

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
        const res = await api('/post-all', {
          method: 'POST',
          body: JSON.stringify({ files: [filename] }),
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
        body: JSON.stringify({ category: $id('cat').value }),
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
}; // end QTP.Articles

/* ===================================================================
   SECTION 7 — QTP.Templates (CRUD + AI Suggest + Search)
   =================================================================== */

QTP.Templates = {
  _editingId: null,
  _aiSuggestion: null,

  /** Fetch all templates and render */
  async load() {
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
      '<option value="">— No template —</option>' +
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
}; // end QTP.Templates

/* ===================================================================
   SECTION 8 — QTP.Queue (Publishing Queue)
   =================================================================== */

QTP.Queue = {
  _data: [],

  async load() {
    const cont = $id('qCont');
    cont.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Đang tải hàng đợi…</p></div>';

    try {
      const res = await api('/queue');
      if (res.success && Array.isArray(res.queue)) {
        this._data = res.queue;
        this._renderQueue(res.queue);
      } else {
        throw new Error();
      }
    } catch {
      cont.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--color-muted)">Lỗi tải hàng đợi</div>';
    }
  },

  _renderQueue(queue) {
    const cont = $id('qCont');
    if (!queue.length) {
      cont.innerHTML =
        '<div style="text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-clock" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Hàng đợi trống</div>';
      return;
    }
    cont.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${queue
          .map(
            (q) => `
          <div class="report-card">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:600;font-size:14px">${esc(q.filename || '')}</div>
                <div style="font-size:12px;color:var(--color-muted);margin-top:2px">${q.status || 'pending'} · ${fmtDate(q.createdAt)}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="article-status ${q.status === 'published' ? 'pub' : q.status === 'failed' ? 'drf' : 'draft'}">${q.status || 'pending'}</span>
                ${q.status === 'pending' ? `<button onclick="QTP.Queue._remove('${q.id}')" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)"><i class="fas fa-times"></i></button>` : ''}
              </div>
            </div>
            ${q.error ? `<div style="margin-top:8px;font-size:12px;color:var(--color-danger)">${esc(q.error)}</div>` : ''}
          </div>`
          )
          .join('')}
      </div>`;
  },

  showTab(tab) {
    $qa('.queue-tab').forEach((t) => t.classList.remove('queue-tab-active'));
    $q(`[data-qtap="${tab}"]`).classList.add('queue-tab-active');
    if (tab === 'queue') {
      $id('qCont').style.display = 'block';
      $id('reportCont').style.display = 'none';
    } else {
      $id('qCont').style.display = 'none';
      $id('reportCont').style.display = 'block';
      QTP.Report.show();
    }
  },

  _remove(id) {
    showConfirm('Xóa khỏi hàng đợi?', async () => {
      try {
        await api(`/queue/${id}`, { method: 'DELETE' });
        showToast('Đã xóa!');
        this.load();
      } catch {
        showToast('Lỗi!', 'error');
      }
    });
  },
}; // end QTP.Queue

/* ===================================================================
   SECTION 9 — QTP.Report (Sales Report)
   =================================================================== */

QTP.Report = {
  async show() {
    const cont = $id('reportCont');
    cont.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Đang tải báo cáo…</p></div>';

    try {
      const res = await api('/report/summary');
      if (!res.success || !res.report) throw new Error();

      const r = res.report;
      let html = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
          <div class="stat-card"><div class="stat-lbl">Tổng bài</div><div class="stat-val" style="font-size:24px;color:var(--color-accent)">${r.totalArticles}</div></div>
          <div class="stat-card"><div class="stat-lbl">Đã đăng</div><div class="stat-val" style="font-size:24px;color:#22c55e">${r.totalPublished}</div></div>
          <div class="stat-card"><div class="stat-lbl">Nháp</div><div class="stat-val" style="font-size:24px;color:var(--color-muted)">${r.totalDraft}</div></div>
          <div class="stat-card"><div class="stat-lbl">Có ảnh</div><div class="stat-val" style="font-size:24px;color:#3b82f6">${r.withImages}</div></div>
        </div>`;

      // Sale stats table
      if (r.saleStats?.length) {
        html += `
          <div class="glass-card" style="padding:0;overflow:hidden;margin-bottom:16px">
            <div style="padding:14px 20px;border-bottom:1px solid var(--color-border);font-weight:600;font-size:14px">Thống kê theo Sale</div>
            <table class="admin-table">
              <thead><tr><th>Sale</th><th>Tổng</th><th>Đã đăng</th><th>Nháp</th><th>Có ảnh</th></tr></thead>
              <tbody>
                ${r.saleStats
                  .map(
                    (s) => `
                  <tr>
                    <td><strong>${esc(s.fullName || s.username)}</strong></td>
                    <td>${s.total}</td>
                    <td style="color:#22c55e">${s.published}</td>
                    <td style="color:var(--color-muted)">${s.draft}</td>
                    <td style="color:#3b82f6">${s.withImages}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`;
      }

      // Top articles
      if (r.topArticles?.length) {
        html += `
          <div class="glass-card" style="padding:16px">
            <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Top bài viết</h3>
            ${r.topArticles
              .map(
                (a) => `
              <div class="report-row">
                <span class="report-label">${esc(a.title)}</span>
                <span class="report-value">${a.published === 'Yes' ? '✅' : '📝'} ${a.hasImages === 'Yes' ? '🖼️' : ''}</span>
              </div>`
              )
              .join('')}
          </div>`;
      }

      cont.innerHTML = html;
    } catch {
      cont.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--color-danger)">Lỗi tải báo cáo</div>';
    }
  },
}; // end QTP.Report

/* ===================================================================
   SECTION 10 — QTP.WP (WordPress Posts Management)
   =================================================================== */

QTP.WP = {
  async load() {
    const cont = $id('wpCont');
    cont.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Đang tải từ WordPress…</p></div>';

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
          ${posts
            .map(
              (p) => `
            <div class="report-card">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:14px">${esc(p.title?.rendered || 'Untitled')}</div>
                  <div style="font-size:11px;color:var(--color-muted);margin-top:2px">${fmtDate(p.date)}</div>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0">
                  <a href="${p.link || '#'}" target="_blank" class="btn btn-ghost btn-sm"><i class="fas fa-external-link-alt"></i></a>
                  <button onclick="QTP.WP.edit(${p.id})" class="btn btn-ghost btn-sm"><i class="fas fa-edit"></i></button>
                  <button onclick="QTP.WP.del(${p.id})" class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            </div>`
            )
            .join('')}
        </div>`;
    } catch {
      cont.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--color-danger)">Lỗi tải bài viết WordPress</div>';
    }
  },

  edit(postId) {
    const title = prompt('Tiêu đề mới:');
    if (title?.trim()) {
      api(`/wp-posts/${postId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: title.trim() }),
      })
        .then((r) => {
          if (r.success) {
            showToast('Đã cập nhật!');
            this.load();
          } else {
            showToast('Lỗi!', 'error');
          }
        })
        .catch(() => showToast('Lỗi kết nối!', 'error'));
    }
  },

  del(postId) {
    showConfirm('Xóa bài viết khỏi WordPress?', async () => {
      try {
        await api(`/wp-posts/${postId}`, { method: 'DELETE' });
        showToast('Đã xóa!');
        this.load();
      } catch {
        showToast('Lỗi!', 'error');
      }
    });
  },
}; // end QTP.WP

/* ===================================================================
   SECTION 11 — QTP.Users (Admin User Management)
   =================================================================== */

QTP.Users = {
  _editingId: null,
  _users: [],

  async load() {
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
                <td><strong>${esc(u.fullName || u.username)}</strong></td>
                <td>${esc(u.username)}</td>
                <td><span class="article-status ${u.role === 'admin' ? 'pub' : 'draft'}">${u.role}</span></td>
                <td><span style="color:${u.status === 'active' ? '#22c55e' : '#ef4444'};font-size:12px">${u.status || 'active'}</span></td>
                <td style="font-size:12px;color:var(--color-muted)">${fmtDate(u.createdAt)}</td>
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
}; // end QTP.Users

/* ===================================================================
   SECTION 12 — QTP.Settings (API Keys Configuration)
   =================================================================== */

QTP.Settings = {
  load() {
    const keys = JSON.parse(localStorage.getItem('qtp_settings') || '{}');
    $id('sDK').value = keys.deepseek || '';
    $id('sRepl').value = keys.replicate || '';
    $id('sWpUrl').value = keys.wpUrl || 'https://thinksmart.vn';
    $id('sWpPass').value = keys.wpPass || '';
  },

  save() {
    const settings = {
      deepseek: $id('sDK').value.trim(),
      replicate: $id('sRepl').value.trim(),
      wpUrl: $id('sWpUrl').value.trim(),
      wpPass: $id('sWpPass').value.trim(),
    };
    localStorage.setItem('qtp_settings', JSON.stringify(settings));
    showToast(
      'Đã lưu cài đặt! Settings được lưu local — cần config .env trên server để生效',
      'warning'
    );
  },
}; // end QTP.Settings

/* ===================================================================
   SECTION 13 — QTP.Analytics (Smart Analytics Dashboard)
   =================================================================== */

QTP.Analytics = {
  _data: {},

  async load() {
    const days = parseInt($id('analyticsPeriod').value) || 30;

    try {
      const overview = await api(`/analytics/overview?days=${days}`);
      if (overview.success) {
        const o = overview.overview;
        $id('anTotalViews').textContent = o.totalViewsFormatted || '—';
        $id('anTotalVisitors').textContent = o.totalVisitorsFormatted || '—';
        $id('anEngagement').textContent = (o.avgEngagementScore ?? 0) + '%';
        $id('anBounce').textContent = (o.avgBounceRate ?? 0) + '%';

        if (overview.trafficHistory?.length) {
          this._renderChart(overview.trafficHistory);
        }

        const topCont = $id('anTopArticles');
        if (overview.topArticles?.length) {
          topCont.innerHTML = overview.topArticles
            .map(
              (a) => `
            <div class="report-row">
              <span class="report-label">${trunc(esc(a.title ?? ''), 40)}</span>
              <span class="report-value">${(a.metrics.views ?? 0).toLocaleString()} views</span>
            </div>`
            )
            .join('');
        } else {
          topCont.innerHTML =
            '<div style="font-size:12px;color:var(--color-muted);padding:12px">Chưa có dữ liệu</div>';
        }

        if (overview.allMetrics) {
          $id('anArticlesCount').textContent = `${overview.allMetrics.length} articles`;
          $id('anArticlesTable').innerHTML = `
            <table class="admin-table">
              <thead><tr><th>Title</th><th>Views</th><th>Bounce</th><th>Engage</th></tr></thead>
              <tbody>
                ${overview.allMetrics
                  .slice(0, 20)
                  .map(
                    (a) => `
                  <tr>
                    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${trunc(esc(a.title ?? ''), 50)}</td>
                    <td>${(a.metrics.views ?? 0).toLocaleString()}</td>
                    <td>${a.metrics.bounceRate ?? 0}%</td>
                    <td>${a.metrics.engagementScore ?? 0}%</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`;
        }
      }
    } catch {
      /* best-effort */
    }

    // Pre-fetch other tabs data
    try {
      this._data.keywords = await api('/analytics/keywords');
    } catch {}
    try {
      this._data.gap = await api('/analytics/gap-analysis');
    } catch {}
    try {
      this._data.roi = await api('/analytics/roi');
    } catch {}

    this.showTab('performance');
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

  /* ── Chart ── */

  _renderChart(history) {
    const canvas = $id('trafficChart');
    if (!canvas) return;
    if (QTP._analyticsChart) QTP._analyticsChart.destroy();

    const ctx = canvas.getContext('2d');
    QTP._analyticsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: history.map((h) => {
          const d = h.date.split('-');
          return d[2] + '/' + d[1];
        }),
        datasets: [
          {
            label: 'Views',
            data: history.map((h) => h.views),
            borderColor: '#ed6918',
            backgroundColor: 'rgba(237,105,24,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
          },
          {
            label: 'Visitors',
            data: history.map((h) => h.visitors),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.05)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#52525b', font: { size: 10 }, maxTicksLimit: 10 },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#52525b', font: { size: 10 } },
          },
        },
      },
    });
  },

  /* ── Keywords Tab ── */

  _renderKeywords(data) {
    if (!data) return;
    $id('anKwCount').textContent = `${data.totalKeywords || 0} keywords`;

    if (data.tracked) {
      $id('anKeywordsTable').innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Keyword</th><th>Volume</th><th>Diff</th><th>Trend</th></tr></thead>
          <tbody>
            ${data.tracked
              .map(
                (k) => `
              <tr>
                <td>${esc(k.keyword)}</td>
                <td>${(k.volume || 0).toLocaleString()}</td>
                <td><span style="color:${(k.difficulty || 0) > 50 ? '#ef4444' : '#22c55e'}">${k.difficulty || 0}</span></td>
                <td style="color:${k.trend === 'up' ? '#22c55e' : k.trend === 'down' ? '#ef4444' : '#f59e0b'}">${k.trend || 'stable'}</td>
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
              `<div class="report-row"><span class="report-label">${esc(k.keyword)}</span><span style="color:#22c55e">↑ ${(k.volume || 0).toLocaleString()}</span></div>`
          )
          .join('') ||
        '<div style="font-size:12px;color:var(--color-muted)">Chưa có dữ liệu</div>';
    }

    if (data.topRankingPages) {
      $id('anRankingPages').innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Keyword</th><th>Position</th><th>Volume</th></tr></thead>
          <tbody>
            ${data.topRankingPages
              .map(
                (p) => `
              <tr>
                <td>${esc(p.keyword)}</td>
                <td>#${p.currentPosition || '?'}</td>
                <td>${(p.volume || 0).toLocaleString()}</td>
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
    $id('anGapCount').textContent = `${data.totalOpportunities || 0} opportunities`;
    $id('anGapEstTraffic').textContent = (data.estimatedTrafficGain || 0).toLocaleString();

    if (data.gaps) {
      $id('anGapList').innerHTML = data.gaps
        .map(
          (g) => `
        <div class="report-row">
          <span class="report-label">${esc(g.topic)}</span>
          <span style="font-size:12px;color:${g.opportunity === 'Cao' ? '#22c55e' : g.opportunity === 'Trung bình' ? '#f59e0b' : '#ef4444'}">${g.opportunity || ''}</span>
        </div>`
        )
        .join('');
    }

    if (data.covered) {
      $id('anCoveredList').innerHTML = data.covered
        .map(
          (c) =>
            `<div class="report-row"><span class="report-label">${esc(c.topic || c)}</span><span style="color:#22c55e">✅</span></div>`
        )
        .join('');
    }

    if (data.competitorDomains) {
      $id('anCompetitorList').innerHTML = data.competitorDomains
        .map(
          (d) =>
            `<div style="padding:8px 14px;border-radius:8px;background:var(--color-card-2);border:1px solid var(--color-border);font-size:12px">${esc(d)}</div>`
        )
        .join('');
    }
  },

  /* ── ROI Tab ── */

  _renderROI(data) {
    if (!data) return;
    $id('anHoursSaved').textContent = data.hoursSaved ? data.hoursSaved.toLocaleString() + 'h' : '—';
    $id('anMoneySaved').textContent = data.moneySaved ? (data.moneySaved / 1_000_000).toFixed(1) + 'M' : '—';
    $id('anQualityScore').textContent = data.qualityScore ? data.qualityScore + '/100' : '—';
    $id('anROI').textContent = data.roi ? data.roi.toFixed(0) + '%' : '—';
    $id('anQualityNum').textContent = (data.qualityScore ?? 0) + '/100';
    $id('anQualityBar').style.width = Math.min(100, data.qualityScore ?? 0) + '%';

    if (data.beforeAfter) {
      const b = data.beforeAfter;
      $id('anBeforeMetrics').innerHTML = `
        <div class="report-row"><span class="report-label">Thời gian/bài</span><span class="report-value">${b.before.timePerArticle} phút</span></div>
        <div class="report-row"><span class="report-label">SL/tháng</span><span class="report-value">${b.before.monthlyOutput} bài</span></div>`;
      $id('anAfterMetrics').innerHTML = `
        <div class="report-row"><span class="report-label">Thời gian/bài</span><span class="report-value" style="color:#22c55e">${b.after.timePerArticle} phút</span></div>
        <div class="report-row"><span class="report-label">SL/tháng</span><span class="report-value" style="color:#22c55e">${b.after.monthlyOutput} bài</span></div>`;
    }
  },
}; // end QTP.Analytics

/* ===================================================================
   SECTION 14 — QTP.Media (AI Image Library)
   =================================================================== */

QTP.Media = {
  async load() {
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
          a.images.forEach((img) => allImages.push({ url: img, title: a.title }));
        }
        if (a.thumbnail) allImages.push({ url: a.thumbnail, title: a.title + ' (thumb)' });
      });

      if (!allImages.length) {
        cont.innerHTML =
          '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--color-muted)"><i class="fas fa-images" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px"></i>Chưa có ảnh. Dùng "Tạo ảnh AI" từ bài viết.</div>';
        return;
      }

      cont.innerHTML = allImages
        .slice(0, 50)
        .map(
          (img) => `
        <div class="img-cell" onclick="window.open('${img.url}','_blank')">
          <img src="${esc(img.url)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
        </div>`
        )
        .join('');
    } catch {
      cont.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-danger)">Lỗi tải thư viện ảnh</div>';
    }
  },

  refresh() {
    this.load();
  },
}; // end QTP.Media

/* ===================================================================
   SECTION 15 — QTP.Notes (Sticky Notes)
   =================================================================== */

QTP.Notes = {
  _colors: [],

  async load() {
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
}; // end QTP.Library

/* ===================================================================
   SECTION 17 — QTP.Chat (AI Assistant Floating Chat)
   =================================================================== */

QTP.Chat = {
  _open: false,

  toggle() {
    this._open = !this._open;
    $id('chatPanel').classList.toggle('open', this._open);
    if (this._open) {
      $id('chatInput').focus();
      this._scrollDown();
    }
  },

  onKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  },

  async send() {
    const input = $id('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const msgs = $id('chatMsgs');
    msgs.innerHTML += `<div class="cp-msg cp-user"><div class="cp-msg-bubble">${esc(msg)}</div></div>`;

    const typing = document.createElement('div');
    typing.className = 'cp-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(typing);
    this._scrollDown();

    try {
      const res = await api('/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
      typing.remove();
      msgs.innerHTML +=
        `<div class="cp-msg cp-bot"><div class="cp-msg-avatar"><i class="fas fa-robot"></i></div><div class="cp-msg-bubble">${esc(res.reply || 'Xin lỗi, tôi chưa có câu trả lời.')}</div></div>`;
    } catch {
      typing.remove();
      msgs.innerHTML +=
        '<div class="cp-msg cp-bot"><div class="cp-msg-avatar"><i class="fas fa-robot"></i></div><div class="cp-msg-bubble">❌ Lỗi kết nối, vui lòng thử lại.</div></div>';
    }
    this._scrollDown();
  },

  _scrollDown() {
    const msgs = $id('chatMsgs');
    requestAnimationFrame(() => {
      msgs.scrollTop = msgs.scrollHeight;
    });
  },
}; // end QTP.Chat

/* ===================================================================
   SECTION 17 — Bootstrap (DOMContentLoaded)
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // ── Inject dynamic component styles ──
  const style = document.createElement('style');
  style.textContent = `
    /* ── Article Cards ── */
    .article-card{background:var(--glass-bg);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));border:var(--glass-border);border-radius:var(--radius-card-lg);box-shadow:var(--glass-shadow);padding:18px;transition:all 0.3s ease}
    .article-card:hover{border-color:rgba(237,105,24,0.15);transform:translateY(-2px)}
    .article-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .article-cat{font-size:11px;padding:3px 10px;border-radius:999px;background:rgba(237,105,24,0.1);color:var(--color-accent);font-weight:500}
    .article-status{font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px}
    .article-status.pub{background:rgba(34,197,94,0.1);color:#22c55e}
    .article-status.drf{background:rgba(239,68,68,0.1);color:#ef4444}
    .article-status.draft{background:rgba(245,158,11,0.1);color:#f59e0b}
    .article-title{font-size:15px;font-weight:700;line-height:1.4;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .article-summary{font-size:12px;color:var(--color-sub);line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .article-meta{display:flex;gap:12px;font-size:11px;color:var(--color-muted);margin-bottom:12px}
    .article-actions{display:flex;gap:6px}
    .create-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}

    /* ── Section Header ── */
    .section-header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:28px}
    .section-title{font-size:26px;font-weight:800;letter-spacing:-.4px;background:linear-gradient(180deg,var(--color-text),rgba(248,250,252,0.8));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .section-subtitle{color:var(--color-sub);font-size:14px;margin-top:4px;font-weight:400}
    .section-actions{display:flex;gap:10px;align-items:center}

    /* ── Recent Articles ── */
    .recent-list{display:flex;flex-direction:column}
    .recent-row{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.2s;cursor:pointer}
    .recent-row:hover{background:rgba(255,255,255,0.02)}
    .recent-row:last-child{border-bottom:none}
    .recent-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .recent-dot.published{background:#22c55e}
    .recent-dot.draft{background:#f59e0b}
    .recent-info{flex:1;min-width:0}
    .recent-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .recent-meta{font-size:11px;color:var(--color-muted);margin-top:2px}
    .recent-status{font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px}
    .recent-status.pub{background:rgba(34,197,94,0.1);color:#22c55e}
    .recent-status.drf{background:rgba(245,158,11,0.1);color:#f59e0b}
    .recent-header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.04)}
    .loading-state{display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 0;color:var(--color-sub);font-size:13px}

    /* ── Suggest Items ── */
    .suggest-item{padding:16px;border-radius:12px;background:var(--color-card-2);border:1px solid var(--color-border);margin-bottom:10px;cursor:pointer;transition:all 0.2s}
    .suggest-item:hover{border-color:rgba(237,105,24,0.2);background:rgba(237,105,24,0.03)}
    .suggest-topic{font-weight:600;font-size:15px;margin-bottom:4px}
    .suggest-reason{font-size:12px;color:var(--color-sub);margin-bottom:8px}
    .suggest-tags{display:flex;gap:8px;align-items:center}
    .suggest-tag{font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(237,105,24,0.1);color:var(--color-accent)}
    .suggest-score{font-size:11px;color:var(--color-muted)}

    /* ── Notes ── */
    .note-card{border-radius:12px;padding:16px;min-height:100px;display:flex;flex-direction:column;box-shadow:0 4px 12px rgba(0,0,0,0.1);transition:transform 0.2s,box-shadow 0.2s}
    .note-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.15)}
    .note-content[contenteditable]:focus{background:rgba(0,0,0,0.05);border-radius:4px;padding:4px;margin:-4px}
    .notes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
    .notes-toolbar{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .notes-search-wrap{position:relative;flex:1;min-width:200px}
    .notes-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--color-muted);font-size:14px}
    .notes-search-input{padding-left:36px!important}
    .notes-color-filter{display:flex;gap:6px;align-items:center}
    .notes-color-btn{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:all 0.2s;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center}
    .notes-color-btn:hover{transform:scale(1.15)}
    .notes-color-btn-active{border-color:var(--color-accent)!important;box-shadow:0 0 0 2px var(--color-accent)}
    .notes-color-btn[data-color="all"]{background:var(--color-card-2);border-color:var(--color-border);color:var(--color-sub)}

    /* ── Media grid ── */
    .media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
    .img-cell{position:relative;border-radius:10px;overflow:hidden;border:2px solid transparent;cursor:pointer;transition:all 0.2s;aspect-ratio:16/9}
    .img-cell:hover{transform:scale(1.03)}
    .img-cell.selected{border-color:var(--color-accent);box-shadow:0 0 0 2px var(--color-accent),0 0 20px rgba(237,105,24,0.2)}
    .img-cell img{width:100%;height:100%;object-fit:cover}
    .img-cell .check{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:var(--color-accent);color:#fff;display:none;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
    .img-cell.selected .check{display:flex}

    /* ── Queue tabs ── */
    .queue-tabs{display:flex;gap:4px;margin-bottom:16px;background:var(--color-card-2);border-radius:10px;padding:4px;width:fit-content}
    .queue-tab{padding:8px 18px;border:none;border-radius:8px;background:transparent;color:var(--color-sub);cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;transition:all 0.2s}
    .queue-tab-active{background:var(--color-accent);color:#fff!important;box-shadow:0 2px 8px rgba(237,105,24,0.2)}

    /* ── Analytics ── */
    .analytics-tabs{display:flex;gap:4px;flex-wrap:wrap}
    .analytics-tab{padding:8px 14px;border:none;border-radius:8px;background:var(--color-card-2);color:var(--color-sub);cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;display:flex;align-items:center;gap:6px;transition:all 0.2s}
    .analytics-tab-active{background:var(--color-accent);color:#fff!important}
    .analytics-period-select{appearance:auto;width:auto;padding:6px 10px;font-size:12px}
    .analytics-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .analytics-card-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}
    .quality-bar-track{height:8px;border-radius:4px;background:var(--color-border);overflow:hidden}
    .quality-bar-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#f59e0b,#22c55e);transition:width 0.8s ease}
    .skeleton-line{height:14px;border-radius:4px;background:linear-gradient(90deg,var(--color-card-2) 25%,var(--color-card-3) 50%,var(--color-card-2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}

    /* ── Report ── */
    .report-card{background:var(--glass-bg);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));border:var(--glass-border);border-radius:var(--radius-card-lg);box-shadow:var(--glass-shadow);padding:16px}
    .report-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-card-2);font-size:13px}
    .report-row:last-child{border-bottom:none}
    .report-label{color:var(--color-sub)}
    .report-value{color:var(--color-text);font-weight:600}
    .admin-table{width:100%;border-collapse:separate;border-spacing:0 4px}
    .admin-table th{padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--color-muted);text-transform:uppercase}
    .admin-table td{padding:10px 14px;font-size:13px;background:rgba(255,255,255,0.03)}
    .admin-table tr td:first-child{border-radius:8px 0 0 8px}
    .admin-table tr td:last-child{border-radius:0 8px 8px 0}
    .admin-table tr:hover td{background:rgba(255,255,255,0.04)}

    /* ── Image place buttons ── */
    .img-place-btn{padding:6px 14px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid var(--color-border);color:var(--color-sub);cursor:pointer;font-size:12px;font-weight:500;transition:all 0.2s}
    .img-place-btn.active,.img-place-btn:hover{border-color:rgba(237,105,24,0.2);color:var(--color-accent);background:rgba(237,105,24,0.06)}
    .img-suggestions{display:none;gap:6px;flex-wrap:wrap}
    .img-suggestion-chip{cursor:pointer;padding:8px 12px;border-radius:8px;background:var(--color-card-2);border:1px solid var(--color-border);font-size:12px;color:var(--color-sub);transition:all 0.2s}
    .img-suggestion-chip:hover{border-color:rgba(237,105,24,0.3);color:var(--color-text)}
    .glass-card{background:var(--glass-bg);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));border:var(--glass-border);border-radius:var(--radius-card-lg);box-shadow:var(--glass-shadow)}

    /* ── Library / Media Manager ── */
    .lib-folder-tab{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;border-radius:8px;background:var(--color-card-2);color:var(--color-sub);cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;transition:all 0.2s;white-space:nowrap}
    .lib-folder-tab:hover{color:var(--color-text);background:var(--color-card-3)}
    .lib-folder-tab.active,.lib-folder-group.active .lib-folder-tab{background:var(--color-accent);color:#fff!important;box-shadow:0 2px 8px rgba(237,105,24,0.2)}
    .lib-folder-group{display:inline-flex;align-items:center;gap:2px;background:var(--color-card-2);border-radius:8px;overflow:hidden}
    .lib-folder-group .lib-folder-tab{border-radius:8px 0 0 8px}
    .lib-folder-edit,.lib-folder-del{width:28px;height:100%;border:none;background:transparent;color:var(--color-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;padding:0;transition:all 0.2s}
    .lib-folder-edit:hover{color:var(--color-accent);background:rgba(237,105,24,0.08)}
    .lib-folder-del:hover{color:#ef4444;background:rgba(239,68,68,0.08)}
    .lib-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;font-size:10px;font-weight:600;background:rgba(255,255,255,0.15);color:inherit;margin-left:2px}
    .img-cell{position:relative;border-radius:10px;overflow:hidden;border:2px solid transparent;cursor:pointer;transition:all 0.2s;aspect-ratio:16/9}
    .img-cell:hover{transform:scale(1.03);border-color:rgba(237,105,24,0.2)}
    .img-cell img{width:100%;height:100%;object-fit:cover}
    .img-cell-overlay{position:absolute;bottom:0;left:0;right:0;padding:6px;background:linear-gradient(transparent,rgba(0,0,0,0.6));display:flex;justify-content:center;opacity:0;transition:opacity 0.2s;color:#fff;font-size:13px}
    .img-cell:hover .img-cell-overlay{opacity:1}
  `;
  document.head.appendChild(style);

  // ── Bootstrap the app ──
  QTP.App.init();
});
