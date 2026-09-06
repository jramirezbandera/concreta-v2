/**
 * Los textos fijos de la ficha de cumplimiento del CTE DB SE, congelados.
 *
 * Transcritos de la ficha colegial que el estudio usa de plantilla (la JS-662
 * del COAC, 26 páginas) y, para la tabla sísmica completa, de la ficha corta
 * del propio estudio. El test `plantilla.test.ts` los coteja LITERALMENTE con
 * `src/test/fixtures/dbse-plantilla.json`, que vuelca los dos .docx con
 * `scripts/extract-dbse-plantilla.py`; lo que aquí se aparta de ellos está en
 * `CORRECCIONES` de ese test, una a una, para que se vea en el diff.
 *
 * Lo que NO está aquí, a propósito: ningún valor de la obra. Ni un municipio,
 * ni un ab, ni una empresa geotécnica. La plantilla tiene huecos con nombre
 * (`{municipio}`, `{vb}`), y quien los rellena es `ficha.ts` con lo que
 * publican los módulos y lo que teclea el usuario. Es la premisa P5 del
 * diseño: el documento sale completo o sale marcado, nunca con el dato del
 * proyecto anterior.
 *
 * Y lo que se cambia de la plantilla colegial, con su motivo:
 *  - «Instrucción CE» / EFHE → «Código Estructural»: la EFHE (RD 642/2002)
 *    está derogada por el CE, y los forjados se justifican por su Anejo 19;
 *  - las fórmulas que la JS-662 lleva como objetos OLE van como texto Unicode
 *    («Ed,dst ≤ Ed,stb»): la fuente Arimo de los PDF las dibuja, y así el
 *    Word y el PDF dicen lo mismo símbolo a símbolo;
 *  - «∆» (U+2206) se escribe «Δ» (U+0394), que es la que la fuente cubre.
 *
 * Apartados 3.1.8 (fábrica) y 3.1.9 (madera): ninguna de las fichas del
 * estudio los desarrolla —siempre «no proceden»—, así que se redactan aquí
 * con la MISMA estructura que el 3.1.7 de acero (bases de cálculo, durabilidad,
 * materiales, análisis, ELU, ELS) y las referencias del DB SE-F y el DB SE-M.
 */

import type { SistemaEstructural } from '../codes/seismic/types';

// ── Fórmulas ────────────────────────────────────────────────────────────────

/** Las que la ficha colegial incrusta como objetos OLE. Texto, para que Word y PDF coincidan. */
export const FORMULAS = {
  estabilidad: 'Ed,dst ≤ Ed,stb',
  resistencia: 'Ed ≤ Rd',
  servicio: 'Eser ≤ Clim',
} as const;

// ── Cabecera e índice ───────────────────────────────────────────────────────

export const TITULO = '3.1. Seguridad estructural';

export const INDICE = {
  rotulo: 'Prescripciones aplicables conjuntamente con DB-SE',
  intro: 'El DB-SE constituye la base para los Documentos Básicos siguientes y se utilizará conjuntamente con ellos:',
  intro2: 'Deberán tenerse en cuenta, además, las especificaciones de la normativa siguiente:',
  cabecera: ['Documento', 'Apartado', 'Contenido', 'Procede / No procede'],
  /** Los seis Documentos Básicos, en el orden de la ficha. */
  documentos: [
    { doc: 'DB-SE', numero: '3.1.1', titulo: 'Seguridad estructural' },
    { doc: 'DB-SE-AE', numero: '3.1.2', titulo: 'Acciones en la edificación' },
    { doc: 'DB-SE-C', numero: '3.1.3', titulo: 'Cimentaciones' },
    { doc: 'DB-SE-A', numero: '3.1.7', titulo: 'Estructuras de acero' },
    { doc: 'DB-SE-F', numero: '3.1.8', titulo: 'Estructuras de fábrica' },
    { doc: 'DB-SE-M', numero: '3.1.9', titulo: 'Estructuras de madera' },
  ],
  normativa: [
    { doc: 'NCSE', numero: '3.1.4', titulo: 'Norma de construcción sismorresistente' },
    { doc: 'CE', numero: '3.1.5', titulo: 'Código estructural' },
  ],
  procede: 'Procede',
  noProcede: 'No procede',
} as const;

/** El recuadro con el artículo 10 del RD 314/2006, tal como lo transcribe la ficha. */
export const RD_314 = {
  titulo: 'REAL DECRETO 314/2006, de 17 de marzo, por el que se aprueba el Código Técnico de la Edificación.( BOE núm. 74,Martes 28 marzo 2006)',
  subtitulo: 'Artículo 10. Exigencias básicas de seguridad estructural (SE).',
  parrafos: [
    'El objetivo del requisito básico «Seguridad estructural» consiste en asegurar que el edificio tiene un comportamiento estructural adecuado frente a las acciones e influencias previsibles a las que pueda estar sometido durante su construcción y uso previsto.',
    'Para satisfacer este objetivo, los edificios se proyectarán, fabricarán, construirán y mantendrán de forma que cumplan con una fiabilidad adecuada las exigencias básicas que se establecen en los apartados siguientes.',
    'Los Documentos Básicos «DB SE Seguridad Estructural», «DB-SE-AE Acciones en la edificación», «DBSE-C Cimientos», «DB-SE-A Acero», «DB-SE-F Fábrica» y «DB-SE-M Madera», especifican parámetros objetivos y procedimientos cuyo cumplimiento asegura la satisfacción de las exigencias básicas y la superación de los niveles mínimos de calidad propios del requisito básico de seguridad estructural.',
    'Las estructuras de hormigón están reguladas por la Instrucción de Hormigón Estructural vigente.',
    '10.1 Exigencia básica SE 1: Resistencia y estabilidad: la resistencia y la estabilidad serán las adecuadas para que no se generen riesgos indebidos, de forma que se mantenga la resistencia y la estabilidad frente a las acciones e influencias previsibles durante las fases de construcción y usos previstos de los edificios, y que un evento extraordinario no produzca consecuencias desproporcionadas respecto a la causa original y se facilite el mantenimiento previsto.',
    '10.2 Exigencia básica SE 2: Aptitud al servicio: la aptitud al servicio será conforme con el uso previsto del edificio, de forma que no se produzcan deformaciones inadmisibles, se limite a un nivel aceptable la probabilidad de un comportamiento dinámico inadmisible y no se produzcan degradaciones o anomalías inadmisibles.',
  ],
} as const;

// ── 3.1.1 Seguridad estructural (SE) ────────────────────────────────────────

