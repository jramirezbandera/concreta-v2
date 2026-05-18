---
title: "v0.4 — Empresillado, placas de anclaje y nuevo motor FEM 1D"
slug: "changelog-v0-4"
date: "2026-04-22"
category: "CHANGELOG"
read: "4 min"
norm: "—"
excerpt: "Tres módulos nuevos, un rediseño del panel de inputs colapsable y soporte para entradas en m, cm o mm sin perder precisión."
author: "Javier Ramírez Bandera"
authorRole: "FUNDADOR · ARQUITECTO CALCULISTA"
---

Tres meses de trabajo en esta versión. El foco ha estado en cerrar el bloque de acero y abrir el motor de análisis matricial para vigas continuas. Tres novedades grandes:

## 1 · Pilares empresillados (EC3 §6.4.2)

Nuevo módulo en la familia Acero. Resuelve la comprobación de pilares compuestos por dos perfiles paralelos unidos por presillas. La implementación cubre:

- Esbeltez efectiva con la corrección por flexibilidad de los enlaces.
- Comprobación del cordón individual con N_chord = N/2 + M/(h₀) y de las presillas a flexión y cortante.
- Comprobación local del cordón en su tramo entre presillas.

Limitaciones: sólo dos cordones, soldadura entre presilla y cordón asumida resistente. Pilares de tres o cuatro cordones quedan para v0.5.

## 2 · Placas de anclaje

Comprobación combinada de la placa, los pernos y el hormigón soporte. La fórmula sigue DB-SE-A §8.7 para soldaduras y CE art.45 para el hormigón. Cubre:

- Tracción y cortante en pernos químicos y mecánicos.
- Flexión de la placa por levantamiento.
- Compresión del hormigón bajo la placa (con o sin rigidizadores).

## 3 · Motor FEM 1D para vigas continuas

El núcleo es un solver matricial que recibe la geometría, las cargas y las combinaciones, y devuelve envolventes M, V y deformada por combinación. Lo nuevo es que **embebe los módulos existentes**: cada vano de la viga continua usa el mismo motor de Vigas HA o Vigas Acero — los inputs y resultados son los mismos que en el módulo standalone.

Eso significa que cuando defines la armadura de un vano en el FEM, sus comprobaciones son idénticas a las del módulo individual. Sin reimplementar la norma dos veces.

## Mejoras pequeñas

- **Inputs colapsables**: cada bloque de inputs (Geometría, Materiales, Cargas) tiene un chevron para colapsar. Útil cuando estás iterando sobre un solo parámetro.
- **Escalas de unidades**: ahora puedes introducir cantos en m, cm o mm sin perder precisión interna. El motor de cálculo siempre trabaja en mm.
- **Hint "Caso de ejemplo"**: cuando abres un módulo por primera vez, los inputs llevan valores de ejemplo razonables. Una banda discreta te avisa de que estás en un caso por defecto.

## Próxima versión

v0.5 está enfocada en deformaciones diferidas (CE art.50), torsión en vigas, y el primer paso para sísmica (NCSE-02).
