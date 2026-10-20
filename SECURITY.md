# Seguridad y protección de datos

Este portal maneja **datos personales reales** de alumnos (nombre, matrícula, género y asistencia). Son datos protegidos por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (DOF 20/03/2025). Su tratamiento se ampara en el aviso de privacidad de la Universidad Tecmilenio.

## Reglas obligatorias

1. **Ningún secreto en el repositorio.** Las llaves viven en `.env.local` (local) y en las variables de entorno de Vercel. El repo es público: lo que se sube, se filtra.
2. **Nunca subir datos reales.** Ni respaldos, ni exportaciones Excel/CSV, ni capturas de pantalla con nombres o matrículas. Para pruebas se usan datos ficticios.
3. **La llave secreta de Supabase (`SUPABASE_SECRET_KEY`) solo se usa en el servidor.** Nunca en componentes cliente ni con prefijo `NEXT_PUBLIC_`.
4. **RLS en todas las tablas.** La autorización se aplica en la base de datos, no ocultando botones.
5. **Integridad.** Los registros de asistencia no se borran físicamente. Cada corrección queda en la bitácora: quién, qué, valor anterior, valor nuevo y cuándo. Eliminar la cuenta de un entrenador **no** elimina las asistencias que registró.
6. **Mínimo privilegio.** Los entrenadores solo ven y capturan sus disciplinas. Solo el coordinador ve reportes, corrige datos y administra cuentas.
7. **Respaldos.** El coordinador descarga el respaldo en Excel cada semana y lo guarda en el almacenamiento institucional (OneDrive o SharePoint), nunca en este repo.

## Si se filtra un secreto

1. Rotar la llave de inmediato en el panel de Supabase (o del servicio correspondiente).
2. Actualizar la variable en Vercel y redeplegar.
3. Borrar el secreto del historial **no** basta: el secreto se considera comprometido aunque se borre.

## Reportar una vulnerabilidad

No abras un issue público. Usa **Security → Report a vulnerability** en GitHub (reporte privado) o contacta directamente al responsable del repositorio.
