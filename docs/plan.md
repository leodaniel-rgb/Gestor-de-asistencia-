# Plan del proyecto

Última actualización: 2026-10-24

## Alcance

Portal de asistencia del área VIVE (Tecmilenio SLP) para:

- **Selecciones y talleres** (fútbol, básquetbol, voleibol, tochito bandera, cocina, artes escénicas… y los que el coordinador agregue). Cada uno tiene una lista fija de alumnos.
- **Gimnasio**: acceso libre, 2 turnos, registro de **entrada y salida** por alumno.

Volumen estimado: unos 200 registros por semana. Hay internet en todas las instalaciones, así que no se requiere modo sin conexión.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Stack | Next.js + Supabase (Postgres, Auth, RLS) + Vercel Hobby, todo en plan gratuito |
| Uso de Vercel Hobby | Válido: es un proyecto sin remuneración ([fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)). Si se profesionaliza con personal pagado, migrar a Pro o a infraestructura de la universidad. |
| Cuentas | **Solo el coordinador** crea y elimina las cuentas de entrenadores. No hay registro público. |
| Contraseñas | Contraseña temporal asignada por el coordinador y **cambio obligatorio en el primer inicio de sesión**. No hay recuperación por correo: si alguien la olvida, el coordinador la restablece. |
| Identificador de acceso | Correo institucional. Se usa solo como usuario; el sistema no envía correos. |
| Primera cuenta de coordinador | Se crea manualmente desde el panel de Supabase. No se puede crear desde el portal. |
| Número de coordinadores | Uno solo (índice único en la base) |
| Matrícula | `AL` + 8 dígitos que empiezan con 0 (`AL07210101`). Se acepta `07210101`; `7210101` pide confirmar `AL07210101` |
| Horarios | No hay catálogo de horarios. El coordinador puede marcar **días habituales** por disciplina (opcional): solo definen cuándo se muestra el recordatorio |
| Recordatorio (F3) | Días habituales: "¿Hoy tuviste clase? Si la tuviste, regístrala; si no, la coordinación la tomará como que no hubo" con [Sí, registrar] / [No hubo clase]. Otros días: solo la pregunta. Si no se contesta, no se escribe nada |
| Captura (F3) | Hoy y hasta 3 días atrás (los días anteriores quedan como *registro tardío*). Todos empiezan sin marcar; "Marcar todos como asistió" al final de la lista solo marca a los pendientes. No se guarda con alumnos sin marcar |
| Corrección (F3) | El entrenador corrige sus sesiones durante 24 h desde que las registró; después, solo el coordinador (F5) |
| Gimnasio (F4) | El entrenador elige Mañana, Tarde o "solo la hora" (sugerido por la hora: antes de 13:00 mañana, desde 15:00 tarde) y el dispositivo del kiosco (celular, tablet o computadora). Un solo turno abierto; si se olvida cerrarlo, se cierra automáticamente al abrir el siguiente. Sin salida → "sin salida", sin inventar la hora. Alumno nuevo se registra desde el kiosco sin aprobación. Búsquedas: "Nombre I.", máx. 30 por minuto por turno. Salir del kiosco o cerrar turno desde el kiosco pide la contraseña del entrenador |
| Correcciones (F5) | La coordinación corrige sin límite de tiempo mediante funciones que exigen un motivo (queda en la bitácora). Nada se borra: sesiones, registros de gimnasio y días sin clase se **anulan** y se pueden restaurar. Las salidas puestas por la coordinación quedan como *salida corregida*. La captura por coordinación solo consulta la lista cuando se elige la disciplina |
| Dashboards (F6) | Solo coordinación. Periodo por omisión: semana actual (lunes a domingo); atajos y rango libre de máx. 3 meses. Filtros: disciplina, días, asistencias/faltas, género. No cuentan anulados ni pendientes de aprobación. Cada gráfica permite cambiar el tipo (barras, líneas, pastel cuando aplica), ver tabla y descargar PNG con fondo claro. PDF con Ctrl+P. Gimnasio: entradas, alumnos distintos, tiempo promedio, sin salida, concurrencia por día y hora, top 3 alumnos. Paleta validada para daltonismo (ECharts 6.1) |
| Exportación y respaldos (F7) | Excel editable con los filtros del dashboard (incluye hoja por alumno). Respaldo completo generado al vuelo, solo coordinación; cada descarga queda en la bitácora y sin ese registro no hay descarga. Aviso si el último respaldo tiene 15 días o más. Los textos se escriben como texto (nunca fórmulas). Cron diario de Vercel con CRON_SECRET que llama a `ping()` (no lee datos) |
| Bitácora de turnos (fix) | El contador del límite de búsquedas del kiosco no se registra en la bitácora (antes cada búsqueda aparecía como "Entrenador cambió · Turno"). Las entradas viejas de ese tipo se ocultan en el historial, sin borrarse |
| Salida pendiente en el kiosco | Si un alumno entró en un turno anterior del mismo gimnasio y del mismo día, no marcó su salida y su entrada fue hace **3 horas o menos**, al escribir su matrícula el kiosco le pregunta "¿registrar tu salida?" con "Sí, registrar salida" o "No, estoy entrando". La salida queda con la hora real en que la marca y **cuenta para el tiempo promedio** (no es salida corregida). Con más de 3 horas, o en otro día, se registra una entrada normal y la anterior queda "sin salida". No se muestra la hora de la entrada anterior |
| Notas de coordinación (F8) | El coordinador escribe una nota privada por alumno (p. ej. "es un profesor, no contar") y puede marcarlo como **no contar en reportes**: se oculta de dashboards, Excel y reporte general, pero sus registros se conservan y el respaldo lo incluye. Excluir exige nota; volver a contarlo exige motivo (bitácora). Tabla aparte (`alumnos_coordinacion`) porque los entrenadores leen todas las columnas de `alumnos` |
| Sin género (F8) | Punto rojo discreto junto al nombre en el turno de gimnasio, el directorio y la ficha del alumno |
| Reporte general (F8) | Una lámina con fondo claro por vista (talleres y gimnasio) con indicadores, todas las gráficas y la tabla, armada en el navegador con los datos del mismo reporte (sin consultas extra). Se descarga en un solo PNG o se imprime en PDF. Talleres: Asistencia, Inasistencia o Ambas. Gimnasio: incluye salidas no marcadas por día y alumnos distintos por género (solo con género asignado; se informa cuántos están sin asignar). **Sin top de alumnos**: la imagen no lleva nombres ni matrículas, por eso no se registra en la bitácora |
| Catálogos (F3) | Motivos de "No hubo clase" y categorías de incidencia: el coordinador agrega o quita opciones, máximo 6 activas por catálogo |
| Alumnos | Uno por matrícula aunque esté en varias disciplinas; un nombre existente no se sobrescribe al inscribir. El entrenador corrige nombre y género de sus alumnos; la matrícula y las bajas, solo el coordinador |
| Autollenado en kiosco (F4) | Búsqueda por matrícula exacta al completar los dígitos; muestra "Nombre I." y solo con un turno abierto |
| Alumnos sugeridos (F2b) | El entrenador propone, el coordinador aprueba. Asistencia "pendiente" mientras tanto: cuenta si se aprueba, se excluye (sin borrarse) si se rechaza |
| Migraciones | Sin Docker: se aplican a mano en el SQL Editor, primero en vive-dev con sus pruebas de RLS y luego en vive-prod ([docs/supabase.md](supabase.md)) |
| Contraseñas temporales | Generadas por el sistema (14 caracteres), se muestran una sola vez al coordinador |
| Navegador y Supabase | El navegador nunca habla directo con Supabase: todo pasa por Server Actions (CSP `connect-src 'self'`) |
| Eliminar entrenador | Se desactiva la cuenta y se conservan sus registros, por integridad. |
| Correcciones del coordinador | Sobre el registro real, con **bitácora** automática. |
| Estados de asistencia | `asistencia` o `falta`. No existe falta justificada. |
| Incidencias | Texto libre por sesión |
| Género | `femenino`, `masculino`, `no binario` o sin asignar. El kiosco del gimnasio no lo pide; el reporte general del gimnasio usa el género que ya tenga el alumno (F8). |
| Gimnasio | Modo kiosco: el entrenador abre el turno y cada alumno registra su entrada; al salir vuelve a capturar su matrícula. Si al cerrar el turno alguien no registró salida, queda marcado **"sin salida"**: no se inventa una hora. |
| Dashboards | Uno para selecciones y talleres (con género) y otro para gimnasio (sin género). Filtros: semana, día, disciplina, asistencia o falta, género. Descarga PNG y elección del tipo de gráfica. |
| Respaldos | El coordinador descarga el respaldo en Excel al menos cada 15 días (el portal avisa) y lo guarda en el almacenamiento institucional. Un cron diario de Vercel evita que Supabase se pause (el plan Free pausa tras 7 días sin actividad). |
| Aviso de privacidad | Cubierto por el aviso de Tecmilenio, que se acepta al usar instalaciones y servicios |
| Repositorio | Público, con protección de `main`, secret scanning y push protection |

