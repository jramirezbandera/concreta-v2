# Registro de cambios

Lo que ha ido cambiando en Concreta, por hitos: **una entrada por función
entregada**, con la versión y la fecha en que salió. No hay una sección por
versión publicada porque desde la 0.1.1 ha habido 53 y muchas son parches del
mismo día; para eso está `git log`.

Las versiones son de calendario (`AAMMDD.n`) desde la `260716.0`. Antes fueron
`0.1.0` y `0.1.1`, las dos de marzo de 2026.

Un aviso sobre las fechas: entre el 28 de marzo y el 16 de julio de 2026 se
trabajó sin publicar. Todo lo hecho en ese tramo salió de golpe en la
**260716.0**, así que las entradas de abril, mayo, junio y principios de julio
llevan esa versión aunque su trabajo sea anterior; en ellas la fecha es la del
trabajo, no la de la publicación.

---

## El catálogo de perfiles, cotejado contra el prontuario — v260924.2 (2026-09-24)

### Añadido
- **HEA y HEB llegan hasta el 1000.** La lista se cortaba en el 400 y de ahí
  para arriba no había nada que elegir. Entran el 450, 500, 550, 600, 650, 700,
  800, 900 y 1000 de las dos series, con todas sus propiedades.

### Corregido
- **El UPN tenía mal 58 de sus 176 casillas.** El 320 figuraba con un alma de
  10,5 mm y 65,2 cm² de área cuando son 14 mm y 75,8 cm² (59,5 kg/m); el 350 y
  el 380 iban cortos de área por lo mismo, y el 400 llevaba la inercia del IPE
  400. El módulo plástico de toda la serie estaba entre un 5 % y un 28 % alto, y
  es el que decide el momento que aguanta un cajón de dos UPN en vigas y
  pilares, y el de la cruceta de punzonamiento: un 2UPN 400 anunciaba un 28 %
  más de lo que aguanta. La torsión iba de dos a tres veces alta y el centroide
  hasta un 15 %, lo que además dejaba corta la inercia del cajón.
- **La torsión de toda la serie IPN** venía de otra fuente: entre un 27 % baja y
  un 6 % alta según el tamaño. Las trece columnas pasan a ser las del catálogo.
- **El HEA 160 declaraba la inercia de eje débil un 22 % baja** (479 cm⁴ por
  615,6), con lo que el pandeo por ese eje salía más esbelto de lo que es. Y la
  constante de alabeo de los HEB 280 a 400 estaba desplazada de fila —el HEB 400
  llevaba la del 450, un 41 % alta—, que es lo que infla el pandeo lateral de
  una viga.
- Todo se cotejó contra tres fuentes independientes a la vez: el catálogo del
  fabricante, una tabla de propiedades externa y las fórmulas exactas de la
  sección. El IPE sale limpio. Lo que se encontró queda vigilado por
  comprobaciones que no dependen de ninguna fuente, sólo de la geometría del
  perfil, incluido el UPN, que hasta ahora no tenía ninguna.


## Dos datos que no se podían leer — v260924.1 (2026-09-24)

### Arreglado
- **El solape de la viga salía con catorce decimales** («970.496894409938 mm»)
  en la ficha de resultados, y el PDF decía otra cosa —970— porque redondeaba
  por su cuenta. Ahora el número sale ya redondeado del cálculo, hacia arriba y
  al múltiplo de 5 mm, como lleva haciendo pilares desde siempre: es una cota
  que alguien va a medir en obra, y hacia abajo se estaría pidiendo menos de lo
  que exige la norma.
- **La píldora del asistente tapaba la última fila** de los paneles que hacen
  scroll, y ahí no había forma de bajarla: es el final del recorrido. Ese solape
  de la viga, que es el último dato de la ficha, quedaba ilegible. Los paneles
  de módulo le reservan ahora su sitio al final, y sólo mientras la píldora está
  puesta.


## Los cálculos viajan sin PDF y el anejo se rehace solo — v260924.0 (2026-09-24)

### Cambiado
- El fichero de la obra **deja de llevar los PDF dentro**. Lo que viaja son los
  datos de cada capítulo, que ya iban, así que un anejo de cuarenta cálculos
  vuelve a pesar lo que pesa un texto y no decenas de megas.
