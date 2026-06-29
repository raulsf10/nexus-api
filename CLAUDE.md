# NEXUS API

Backend del proyecto **NEXUS**. Reescritura web del cliente Java Swing TableroHK (Central de Información Sukarne) para gestión de permisos de informes. Convive con el sistema legacy: escribe en las MISMAS tablas Oracle y SQL Server, no migra schema.

## Stack

- **NestJS 10** + TypeScript 5 (strict).
- **Node.js 20 LTS**.
- **Oracle** vía `node-oracledb` en **modo Thick** (requiere Oracle Instant Client).
- **SQL Server** vía `mssql`.
- **Auth**: LDAP bind a Active Directory `gviz.com` + autorización contra `dwh_suka.dim_ci_admin` + JWT HS256 (8h, sin refresh).
- **Docs API**: Swagger en `/api/docs`, deshabilitado en producción.
- **Logs**: `pino` + `pino-roll` a `C:\logs\nexus\app-YYYY-MM-DD.log`. Solo se loguean errores, warnings, eventos de auth y operaciones de escritura. NO se loguean GETs.
- **Despliegue**: Windows Server + PM2. **NO Docker** bajo ninguna circunstancia.

## Reglas no negociables al modificar código

1. **Naming en español** para métodos, variables, propiedades, parámetros y carpetas. Ejemplos: `obtenerListadoInformes()`, `usuarioActual`. Acrónimos universales OK: DTO, JWT, LDAP, AD, API, BD, SP.
2. **Sufijos NestJS en inglés**: `*Controller`, `*Service`, `*Module`, `*Repository`, `*Guard`, `*Dto`, `*Strategy`. Estándar del framework.
3. **Comentarios mínimos**: solo el "por qué" no obvio. NO explicar lo que el código ya dice. NO bloques separadores. NO código comentado.
4. **NO tests** (Jest, Vitest, etc). Tampoco crear archivos `*.spec.ts`.
5. **NO Docker**, Dockerfile, ni docker-compose.
6. **SQL siempre con bind parameters** (`:nombre` en Oracle, `@nombre` en SQL Server). Nunca concatenación.
7. **TypeScript strict**: prohibido `any` implícito.
8. **Sin secretos hardcoded**: todo desde `.env` validado con Joi.

## Estructura

```
src/
├── main.ts
├── app.module.ts
├── configuracion/         # ConfigModule + validación Joi
├── base-datos/
│   ├── oracle/            # OracleService (ejecutar / ejecutarSp)
│   └── sql-server/        # SqlServerService (ejecutar)
├── comun/
│   ├── filtros/           # TodasExcepcionesFilter (global)
│   ├── interceptores/     # LogEscrituraInterceptor
│   ├── decoradores/       # @UsuarioActual, @RequiereModulo, @Publico
│   ├── excepciones/       # ExcepcionNegocio
│   ├── enums/             # CodigosError
│   └── logger/            # LoggerService (pino wrapper en español)
└── modulos/
    ├── autenticacion/     # LDAP + dim_ci_admin + JWT
    ├── usuarios/          # Búsqueda en dim_hk_usuarios
    ├── informes/          # Catálogo dim_veo
    └── carnet/            # Asignación dim_veo_carnet (dual-write)
```

## Cómo arrancar (dev)

```bash
npm install
npm run start:dev          # puerto 3000
# Swagger: http://localhost:3000/api/docs
```

## Variables de entorno relevantes

Ver `.env.example`. Las críticas:
- `ORACLE_LIB_DIR`: ruta del Oracle Instant Client (en dev: `C:\oracle\instantclient_23_0`). Si vacío, intenta modo Thin (rompe contra Oracle 11g).
- `AD_URL`: en dev con VPN externa usar `ldap://dccor02.gviz.com:389`. En prod dentro de red Sukarne `ldap://gviz.com:389`.
- `JWT_SECRETO`: cambiar SIEMPRE en producción.
- Contraseñas: NUNCA hacer commit del `.env.development` ni `.env.production`.

## Auth: flujo

1. Cliente envía `POST /api/autenticacion/iniciar-sesion` con `{ usuario, contrasena }`.
2. `LdapService` hace bind a `${usuario}@${AD_DOMINIO}` contra `AD_URL`. Si falla → 401 `CONTRASENA_INVALIDA`.
3. `AutenticacionRepository` consulta `SELECT modulo FROM dwh_suka.dim_ci_admin WHERE LOWER(usuario)=LOWER(:usuario)`. Si 0 filas → 403 `NO_AUTORIZADO`.
4. `UPDATE ... SET ultimo_acceso = SYSDATE` best-effort.
5. Emite JWT `{ usuario, modulos }` HS256 8h.
6. Cliente lo guarda en localStorage y lo manda en `Authorization: Bearer <token>`.

