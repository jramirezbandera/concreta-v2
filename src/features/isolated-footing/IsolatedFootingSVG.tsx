/**
 * Lienzo de la zapata aislada — tres vistas en un solo fichero:
 *
 *   1 Terreno  · SLS: la reacción del terreno bajo la zapata y dónde cae la
 *                resultante respecto del núcleo central.
 *   2 Armado   · la parrilla inferior dispuesta, con patillas, canto útil y
 *                la longitud de anclaje frente al vuelo disponible.
 *   3 Modelo   · ELU: σEd sobre el área eficaz y, según v ≤ 2h, el modelo de
 *                bielas y tirantes (rígida) o las secciones de cálculo y el
 *                perímetro de punzonamiento (flexible).
 *
 * Reglas de dibujo (ver DESIGN.md §Reglas SVG y components/canvas/paleta.ts):
 *
 * · UNA escala para las dos figuras de una vista, y en vertical la planta va
 *   ALINEADA con la sección: se leen como un par en proyección.
 * · El diagrama de presiones CUELGA de la base de la zapata, no vive en un
 *   panel aparte, y su altura es σ/σadm: la línea de σadm es la referencia
 *   fija contra la que se compara. Antes σmax se dibujaba siempre a la misma
 *   altura y una zapata al 55 % parecía un bloque macizo.
 * · La presión va en `chart-presion` (naranja), como en viento. Los colores de
 *   estado son para el ESTADO: aquí sólo tiñen el rótulo de σmax y el del
 *   anclaje, que son el veredicto de su comprobación.
 * · mode='pdf' escribe colores literales: el exportador serializa el SVG a un
 *   data-URL y lo rasteriza FUERA del documento, donde ninguna var(--…)
 *   resuelve. Sí resuelve todo lo demás (patrones, degradados, paint-order):
 *   el camino es un <img> del navegador, no svg2pdf.
 */

import { useId, type ReactNode } from 'react';
import { type IsolatedFootingInputs } from '../../data/defaults';
import { type IsolatedFootingResult } from '../../lib/calculations/isolatedFooting';
import { CotaH, CotaV, Rotulo, anchoEstimado } from '../../components/canvas/primitivas';
import { dec, formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';

export type IsolatedFootingView = 'terreno' | 'armado' | 'modelo';

interface Props {
  inp:     IsolatedFootingInputs;
  result:  IsolatedFootingResult;
  width:   number;
  /** Presupuesto vertical del lienzo. La figura puede salir más baja. */
  height?: number;
  mode?:   'screen' | 'pdf';
  view?:   IsolatedFootingView;
  system?: UnitSystem;
}

// ── Paleta ────────────────────────────────────────────────────────────────────

function paleta(isPdf: boolean) {
  return {
    hormigon:      isPdf ? '#f1f5f9' : 'var(--color-chart-section-fill)',
    hormigonBorde: isPdf ? '#475569' : 'var(--color-chart-section)',
    pilar:         isPdf ? '#e2e8f0' : 'var(--color-bg-elevated)',
    terreno:       isPdf ? '#94a3b8' : 'var(--color-chart-rebar-dim)',
    cota:          isPdf ? '#64748b' : 'var(--color-chart-dim)',
    cotaTexto:     isPdf ? '#475569' : 'var(--color-chart-dim-text)',
    rotulo:        isPdf ? '#0f172a' : 'var(--color-chart-label)',
    secundario:    isPdf ? '#475569' : 'var(--color-text-secondary)',
    atenuado:      isPdf ? '#64748b' : 'var(--color-text-disabled)',
    acento:        isPdf ? '#0369a1' : 'var(--color-accent)',
    armadura:      isPdf ? '#0284c7' : 'var(--color-chart-rebar)',
    armaduraTenue: isPdf ? '#94a3b8' : 'var(--color-chart-rebar-dim)',
    presion:       isPdf ? '#ea580c' : 'var(--color-chart-presion)',
    ok:            isPdf ? '#15803d' : 'var(--color-state-ok)',
    aviso:         isPdf ? '#b45309' : 'var(--color-state-warn)',
    fallo:         isPdf ? '#dc2626' : 'var(--color-state-fail)',
    papel:         isPdf ? '#ffffff' : 'var(--color-bg-canvas)',
  };
}

type Paleta = ReturnType<typeof paleta>;

// ── Medidas fijas del lienzo (px) ─────────────────────────────────────────────

const CAB_ALTO    = 20;   // cabecera de cada figura
const BANDA_SUELO = 32;   // terreno dibujado a cada lado de la zapata
const STUB        = 40;   // tramo de pilar visible sobre la rasante
const ALTO_CARGAS = 54;   // flechas de N, M y H sobre el pilar
const ALTO_ADM    = 74;   // altura que representa σadm en el diagrama
const TOPE_ADM    = 1.75; // recorte del diagrama cuando σmax se dispara
const ALTO_ED     = 48;   // bloque de σEd en la vista Modelo
const GAP_FIG     = 24;   // entre las dos figuras
const FILA        = 15;   // alto de una línea de rótulo
const STUB_MODELO = 40;   // el ELU rotula S1 y S2 sobre la zapata: más pilar
const ESCALA_MAX  = 230;  // px/m — una zapata pequeña no llena la pantalla
const ANCHO_LADO  = 720;  // a partir de aquí, sección y planta lado a lado
const ANCHO_COMPACTO = 480; // por debajo, cotas giradas y cabeceras cortas

// ── Primitivas locales ────────────────────────────────────────────────────────

/** Segmento con punta maciza en (x2, y2). Polígono, no `<marker>`: el
 *  rasterizado del PDF clona el SVG fuera del documento y una punta compartida
 *  por varios lienzos se pintaría con el color del vecino. */
function Flecha({
  x1, y1, x2, y2, color, grosor = 1.5, punta = 7, anchoPunta = 3,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; grosor?: number; punta?: number; anchoPunta?: number;
}) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const bx = x2 - punta * Math.cos(ang);
  const by = y2 - punta * Math.sin(ang);
  const p1x = bx + anchoPunta * Math.sin(ang);
  const p1y = by - anchoPunta * Math.cos(ang);
  const p2x = bx - anchoPunta * Math.sin(ang);
  const p2y = by + anchoPunta * Math.cos(ang);
  return (
    <g>
      {grosor > 0 && <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={grosor} />}
      <polygon points={`${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`} fill={color} />
    </g>
  );
}

