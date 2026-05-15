module.exports = {
  apps: [{
    name: 'QTPosterPro',
    script: 'server.js',
    cwd: './',
    env: {
      NODE_ENV: 'production',
    },
    env_file: '.env',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],
};
