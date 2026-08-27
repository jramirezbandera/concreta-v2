// NCSE-02 · las dos puertas normativas del módulo de sismo.
//
//   art. 1.2.3  ¿es obligatorio aplicar la Norma?
//   art. 3.5.1  ¿se puede usar el método simplificado de cálculo?
//
// Por qué esto se escribe ANTES que el motor de fuerzas
// ─────────────────────────────────────────────────────
// Son los dos únicos caminos del módulo que fallan EN SILENCIO. Un error en el
// espectro sale por pantalla como un número raro; un error aquí sale como un
// proyecto visado sin justificación sísmica en una zona que la exige, o como un
// edificio irregular calculado por un método que no le corresponde. Nadie lo ve.
// De ahí el orden: puertas primero, y los tests de las puertas antes que ellas.
//
// Las tres fases (no se puede comprobar todo de golpe)
// ────────────────────────────────────────────────────
//   FASE 1  geografía      municipio -> ab, K
//           salida temprana: ab < 0,04 g -> exenta, fin.
//   FASE 2  emplazamiento  rho, terreno, C -> S -> ac
//           sólo aquí se puede evaluar la contraexcepción de >7 plantas.
//   FASE 3  puerta         art. 1.2.3 completo + art. 3.5.1
//
// checkObligatoriedad devuelve estado "indeterminada" cuando está en fase 1 y
// necesita ac. No es un error: es la fase 2 pidiendo el dato que le falta.

import type {
  AvisoNorma,
  ApplicabilityResult,
  MetodoSimplificadoInput,
  MetodoSimplificadoResult,
  ObligatoriedadInput,
  ObligatoriedadResult,
  Requisito,
} from "./types";

// ── Umbrales de la Norma ─────────────────────────────────────────────────────
// Constantes con nombre, no literales sueltos: cada una es citable en el PDF.

/** Art. 1.2.3: exención general para importancia normal o especial. */
export const AB_EXENCION_GENERAL = 0.04;
/** Art. 1.2.3: exención para importancia normal con pórticos arriostrados. */
export const AB_EXENCION_ARRIOSTRADOS = 0.08;
/** Art. 1.2.3: contraexcepción, "igual o mayor de 0,08 g". */
export const AC_CONTRAEXCEPCION = 0.08;
/** Art. 1.2.3: "los edificios de más de siete plantas". Estricto: n > 7. */
export const PLANTAS_CONTRAEXCEPCION = 7;
/** Art. 1.2.3: fábrica, máximo 4 alturas a partir de esta ab. */
export const AB_FABRICA_MAX_4 = 0.08;
/** Art. 1.2.3: fábrica, máximo 2 alturas a partir de esta ab. */
export const AB_FABRICA_MAX_2 = 0.12;
/** Art. 3.5.1 (1): "inferior a veinte". Estricto: n < 20. */
export const LIMITE_PLANTAS_SIMPLIFICADO = 20;
/** Art. 3.5.1 (2): "inferior a sesenta metros". Estricto: H < 60. */
export const LIMITE_ALTURA_SIMPLIFICADO = 60;
/** Art. 3.5.1 (6): "inferior al 10%". Estricto: e/dim < 0,10. */
export const LIMITE_EXCENTRICIDAD = 0.1;
/** Art. 3.5.1: pasarela, "hasta cuatro plantas EN TOTAL". Sótanos incluidos. */
export const PASARELA_PLANTAS_TOTALES = 4;

/**
 * Tolerancia frente al ruido de coma flotante en los umbrales.
 *
 * ac = S · rho · ab sale de tres multiplicaciones, así que un ac "de 0,08"
 * puede llegar como 0,07999999999999999. Sin epsilon ese ruido decide si la
 * Norma se aplica o no. Las dos comparaciones están sesgadas a propósito HACIA
 * LA APLICACIÓN de la Norma: el ruido nunca compra una exención.
 */
const EPS = 1e-9;

/** "inferior a" del texto legal. En el borde exacto devuelve false. */
function esInferior(valor: number, limite: number): boolean {
  return valor < limite - EPS;
}

