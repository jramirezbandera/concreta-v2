// Micropilotes — cuatro vistas en un solo archivo.
// mode='screen' = paleta dark UI; mode='pdf' = paleta clara papel.

import { type MicropilesInputs, type SoilLayer } from '../../data/defaults';
import { type MicropilesResult } from '../../lib/calculations/micropiles';
import { resolveTubeGeometry } from '../../data/micropileTubes';
import { getMinStructuralCover } from '../../data/micropileLookups';

export type MicropilesView = 'profile' | 'rfcCurve' | 'topSection' | 'semaphores';

interface MicropilesSVGProps {
  inp: MicropilesInputs;
  soil: SoilLayer[];
  result: MicropilesResult;
  view: MicropilesView;
  width?: number;
  height?: number;
  mode?: 'screen' | 'pdf';
}

interface StratumBand {
  /** Color superior del gradiente vertical (la cara que mira a la rasante). */
  fill1: string;
  /** Color inferior (la cara más profunda). */
  fill2: string;
}

interface Palette {
  bg:            string;
  bgPanel:       string;
  border:        string;
  text:          string;
  textDim:       string;
  textMuted:     string;
  axis:          string;
  /** Color del patrón de puntos para estratos GRANULARES (sobre cualquier banda). */
  granularDot:   string;
  /** Color del patrón de líneas para estratos COHESIVOS (sobre cualquier banda). */
  cohesiveLine:  string;
  /** Paleta cíclica de bandas: cada estrato toma `strataBands[i % len]`. La
   *  rotación por POSICIÓN (no por tipo) garantiza que dos granulares
   *  consecutivos se distinguen a la vista; el tipo se sigue leyendo por
   *  la textura (puntos vs líneas). */
  strataBands:   StratumBand[];
  water:         string;
  steel:         string;
  steelEdge:     string;
  concrete:      string;
  cap:           string;
  curveTheo:     string;
  curveEmp:      string;
  loadLine:      string;
  ok:            string;
  warn:          string;
  fail:          string;
  neutral:       string;
}

// Screen palette via theme tokens (follows light/dark). Soil strata + granular/
// cohesive use --color-geo-* (light = white-paper tones from PDF below). Concrete
// grey reads on both themes → literal. PDF palette stays literal (print).
const SCREEN: Palette = {
  bg:           'transparent',
  bgPanel:      'var(--color-bg-primary)',
  border:       'var(--color-border-main)',
  text:         'var(--color-chart-label)',
  textDim:      'var(--color-chart-dim-text)',
  textMuted:    'var(--color-chart-rebar-dim)',
  axis:         'var(--color-chart-section)',
  granularDot:  'var(--color-geo-granular-dot)',
  cohesiveLine: 'var(--color-geo-cohesive-line)',
  strataBands: [
    { fill1: 'var(--color-geo-s1a)', fill2: 'var(--color-geo-s1b)' },
    { fill1: 'var(--color-geo-s2a)', fill2: 'var(--color-geo-s2b)' },
    { fill1: 'var(--color-geo-s3a)', fill2: 'var(--color-geo-s3b)' },
    { fill1: 'var(--color-geo-s4a)', fill2: 'var(--color-geo-s4b)' },
    { fill1: 'var(--color-geo-s5a)', fill2: 'var(--color-geo-s5b)' },
    { fill1: 'var(--color-geo-s6a)', fill2: 'var(--color-geo-s6b)' },
  ],
  water:        'var(--color-accent)',
  steel:        'var(--color-text-secondary)',
  steelEdge:    'var(--color-chart-rebar-dim)',
  concrete:     '#6b7280',
  cap:          'var(--color-bg-elevated)',
  curveTheo:    'var(--color-accent)',
  curveEmp:     'var(--color-chart-dim-text)',
  loadLine:     'var(--color-state-fail)',
  ok:           'var(--color-state-ok)',
  warn:         'var(--color-state-warn)',
  fail:         'var(--color-state-fail)',
  neutral:      'var(--color-state-neutral)',
};