- Al abrir una obra a la que le falta el papel —la que te pasa un compañero, o la
  tuya con los datos del navegador borrados—, **la app rehace los PDF sola**.
  Cada cálculo pasa un instante por su módulo, que es la única forma de rehacerlo
  (el papel se dibuja de lo que hay en pantalla), y mientras dura la interfaz se
  tapa con un aviso que dice por dónde va y deja dejarlo a medias. Ronda el medio
  segundo por capítulo.
- Ya no hay que pulsar «Reconstruir el PDF»: el botón sale del camino normal y
  queda un «Volver a intentarlo» en las filas que no se pudieron rehacer.
- La fecha del capítulo **no cambia al rehacerlo**: se rehace el papel, no el
  cálculo, y una obra importada no puede quedar fechada hoy entera.

### Arreglado
- Rehacer los PDF ya no se lleva por delante lo que tuvieras a medias en un
  módulo: la app copia lo que va a pisar y lo devuelve al terminar.


## El asistente sale a la superficie, y la barra baja a dos controles — v260924.0 (2026-09-22 a 09-23)

### Añadido
- **Una píldora fija abajo a la derecha**: dice si el asistente tiene una
  conversación abierta y en qué estado está —pensando, esperándote, con un
  error— y la abre de un clic. Antes eso estaba a tres gestos y casi nadie lo
  había visto. Se puede apagar en Preferencias, con Unidades y Tema.
- Cambiar de pantalla con el asistente pensando **pregunta antes de tirar la
  respuesta** que estás esperando.

### Cambiado
- El Asistente y la Calculadora dejan de tener botón propio: entran en un
  **«Menú»** con tres grupos y la misma forma en las 29 pantallas, donde las
  filas que no aplican salen apagadas con su razón en vez de desaparecer. La
  barra queda con «Menú» y «Exportar».
- **Salir del asistente ya no borra la conversación.** Cerrar y minimizar
  dejaban la misma pantalla y uno de los dos tiraba el hilo sin avisar; ahora
  salir es siempre bajar a la esquina, y tirarlo es «Reiniciar», con su
  confirmación.
- En móvil la barra se reparte al revés: arriba lo que se pulsa —navegación, obra
  y desplegables— y abajo, a todo el ancho, **el título de la pantalla**, que era
  lo que se cortaba: «Cumplimiento del DB SE» pide 148 px y tenía 75.

### Arreglado
- Los avisos de la app se sentaban **encima** de la píldora: los dos vivían en la
  misma esquina.
- El atajo «A» colgaba del botón del asistente, así que al mudarse éste al Menú
  se habría ido con él sin un solo error.


## El lienzo de zapatas, en tres vistas — v260924.0 (2026-09-23)

### Cambiado
- Planta, sección y presiones dejan de ir sueltas: el módulo pasa a **1 Terreno ·
  2 Armado · 3 Modelo**, como Muros y Encepados. Del ELU no se dibujaba nada, y
  son diez de las quince filas de la tabla: la vista Modelo enseña el área eficaz
  de Meyerhof y, según el vuelo, las bielas con su tirante o las secciones de
  cortante y el perímetro de punzonamiento.
- La armadura era una raya: ahora se dibuja la parrilla a su separación real, con
  las patillas de 90º, las barras de la otra dirección vistas de punta y la cota
  de anclaje frente al vuelo disponible.
- En el PDF cada vista se va a su plana, a 170 mm de ancho: a los 80 mm de antes
  un rótulo llegaba al papel a 2 mm y no se leía.

### Arreglado
- **σmax se dibujaba siempre a toda la altura del panel**, así que una zapata al
  55 % de σadm parecía un bloque macizo. Ahora el diagrama cuelga de la base de
  la zapata, su altura es σ/σadm y la línea de trazos de σadm es la referencia.
- El mapa de presiones iba de azul a **rojo**: codificaba una magnitud con el
  color del fallo. Los colores de estado quedan sólo donde son el veredicto.
- Planta, sección y diagrama iban a tres escalas distintas; ahora una sola por
  vista, y apiladas se leen en proyección.
