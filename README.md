# Gestor de asistencia VIVE

Centralización de datos sobre asistencia de alumnos del área **VIVE** de la Universidad Tecmilenio, campus San Luis Potosí: selecciones, talleres y gimnasio.

Reemplaza la captura en papel y Excel por un portal web donde:

- los **entrenadores** registran la asistencia desde cualquier dispositivo;
- el **coordinador VIVE** corrige datos, administra disciplinas y cuentas, y obtiene gráficas y reportes automáticos descargables.

> Proyecto de servicio social, en etapa piloto (8 meses). Solo usa servicios gratuitos.

## Stack

| Capa | Herramienta |
|---|---|
| Web | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 |
| Datos y autenticación | Supabase (Postgres + Auth + Row Level Security) |
| Hosting | Vercel (plan Hobby) |
| Gráficas | Apache ECharts (fase F6) |

## Desarrollo local

Requisitos: Node.js 24 y pnpm (vía Corepack: `corepack enable`).

```bash
pnpm install
cp .env.example .env.local   # y llena los valores
pnpm dev                  # http://localhost:3000
```

Comprobaciones (las mismas que corre la CI en cada PR):

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Documentación

- [Plan del proyecto y decisiones](docs/plan.md)
- [Sistema de diseño](docs/diseno.md)
- [Operación de Supabase: migraciones, pruebas y coordinador](docs/supabase.md)
- [Instalar la app y preparar el kiosco del gimnasio](docs/instalar-app.md)
- [Arranque del piloto: pasos finales en Supabase, Vercel y GitHub](docs/arranque-piloto.md)
- [Reglas de contribución y Git](CONTRIBUTING.md)
- [Política de seguridad y datos](SECURITY.md)

## Licencia

**Todos los derechos reservados.** Que el repositorio sea público no concede permiso para usar, copiar, modificar ni distribuir su contenido sin autorización por escrito. Consulta los términos en [LICENSE](LICENSE).
**Los logotipos de la Universidad Tecmilenio** (`public/brand/`, `src/app/icon.png`, `src/app/apple-icon.png` y `src/app/favicon.ico`) son marcas de la universidad y se usan con su autorización para este proyecto.