export const SE = {
  titulo: '3.1.1 Seguridad estructural (SE)',
  bloque: 'Análisis estructural y dimensionado',
  proceso: {
    rotulo: 'Proceso',
    pasos: ['DETERMINACION DE SITUACIONES DE DIMENSIONADO', 'ESTABLECIMIENTO DE LAS ACCIONES', 'ANALISIS ESTRUCTURAL', 'DIMENSIONADO'],
  },
  situaciones: {
    rotulo: 'Situaciones de dimensionado',
    filas: [
      ['PERSISTENTES', 'condiciones normales de uso'],
      ['TRANSITORIAS', 'condiciones aplicables durante un tiempo limitado.'],
      ['EXTRAORDINARIAS', 'condiciones excepcionales en las que se puede encontrar o estar expuesto el edificio.'],
    ],
  },
  periodoServicio: { rotulo: 'Periodo de servicio', texto: (anios: number) => `${anios} Años` },
  metodo: { rotulo: 'Método de comprobación', texto: 'Estados límites' },
  definicion: {
    rotulo: 'Definición estado limite',
    texto: 'Situaciones que, de ser superadas, puede considerarse que el edificio no cumple con alguno de los requisitos estructurales para los que ha sido concebido',
  },
  elu: {
    rotulo: 'Resistencia y estabilidad',
    titulo: 'ESTADO LIMITE ÚLTIMO:',
    texto: 'Situación que, de ser superada, existe un riesgo para las personas, ya sea por una puesta fuera de servicio o por colapso parcial o total de la estructura:',
    items: [
      'perdida de equilibrio',
      'deformación excesiva',
      'transformación estructura en mecanismo',
      'rotura de elementos estructurales o sus uniones',
      'inestabilidad de elementos estructurales',
    ],
  },
  els: {
    rotulo: 'Aptitud de servicio',
    titulo: 'ESTADO LIMITE DE SERVICIO',
    texto: 'Situación que de ser superada se afecta:',
    items: ['el nivel de confort y bienestar de los usuarios', 'correcto funcionamiento del edificio', 'apariencia de la construcción'],
  },
  acciones: {
    bloque: 'Acciones',
    rotulo: 'Clasificación de las acciones',
    filas: [
      ['PERMANENTES', 'Aquellas que actúan en todo instante, con posición y valor constantes (pesos propios) o con variación despreciable: acciones reológicas'],
      ['VARIABLES', 'Aquellas que pueden actuar o no sobre el edificio: uso y acciones climáticas'],
      ['ACCIDENTALES', 'Aquellas cuya probabilidad de ocurrencia es pequeña, pero de gran importancia: sismo, incendio, impacto o explosión.'],
    ],
    valores: {
      rotulo: 'Valores característicos de las acciones',
      texto: 'Los valores de las acciones se recogerán en la justificación del cumplimiento del DB SE-AE',
    },
    geometria: {
      rotulo: 'Datos geométricos de la estructura',
      texto: 'La definición geométrica de la estructura está indicada en los planos de proyecto',
    },
    materiales: {
      rotulo: 'Características de los materiales',
      texto: 'Los valores característicos de las propiedades de los materiales se detallarán en la justificación del DB correspondiente o bien en la justificación del Código Estructural.',
    },
    modelo: { rotulo: 'Modelo análisis estructural' },
  },
  estabilidad: {
    rotulo: 'Verificación de la estabilidad',
    formula: FORMULAS.estabilidad,
    leyenda: ['Ed,dst: valor de cálculo del efecto de las acciones desestabilizadoras', 'Ed,stb: valor de cálculo del efecto de las acciones estabilizadoras'],
  },
  resistencia: {
    rotulo: 'Verificación de la resistencia de la estructura',
    formula: FORMULAS.resistencia,
    leyenda: ['Ed : valor de cálculo del efecto de las acciones', 'Rd: valor de cálculo de la resistencia correspondiente'],
  },
  combinacion: {
    rotulo: 'Combinación de acciones',
    texto: 'El valor de cálculo de las acciones correspondientes a una situación persistente o transitoria y los correspondientes coeficientes de seguridad se han obtenido de la fórmula 4.3 y de las tablas 4.1 y 4.2 del presente DB. El valor de cálculo de las acciones correspondientes a una situación extraordinaria se ha obtenido de la expresión 4.4 del presente DB y los valores de cálculo de las acciones se ha considerado 0 o 1 si su acción es favorable o desfavorable respectivamente.',
  },
  aptitud: {
    rotulo: 'Verificación de la aptitud de servicio',
    texto: 'Se considera un comportamiento adecuado en relación con las deformaciones, las vibraciones o el deterioro si se cumple que el efecto de las acciones no alcanza el valor límite admisible establecido para dicho efecto.',
  },
  flechas: {
    rotulo: 'Flechas',
    texto: (limite: string) => `La limitación de flecha activa establecida en general es de ${limite} de la luz`,
  },
  desplome: {
    rotulo: 'desplazamientos horizontales',
    texto: (limite: string) => `El desplome total limite es ${limite} de la altura total`,
  },
} as const;

// ── 3.1.2 Acciones en la edificación (SE-AE) ────────────────────────────────

