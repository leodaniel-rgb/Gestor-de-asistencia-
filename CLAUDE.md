@AGENTS.md

# Gestor de asistencia VIVE: guía para agentes

Portal de asistencia del área VIVE de la Universidad Tecmilenio, campus San Luis Potosí: selecciones, talleres y gimnasio. Es un proyecto de servicio social **sin presupuesto** (solo servicios gratuitos) y está en piloto con **datos reales de alumnos**.

Responde siempre en **español**. Este archivo resume las reglas. El detalle y el porqué de cada decisión están en:

- [docs/plan.md](docs/plan.md): alcance, decisiones y fases
- [docs/supabase.md](docs/supabase.md): migraciones, pruebas SQL y registro de lo aplicado
- [docs/diseno.md](docs/diseno.md): sistema de diseño
- [docs/arranque-piloto.md](docs/arranque-piloto.md) y [docs/instalar-app.md](docs/instalar-app.md): operación
- [SECURITY.md](SECURITY.md) y [CONTRIBUTING.md](CONTRIBUTING.md)

Si cambias una regla o decisión, actualiza este archivo **y** `docs/plan.md` en la misma rama.

## Reglas de trabajo (obligatorias)

- **Plan antes de código.** Propón un plan, discute los pros y contras como colega, da tu recomendación y espera **aprobación explícita**. Si el usuario aprueba sin haber visto el plan, muéstraselo primero.
- **Evalúa críticamente lo que se pide**: el usuario puede equivocarse. Consulta fuentes oficiales (documentación de Supabase, Vercel y Next.js, GitHub Advisories, npm). **Nunca inventes resultados**: si no pudiste probar algo, dilo.
- **Git: el agente NO hace commit, push ni merge.** Escribe el código y le da al usuario los comandos en bloques `bash`, uno por bloque.
  - Una rama por mejora (`feature/…`, `fix/…`, `chore/…`, `docs/…`), creada desde `main` actualizado: `git switch main` → `git pull --ff-only` → `git switch -c …`.
  - Nunca `git push --force` a `main`.
  - Mensajes en Conventional Commits, en español.
  - Si no aparece el botón de PR: `https://github.com/leodaniel-rgb/Gestor-de-asistencia-/compare/main...<rama>?expand=1`.
- **Prioridad máxima: seguridad, integridad de datos y secretos.**
  - Nunca pidas ni pegues llaves en el chat.
  - Nunca subas `.env*` (salvo `.env.example`) ni datos reales de alumnos: tampoco respaldos, Excel o capturas con nombres o matrículas.
- **Solo pnpm** (versión fijada en `packageManager`). Nunca npm ni yarn.
  - Antes de agregar una dependencia, revisa su versión, mantenimiento y vulnerabilidades (`npm view`, GitHub Advisories).
  - `pnpm audit --prod` debe quedar en 0.
  - Única alerta conocida y aceptada: `braces` (GHSA-vfj7-8cjw-p6xm), en la cadena de desarrollo de `eslint-config-next`. No tiene parche.
- **Limpieza.** Las pruebas desechables van en la carpeta temporal del agente, nunca en el repo. Borra las herramientas temporales que descargues.
- **Finales de línea CRLF.** Si editas con scripts, consérvalos.

### "Terminado" significa

1. Plan aprobado.
2. Código, migración y pruebas SQL si aplican.
3. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
4. Revisión en el navegador del panel si cambia la UI. `.claude/launch.json` corre `pnpm start` después del build. Las rutas protegidas exigen sesión: para revisar componentes visuales, usa una página temporal con datos ficticios y **bórrala antes del commit**.
5. Documentación actualizada (`docs/plan.md` y `docs/supabase.md`).
6. Comandos de git para el usuario.
7. Pasos de prueba en vive-dev y el orden para producción.
8. Decir claramente qué se probó y qué no.

## Stack y arquitectura

- **Next.js 16 (App Router, `cacheComponents`) + React 19 + TypeScript estricto + Tailwind v4.** Lee la guía de `node_modules/next/dist/docs/` antes de escribir código (ver `AGENTS.md`).
  - Se usa `proxy.ts`, no middleware.
  - Todo acceso a cookies o sesión va dentro de `<Suspense>`.
  - Los parámetros llegan como `PageProps<…>` / `LayoutProps<…>` con promesas.
  - En las Server Actions se usa `refresh()` de `next/cache`.
  - React Compiler está activo: no uses `useMemo` manual ni `Date.now()` dentro de componentes. Usa los helpers de `src/lib/fechas.ts`.
- **Supabase** (Postgres + Auth + RLS) con dos proyectos gratuitos:
  - `vive-dev`: solo datos **ficticios**; pruebas y vistas previas.
  - `vive-prod`: datos reales.
  - Las llaves son `sb_publishable_…` y `sb_secret_…`.
- **Vercel Hobby.** Producción: `https://gestor-de-asistencia-gold.vercel.app`.
  - Production usa vive-prod. **Preview usa vive-dev, nunca producción.**
  - Cron diario `/api/cron/mantener-activo` (`vercel.json`), protegido con `CRON_SECRET`.
