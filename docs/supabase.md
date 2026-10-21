# Operación de Supabase

No usamos Docker ni la CLI de Supabase: las migraciones se aplican a mano en el **SQL Editor** del panel, en orden.

## Proyectos

| Proyecto | Uso | Datos |
|---|---|---|
| `vive-dev` | Desarrollo, pruebas de RLS y vistas previas de Vercel | **Solo ficticios** |
| `vive-prod` | Producción (`gestor-de-asistencia-gold.vercel.app`) | Reales |

## Aplicar una migración

1. Abre `supabase/migrations/<archivo>.sql` desde la rama del PR.
2. En **vive-dev** → SQL Editor → *New query*, pega el contenido completo y ejecuta (**Run**).
   Cada migración va dentro de `begin; … commit;`: si algo falla, no se aplica nada.
3. Ejecuta las pruebas correspondientes (siguiente sección) y prueba la vista previa de Vercel del PR.
4. Solo si todo pasa: aplica la misma migración en **vive-prod** y **después** haz merge del PR.
   (Las migraciones agregan tablas; la versión anterior del portal sigue funcionando con ellas.
   Al revés, el código nuevo sin la migración fallaría.)
5. Anota la migración aplicada en la tabla de abajo.

## Pruebas de RLS

1. En **vive-dev** (nunca en producción) → SQL Editor, pega `supabase/tests/<archivo>.sql` completo y ejecuta.
2. Resultado esperado: `F1 RLS: todas las pruebas pasaron` (o `F2a …`, según el archivo). Si una regla falla, el error dice el número de prueba.
   Las pruebas degradan temporalmente al coordinador de vive-dev y usan correos `@rls-fixture.invalid`; todo se revierte.
3. El script termina en `rollback`: no deja datos.

## Crear el coordinador inicial (una sola vez por proyecto)

1. **Authentication → Users → Add user → Create new user**: correo institucional del coordinador, una contraseña temporal fuerte y marca **Auto Confirm User**.
2. SQL Editor (cambia correo y nombre):

   ```sql
   insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password)
   select id, lower(email), 'Nombre del coordinador', 'coordinador', true
   from auth.users
   where email = 'coordinador@tecmilenio.mx';
   ```

3. Entrega la contraseña temporal en persona. En su primer acceso el portal pedirá cambiarla.

Solo puede existir un coordinador (índice único). El portal no puede crear coordinadores.

## Registro de migraciones aplicadas

| Migración | vive-dev | vive-prod |
|---|---|---|
| `20261019000100_f1_auth_roles.sql` | ☑ | ☑ |
| `20261020000100_f1_grants_service_role.sql` | ☑ | ☑ |
| `20261021000100_f2a_catalogos.sql` | ☑ | ☑ |
| `20261022000100_f2b_importacion_solicitudes.sql` | ☑ | ☑ |
| `20261023000100_f3_asistencia.sql` | ☐ | ☐ |

## Permisos explícitos en cada tabla nueva

Desde el 30/05/2026, Supabase **ya no otorga permisos automáticos** sobre tablas nuevas de `public` a `anon`, `authenticated` ni `service_role` ([changelog #45329](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)). Sin `grant`, la API responde `42501 permission denied`, aunque las políticas RLS sean correctas.

Cada migración que cree una tabla debe incluir, además de RLS:

- `grant` a `authenticated` solo de las operaciones y columnas que usa el portal;
- `grant` a `service_role` solo si el servidor la usa con la llave secreta (mínimo posible);
- nada para `anon`;
- una prueba en `supabase/tests/` por cada permiso.

Lo mismo para **funciones** en `public`: Postgres da `EXECUTE` a `PUBLIC` por defecto. Cada función nueva lleva `revoke all … from public, anon` y `grant execute … to authenticated`.
