AutoContentPoster/
├── api/
│   ├── admin.js              # Quản lý users (CRUD, roles)
│   ├── analytics.js          # Analytics dashboard (cache-first)
│   ├── auth.js               # Login/Register/Me
│   ├── chat.js               # AI Chat nội bộ
│   ├── create-article.js     # Tạo bài viết AI (Gemini)
│   ├── generate-image.js     # Sinh ảnh AI (Replicate Flux)
│   ├── library.js            # Media Library CRUD
│   ├── notes.js              # Sticky notes CRUD
│   ├── queue.js              # Queue đăng bài tự động
│   ├── report.js             # Báo cáo thống kê
│   ├── schedule-posts.js     # Lên lịch đăng WP
│   ├── sites.js              # Multi-site WP management
│   ├── suggest-topics.js     # Gợi ý chủ đề AI
│   ├── templates.js          # Template CRUD + AI Suggest
│   └── usage.js              # API Usage tracker endpoint
├── db/
│   ├── database.js           # SQLite cache (analytics)
│   └── sites.js              # Multi-site storage (encrypted)
├── middleware/
│   └── auth.js               # JWT auth middleware
├── public/
│   ├── dist/style.css        # Tailwind CSS build
│   ├── src/style.css         # Tailwind input
│   ├── index.html            # Full SPA dashboard
│   └── js/app.js             # Frontend logic (~4000 dòng)
├── scripts/
│   ├── rebuild_library.js    # Tool rebuild library
│   └── sync-analytics.js     # Tool đồng bộ analytics
├── utils/
│   ├── ai-client.js          # Gemini API wrapper
│   ├── api-tracker.js        # Đếm usage API
│   ├── google-api.js         # GA4 + GSC client
│   ├── index.js              # Shared utils (sanitize, wpAuth...)
│   └── smart-scheduler.js    # Lịch đăng thông minh
├── server.js                 # Entry point + routes
├── package.json
├── .env                      # API keys (ignored by git)
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── railway.json
├── ecosystem.config.js       # PM2 config
└── start.bat                 # Windows 1-click start
