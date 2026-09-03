/**
 * Cuadro de materiales — tipos del dominio.
 *
 * El módulo tiene una regla de oro: **el usuario no teclea códigos de norma**.
 * Contesta preguntas de obra («¿dónde va a estar este hormigón?») y el motor
 * deriva la clase de exposición, la dosificación, el recubrimiento y la
 * tipificación. Por eso `SituacionElemento` está escrito en lenguaje de obra y
 * `ClaseExposicion` sólo aparece en la SALIDA (o como override explícito).
 *
 * Fuentes: Código Estructural (RD 470/2021) y CTE DB SE-M. Cada tabla lleva su
 * referencia en `tablasCE.ts` / `tablasMadera.ts`.
 */

// ── Hormigón ────────────────────────────────────────────────────────────────

/** CE tabla 27.1.a. Designación de la clase de exposición. */
export type ClaseExposicion =
  | 'X0'
  | 'XC1' | 'XC2' | 'XC3' | 'XC4'
  | 'XS1' | 'XS2' | 'XS3'
  | 'XD1' | 'XD2' | 'XD3'
  | 'XF1' | 'XF2' | 'XF3' | 'XF4'
  | 'XA1' | 'XA2' | 'XA3'
  | 'XM1' | 'XM2' | 'XM3';

export type TipoHormigon = 'masa' | 'armado' | 'pretensado';

/** CE tabla 44.2.1.1.a/b y 44.3/44.4: la vida útil de proyecto sólo toma dos valores tabulados. */
export type VidaUtil = 50 | 100;

/** CE tabla 33.5.a. La letra que va en la tipificación T-R/C/TM/A. */
export type Consistencia = 'seca' | 'plastica' | 'blanda' | 'fluida' | 'liquida';

/**
 * Designaciones de cemento que las tablas de recubrimiento del CE distinguen.
 * No es el catálogo completo de la UNE-EN 197-1: es el conjunto mínimo que
 * cambia una respuesta numérica en las tablas 44.2.1.1.a/b, 44.3 y 44.4.
 */
export type TipoCemento =
  | 'CEM I'
  | 'CEM II/A-D'
  | 'CEM II/A-P' | 'CEM II/A-S' | 'CEM II/A-V'
  | 'CEM II/B-S' | 'CEM II/B-P' | 'CEM II/B-V'
  | 'CEM III/A' | 'CEM III/B'
  | 'CEM IV' | 'CEM V';

/** CE tabla 43.4.1 — margen de recubrimiento Δcdev según el nivel de control de ejecución. */
export type NivelControlEjecucion = 'prefabricado_intenso' | 'in_situ_intenso' | 'normal';

/** Nivel de control de la conformidad del hormigón (CE cap. 13/14). Se arrastra al cuadro, no se deriva. */
export type NivelControlHormigon = 'estadistico' | 'indirecto' | '100_por_100';

/** Dónde vive el elemento. Pregunta 1 del formulario. */
export type Ubicacion =
  /** Interior de edificio con humedad muy baja, HR < 45 %. */
  | 'interior_muy_seco'
  /** Interior de recinto cerrado con humedad del aire baja, HR < 65 %. */
  | 'interior_seco'
  /** Interior de recinto cerrado con humedad media o alta, HR > 65 %. */
  | 'interior_humedo'
  /** Exterior protegido de la lluvia. */
  | 'exterior_protegido'
  /** Exterior expuesto a la lluvia (sequedad y humedad cíclicas). */
  | 'exterior_lluvia'
  /** Enterrado en suelo no agresivo o en contacto permanente con agua (cimentaciones). */
  | 'enterrado'
  /** Permanentemente sumergido en agua no agresiva. */
  | 'sumergido_agua_no_agresiva';

/** Ambiente marino. Es el que enciende el «modificador de obra en la costa». */
export type AmbienteMarino =
  | 'ninguno'
  /** Aerosoles marinos sin contacto directo con el agua (estructura a menos de 5 km de la costa). */
  | 'aereo'
  /** Permanentemente sumergido en agua de mar. */
  | 'sumergido'
  /** Zona de carrera de mareas, oleaje o salpicaduras. */
  | 'carrera_mareas';