export const SEAE = {
  titulo: '3.1.2. Acciones en la edificación (SE-AE)',
  permanentes: {
    rotulo: 'Acciones Permanentes (G):',
    filas: [
      [
        'Peso Propio de la estructura:',
        'Corresponde generalmente a los elementos de hormigón armado, calculados a partir de su sección bruta y multiplicados por 25 (peso específico del hormigón armado) en pilares, paredes y vigas. En losas macizas será el canto h (cm) x 25 kN/m3.',
      ],
      [
        'Cargas Muertas:',
        'Se estiman uniformemente repartidas en la planta. Son elementos tales como el pavimento y la tabiquería (aunque esta última podría considerarse una carga variable, sí su posición o presencia varía a lo largo del tiempo).',
      ],
      [
        'Peso propio de tabiques pesados y muros de cerramiento:',
        'Éstos se consideran al margen de la sobrecarga de tabiquería. En el anejo C del DB-SE-AE se incluyen los pesos de algunos materiales y productos. El pretensado se regirá por lo establecido en el Código Estructural. Las acciones del terreno se tratarán de acuerdo con lo establecido en DB-SE-C.',
      ],
    ],
  },
  variables: {
    rotulo: 'Acciones Variables (Q):',
    uso: {
      rotulo: 'La sobrecarga de uso:',
      texto:
        'Se adoptarán los valores de la tabla 3.1. Los equipos pesados no están cubiertos por los valores indicados. Las fuerzas sobre las barandillas y elementos divisorios: Se considera una sobrecarga lineal de 2 kN/m en los balcones volados de toda clase de edificios.',
    },
    climaticas: {
      rotulo: 'Las acciones climáticas:',
      viento: {
        titulo: 'El viento:',
        intro:
          'Las disposiciones de este documento no se aplican en los edificios situados en altitudes superiores a 2.000 m. En general, las estructuras habituales de edificación no son sensibles a los efectos dinámicos del viento y podrán despreciarse estos efectos en edificios cuya esbeltez máxima (relación altura y anchura del edificio) sea menor que 6. En los casos especiales de estructuras sensibles al viento será necesario efectuar un análisis dinámico detallado.',
        presion: 'La presión dinámica del viento Qb=1/2 · R· Vb². A falta de datos más precisos se adopta R=1.25 kg/m³. La velocidad del viento se obtiene del anejo D.',
        /** La frase con el dato: «Madrid está en zona A, con lo que v=26 m/s, …». */
        zona: (lugar: string, zona: string, vb: string) =>
          `${lugar} está en zona ${zona}, con lo que v=${vb} m/s, correspondiente a un periodo de retorno de 50 años.`,
        cierre: 'Los coeficientes de presión exterior e interior se encuentran en el Anejo D.',
      },
      temperatura: {
        titulo: 'La temperatura:',
        texto:
          'En estructuras habituales de hormigón estructural o metálicas formadas por pilares y vigas, pueden no considerarse las acciones térmicas cuando se dispongan de juntas de dilatación a una distancia máxima de 40 metros',
      },
      nieve: {
        titulo: 'La nieve:',
        texto:
          'Este documento no se aplica a edificios situados en lugares que se encuentren en altitudes superiores a las indicadas en la tabla 3.11. En cualquier caso, incluso en localidades en las que el valor característico de la carga de nieve sobre un terreno horizontal Sk=0 se adoptará una sobrecarga no menor de 0.20 kN/m²',
        /** Con publicación: el sk del emplazamiento. */
        valor: (lugar: string, zona: string, sk: string) =>
          `${lugar} está en la zona de clima invernal ${zona}, con un valor característico de la carga de nieve sobre un terreno horizontal sk=${sk} kN/m² (tabla 3.8 y anejo E).`,
      },
    },
    quimicas: {
      rotulo: 'Las acciones químicas, físicas y biológicas:',
      texto:
        'Las acciones químicas que pueden causar la corrosión de los elementos de acero se pueden caracterizar mediante la velocidad de corrosión que se refiere a la pérdida de acero por unidad de superficie del elemento afectado y por unidad de tiempo. La velocidad de corrosión depende de parámetros ambientales tales como la disponibilidad del agente agresivo necesario para que se active el proceso de la corrosión, la temperatura, la humedad relativa, el viento o la radiación solar, pero también de las características del acero y del tratamiento de sus superficies, así como de la geometría de la estructura y de sus detalles constructivos. El sistema de protección de las estructuras de acero se regirá por el DB-SE-A. En cuanto a las estructuras de hormigón estructural se regirán por el Art.3.4.2 del DB-SE-AE.',
    },
    accidentales: {
      rotulo: 'Acciones accidentales (A):',
      texto:
        'Los impactos, las explosiones, el sismo, el fuego. Las acciones debidas al sismo están definidas en la Norma de Construcción Sismorresistente NCSE-02. En este documento básico solamente se recogen los impactos de los vehículos en los edificios, por lo que solo representan las acciones sobre las estructuras portantes. Los valores de cálculo de las fuerzas estáticas equivalentes al impacto de vehículos están reflejados en la tabla 4.1',
    },
  },
  niveles: {
    titulo: 'Cargas gravitatorias por niveles.',
    intro:
      'Conforme a lo establecido en el DB-SE-AE en la tabla 3.1 y el Código Estructural, las acciones gravitatorias, así como las sobrecargas de uso, tabiquería y nieve que se han considerado para el cálculo de la estructura de este edificio son las indicadas:',
    cabecera: ['Niveles', 'Sobrecarga de Uso', 'Peso propio del Forjado', 'Resto de carga permanente', 'Nieve', 'Carga Total'],
  },
} as const;

// ── 3.1.3 Cimentaciones (SE-C) ──────────────────────────────────────────────

export const SEC = {
  titulo: '3.1.3. Cimentaciones (SE-C)',
  bases: {
    bloque: 'Bases de cálculo',
    filas: [
      [
        'Método de cálculo:',
        'El dimensionado de secciones se realiza según la Teoría de los Estados Limites Últimos (apartado 3.2.1 DB-SE) y los Estados Límites de Servicio (apartado 3.2.2 DB-SE). El comportamiento de la cimentación debe comprobarse frente a la capacidad portante (resistencia y estabilidad) y la aptitud de servicio.',
      ],
      [
        'Verificaciones:',
        'Las verificaciones de los Estados Límites están basadas en el uso de un modelo adecuado para al sistema de cimentación elegido y el terreno de apoyo de esta.',
      ],
      [
        'Acciones:',
        'Se ha considerado las acciones que actúan sobre el edificio soportado según el documento DB-SE-AE y las acciones geotécnicas que transmiten o generan a través del terreno en que se apoya según el documento DB-SE en los apartados (4.3 - 4.4 – 4.5).',
      ],
    ],
  },
  geotecnia: {
    bloque: 'Estudio geotécnico realizado',
    generalidades: {
      rotulo: 'Generalidades:',
      texto:
        'El análisis y dimensionamiento de la cimentación exige el conocimiento previo de las características del terreno de apoyo, la tipología del edificio previsto y el entorno donde se ubica la construcción.',
    },
    rotulos: {
      empresa: 'Empresa:',
      autores: 'Nombre del autor/es firmantes:',
      titulacion: 'Titulación/es:',
      sondeos: 'Número de Sondeos:',
      descripcionTerrenos: 'Descripción de los terrenos:',
    },
    parametros: {
      rotulo: 'Resumen parámetros geotécnicos:',
      filas: {
        cotaCimentacion: 'Cota de cimentación',
        estratoApoyo: 'Estrato previsto para cimentar',
        nivelFreatico: 'Nivel freático',
        tensionAdmisible: 'Tensión admisible considerada',
        pesoEspecifico: 'Peso específico del terreno',
        anguloRozamiento: 'Angulo de rozamiento interno del terreno',
        empujeReposo: 'Coeficiente de empuje en reposo',
        balasto: 'Coeficiente de Balasto',
      },
    },
  },
  cimentacion: {
    bloque: 'Cimentación:',
    rotulos: {
      descripcion: 'Descripción:',
      material: 'Material adoptado:',
      dimensiones: 'Dimensiones y armado:',
      ejecucion: 'Condiciones de ejecución:',
    },
    /** Defaults del perfil de estudio. */
    dimensiones:
      'Las dimensiones y armados se indican en planos de estructura. Se han dispuesto armaduras que cumplen con las cuantías mínimas indicadas en el artículo 9.3 del CE atendiendo a elemento estructural considerado.',
    ejecucion: 'Según indicaciones de geotécnico y planos de estructuras.',
  },
  contenciones: {
    bloque: 'Sistema de contenciones:',
    ejecucion: 'Según indicaciones de estudio geotécnico y planos de cimentación.',
  },
} as const;

