# Reglas de contribución

## Git

1. **Prohibido** `git push --force` (y `--force-with-lease`) a `main`. `main` está protegida en GitHub.
2. **Una rama por funcionalidad**, creada desde `main` actualizado:
   - `feature/<nombre>` — funcionalidad nueva
   - `fix/<nombre>` — corrección
   - `chore/<nombre>` — configuración y dependencias
   - `docs/<nombre>` — documentación
3. A `main` solo se llega por **Pull Request** con la CI en verde. No hay commits directos.
4. Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
5. Después del merge, la rama se borra.

Flujo típico:

```bash
git switch main
git pull --ff-only
git switch -c feature/mi-funcionalidad
# ...cambios...
git add <archivos>
git commit -m "feat: descripción corta"
git push -u origin feature/mi-funcionalidad
# abrir el PR en GitHub
```

## Antes de abrir un PR

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.
- [ ] No hay secretos, `.env*` (salvo `.env.example`) ni datos reales de alumnos.
- [ ] Toda tabla nueva tiene RLS activada y políticas probadas.
- [ ] Los cambios a datos de asistencia quedan registrados en la bitácora.

Ver también [SECURITY.md](SECURITY.md).
