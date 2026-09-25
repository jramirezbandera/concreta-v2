---
title: "Novedades de septiembre: de la calculadora a la obra"
slug: "novedades-septiembre-2026"
date: "2026-09-25"
category: "CHANGELOG"
read: "7 min"
norm: "—"
excerpt: "Siete módulos nuevos, la obra con su anejo de cálculo y la ficha del DB SE, salidas a Word, Excel y DXF, y dos cotejos del catálogo que conviene conocer si tienes cálculos con 2UPN o con HEB grandes."
author: "Javier Ramírez Bandera"
authorRole: "FUNDADOR · ARQUITECTO CALCULISTA"
---

Entre finales de agosto y hoy Concreta ha cambiado de escala. Hasta el verano calculaba piezas sueltas: una viga, un pilar, una zapata. Ahora lleva la obra entera hasta lo que se entrega —la justificación del DB SE, el anejo de cálculo y los cuadros del plano— sin volver a teclear un dato. Este es el resumen, por bloques.

## 1 · La obra

Todo empieza por crear una obra, que pide cinco datos: denominación, municipio, provincia, altitud y uso. Los heredan los módulos: la zona de viento, la nieve y la peligrosidad sísmica salen de ahí, y por eso la provincia es obligatoria.

- **Se guarda en un fichero** `.concreta.json` que te llevas a otro ordenador o le pasas a un compañero. Pesa lo que un texto: lleva los datos de cada cálculo, no los PDF. Al abrirlo, la app rehace sola el papel del anejo, a razón de medio segundo por capítulo más o menos.
- **«Duplicar esta obra…»** parte de otra conservando sus cálculos, y deja en ámbar sólo lo que cambia de solar a solar.
- **La pantalla de la obra dice qué falta** para entregar, y cada fila te lleva a donde se resuelve. Es la pantalla por la que entra la app cuando tienes una obra abierta.
- **Ajustes › Mi estudio** guarda el perfil del despacho —programa de cálculo, límites de flecha, niveles de control, las redacciones fijas del método—, que es tuyo y no de la obra.

## 2 · Lo que se entrega

> **Tres documentos** — la justificación del DB SE, el anejo de cálculo y los cuadros del plano. Los tres salen de lo que ya has calculado.

**La ficha del DB SE** (el apartado 3.1 de la memoria) se ensambla desde los módulos de materiales, viento y nieve, cargas por planta y sismo, y pregunta en lenguaje de obra lo que sólo se teclea una vez. Usa siempre lo último calculado; lo que viene de otra obra sale en ámbar hasta que lo revisas, y sólo lo que falta de verdad impide exportar. Sale en Word y en PDF. Y lee el PDF del informe geotécnico: rellena el 3.1.3 con la página de cada dato, para que lo compruebes.

**El anejo de cálculo** se va llenando desde cada módulo: «Guardar en el anejo» es un destino más del desplegable «Exportar». Cada capítulo se reabre en su módulo con los datos con los que se calculó, y al volver a guardarlo se actualiza en su sitio. El anejo sale en un PDF con portada, índice cotejado contra las páginas reales y numeración continua.

**Los cuadros del plano** de materiales, viento y nieve, cargas por planta e incendio bajan juntos en un DXF y un Excel, desde la pantalla de la obra.

**Los planos tipo del estudio** salen rellenos en DXF: muros (tres tipos, según tengan talón y puntera), encepados de 2, 3, 4 y 6 micropilotes, el detalle del micropilote y el cuadro de vigas, con una sección por cada viga guardada en el anejo. El dibujo es el de siempre; la app sólo cambia las cifras de la tabla.

## 3 · Siete módulos nuevos

- **Acción sísmica** (NCSE-02). La peligrosidad del Anejo 1 del IGN por municipio, espectro, modos, cortantes por planta y reparto con torsión. Arranca sin municipio y enlaza el de la obra. Si el edificio lo calcula un programa, declara igualmente la acción para la memoria por la vía del art. 3.6.2.
- **Muros de escollera y gaviones** (Guía de Fomento 2006), con la estabilidad global a través de Taludes.
- **Cuadro de materiales**. Clase de exposición, recubrimiento, cemento y a/c derivados de la situación de obra, la madera del DB SE-M y las longitudes de anclaje. Memoria en Word, plano en Excel y DXF.
- **Viento y nieve** (DB SE-AE). Viento por planta, cubiertas a dos aguas y fachadas por zonas, y la nieve por faldón a partir del municipio.
- **Cargas por planta** (DB SE-AE). Aquí se declara el edificio —cubiertas, plantas y sótanos con su altura— y lo lee Viento y nieve. Peso propio, permanentes, sobrecarga de uso y la nieve de todo lo que está a la intemperie.
- **Cumplimiento del DB SE**, la ficha del punto 2.
- **Incendio** (DB SI 6). La resistencia al fuego que se exige a la estructura, el tiempo equivalente del Anejo B, si cada sección de hormigón o acero la alcanza sola, y una estimación de la protección donde no llega.

## 4 · Los de siempre, más completos

- **Encepados**: el de 6 micropilotes, la armadura secundaria dispuesta por ti y comprobada con los mínimos de la EHE-08, las plantas de armado inferior y superior, y el número de barras del tirante a mano.
- **Placas de anclaje**: las cartelas en «#» pegadas al pilar, como en las láminas tipo, y el pilar de 2UPN en cajón.
- **Zapatas** en tres vistas: terreno, armado y modelo.
- **Vigas de acero**: HEA y HEB hasta el 1000.

## 5 · El asistente, a la vista

Vive en una píldora abajo a la derecha, se abre también con la tecla A y se puede apagar en Ajustes. Salir ya no borra la conversación, y si cambias de pantalla mientras piensa te pregunta antes de tirar la respuesta. Ha llegado a los módulos que se teclean en tabla —cargas, materiales, viento y nieve—, y ya no rotula «CUMPLE» encima de un módulo que no comprueba nada.

## 6 · Cotejado contra el prontuario

Todo el catálogo de perfiles y todas las tablas de datos se han cotejado contra fuentes externas. Se corrigieron 86 celdas del catálogo y tres tablas de datos. Casi todo iba del lado seguro, pero hay tres casos que conviene recalcular si los tienes:

> ⚠ **Recalcula** — los cajones de dos UPN (el módulo plástico del UPN iba entre un 5 % y un 28 % alto), las vigas HEB 280 a 400 que dependan del pandeo lateral (la constante de alabeo estaba desplazada de fila) y los pilares empresillados con angulares justos (el radio de giro mínimo salía hasta un 1,6 % alto).

## Pequeñas cosas

- La lupa del pie de la barra lateral abre un buscador de módulos, también con Ctrl+K.
- La barra superior queda en dos controles: «Ajustes», con el asistente, la calculadora, las unidades y el tema, y «Exportar».
- Los PDF llevan la fuente embebida, y el pie de página firma con el dominio de verdad, concreta.tools.

Si algo de esto no cuadra con tu forma de trabajar, escríbeme. Y si ves un número que no coincide con tu lectura de la norma, abre un issue en GitHub.
