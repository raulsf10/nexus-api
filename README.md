# NEXUS API

Backend del sistema NEXUS para la gestión de permisos de informes en Sukarne.
Reescritura web del cliente Java Swing legacy *TableroHK*.

## Requisitos previos

- Node.js 20 LTS o superior.
- Oracle Instant Client instalado en el servidor (para `oracledb`).
- Acceso a la red interna de Sukarne (Active Directory `gviz.com`, Oracle `dwh_suka`, SQL Server `Gobierno`).
- PM2 instalado globalmente en el servidor de producción (`npm install -g pm2`).

## Instalación

```bash
npm install
```

## Variables de entorno

1. Copiar `.env.example` a `.env.development`.
2. Llenar las contraseñas vacías (`ORACLE_CONTRASENA`, `SQLSERVER_CONTRASENA`) con las credenciales locales.
3. Para producción, crear un `.env.production` aparte con `APP_PUERTO=8080` y `APP_AMBIENTE=produccion`.

## Desarrollo

```bash
npm run start:dev
```

La API queda disponible en `http://localhost:3000/api`.
Swagger en `http://localhost:3000/api/docs` (deshabilitado en producción).

## Build

```bash
npm run build
```

Los artefactos se generan en `dist/`.

## Producción con PM2

```bash
pm2 start ecosystem.config.js --env production
```

Puerto por defecto en producción: `8080`. El mismo proceso sirve los estáticos del frontend Angular desde `public/`.

### Comandos PM2 útiles

```bash
pm2 logs nexus-api
pm2 restart nexus-api
pm2 stop nexus-api
pm2 save
```

## Estructura del proyecto

```
src/
├── main.ts                  Bootstrap de la app
├── app.module.ts            Módulo raíz
├── configuracion/           Carga y validación de variables de entorno
├── base-datos/              Conexiones Oracle y SQL Server
├── comun/                   Filtros, interceptores, decoradores, logger
└── modulos/                 Módulos de negocio
    ├── autenticacion/       Login LDAP + JWT
    ├── usuarios/            Administración de usuarios
    ├── informes/            Catálogo y permisos de informes
    └── carnet/              Gestión de carnet (dual-write Oracle + SQL Server)
```