// ── 3.1.4 Acción sísmica (NCSE-02) ──────────────────────────────────────────

export const NCSE = {
  titulo: '3.1.4. Acción sísmica (NCSE-02)',
  rd: 'RD 997/2002, de 27 de septiembre, por el que se aprueba la Norma de construcción sismorresistente: parte general y edificación (NCSR-02).',
  /** Los rótulos de la tabla sísmica completa, en el orden de la ficha del estudio. */
  rotulos: {
    clasificacion: 'Clasificación de la construcción:',
    tipoEstructura: 'Tipo de Estructura:',
    ab: 'Aceleración Sísmica Básica (ab):',
    K: 'Coeficiente de contribución (K):',
    rho: 'Coeficiente adimensional de riesgo (ρ):',
    S: 'Coeficiente de amplificación del terreno (S): (art. 2.2 de NCSE 02)',
    C: 'Coeficiente de tipo de terreno (C): (Valor de los 30 primeros metros bajo la superficie art. 2.4 NCSE 02)',
    ac: 'Aceleración sísmica de cálculo (ac):',
    metodo: 'Método de cálculo adoptado:',
    amortiguamiento: 'Factor de amortiguamiento:',
    periodo: 'Periodo de vibración de la estructura:',
    modos: 'Número de modos de vibración considerados:',
    fraccion: 'Fracción cuasi-permanente de sobrecarga:',
    ductilidad: 'Coeficiente de comportamiento por ductilidad:',
    segundoOrden: 'Efectos de segundo orden (efecto pΔ): (La estabilidad global de la estructura)',
    medidas: 'Medidas constructivas consideradas:',
    observaciones: 'Observaciones:',
  },
  textos: {
    ab: (ab: string) => `ab=${ab} g, (siendo g la aceleración de la gravedad)`,
    importancia: (importancia: string) => `(Construcción de ${importancia} importancia)`,
    rhoNormal: 'ρ=1, (en construcciones de normal importancia)',
    rhoEspecial: 'ρ=1,3, (en construcciones de especial importancia)',
    /** Defaults del perfil de estudio. */
    segundoOrden: 'Los desplazamientos reales de la estructura son los considerados en el cálculo multiplicados por 1.',
    medidas:
      'Especificaciones de la zona de cimentación según planos adjuntos. Atado de los pórticos de la estructura mediante losa de cimentación. Concentración de estribos en el pie y en cabeza de los pilares. Pasar las hiladas alternativamente de unos tabiques sobre los otros.',
    /** La observación de la ficha exenta, tras el motivo que publica el módulo de sismo. */
    exento: 'Por tanto, no se han considerado acciones sísmicas.',
  },
} as const;

// ── 3.1.5 Código Estructural ────────────────────────────────────────────────

