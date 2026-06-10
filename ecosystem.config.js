module.exports = {
  apps: [{
    name: "abd-gestion-backend",
    script: "./server.js",
    cwd: "./backend",
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "1G",
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
}