- **Librerías:** `@supabase/ssr`, `zod` v4, `vitest`, `echarts` (importación modular en `src/components/graficas/echarts.ts`), `read-excel-file` (lectura en el navegador) y `write-excel-file` (generación en el servidor).
- **Seguridad:**
  - `src/lib/auth/dal.ts` (`obtenerUsuario`, `requerirUsuario(rol)`) valida con `getClaims()`, **nunca con `getSession()`**. Toda página y Server Action protegida llama a `requerirUsuario`.
  - `src/lib/supabase/admin.ts` (llave secreta) es `server-only` y se usa solo para `auth.admin` y para apagar `perfiles.debe_cambiar_password`.
  - **El navegador nunca habla directo con Supabase**: la CSP tiene `connect-src 'self'`.
- **Errores:** `registrarError()` (`src/lib/registro.ts`) guarda el código y el mensaje, sin datos personales. Al usuario se le muestra siempre un mensaje genérico.

## Base de datos: reglas que no se rompen

- **Migraciones:** un archivo nuevo por cambio, `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`, dentro de `begin; … commit;`. **Nunca edites una migración ya aplicada.**
  - No hay Docker ni CLI: el usuario las aplica a mano en el SQL Editor.
  - Márcalas en la tabla de `docs/supabase.md`.
- **Orden de despliegue:**
  1. Aplicar en vive-dev.
  2. Correr las pruebas SQL.
  3. Probar la vista previa de Vercel.
  4. Aplicar en vive-prod.
  5. **Después**, merge. Si se mergea primero, producción falla.
- **Permisos explícitos:** desde 2026-05-30, Supabase no da permisos por defecto a tablas nuevas (changelog #45329). Toda tabla nueva lleva:
  - `revoke all … from anon, authenticated`;
  - los `grant` mínimos, por columna cuando aplique;
  - `enable row level security`;
  - políticas `to authenticated` con `(select auth.uid())`;
  - el trigger de bitácora `privado.registrar_bitacora()`.
- **Funciones:** toda función en `public` lleva `revoke all … from public, anon` y `grant execute … to authenticated`.
  - Las auxiliares de autorización viven en el esquema **`privado`** (no expuesto), con `security definer` y `set search_path = ''`: `usuario_habilitado`, `es_coordinador`, `es_entrenador_de`, etc.
- **Pruebas SQL:** cada migración tiene su `supabase/tests/fX_….sql`, que corre completo en vive-dev dentro de `begin … rollback`.
  - Correos `@rls-fixture.invalid`.
  - Degrada temporalmente al coordinador real (solo puede haber uno).
  - Simula usuarios con `set_config('request.jwt.claims', …)` y `set local role`.
  - **No crea tablas temporales**: usa `set_config('prueba.x', …)`.
  - Termina con `select '… todas las pruebas pasaron'`.
- **Integridad: nada se borra.**
  - Las cuentas se desactivan. Las inscripciones se dan de baja con fecha.
  - Las sesiones, los registros de gimnasio y los días sin clase se **anulan**, y se pueden restaurar.
  - Las correcciones del coordinador pasan por funciones `admin_*` que exigen un **motivo** (`privado.iniciar_correccion` → `bitacora.motivo`).
  - Cada exportación (Excel o respaldo) se registra con `registrar_exportacion`. Si el registro falla, no hay descarga.
- **Reportes:** `reporte_listas`, `reporte_gimnasio` y `reporte_asistencias_detalle` excluyen los anulados, las asistencias pendientes de aprobación y los alumnos marcados como "no contar" (`alumnos_coordinacion`, F8; el respaldo sí los incluye). El rango máximo es de 92 días.

## Dominio

- **Roles:**
  - Un solo **coordinador**. Crea y desactiva las cuentas de entrenadores, con contraseña temporal generada por el sistema y cambio obligatorio en el primer acceso. No hay recuperación por correo.
  - **Entrenadores:** 1 o 2 por disciplina.
- **Matrícula:** `AL` + 8 dígitos que empiezan con 0 (`AL07210101`). `07210101` se acepta; `7210101` pide confirmar. Lógica en `src/lib/matricula.ts`.
- **Disciplinas `lista`** (selecciones y talleres):
  - Pase de lista asistió/falta.
  - Captura hasta 3 días atrás. El entrenador corrige durante 24 h.
  - Incidencias y "No hubo clase", con catálogos de máximo 6 opciones.
- **Disciplinas `acceso_libre`** (gimnasio en modo kiosco):
  - Entrada y salida, con autollenado "Nombre I.".
  - Límite de 30 búsquedas por minuto.
  - Salir del kiosco pide la contraseña del entrenador.
  - El turno olvidado se cierra automáticamente.
- **Género:** femenino, masculino, no binario o sin asignar. No se captura en el gimnasio.
- **Dashboards** solo para el coordinador. PNG con fondo claro, Excel editable, reporte general en una sola imagen (sin nombres ni matrículas), aviso de respaldo cada 15 días.
- **Diseño:**
  - Estilo Linear oscuro para el coordinador y claro para las pantallas de captura.
  - Acento verde Tecmilenio `#6dd34b` en oscuro y teal `#0f524e` en claro.
  - Logos en `public/brand/`, sin recolorear.
  - Las gráficas usan la paleta validada para daltonismo de `echarts.ts`, con solo 3 colores de serie.
- **Zona horaria:** `America/Mexico_City` (UTC-6, sin horario de verano). Usa `src/lib/fechas.ts` y `src/lib/catalogos.ts`.