export const CE = {
  titulo: '3.1.5. Cumplimiento del Código Estructural, Título 2 “Estructuras de hormigón”',
  subtitulo: '(RD 470/2021, de 29 de junio de 2021, por el que se aprueba el Código Estructural)',
  estructura: {
    titulo: '3.1.5.1. Estructura',
    rotulo: 'Descripción del sistema estructural:',
  },
  programa: {
    titulo: '3.1.5.2. Programa de cálculo:',
    rotulos: {
      nombre: 'Nombre comercial:',
      empresa: 'Empresa',
      descripcion: 'Descripción del programa: idealización de la estructura: simplificaciones efectuadas.',
    },
    /** Defaults del perfil de estudio (la JS-662). */
    nombre: 'Cypecad Espacial',
    version: 'V2022',
    empresa: 'Cype Ingenieros',
    domicilio: 'Avenida de Loring, 4. 03003 Alicante. España',
    descripcion:
      'El programa realiza un cálculo espacial en tres dimensiones por métodos matriciales de rigidez, formando las barras los elementos que definen la estructura: pilares, vigas, brochales y viguetas. Se establece la compatibilidad de deformación en todos los nudos considerando seis grados de libertad y se crea la hipótesis de indeformabilidad del plano de cada planta, para simular el comportamiento del forjado, impidiendo los desplazamientos relativos entre nudos de este. A los efectos de obtención de solicitaciones y desplazamientos, para todos los estados de carga se realiza un cálculo estático y se supone un comportamiento lineal de los materiales, por tanto, un cálculo en primer orden.',
  },
  memoriaCalculo: {
    bloque: 'Memoria de cálculo',
    rotulos: {
      metodo: 'Método de cálculo',
      redistribucion: 'Redistribución de esfuerzos:',
      deformaciones: 'Deformaciones',
      cuantias: 'Cuantías geométricas',
    },
    cabeceraFlechas: ['Lím. flecha total', 'Lím. flecha activa', 'Máx. recomendada'],
    /** Defaults del perfil de estudio. */
    metodo:
      'El dimensionado de secciones se realiza según la Teoría de los Estados Limites de la vigente CE, utilizando el Método de los Coeficientes Parciales, Anejo 18, Art. 3, 4 y 6. Se utilizan las combinaciones de hipótesis básicas definidas en el Anejo 19.',
    redistribucion: (porcentaje: number) =>
      `Se realiza una plastificación con los límites que establece el CE en su Artículo 5.5 “Análisis elástico lineal con redistribuciones limitadas, del Anejo 19, de hasta un ${porcentaje}% de momentos negativos en vigas`,
    flechasNota:
      'Valores de acuerdo con el Artículo 7.4, del Anejo 19 del CE. Para la estimación de flechas se considera la Inercia Equivalente (Ie) a partir de la Formula de Branson. Se considera el módulo de deformación Ec establecido en el CE, Anejo 19, Art. 3.1.3',
    cuantias: 'Estarán dentro de los límites máximos y mínimos fijados en el CE, Anejo 19, Art. 9.',
  },
  cargas: {
    titulo: '3.1.5.3. Estado de cargas consideradas:',
    combinaciones: {
      rotulo: 'Las combinaciones de las acciones consideradas se han establecido siguiendo los criterios de:',
      texto: 'CÓDIGO ESTRUCTURAL (CE) / DOCUMENTO BASICO SE (CODIGO TÉCNICO)',
    },
    valores: {
      rotulo: 'Los valores de las acciones serán los recogidos en:',
      texto: 'DOCUMENTO BASICO SE-AE (CODIGO TECNICO)',
    },
    verticales: {
      bloque: 'cargas verticales (valores en servicio)',
      forjadoUso: (uso: string) => `Forjado uso ${uso}`,
      pesoPropio: 'Peso propio forjado',
      resto: 'Solado + Acabado inferior',
      tabiqueria: 'Tabiquería',
      cubierta: 'Formación de cubierta',
      sobrecarga: 'Sobrecarga de uso',
      nieve: 'Nieve',
    },
    cerramientos: 'Verticales: Cerramientos',
    barandillas: { rotulo: 'Horizontales: Barandillas', texto: '0.8 KN/m a 1.20 metros de altura' },
    viento: {
      rotulo: 'Horizontales: Viento',
      texto: (qb: string, vb: string) =>
        `Se ha considerada la acción del viento estableciendo una presión dinámica de valor qb = ${qb} kN/m² sobre la superficie de fachadas. Esta presión se corresponde con una velocidad del viento de ${vb} m/s. Esta presión se ha considerado actuando en sus los dos ejes principales de la edificación.`,
    },
    termicas: {
      rotulo: 'Cargas Térmicas',
      conJuntas: (juntas: string, separacion: string) =>
        `Dadas las dimensiones del edificio se ha previsto ${juntas} de dilatación con una separación máxima de ${separacion} m, por lo que al haber adoptado las cuantías geométricas exigidas por el CE en la en los apartados A19.9.2.1 para vigas y A19.9.5.2 para pilares, no se ha contabilizado la acción de la carga térmica.`,
      conJuntasYTermicas: (juntas: string, separacion: string) =>
        `Se ha previsto ${juntas} de dilatación con una separación máxima de ${separacion} m, y se han considerado además las acciones térmicas y reológicas en el cálculo.`,
      sinJuntas:
        'No se han previsto juntas de dilatación, por lo que se han considerado las acciones térmicas y reológicas en el cálculo de la estructura.',
      sinJuntasNiTermicas:
        'No se han previsto juntas de dilatación. Dadas las dimensiones del edificio, y al haber adoptado las cuantías geométricas exigidas por el CE en los apartados A19.9.2.1 para vigas y A19.9.5.2 para pilares, no se ha contabilizado la acción de la carga térmica.',
      calavera:
        'La bibliografía especializada en Edificación, Proyecto y cálculo de estructuras de hormigón del Profesor J. Calavera, establece que para estructuras de hormigón armado con distancias máximas entre juntas entre 60 y 90 m para edificios de planta rectangular son valores aceptables.',
    },
    terreno: { rotulo: 'Sobrecargas En El Terreno', texto: (q: string) => `${q} kN/m².` },
  },
  materiales: {
    titulo: '3.1.5.4. Características de los materiales:',
    rotulos: {
      hormigon: 'Hormigón',
      cemento: 'Tipo de cemento',
      arido: 'Tamaño máximo de árido',
      ac: 'Máxima relación agua/cemento',
      cementoMin: 'Mínimo contenido de cemento',
      fck: 'fck',
      acero: 'Tipo de acero',
      fyk: 'fyk',
      ubicacion: 'Ubicación',
    },
  },
  coeficientes: {
    titulo: '3.1.5.5. Coeficientes de seguridad y niveles de control',
    intro: (ejecucion: string, hormigon: string, acero: string) =>
      `El nivel de control de ejecución de acuerdo con el art.º 22.4.1 de CE para esta obra es ${ejecucion}. El nivel control de materiales es ${hormigon} para el hormigón y ${acero} para el acero de acuerdo Anejo 19 Art. 2.4.2.4 CE`,
    cabecera: ['Material', 'Coeficiente', 'Valor', 'Nivel de control'],
    hormigon: 'Hormigón',
    acero: 'Acero',
    ejecucion: 'Ejecución',
    minoracion: 'Coeficiente de minoración',
    mayoracion: 'Coeficiente de mayoración',
    permanentes: 'Cargas Permanentes',
    variables: 'Cargas variables',
  },
  durabilidad: {
    titulo: '3.1.5.6. Durabilidad',
    exigidos: {
      rotulo: 'Recubrimientos exigidos:',
      texto: 'Al objeto de garantizar la durabilidad de la estructura durante su vida útil, el artículo 43 de la CE establece los siguientes parámetros.',
    },
    recubrimientos: {
      rotulo: 'Recubrimientos:',
      intro: 'Se siguen los criterios expuestos en el CE a la hora de determinar los recubrimientos en función del tipo de ambiente apartado 4 anejo 19 CE',
      elemento: (nombre: string, clases: string, cmin: string, cnom: string) =>
        `${nombre}: clase de exposición ${clases}; recubrimiento mínimo de ${cmin} mm, lo que requiere un recubrimiento nominal de ${cnom} mm.`,
      separadores:
        'Para garantizar estos recubrimientos se exigirá la disposición de separadores homologados de acuerdo con los criterios descritos en cuando a distancias y posición en el artículo 43.4.2 de la vigente CE.',
    },
    cementoMin: { rotulo: 'Cantidad mínima de cemento:', intro: 'Para el ambiente considerado, la cantidad mínima de cemento requerida es (Tabla 43.2.1.a):' },
    cementoMax: { rotulo: 'Cantidad máxima de cemento:', texto: 'Según especificaciones CE.' },
    resistenciaMin: { rotulo: 'Resistencia mínima esperada:', intro: 'Para el ambiente considerado, la resistencia mínima del hormigón esperada es (Tabla 43.2.1.b):' },
    agua: { rotulo: 'Relación agua cemento:', intro: 'Para el ambiente considerado, la máxima relación agua/cemento es (Tabla 43.2.1.a):' },
  },
} as const;

// ── 3.1.6 Forjados ──────────────────────────────────────────────────────────

