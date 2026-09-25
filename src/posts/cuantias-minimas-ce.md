---
title: "Cuantía mínima de tracción en el Código Estructural: lo que dice el §9.2.1.1"
slug: "cuantias-minimas-ce"
date: "2026-04-28"
category: "NORMATIVA"
read: "7 min"
norm: "CE Anejo 19 §9.2.1.1"
excerpt: "El CE no adopta la cuantía mínima recomendada del Eurocódigo ni conserva la tabla de cuantías geométricas de la EHE-08: fija una sola expresión, la (9.1). Qué cambia en vigas, losas y zapatas, con números."
author: "Javier Ramírez Bandera"
authorRole: "FUNDADOR · ARQUITECTO CALCULISTA"
---

> ⚠ **Artículo corregido el 25 de septiembre de 2026** — La primera versión daba una fórmula, «0,04 · fcm/fyk · b · h», que no figura en el Código Estructural, y atribuía a la EHE-08 una expresión que tampoco era la suya. Este texto la sustituye entera, cotejado contra el BOE.

El Anejo 19 del Código Estructural reproduce el Eurocódigo 2, pero no siempre con sus valores recomendados. La cuantía mínima de tracción es el ejemplo más claro. Si calculas con un programa pensado para el Eurocódigo, o sigues aplicando las tablas de la EHE-08, estás usando otro criterio.

## Lo que dice el CE

> **CE Anejo 19 §9.2.1.1(1) · cuantía mínima**
> El área de la armadura longitudinal de tracción no debe ser inferior a As,min, que se establece mediante la expresión (9.1).

```
As,min = (W / z) · (fctm,fl / fyd)          (9.1)

z        brazo mecánico en ELU; de forma aproximada, z = 0,8·h
W        módulo resistente de la sección BRUTA relativo a la fibra más traccionada
fctm,fl  resistencia media a flexotracción = max{ (1,6 − h/1000)·fctm ; fctm }   (3.23)
fyd      resistencia de cálculo de la armadura pasiva
```

Para una sección rectangular, W = b·h²/6, y la expresión queda en As,min = b·h·fctm,fl / (4,8·fyd).

El mismo apartado admite una alternativa para elementos secundarios en los que sea admisible cierto riesgo de rotura frágil: tomar As,min igual a 1,2 veces el área necesaria en ELU. Y fija el máximo: ni la armadura de tracción ni la de compresión deben superar As,max = 0,04·Ac fuera de las zonas de solape. Cada una por su lado, no la suma de las dos.

Las losas remiten a este mismo apartado (§9.3.1.1(1)).

## De dónde viene

Es la cuantía mecánica mínima de la EHE-08. Su artículo 42.3.2 ya exigía As·fyd ≥ (W₁/z)·fct,m,fl, con z = 0,8·h a falta de cálculos más precisos. Lo que el CE no conserva es la tabla 42.3.5 de cuantías geométricas mínimas (2,8 ‰ en vigas y 1,8 ‰ en losas para B500S, entre otras), que la EHE-08 aplicaba además de la mecánica siempre que resultara más exigente.

Tampoco adopta el valor recomendado del Eurocódigo, 0,26·fctm/fyk·bt·d con un suelo de 0,0013·bt·d. Esa fórmula aparece en muchos programas y hojas de cálculo, y en el CE no está.

## Tres casos con números

HA-25 y B500S (fctm = 2,56 N/mm², fyd = 434,8 N/mm²), salvo que se diga otra cosa.

### 1. Viga 30 × 50: el CE pide la mitad que la EHE-08

```
fctm,fl = (1,6 − 0,5)·2,56 = 2,82 N/mm²
As,min  = 300·500·2,82 / (4,8·434,8) = 202 mm²      CE (9.1)
As,min  = 0,0028·300·500             = 420 mm²      EHE-08, tabla 42.3.5
```

Con la EHE-08 mandaba la cuantía geométrica, y el mínimo era el doble. En una viga plana de 60 × 30 pasa lo mismo: 287 mm² con el CE, 504 mm² con la tabla de la EHE.

### 2. Losa maciza de 20 cm: el Eurocódigo se queda corto

```
fctm,fl = (1,6 − 0,2)·2,56 = 3,58 N/mm²
As,min  = 1000·200·3,58 / (4,8·434,8)       = 343 mm²/m   CE (9.1)
As,min  = 0,26·2,56/500·1000·170 (d = 170)  = 226 mm²/m   Eurocódigo, valor recomendado
```

El canto pequeño sube fctm,fl un 40 % y el CE pide un 50 % más que el Eurocódigo. Aquí la EHE-08 y el CE coinciden, porque en losas mandaba su cuantía mecánica. Un programa que aplique el valor recomendado del Eurocódigo da por buenas losas delgadas con un tercio menos de armadura de la que exige el CE.

### 3. Zapata de 60 cm: casi no cambia nada

```
fctm,fl = max(1,0·2,56 ; 2,56) = 2,56 N/mm²
As,min  = 1000·600·2,56 / (4,8·434,8) = 736 mm²/m   CE (9.1)
```

A partir de 60 cm de canto, fctm,fl vale fctm y las tres fórmulas se acercan: 708 mm²/m con el Eurocódigo (d = 532 mm) y los mismos 736 con la EHE-08.

## Secciones en T

W es el de la sección bruta a la fibra traccionada, así que en una T importa qué cara tracciona. En el nervio de un forjado reticular (ala eficaz de 700 mm, capa de compresión de 5 cm, nervio de 12 cm y canto de 35 cm) salen 91 mm² en el vano, con el ala comprimida, y 190 mm² en el apoyo, con el ala en tracción. Es el momento de fisuración de la sección real. El 2,8 ‰ sobre el nervio daba 118 mm² en los dos sitios.

## Qué hace Concreta

Desde la versión del 25 de septiembre de 2026, vigas, forjados, zapatas, muros, encepados y punzonamiento calculan As,min con la (9.1). Usan W de la sección bruta, en T para los nervios, y fctm,fl según el canto. El máximo se comprueba en cada cara por separado. En los encepados, que el CE deja fuera de su ámbito (§9.8.1), la (9.1) coincide con la cuantía mecánica de la EHE-08 que el módulo sigue.

> ✓ **Si vienes de la EHE-08** — En vigas vas a ver mínimos más bajos, porque desaparece el 2,8 ‰. En losas y zapatas, los mismos. Lo que no conviene es sustituir la tabla de la EHE por la fórmula del Eurocódigo: en losas delgadas se queda corta.
