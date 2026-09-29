// Configuración PM2 para NEXUS API (Windows Server, producción).
//   Publicar / actualizar:  pm2 startOrReload ecosystem.config.js --env production
//   (o usa el script publicar.ps1, que valida + compila + arranca).
//
// El ambiente lo define APP_AMBIENTE: con "produccion" la app carga .env.production.
// El puerto NO se define aquí, sale de APP_PUERTO dentro de .env.production.
module.exports = {
  apps: [
    {
      name: 'nexus-api',
      script: 'dist/main.js',
      cwd: __dirname,
      // fork (no cluster): node-oracledb en modo Thick + un solo pool de conexiones.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // dotenv preload: @nestjs/config no carga .env.production por sí solo en producción.
      node_args: `-r ${__dirname}/node_modules/dotenv/config.js`,
      env: {
        APP_AMBIENTE: 'desarrollo',
      },
      env_production: {
        APP_AMBIENTE: 'produccion',
        DOTENV_CONFIG_PATH: `${__dirname}/.env.production`,
      },
      out_file: 'C:/logs/nexus/pm2-out.log',
      error_file: 'C:/logs/nexus/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