`JwtGuard` está registrado como `APP_GUARD` global → TODOS los endpoints requieren token, excepto los marcados con `@Publico()`.

## Dual-write Carnet (Oracle-first)

`CarnetService` orquesta los 4 cambios (agregar / actualizar activo / actualizar frecuencia / eliminar) en este orden:

1. **Oracle** vía SP `dwh_suka.SP_CI_CARNET(tipo, idInforme, skEmpleado, valor, fkveo, tabla)`:
   - tipo=1 INSERT
   - tipo=2 UPDATE (tabla 1=activo, 2=frecuencia)
   - tipo=3 DELETE
   - Si falla → throw, abortar operación.
2. **SQL Server** sobre `Gobierno.DIM_VEO_CARNET_SUKA`:
   - Si falla → `logger.advertencia(...)`, NO romper la respuesta. Reproceso manual.

**Oracle es la fuente de verdad**. SQL Server es mirror para otros consumidores y se prioriza menos.

## Decisiones técnicas importantes

- **Modo Thick obligatorio**: la BD de Sukarne es Oracle 11g; modo Thin de `node-oracledb` solo soporta ≥12.1. Activado en `OracleService.onModuleInit` cuando `ORACLE_LIB_DIR` está definido.
- **Sintaxis SQL compatible Oracle 11g**: NO usar `FETCH FIRST N ROWS ONLY` (sintaxis de 12c+). Usar `SELECT * FROM (...) WHERE ROWNUM <= N` con el `ORDER BY` DENTRO del subquery. Tampoco usar `OFFSET ... ROWS`, `LISTAGG WITHIN GROUP DISTINCT`, ni funciones JSON nativas — todas son ≥12c.
- **Sin ORM**: queries crudas + SPs. Mantener compatibilidad con el sistema Java legacy.
- **AD por LDAP bind, no Kerberos**: el Java legacy usa Kerberos vía `Krb5LoginModule`. En web simplificamos a LDAP bind con UPN format (`usuario@gviz.com`). Funcionalmente equivalente para validar credenciales.
- **Producción: mismo proceso back+front**: NestJS sirve `public/` (build de Angular) con `@nestjs/serve-static`. Una sola URL, una sola entrada PM2, sin CORS. En dev son 2 procesos.
- **Sin selector de ambiente en login**: el Java tenía dropdown `dwh_suka` / `dwh_test`. Web usa solo el esquema definido en `.env`. No es por usuario.

## Deploy producción (Windows Server)

```powershell
npm run build
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup    # auto-arranque al reiniciar Windows
```

- Puerto prod sugerido: **8080**.
- Asegurar que `C:\logs\nexus\` exista y tenga write permission.
- Oracle Instant Client en `C:\oracle\instantclient_XX_X` y `ORACLE_LIB_DIR` apuntando ahí.

## Pendientes conocidos (post-v1)

- Resto del menú del CIPanel legacy (Apertura, Accesos HK, Carga CI, Proyectos, RFC, Cortes, etc.).
- Refresh tokens si las sesiones de 8h se quedan cortas.
- Healthcheck endpoint para PM2 monitoring.
- Endpoint que liste frecuencias disponibles desde un catálogo en vez de DISTINCT sobre `dim_veo_carnet`.

## Tablas y SPs principales

| Tabla / SP | Propósito |
|---|---|
| `dwh_suka.dim_ci_admin` | Autorización del login. Columnas usuario, modulo, ultimo_acceso. |
| `dwh_suka.dim_hk_usuarios` | Catálogo de usuarios (sk_empleado, idempleado, descripcion, puesto). |
| `dwh_suka.dim_hk_usuarios_windows` | Mapeo posición ↔ usuario Windows. |
| `dwh_suka.dim_veo` | Catálogo de informes (sk_veo, dsnombrelargo). |
| `dwh_suka.dim_veo_carnet` | Asignación posición ↔ informe (fk_posicion, fk_veo, activo, frecuencia). |
| `Gobierno.DIM_VEO_CARNET_SUKA` (SQL Server) | Mirror de `dim_veo_carnet`. |
| `dwh_suka.SP_CI_CARNET` | INSERT/UPDATE/DELETE en `dim_veo_carnet`. |