export const FORJADOS = {
  titulo: '3.1.6. Características de los forjados.',
  intro:
    'Los forjados se proyectan conforme al Código Estructural (RD 470/2021), Anejo 19, y se definen en los planos de estructura por su canto, su geometría y sus armados.',
  rotulos: {
    material: 'Material adoptado:',
    unidades: 'Sistema de unidades adoptado:',
    dimensiones: 'Dimensiones y armado:',
    observaciones: 'Observaciones:',
    cantoTotal: 'Canto Total',
    capaCompresion: 'Capa de Compresión',
    intereje: 'Intereje',
    anchoNervio: 'Ancho del nervio',
    tipoVigueta: 'Tipo de Vigueta',
    tipoBovedilla: 'Tipo de Bovedilla',
    tipoCaseton: 'Tipo de casetón',
    hormigonInSitu: 'Hormigón “in situ”',
    aceroRefuerzos: 'Acero refuerzos',
    pesoPropio: 'Peso propio total',
  },
  cabeceraFlechas: ['Límite de la flecha total a plazo infinito', 'Límite relativo de la flecha activa', 'Límite absoluto de la flecha activa'],
  flecha: (limite: string) => `flecha ≤ ${limite}`,
  unidireccional: {
    titulo: 'Características técnicas de los forjados unidireccionales',
    material:
      'Forjados unidireccionales compuestos de viguetas de hormigón, más piezas de entrevigado aligerantes (bovedillas de hormigón vibroprensado), con armadura de reparto y hormigón vertido en obra en relleno de nervios y formando la losa superior (capa de compresión).',
    unidades: 'Se indican en los planos de los forjados los armados de refuerzo inferior, superior y cortante.',
    observaciones:
      'El hormigón de las viguetas cumplirá las condiciones especificadas en el Código Estructural. Las armaduras activas y pasivas cumplirán las condiciones especificadas en el Código Estructural. El control de los recubrimientos de las viguetas cumplirá las condiciones especificadas en el Código Estructural.',
  },
  losa: {
    titulo: 'Características técnicas de los forjados de losas macizas de hormigón armado',
    material:
      'Los forjados de losas macizas se definen por el canto (espesor del forjado) y la armadura, consta de una malla que se dispone en dos capas (superior e inferior) con los detalles de refuerzo a punzonamiento (en los pilares), con las cuantías y separaciones según se indican en los planos de los forjados de la estructura.',
    unidades:
      'Se indican en los planos de los forjados de las losas macizas de hormigón armado los detalles de la sección del forjado, indicando el espesor total, y la cuantía y separación de la armadura.',
    observaciones:
      'En lo que respecta al estudio de la deformabilidad de las vigas de hormigón armado y los forjados de losas macizas de hormigón armado se han seguido las indicaciones del apartado 4.3 del CTE DB-SE. Los límites de deformación vertical (flechas) de las vigas y de los forjados de losas macizas, establecidos para asegurar la compatibilidad de deformaciones de los distintos elementos estructurales y constructivos, son los que se señalan en el cuadro que se incluye a continuación, según lo establecido en el apartado 4.3 del CTE DB-SE:',
  },
  reticular: {
    titulo: 'Características técnicas de los forjados reticulares',
    materialPerdido:
      'Los forjados reticulares están compuestos por nervios de hormigón armado en dos direcciones más piezas de entrevigado aligerantes (casetones perdidos), compuestas por bovedillas aligerantes de hormigón vibroprensado y hormigón vertido en obra en relleno de nervios y formando la losa superior (capa de compresión), según detalles mostrados en los planos de la estructura.',
    materialRecuperable:
      'Los forjados reticulares están compuestos por nervios de hormigón armado en dos direcciones más piezas de entrevigado aligerantes (casetones recuperables), y hormigón vertido en obra en relleno de nervios y formando la losa superior (capa de compresión), según detalles mostrados en los planos de la estructura.',
    unidades:
      'Se indican en los planos de los forjados los detalles de la sección del forjado, indicando el espesor total, el intereje, ancho del nervio, dimensiones de las piezas de entrevigado y el espesor de la capa de compresión. Así mismo se indican los armados de los nervios inferiores y superiores en ambas direcciones.',
    observaciones:
      'En lo que respecta al estudio de la deformabilidad de las vigas de hormigón armado y los forjados reticulares, que son elementos estructurales solicitados a flexión simple o compuesta, se han aplicado las disposiciones descritas en el artículo 7.4.1 del Anejo 19 del Código Estructural, donde se establece la relación luz / canto útil para elementos de hormigón armado sin esfuerzo axil de compresión en la tabla A19.7.4. Además de establecer los casos en los que se pueden omitir los cálculos en el artículo 7.4.2 del Anejo 19 del Código Estructural. Los límites de deformación vertical (flechas) de las vigas y de los forjados reticulares, establecidos para asegurar la compatibilidad de deformaciones de los distintos elementos estructurales y constructivos, son los que se señalan en el cuadro que se incluye a continuación, según lo establecido en el artículo 7.4.1 del Anejo 19 del Código Estructural.',
  },
  /** Chapa colaborante, madera y «otro» no tienen ficha propia en la plantilla colegial: un párrafo. */
  otro: (tipo: string, canto: string, pp: string) =>
    `Forjado de tipo ${tipo}, de ${canto} cm de canto total y ${pp} kN/m² de peso propio, definido en los planos de estructura.`,
} as const;

// ── 3.1.7 Estructuras de acero (SE-A) ───────────────────────────────────────

