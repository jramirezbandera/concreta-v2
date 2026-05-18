---
title: "Cuantías mínimas en vigas HA según CE: cuándo aplica la 0,04 fcm/fyk"
slug: "cuantias-minimas-ce"
date: "2026-04-28"
category: "NORMATIVA"
read: "8 min"
norm: "CE art.55"
excerpt: "El nuevo Código Estructural reorganiza las cuantías mínimas. Repaso de los tres casos prácticos en los que la fórmula del CE cambia el armado mínimo de positivos respecto a la EHE-08."
author: "Javier Ramírez Bandera"
authorRole: "FUNDADOR · ARQUITECTO CALCULISTA"
---

El cambio de la EHE-08 al Código Estructural ha pasado bastante desapercibido para el día a día del calculista. Y, sin embargo, en cuantías mínimas las cosas se mueven lo suficiente como para que algunos armados que cumplían con la EHE ya no cumplan con el CE.

## El cambio que importa

La fórmula clásica de cuantía mínima de la EHE era directa: 0,28 W₁ · fctm / fyd. El CE la mantiene pero introduce una verificación adicional sobre la "cuantía mecánica mínima" en flexión:

```
As,min = max( 0.04 · fcm / fyk · b · h ; 0.28 · W1 · fctm / fyd )
```

El primer término es nuevo. Y para hormigones de baja resistencia (fck ≤ 30 MPa) puede ser el que gobierne, sobre todo en cantos pequeños.

## Tres casos prácticos

### 1. Viga de canto reducido en HA-25

Para una viga de 30 × 30 con HA-25 (fcm = 33 MPa, fyk = 500 MPa), el primer término da:

```
As,min = 0.04 · 33 / 500 · 300 · 300 = 238 mm²
```

Esto equivale aproximadamente a 3Ø10, una cuantía perfectamente realista.

### 2. Viga plana en HA-25

Para una viga plana 60 × 30 en HA-25:

```
As,min = 0.04 · 33 / 500 · 600 · 300 = 475 mm²  // CE
As,min = 0.28 · W1 · fctm / fyd       = 282 mm²  // EHE
```

Aquí el CE pide casi el doble. 3Ø16 ya no es suficiente. Necesitas 4Ø14 o 3Ø16+1Ø12.

### 3. Viga de gran canto en HA-40

Para una viga 30 × 80 con HA-40 (fcm = 48 MPa):

```
As,min = 0.04 · 48 / 500 · 300 · 800 = 922 mm²
```

Aquí ya es el segundo término (el de la EHE) el que manda, porque el momento de fisuración crece con el canto.

## Conclusión

La regla de oro es: **cuando trabajes con hormigones HA-25 y vigas planas o de canto reducido, el primer término del CE puede aumentar tu armado mínimo entre un 40 y un 70% respecto a lo que la EHE pedía**.

Concreta aplica las dos comprobaciones automáticamente y te muestra cuál gobierna. Si vienes de calcular con la EHE, conviene revisar los proyectos de transición.
