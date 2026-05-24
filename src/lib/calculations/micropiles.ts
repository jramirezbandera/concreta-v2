// Micropilotes — Guía Fomento 2005 (cap. 3) + EC3 §6.2
// All shaft + structural checks. Single-pile design.
//
// Discretización: 50 segmentos uniformes a lo largo de la longitud L.
// Estratos: espesores secuenciales medidos DESDE LA CABEZA del micropilote
//   (z=0 en la cabeza, positivo hacia abajo). El suelo por encima del cabezal
//   no se integra: σv arranca en 0 en la cabeza (replica el comportamiento
//   de la hoja de referencia Excel: σv = 0 en M14 ≡ cabeza).
// Localizador de estrato: usa el FONDO del segmento (no el centroide) — así
//   se reproduce la discretización exacta de la hoja Excel: cuando un
//   segmento cruza una frontera de estrato, sus propiedades se asignan al
//   estrato en que cae el fondo.
//
// Referencias:
//   Guía Fomento cap. 3.4 — Carga teórica de hundimiento por fuste
//   Guía Fomento cap. 3.5 — Carga empírica de hundimiento por fuste
//   Guía Fomento cap. 3.6 — Tope estructural
//   Guía Fomento cap. 3.7 — Empujes horizontales y longitud ficticia
//   Guía Fomento cap. 3.8 — Conexión con encepado
//   Guía Fomento Tablas 3.5/3.6/3.7/A-5.1 — Factores Fe, Fc/Fφ, Fr, eg_min
//   EC3 §6.2.5 / §6.2.6 — Flexión y cortante de la sección tubular

import { type MicropilesInputs, type SoilLayer } from '../../data/defaults';
import {
  FACTORS_BY_APPLICATION,
  FE_BY_EXECUTION,
  FR_BY_DURATION,
  FU_BY_CONNECTION,
  MU_BY_EFFORT,
  classifyCircularHollow,
  getCorrosionRe,
  interpolateF,
  interpolateMe,
  weldThroatMin,
  type SectionClass,
} from '../../data/micropileLookups';
import { MICROPILE_TUBES } from '../../data/micropileTubes';
import { makeCheckQty, toStatus, type CheckRow } from './types';

export type { CheckRow } from './types';

const GAMMA_W = 10;             // kN/m³ — peso específico del agua
const GAMMA_CONCRETE = 25;      // kN/m³ — peso específico del hormigón/lechada
const N_SEGMENTS = 50;          // discretización del fuste
const E_STEEL_MPA = 210_000;    // MPa — módulo elástico del acero (≈ 210 GPa)
const ALPHA_CC = 0.85;          // factor de larga duración del hormigón (EHE/EC2)
const FYD_CAP_GUIA = 400;       // MPa — tope fyd para Fa,h (Guía Fomento §3.6.2)

export interface SegmentResult {
  /** Profundidad absoluta del centroide (m, positiva hacia abajo). */
  zAbs: number;
  /** Profundidad relativa al cabezal del micropilote (m). */
  zFromTop: number;
  /** Espesor del segmento (m). */
  dz: number;
  /** Estrato activo en este segmento (1..N). */
  layerIndex: number;
  /** Tensión vertical efectiva σv' (kPa). */
  sigmaVeff: number;
  /** Tensión horizontal efectiva σh' (kPa) tras aporte de inyección. */
  sigmaHeff: number;
  /** rfc teórica unitaria en este segmento (kN/m²). */
  rfcTheoretical: number;
  /** rfc empírica unitaria en este segmento (kN/m²). */
  rfcEmpirical: number;
  /** Aporte acumulado de Rfc teórica hasta este segmento (kN). */
  RfcTheoreticalAcc: number;
  /** Aporte acumulado de Rfc empírica hasta este segmento (kN). */
  RfcEmpiricalAcc: number;
}

export interface MicropilesResult {
  valid: boolean;
  error?: string;

  // Geometría
  length: number;                   // m — L bajo cabezal
  nSegments: number;
  segmentLength: number;            // m — dz
  segments: SegmentResult[];

  // Hundimiento por fuste
  RfcTheoretical: number;           // kN
  RfcEmpirical: number;             // kN
  RfcAdopted: number;               // kN — método elegido por el usuario
  ih: number;                       // utilización Nc,d / Rfc,d
  pulloutCapacity?: number;         // kN — Nd,arranque cuando hay tracción