- El panel de resultados saltaba hasta 141 px al cambiar de pestaña, σmin salía
  tachado por la arista del bloque de presiones y tres rótulos escribían por
  debajo del contraste AA en tema claro.


## Placas de anclaje: la geometría real del estudio — v260924.0 (2026-09-23)

### Cambiado
- Los rigidizadores se dibujan y se calculan como en las láminas tipo: **en «#»,
  pegados a las cuatro caras del pilar**, continuos de borde a borde y
  achaflanados a 45º en el alzado, con las barras en las ocho celdas que deja esa
  retícula. Antes las barras se pintaban encima de las cartelas y el cálculo
  partía la placa por la mitad sin mirar dónde estaba nada.
- Disposiciones de 4, 6, 8 y 12 barras —la retícula de 9 muere y se lee como 8—,
  y una barra que pise acero es aviso de «no construible».
- **Pilar 2UPN en cajón**, que es casi todo lo que hace el estudio: la huella sabe
  que son cuatro paredes macizas, y de ahí salen el área eficaz, las cartelas,
  las holguras y el T-stub.


## El panel de la obra enseña lo que se entrega — v260914.0 (2026-09-13 a 09-14)

### Cambiado
- La pantalla de la obra pasa a **dos columnas**: la lista de lo que falta a la
  izquierda y, a la derecha, **los dos documentos que salen de aquí dibujados** —la
  justificación del DB SE y el anejo de cálculo—, cada uno con su estado y su
  camino. La pantalla existía para producir esos dos documentos y no enseñaba
  ninguno. En pantalla estrecha el raíl cae debajo.
- La cabecera enseña **los cinco datos de la obra** en tira, y los que faltan salen
  en rojo. En una obra en blanco no: a quien acaba de empezar no se le reprocha nada.
- **Un medidor de segmentos** bajo el veredicto, uno por comprobación que aplica en
  esta obra. No es un porcentaje: una obra no se entrega «al 60 %».
- Cada fila lleva el **icono de su módulo**, el mismo que tiene en la barra lateral,
  y la marca de estado vive en una **columna de ancho fijo**: sin ella «no procede»
  empujaba la etiqueta y catorce filas empezaban en cuatro sitios distintos.
- Las filas dejan de repetir la instrucción entera. La nota que imprime la ficha
  nombra su módulo y dice qué hacer —bien para un apartado que se lee de uno en
  uno—, pero cuatro seguidas parecían un registro de errores: ahora la fila dice
  sólo en qué está.
- El bloque del anejo se parte en dos: el documento se va al raíl y **lo calculado
  que aún no está en el anejo** se queda como bloque propio, que es un aviso y no
  un capítulo.

### Arreglado
- **El chip teñido de las filas no se pintaba.** `bg-tint-*` no genera CSS —los
  tokens están declarados fuera de `@theme`—, así que el fondo del chip era el de
  la superficie. Pasa a la receta de insignia que usa el resto de la app. El mismo
  fallo deja sin tinte a las dos bandas de aviso de la app: anotado en `TODOS.md`.
- **La acción principal mentía mientras cargaba**: decía «Revisar y exportar» y
  llevaba a la ficha, porque el contador vale cero hasta que resuelve el chunk. En
  la obra más corriente era lo contrario de la verdad. Ahora no se enseña hasta
  saber qué falta.
- **La pantalla de entrada daba un salto de 36 px** al cargar: el medidor y el
  recuento aparecían después y empujaban la lista hacia abajo.
- Los dos documentos del raíl **no anunciaban su estado** a un lector de pantalla.
- «No procede» se decía dos veces en la misma fila, a ochocientos píxeles de
  distancia.
- En pantalla estrecha el detalle se comía el nombre del módulo («Cuadro de …»).


## Las piezas del anejo dejan de estar congeladas — v260910.0 (2026-09-10)

### Añadido
- Pinchar un cálculo del anejo lo abre en su módulo con los datos con los que se
  calculó. Se edita, se exporta y **actualiza ese mismo capítulo**, en su sitio y
  con su número, en vez de añadir uno nuevo.
- La pieza guarda el estado del módulo, no sólo el PDF. Va en el índice, así que
  viaja en el `.concreta`: en otro ordenador no está el PDF, pero el cálculo se
  reabre y se regenera.
