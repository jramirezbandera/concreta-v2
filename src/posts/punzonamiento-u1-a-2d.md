---
title: "Punzonamiento en placas: u1 a 2d, bordes y huecos"
slug: "punzonamiento-u1-a-2d"
date: "2026-05-08"
category: "TUTORIAL"
read: "12 min"
norm: "CE art.45"
excerpt: "Repasamos el perímetro crítico u1 a 2d del CE art.45 y resolvemos tres casos prácticos donde el ingeniero novel se equivoca: bordes, esquinas y huecos próximos al pilar."
author: "Javier Ramírez Bandera"
authorRole: "FUNDADOR · ARQUITECTO CALCULISTA"
---

El punzonamiento sigue siendo uno de los modos de fallo más comunes en placas de forjado sobre soporte aislado. La buena noticia es que el Código Estructural lo trata bien y de forma sistemática. La mala es que la mayoría de errores vienen no de la fórmula, sino de definir mal el perímetro de control.

## Contexto normativo

El art.45 del CE establece la comprobación de punzonamiento como una verificación de tensión tangencial sobre un perímetro de control definido a una distancia de 2d desde la cara del pilar, donde d es el canto útil de la placa. Esta distancia no es caprichosa: corresponde al ángulo de fisuración interno de la zona descomprimida bajo el pilar.

> **CE art.45.1 · perímetro de control**
> El perímetro u1 se sitúa a una distancia 2·d de la cara del pilar, redondeado en las esquinas con radio 2·d. Cuando el pilar es próximo a un borde libre o una abertura, el perímetro se trunca por la línea más corta.

La tensión nominal de cálculo se obtiene como:

```
vEd = β · VEd / (u1 · d)

// β: factor de excentricidad (1.15 interior, 1.40 borde, 1.50 esquina)
// VEd: reacción de cálculo en el pilar
// u1:  perímetro de control en mm
// d:   canto útil medio en las dos direcciones
```

Donde **β** es el factor que recoge la excentricidad de la reacción respecto al baricentro del perímetro de control. Para pilares interiores la norma permite usar β = 1,15 como simplificación. Para borde y esquina hay que aplicar valores mayores.

## Perímetro crítico u1

Para un pilar interior rectangular de a × b, el perímetro de control u1 a 2d es simplemente el contorno de un rectángulo redondeado:

```
u1 = 2(a + b) + 4π·d
```

Hasta aquí todo bien. Donde el técnico novel se equivoca es en tres situaciones concretas, que vemos a continuación con el módulo de Concreta abierto.

## Caso 1 · Pilar de borde

Cuando el pilar está a menos de 2·d de un borde libre del forjado, el perímetro u1 se trunca por la línea del borde. Esto reduce la superficie de control y aumenta la tensión tangencial sobre el área restante.

El error más habitual aquí es **no truncar el perímetro**, aplicando la fórmula de pilar interior. El resultado puede infravalorar la tensión real en un 40-60% en casos extremos.

> ⚠ **cuidado**
> Concreta detecta automáticamente la proximidad al borde cuando seleccionas posición = "borde" en el módulo de punzonamiento, y aplica el truncado del perímetro junto con β = 1,40.

## Caso 2 · Pilar de esquina

En un pilar de esquina el perímetro u1 se trunca por dos bordes a la vez, reduciéndose a un cuadrante. La situación se agrava porque la excentricidad biaxial de la reacción se traduce en β = 1,50, valor del lado de la seguridad pero conservador.

Un caso real: en un edificio de viviendas con pilares de 30 × 30 en esquina y forjado de 220 mm con d = 180 mm, la tensión vEd alcanza el 92% de vRd,c para una carga axial de 320 kN. Cualquier incremento puntual de carga (zona de instalaciones, sobrecarga concentrada) saca el pilar de norma. La solución habitual es engrosar localmente la placa con un capitel implícito.

## Caso 3 · Huecos cercanos al pilar

Cuando hay una abertura (paso de instalaciones, hueco de escalera) dentro de 6·d desde la cara del pilar, el CE obliga a truncar el perímetro u1 por las líneas radiales tangentes a la abertura. Es el caso menos conocido y el que más sorpresas da en obra.

> ✓ **caso real**
> Si tu placa tiene un hueco de 40 × 40 cm a 60 cm de un pilar 30 × 30 con d = 200 mm, el perímetro u1 se reduce aproximadamente un 18%. Concreta lo recalcula automáticamente al introducir las coordenadas del hueco.

## Conclusión

El punzonamiento es uno de esos cálculos donde la fórmula es sencilla pero los detalles geométricos del perímetro u1 marcan la diferencia entre cumplir y no cumplir. Los tres casos vistos (borde, esquina y huecos) son los que en práctica generan más fallos en revisión por visado.

Aquí tienes el archivo de Concreta con los tres casos resueltos. Pega el enlace en otro navegador y verás los inputs y resultados completos sin tener que instalar nada:

```
concreta.tools/rc-punching?s=eJxLs7E1MdGzMjAwLDcyNzC1MNS0MdSxBQAo3wKw
```

Si tienes dudas sobre un caso concreto, escríbeme. Y si detectas algo en Concreta que no coincide con tu interpretación de la norma, abre un issue en GitHub — los cálculos los revisamos en abierto.