/** "igual o mayor que" del texto legal. En el borde exacto devuelve true. */
function esMayorOIgual(valor: number, limite: number): boolean {
  return valor >= limite - EPS;
}

function fmtG(v: number): string {
  return v.toFixed(2).replace(".", ",") + " g";
}

function fmtRatio(v: number): string {
  return (v * 100).toFixed(1).replace(".", ",") + "%";
}

// ── Art. 1.2.3 · obligatoriedad ──────────────────────────────────────────────

const MATERIALES_PROHIBIDOS = ["mamposteria-seco", "adobe", "tapial"];

/**
 * Las tres exenciones, redactadas para citarlas. Viven aquí y no en el
 * exportador porque son el texto del artículo, no una decisión de maquetación:
 * el PDF las importa en vez de mantener su propia copia.
 */
export const MOTIVO_EXENCION: Record<string, string> = {
  "importancia-moderada": "la construcción es de importancia moderada (art. 1.2.2)",
  "ab-inferior-0.04g": "la aceleración sísmica básica es inferior a 0,04 g",
  "porticos-arriostrados-ab-inferior-0.08g":
    "es una construcción de importancia normal con pórticos bien arriostrados " +
    "entre sí en todas las direcciones y ab inferior a 0,08 g",
};

/**
 * Avisos y prohibiciones del art. 1.2.3 que NO deciden la obligatoriedad pero
 * viajan con ella. Las prohibiciones de material y los límites de altura de la
 * fábrica sólo rigen cuando la Norma es de aplicación; el aviso de terrenos
 * inestables depende sólo de ab y se emite siempre.
 */
function avisosArt123(
  input: ObligatoriedadInput,
  esDeAplicacion: boolean,
): AvisoNorma[] {
  const avisos: AvisoNorma[] = [];
  const { ab, n, importancia, sistema } = input;

  if (esMayorOIgual(ab, AB_EXENCION_GENERAL)) {
    avisos.push({
      id: "terrenos-inestables",
      articulo: "1.2.3",
      severidad: "aviso",
      texto:
        "Con ab = " +
        fmtG(ab) +
        " deben considerarse los posibles efectos del sismo en terrenos " +
        "potencialmente inestables.",
    });
  }

  if (!esDeAplicacion) return avisos;

  if (
    sistema &&
    MATERIALES_PROHIBIDOS.includes(sistema) &&
    (importancia === "normal" || importancia === "especial")
  ) {
    avisos.push({
      id: "material-prohibido",
      articulo: "1.2.3",
      severidad: "bloqueo",
      texto:
        "El art. 1.2.3 prohíbe la mampostería en seco, el adobe y el tapial " +
        "en construcciones de importancia normal o especial cuando la Norma " +
        "es de aplicación.",
    });
  }

  if (sistema === "fabrica") {
    if (esMayorOIgual(ab, AB_FABRICA_MAX_2) && n > 2) {
      avisos.push({
        id: "fabrica-max-2-alturas",
        articulo: "1.2.3",
        severidad: "bloqueo",
        texto:
          "Con ab = " +
          fmtG(ab) +
          " los edificios de fábrica de ladrillo o bloques no pueden superar " +
          "las dos alturas. El edificio tiene " +
          n +
          ".",
      });
    } else if (
      esMayorOIgual(ab, AB_FABRICA_MAX_4) &&
      esInferior(ab, AB_FABRICA_MAX_2) &&
      n > 4
    ) {
      avisos.push({
        id: "fabrica-max-4-alturas",
        articulo: "1.2.3",
        severidad: "bloqueo",
        texto:
          "Con ab = " +
          fmtG(ab) +
          " los edificios de fábrica de ladrillo o bloques no pueden superar " +
          "las cuatro alturas. El edificio tiene " +
          n +
          ".",
      });
    }
  }

  return avisos;
}

/**
 * Art. 1.2.3. La aplicación es obligatoria SALVO en tres casos tasados, y el
 * tercero lleva una contraexcepción pegada.
 *
 * El umbral va sobre ab, NO sobre rho·ab. Un edificio de importancia especial
 * con ab = 0,035 g tiene rho·ab = 0,0455 g, por encima de 0,04, y aun así está
 * exento: el artículo habla de la aceleración sísmica BÁSICA.
 */