/** Cloruros que NO vienen del mar (CE 27.1.a, grupo 3). */
export type OrigenCloruros =
  | 'ninguno'
  /** Aerosoles con iones cloruro de origen no marino. */
  | 'aerosoles'
  /** Piscinas y elementos expuestos a aguas industriales con cloruros. */
  | 'piscina'
  /** Salpicaduras de aguas con cloruros / sales de deshielo, losas de aparcamiento. */
  | 'salpicaduras';

/** Hielo/deshielo (CE 27.1.a, grupo 5). */
export type Helada =
  | 'ninguna'
  | 'moderada'
  | 'moderada_con_sales'
  | 'alta'
  | 'alta_con_sales';

/** Agresividad química del medio (CE tabla 27.1.b). */
export type AgresividadQuimica = 'ninguna' | 'debil' | 'moderada' | 'alta';

/** Erosión/abrasión (CE 27.1.a, grupo 7). */
export type Erosion = 'ninguna' | 'moderada' | 'intensa' | 'extrema';

/** Las preguntas de obra de las que sale la clase de exposición. */
export interface SituacionElemento {
  ubicacion: Ubicacion;
  marino?: AmbienteMarino;
  cloruros?: OrigenCloruros;
  helada?: Helada;
  quimico?: AgresividadQuimica;
  erosion?: Erosion;
}

/** Una fila del cuadro de hormigón. */
export interface ElementoHormigon {
  id: string;
  /** «Muros», «Cimentación», «Forjados», «Piscina»… Va literal a la columna Localización. */
  nombre: string;
  tipoHormigon: TipoHormigon;
  situacion: SituacionElemento;
  /**
   * Override del automatismo. Si está presente, manda sobre `situacion` y el
   * motor lo marca como forzado (estado «revisar» en la UI).
   */
  clasesForzadas?: ClaseExposicion[];
  /** Resistencia característica especificada por el proyectista (N/mm²). */
  fckEspecificada: number;
  consistencia: Consistencia;
  /** Tamaño máximo del árido, mm (CE 30.3). */
  tamMaxArido: number;
  /** Diámetro de la armadura principal, mm. Entra en el cmin por adherencia (CE 44.2.1.1.a). */
  diametroArmadura?: number;
  /** Pieza hormigonada contra el terreno (CE 44.2.1.1: 70 mm salvo hormigón de limpieza). */
  contraTerreno?: boolean;
  /** Se ha preparado el terreno y dispuesto hormigón de limpieza: no rige el 70 mm. */
  conHormigonLimpieza?: boolean;
  /**
   * ¿Tiene caras vistas al aire libre? Es lo que el modificador «obra en la
   * costa» necesita saber: en el cuadro real de ABAYALDE los muros se endurecen
   * a XS1 y la cimentación, enterrada, no.
   */
  expuestoAireExterior?: boolean;
  /** Nota de proyecto: hormigón hidrófugo (vasos de piscina, aljibes). */
  hidrofugo?: boolean;
  nivelControl?: NivelControlHormigon;
}

/** Ajustes de obra que afectan a todos los elementos. */
export interface OpcionesObra {
  vidaUtil: VidaUtil;
  cemento: TipoCemento;
  /** Adición de humo de sílice > 6 % — cambia de familia en las tablas 44.2.1.1.b y 44.4. */
  microsilice?: boolean;
  /** Adición de cenizas volantes > 20 % — ídem. */
  cenizasVolantes?: boolean;
  nivelControlEjecucion: NivelControlEjecucion;
  /**
   * «Obra en la costa». Añade XS1 a todo elemento expuesto al exterior que no
   * declare ya un ambiente marino. Es el modificador de obra del cuadro real de
   * ABAYALDE: endurece dosificación y recubrimiento de varios elementos a la vez.
   */
  costa?: boolean;
}

/** De dónde sale un valor derivado: para el tooltip del modo Ayuda. */
export interface Traza {
  /** Artículo o tabla del Código Estructural. */
  referencia: string;
  /** Explicación en lenguaje llano. */
  explicacion: string;
}

export type Severidad = 'info' | 'aviso' | 'error';