export const SEA = {
  titulo: '3.1.7. Estructuras de acero (SE-A)',
  bases: {
    titulo: '3.1.7.1. Bases de cálculo',
    criterios: {
      bloque: 'Criterios de verificación',
      intro: 'La verificación de los elementos estructurales de acero se ha realizado:',
      programa: (nombre: string, version: string, empresa: string, domicilio: string) =>
        `Mediante programa informático, para toda la estructura. Nombre del programa: ${nombre}. Versión: ${version}. Empresa: ${empresa}. Domicilio: ${domicilio}.`,
      manual: 'Manualmente, para toda la estructura, presentándose la justificación de las verificaciones.',
      estados: 'Se han seguido los criterios indicados en el Código Técnico para realizar la verificación de la estructura en base a los siguientes estados límites:',
      elu: ['Estado límite último', 'Se comprueba los estados relacionados con fallos estructurales como son la estabilidad y la resistencia.'],
      els: ['Estado límite de servicio', 'Se comprueba los estados relacionados con el comportamiento estructural en servicio.'],
    },
    modelado: {
      bloque: 'Modelado y análisis',
      texto:
        'El análisis de la estructura se ha basado en un modelo que proporciona una previsión suficientemente precisa del comportamiento de esta. Las condiciones de apoyo que se consideran en los cálculos corresponden con las disposiciones constructivas previstas. Se consideran a su vez los incrementos producidos en los esfuerzos por causa de las deformaciones (efectos de 2º orden) allí donde no resulten despreciables. En el análisis estructural se han tenido en cuenta las diferentes fases de la construcción, incluyendo el efecto del apeo provisional de los forjados cuando así fuere necesario.',
      pilaresYVigas: 'La estructura está formada por pilares y vigas.',
      juntas: (separacion: string) => `Existen juntas de dilatación, con una separación máxima entre juntas de ${separacion} metros.`,
      sinJuntas: 'No existen juntas de dilatación.',
      termicasSi: 'Se han tenido en cuenta las acciones térmicas y reológicas en el cálculo.',
      termicasNo: 'No se han tenido en cuenta las acciones térmicas y reológicas en el cálculo.',
      calavera: CE.cargas.termicas.calavera,
      constructivo: 'Durante el proceso constructivo no se producen solicitaciones que aumenten las inicialmente previstas para la entrada en servicio del edificio',
    },
    elu: {
      bloque: 'Estados límite últimos',
      estabilidad: 'La verificación de la capacidad portante de la estructura de acero se ha comprobado para el estado límite último de estabilidad, en donde:',
      leyendaEstabilidad: 'siendo: Ed,dst el valor de cálculo del efecto de las acciones desestabilizadoras; Ed,stb el valor de cálculo del efecto de las acciones estabilizadoras',
      resistencia: 'y para el estado límite último de resistencia, en donde',
      leyendaResistencia: 'siendo: Ed el valor de cálculo del efecto de las acciones; Rd el valor de cálculo de la resistencia correspondiente',
      segundoOrden: 'Al evaluar Ed y Rd, se han tenido en cuenta los efectos de segundo orden de acuerdo con los criterios establecidos en el Documento Básico.',
    },
    els: {
      bloque: 'Estados límite de servicio',
      texto: 'Para los diferentes estados límite de servicio se ha verificado que:',
      leyenda: 'siendo: Eser el efecto de las acciones de cálculo; Clim valor límite para el mismo efecto.',
    },
    geometria: {
      bloque: 'Geometría',
      texto: 'En la dimensión de la geometría de los elementos estructurales se ha utilizado como valor de cálculo el valor nominal de proyecto.',
    },
  },
  durabilidad: {
    titulo: '3.1.7.2. Durabilidad',
    texto:
      'Se han considerado las estipulaciones del apartado “3 Durabilidad” del “Documento Básico SE-A. Seguridad estructural. Estructuras de acero”, y que se recogen en el presente proyecto en el apartado de “Pliego de Condiciones Técnicas”.',
  },
  materiales: {
    titulo: '3.1.7.3. Materiales',
    rotulo: 'El tipo de acero utilizado en chapas y perfiles es:',
    tabla41: {
      caption: 'Tabla 4.1 del DB SE-A. Características mecánicas mínimas de los aceros',
      cabecera: ['Designación', 'fy (N/mm²) t ≤ 16', 'fy (N/mm²) 16 < t ≤ 40', 'fy (N/mm²) 40 < t ≤ 63', 'fu (N/mm²) 3 ≤ t ≤ 100', 'Temperatura del ensayo Charpy ºC'],
      filas: [
        ['S235JR', '235', '225', '215', '360', '20'],
        ['S235J0', '235', '225', '215', '360', '0'],
        ['S235J2', '235', '225', '215', '360', '-20'],
        ['S275JR', '275', '265', '255', '410', '20'],
        ['S275J0', '275', '265', '255', '410', '0'],
        ['S275J2', '275', '265', '255', '410', '-20'],
        ['S355JR', '355', '345', '335', '470', '20'],
        ['S355J0', '355', '345', '335', '470', '0'],
        ['S355J2', '355', '345', '335', '470', '-20'],
        ['S355K2', '355', '345', '335', '470', '-20 (1)'],
        ['S450J0', '450', '430', '410', '550', '0'],
      ],
      notas: ['(1) Se le exige una energía mínima de 40J.', 'fy tensión de límite elástico del material', 'fu tensión de rotura'],
    },
  },
  analisis: {
    titulo: '3.1.7.4. Análisis estructural',
    texto:
      'La comprobación ante cada estado límite se realiza en dos fases: determinación de los efectos de las acciones (esfuerzos y desplazamientos de la estructura) y comparación con la correspondiente limitación (resistencias y flechas y vibraciones admisibles respectivamente). En el contexto del “Documento Básico SE-A. Seguridad estructural. Estructuras de acero” a la primera fase se la denomina de análisis y a la segunda de dimensionado.',
  },
  elu: {
    titulo: '3.1.7.5. Estados límite últimos',
    texto:
      'La comprobación frente a los estados límites últimos supone la comprobación ordenada frente a la resistencia de las secciones, de las barras y las uniones. El valor del límite elástico utilizado será el correspondiente al material base según se indica en el apartado 3 del “Documento Básico SE-A. Seguridad estructural. Estructuras de acero”. No se considera el efecto de endurecimiento derivado del conformado en frío o de cualquier otra operación. Se han seguido los criterios indicados en el apartado “6 Estados límite últimos” del “Documento Básico SE-A. Seguridad estructural. Estructuras de acero” para realizar la comprobación de la estructura, en base a los siguientes criterios de análisis:',
    secciones: {
      intro: 'Descomposición de la barra en secciones y cálculo en cada una de ellas de los valores de resistencia:',
      items: [
        'Resistencia de las secciones a tracción',
        'Resistencia de las secciones a corte',
        'Resistencia de las secciones a compresión',
        'Resistencia de las secciones a flexión',
        'Interacción de esfuerzos: flexión compuesta sin cortante; flexión y cortante; flexión, axil y cortante',
      ],
    },
    barras: {
      intro: 'Comprobación de las barras de forma individual según esté sometida a:',
      items: ['Tracción', 'Compresión', 'Flexión', 'Interacción de esfuerzos: elementos flectados y traccionados; elementos comprimidos y flectados'],
    },
  },
  els: {
    titulo: '3.1.7.6. Estados límite de servicio',
    texto:
      'Para las diferentes situaciones de dimensionado se ha comprobado que el comportamiento de la estructura en cuanto a deformaciones, vibraciones y otros estados límite, está dentro de los límites establecidos en el apartado “7.1.3. Valores límites” del “Documento Básico SE-A. Seguridad estructural. Estructuras de acero”.',
  },
} as const;

// ── 3.1.8 Estructuras de fábrica (SE-F) ─────────────────────────────────────
// Redactado con la estructura del 3.1.7: las fichas del estudio nunca lo
// desarrollan. Las referencias son las del DB SE-F (junio 2019).