## Fases

| Fase | Rama | Contenido | Estado |
|---|---|---|---|
| F0 | `chore/setup-proyecto` | Proyecto Next.js, tokens de diseño, logo y favicon, reglas del repo, CI | Hecha |
| F1 | `feature/auth-roles` | Supabase, inicio de sesión, cambio obligatorio de contraseña, roles, RLS, administración de cuentas | Hecha |
| F2a | `feature/catalogos` | Disciplinas (con días habituales opcionales), asignación de entrenadores, alumnos e inscripciones | Hecha |
| F2b | `feature/importacion-solicitudes` | Importación desde Excel (`read-excel-file`, leído en el navegador), sugerencias de alta y reportes de baja con aprobación | Hecha |
| F3 | `feature/captura-asistencia` | Recordatorio, pase de lista, incidencias, "No hubo clase", corrección en 24 h, catálogos | Hecha |
| F4 | `feature/gimnasio-kiosco` | Turnos de gimnasio (abrir/cerrar), kiosco con entrada y salida, alta de alumnos nuevos, salida protegida con contraseña, app instalable | Hecha |
| F5 | `feature/admin-datos` | Registros (sesiones, gimnasio, días sin clase), captura por coordinación, directorio de alumnos, anular/restaurar, salidas corregidas, historial con motivo | Hecha |
| F6 | `feature/dashboards` | Dashboards de selecciones/talleres (con género) y de gimnasio (concurrencia, top 3), filtros, cambio de tipo de gráfica, PNG y PDF | Hecha |
| F7 | `feature/exportacion-respaldos` | Excel del reporte (con hoja por alumno), respaldo completo con registro en bitácora y aviso cada 15 días, cron diario contra la pausa de Supabase, guía de arranque del piloto | Hecha |
| F8 | `feature/reporte-general` | Reporte general en una imagen (talleres y gimnasio), notas de coordinación por alumno, exclusión de reportes, punto de "sin género" | En revisión |

## Modelo de datos (borrador, se detalla en F1 y F2)

`perfiles`, `disciplinas` (tipo `lista` o `acceso_libre`), `entrenador_disciplina`, `alumnos` (matrícula única), `inscripciones`, `sesiones` (horario o turno, abierta o cerrada, incidencias), `asistencias` (una por alumno y sesión), `registros_gimnasio` (entrada, salida), `bitacora`.

## Pendientes

- Logotipos en mayor calidad o en SVG (los actuales son copias comprimidas).
- Confirmar los colores exactos con el manual de marca: verde aprox. `#6dd34b`, teal aprox. `#0f524e`.
- Confirmar el formato de la matrícula, para validarla al capturar.