  // Tope estructural
  dTotal: number;                   // mm — diámetro de perforación equivalente
  de: number;                       // mm — diámetro exterior tubo
  di: number;                       // mm — diámetro interior tubo
  re: number;                       // mm — pérdida por corrosión radial
  As_y: number;                     // mm² — sección bruta
  As_d: number;                     // mm² — sección efectiva minorada
  Fc_h: number;                     // kN — aporte hormigón
  Fa_h: number;                     // kN — aporte acero
  R: number;                        // factor de pandeo
  Fe: number;                       // factor de ejecución
  Nc_rd: number;                    // kN — capacidad a compresión
  Tc_rd: number;                    // kN — capacidad a tracción
  ic: number;                       // utilización compresión
  it?: number;                      // utilización tracción (si aplica)

  // Conexión con encepado
  he: number;                       // cm — altura encepado
  hp: number;                       // cm — penetración tubular
  bc: number;                       // cm — anchura chapa
  t_chapa: number;                  // mm — espesor chapa
  eg: number;                       // mm — garganta soldadura
  eg_min: number;                   // mm — garganta mínima

  // Empujes horizontales (Guía 3.7)
  Le: number;                       // m — longitud elástica
  Lef: number;                      // m — longitud ficticia empotramiento
  Mpl_rd: number;                   // kNm — momento plástico/elástico resistente
  Vpl_rd: number;                   // kN — cortante plástico resistente
  im: number;                       // utilización flexión
  iv: number;                       // utilización cortante
  /** Clasificación de la sección tubular post-corrosión (EC3 Tabla 5.2). */
  sectionClass: SectionClass;

  // Asientos estimados (mm)
  settlementGranular: number;
  settlementCohesive: number;

  // Disposición en planta (Guía Fomento Fig. 3.6 + §3.10 + Tabla 3.10).
  // Concreta calcula un solo pilote; estos números son orientativos para
  // que el proyectista sepa a qué separación colocar los demás.
  spacingMin: number;          // m — 2D, separación mínima recomendada
  spacingMaxRec: number;       // m — min(5D, 1 m), máximo recomendado en encepado
  spacingForNoGroup: number;   // m — 4D, por encima del cual Tabla 3.10 no rige

  // Comprobaciones (CheckRow[] con artículos normativos)
  checks: CheckRow[];
}

function invalid(error: string): MicropilesResult {
  return {
    valid: false, error,
    length: 0, nSegments: 0, segmentLength: 0, segments: [],
    RfcTheoretical: 0, RfcEmpirical: 0, RfcAdopted: 0, ih: 0,
    dTotal: 0, de: 0, di: 0, re: 0, As_y: 0, As_d: 0,
    Fc_h: 0, Fa_h: 0, R: 0, Fe: 0, Nc_rd: 0, Tc_rd: 0, ic: 0,
    he: 0, hp: 0, bc: 0, t_chapa: 0, eg: 0, eg_min: 0,
    Le: 0, Lef: 0, Mpl_rd: 0, Vpl_rd: 0, im: 0, iv: 0,
    sectionClass: 4,            // sin cálculo: conservador (no plastificación)
    settlementGranular: 0, settlementCohesive: 0,
    spacingMin: 0, spacingMaxRec: 0, spacingForNoGroup: 0,
    checks: [],
  };
}

/**
 * Encuentra el estrato activo a una profundidad medida DESDE LA CABEZA.
 * Si la profundidad excede la suma de espesores, devuelve el último estrato.
 */
function findLayerAt(layers: SoilLayer[], zFromHead: number): { layer: SoilLayer; index: number } {
  let acc = 0;
  for (let i = 0; i < layers.length; i++) {
    acc += layers[i].thickness;
    if (zFromHead < acc) return { layer: layers[i], index: i };
  }
  return { layer: layers[layers.length - 1], index: layers.length - 1 };
}