- «Guardar en el anejo» se reetiqueta con lo que va a hacer —«Actualizar el
  capítulo 4» o «Guardar como pieza nueva»—, y sale de la misma función que
  decide la acción: lo que se lee es lo que pasa.
- Renombrar un capítulo cambia el nombre en la lista, en el índice y **dentro
  del PDF**, repintando su título sin tocar nada más de la página.
- Ver el PDF guardado sin salir del anejo.
- La barra del módulo dice qué cálculo tienes abierto y deja saltar a los otros
  de la obra sin pasar por el anejo, o empezar uno nuevo.
- Las piezas ya guardadas adoptan los datos de su módulo cuando la huella
  coincide: es el mismo cálculo, sólo que guardado en otro cajón.
- Resistencia al fuego **por ámbitos**: el DB SI 6 la exige por plantas y por
  usos, con columna propia para los sótanos, y con un solo campo no se podía
  decir. En la ficha se enuncia una vez en el 3.1.1, no repetida en cada
  material.

### Cambiado
- El nombre del cálculo es obligatorio al exportar un PDF: es lo que le pone la
  banda de título, y sin ella no se puede renombrar el capítulo después. Word,
  Excel y DXF no lo piden.
- Guardar dos veces la misma viga ya no duplica el capítulo.
- La insignia de cada fila deja de comparar con el módulo —lo que la hacía
  marcar en ámbar cálculos perfectos en cuanto empezabas el siguiente— y ahora
  dice «versión anterior» o «abierta».


## Obras, anejo de cálculo y ficha DB SE — v260906.4 (2026-09-06 a 09-08)

### Añadido
- **Obras**: contenedor de proyecto que serializa, despliega y cambia de obra
  sin perder nada, con menú en el sidebar, página de datos de obra y fichero
  `.concreta` para llevársela.
- **Anejo de cálculo**: almacén de piezas (IndexedDB para los PDF, pdf-lib para
  pegarlos), «Guardar en el anejo» desde los veinte módulos con previsualización
  —sin tocar ninguno— y pantalla del anejo con el índice verificado contra las
  páginas reales del documento montado.
- **Ficha de cumplimiento del DB SE**: la memoria como bloques, apartado a
  apartado, con su formulario, sus huecos y salida a Word y PDF verificadas
  sobre el papel.
- Leer el PDF del informe geotécnico para rellenar el 3.1.3, dejando en ámbar lo
  heredado.
- **Cargas por planta**: las cargas de encima del forjado proyectadas en
  columnas, con la sección del edificio al lado de la tabla, muros por alzado, y
  salida a PDF y DXF.
- El módulo de sismo publica su resultado y el cuadro del plano lo monta.
- Fuente Arimo embebida en los 21 exportadores de PDF.

### Corregido
- El conmutador de unidades: los módulos nuevos hablaban en el sistema de la
  norma, la tabla de cargas se leía en dos sistemas a la vez, y la coma decimal
  —que es la que se escribe en español— no llegaba a todas las cajas.
- La categoría de uso B son 2,0 kN/m², no 3,0 (DB SE-AE tabla 3.1).
- Fuera de la tabla C.5 no hay peso propio: se pregunta, no se inventa.
- Un cuadro corto ya no se parte entre dos páginas del PDF.


## Acciones: viento, nieve y cargas por planta — v260905.2 (2026-09-05)

### Añadido
- Motor de viento y nieve del DB SE-AE, con cubierta a dos aguas (Anejo D.6) y
  paramentos verticales (tabla D.3).
- El módulo como mesa de trabajo: lienzo con los dibujos de cubierta, fachadas y
  nieve, que sigue a la sección que se está tocando.
- Plantas definidas por la altura entre forjados.
- Contrato de **publicaciones entre módulos** y contexto de obra compartido: un
  módulo no lee nunca el almacén de otro, publica un sobre versionado.
- Salida a Word, Excel y DXF del cuadro de materiales.

### Corregido
- Las correcciones de la auditoría del módulo de viento y nieve.


## Cuadro de materiales — v260903.0 y v260904.3 (2026-09-03 a 09-04)