const PDF: Palette = {
  bg:           '#ffffff',
  bgPanel:      '#f8fafc',
  border:       '#cbd5e1',
  text:         '#1f2937',
  textDim:      '#475569',
  textMuted:    '#94a3b8',
  axis:         '#64748b',
  granularDot:  '#5c4520',          // oscuro sobre paleta clara
  cohesiveLine: '#3d2e1a',
  strataBands: [
    { fill1: '#e0c89a', fill2: '#b89968' },   // L1 sand
    { fill1: '#c4bb88', fill2: '#9a9162' },   // L2 olive sand
    { fill1: '#d49774', fill2: '#a96b48' },   // L3 terracotta
    { fill1: '#b09480', fill2: '#84685a' },   // L4 brown clay
    { fill1: '#cdb872', fill2: '#a39150' },   // L5 ochre
    { fill1: '#c08868', fill2: '#946248' },   // L6 russet
  ],
  water:        '#0ea5e9',
  steel:        '#475569',
  steelEdge:    '#1f2937',
  concrete:     '#6b7280',
  cap:          '#e2e8f0',
  curveTheo:    '#0284c7',
  curveEmp:     '#64748b',
  loadLine:     '#dc2626',
  ok:           '#15803d',
  warn:         '#b45309',
  fail:         '#b91c1c',
  neutral:      '#64748b',
};

const fmt1 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ────────────────────────────────────────────────────────────────────────────
// View 1: perfil del terreno
// ────────────────────────────────────────────────────────────────────────────