export function calcMicropiles(inp: MicropilesInputs, soil: SoilLayer[]): MicropilesResult {
  // ── 0. Validación de entrada ─────────────────────────────────────────────
  if (!Array.isArray(soil) || soil.length === 0) {
    return invalid('Se requiere al menos un estrato de terreno.');
  }
  if (inp.toeDepth <= inp.topDepth) {
    return invalid('La profundidad del apoyo debe ser mayor que la de la cabeza.');
  }
  if (inp.drillDiameter <= 0) return invalid('Diámetro de perforación debe ser > 0.');
  if (inp.designLoad < 0)     return invalid('Carga Nc,d no puede ser negativa.');
  for (const layer of soil) {
    if (layer.thickness <= 0) return invalid(`Estrato ${layer.id}: espesor debe ser > 0.`);
    if (layer.gamma <= 0)     return invalid(`Estrato ${layer.id}: γ debe ser > 0.`);
  }

  // ── 1. Geometría del fuste ───────────────────────────────────────────────
  // Convención v4: profundidad positiva = bajo rasante. L es la distancia
  // entre la cabeza y el apoyo, siempre positiva.
  // Convención v5: inp.drillDiameter llega en mm; el resto del motor
  // sigue trabajando en m, así que convertimos en la frontera.
  const L  = inp.toeDepth - inp.topDepth;             // m — longitud bajo cabezal
  const dz = L / N_SEGMENTS;                          // m — espesor segmento
  const Dn = inp.drillDiameter / 1000;                // m — Ø perforación
  const perimeter = Math.PI * Dn;                     // m

  // El perfil de suelo debe cubrir TODA la longitud del micropilote. Antes
  // findLayerAt extendía el último estrato al infinito cuando el suelo
  // definido era más corto que L, produciendo un cálculo silenciosamente
  // sin definir. Aquí lo bloqueamos: el usuario debe declarar capas que
  // sumen al menos L. Epsilon 1 mm absorbe ruido de coma flotante.
  const soilDepth = soil.reduce((s, l) => s + l.thickness, 0);
  if (soilDepth + 1e-3 < L) {
    const missing = L - soilDepth;
    return invalid(
      `El perfil de suelo (${soilDepth.toFixed(2)} m) no cubre la longitud del ` +
      `micropilote (${L.toFixed(2)} m). Faltan ${missing.toFixed(2)} m: añade ` +
      `un estrato o aumenta el espesor del último.`,
    );
  }

  // Profundidad del nivel freático MEDIDA DESDE LA CABEZA (positiva hacia
  // abajo). Negativa ⇒ NF sobre la cabeza (todo el pilote bajo agua). Mayor
  // que L ⇒ NF bajo el apoyo (todo el pilote seco).
  const zHeadAbs   = inp.topDepth;                          // m, profundidad de la cabeza desde rasante
  const zWaterHead = inp.waterTableDepth - inp.topDepth;
  //                 = 7.5 - 1 = 6.5 m  para FTUX (NF a 6.5 m bajo la cabeza)

  // ── 2. Factores normativos ───────────────────────────────────────────────
  const { Fc, Fphi } = FACTORS_BY_APPLICATION[inp.application];
  const Fcu = 0.9 * Fc;
  const Fr  = FR_BY_DURATION[inp.duration];
  const Fe  = FE_BY_EXECUTION[inp.execution];
  const Fu  = FU_BY_CONNECTION[inp.connection];
  const re  = getCorrosionRe(inp.corrosionEnv, inp.designLifeYears);   // mm (Tabla 2.4)

  // ── 3. Discretización + integración shaft friction ───────────────────────
  // Iteración exacta de la hoja Excel: σv arranca en 0 en la cabeza (z=0) y
  // se integra a lo largo del pilote. Cada segmento usa las propiedades del
  // estrato en su FONDO (z = i·dz, no en el centroide).
  const segments: SegmentResult[] = [];
  let RfcTheoreticalAcc = 0;
  let RfcEmpiricalAcc   = 0;
  let sigmaV            = 0;

  for (let i = 0; i < N_SEGMENTS; i++) {
    const zBotSeg = (i + 1) * dz;           // depth from cabeza, bottom of segment
    const { layer, index } = findLayerAt(soil, zBotSeg);

    // σv total: integra siempre con γ del estrato.
    sigmaV += layer.gamma * dz;

    // u = γw · max(0, zBot − zWater). Si NF está sobre la cabeza
    // (zWaterHead ≤ 0), todo el fuste está bajo agua desde el primer
    // segmento. Si NF está bajo el apoyo, u=0 siempre. Esto fija el bug del
    // contador anterior, que sobre-estimaba u en (γw·dz − γw·(zBot−zWater))
    // y, peor, para NF sobre cabeza nunca incrementaba el contador.
    const u        = GAMMA_W * Math.max(0, zBotSeg - zWaterHead);
    const sigmaVe  = Math.max(0, sigmaV - u);

    // σh' = σv' · K0 + p_inj/3 (Guía 3.4)
    const phi      = layer.phi;
    const phiRad   = (phi * Math.PI) / 180;
    const K0       = Math.max(0, 1 - Math.sin(phiRad));
    const sigmaHe  = sigmaVe * K0 + inp.injectionPressure / 3;

    // Fricción muro-terreno: δ = 2/3 · φ (Guía cap. 3.4)
    const delta    = (2 / 3) * phi;
    const tanDelta = Math.tan((delta * Math.PI) / 180);

    // rfc teórica (kN/m²) — Guía Fomento §3.4.
    // c' SOLO contribuye en cohesivos. En granulares la cohesión efectiva
    // es cero por definición (un suelo con c≠0 y phi≠0 no es granular puro,
    // es un suelo cementado o un cohesivo-friccional que debería declararse
    // como cohesivo con phi y c). Si el usuario mete c en un granular, lo
    // ignoramos: la UI ya oculta el campo c′ en granulares (decisión de
    // producto previa), pero defensivamente aquí también lo anulamos para
    // que un layer cargado desde localStorage corrupto no contamine el
    // cálculo. Decisión 2026-05-23: fidelidad a la norma > compat con el
    // Excel de referencia (donde un estrato "granular" tenía c=280 kPa).
    const cEffective = layer.type === 'granular' ? 0 : layer.c;
    let rfcTheo = cEffective / Fc + (sigmaHe * tanDelta) / Fphi;
    if (layer.type === 'cohesive' && layer.su > 0) {
      rfcTheo = Math.min(rfcTheo, layer.su / Fcu);
    }
    rfcTheo = Math.max(0, rfcTheo);

    // rfc empírica (kN/m²) — rflim en MPa → 1000 kN/m²
    const rfcEmp = Math.max(0, (layer.rflim * 1000) / Fr);

    // Aporte al fuste: ΔR = rfc · dz · π · Dn
    const dRtheo = rfcTheo * dz * perimeter;
    const dRemp  = rfcEmp  * dz * perimeter;
    RfcTheoreticalAcc += dRtheo;
    RfcEmpiricalAcc   += dRemp;

    segments.push({
      zAbs:     zHeadAbs + zBotSeg,
      zFromTop: zBotSeg,
      dz,
      layerIndex: index,
      sigmaVeff: sigmaVe,
      sigmaHeff: sigmaHe,
      rfcTheoretical: rfcTheo,
      rfcEmpirical: rfcEmp,
      RfcTheoreticalAcc,
      RfcEmpiricalAcc,
    });
  }

  const RfcTheoretical = RfcTheoreticalAcc;
  const RfcEmpirical   = RfcEmpiricalAcc;
  const RfcAdopted     = inp.method === 'theoretical' ? RfcTheoretical : RfcEmpirical;
  const ih             = RfcAdopted > 0 ? inp.designLoad / RfcAdopted : Infinity;

  // ── 4. Tope estructural (Guía cap. 3.6) ──────────────────────────────────
  // Resolver tubo: catálogo PIRESA O custom (de, e introducidos por el
  // usuario). El sentinel inp.tube === 'custom' activa el segundo modo;
  // cualquier otro valor exige que esté en el catálogo. Estado persistido
  // con un label obsoleto del catálogo → invalid() en lugar de fallback
  // silencioso a Ø88,9 × 9 mm.
  let de: number;
  let e:  number;
  if (inp.tube === 'custom') {
    if (!isFinite(inp.customTubeDe) || inp.customTubeDe <= 0) {
      return invalid('Tubo personalizado: Ø exterior debe ser un número > 0.');
    }
    if (!isFinite(inp.customTubeE) || inp.customTubeE <= 0) {
      return invalid('Tubo personalizado: espesor debe ser un número > 0.');
    }
    if (2 * inp.customTubeE >= inp.customTubeDe) {
      return invalid(
        `Tubo personalizado: espesor 2·e=${(2 * inp.customTubeE).toFixed(1)} mm ` +
        `≥ Ø ext=${inp.customTubeDe.toFixed(1)} mm. El tubo no tiene hueco interior.`,
      );
    }
    de = inp.customTubeDe;
    e  = inp.customTubeE;
  } else {
    const tube = MICROPILE_TUBES.find((t) => t.label === inp.tube);
    if (!tube) {
      return invalid(`Tubo "${inp.tube}" no encontrado en el catálogo PIRESA.`);
    }
    de = tube.de;
    e  = tube.e;
  }
  const di       = de - 2 * e;                               // mm
  // Diámetro estructural del bulbo de hormigón (Guía 3.6.2):
  // d_struct = de + 2·r, donde r es el recubrimiento efectivo del tubo
  // dentro de la lechada estructural. Debe cumplirse d_struct ≤ Dn
  // (perforación) para que el bulbo quepa físicamente dentro del barreno.
  const dTotal   = de + 2 * inp.structuralCover;             // mm
  const dPerfMm  = inp.drillDiameter;                        // mm (v5: ya en mm)
  if (dTotal > dPerfMm + 1e-3) {
    return invalid(
      `El bulbo estructural (${dTotal.toFixed(1)} mm) excede el diámetro de perforación ` +
      `(${dPerfMm.toFixed(1)} mm). Reduce el recubrimiento estructural o aumenta Dn.`,
    );
  }
  // Corrosión: si la pérdida radial re consume más de la mitad del espesor,
  // el área neta sería absurda. Invalidar antes de calcular capacidades.
  if (2 * re >= e) {
    return invalid(
      `Pérdida por corrosión re=${re.toFixed(2)} mm consume todo el espesor de pared ` +
      `(e=${e.toFixed(2)} mm). Elige un tubo más grueso o entorno menos agresivo.`,
    );
  }
  const As_y     = (Math.PI / 4) * (de * de - di * di);      // mm²
  const deNet    = Math.max(0, de - 2 * re);                 // mm
  const As_d     = (Math.PI / 4) * (deNet * deNet - di * di);// mm²

  const fck      = inp.concreteGrade;            // MPa
  const fy       = inp.steelGrade;               // N/mm² = MPa
  const fcd      = fck / 1.5;                    // MPa
  const fyd_raw  = fy / 1.1;                     // MPa (sin tope para Tc,rd)
  const fyd_cap  = Math.min(fyd_raw, FYD_CAP_GUIA);    // MPa (Guía 3.6.2 limita Fa,h a 400)

  // Aportes (kN). Nota: As tiene mm², fcd MPa = N/mm² → divide /1000 para kN.
  const A_concrete = (Math.PI / 4) * dTotal * dTotal - As_y;          // mm²
  const Fc_h       = (ALPHA_CC * A_concrete * fcd) / 1000;            // kN
  const Fa_h       = (As_d * fyd_cap * Fu) / 1000;               // kN

  // Pandeo (Guía Tabla 3.6 / cap. 3.6.2) — R = 1.07 − 0.027·CR ≤ 1
  const R  = Math.min(1, 1.07 - 0.027 * inp.CR);

  // Capacidades (kN)
  const Nc_rd = ((Fc_h + Fa_h) * R) / (1.2 * Fe);

  // Tracción — Guía Fomento §3.6.2 (pág. 40), fórmula oficial:
  //   Nt,Rd = (Aa · fyd) / 1,10    con   fyd = fy / γa,  γa = 1,10
  //   Aa = (π/4) · [(de − 2·re)² − di²] · Fu,t   →   en código: As_d · Fu
  //
  // El doble /1,10 (una al fy, otra al Nt,Rd) da el efectivo /1,21 (= 1,10·1,10).
  // Esto es la NORMATIVA oficial, no una quirk del Excel — verificado vs PDF
  // en líneas 1789-1815 de la Guía. Para Ø88,9×9 + S550 + re=0,60 + Fu=1:
  //   Tc_rd = 2092,68 · 1,00 · 551 / 1,21 / 1000 ≈ 952,95 kN  ✓
  //
  // Fu,t (Tabla 3.7) coincide en valores con Fu compresión (Tabla 3.6):
  // 1,0 para uniones sin pérdida; 0,5 para "resto de casos".
  const Tc_rd = ((As_d * fyd_raw * Fu) / 1.1) / 1000;

  const ic = Nc_rd > 0 ? inp.designLoad / Nc_rd : Infinity;
  const includeTension = inp.effort !== 'compression';
  const it = includeTension && Tc_rd > 0 ? inp.designLoad / Tc_rd : undefined;

  // Arranque por tracción (cuando aplica) — Guía 3.5.2
  let pulloutCapacity: number | undefined;
  if (includeTension) {
    const mu = MU_BY_EFFORT[inp.effort];
    // Peso de la lechada: usa el bulbo ESTRUCTURAL (dTotal), no el barreno (Dn).
    // Lo que cuelga del fuste y aporta peso muerto al arranque es el cilindro de
    // hormigón confinado dentro del tubo + recubrimiento, no el aire entre el
    // bulbo y la pared del barreno. Antes con Dn sobreestimaba ~5,6% en FTUX.
    const dTotalM = dTotal / 1000;                                    // mm → m
    const Wcrete  = Math.PI * (dTotalM / 2) * (dTotalM / 2) * L * GAMMA_CONCRETE;
    pulloutCapacity = mu * RfcAdopted + Wcrete / 1.2;
  }

  // ── 5. Conexión con encepado (Guía 3.8) ──────────────────────────────────
  const he      = Math.round(((3 * dTotal + 150) / 10) * 10) / 10;  // cm
  const hp      = Math.round((3 * dTotal / 10) * 10) / 10;          // cm
  const bc      = Math.round((0.75 * dTotal / 10) * 10) / 10;       // cm
  const t_chapa = e;                                                // mm — espesor tubo ≈ chapa unión
  const eg_min  = weldThroatMin(t_chapa);
  if (eg_min === null) {
    return invalid(
      `Espesor de chapa t=${t_chapa.toFixed(2)} mm fuera del rango de la Tabla A-5.1 ` +
      `(3 < t ≤ 20 mm). Selecciona un tubo con espesor en ese rango.`,
    );
  }
  // eg = max(garganta mínima Guía A-5.1, 0,7·t) — el segundo término es una
  // recomendación práctica conservadora (no normativa) para garantizar resistencia
  // plena del cordón. Se mantiene del cálculo anterior por seguridad.
  const eg      = Math.max(eg_min, Math.round(0.7 * t_chapa));

  // ── 6. Empujes horizontales (Guía 3.7) ───────────────────────────────────
  // Ia: momento de inercia del tubo (m⁴). Ea: módulo del acero (kN/m²).
  const Ia = (Math.PI / 4) * (Math.pow(de, 4) - Math.pow(di, 4)) / 1e12;    // m⁴
  const Ea = E_STEEL_MPA * 1000;                                            // kN/m² (210e6)
  const EL = Math.max(1, inp.soilModulusEmbed);
  const E0 = Math.max(0, inp.soilModulusTop);
  const Le = Math.pow((3 * Ea * Ia) / EL, 0.25);                            // m
  // f = coef. del empotramiento ficticio, Guía Tabla 3.8 (pág. 38),
  // interpolado desde E₀/EL. Antes era un input manual `f_lef`; ahora se
  // deriva de los módulos del terreno como manda la Guía.
  const f_coef = interpolateF(E0 / EL);
  const Lef = 1.2 * f_coef * Le;                                            // m

  // Mpl,rd y Vpl,rd — sección tubular sin reducción por axil (simplificado).
  // Clasificación EC3-1-1 Tabla 5.2 sobre la sección POST-CORROSIÓN: el Ø
  // exterior pasa de de a deNet = de − 2·re y la pared efectiva de e a
  // (deNet − di)/2 = e − re. Es la geometría que resiste al final de la
  // vida útil de proyecto.
  //   Clase 1/2 → W = Wpl (plastificación completa permitida).
  //   Clase 3   → W = Wel (límite elástico).
  //   Clase 4   → invalid: la sección abolla localmente antes de fy y
  //               Concreta no implementa Aeff/Weff (EC3 §6.2.9.2).
  const eEff = (deNet - di) / 2;
  const sectionClass = classifyCircularHollow(deNet, eEff, fy);
  if (sectionClass === 4) {
    const ratio = eEff > 0 ? deNet / eEff : Infinity;
    const limit3 = 90 * (235 / fy);
    return invalid(
      `Sección clase 4 (EC3-1-1 Tabla 5.2): d/t = ${ratio.toFixed(1)} > ` +
      `90·ε² = ${limit3.toFixed(1)} con fy = ${fy} N/mm². Selecciona un tubo ` +
      `con mayor espesor de pared o un acero de menor fy.`,
    );
  }
  // Wel/Wpl son válidos porque `2*re >= e` ya invalida antes (no llegamos
  // aquí con deNet ≤ 0). Sin guardas redundantes.
  const Wpl = (Math.pow(deNet, 3) - Math.pow(di, 3)) / 6;                   // mm³ aprox.
  const Wel = (Math.PI * (Math.pow(deNet, 4) - Math.pow(di, 4))) / (32 * deNet);
  const W = sectionClass <= 2 ? Wpl : Wel;
  const Mpl_rd = (W * (fy / 1.1)) / 1e6;                                    // kNm

  // Av tubular ≈ 2·A/π (EC3 §6.2.6 sección hueca circular)
  const Vpl_rd = ((2 * As_d / Math.PI) * (fy / Math.sqrt(3))) / 1.1 / 1000; // kN

  // Empujes horizontales — modelo de ménsula equivalente (Guía §3.7, pág. 40).
  // El pilote se idealiza como una ménsula vertical de longitud Lef empotrada
  // en el punto de empotramiento ficticio. Las acciones en cabeza producen:
  //   VEd = Vd  (cortante constante en el fuste de la ménsula)
  //   MEd_raw = Md + Vd · Lef
  //   MEd = MEd_raw · me   (Tabla 3.9 — reducción del momento máximo)
  //
  // me se interpola desde L/Le según la Guía Tabla 3.9. Para micropilotes
  // largos típicos (L/Le ≫ 7), me se acota en 0.85 (extremo de la tabla).
  const VEd = inp.baseShear;
  const MEd_raw = inp.baseMoment + VEd * Lef;
  const me_coef = interpolateMe(Le > 0 ? L / Le : 0);
  const MEd = MEd_raw * me_coef;

  // Interacción M-V: si VEd > 0.5·Vpl,rd, el momento plástico se reduce por ρ.
  const rho = VEd > 0.5 * Vpl_rd
    ? Math.pow(2 * VEd / Math.max(1, Vpl_rd) - 1, 2)
    : 0;
  const Mpl_rdm = Mpl_rd * (1 - rho);

  const im = Mpl_rdm > 0 ? MEd / Mpl_rdm : 0;
  const iv = Vpl_rd > 0 ? VEd / Vpl_rd : 0;

  // ── 7. Asientos estimados ────────────────────────────────────────────────
  // Granular: ((9·Nd/Rfc) − 2) · Dn · 1000 / 90  [mm]; 0 si Nd << Rfc
  const granRatio = RfcAdopted > 0 ? (9 * inp.designLoad) / RfcAdopted - 2 : 0;
  const settlementGranular = Math.max(0, granRatio) * Dn * 1000 / 90;
  // Cohesivo: 0.6 · Nd / (L · Fc)  [estimación empírica sin justificación
  // formal en la Guía Fomento]. Pendiente de revisión P1 — ver TODOS.md
  // "Hand-calc validation Micropilotes" + "Fórmula settlementCohesive".
  const settlementCohesive = (0.6 * inp.designLoad) / Math.max(1, L * Fc);

  // ── 7.bis Disposición en planta — Guía Fomento Fig. 3.6 + §3.10 ─────────
  // El módulo calcula un pilote individual; estas tres distancias orientan
  // al proyectista sobre cómo colocar el resto sin entrar en efecto grupo:
  //   · 2D  — mínimo absoluto entre ejes en encepado/viga de atado.
  //   · min(5D, 1 m) — máximo recomendado en la misma figura 3.6.
  //   · 4D  — frontera superior del rango 3D-4D donde aplica el coef. g
  //           de Tabla 3.10. Por encima de 4D la práctica habitual es no
  //           aplicar reducción (Concreta no computa el grupo).
  const spacingMin        = 2 * Dn;
  const spacingMaxRec     = Math.min(5 * Dn, 1);
  const spacingForNoGroup = 4 * Dn;

  // ── 8. Construcción de CheckRow[] con artículos normativos ──────────────
  const checks: CheckRow[] = [];

  // Hundimiento por fuste — siempre se evalúan ambos métodos.
  checks.push(makeCheckQty(
    'hund-theoretical',
    'Hundimiento por fuste (teórico)',
    inp.designLoad, RfcTheoretical, 'force',
    'Guía Fomento cap. 3.4',
  ));
  checks.push(makeCheckQty(
    'hund-empirical',
    'Hundimiento por fuste (empírico)',
    inp.designLoad, RfcEmpirical, 'force',
    'Guía Fomento cap. 3.5',
  ));

  // Tope estructural compresión
  checks.push(makeCheckQty(
    'tope-compression',
    'Tope estructural compresión',
    inp.designLoad, Nc_rd, 'force',
    'Guía Fomento eq. 3.5',
  ));

  // Tracción (cuando aplica)
  if (includeTension) {
    checks.push(makeCheckQty(
      'tope-tension',
      'Tope estructural tracción',
      inp.designLoad, Tc_rd, 'force',
      'Guía Fomento cap. 3.6.2',
    ));
    if (pulloutCapacity !== undefined) {
      checks.push(makeCheckQty(
        'pullout',
        'Arranque por tracción',
        inp.designLoad, pulloutCapacity, 'force',
        'Guía Fomento cap. 3.5.2',
      ));
    }
  }

  // Flexión y cortante (siempre presentes, aunque sean 0/0).
  // El value de flexión es MEd = Md + Vd·Lef, no solo Md, porque ese es el
  // momento real que se compara contra Mpl,rd en el empotramiento ficticio.
  const bendingUtil = im;
  checks.push({
    id: 'bending',
    description: 'Flexión (MEd = (Md + Vd·Lef)·me)',
    value:  `${MEd.toFixed(2)} kNm`,
    limit:  `${Mpl_rdm.toFixed(2)} kNm`,
    utilization: bendingUtil,
    status: toStatus(bendingUtil),
    article: 'EC3 §6.2.5 / Guía §3.7 (Tablas 3.8/3.9)',
  });
  checks.push({
    id: 'shear',
    description: 'Cortante',
    value: `${VEd.toFixed(2)} kN`,
    limit: `${Vpl_rd.toFixed(2)} kN`,
    utilization: iv,
    status: toStatus(iv),
    article: 'EC3 §6.2.6',
  });

  // Garganta de soldadura — neutral (no es utilización lineal)
  checks.push({
    id: 'welding-throat',
    description: 'Garganta de soldadura',
    value: `${eg} mm`,
    limit: `≥ ${eg_min} mm`,
    utilization: eg >= eg_min ? 0.5 : 1.2,    // visual: ok cuando cumple, fail si no
    status: eg >= eg_min ? 'ok' : 'fail',
    article: 'Guía Fomento Tabla A-5.1',
  });

  // Asiento (granular) — referencia CTE DB-SE-C (criterio servicio típico 25 mm)
  const settlementLimit = 25;
  const settlementUtil = settlementGranular / settlementLimit;
  checks.push({
    id: 'settlement-granular',
    description: 'Asiento estimado (granular)',
    value: `${settlementGranular.toFixed(1)} mm`,
    limit: `≤ ${settlementLimit} mm`,
    utilization: settlementUtil,
    status: toStatus(settlementUtil),
    article: 'Criterio CTE DB-SE-C',
  });

  return {
    valid: true,
    length: L, nSegments: N_SEGMENTS, segmentLength: dz, segments,
    RfcTheoretical, RfcEmpirical, RfcAdopted, ih, pulloutCapacity,
    dTotal, de, di, re, As_y, As_d,
    Fc_h, Fa_h, R, Fe, Nc_rd, Tc_rd, ic, it,
    he, hp, bc, t_chapa, eg, eg_min,
    Le, Lef, Mpl_rd, Vpl_rd, im, iv,
    sectionClass,
    settlementGranular, settlementCohesive,
    spacingMin, spacingMaxRec, spacingForNoGroup,
    checks,
  };
}