export function checkObligatoriedad(
  input: ObligatoriedadInput,
): ObligatoriedadResult {
  const { importancia, ab, ac, n, porticosBienArriostrados } = input;

  const exenta = (
    motivo: ObligatoriedadResult["motivo"],
  ): ObligatoriedadResult => ({
    estado: "exenta",
    motivo,
    falta: null,
    avisos: avisosArt123(input, false),
  });

  // Excepción 1 — construcciones de importancia moderada.
  if (importancia === "moderada") return exenta("importancia-moderada");

  // Excepción 2 — importancia normal o especial con ab < 0,04 g.
  // Es la salida temprana de la FASE 1: no necesita emplazamiento.
  if (esInferior(ab, AB_EXENCION_GENERAL)) return exenta("ab-inferior-0.04g");

  // Excepción 3 — importancia NORMAL (no especial) con pórticos bien
  // arriostrados entre sí en todas las direcciones y ab < 0,08 g.
  const enRamaArriostrados =
    importancia === "normal" &&
    porticosBienArriostrados === true &&
    esInferior(ab, AB_EXENCION_ARRIOSTRADOS);

  if (enRamaArriostrados) {
    // Contraexcepción: "No obstante, la Norma será de aplicación en los
    // edificios de más de siete plantas si ac >= 0,08 g".
    if (n > PLANTAS_CONTRAEXCEPCION) {
      if (ac === undefined) {
        // FASE 2 pendiente. Decidir ahora sería inventarse el dato.
        return {
          estado: "indeterminada",
          motivo: null,
          falta: "ac",
          avisos: avisosArt123(input, false),
        };
      }
      if (esMayorOIgual(ac, AC_CONTRAEXCEPCION)) {
        return {
          estado: "obligatoria",
          motivo: null,
          falta: null,
          avisos: avisosArt123(input, true),
        };
      }
    }
    return exenta("porticos-arriostrados-ab-inferior-0.08g");
  }

  return {
    estado: "obligatoria",
    motivo: null,
    falta: null,
    avisos: avisosArt123(input, true),
  };
}

// ── Art. 3.5.1 · ámbito del método simplificado ──────────────────────────────

const TEXTO_REQUISITOS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "El número de plantas sobre rasante es inferior a veinte.",
  2: "La altura del edificio sobre rasante es inferior a sesenta metros.",
  3:
    "Existe regularidad geométrica en planta y en alzado, sin entrantes ni " +
    "salientes importantes.",
  4:
    "Dispone de soportes continuos hasta cimentación, uniformemente " +
    "distribuidos en planta y sin cambios bruscos en su rigidez.",
  5:
    "Dispone de regularidad mecánica en la distribución de rigideces, " +
    "resistencias y masas, de modo que los centros de gravedad y de torsión " +
    "de todas las plantas estén situados, aproximadamente, en la misma " +
    "vertical.",
  6:
    "La excentricidad del centro de las masas respecto al de torsión es " +
    "inferior al 10% de la dimensión en planta del edificio en cada " +
    "dirección principal.",
};

/**
 * Requisito (6). Dos vías, y la numérica manda sobre la declarada.
 *
 * Una declaración del proyectista no puede sobreescribir una excentricidad
 * medida que incumple: si hay número y el número falla, falla, aunque la
 * casilla esté marcada.
 */