function PerfilView({
  inp, soil, p, width, height,
}: { inp: MicropilesInputs; soil: SoilLayer[]; p: Palette; width: number; height: number }) {
  // Plot coords: y crece hacia abajo (profundidad). Margen para ejes y tags.
  const M = { top: 26, right: 132, bottom: 22, left: 56 };
  const plotW = Math.max(60, width  - M.left - M.right);
  const plotH = Math.max(80, height - M.top  - M.bottom);

  // Profundidad máxima a representar (absoluta desde rasante, positiva ↓).
  // Convención v4: topDepth/toeDepth ya son profundidades positivas, sin
  // necesidad de negarlas como con la antigua cota.
  const zHead = inp.topDepth;
  const zToe  = inp.toeDepth;
  const zMax  = Math.max(zToe + 2, 4);
  const yOfDepth = (z: number) => M.top + (z / zMax) * plotH;

  // Estratos: espesores medidos DESDE LA RASANTE (convención del geotécnico).
  // Cada estrato i ocupa [Σtₖ₍ₖ<ᵢ₎, Σtₖ₍ₖ≤ᵢ₎] medido desde z=0 (superficie).
  // El primer estrato arranca en la rasante de forma natural — antes lo
  // estirábamos para tapar el hueco, ahora no hace falta porque la primera
  // capa ya cubre cota 0 → t₁ por definición.
  const layerBands = soil
    .reduce<{ layer: SoilLayer; z0: number; z1: number }[]>((acc, layer) => {
      const z0 = acc.length === 0 ? 0 : acc[acc.length - 1].z1;
      const z1 = Math.min(zMax, z0 + layer.thickness);
      acc.push({ layer, z0, z1 });
      return acc;
    }, [])
    .filter((b) => b.z0 < zMax);

  // Pilote: rectángulo vertical centrado. No es escala real (a esa proporción
  // — D≈200mm / L≈15m — el pilote sería invisible) pero se mantiene fino para
  // que el lector reconozca un MICROpilote, no un pilote convencional.
  const pileXCenter = M.left + plotW * 0.42;
  const pileW       = Math.max(4, plotW * 0.022);
  const pileXL      = pileXCenter - pileW / 2;
  const pileYTop    = yOfDepth(zHead);
  const pileYBot    = yOfDepth(zToe);
  // Encepado: rectángulo ancho sobre la cabeza del pilote — debe leerse
  // como conexión estructural, no como tapón fino. Ancho absoluto en lugar
  // de relativo al pilote (ahora muy fino) para que la conexión siga siendo
  // visualmente dominante.
  const capW        = Math.max(40, plotW * 0.12);
  const capH        = 16;

  // Nivel freático — mostrar la línea sólo si cae dentro del rango visible:
  // entre la cabeza y 20 m por debajo del apoyo. waterTableDepth menor que
  // topDepth = NF sobre la cabeza (no se dibuja, todo el pilote sumergido).
  const showWater = inp.waterTableDepth > inp.topDepth && inp.waterTableDepth < inp.toeDepth + 20;
  const yWater    = showWater ? yOfDepth(inp.waterTableDepth) : null;

  // Etiquetas de profundidad: cabeza, NF (si aplica), apoyo. Convención v4:
  // se muestran como profundidades positivas con signo "z=" para no inducir
  // a leerlas como cotas topográficas. La NF se marca como `kind: 'water'`
  // para que su tick se renderice desplazado y no se pise con el triángulo
  // azul indicador del nivel freático (apex en M.left-6).
  const tickDepths: { z: number; label: string; kind?: 'water' }[] = [];
  tickDepths.push({ z: zHead, label: `z=${fmt1(inp.topDepth)} m` });
  if (showWater) tickDepths.push({ z: inp.waterTableDepth, label: `NF z=${fmt1(inp.waterTableDepth)} m`, kind: 'water' });
  tickDepths.push({ z: zToe, label: `z=${fmt1(inp.toeDepth)} m` });

  return (
    <g>
      {/* Eje y de cotas */}
      <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + plotH} stroke={p.axis} strokeWidth={0.7} />

      {/* Estratos como bandas con texturas.
          Color por POSICIÓN (rotación en p.strataBands), textura por TIPO
          (puntos=granular, líneas=cohesivo). Así dos estratos consecutivos
          del mismo tipo no se confunden visualmente — el problema previo. */}
      {layerBands.map((b, i) => {
        const y0 = yOfDepth(b.z0);
        const y1 = yOfDepth(b.z1);
        const isGran = b.layer.type === 'granular';
        const band = p.strataBands[i % p.strataBands.length];
        const fill1 = band.fill1;
        const fill2 = band.fill2;
        const texColor = isGran ? p.granularDot : p.cohesiveLine;
        return (
          <g key={b.layer.id}>
            <defs>
              <linearGradient id={`strata-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={fill1} />
                <stop offset="100%" stopColor={fill2} />
              </linearGradient>
              <pattern id={`tex-${i}`} patternUnits="userSpaceOnUse" width={isGran ? 8 : 12} height={isGran ? 8 : 12} patternTransform="rotate(0)">
                {isGran ? (
                  <>
                    <circle cx="2" cy="2" r="0.7" fill={texColor} opacity="0.55" />
                    <circle cx="6" cy="5" r="0.6" fill={texColor} opacity="0.45" />
                    <circle cx="4" cy="7" r="0.5" fill={texColor} opacity="0.35" />
                  </>
                ) : (
                  <>
                    <line x1="0" y1="3"  x2="12" y2="3"  stroke={texColor} strokeWidth="0.5" opacity="0.55" />
                    <line x1="0" y1="8"  x2="12" y2="8"  stroke={texColor} strokeWidth="0.4" opacity="0.40" />
                  </>
                )}
              </pattern>
            </defs>
            <rect x={M.left} y={y0} width={plotW} height={y1 - y0} fill={`url(#strata-${i})`} />
            <rect x={M.left} y={y0} width={plotW} height={y1 - y0} fill={`url(#tex-${i})`} />
            {/* Línea de transición — más contraste que antes para que la
                frontera entre dos bandas adyacentes se vea sin esfuerzo. */}
            <line x1={M.left} y1={y0} x2={M.left + plotW} y2={y0} stroke="#f8fafc" strokeWidth={0.6} opacity={0.35} />

            {/* Tag de propiedades a la derecha — borde del color de la banda
                para anclar visualmente "qué estrato es este tag". */}
            <g transform={`translate(${M.left + plotW + 6}, ${(y0 + y1) / 2 - 24})`}>
              <rect x={0} y={0} width={120} height={48} rx={3} fill={p.bgPanel} stroke={fill1} strokeWidth={1.2} opacity={0.98} />
              {/* Swatch chip a la izquierda del título: doble pista visual
                  (color de banda + textura del tipo). */}
              <rect x={6} y={3.5} width={8} height={8} fill={fill1} stroke={texColor} strokeWidth={0.6} />
              <text x={18} y={10.5} fontSize={8.5} fontFamily="ui-monospace, monospace" fill={p.text} fontWeight={600}>
                E{b.layer.id} · {isGran ? 'Granular' : 'Cohesivo'}
              </text>
              <text x={6} y={21} fontSize={8} fontFamily="ui-monospace, monospace" fill={p.textDim}>
                γ={fmt1(b.layer.gamma)}  φ={fmt1(b.layer.phi)}°
              </text>
              <text x={6} y={31} fontSize={8} fontFamily="ui-monospace, monospace" fill={p.textDim}>
                c′={fmt1(b.layer.c)} kPa
              </text>
              <text x={6} y={41} fontSize={8} fontFamily="ui-monospace, monospace" fill={p.textDim}>
                NSPT={b.layer.Nspt}  rfℓ={fmt2(b.layer.rflim)} MPa
              </text>
            </g>
          </g>
        );
      })}

      {/* Nivel freático */}
      {yWater !== null && (
        <g>
          <line x1={M.left - 6} y1={yWater} x2={M.left + plotW} y2={yWater} stroke={p.water} strokeWidth={1} strokeDasharray="3 2" />
          <polygon points={`${M.left - 6},${yWater} ${M.left - 12},${yWater - 5} ${M.left},${yWater - 5}`} fill={p.water} opacity={0.85} />
        </g>
      )}

      {/* Encepado (rectángulo más ancho sobre la cabeza) */}
      <rect
        x={pileXCenter - capW / 2}
        y={pileYTop - capH}
        width={capW}
        height={capH}
        fill={p.cap}
        stroke={p.steelEdge}
        strokeWidth={0.5}
      />

      {/* Micropilote */}
      <rect
        x={pileXL}
        y={pileYTop}
        width={pileW}
        height={pileYBot - pileYTop}
        fill={p.steel}
        stroke={p.steelEdge}
        strokeWidth={0.6}
      />

      {/* Cota apoyo punteada */}
      <line x1={M.left} y1={pileYBot} x2={M.left + plotW} y2={pileYBot} stroke={p.loadLine} strokeWidth={0.5} strokeDasharray="2 2" opacity={0.65} />

      {/* Ticks de cota — NF se baja unas líneas para no chocar con el
          triángulo del nivel freático (apex en (M.left-6, yWater)). */}
      {tickDepths.map((t, idx) => {
        const y = yOfDepth(t.z);
        const isWater = t.kind === 'water';
        const textY = isWater ? y + 14 : y + 3;
        const textColor = isWater ? p.water : p.textDim;
        return (
          <g key={`tick-${idx}`}>
            <line x1={M.left - 4} y1={y} x2={M.left} y2={y} stroke={p.axis} strokeWidth={0.5} />
            <text x={M.left - 6} y={textY} fontSize={9} textAnchor="end" fill={textColor} fontFamily="ui-monospace, monospace">
              {t.label}
            </text>
          </g>
        );
      })}

      {/* Título global */}
      <text x={M.left} y={M.top - 10} fontSize={10.5} fill={p.text} fontFamily="ui-monospace, monospace">
        Micropilote Ø{inp.drillDiameter.toFixed(0)} mm · L = {fmt2(zToe - zHead)} m bajo encepado
      </text>
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// View 2: gráfica Rfc acumulada vs profundidad
// ────────────────────────────────────────────────────────────────────────────

function RfcCurveView({
  inp, result, p, width, height,
}: { inp: MicropilesInputs; result: MicropilesResult; p: Palette; width: number; height: number }) {
  // Margen izquierdo ampliado 56→68 para que el label vertical "z (m)"
  // entre dentro del SVG sin recortarse contra el borde del canvas.
  const M = { top: 30, right: 30, bottom: 30, left: 68 };
  const plotW = Math.max(60, width  - M.left - M.right);
  const plotH = Math.max(80, height - M.top  - M.bottom);

  const segs = result.segments;
  if (segs.length === 0) {
    return <text x={width / 2} y={height / 2} textAnchor="middle" fill={p.textDim} fontSize={10}>Sin datos</text>;
  }

  const RfcMax = Math.max(
    result.RfcTheoretical,
    result.RfcEmpirical,
    inp.designLoad * 1.4,
    1,
  );
  const zMax = Math.max(...segs.map((s) => s.zAbs), 1);

  const xOfR = (R: number) => M.left + (R / RfcMax) * plotW;
  const yOfZ = (z: number) => M.top  + (z / zMax)   * plotH;

  // Ejes con rejilla
  const xTicks = 5;
  const yTicks = 5;
  const xGrid = Array.from({ length: xTicks + 1 }, (_, i) => (i / xTicks) * RfcMax);
  const yGrid = Array.from({ length: yTicks + 1 }, (_, i) => (i / yTicks) * zMax);

  // Curvas (path d)
  const theoPath = segs.map((s, i) => `${i === 0 ? 'M' : 'L'}${xOfR(s.RfcTheoreticalAcc).toFixed(1)},${yOfZ(s.zAbs).toFixed(1)}`).join(' ');
  const empPath  = segs.map((s, i) => `${i === 0 ? 'M' : 'L'}${xOfR(s.RfcEmpiricalAcc).toFixed(1)},${yOfZ(s.zAbs).toFixed(1)}`).join(' ');

  // Nc,d línea vertical
  const xLoad = xOfR(inp.designLoad);

  // Profundidad mínima a la que cada curva alcanza Nc,d
  const findCrossing = (key: 'RfcTheoreticalAcc' | 'RfcEmpiricalAcc'): number | null => {
    for (const s of segs) {
      if (s[key] >= inp.designLoad) return s.zAbs;
    }
    return null;
  };
  const zMinTheo = findCrossing('RfcTheoreticalAcc');
  const zMinEmp  = findCrossing('RfcEmpiricalAcc');

  return (
    <g>
      {/* Marco */}
      <rect x={M.left} y={M.top} width={plotW} height={plotH} fill="none" stroke={p.axis} strokeWidth={0.6} />

      {/* Rejilla */}
      {xGrid.map((R) => (
        <line key={`gx-${R}`} x1={xOfR(R)} y1={M.top} x2={xOfR(R)} y2={M.top + plotH} stroke={p.axis} strokeWidth={0.3} opacity={0.4} />
      ))}
      {yGrid.map((z) => (
        <line key={`gy-${z}`} x1={M.left} y1={yOfZ(z)} x2={M.left + plotW} y2={yOfZ(z)} stroke={p.axis} strokeWidth={0.3} opacity={0.4} />
      ))}

      {/* Labels eje X */}
      {xGrid.map((R) => (
        <text key={`tx-${R}`} x={xOfR(R)} y={M.top + plotH + 13} textAnchor="middle" fontSize={8.5} fill={p.textDim} fontFamily="ui-monospace, monospace">
          {Math.round(R)}
        </text>
      ))}
      <text x={M.left + plotW / 2} y={height - 4} textAnchor="middle" fontSize={9} fill={p.text} fontFamily="ui-monospace, monospace">Rfc acumulada (kN)</text>

      {/* Labels eje Y */}
      {yGrid.map((z) => (
        <text key={`ty-${z}`} x={M.left - 5} y={yOfZ(z) + 3} textAnchor="end" fontSize={8.5} fill={p.textDim} fontFamily="ui-monospace, monospace">
          {z.toFixed(1)}
        </text>
      ))}
      <text x={18} y={M.top + plotH / 2} transform={`rotate(-90, 18, ${M.top + plotH / 2})`} textAnchor="middle" fontSize={9} fill={p.text} fontFamily="ui-monospace, monospace">z (m)</text>

      {/* Curva teórica */}
      <path d={theoPath} fill="none" stroke={p.curveTheo} strokeWidth={1.5} />
      {/* Curva empírica */}
      <path d={empPath} fill="none" stroke={p.curveEmp} strokeWidth={1.2} strokeDasharray="4 2" />

      {/* Nc,d vertical */}
      <line x1={xLoad} y1={M.top} x2={xLoad} y2={M.top + plotH} stroke={p.loadLine} strokeWidth={1} strokeDasharray="3 2" />
      <text x={xLoad + 4} y={M.top + 10} fontSize={9} fill={p.loadLine} fontFamily="ui-monospace, monospace">
        Nc,d = {inp.designLoad} kN
      </text>

      {/* Markers de cruce */}
      {zMinTheo !== null && (
        <g>
          <circle cx={xLoad} cy={yOfZ(zMinTheo)} r={3} fill={p.curveTheo} />
          <text x={xLoad + 6} y={yOfZ(zMinTheo) - 4} fontSize={8} fill={p.curveTheo} fontFamily="ui-monospace, monospace">
            zmin = {zMinTheo.toFixed(1)} m
          </text>
        </g>
      )}
      {zMinEmp !== null && zMinEmp !== zMinTheo && (
        <g>
          <circle cx={xLoad} cy={yOfZ(zMinEmp)} r={2.5} fill={p.curveEmp} />
        </g>
      )}

      {/* Leyenda */}
      <g transform={`translate(${M.left + plotW - 110}, ${M.top + 6})`}>
        <rect x={0} y={-4} width={108} height={32} rx={2} fill={p.bgPanel} stroke={p.border} strokeWidth={0.5} opacity={0.95} />
        <line x1={6} y1={4} x2={22} y2={4} stroke={p.curveTheo} strokeWidth={1.5} />
        <text x={26} y={7} fontSize={8} fill={p.text} fontFamily="ui-monospace, monospace">Teórico</text>
        <line x1={6} y1={15} x2={22} y2={15} stroke={p.curveEmp} strokeWidth={1.2} strokeDasharray="3 2" />
        <text x={26} y={18} fontSize={8} fill={p.text} fontFamily="ui-monospace, monospace">Empírico</text>
      </g>
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// View 3: sección del tope (planta circular concéntrica)
// ────────────────────────────────────────────────────────────────────────────

function TopSectionView({
  inp, result, p, width, height,
}: { inp: MicropilesInputs; result: MicropilesResult; p: Palette; width: number; height: number }) {
  // Centro del círculo desplazado para dejar hueco a las cotas (Ø perforación,
  // Ø bulbo) que se dibujan a la IZQUIERDA del círculo — así no chocan con el
  // panel-tabla que ocupa la mitad derecha del SVG.
  const cx = width * 0.36;
  const cy = height / 2;
  // Limitar Rmax al hueco disponible a la izquierda menos la anchura
  // estimada de los labels (~72px "Ø999,9 perf." + leader 36px + holgura).
  const leftRoom  = cx - 116;
  const Rmax  = Math.min(width * 0.28, height * 0.42, Math.max(60, leftRoom));
  const dDn   = inp.drillDiameter;  // mm — perforación real (input)

  // Geometría del tubo: derivada de inputs (catálogo o custom). NO usamos
  // result.de/di/dTotal porque result devuelve 0 cuando el motor invalida
  // (p.ej. tubo > perforación, sección clase 4...) — la sección quedaba en
  // blanco y el usuario no veía qué tubo había puesto. Renderizando desde
  // inputs el dibujo siempre refleja lo que el usuario configuró.
  const tubeGeom = resolveTubeGeometry(inp);

  // Si el tubo no se puede resolver (custom con valores incoherentes),
  // dibujamos solo el barreno con un mensaje. Sigue siendo informativo
  // y no se rompe en cero como antes.
  if (!tubeGeom) {
    const Rdraw = Math.min(width * 0.28, height * 0.42);
    return (
      <g>
        <circle cx={cx} cy={cy} r={Rdraw} fill={p.concrete} opacity={0.6} />
        <circle cx={cx} cy={cy} r={Rdraw} fill="none" stroke={p.steelEdge} strokeWidth={0.6} strokeDasharray="3 2" />
        <line x1={cx - Rdraw} y1={cy} x2={cx - Rdraw - 36} y2={cy} stroke={p.text} strokeWidth={0.4} />
        <text x={cx - Rdraw - 38} y={cy + 3} fontSize={9} textAnchor="end" fill={p.text} fontFamily="ui-monospace, monospace">Ø{fmt1(dDn)} perf.</text>
        <text x={cx} y={cy - 4} fontSize={10} textAnchor="middle" fill={p.fail} fontFamily="ui-monospace, monospace">Tubo no válido</text>
        <text x={cx} y={cy + 10} fontSize={8} textAnchor="middle" fill={p.textDim} fontFamily="ui-monospace, monospace">revisa Ø ext y espesor</text>
      </g>
    );
  }

  const dExt  = tubeGeom.de;                                  // mm
  const dInt  = tubeGeom.di;                                  // mm
  const dBulb = dExt + 2 * inp.structuralCover;               // mm — geometría directa
  const scale = Rmax / (dDn / 2);

  const rDn   = (dDn   / 2) * scale;
  const rBulb = (dBulb / 2) * scale;
  const rExt  = (dExt  / 2) * scale;
  const rInt  = (dInt  / 2) * scale;
  // Recubrimiento real disponible: (Dn − de) / 2. El mínimo normativo
  // depende del inyectado y del esfuerzo (Guía Fomento Tabla 2.3): lechada
  // compresión 20 mm, lechada tracción 25, mortero compresión 30, mortero
  // tracción 35. Si está por debajo, el SVG marca el barreno en rojo.
  const minCoverRequired = getMinStructuralCover(inp.groutType, inp.effort);
  const geomCover = (dDn - dExt) / 2;
  const coverShort = geomCover < minCoverRequired;

  return (
    <g>
      {/* Perforación exterior con textura de árido (Dn) */}
      <defs>
        <pattern id="agreg" patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="1.5" cy="2" r="0.7" fill={p.steelEdge} opacity="0.45" />
          <circle cx="4.5" cy="4" r="0.5" fill={p.steelEdge} opacity="0.3" />
        </pattern>
      </defs>
      <circle cx={cx} cy={cy} r={rDn}   fill={p.concrete} />
      <circle cx={cx} cy={cy} r={rDn}   fill="url(#agreg)" />
      {/* Cuando el recubrimiento (Dn-de)/2 < 25 mm, marcamos el borde del
          barreno en rojo para señalar el defecto sin necesidad de leer el
          mensaje de error del panel de resultados. */}
      <circle cx={cx} cy={cy} r={rDn}   fill="none" stroke={coverShort ? p.fail : p.steelEdge} strokeWidth={coverShort ? 1.2 : 0.6} />
      {/* Bulbo estructural (dTotal) — anillo discreto sólo si difiere de Dn */}
      {rBulb < rDn - 0.5 && (
        <circle cx={cx} cy={cy} r={rBulb} fill="none" stroke={p.text} strokeWidth={0.4} strokeDasharray="2 2" opacity={0.6} />
      )}
      {/* Acero tubular (anillo) */}
      <circle cx={cx} cy={cy} r={rExt} fill={p.steel} stroke={p.steelEdge} strokeWidth={0.7} />
      <circle cx={cx} cy={cy} r={rInt} fill={p.bgPanel} stroke={p.steelEdge} strokeWidth={0.5} />

      {/* Cotas radiales — Ø perforación y Ø bulbo a la IZQUIERDA, evitando
          la tabla. Tubo y hueco interior arriba/abajo, donde no chocan. */}
      <line x1={cx - rDn} y1={cy} x2={cx - rDn - 36} y2={cy} stroke={p.text} strokeWidth={0.4} />
      <text x={cx - rDn - 38} y={cy + 3} fontSize={9} textAnchor="end" fill={p.text} fontFamily="ui-monospace, monospace">Ø{fmt1(dDn)} perf.</text>

      {rBulb < rDn - 0.5 && (
        <>
          <line x1={cx - rBulb} y1={cy + 12} x2={cx - rBulb - 22} y2={cy + 12} stroke={p.textDim} strokeWidth={0.4} strokeDasharray="2 2" />
          <text x={cx - rBulb - 24} y={cy + 15} fontSize={8.5} textAnchor="end" fill={p.textDim} fontFamily="ui-monospace, monospace">Ø{fmt1(dBulb)} bulbo</text>
        </>
      )}

      <line x1={cx} y1={cy - rExt} x2={cx} y2={cy - Rmax - 8} stroke={p.text} strokeWidth={0.4} />
      <text x={cx + 4} y={cy - Rmax - 10} fontSize={9} fill={p.text} fontFamily="ui-monospace, monospace">Ø{fmt1(dExt)} tubo</text>

      <line x1={cx} y1={cy + rInt} x2={cx} y2={cy + Rmax * 0.8} stroke={p.text} strokeWidth={0.4} strokeDasharray="2 2" />
      <text x={cx + 4} y={cy + Rmax * 0.8 + 10} fontSize={9} fill={p.text} fontFamily="ui-monospace, monospace">Ø{fmt1(dInt)} int.</text>

      {/* Tabla a la derecha. La fila `rec.` (recubrimiento geométrico)
          se pinta en rojo cuando es < 25 mm — feedback inmediato para que
          el usuario sepa por qué el motor invalida si elige un tubo grande
          para un Dn pequeño. */}
      <g transform={`translate(${width * 0.65}, ${cy - 99})`}>
        <rect x={-6} y={-12} width={Math.max(150, width * 0.32)} height={206} rx={3} fill={p.bgPanel} stroke={p.border} strokeWidth={0.5} />
        <text x={0} y={2} fontSize={9.5} fill={p.text} fontFamily="ui-monospace, monospace" fontWeight={600}>Sección del tope</text>
        {([
          ['Hormigón',  `HA-${inp.concreteGrade} (fck = ${inp.concreteGrade} N/mm²)`, false],
          ['Acero',     `fy = ${inp.steelGrade} N/mm²`, false],
          ['rec.',      `${fmt2(geomCover)} / ${minCoverRequired} mm mín.`, coverShort],
          ['As,y',      `${fmt2(result.As_y)} mm²`, false],
          ['As,d',      `${fmt2(result.As_d)} mm²`, false],
          ['re',        `${fmt2(result.re)} mm`, false],
          ['Fc,h',      `${fmt2(result.Fc_h)} kN`, false],
          ['Fa,h',      `${fmt2(result.Fa_h)} kN`, false],
          ['R',         `${fmt2(result.R)}`, false],
          ['Fe',        `${fmt2(result.Fe)}`, false],
        ] as Array<[string, string, boolean]>).map(([k, v, isFail], i) => (
          <g key={k} transform={`translate(0, ${18 + i * 18})`}>
            <text x={0}    y={0} fontSize={8.5} fill={isFail ? p.fail : p.textDim} fontFamily="ui-monospace, monospace">{k}</text>
            <text x={Math.max(150, width * 0.32) - 12} y={0} textAnchor="end" fontSize={8.5} fill={isFail ? p.fail : p.text} fontFamily="ui-monospace, monospace">{v}</text>
          </g>
        ))}
      </g>
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// View 4: semáforos (grid de tarjetas)
// ────────────────────────────────────────────────────────────────────────────

function SemaphoresView({
  result, p, width, height,
}: { result: MicropilesResult; p: Palette; width: number; height: number }) {
  const cards = [
    { id: 'ih', title: 'ih — Hundimiento por fuste', util: result.ih,
      article: 'Guía Fomento cap. 3.4' },
    { id: 'ic', title: 'ic — Tope compresión',        util: result.ic,
      article: 'Guía Fomento eq. 3.5' },
    { id: 'im', title: 'im — Flexión',                util: result.im,
      article: 'EC3 §6.2.5' },
    { id: 'iv', title: 'iv — Cortante',               util: result.iv,
      article: 'EC3 §6.2.6' },
    { id: 'set', title: 'Asiento granular',
      util: result.settlementGranular / 25,
      override: `${result.settlementGranular.toFixed(1)} mm / 25 mm`,
      article: 'Criterio CTE DB-SE-C' },
    { id: 'eg', title: 'Garganta soldadura',          util: result.eg >= result.eg_min ? 0.5 : 1.2,
      override: `${result.eg} mm ≥ ${result.eg_min} mm`,
      article: 'Guía Fomento Tabla A-5.1' },
  ];

  const cols = 3;
  const rows = Math.ceil(cards.length / cols);
  const pad  = 10;
  const cellW = (width  - pad * (cols + 1)) / cols;
  // Antes la altura de cada celda se calculaba para llenar todo el canvas,
  // dando cards de ~245px con el contenido (titulo + valor + barra + nota)
  // ocupando solo ~100px y dejando huecos vacíos enormes. Se acota la
  // altura a 132px y se centra el grid verticalmente.
  const naturalCellH = (height - pad * (rows + 1)) / rows;
  const cellH = Math.min(132, naturalCellH);
  const gridH = pad + rows * (cellH + pad);
  const yOffset = Math.max(0, (height - gridH) / 2);

  return (
    <g>
      {cards.map((card, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = pad + c * (cellW + pad);
        const y = yOffset + pad + r * (cellH + pad);
        const util = Math.min(1, Math.max(0, card.util));
        // util ≤ 0 (p.ej., im=iv=0 sin empujes aplicados) cuenta como "CUMPLE"
        // — coherente con la tira de utilizaciones del header (UtilStat).
        const stateColor =
          card.util >= 1.0 ? p.fail :
          card.util >= 0.8 ? p.warn :
                             p.ok;
        const valueText = card.override ?? util.toFixed(2);
        return (
          <g key={card.id} transform={`translate(${x}, ${y})`}>
            <defs>
              <linearGradient id={`amb-${card.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor={stateColor} stopOpacity="0.18" />
                <stop offset="80%" stopColor={stateColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={cellW} height={cellH} rx={5} fill={p.bgPanel} stroke={p.border} strokeWidth={0.6} />
            <rect x={0} y={0} width={cellW} height={cellH} rx={5} fill={`url(#amb-${card.id})`} />
            <line x1={0} y1={0} x2={cellW} y2={0} stroke={stateColor} strokeWidth={2} />

            {/* Posiciones absolutas para que el contenido se vea compacto
                en cualquier cellH dentro del rango razonable (110-140). */}
            <text x={12} y={20}  fontSize={10.5} fill={p.text} fontFamily="ui-monospace, monospace" fontWeight={600}>{card.title}</text>
            <text x={12} y={62}  fontSize={20}   fill={stateColor} fontFamily="ui-monospace, monospace" fontWeight={700}>{valueText}</text>

            {/* Barra de utilización */}
            <rect x={12} y={78} width={cellW - 24} height={5} rx={2} fill={p.border} opacity={0.5} />
            <rect x={12} y={78} width={(cellW - 24) * util} height={5} rx={2} fill={stateColor} />

            <text x={12} y={cellH - 12} fontSize={8.5} fill={p.textDim} fontFamily="ui-monospace, monospace">{card.article}</text>
          </g>
        );
      })}
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────────────────────

export function MicropilesSVG({
  inp, soil, result, view,
  width = 560, height = 480,
  mode = 'screen',
}: MicropilesSVGProps) {
  const p = mode === 'pdf' ? PDF : SCREEN;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', background: p.bg }}>
      {view === 'profile'    && <PerfilView      inp={inp} soil={soil} p={p} width={width} height={height} />}
      {view === 'rfcCurve'   && <RfcCurveView    inp={inp} result={result} p={p} width={width} height={height} />}
      {view === 'topSection' && <TopSectionView  inp={inp} result={result} p={p} width={width} height={height} />}
      {view === 'semaphores' && <SemaphoresView  result={result} p={p} width={width} height={height} />}
    </svg>
  );
}
