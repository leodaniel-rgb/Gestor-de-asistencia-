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
2. Resultado esperado: `F1 RLS: todas las pruebas pasaron`. Si una regla falla, el error dice el número de prueba.
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
| `20261019000100_f1_auth_roles.sql` | ☐ | ☐ |