/**
 * Una nota al pie del cuadro. `columna` dice a qué celda se pega la llamada
 * (*), (**)… en el cuadro de plano: el oráculo las reparte entre la
 * localización y el recubrimiento, no todas al mismo sitio.
 */
export interface NotaCuadro {
  texto: string;
  columna: 'localizacion' | 'recubrimiento';
}

export interface Mensaje {
  severidad: Severidad;
  texto: string;
  referencia?: string;
}

export interface DerivacionHormigon {
  elemento: ElementoHormigon;
  /** Todas las clases aplicables, ordenadas como en la tabla 27.1.a. */
  clases: ClaseExposicion[];
  /** Si el usuario forzó las clases en vez de dejarlas derivar. */
  clasesForzadas: boolean;
  /** CE tabla 43.2.1.a — máxima relación agua/cemento. */
  acMax: number | null;
  /** CE tabla 43.2.1.a — contenido mínimo de cemento, kg/m³. */
  cementoMin: number | null;
  /** CE tabla 43.3.5 — contenido máximo de cemento en clases XM, kg/m³. */
  cementoMax: number | null;
  /** CE tabla 43.2.1.b — resistencia característica mínima esperada, N/mm². */
  fckMin: number | null;
  /** La que va a la tipificación: max(especificada, fckMin) (CE 43.2.1). */
  fckAdoptada: number;
  /** Recubrimiento mínimo por durabilidad, mm (CE tablas 44.2.1.1.a/b, 44.3, 44.4). */
  cminDurabilidad: number | null;
  /** Recubrimiento mínimo por adherencia, mm (CE 44.2.1.1 a): ≥ ø y ≥ 0,8·TM). */
  cminAdherencia: number;
  cmin: number;
  /** CE tabla 43.4.1. */
  deltaCdev: number;
  /** cnom = cmin + Δcdev, redondeado a 5 mm hacia arriba. */
  cnom: number;
  /** CE 33.6 — T-R/C/TM/A. */
  tipificacion: string;
  /** fcd = fck/γc con γc = 1,50 (situación persistente o transitoria, CE tabla A19.2.1). */
  fcd: number;
  notas: NotaCuadro[];
  mensajes: Mensaje[];
  trazas: Traza[];
}

// ── Acero ───────────────────────────────────────────────────────────────────

export type AceroPasivo = 'B400S' | 'B500S' | 'B400SD' | 'B500SD';
export type MallaElectrosoldada = 'ME-500 T' | 'ME-500 SD';
export type AceroEstructural = 'S235JR' | 'S275JR' | 'S355JR' | 'S355J2' | 'S450J0';

/** CE 91.2.1 — nivel de riesgo (clase de consecuencia). */
export type NivelRiesgo = 'CC1' | 'CC2' | 'CC3';
/** CE 91.2.2.1 — categoría de uso. */
export type CategoriaUso = 'SC1' | 'SC2';
/** CE 91.2.2.2 — categoría de ejecución. */
export type CategoriaEjecucion = 'PC1' | 'PC2';
/** CE tabla 91.1 — clase de ejecución EXC. */
export type ClaseEjecucion = 1 | 2 | 3 | 4;

/** CE tabla 80.1.a — corrosividad atmosférica del acero estructural. */
export type ClaseCorrosividad = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';

export type MedioUnion = 'soldadura' | 'atornillado';
export type ProteccionAcero = 'pintura' | 'galvanizado' | 'ninguna';

/** Una fila del bloque de acero estructural. */
export interface ElementoAcero {
  id: string;
  nombre: string;
  designacion: AceroEstructural;
  union: MedioUnion;
  /** «EN ÁNGULO» para soldadura, «5.6»/«8.8» para tornillería. Texto libre del cuadro. */
  caracteristicasUnion: string;
  corrosividad: ClaseCorrosividad;
  proteccion: ProteccionAcero;
  /** «Doble capa», «En fábrica»… */
  caracteristicasProteccion: string;
}

export interface DerivacionAcero {
  nivelRiesgo: NivelRiesgo;
  categoriaUso: CategoriaUso;
  categoriaEjecucion: CategoriaEjecucion;
  claseEjecucion: ClaseEjecucion;
  elementos: ElementoAcero[];
  trazas: Traza[];
}

