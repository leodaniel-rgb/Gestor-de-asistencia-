# Sistema de diseño

Base: estilo "Linear" (oscuro, preciso, hairlines finas, densidad compacta), adaptado a la identidad de Tecmilenio. Los tokens viven en [`src/app/globals.css`](../src/app/globals.css).

## Adaptaciones respecto a la guía original

| Guía original | Adaptación | Motivo |
|---|---|---|
| Acento lima `#e4f222` | Verde Tecmilenio `#6dd34b`* en tema oscuro | Identidad institucional. Contraste de 10.5:1 con texto `#08090a`. |
| Solo tema oscuro | Tema claro con `data-theme="light"` y acento teal `#0f524e`* | Las pantallas de captura se usan en canchas, al sol. El verde sobre blanco no alcanza contraste suficiente (≈1.9:1); el teal sí (≈9:1). |
| Berkeley Mono | JetBrains Mono | Gratuita. Solo para matrículas, IDs y metadatos. |
| Inter Variable | Inter de Google Fonts, autoalojada con `next/font` | El navegador no hace peticiones externas. |

\* Colores medidos de los logotipos entregados. Hay que confirmarlos con el manual de marca.

## Reglas

- **Un solo botón de acento** por vista: la acción principal.
- Pesos tipográficos: 400, 510 (`font-medium`) y 590 (`font-semibold`). Nunca 700 o más.
- Radios: `rounded-control` (6px), `rounded-card` (12px), `rounded-badge` (4px) y `rounded-full`.
- La separación entre superficies se logra con bordes finos (`border-line`) o `inset 0 0 0 1px`, no con sombras.
- El texto del cuerpo solo usa grises (`fg-body`, `fg-muted`, `fg-faint`). Nunca va en color.
- Ancho máximo de página: 1200px. Margen lateral de 16px en móvil.

## Logotipos

| Archivo | Uso |
|---|---|
| `public/brand/simbolo-tecmilenio.png` | Símbolo verde: barra de navegación, favicon e iconos |
| `public/brand/logo-tecmilenio-color.png` | Logotipo completo, **solo sobre fondos claros** (el "TECMILENIO" teal no se lee sobre negro) |
| `public/brand/logo-tecmilenio-blanco.png` | Versión con elementos blancos, para fondos de color o teal |

No se recolorean ni se deforman los logotipos.