### Añadido
- Cuadro de materiales del Código Estructural y del DB SE-M, con consistencia,
  calidad de la madera y el cuadro de memoria completo.
- Exportación a Word del cuadro de memoria y a Excel del cuadro de plano.

### Corregido
- La nota de fuego no puede certificar la sección desnuda: enuncia la R exigida
  y deja abiertas las dos vías.
- El catálogo EN 338 completo y el `kh` que la norma limita por densidad.
- El `.docx` sale con la tipografía del estudio, no con la de Word.
- Los mínimos del Anejo 19 en anclajes, y una leyenda que citaba el artículo
  equivocado.


## Muros de escollera y gaviones — v260830.0 (2026-08-30)

### Añadido
- Módulo de muros de escollera y gaviones, con la estabilidad global resuelta a
  través del módulo de taludes.


## Acción sísmica NCSE-02 — v260827.1 y v260828.1 (2026-08-26 a 08-28)

### Añadido
- Las dos puertas normativas de la NCSE-02 y la cadena de fuerzas del método
  simplificado, con sus fixtures.
- El Anejo 1 (aceleración básica y coeficiente de contribución) cosechado desde
  el WMS del IGN, con buscador de municipios.
- Cuadros de plantas y geometría, resultados con el patrón visual común, ayuda
  por campo, exportación a PDF con el veredicto por delante y asistente IA con
  la peligrosidad fuera de su alcance.
- El conmutador de unidades entra al módulo (kN/Tn, kN/m²/kg/m²).

### Corregido
- Las seis tandas de la auditoría del módulo: siete hallazgos medios y trece
  bajos.


## Encepados, micropilotes y beta pública — v260824.0 y v260825.0 (2026-08-24 a 08-25)

### Añadido
- Encepados: dimensiones en planta editables y placa de reparto en cabeza.
- La web dice que Concreta es una beta pública y gratuita.

### Corregido
- Micropilotes: un método de hundimiento descartado ya no tumba el veredicto, y
  los campos adimensionales del terreno dicen qué unidad piden.
- La sección del pilar de madera era invisible en tema oscuro.


## Vigas de madera: carga puntual — v260808.0 (2026-08-08)

### Añadido
- Carga puntual y reacciones en apoyos en vigas de madera.

### Corregido
- Un tubo declarado RHS ya no se rotula SHS cuando h = b.
- Las comprobaciones que incumplen ya no son invisibles en el panel de
  resultados.
- La sección apaisada (b > h) ya no invalida el módulo de madera.


## Muros de fábrica: hueco pasante — v260729.1 y v260730.2 (2026-07-29 a 07-30)

### Añadido
- Hueco pasante, excentricidad de apoyo automática o manual, y rediseño del
  panel de datos.
- Planta nueva siempre vacía y duplicar planta.

### Corregido
- Se publican `fb` y `fm` según el Anejo C, despegando las reglas del texto.


## FEM 1D y 2D se homogeneizan — v260723.4 a v260726.3 (2026-07-23 a 07-26)

### Añadido
- Selector de combinaciones que dibuja estados auditables en el FEM 2D.
- Vector de desplazar y copiar en barra y nudo.
- El FEM 1D adopta el lienzo, los resultados y los datos del 2D.
- Propiedades del perfil en los resultados de vigas y pilares de acero, con la
  sección dibujada con su contorno real (acuerdos y esquinas redondeadas).
- Cargas nocionales de imperfección (§5.3.2): el combo gravitatorio ya no
  «amplifica la nada».
- Panel «Cómo calcula este módulo», con la doctrina del motor anclada por tests.

### Corregido
- **Catálogo de acero: `Wpl,y` e `Iw` de la serie IPN estaban hasta 2,12 veces
  altos.**
- El PDF del FEM 1D imprimía el bucket sumado bajo «ENVOLVENTE (ELU)».
- El rol de barra se retira del enrutado: las comprobaciones las decide el
  mecanismo.


## FEM 2D: pórticos y cerchas — v260719.0 a v260721.2 (2026-07-19 a 07-21)

### Añadido
- Módulo de FEM 2D con ficha de cálculo por barra.
- Pantalla de plantillas de entrada y recientes, a la par del FEM 1D.
- Zoom y encuadre en el lienzo de modelo y diagramas.
- Cargas negativas en los campos con dirección.


