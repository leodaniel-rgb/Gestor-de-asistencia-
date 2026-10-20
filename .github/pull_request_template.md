## Qué cambia

<!-- Descripción breve y fase del plan (F0–F7) -->

## Cómo probarlo

<!-- Pasos para verificar el cambio -->

## Checklist de seguridad

- [ ] Sin secretos ni archivos `.env*` (salvo `.env.example`)
- [ ] Sin datos reales de alumnos (ni en código, ni en capturas, ni en archivos)
- [ ] Tablas nuevas con RLS y políticas revisadas
- [ ] La llave secreta de Supabase solo se usa en el servidor
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm build` pasan