export const SEF = {
  titulo: '3.1.8. Estructuras de fábrica (SE-F)',
  bases: {
    titulo: '3.1.8.1. Bases de cálculo',
    texto:
      'La verificación de los elementos estructurales de fábrica se ha realizado siguiendo los criterios del capítulo 2 “Bases de cálculo” del “Documento Básico SE-F. Seguridad estructural. Fábrica”, en base a los estados límite últimos de capacidad portante (capítulo 6) y a los estados límite de servicio de aptitud al servicio (capítulo 7).',
    programa: SEA.bases.criterios.programa,
    manual: SEA.bases.criterios.manual,
    modelado:
      'El análisis de la estructura se ha basado en un modelo que proporciona una previsión suficientemente precisa de su comportamiento, conforme al capítulo 5 “Comportamiento estructural” del DB SE-F, considerando los muros como elementos sometidos a compresión con la excentricidad que se deriva de las acciones y de las condiciones de apoyo de los forjados.',
  },
  durabilidad: {
    titulo: '3.1.8.2. Durabilidad',
    texto:
      'Se han considerado las estipulaciones del capítulo 3 “Durabilidad” del “Documento Básico SE-F. Seguridad estructural. Fábrica”: las piezas, el mortero y las armaduras se eligen en función de la clase de exposición del elemento, y las condiciones de ejecución y protección se recogen en el apartado de “Pliego de Condiciones Técnicas” del presente proyecto.',
  },
  materiales: {
    titulo: '3.1.8.3. Materiales',
    intro: 'Los materiales de la fábrica y sus características se establecen conforme al capítulo 4 “Materiales” del DB SE-F:',
    rotulos: {
      pieza: 'Tipo de pieza',
      fb: 'Resistencia normalizada a compresión de las piezas, fb',
      fm: 'Resistencia a compresión del mortero, fm',
      fk: 'Resistencia característica a compresión de la fábrica, fk (tabla 4.4)',
      categoria: 'Categoría de control de fabricación de las piezas',
      ejecucion: 'Clase de ejecución',
      gammaM: 'Coeficiente parcial de seguridad del material, γM (tabla 4.8)',
    },
  },
  analisis: {
    titulo: '3.1.8.4. Análisis estructural',
    texto:
      'La comprobación ante cada estado límite se realiza en dos fases: determinación de los efectos de las acciones (esfuerzos y desplazamientos de la estructura) y comparación con la correspondiente limitación. Los esfuerzos se obtienen del análisis de la estructura completa, considerando la fábrica como material de comportamiento elástico y lineal hasta el agotamiento, con las excentricidades de las cargas que establece el apartado 5.2 del DB SE-F.',
  },
  elu: {
    titulo: '3.1.8.5. Estados límite últimos',
    texto:
      'Se han seguido los criterios del capítulo 6 “Capacidad portante” del DB SE-F: comprobación de los muros a compresión vertical con el factor de reducción por esbeltez y excentricidad, a cortante y a flexión por acciones perpendiculares a su plano, y de los elementos de arriostramiento y de sus uniones con los forjados.',
  },
  els: {
    titulo: '3.1.8.6. Estados límite de servicio',
    texto:
      'Se han seguido los criterios del capítulo 7 “Aptitud al servicio” del DB SE-F, comprobando que las deformaciones y la fisuración de los elementos de fábrica quedan dentro de los límites que el propio documento y el DB SE establecen.',
  },
} as const;

// ── 3.1.9 Estructuras de madera (SE-M) ──────────────────────────────────────
// Ídem: estructura del 3.1.7 con las referencias del DB SE-M (junio 2019).

export const SEM = {
  titulo: '3.1.9. Estructuras de madera (SE-M)',
  bases: {
    titulo: '3.1.9.1. Bases de cálculo',
    texto:
      'La verificación de los elementos estructurales de madera se ha realizado siguiendo los criterios del capítulo 2 “Bases de cálculo” del “Documento Básico SE-M. Seguridad estructural. Madera”, en base a los estados límite últimos (capítulo 6) y a los estados límite de servicio (capítulo 7). Los valores de cálculo de las propiedades del material se obtienen de los característicos con el factor de modificación kmod de la tabla 2.4, función de la clase de servicio y de la duración de la carga, y con el coeficiente parcial γM de la tabla 2.3.',
    programa: SEA.bases.criterios.programa,
    manual: SEA.bases.criterios.manual,
    claseServicio: (grupo: string, clase: string, descripcion: string) =>
      `${grupo}: clase de servicio ${clase} (${descripcion}), según el apartado 2.2.2.2 del DB SE-M.`,
  },
  durabilidad: {
    titulo: '3.1.9.2. Durabilidad',
    texto:
      'Se han considerado las estipulaciones del capítulo 3 “Durabilidad” del “Documento Básico SE-M. Seguridad estructural. Madera”: cada elemento se asigna a su clase de uso (apartado 3.2.1.2) y, en función de ella y de la durabilidad natural de la especie, se establece la protección preventiva frente a agentes bióticos (tabla 3.1) y la protección de los elementos metálicos de unión (tabla 3.2). Las condiciones se recogen en el cuadro de durabilidad y en el apartado de “Pliego de Condiciones Técnicas” del presente proyecto.',
  },
  materiales: {
    titulo: '3.1.9.3. Materiales',
    intro:
      'Las clases resistentes de la madera aserrada y de la madera laminada encolada, y sus valores característicos, son los del capítulo 4 “Materiales” y el Anejo E del DB SE-M:',
  },
  analisis: {
    titulo: '3.1.9.4. Análisis estructural',
    texto:
      'La comprobación ante cada estado límite se realiza en dos fases: determinación de los efectos de las acciones (esfuerzos y desplazamientos de la estructura) y comparación con la correspondiente limitación. El análisis se ha realizado conforme al capítulo 5 “Análisis estructural” del DB SE-M, con un comportamiento elástico y lineal del material y considerando la deformabilidad de las uniones cuando no resulta despreciable.',
  },
  elu: {
    titulo: '3.1.9.5. Estados límite últimos',
    texto:
      'Se han seguido los criterios del capítulo 6 “Estados límite últimos” del DB SE-M: agotamiento de secciones sometidas a tracción, compresión, flexión, cortante y torsión, y sus combinaciones; estabilidad de las piezas frente al pandeo y al vuelco lateral; y capacidad de las uniones conforme al capítulo 8.',
  },
  els: {
    titulo: '3.1.9.6. Estados límite de servicio',
    texto:
      'Se han seguido los criterios del capítulo 7 “Estados límite de servicio” del DB SE-M, comprobando las deformaciones instantáneas y diferidas —con el factor kdef de la tabla 7.1— y las vibraciones, dentro de los límites que establece el DB SE.',
  },
} as const;

// ── Catálogos de etiquetas ──────────────────────────────────────────────────

/** El tipo de estructura para la tabla sísmica, desde el sistema estructural del módulo de sismo. */
export const TIPO_ESTRUCTURA_SISMO: Record<SistemaEstructural, string> = {
  fabrica: 'Muros de fábrica de ladrillo o bloques',
  'porticos-ha': 'Pórticos de hormigón armado',
  'porticos-ha-pantallas': 'Pórticos de hormigón armado con pantallas',
  'porticos-acero': 'Pórticos rígidos de acero laminado',
  'acero-triangulado': 'Estructura de acero con planos triangulados resistentes',
  'mamposteria-seco': 'Mampostería en seco',
  adobe: 'Adobe',
  tapial: 'Tapial',
  otro: 'Otra',
};

/** El rótulo del apartado 3.1.6.n según el tipo de forjado que publica Cargas por planta. */
export const TITULO_FORJADO: Record<string, string> = {
  unidireccional: FORJADOS.unidireccional.titulo,
  losa: FORJADOS.losa.titulo,
  solera: 'Características técnicas de las soleras de hormigón armado',
  reticular: FORJADOS.reticular.titulo,
  chapa: 'Características técnicas de los forjados de chapa colaborante',
  madera: 'Características técnicas de los forjados de madera',
  otro: 'Características técnicas de otros forjados',
};

export const IMPORTANCIA_TEXTO: Record<string, string> = {
  normal: 'normal',
  especial: 'especial',
};

/** El amortiguamiento en palabras, como lo escribe la ficha del estudio. */
export const AMORTIGUAMIENTO_TEXTO = (omega: string, sistema: string): string =>
  `Estructura de ${sistema.toLowerCase()} compartimentada: ${omega}%`;