## Versión de calendario y asistente IA sin clave — v260716.0 y v260716.1 (2026-07-16 a 07-18)

### Añadido
- Versionado de calendario (`AAMMDD.n`) y cache-bust del bundle en cada versión,
  con aviso «Actualizar» cuando hay una nueva.
- Clave de Gemini compartida: el asistente se puede usar sin traer la propia.

### Corregido
- Pantalla en blanco tras cada despliegue (el `ai-vendor` había que
  precachearlo), y después el mismo `ai-vendor` sale del precache y baja el
  arranque en 634 KB.
- El modo guiado del asistente dejaba de preguntar a mitad de entrevista.
- El título del módulo se cortaba a «V…» en la barra superior.

---

Todo lo que sigue se publicó junto en la **260716.0** (2026-07-16). Las fechas
son las del trabajo.

## Asistente IA — v260716.0 (2026-07-15)

### Añadido
- Asistente multi-módulo, con auditoría normativa contra el CE Anejo 19.


## Conmutador de unidades SI ↔ técnico — v260716.0 (2026-04-21 a 06-28)

### Añadido
- Librería de unidades (catálogo, conversión, formato y proveedor), campo
  numérico que entiende el sistema activo y conmutador en la barra superior.
- Cableado en todos los módulos: vigas y pilares de hormigón, acero, madera,
  zapatas, muros, encepados, forjados, punzonamiento, empresillado, placas de
  anclaje, sección compuesta, muros de fábrica y FEM 2D.

### Corregido
- El conmutador convierte los valores de todos los módulos, incluidos los
  estratos de suelo y la derivación ELU del acero.


## Estabilidad de taludes — v260716.0 (2026-06-24 a 06-27)

### Añadido
- Módulo de estabilidad de taludes: corte vertical primero, después el método de
  Fellenius, con precarga del motor y señal de carga.

### Corregido
- La `u` por dovela es presión intersticial (kPa), no fuerza.


## Ayuda en cada campo y modo claro — v260716.0 (2026-06-09 a 06-21)

### Añadido
- Tooltips de ayuda (ⓘ) en los quince módulos de cálculo.
- Modo claro, según el sistema operativo, en toda la app: base, nueve módulos,
  estratos de micropilotes, muros de fábrica y lienzos del FEM.

### Corregido
- El cambio claro/oscuro es atómico, sin *tearing*.


## La app como sitio: landing, PWA y dominio — v260716.0 (2026-04-21 a 06-13)

### Añadido
- Rediseño de la página de inicio, con escalado en pantallas QHD/2K+ y tema
  claro por defecto en landing y marketing.
- Páginas `/normativa` y `/about` como rutas propias.
- Iconos raster y variante *maskable* para la PWA, con metadatos de iOS.
- División del bundle por ruta (react-router v7 `lazy`), con aviso visual de
  carga, prefetch y captura de fallos de carga de chunk.
- Botón «Copiar enlace» bajo demanda en todos los módulos, y botón
  «Restablecer valores» en todos.
- Objetivos táctiles ≥ 44 px y navegación por teclado en los SVG.
- Sección circular en pilares de hormigón, eje z y resistencia a compresión en
  sección compuesta, perfiles pequeños (<160) en IPE, HEA y HEB, y empotramiento
  frontal con resistencia pasiva en muros de contención.

### Corregido
- Los PDF de los trece módulos que faltaban abren en Acrobat (SVG rasterizado).
- Se sirve desde la raíz para el dominio propio `concreta.tools`.
- Los campos numéricos dejan de pisar lo que se está tecleando.
- En móvil: sin auto-zoom, sin scroll lateral y con campos usables.

## La auditoría normativa — v260716.0 (2026-06-11 a 06-12)

Una revisión módulo a módulo contra el Código Estructural y los Eurocódigos.
Son correcciones de **cálculo**: cambian resultados.

### Corregido
- **Zapata aislada: `VRd` de cortante multiplicaba por 1000 en vez de por `d`.**
  Además, núcleo central rómbico para flexión biaxial, vuelco EQU con `N`,
  punzonamiento EC2 6.4 completo y comprobación de anclaje.