// ── Madera ──────────────────────────────────────────────────────────────────

/** DB SE-M 2.2.2.2. */
export type ClaseServicio = 1 | 2 | 3;
/** DB SE-M 3.2.1.2. */
export type ClaseUso = '1' | '2' | '3.1' | '3.2' | '4' | '5';
/** DB SE-M tabla 2.3 — el material decide el γM. */
export type TipoMadera =
  | 'maciza'
  | 'laminada'
  | 'microlaminada'
  | 'tablero_contrachapado'
  | 'tablero_virutas'
  | 'tablero_particulas'
  | 'tablero_fibras';

/** Dónde vive el elemento de madera. Pregunta de obra de la que salen clase de servicio y clase de uso. */
export type SituacionMadera =
  /** Interior de edificio, protegido de la intemperie. */
  | 'interior'
  /** Interior con humedad ambiental elevada o condensaciones ocasionales (piscina cubierta). */
  | 'interior_humedo'
  /** A cubierto pero abierto al ambiente exterior (cobertizos, viseras). */
  | 'cubierto_abierto'
  /** Al exterior, por encima del suelo, protegido por albardilla o piezas de sacrificio. */
  | 'exterior_protegido'
  /** Al exterior, por encima del suelo y sin proteger. */
  | 'exterior_descubierto'
  /** En contacto con el suelo o con agua dulce. */
  | 'contacto_suelo'
  /** Permanentemente en contacto con agua salada. */
  | 'agua_salada';

/** Un grupo de elementos de madera (el cuadro real agrupa: «Vigas y pilares», «Correas y riostras»). */
export interface GrupoMadera {
  id: string;
  nombre: string;
  situacion: SituacionMadera;
  tipo: TipoMadera;
  /** C24, GL24h… La clase resistente no la deriva este módulo (la fija el cálculo). */
  claseResistente: string;
  /** Nombre comercial o botánico. Opcional: la clase resistente no obliga a especie (DB SE-M 3.2.3). */
  especie?: string;
  /** Calidad de la madera aserrada (ME-1, ME-2, MEG…). */
  calidad?: string;
  /** Clase resistente de las láminas en laminada encolada (T14…). */
  claseLaminas?: string;
  /** Override de la clase de servicio cuando el proyectista quiera forzarla. */
  claseServicioForzada?: ClaseServicio;
}

export interface DerivacionMadera {
  grupo: GrupoMadera;
  claseServicio: ClaseServicio;
  claseServicioForzada: boolean;
  claseUso: ClaseUso;
  /** DB SE-M tabla 3.1 — nivel de penetración exigido al tratamiento. */
  nivelPenetracion: string;
  /** Requisito de penetración en texto (columna derecha de la tabla 3.1). */
  exigenciaPenetracion: string;
  /** DB SE-M tabla 2.3, situaciones persistentes y transitorias. */
  gammaM: number;
  /** Situaciones extraordinarias (incendio incluido): γM = 1,0. */
  gammaMExtraordinaria: number;
  /** DB SE-M tabla 3.2 — protección mínima de los herrajes para esa clase de servicio. */
  proteccionHerrajes: string;
  notas: string[];
  mensajes: Mensaje[];
  trazas: Traza[];
}

// ── Estado completo del módulo ──────────────────────────────────────────────

export interface MaterialesInputs {
  obra: OpcionesObra;
  /** Conmutadores M0: «¿de qué es la estructura?». Podan formulario y cuadros. */
  usaHormigon: boolean;
  usaAceroEstructural: boolean;
  usaMadera: boolean;
  elementos: ElementoHormigon[];
  aceroPasivo: AceroPasivo;
  malla: MallaElectrosoldada | null;
  aceroEstructural: {
    nivelRiesgo: NivelRiesgo;
    categoriaUso: CategoriaUso;
    categoriaEjecucion: CategoriaEjecucion;
    vidaUtilAnios: number;
    elementos: ElementoAcero[];
  };
  maderaGrupos: GrupoMadera[];
  /** Diámetros para la tabla de anclajes y solapes. */
  diametrosAnclaje: number[];
}
