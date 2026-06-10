module.exports = {
  apps: [
    {
      name: 'abd-gestion-backend',
      script: './server.js',
      instances: 'max', // Utilise tous les coeurs du CPU pour zéro ralentissement
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
