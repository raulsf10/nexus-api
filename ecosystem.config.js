// APP_PUERTO y los destinatarios se leen de .env.production en cada arranque.
module.exports = {
  apps: [
    {
      name: 'nexus-api',
      script: 'dist/main.js',
      cwd: __dirname,
      // Una sola instancia para los pools y el procesamiento de pendientes SLA.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        APP_AMBIENTE: 'desarrollo',
        NODE_ENV: 'development',
      },
      env_production: {
        APP_AMBIENTE: 'produccion',
        NODE_ENV: 'production',
      },
      out_file: 'C:/logs/nexus/pm2-out.log',
      error_file: 'C:/logs/nexus/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