function requisito6(input: MetodoSimplificadoInput): Requisito {
  const dirs = [
    ["X", input.excentricidad?.x],
    ["Y", input.excentricidad?.y],
  ] as const;

  const medidas: Array<{ dir: string; ratio: number; dimension: number }> = [];
  for (const [dir, d] of dirs) {
    if (!d || !(d.dimension > 0)) continue; // guarda: dimensión nula o ausente
    medidas.push({ dir, ratio: Math.abs(d.e) / d.dimension, dimension: d.dimension });
  }

  if (medidas.length === 0) {
    return {
      id: 6,
      texto: TEXTO_REQUISITOS[6],
      tipo: "declarado",
      cumple: input.excentricidadDeclarada ?? null,
    };
  }

  const detalle = medidas
    // La dimensión va a la vista porque NO es la de la propia dirección: los
    // planos se reparten sobre el eje transversal, así que la excentricidad
    // que sale de ellos se mide contra la dimensión en planta de ESE eje. Quien
    // firma la memoria tiene que poder comprobar la división que ha salido
    // impresa, y con «e/dim = 10,7 %» a secas no puede.
    .map(
      (m) =>
        m.dir +
        ": e/dim = " +
        fmtRatio(m.ratio) +
        " (transversal " +
        m.dimension.toFixed(2).replace(".", ",") +
        " m)",
    )
    .join(" · ");
  const algunaFalla = medidas.some(
    (m) => !esInferior(m.ratio, LIMITE_EXCENTRICIDAD),
  );

  // Con las dos direcciones medidas el requisito queda resuelto numéricamente.
  if (medidas.length === 2) {
    return {
      id: 6,
      texto: TEXTO_REQUISITOS[6],
      tipo: "numerico",
      cumple: !algunaFalla,
      detalle,
    };
  }

  // Con una sola dirección medida: si esa falla, ya basta para incumplir.
  if (algunaFalla) {
    return {
      id: 6,
      texto: TEXTO_REQUISITOS[6],
      tipo: "numerico",
      cumple: false,
      detalle: detalle + " (la otra dirección, sin medir)",
    };
  }

  return {
    id: 6,
    texto: TEXTO_REQUISITOS[6],
    tipo: "declarado",
    cumple: input.excentricidadDeclarada ?? null,
    detalle: detalle + " (la otra dirección, declarada)",
  };
}

/**
 * Art. 3.5.1. Seis requisitos, y una pasarela para edificios de pisos de
 * importancia normal de hasta cuatro plantas EN TOTAL.
 *
 * La pasarela cuenta nTotal, sótanos incluidos. Es el único sitio de toda la
 * Norma que se mide así, y es el fallo silencioso más fácil de cometer: un
 * edificio de 4 plantas sobre rasante con 2 sótanos tiene nTotal = 6 y NO entra.
 *
 * La pasarela levanta (3)-(6), no (1) ni (2).
 */
export function checkMetodoSimplificado(
  input: MetodoSimplificadoInput,
): MetodoSimplificadoResult {
  const { n, nTotal, H, importancia } = input;

  const r1: Requisito = {
    id: 1,
    texto: TEXTO_REQUISITOS[1],
    tipo: "numerico",
    cumple: n < LIMITE_PLANTAS_SIMPLIFICADO,
    detalle: "n = " + n,
  };
  const r2: Requisito = {
    id: 2,
    texto: TEXTO_REQUISITOS[2],
    tipo: "numerico",
    cumple: esInferior(H, LIMITE_ALTURA_SIMPLIFICADO),
    detalle: "H = " + H.toFixed(2).replace(".", ",") + " m",
  };
  const r3: Requisito = {
    id: 3,
    texto: TEXTO_REQUISITOS[3],
    tipo: "declarado",
    cumple: input.regularidadGeometrica,
  };
  const r4: Requisito = {
    id: 4,
    texto: TEXTO_REQUISITOS[4],
    tipo: "declarado",
    cumple: input.soportesContinuos,
  };
  const r5: Requisito = {
    id: 5,
    texto: TEXTO_REQUISITOS[5],
    tipo: "declarado",
    cumple: input.regularidadMecanica,
  };
  const r6 = requisito6(input);

  const requisitos: Requisito[] = [r1, r2, r3, r4, r5, r6];
  const avisos: AvisoNorma[] = [];

  const numericosOk = r1.cumple === true && r2.cumple === true;
  const todosOk = requisitos.every((r) => r.cumple === true);
  const puedePasarela =
    numericosOk &&
    importancia === "normal" &&
    nTotal <= PASARELA_PLANTAS_TOTALES;

  if (todosOk) {
    return {
      aplicable: true,
      via: "requisitos",
      requisitos,
      avisos,
      bloqueo: null,
    };
  }

  if (puedePasarela) {
    avisos.push({
      id: "torsion-pasarela",
      articulo: "3.7.5",
      severidad: "aviso",
      texto:
        "El edificio entra por la vía de los edificios de pisos de " +
        "importancia normal de hasta cuatro plantas en total, sin cumplir " +
        "todos los requisitos del art. 3.5.1. Se requerirá un estudio " +
        "especial de los efectos de torsión.",
    });
    return {
      aplicable: true,
      via: "pasarela-4-plantas",
      requisitos,
      avisos,
      bloqueo: null,
    };
  }

  const fallan = requisitos.filter((r) => r.cumple === false).map((r) => r.id);
  const sinDeclarar = requisitos
    .filter((r) => r.cumple === null)
    .map((r) => r.id);

  const partes: string[] = [];
  if (fallan.length > 0) {
    partes.push("no se cumplen los requisitos (" + fallan.join(", ") + ")");
  }
  if (sinDeclarar.length > 0) {
    partes.push(
      "quedan sin declarar los requisitos (" + sinDeclarar.join(", ") + ")",
    );
  }

  return {
    aplicable: false,
    via: null,
    requisitos,
    avisos,
    bloqueo:
      "No es aplicable el método simplificado del art. 3.5.1: " +
      partes.join(" y ") +
      ". El edificio requiere un análisis modal completo (art. 3.6.2).",
  };
}

