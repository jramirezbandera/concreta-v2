# src/posts/

Artículos del blog. Cada artículo es un archivo `.md` con frontmatter YAML.
Se cargan en build con `import.meta.glob` — no hay índice que mantener: añade
un `.md`, recompila, aparece.

## Estructura de un artículo

```markdown
---
title: "Título completo del artículo"
slug: "url-amigable-del-articulo"
date: "2026-05-08"
category: "TUTORIAL"        # TUTORIAL | NORMATIVA | CHANGELOG | PRODUCTO
read: "12 min"
norm: "CE art.45"           # Norma destacada o "—"
excerpt: "Resumen corto del artículo (1-2 frases)."
author: "Javier Ramírez Bandera"
authorRole: "FUNDADOR · ARQUITECTO CALCULISTA"
cover: "/blog/mi-portada.jpg"   # opcional — imagen en public/blog/
coverCaption: "Pie de figura"   # opcional
---

## Encabezado de sección

Un párrafo. Las citas en bloque se renderizan como callouts:

> **CE art.45.1** — empieza con texto normal → callout azul.
> ⚠ **cuidado** — empieza con ⚠ → callout ámbar.
> ✓ **caso real** — empieza con ✓ → callout verde.

Los bloques de código (```) se renderizan como bloques de fórmula.
```

## Cómo añadir un artículo

1. Crea `src/posts/mi-articulo.md` con el frontmatter completo.
2. (Opcional) coloca la portada 16:9 en `public/blog/` y apunta `cover` a ella.
3. Commit + push. `import.meta.glob` lo recoge en la siguiente build.

## Categorías

- `TUTORIAL` — guía paso a paso de un caso real con Concreta abierto.
- `NORMATIVA` — interpretación de un artículo del CE o el CTE.
- `CHANGELOG` — release notes de una versión de Concreta.
- `PRODUCTO` — decisiones de diseño y dirección de producto.