- **Placas de anclaje: `edge breakout` sobreestimaba `VRd,c` 3,5 veces**
  (ahora EN 1992-4 ec. 7.40). Y cinco hallazgos altos más —`Ac,V`, `|V|` en
  acero, cortante puro, interacción N+V en hormigón y tracción del T-stub—, seis
  medios y el tope `Ac,N ≤ n·Ac,N0` en cono, splitting y pry-out.
- **Forjados: `VRd,max` sobreestimaba la biela 1,45 veces** al no ser coherente
  con `cotθ = 2,5`. Con ello, `fctd` en anclaje, esbeltez `L/d`, factor 100 en
  `VRd,c`, `As,min` de losa, signo de momentos, `ρw,min` y `wmax` en XC4.
- Muros de contención: el sismo incluye la inercia del muro `kh·W` y la
  componente vertical `(1-kv)`; Mononobe-Okabe correcta, umbral de vuelco 2,0
  (CTE tabla 2.1), la sobrecarga deja de estabilizar, movilización del pasivo y
  cara traccionada del talón.
- Pilares de hormigón: `f_yc,d = mín(fyd, 400)` en `NRd,max`, cuantía geométrica
  0,002, `λ_lim` dependiente del axil, interpolación de `MRd` en la zona de
  transición y cercos con Ø mínimo. Después, modelo N-M por integración de
  fibras.
- Vigas de hormigón: `VRd,max` con `cotθ = 2,5`, signos, solape por material,
  `sr_max` y `VRd,c`.
- Vigas de acero: `Mcr` con `C2·zg`, `fy` por espesor, tope de `χLT`,
  interacción M-V en clase 3 y `ψ` de la hipótesis G1.
- Pilares de acero: `kzy` de la tabla B.2, `fy` por espesor, pandeo lateral con
  `Lz` y clasificación N+M real.
- Muros de fábrica: límite de esbeltez `λ ≤ 27`, `β` completa (EC6 ec. 6.10),
  peso del antepecho, `Φ = 0` con `e ≥ t/2`, y el axil de tracción marca
  incumplimiento en vez de CUMPLE.
- Encepados: modelo EHE 58.4.1.2 completo y primera suite de tests. La EHE,
  derogada, queda como práctica y no como exigencia.
- Sección compuesta: `fy` por espesor, platabandas desde apoyos reales y clase 4
  en modo `cu`.
- Vigas de madera: GL32h, ELS según CTE DB-SE 4.3.3 y fuego con `kfi` más LTB
  residual.
- Pilares de madera: excentricidad de fuego, ecuación 6.35 y FTUX recalibrado.
- Pilar compuesto empresillado: segundo orden EC3 6.4.1 completo.
- Micropilotes: inercia π/64, separación por nivel freático en granular media,
  interacción M-N, `σv` desde rasante y lechada sumergida.


## Crucetas UPN en punzonamiento — v260716.0 (2026-06-07)

### Añadido
- Modo crucetas UPN para pilar metálico, interior y sobre zapata; y sobre
  forjado en borde y esquina, con armadura de punzonamiento, brazo automático y
  aviso de longitud mínima.
- El detalle tipo resuelve anclaje y atado, la tabla canto→UPN, el confinamiento
  del núcleo por espiral (§6.7) y el cortante de interfaz (§6.2.5).

### Corregido
- Perímetro de cruz correcto: el caso interior no era conservador.


## Micropilotes — v260716.0 (2026-05-23 a 06-02)

### Añadido
- Módulo completo, validado contra la Guía Fomento 2005: clasificación EC3-1-1
  tabla 5.2 antes de elegir `Wpl`/`Wel`, cohesión nula en granulares, guía de
  separación en planta, tubo personalizado fuera de catálogo, cálculo automático
  del factor de pandeo `CR` y recubrimiento estructural automático.

### Corregido
- Recubrimiento mínimo según la tabla 2.3 de la Guía Fomento, y validación de
  que el declarado lo cumple.
- Se invalida cuando el perfil de suelo no cubre la longitud del pilote.


## Muros de fábrica DB SE-F — v260716.0 (2026-05-04 a 05-25)

