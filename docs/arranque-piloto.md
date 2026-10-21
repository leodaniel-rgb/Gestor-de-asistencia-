# Arranque del piloto

Lista de pasos finales en los paneles de Supabase y Vercel antes de usar el portal con datos reales. Márcalos conforme avances.

## 1. Supabase (vive-prod)

- [ ] **Todas las migraciones aplicadas** (ver la tabla en [supabase.md](supabase.md)).
- [ ] **Authentication → Sign In / Providers**: registro público **desactivado**; solo el proveedor Email activo.
- [ ] **Authentication → URL Configuration → Site URL**: `https://gestor-de-asistencia-gold.vercel.app`.
- [ ] **Política de contraseñas**: mínimo 10 caracteres, con mayúsculas, minúsculas y dígitos.
- [ ] **Settings → API Keys → Legacy**: **desactivar** las llaves heredadas `anon` y `service_role`. El portal no las usa (usa `sb_publishable_…` y `sb_secret_…`). Desactivarlas es reversible.
- [ ] **Settings → Data API**: el único esquema expuesto es `public` (no `privado`).
- [ ] **Advisors → Security Advisor**: revisar que no haya alertas de tablas sin RLS.
- [ ] Solo existe **un** coordinador (el real) y su contraseña temporal ya se cambió.

## 2. Vercel

- [ ] **Environment Variables → Production** (valores de vive-prod):
  - `NEXT_PUBLIC_SUPABASE_URL` (Config)
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Config)
  - `SUPABASE_SECRET_KEY` (**Secret**)
  - `CRON_SECRET` (**Secret**): una cadena aleatoria de 32 o más caracteres (puedes generarla con un gestor de contraseñas).
- [ ] **Preview** usa los valores de **vive-dev**, nunca los de producción. `CRON_SECRET` no hace falta en Preview: los cron solo corren en producción.
- [ ] **Settings → Cron Jobs**: aparece `/api/cron/mantener-activo` (diario, alrededor de las 6:00 de San Luis Potosí).
- [ ] **Deployment Protection**: Vercel Authentication activo para Preview.
- [ ] Probar el cron manualmente (sustituye el secreto; no lo pegues en ningún chat):

  ```bash
  curl -H "Authorization: Bearer TU_CRON_SECRET" https://gestor-de-asistencia-gold.vercel.app/api/cron/mantener-activo
  ```

  Respuesta esperada: `{"ok":true}`. Sin el encabezado debe responder `No autorizado`.

## 3. GitHub

- [ ] Ruleset de `main` (PR obligatorio, check `verificar`, sin force push ni borrado).
- [ ] Secret scanning y push protection activos.
- [ ] Automatically delete head branches activo.

## 4. Datos iniciales (en el portal, como coordinador)

- [ ] Crear las **disciplinas** (selecciones, talleres y gimnasio de acceso libre), con sus días habituales.
- [ ] Revisar los **catálogos** (motivos de "No hubo clase" y categorías de incidencias).
- [ ] Crear las **cuentas de entrenadores** y entregar las contraseñas temporales en persona.
- [ ] **Asignar** cada entrenador a sus disciplinas.
- [ ] **Importar** las listas desde Excel (una por disciplina).
- [ ] Preparar el **dispositivo del gimnasio** ([instalar-app.md](instalar-app.md)).

## 5. Rutina durante el piloto

- **Cada 15 días**: descargar el respaldo (**Respaldo** en el menú) y guardarlo en OneDrive/SharePoint institucional. El portal avisa si pasan más de 15 días.
- **Cada semana**: revisar **Solicitudes** pendientes y los **Registros** con "sin salida" o "tardía".
- **Si Supabase pausa el proyecto** (no debería, por el cron): entrar al panel de Supabase → el proyecto → **Restore project**. Los datos se conservan (se puede restaurar hasta 1 año después, según la documentación de Supabase).