// ── Puerta completa ──────────────────────────────────────────────────────────

/**
 * Encadena las dos puertas en el orden del design doc. El método simplificado
 * sólo se evalúa si la Norma es de aplicación: preguntarse qué método usar en
 * un edificio exento no tiene sentido, y presentar requisitos incumplidos de un
 * artículo que no rige sólo confunde.
 */
export function checkApplicability(
  obligatoriedad: ObligatoriedadInput,
  simplificado: MetodoSimplificadoInput,
): ApplicabilityResult {
  const obl = checkObligatoriedad(obligatoriedad);

  if (obl.estado !== "obligatoria") {
    return {
      obligatoriedad: obl,
      metodoSimplificado: null,
      puedeCalcular: false,
      impedimento:
        obl.estado === "exenta"
          ? {
              motivo: "norma-no-obligatoria",
              articulo: "1.2.3",
              texto:
                "La NCSE-02 no es de aplicación obligatoria a esta construcción: " +
                (MOTIVO_EXENCION[obl.motivo ?? ""] ?? "exenta por el art. 1.2.3") +
                ".",
            }
          : {
              motivo: "obligatoriedad-indeterminada",
              articulo: "1.2.3",
              texto:
                "Todavía no se puede decidir si la NCSE-02 es de aplicación: falta " +
                (obl.falta ?? "un dato del emplazamiento") +
                ". Es la contraexcepción de los edificios de más de siete plantas, " +
                "que depende de ac.",
            },
      avisos: obl.avisos,
    };
  }

  const met = checkMetodoSimplificado(simplificado);

  // Las prohibiciones del art. 1.2.3 —material, alturas de la fábrica— NO son
  // un problema del método simplificado: el edificio puede cumplir los seis
  // requisitos del art. 3.5.1 y estar prohibido igual. Por eso se miran ANTES,
  // y por eso el impedimento las nombra por su artículo.
  const prohibicion = obl.avisos.find((a) => a.severidad === "bloqueo");
  if (prohibicion) {
    return {
      obligatoriedad: obl,
      metodoSimplificado: met,
      puedeCalcular: false,
      impedimento: {
        motivo: "prohibicion-art-1.2.3",
        articulo: prohibicion.articulo,
        texto: prohibicion.texto,
      },
      avisos: [...obl.avisos, ...met.avisos],
    };
  }

  return {
    obligatoriedad: obl,
    metodoSimplificado: met,
    puedeCalcular: met.aplicable,
    impedimento: met.aplicable
      ? null
      : {
          motivo: "metodo-simplificado-no-aplicable",
          articulo: "3.5.1",
          texto: met.bloqueo ?? "No es aplicable el método simplificado del art. 3.5.1.",
        },
    avisos: [...obl.avisos, ...met.avisos],
  };
}