### Añadido
- Módulo de muros de fábrica multiplanta según el DB SE-F, con selector de `γM`
  por la tabla 4.8, cascada de cargas concentradas, desglose del axil heredado,
  edificio de una sola planta, calculadora de `fk` por el Anejo C y PDF
  jerárquico con mapa de calor por `η`.


## Placas de anclaje — v260716.0 (2026-05-21 a 05-23)

### Añadido
- Geometría direccional a cuatro caras, tres modos de cortante en hormigón,
  interacción N+V dúctil, rama de tracción pura y pedestal.

### Corregido
- Levantamiento parcial por equilibrio plástico rectangular, `Ft` lineal
  proporcional al eje neutro y capada a `FtRd`, `checkSplitting` con la fórmula
  del CE Anejo 11 §7.2.1.6, y T-stub de dos alas siempre en secciones I/H.
- La normativa citada pasa a ser el Código Estructural (anejos 11, 18 y 19).


## FEM 1D — v260716.0 (2026-05-01 a 05-07)

### Añadido
- Módulo de análisis FEM 1D, con lectura en móvil.

### Corregido
- El adaptador de acero usa la flecha real del solver, no la fórmula cerrada.


---

## [0.1.1] — 2026-03-28

### Añadido
- Vigas de acero: modo generador de cargas —categoría de uso (CTE DB-SE-AE
  tabla 3.1), carga permanente, sobrecarga y ancho tributario— que deriva
  `MEd`/`VEd`/`Mser` con γG = 1,35 y γQ = 1,50.
- Vigas de acero: panel de diagramas M/V/δ en SVG, con la parábola de momentos,
  el cortante lineal con su signo y la curva de flecha coloreada por estado.
- Vigas de acero: barra de pestañas con roles ARIA entre generador y entrada
  manual; al pasar a manual, los campos vienen rellenos con lo derivado.
- Vigas de acero: `Lcr` se guarda en mm y se enseña en metros, como `L`.
- Vigas de acero: la interacción M-V se omite en modo generador (V = 0 en centro
  de vano para carga uniforme biapoyada: es exacto, no conservador).
- Vigas de acero: aviso cuando `Lcr > L` —resultado conservador, pero conviene
  revisarlo—.
- `loadGen.ts`: `deriveFromLoads()` como función pura, con `GAMMA_G`/`GAMMA_Q`.
- 14 suites de tests (79 tests) para vigas de acero.

### Cambiado
- Vigas de acero: los PDF de diagramas usan `effectiveInputs`, como la pantalla.
- Vigas de acero: teclear la sobrecarga a mano selecciona «Personalizada» en la
  categoría de uso, para que el rótulo no se quede mintiendo.
- Vigas de acero: los desplegables de tipo de carga se bloquean en modo
  generador, que fuerza carga uniforme.

### Corregido
- PDF de vigas de acero: `Lcr` se imprime en metros, como en pantalla.

## [0.1.0] — 2026-03-28

### Añadido
- Página de inicio con animaciones al desplazar, tarjetas de módulo y franja de
  características.
- Módulo de vigas de hormigón: flexión, cortante y fisuración según el Código
  Estructural.
- Sección dibujada en SVG en vivo, en pantalla y en PDF, que se actualiza con
  cada cambio.
- Exportación a PDF con jsPDF y svg2pdf.js.
- Armazón de la app: sidebar con iconos estructurales y barra superior con
  copiar enlace y exportar.
- Estado de cálculo en la URL (enlaces compartibles) y en localStorage, con
  versión de esquema y una clave por módulo.
- Registro de módulos, con los publicados y los previstos.
- 17 tests de vigas de hormigón, cubriendo CUMPLE, ADVERTENCIA, INCUMPLE y casos
  límite.
- Tipografías Geist Sans/Mono locales, tema oscuro de Tailwind CSS v4 con
  colores de estado, y fondo de retícula de puntos («mesa de trabajo del
  ingeniero»).
- Manifiesto PWA con service worker.

### Corregido
- Validación de la clase de exposición en vigas de hormigón: una clase inválida
  metida por la URL daba un límite de fisura no conservador (0,3 mm en vez de
  los 0,2 mm que exige la XC4).