/** Flecha curva de momento, de 150º a 30º por encima del punto. */
function Momento({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const a0 = (150 * Math.PI) / 180;
  const a1 = (30 * Math.PI) / 180;
  const sx = cx + r * Math.cos(a0);
  const sy = cy + r * Math.sin(a0);
  const ex = cx + r * Math.cos(a1);
  const ey = cy + r * Math.sin(a1);
  const tx = -Math.sin(a1);
  const ty = Math.cos(a1);
  const bx = ex - 6 * tx;
  const by = ey - 6 * ty;
  return (
    <g>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={1.5} />
      <polygon points={`${ex},${ey} ${bx - 3 * ty},${by + 3 * tx} ${bx + 3 * ty},${by - 3 * tx}`} fill={color} />
    </g>
  );
}

/** Cabecera de una figura: mayúsculas pequeñas, como los section headers. */
function Cabecera({ x, y, children, color }: { x: number; y: number; children: ReactNode; color: string }) {
  return (
    <Rotulo x={x} y={y} tam={10} color={color} peso={600}>
      {children}
    </Rotulo>
  );
}

/** Cota vertical con el texto girado contra la línea: cuesta un cuerpo de
 *  ancho en vez de seis, que es lo que decide si la figura cabe a 300 px. */
function CotaVGirada({
  x, y1, y2, texto, color, colorTexto, fraccion = 0.5,
}: { x: number; y1: number; y2: number; texto: string; color: string; colorTexto: string; fraccion?: number }) {
  const ym = y1 + (y2 - y1) * fraccion;
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={1} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke={color} strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke={color} strokeWidth={1} />
      <text
        x={x - 5} y={ym} fontSize={10} fill={colorTexto} textAnchor="middle"
        transform={`rotate(-90 ${x - 5} ${ym})`}
        style={{ fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)' }}
      >
        {texto}
      </text>
    </g>
  );
}

// ── Utilidades ────────────────────────────────────────────────────────────────

interface Figura { el: ReactNode; izq: number; der: number; alto: number }

/** Alto del bloque de presiones, px. La escala del diagrama es σadm, no σmax:
 *  una zapata al 55 % tiene que DIBUJARSE al 55 %. Con σmax disparada el
 *  bloque se recorta y el rótulo lo dice. */
function altoPresion(inp: IsolatedFootingInputs, result: IsolatedFootingResult): number {
  if (result.distributionType === 'overturning_fail') return 0;
  return Math.min((result.sigma_max / inp.sigma_adm) * ALTO_ADM, ALTO_ADM * TOPE_ADM);
}

/** Lo que la sección ocupa POR ENCIMA de la base de la zapata, px: todo lo que
 *  no va a escala. El reparto y el dibujo tienen que usar EL MISMO número, o
 *  la escala se calcula contra un presupuesto que no es el que se gasta. */
function altoSobreBase(vista: IsolatedFootingView): number {
  return CAB_ALTO + (vista !== 'armado' ? ALTO_CARGAS : 8) + STUB + (vista === 'modelo' ? STUB_MODELO : 0);
}

/** Y lo que ocupa por DEBAJO: diagrama, rótulos y la cota B. */
function altoBajoBase(inp: IsolatedFootingInputs, result: IsolatedFootingResult, vista: IsolatedFootingView): number {
  if (vista === 'armado') return 24 + 24 + 8;
  if (vista === 'modelo') return ALTO_ED + (result.isRigid ? 2 : 4) * FILA + 6 + 24 + 8;
  if (result.distributionType === 'overturning_fail') return 56 + 24 + 8;
  const bitri = result.distributionType !== 'trapezoidal';
  return Math.max(ALTO_ADM, altoPresion(inp, result)) + 34 + (bitri ? 20 : 0) + 24 + 8;
}

/** Color del rótulo de una comprobación: es su veredicto, no una magnitud. */
function colorEstado(P: Paleta, estado: 'ok' | 'warn' | 'fail'): string {
  return estado === 'fail' ? P.fallo : estado === 'warn' ? P.aviso : P.rotulo;
}

// ── Sección ───────────────────────────────────────────────────────────────────

interface OpcSeccion {
  inp: IsolatedFootingInputs;
  result: IsolatedFootingResult;
  P: Paleta;
  s: number;
  vista: IsolatedFootingView;
  sigma: (v: number) => string;
  hatchId: string;
  compacto: boolean;
}

/** Banda de terreno dibujada a cada lado de la zapata. */
function bandaSuelo(compacto: boolean): number {
  return compacto ? 14 : BANDA_SUELO;
}

/** Margen izquierdo de la sección: la banda de terreno más la cota Df.
 *
 *  En compacto las cotas van GIRADAS contra la figura: el texto horizontal de
 *  «Df = 1,00» pide 54 px a cada lado y a 340 px de lienzo los dos márgenes se
 *  comían la zapata entera (quedaban 32 px para B). */
function izqSeccion(inp: IsolatedFootingInputs, vista: IsolatedFootingView, compacto: boolean): number {
  if (vista === 'modelo') return compacto ? 18 : 26;
  if (compacto) return bandaSuelo(true) + 18;
  return BANDA_SUELO + 14 + anchoEstimado(`Df = ${dec(inp.Df, 2)}`, 10, true);
}

/** Margen derecho: la banda de terreno, la cota h y —en armado— la de d. */
function derSeccion(inp: IsolatedFootingInputs, result: IsolatedFootingResult, vista: IsolatedFootingView, compacto: boolean): number {
  const suelo = vista === 'modelo' ? 0 : bandaSuelo(compacto);
  if (compacto) return suelo + 20 + (vista === 'armado' ? 18 : 0);
  const h = 14 + anchoEstimado(`h = ${dec(inp.h, 2)}`, 10, true);
  const d = vista === 'armado' ? 28 + anchoEstimado(`d = ${result.d_x.toFixed(0)} mm`, 10, true) : 0;
  return suelo + h + d + 6;
}

function dibujarSeccion(o: OpcSeccion): Figura {
  const { inp, result, P, s, vista, sigma, hatchId, compacto } = o;
  const { B, h, bc, Df } = inp;
  const banda = bandaSuelo(compacto);
  const vuelco = result.distributionType === 'overturning_fail';
  const bitri = result.distributionType !== 'trapezoidal' && !vuelco;
  const conSuelo = vista !== 'modelo';
  const conCargas = vista !== 'armado';
  const g: ReactNode[] = [];

  const anchoZap = B * s;
  const anchoPil = bc * s;
  const cx = anchoZap / 2;
  const cantoZap = h * s;

  const yCab = CAB_ALTO - 8;
  const yPilar = CAB_ALTO + (conCargas ? ALTO_CARGAS : 8);
  const yRasante = yPilar + STUB + (vista === 'modelo' ? STUB_MODELO : 0);
  const yBase = yRasante + (conSuelo ? Df * s : h * s + 10);
  const yTecho = yBase - cantoZap;

  g.push(
    <Cabecera key="cab" x={0} y={yCab} color={P.atenuado}>
      {vista === 'terreno' ? (compacto ? 'SECCIÓN A-A' : 'SECCIÓN A-A · SERVICIO')
        : vista === 'armado' ? (compacto ? 'SECCIÓN A-A' : 'SECCIÓN A-A · ARMADO')
          : compacto ? `A-A · ${result.isRigid ? 'RÍGIDA' : 'FLEXIBLE'}` : `SECCIÓN A-A · ELU, ZAPATA ${result.isRigid ? 'RÍGIDA' : 'FLEXIBLE'}`}
    </Cabecera>,
  );

  // ── Terreno ────────────────────────────────────────────────────────────────
  if (conSuelo) {
    g.push(
      <rect
        key="hatch" x={-banda} y={yRasante} width={anchoZap + 2 * banda} height={yBase - yRasante}
        fill={`url(#${hatchId})`} opacity={vista === 'armado' ? 0.45 : 0.9}
      />,
      <line
        key="rasante" x1={-banda - 8} y1={yRasante} x2={anchoZap + banda + 8} y2={yRasante}
        stroke={P.hormigonBorde} strokeWidth={1.25}
      />,
    );
  }

  // ── Pilar y zapata ─────────────────────────────────────────────────────────
  g.push(
    <rect key="pilar" x={cx - anchoPil / 2} y={yPilar} width={anchoPil} height={yTecho - yPilar}
      fill={P.pilar} stroke={P.hormigonBorde} strokeWidth={1} />,
    <rect key="zapata" x={0} y={yTecho} width={anchoZap} height={cantoZap}
      fill={P.hormigon} stroke={P.hormigonBorde} strokeWidth={1.25} />,
  );

  // ── Cargas ─────────────────────────────────────────────────────────────────
  if (conCargas) {
    const elu = vista === 'modelo';
    const N = elu ? result.N_elu : result.N_sls;
    const M = elu ? result.My_elu : result.My_sls;
    const H = elu ? result.H_elu : result.H_sls;
    const yA0 = yPilar - 40;
    g.push(<Flecha key="fN" x1={cx} y1={yA0} x2={cx} y2={yPilar - 3} color={P.acento} grosor={1.75} />);
    g.push(
      <Rotulo key="rN" x={cx + 8} y={yA0 + 13} tam={11} color={P.rotulo} peso={500}>
        {`${elu ? 'NEd' : 'N'} = ${dec(N, elu ? 1 : 0)} kN`}
      </Rotulo>,
    );
    if (Math.abs(M) > 1e-9) {
      const mcx = cx + anchoPil / 2 + 26;
      const mcy = yPilar + 16;
      g.push(<Momento key="fM" cx={mcx} cy={mcy} r={11} color={P.acento} />);
      g.push(
        <Rotulo key="rM" x={mcx + 15} y={mcy + 4} tam={10} color={P.rotulo} mono>
          {`${elu ? 'MEd' : 'My'} = ${dec(M, 0)} kNm`}
        </Rotulo>,
      );
    }
    if (Math.abs(H) > 1e-9) {
      const hy = yPilar + 13;
      g.push(<Flecha key="fH" x1={cx - anchoPil / 2 - 44} y1={hy} x2={cx - anchoPil / 2 - 3} y2={hy} color={P.acento} />);
      g.push(
        <Rotulo key="rH" x={cx - anchoPil / 2 - 5} y={hy - 7} tam={10} color={P.rotulo} mono ancla="end">
          {`${elu ? 'HEd' : 'H'} = ${dec(H, elu ? 1 : 0)} kN`}
        </Rotulo>,
      );
    }
  }

  let yFin = yBase;

  // ── Vista TERRENO: reacción del terreno bajo la zapata ─────────────────────
  if (vista === 'terreno') {
    if (vuelco) {
      g.push(
        <Rotulo key="v1" x={cx} y={yBase + 32} tam={12} color={P.fallo} peso={600} ancla="middle">
          VUELCO GEOMÉTRICO
        </Rotulo>,
        <Rotulo key="v2" x={cx} y={yBase + 48} tam={10} color={P.fallo} mono ancla="middle">
          {`e = ${dec(result.ex_sls, 2)} m ≥ B/2 = ${dec(B / 2, 2)} m: sin equilibrio`}
        </Rotulo>,
      );
      yFin = yBase + 56;
    } else {
      const ratio = result.sigma_max / inp.sigma_adm;
      const esc = ALTO_ADM / inp.sigma_adm;
      const hMax = altoPresion(inp, result);
      const hMin = bitri ? 0 : result.sigma_min * esc;
      const xLc = bitri ? anchoZap * (1 - result.loaded_area_fraction) : 0;
      const pts = bitri
        ? `${xLc},${yBase} ${anchoZap},${yBase + hMax} ${anchoZap},${yBase}`
        : `${0},${yBase} ${0},${yBase + hMin} ${anchoZap},${yBase + hMax} ${anchoZap},${yBase}`;
      g.push(
        <polygon key="bloque" points={pts} fill={P.presion} fillOpacity={0.26} stroke={P.presion} strokeWidth={1.25} />,
      );
      // Reacción: flechas hacia arriba dentro del bloque.
      const x0f = xLc;
      const n = Math.max(3, Math.round((anchoZap - x0f) / 26));
      const paso = (anchoZap - x0f) / n;
      for (let i = 0; i < n; i++) {
        const x = x0f + (i + 0.5) * paso;
        const t = (x - x0f) / Math.max(anchoZap - x0f, 1e-6);
        const alt = bitri ? t * hMax : hMin + t * (hMax - hMin);
        if (alt > 13) {
          g.push(
            <g key={`fr${i}`} opacity={0.75}>
              <Flecha x1={x} y1={yBase + alt - 3} x2={x} y2={yBase + 1.5} color={P.presion} grosor={1} punta={5} anchoPunta={2.2} />
            </g>,
          );
        }
      }
      // Línea de σadm — la referencia contra la que se compara.
      const yAdm = yBase + ALTO_ADM;
      g.push(
        <line key="adm" x1={-10} y1={yAdm} x2={anchoZap + 10} y2={yAdm} stroke={P.cota} strokeWidth={1} strokeDasharray="5 4" />,
      );
      // Los dos rótulos del pie cuelgan de x=0 y de x=anchoZap. Cuando el
      // bloque deja sus líneas base a la misma altura Y no caben uno al lado
      // del otro, el de σadm baja una fila: es el único de los dos que puede
      // moverse sin dejar de señalar a su línea.
      const yMax = yBase + hMax;
      const txtAdm = `σadm = ${sigma(inp.sigma_adm)}`;
      const txtMax = Math.abs(result.sigma_max - result.sigma_min) < 1e-6
        ? `σ = ${sigma(result.sigma_max)} uniforme`
        : `σmax = ${sigma(result.sigma_max)}${ratio > TOPE_ADM ? ' (fuera de escala)' : ''}`;
      const chocan = Math.abs(yMax - yAdm) < 16
        && anchoEstimado(txtAdm, 10, true) + anchoEstimado(txtMax, 10, true, 500) + 20 > anchoZap;
      g.push(
        <Rotulo key="radm" x={0} y={yAdm + (chocan ? 30 : 14)} tam={10} color={P.cotaTexto} mono halo={P.papel}>{txtAdm}</Rotulo>,
        <Rotulo key="rmax" x={anchoZap} y={yMax + 14} tam={10} color={colorEstado(P, result.bearing_check.status)} mono peso={500} ancla="end" halo={P.papel}>
          {txtMax}
        </Rotulo>,
      );
      yFin = Math.max(yAdm + (chocan ? 16 : 0), yMax) + 20;
      // σmin cuelga del borde izquierdo del bloque, y sólo si le queda sitio
      // antes del rótulo de σadm, que vive en la misma vertical, y antes del
      // de σmax, que con presión uniforme comparte con él línea base.
      const uniforme = Math.abs(result.sigma_max - result.sigma_min) < 1e-6;
      const cabeMin = anchoEstimado(`σmin = ${sigma(result.sigma_min)}`, 10, true)
        + anchoEstimado(txtMax, 10, true, 500) + 20 <= anchoZap;
      if (!bitri && !uniforme && cabeMin && ALTO_ADM - hMin > 28) {
        g.push(
          <Rotulo key="rmin" x={0} y={yBase + hMin + 13} tam={10} color={P.cotaTexto} mono halo={P.papel}>
            {`σmin = ${sigma(result.sigma_min)}`}
          </Rotulo>,
        );
      }
      if (bitri) {
        g.push(
          <line key="lc" x1={xLc} y1={yBase} x2={xLc} y2={yFin + 4} stroke={P.cota} strokeWidth={0.75} strokeDasharray="3 2" />,
          <Rotulo key="rdesp" x={xLc / 2} y={yBase + 15} tam={10} color={P.atenuado} ancla="middle">
            despegue
          </Rotulo>,
        );
        yFin += 20;
        g.push(
          <CotaH key="cLc" x1={xLc} x2={anchoZap} y={yFin} texto={`Lc = ${dec(result.loaded_area_fraction * B, 2)} m`} color={P.cota} colorTexto={P.cotaTexto} />,
        );
      }
    }
  }

  // ── Vista ARMADO ───────────────────────────────────────────────────────────
  if (vista === 'armado') {
    const cv = Math.max(1.5, (inp.cover / 1000) * s);
    const phiPx = Math.max(1.8, (inp.phi_x / 1000) * s);
    const yBarra = yBase - cv - phiPx / 2;
    const xa = cv;
    const xb = anchoZap - cv;
    // Patilla: un giro de 90º sobre el radio de doblado, no una curva suave.
    const patilla = Math.max(6, Math.min(cantoZap * 0.3, cantoZap - 2 * cv - 4));
    const r = Math.max(2, Math.min(6, cantoZap * 0.16, patilla));
    g.push(
      <rect key="rec" x={cv} y={yTecho + cv} width={anchoZap - 2 * cv} height={cantoZap - 2 * cv}
        fill="none" stroke={P.armaduraTenue} strokeWidth={0.75} strokeDasharray="3 3" />,
      <path
        key="barra"
        d={`M ${xa} ${yBarra - patilla} L ${xa} ${yBarra - r} A ${r} ${r} 0 0 0 ${xa + r} ${yBarra}`
          + ` L ${xb - r} ${yBarra} A ${r} ${r} 0 0 0 ${xb} ${yBarra - r} L ${xb} ${yBarra - patilla}`}
        fill="none" stroke={P.armadura} strokeWidth={Math.max(1.8, phiPx)} strokeLinecap="round"
      />,
    );
    // Barras de la otra dirección, vistas de punta: el radio lo acota la
    // separación DIBUJADA, o con poca escala la cara se vuelve una línea.
    const sep = (inp.s_y / 1000) * s;
    if (sep > 3) {
      const rY = Math.min(Math.max((inp.phi_y / 1000) * s / 2, 1.5), 0.22 * sep);
      const n = Math.floor((xb - xa - 2 * rY - 4) / sep);
      const x0 = cx - (n * sep) / 2;
      for (let i = 0; i <= n; i++) {
        g.push(<circle key={`p${i}`} cx={x0 + i * sep} cy={yBarra - phiPx / 2 - rY} r={rY} fill={P.armadura} />);
      }
    }
    g.push(
      <Rotulo key="rarm" x={cx} y={yTecho + (yBarra - yTecho) / 2 + 3} tam={10} color={P.armadura} mono ancla="middle">
        {`inferior Ø${inp.phi_x} c/${inp.s_x} · Ø${inp.phi_y} c/${inp.s_y}`}
      </Rotulo>,
    );
    // Anclaje: lo que la barra tiene desde la cara del pilar contra lo que pide.
    const anclaje = result.checks.find((c) => c.id === 'anclaje-x');
    if (anclaje) {
      yFin = yBase + 24;
      g.push(
        <CotaH
          key="canc" x1={cx + anchoPil / 2} x2={xb} y={yFin}
          texto={`anclaje ${(anclaje.value ?? '').replace(' mm', '')} ≤ ${(anclaje.limit ?? '').replace('disp. = ', '')}`}
          color={P.cota} colorTexto={colorEstado(P, anclaje.status as 'ok' | 'warn' | 'fail')}
        />,
      );
    }
    const xCotaD = anchoZap + banda + (compacto ? 28 : 26 + anchoEstimado(`h = ${dec(h, 2)}`, 10, true));
    g.push(compacto
      ? <CotaVGirada key="cd" x={xCotaD} y1={yTecho} y2={yBarra} texto={`d = ${result.d_x.toFixed(0)}`} color={P.cota} colorTexto={P.cotaTexto} />
      : <CotaV key="cd" x={xCotaD} y1={yTecho} y2={yBarra} texto={`d = ${result.d_x.toFixed(0)} mm`} color={P.cota} colorTexto={P.cotaTexto} />,
    );
  }

  // ── Vista MODELO ───────────────────────────────────────────────────────────
  if (vista === 'modelo') {
    const exEd = result.N_elu > 0 ? Math.abs(result.My_elu / result.N_elu) : 0;
    const bEd = Math.max(B - 2 * exEd, 0.01);
    const xe0 = Math.max(0, cx + exEd * s - (bEd * s) / 2);
    const xe1 = Math.min(anchoZap, cx + exEd * s + (bEd * s) / 2);
    g.push(
      <rect key="sEd" x={xe0} y={yBase} width={Math.max(xe1 - xe0, 1)} height={ALTO_ED}
        fill={P.presion} fillOpacity={0.22} stroke={P.presion} strokeWidth={1.25} />,
    );
    const nf = Math.max(2, Math.round((xe1 - xe0) / 24));
    for (let i = 0; i < nf; i++) {
      const x = xe0 + ((i + 0.5) * (xe1 - xe0)) / nf;
      g.push(
        <g key={`fe${i}`} opacity={0.7}>
          <Flecha x1={x} y1={yBase + ALTO_ED - 3} x2={x} y2={yBase + 1.5} color={P.presion} grosor={1} punta={5} anchoPunta={2.2} />
        </g>,
      );
    }
    let yTxt = yBase + ALTO_ED + 16;
    g.push(
      <Rotulo key="rEd" x={0} y={yTxt} tam={10} color={P.presion} mono>
        {`σEd = ${sigma(result.sigma_Ed_uniform)}${exEd > 1e-6 ? ` · B′ = ${dec(bEd, 2)} m${compacto ? '' : ' (Meyerhof)'}` : ''}`}
      </Rotulo>,
    );

    if (result.isRigid) {
      // Bielas y tirante: el modelo que rige el armado de una zapata rígida.
      const yTie = yBase - Math.max(8, (inp.cover / 1000) * s + 4);
      const xL = cx - anchoZap / 4;
      const xR = cx + anchoZap / 4;
      const nodo = anchoPil * 0.3;
      for (const [xi, xf, k] of [[cx - nodo, xL, 'l'], [cx + nodo, xR, 'r']] as const) {
        g.push(
          <g key={`b${k}`}>
            <line x1={xi} y1={yTecho} x2={xf} y2={yTie} stroke={P.acento} strokeWidth={10} opacity={0.18} strokeLinecap="round" />
            <line x1={xi} y1={yTecho} x2={xf} y2={yTie} stroke={P.acento} strokeWidth={1} strokeDasharray="4 3" />
          </g>,
        );
      }
      g.push(
        <line key="tie" x1={xL} y1={yTie} x2={xR} y2={yTie} stroke={P.armadura} strokeWidth={3} />,
        <Flecha key="tL" x1={cx} y1={yTie} x2={xL - 12} y2={yTie} color={P.armadura} grosor={0} punta={8} anchoPunta={3.5} />,
        <Flecha key="tR" x1={cx} y1={yTie} x2={xR + 12} y2={yTie} color={P.armadura} grosor={0} punta={8} anchoPunta={3.5} />,
      );
      for (const [x, y, k] of [[xL, yTie, 'a'], [xR, yTie, 'b'], [cx - nodo, yTecho, 'c'], [cx + nodo, yTecho, 'd']] as const) {
        g.push(<circle key={`n${k}`} cx={x} cy={y} r={3.5} fill={P.papel} stroke={P.acento} strokeWidth={1.5} />);
      }
      g.push(
        <Rotulo key="rTd" x={cx} y={yTie - 9} tam={10} color={P.armadura} mono peso={500} ancla="middle">
          {`Td = ${dec(result.Td_x, 0)} kN`}
        </Rotulo>,
        <CotaVGirada key="cz" x={-10} y1={yTecho} y2={yTie} texto="0,85·d" color={P.cota} colorTexto={P.cotaTexto} />,
      );
      yTxt += FILA;
      g.push(
        <Rotulo key="rcrit" x={0} y={yTxt} tam={10} color={P.acento} mono>
          {`v = ${dec(result.v_max, 2)} ≤ 2h = ${dec(2 * h, 2)}${compacto ? ' → rígida' : ' m → rígida: biela-tirante'}`}
        </Rotulo>,
      );
    } else {
      // Secciones de cálculo: la cara del pilar (flexión) y a d de ella (cortante).
      const xS1 = cx + anchoPil / 2;
      const xS2 = Math.min(xS1 + (result.d_x / 1000) * s, anchoZap);
      for (const [x, t] of [[xS1, 'S1'], [xS2, 'S2']] as const) {
        g.push(
          <g key={`s${t}`}>
            <line x1={x} y1={yTecho - 32} x2={x} y2={yBase + ALTO_ED + 5} stroke={P.acento} strokeWidth={1.25} strokeDasharray="5 3" />
            <Rotulo x={x} y={yTecho - 36} tam={10} color={P.acento} mono peso={600} ancla="middle">{t}</Rotulo>
          </g>,
        );
      }
      const txtD = `d = ${result.d_x.toFixed(0)} mm`;
      g.push(
        <CotaH
          key="cd2" x1={xS1} x2={xS2} y={yTecho - 14} texto={txtD} color={P.cota} colorTexto={P.cotaTexto}
          anclaTexto={anchoEstimado(txtD, 10, true) > xS2 - xS1 ? { x: xS2 + 5, ancla: 'start' } : undefined}
        />,
      );
      yTxt += FILA;
      g.push(
        <Rotulo key="rS1" x={0} y={yTxt} tam={10} color={P.acento} mono>
          {compacto ? `S1 · MEd = ${dec(result.MEd_x, 1)} kNm/m` : `S1 · cara del pilar · MEd = ${dec(result.MEd_x, 1)} kNm/m`}
        </Rotulo>,
      );
      yTxt += FILA;
      g.push(
        <Rotulo key="rS2" x={0} y={yTxt} tam={10} color={P.acento} mono>
          {compacto ? `S2 · VEd = ${dec(result.VEd_x, 1)} kN/m` : `S2 · a d de la cara · VEd = ${dec(result.VEd_x, 1)} kN/m`}
        </Rotulo>,
      );
      yTxt += FILA;
      g.push(
        <Rotulo key="rcrit" x={0} y={yTxt} tam={10} color={P.acento} mono>
          {`v = ${dec(result.v_max, 2)} > 2h = ${dec(2 * h, 2)}${compacto ? ' → flexible' : ' m → flexible: flexión y cortante'}`}
        </Rotulo>,
      );
    }
    yFin = yTxt + 6;
  }

  // ── Cotas de la sección ────────────────────────────────────────────────────
  if (conSuelo) {
    g.push(compacto
      ? <CotaVGirada key="cDf" x={-banda - 8} y1={yRasante} y2={yBase} texto={`Df = ${dec(Df, 2)}`} color={P.cota} colorTexto={P.cotaTexto} />
      : <CotaV key="cDf" x={-banda - 12} y1={yRasante} y2={yBase} texto={`Df = ${dec(Df, 2)}`}
        lado="izquierda" color={P.cota} colorTexto={P.cotaTexto} />,
    );
  }
  const xCotaH = anchoZap + (conSuelo ? banda : 0) + (compacto ? 10 : 12);
  g.push(compacto
    ? <CotaVGirada key="ch" x={xCotaH} y1={yTecho} y2={yBase} texto={`h = ${dec(h, 2)}`} color={P.cota} colorTexto={P.cotaTexto} />
    : <CotaV key="ch" x={xCotaH} y1={yTecho} y2={yBase} texto={`h = ${dec(h, 2)}`} color={P.cota} colorTexto={P.cotaTexto} />,
  );
  const yB = yFin + 24;
  g.push(<CotaH key="cB" x1={0} x2={anchoZap} y={yB} texto={`B = ${dec(B, 2)} m`} color={P.cota} colorTexto={P.cotaTexto} />);

  return {
    el: <g aria-label="Sección">{g}</g>,
    izq: izqSeccion(inp, vista, compacto),
    der: derSeccion(inp, result, vista, compacto),
    alto: yB + 8,
  };
}

// ── Planta ────────────────────────────────────────────────────────────────────

interface OpcPlanta {
  inp: IsolatedFootingInputs;
  result: IsolatedFootingResult;
  P: Paleta;
  s: number;
  vista: IsolatedFootingView;
  gradId: string;
  compacto: boolean;
}

/** Margen izquierdo de la planta: la cota L girada y, en la vista de terreno,
 *  la marca de la sección A-A. */
function izqPlanta(vista: IsolatedFootingView): number {
  return 26 + (vista === 'terreno' ? 12 : 0);
}

function derPlanta(vista: IsolatedFootingView): number {
  return vista === 'terreno' ? 26 : 12;
}

function dibujarPlanta(o: OpcPlanta): Figura {
  const { inp, result, P, s, vista, gradId, compacto } = o;
  const { B, L, bc, hc } = inp;
  const vuelco = result.distributionType === 'overturning_fail';
  const bitri = result.distributionType !== 'trapezoidal' && !vuelco;
  const g: ReactNode[] = [];

  const w = B * s;
  const hh = L * s;
  const y0 = CAB_ALTO;
  const cx = w / 2;
  const cy = y0 + hh / 2;
  const a = (bc / 2) * s;
  const b = (hc / 2) * s;

  g.push(
    <Cabecera key="cab" x={0} y={CAB_ALTO - 8} color={P.atenuado}>
      {compacto ? 'PLANTA'
        : vista === 'terreno' ? 'PLANTA · NÚCLEO CENTRAL Y RESULTANTE'
          : vista === 'armado' ? 'PLANTA · PARRILLA INFERIOR'
            : result.isRigid ? 'PLANTA · TIRANTES EN LAS DOS DIRECCIONES' : 'PLANTA · SECCIONES Y PERÍMETRO DE PUNZONAMIENTO'}
    </Cabecera>,
    <rect key="zap" x={0} y={y0} width={w} height={hh} fill={P.hormigon} stroke={P.hormigonBorde} strokeWidth={1.25} />,
  );

  // ── Vista TERRENO: mapa de presión + núcleo central ────────────────────────
  if (vista === 'terreno' && !vuelco) {
    if (bitri) {
      const xLc = w * (1 - result.loaded_area_fraction);
      g.push(
        <rect key="grad" x={xLc} y={y0} width={w - xLc} height={hh} fill={`url(#${gradId})`} />,
        <line key="lLc" x1={xLc} y1={y0} x2={xLc} y2={y0 + hh} stroke={P.presion} strokeWidth={1} strokeDasharray="4 3" />,
        <Rotulo key="rd" x={xLc / 2} y={y0 + hh - 10} tam={10} color={P.atenuado} ancla="middle">despegue</Rotulo>,
      );
    } else {
      g.push(<rect key="grad" x={0} y={y0} width={w} height={hh} fill={`url(#${gradId})`} />);
    }
  }

  // ── Vista ARMADO: la parrilla a su separación real ─────────────────────────
  if (vista === 'armado') {
    const cv = Math.max(1.5, (inp.cover / 1000) * s);
    const sx = (inp.s_x / 1000) * s;
    const sy = (inp.s_y / 1000) * s;
    g.push(
      <rect key="rec" x={cv} y={y0 + cv} width={w - 2 * cv} height={hh - 2 * cv}
        fill="none" stroke={P.armaduraTenue} strokeWidth={0.75} strokeDasharray="3 3" />,
    );
    if (sx > 3) {
      const n = Math.floor((hh - 2 * cv) / sx);
      const yy0 = cy - (n * sx) / 2;
      for (let i = 0; i <= n; i++) {
        g.push(<line key={`bx${i}`} x1={cv} y1={yy0 + i * sx} x2={w - cv} y2={yy0 + i * sx} stroke={P.armadura} strokeWidth={1.3} />);
      }
    }
    if (sy > 3) {
      const n = Math.floor((w - 2 * cv) / sy);
      const xx0 = cx - (n * sy) / 2;
      for (let i = 0; i <= n; i++) {
        g.push(<line key={`by${i}`} x1={xx0 + i * sy} y1={y0 + cv} x2={xx0 + i * sy} y2={y0 + hh - cv} stroke={P.armadura} strokeWidth={1.3} />);
      }
    }
  }

  // ── Vista MODELO (rígida): los dos tirantes, bajo el pilar ─────────────────
  if (vista === 'modelo' && result.isRigid) {
    const cv = Math.max(2, (inp.cover / 1000) * s);
    g.push(
      // El tirante MUERE en el recubrimiento: una punta asomando por fuera de
      // la zapata diría que la armadura sale del hormigón.
      <line key="tx" x1={cv} y1={cy} x2={w - cv} y2={cy} stroke={P.armadura} strokeWidth={2.5} />,
      <Flecha key="txa" x1={cx} y1={cy} x2={cv} y2={cy} color={P.armadura} grosor={0} punta={8} anchoPunta={3.5} />,
      <Flecha key="txb" x1={cx} y1={cy} x2={w - cv} y2={cy} color={P.armadura} grosor={0} punta={8} anchoPunta={3.5} />,
      <line key="ty" x1={cx} y1={y0 + cv} x2={cx} y2={y0 + hh - cv} stroke={P.armadura} strokeWidth={2.5} />,
      <Flecha key="tya" x1={cx} y1={cy} x2={cx} y2={y0 + cv} color={P.armadura} grosor={0} punta={8} anchoPunta={3.5} />,
      <Flecha key="tyb" x1={cx} y1={cy} x2={cx} y2={y0 + hh - cv} color={P.armadura} grosor={0} punta={8} anchoPunta={3.5} />,
    );
  }

  // ── Pilar ──────────────────────────────────────────────────────────────────
  g.push(<rect key="pil" x={cx - a} y={cy - b} width={2 * a} height={2 * b} fill={P.pilar} stroke={P.hormigonBorde} strokeWidth={1} />);
  const rotPilar = `${dec(bc, 2)} × ${dec(hc, 2)}`;
  if (2 * a >= anchoEstimado(rotPilar, 9) + 8 && 2 * b >= 20) {
    g.push(
      <Rotulo key="rpil" x={cx} y={vista === 'terreno' ? cy + b - 6 : cy + 3} tam={9} color={P.secundario} ancla="middle">
        {rotPilar}
      </Rotulo>,
    );
  }

  // ── Núcleo central y resultante ────────────────────────────────────────────
  if (vista === 'terreno') {
    const rx = (B / 6) * s;
    const ry = (L / 6) * s;
    g.push(
      <path key="nuc" d={`M ${cx} ${cy - ry} L ${cx + rx} ${cy} L ${cx} ${cy + ry} L ${cx - rx} ${cy} Z`}
        fill={P.acento} fillOpacity={0.07} stroke={P.acento} strokeWidth={1} strokeDasharray="4 3" />,
      <Rotulo key="rnuc" x={cx} y={cy + ry + 12} tam={9} color={P.acento} ancla="middle" halo={P.papel}>
        núcleo central
      </Rotulo>,
    );
    if (vuelco) {
      g.push(
        <Rotulo key="rfuera" x={cx} y={cy + ry + 26} tam={9} color={P.fallo} ancla="middle" halo={P.papel}>
          la resultante cae fuera de la zapata
        </Rotulo>,
      );
    } else {
      const rxp = cx + result.ex_sls * s;
      const ryp = cy + result.ey_sls * s;
      const txt = result.ex_sls > 1e-6 || result.ey_sls > 1e-6
        ? `N · e = ${dec(Math.hypot(result.ex_sls, result.ey_sls), 2)} m`
        : 'N centrado · e = 0';
      // El rótulo va al lado que le quepa dentro de la planta, y si no cabe a
      // ninguno, debajo del punto y centrado: fuera del rectángulo se montaría
      // sobre la cota L.
      const wTxt = anchoEstimado(txt, 10, true, 500);
      const derecha = rxp + 10 + wTxt < w - 4;
      const izquierda = !derecha && rxp - 10 - wTxt > 4;
      const xTxt = derecha ? rxp + 9 : izquierda ? rxp - 9 : Math.min(Math.max(rxp, wTxt / 2 + 4), w - wTxt / 2 - 4);
      g.push(
        <circle key="res" cx={rxp} cy={ryp} r={4.5} fill={P.acento} stroke={P.papel} strokeWidth={1.5} />,
        <Rotulo key="rres" x={xTxt} y={derecha || izquierda ? ryp - 8 : ryp - 12} tam={10} color={P.acento} mono peso={500}
          ancla={derecha ? 'start' : izquierda ? 'end' : 'middle'} halo={P.papel}>
          {txt}
        </Rotulo>,
      );
    }
    // Traza de la sección A-A: cruza la planta, con la letra fuera a cada
    // lado. Dice por dónde está cortada la figura de al lado.
    g.push(
      <g key="marcas">
        <line x1={-8} y1={cy} x2={w + 8} y2={cy} stroke={P.hormigonBorde} strokeWidth={0.9} strokeDasharray="8 3 2 3" opacity={0.7} />
        <Rotulo x={-12} y={cy + 3} tam={9} color={P.hormigonBorde} peso={600} ancla="end" halo={P.papel}>A</Rotulo>
        <Rotulo x={w + 12} y={cy + 3} tam={9} color={P.hormigonBorde} peso={600} halo={P.papel}>A</Rotulo>
      </g>,
    );
  }

  // ── Vista MODELO (flexible): perímetros y secciones ────────────────────────
  if (vista === 'modelo' && !result.isRigid) {
    const R = 2 * (result.d_avg / 1000) * s;
    const dx = (result.d_x / 1000) * s;
    g.push(
      <rect key="u0" x={cx - a} y={cy - b} width={2 * a} height={2 * b} fill="none" stroke={P.acento} strokeWidth={1.5} />,
      <path key="u1"
        d={`M ${cx - a} ${cy - b - R} H ${cx + a} A ${R} ${R} 0 0 1 ${cx + a + R} ${cy - b}`
          + ` V ${cy + b} A ${R} ${R} 0 0 1 ${cx + a} ${cy + b + R} H ${cx - a}`
          + ` A ${R} ${R} 0 0 1 ${cx - a - R} ${cy + b} V ${cy - b} A ${R} ${R} 0 0 1 ${cx - a} ${cy - b - R} Z`}
        fill={P.acento} fillOpacity={0.05} stroke={P.acento} strokeWidth={1.25} strokeDasharray="5 3" />,
    );
    for (const [x, t, k] of [[cx + a, 'S1', 1], [cx + a + dx, 'S2', 2], [cx - a, 'S1', 3], [cx - a - dx, 'S2', 4]] as const) {
      if (x < 2 || x > w - 2) continue;
      g.push(
        <g key={`sec${k}`}>
          <line x1={x} y1={y0 + 4} x2={x} y2={y0 + hh - 4} stroke={P.cota} strokeWidth={0.9} strokeDasharray="4 3" />
          <Rotulo x={x + 3} y={y0 + hh - 7} tam={9} color={P.cotaTexto} mono halo={P.papel}>{t}</Rotulo>
        </g>,
      );
    }
  }

  // ── Cotas de la planta ─────────────────────────────────────────────────────
  const yB = y0 + hh + 22;
  g.push(
    <CotaH key="cB" x1={0} x2={w} y={yB} texto={`B = ${dec(B, 2)} m`} color={P.cota} colorTexto={P.cotaTexto} />,
    <CotaVGirada key="cL" x={-14} y1={y0} y2={y0 + hh} texto={`L = ${dec(L, 2)} m`} color={P.cota} colorTexto={P.cotaTexto}
      fraccion={vista === 'terreno' ? 0.26 : 0.5} />,
  );

  let alto = yB + 8;

  // Pie de la planta: lo que la figura no puede decir con líneas.
  const pie = vista === 'armado'
    ? `inferior Ø${inp.phi_x} c/${inp.s_x} ∥ B · Ø${inp.phi_y} c/${inp.s_y} ∥ L`
    : vista === 'modelo'
      ? (result.isRigid
        ? `Td,x = ${dec(result.Td_x, 0)} kN · Td,y = ${dec(result.Td_y, 0)} kN`
        : `u1 (a 2d) = ${dec(result.u1 / 1000, 2)} m · u0 = ${dec(2 * (bc + hc), 2)} m`)
      : null;
  if (pie) {
    g.push(
      <Rotulo key="pie" x={w / 2} y={alto + 12} tam={10} color={vista === 'armado' ? P.armadura : P.acento} mono ancla="middle">
        {pie}
      </Rotulo>,
    );
    alto += 18;
  }

  return { el: <g aria-label="Planta">{g}</g>, izq: izqPlanta(vista), der: derPlanta(vista), alto };
}

// ── Leyenda ───────────────────────────────────────────────────────────────────

type MarcaLeyenda = 'bloque' | 'linea' | 'trazos' | 'punto' | 'rombo' | 'banda';

interface ItemLeyenda { marca: MarcaLeyenda; color: string; texto: string; grosor?: number }

function itemsLeyenda(P: Paleta, vista: IsolatedFootingView, result: IsolatedFootingResult, compacto: boolean): ItemLeyenda[] {
  if (vista === 'terreno') {
    const base: ItemLeyenda[] = [
      { marca: 'bloque', color: P.presion, texto: compacto ? 'reacción σ, a escala de σadm' : 'reacción del terreno σ, a escala de σadm' },
      { marca: 'trazos', color: P.cota, texto: compacto ? 'σadm del terreno' : 'σadm del geotécnico' },
    ];
    if (result.distributionType !== 'overturning_fail') {
      base.push({ marca: 'rombo', color: P.acento, texto: compacto ? 'núcleo central' : 'núcleo central: dentro, contacto pleno' });
      base.push({ marca: 'punto', color: P.acento, texto: compacto ? 'resultante N' : 'resultante N, e = M/N' });
    }
    return base;
  }
  if (vista === 'armado') {
    return [
      { marca: 'linea', color: P.armadura, texto: compacto ? 'parrilla inferior con patilla' : 'parrilla inferior, patilla de 90º en los bordes', grosor: 2.5 },
      { marca: 'trazos', color: P.armaduraTenue, texto: 'recubrimiento r' },
      { marca: 'linea', color: P.cota, texto: compacto ? 'd = h − r − Ø/2' : 'd = h − r − Ø/2 · anclaje frente al vuelo disponible', grosor: 1 },
    ];
  }
  const sigmaEd = compacto ? 'σEd sobre el área eficaz' : 'σEd uniforme sobre el área eficaz (ELU)';
  return result.isRigid
    ? [
      { marca: 'bloque', color: P.presion, texto: sigmaEd },
      { marca: 'banda', color: P.acento, texto: 'biela comprimida' },
      { marca: 'linea', color: P.armadura, texto: compacto ? 'tirante Td' : 'tirante Td (CE Anejo 19 §6.5)', grosor: 3 },
    ]
    : [
      { marca: 'bloque', color: P.presion, texto: sigmaEd },
      { marca: 'trazos', color: P.acento, texto: compacto ? 'S1 flexión · S2 cortante · u1 punzonamiento' : 'S1 flexión · S2 cortante a d · u1 punzonamiento a 2d' },
    ];
}

/** La leyenda reparte en las columnas que CABEN, medidas con `anchoEstimado`.
 *  Su alto es el margen inferior del dibujo: si reparte mal, se come la cota. */
function dibujarLeyenda(items: ItemLeyenda[], P: Paleta, ancho: number, y: number): { el: ReactNode; alto: number } {
  const MARCA = 18;
  const SEP = 22;
  const anchos = items.map((i) => MARCA + 5 + anchoEstimado(i.texto, 10));
  const filas: ItemLeyenda[][] = [];
  let actual: ItemLeyenda[] = [];
  let usado = 0;
  items.forEach((it, i) => {
    const w = anchos[i];
    if (actual.length > 0 && usado + SEP + w > ancho) {
      filas.push(actual);
      actual = [];
      usado = 0;
    }
    actual.push(it);
    usado += (actual.length > 1 ? SEP : 0) + w;
  });
  if (actual.length) filas.push(actual);

  const el = (
    <g aria-hidden="true">
      {filas.map((fila, fi) => {
        let x = 0;
        const yf = y + 10 + fi * 17;
        return (
          <g key={fi}>
            {fila.map((it, ii) => {
              const xi = x;
              x += MARCA + 5 + anchoEstimado(it.texto, 10) + SEP;
              return (
                <g key={ii}>
                  {it.marca === 'bloque' && <rect x={xi} y={yf - 8} width={MARCA} height={8} fill={it.color} fillOpacity={0.26} stroke={it.color} strokeWidth={1} />}
                  {it.marca === 'trazos' && <line x1={xi} y1={yf - 4} x2={xi + MARCA} y2={yf - 4} stroke={it.color} strokeWidth={1.25} strokeDasharray="4 3" />}
                  {it.marca === 'linea' && <line x1={xi} y1={yf - 4} x2={xi + MARCA} y2={yf - 4} stroke={it.color} strokeWidth={it.grosor ?? 2} />}
                  {it.marca === 'punto' && <circle cx={xi + MARCA / 2} cy={yf - 4} r={4} fill={it.color} />}
                  {it.marca === 'rombo' && (
                    <path d={`M ${xi + MARCA / 2} ${yf - 11} L ${xi + MARCA} ${yf - 4} L ${xi + MARCA / 2} ${yf + 3} L ${xi} ${yf - 4} Z`}
                      fill={it.color} fillOpacity={0.1} stroke={it.color} strokeWidth={1} strokeDasharray="3 2" />
                  )}
                  {it.marca === 'banda' && (
                    <g>
                      <line x1={xi} y1={yf - 4} x2={xi + MARCA} y2={yf - 4} stroke={it.color} strokeWidth={8} opacity={0.22} />
                      <line x1={xi} y1={yf - 4} x2={xi + MARCA} y2={yf - 4} stroke={it.color} strokeWidth={1} strokeDasharray="4 3" />
                    </g>
                  )}
                  <Rotulo x={xi + MARCA + 5} y={yf} tam={10} color={P.secundario}>{it.texto}</Rotulo>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
  return { el, alto: filas.length * 17 + 8 };
}

// ── Componente ────────────────────────────────────────────────────────────────

export function IsolatedFootingSVG({
  inp, result, width, height, mode = 'screen', view = 'terreno', system = 'si',
}: Props) {
  const isPdf = mode === 'pdf';
  const P = paleta(isPdf);
  const uid = useId().replace(/:/g, '');
  const hatchId = `if-suelo-${uid}`;
  const gradId = `if-presion-${uid}`;

  if (!result.valid && result.error) {
    return (
      <div
        className={mode === 'screen' ? 'flex items-center justify-center text-text-disabled text-sm' : undefined}
        style={{ width, height: 80 }}
      >
        {mode === 'screen' && <span>Sin datos — completar entradas</span>}
      </div>
    );
  }

  const sigma = (v: number) => formatQuantity(v, 'soilPressure', system);
  const lado = width >= ANCHO_LADO;
  const compacto = width < ANCHO_COMPACTO;
  const margen = 10;
  const anchoUtil = width - 2 * margen;
  const altoUtil = (height ?? (lado ? 470 : 660)) - 2 * margen;

  // Los márgenes salen del texto, no de la escala: se resuelven antes y dejan
  // la escala como una división. Una sola para las dos figuras (invariante).
  const sIzq = izqSeccion(inp, view, compacto);
  const sDer = derSeccion(inp, result, view, compacto);
  const pIzq = izqPlanta(view);
  const pDer = derPlanta(view);

  const conSuelo = view !== 'modelo';
  const fijoSec = altoSobreBase(view) + altoBajoBase(inp, result, view) + (conSuelo ? 0 : 10);
  const metrosSec = conSuelo ? inp.Df : inp.h;
  const fijoPla = CAB_ALTO + 30 + (view === 'terreno' ? 0 : 18);

  const anchoLado = lado
    ? (anchoUtil - Math.max(sDer + pIzq, 40)) / 2
    : anchoUtil;
  const sAnchoSec = (anchoLado - (lado ? sIzq : Math.max(sIzq, pIzq)) - (lado ? 0 : Math.max(sDer, pDer))) / inp.B;
  const sAnchoPla = lado ? (anchoLado - pDer) / inp.B : sAnchoSec;
  const sAlto = lado
    ? Math.min(
      (altoUtil - fijoSec) / metrosSec,
      (altoUtil - fijoPla) / inp.L,
    )
    : (altoUtil - fijoSec - GAP_FIG - fijoPla) / (metrosSec + inp.L);

  const s = Math.max(14, Math.min(sAnchoSec, sAnchoPla, sAlto, ESCALA_MAX));

  const sec = dibujarSeccion({ inp, result, P, s, vista: view, sigma, hatchId, compacto });
  const pla = dibujarPlanta({ inp, result, P, s, vista: view, gradId, compacto });

  // Colocación. En vertical las dos figuras comparten el borde izquierdo de la
  // zapata: apiladas se leen en proyección, así que una cota bajada de una a
  // otra tiene que caer donde debe.
  let xSec: number, ySec: number, xPla: number, yPla: number, anchoFig: number, altoFig: number;
  if (lado) {
    xSec = sec.izq;
    ySec = 0;
    xPla = sec.izq + inp.B * s + sec.der + 28 + pla.izq;
    yPla = 0;
    anchoFig = xPla + inp.B * s + pla.der;
    altoFig = Math.max(sec.alto, pla.alto);
  } else {
    const izq = Math.max(sec.izq, pla.izq);
    xSec = izq;
    xPla = izq;
    ySec = 0;
    yPla = sec.alto + GAP_FIG;
    anchoFig = izq + inp.B * s + Math.max(sec.der, pla.der);
    altoFig = yPla + pla.alto;
  }

  const desplazado = Math.max(0, (anchoUtil - anchoFig) / 2);
  const leyenda = dibujarLeyenda(itemsLeyenda(P, view, result, compacto), P, anchoUtil, margen + altoFig);
  const alturaSvg = margen + altoFig + leyenda.alto + margen;

  const titleId = `if-t-${uid}`;
  const descId = `if-d-${uid}`;
  const distLabel = ({
    trapezoidal:           'trapecial',
    bitriangular_uniaxial: 'bitriangular uniaxial',
    bitriangular_biaxial:  'bitriangular biaxial',
    overturning_fail:      'vuelco geométrico',
  } as const)[result.distributionType];

  return (
    <div style={isPdf ? { background: '#fff' } : undefined}>
      <svg
        width={width}
        height={alturaSvg}
        viewBox={`0 0 ${width} ${alturaSvg}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>
          {`Zapata aislada — vista ${view === 'terreno' ? 'del terreno' : view === 'armado' ? 'del armado' : 'del modelo de cálculo'}`}
        </title>
        <desc id={descId}>
          {`Zapata ${dec(inp.B, 2)}×${dec(inp.L, 2)}×${dec(inp.h, 2)} m con pilar ${dec(inp.bc, 2)}×${dec(inp.hc, 2)} m. `}
          {`Distribución ${distLabel}, σmáx ${sigma(result.sigma_max)} frente a σadm ${sigma(inp.sigma_adm)}. `}
          {`Zapata ${result.isRigid ? 'rígida' : 'flexible'} (v = ${dec(result.v_max, 2)} m, 2h = ${dec(2 * inp.h, 2)} m).`}
        </desc>

        <defs>
          <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke={P.terreno} strokeWidth="0.8" />
          </pattern>
          <Degradado id={gradId} P={P} result={result} />
        </defs>

        <g transform={`translate(${margen + desplazado + xSec} ${margen + ySec})`}>{sec.el}</g>
        <g transform={`translate(${margen + desplazado + xPla} ${margen + yPla})`}>{pla.el}</g>
        <g transform={`translate(${margen} 0)`}>{leyenda.el}</g>
      </svg>
    </div>
  );
}

/** Mapa de presión de la planta: apunta del lado descargado al cargado, con la
 *  dirección de la excentricidad biaxial. Sin excentricidad no hay degradado:
 *  un tinte plano dice «uniforme» mejor que un falso gradiente. */
function Degradado({ id, P, result }: { id: string; P: Paleta; result: IsolatedFootingResult }) {
  const e = Math.hypot(result.ex_sls, result.ey_sls);
  const uniforme = e < 1e-9 || Math.abs(result.sigma_max - result.sigma_min) < 1e-6;
  const vx = e > 1e-9 ? result.ex_sls / e : 1;
  const vy = e > 1e-9 ? result.ey_sls / e : 0;
  const bitri = result.distributionType === 'bitriangular_uniaxial' || result.distributionType === 'bitriangular_biaxial';
  return (
    <linearGradient id={id} x1={0.5 - vx / 2} y1={0.5 - vy / 2} x2={0.5 + vx / 2} y2={0.5 + vy / 2}>
      <stop offset="0%" stopColor={P.presion} stopOpacity={uniforme ? 0.18 : bitri ? 0.03 : 0.06} />
      <stop offset="100%" stopColor={P.presion} stopOpacity={uniforme ? 0.18 : 0.42} />
    </linearGradient>
  );
}
