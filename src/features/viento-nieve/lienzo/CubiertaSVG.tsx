/**
 * Vista Cubierta: las zonas de la tabla D.6 pintadas en la planta del
 * edificio para la dirección de viento elegida.
 *
 * Cada zona lleva su letra, su tamaño y la presión o succión que resulta; el
 * color va con el signo (naranja empuja, acento levanta) y la opacidad con la
 * intensidad. Debajo, la sección del hastial con la pendiente y la
 * coronación, y de dónde sale el ce. Las piezas las coloca `geometria.ts` a
 * partir de lo que mide el motor.
 */

import type { CubiertaResuelta } from '../../../lib/acciones/viento';
import type { VientoUI } from '../state';
import { escalaQueCabe, zonasCubiertaEnPlanta, type RectZonaCubierta } from './geometria';
import { Marcadores } from '../../../components/canvas/Marcadores';
import { COLOR, dec, mezcla, rellenoZona } from './paleta';
import { Cabecera, CotaH, CotaV, Flecha, Rotulo } from './primitivas';
import { useFormato } from './useFormato';
import { useMarcadores } from '../../../components/canvas/useMarcadores';
import { useMedida } from '../../../components/canvas/useMedida';

interface Props {
  viento: VientoUI;
  cubierta: CubiertaResuelta | null;
  direccion: 'x' | 'y';
  forceWidth?: number;
  forceHeight?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function CubiertaSVG({ viento, cubierta, direccion, forceWidth, forceHeight }: Props) {
  const { ref, width, height } = useMedida(forceWidth, forceHeight);
  const m = useMarcadores();
  const f = useFormato();
  const dims = viento.dimensiones;
  const D = direccion.toUpperCase();
  const estrecho = width < 600;

  // Sin cubierta resuelta: la planta desnuda y por qué.
  if (!cubierta) {
    const s = clamp(escalaQueCabe(dims.x, dims.y, width - 120, height - 160), 2, 30);
    const ox = (width - dims.x * s) / 2;
    const oy = 70;
    return (
      <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 320 }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Planta de la cubierta sin zonas" style={{ display: 'block' }}>
          <title>Cubierta plana u omitida</title>
          <Rotulo x={0} y={14} tam={11} mono color={COLOR.secundario}>
            CUBIERTA · tabla D.6
          </Rotulo>
          <rect x={ox} y={oy} width={dims.x * s} height={dims.y * s} fill={COLOR.fondo} stroke={COLOR.seccion} strokeWidth={1.5} />
          <Rotulo x={ox + (dims.x * s) / 2} y={oy + (dims.y * s) / 2 - 4} tam={11} color={COLOR.atenuado} ancla="middle">
            {viento.cubierta.activa ? 'sin resultado: falta la provincia' : 'cubierta plana u omitida'}
          </Rotulo>
          <Rotulo x={ox + (dims.x * s) / 2} y={oy + (dims.y * s) / 2 + 12} tam={10.5} color={COLOR.atenuado} ancla="middle">
            {viento.cubierta.activa ? 'la norma pondrá las zonas F…J en cuanto haya zona eólica' : 'incluya la cubierta a dos aguas en Datos para ver las zonas F…J'}
          </Rotulo>
          <CotaH x1={ox} x2={ox + dims.x * s} y={oy + dims.y * s + 24} texto={`${dec(dims.x, 2)} m · lado X`} />
        </svg>
      </div>
    );
  }

  const cumbrera = cubierta.cumbrera;
  const d = (cumbrera === 'x') === (direccion === 'y') ? cubierta.perpendicular : cubierta.paralela;
  const planta = zonasCubiertaEnPlanta(d, cumbrera, dims);
  const maximo = d.zonas.reduce((a, z) => Math.max(a, Math.abs(z.succion ?? 0), Math.abs(z.presion ?? 0)), 0);

  // ── Sitio: planta arriba, sección y texto abajo ─────────────────────────
  const altoSeccion = estrecho ? 0 : 200;
  const margenIzq = 100;
  const margenDer = 70;
  const arriba = 76;
  const s = clamp(escalaQueCabe(dims.x, dims.y, width - margenIzq - margenDer, height - arriba - altoSeccion - 70), 2, 40);
  const pw = dims.x * s;
  const ph = dims.y * s;
  const ox = margenIzq + (width - margenIzq - margenDer - pw) / 2;
  const oy = arriba;
  const px = (v: number) => ox + v * s;
  const py = (v: number) => oy + v * s;

  const rotulosZona = (r: RectZonaCubierta) => {
    const w = r.w * s;
    const h = r.h * s;
    const z = r.zona;
    const cx = px(r.x) + w / 2;
    const cy = py(r.y) + h / 2;
    const dos = z.presion !== null && z.presion > 0 && z.succion !== null && z.succion < 0;
    const valor =
      z.presion !== null && z.presion > 0
        ? `+${f.presion(z.presion)}${dos ? ` / ${f.presion(z.succion!)}` : ''}`
        : z.succion !== null
          ? f.presion(z.succion)
          : '—';
    const lineas = h >= 44 && w >= 150 ? 3 : h >= 26 && w >= 60 ? 2 : 1;
    return (
      <g key={`${z.zona}-${r.x}-${r.y}`}>
        <Rotulo x={cx} y={cy + (lineas === 1 ? 5 : lineas === 2 ? -1 : -6)} tam={lineas === 1 ? 12 : 15} color={COLOR.rotulo} peso={600} ancla="middle">
          {z.zona}
        </Rotulo>
        {lineas >= 2 && (
          <Rotulo x={cx} y={cy + (lineas === 2 ? 12 : 8)} tam={10} mono color={COLOR.rotulo} ancla="middle">
            {valor}
            {w >= 150 ? ` ${f.uQ}` : ''}
          </Rotulo>
        )}
        {lineas >= 3 && (
          <Rotulo x={cx} y={cy + 21} tam={9.5} mono color={COLOR.secundario} ancla="middle">
            {dec(r.w, 1)} × {dec(r.h, 1)} m · {dec(z.area, 0)} m²{z.piezas > 1 ? ` · ×${z.piezas}` : ''}
          </Rotulo>
        )}
      </g>
    );
  };

  // Cotas de la banda e/10 y de los lados.
  const bandaF = d.zonas.find((z) => z.zona === 'F')?.fondo ?? 0;
  const vientoY = planta.viento === 'y';

  // Sección del hastial: la cubierta vista desde la dirección de la cumbrera.
  const anchoHastial = cumbrera === 'x' ? dims.y : dims.x;
  const H = cubierta.alturaCoronacion - (anchoHastial / 2) * Math.tan((Math.max(cubierta.pendiente, 0) * Math.PI) / 180);
  const subida = Math.max(0, cubierta.alturaCoronacion - H);
  const ySec = oy + ph + 70;
  const sSec = clamp(escalaQueCabe(anchoHastial, Math.max(subida, 1), Math.min(220, width * 0.4), altoSeccion - 90), 2, 24);
  const xSec = 40;
  const baseSec = ySec + 40 + subida * sSec;
  const apexSec = xSec + (anchoHastial * sSec) / 2;
  const xTexto = xSec + anchoHastial * sSec + 90;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Zonas de la cubierta a dos aguas con viento según ${D}`} style={{ display: 'block' }}>
        <title>Cubierta a dos aguas: zonas de la tabla D.6 con viento según {D}</title>
        <Marcadores id={m.id} />
        <Rotulo x={0} y={14} tam={11} mono color={COLOR.secundario}>
          CUBIERTA A DOS AGUAS · tabla D.6 · θ = {d.theta}º: viento según {D}, {d.direccion === 'perpendicular' ? 'perpendicular' : 'paralelo'} a la cumbrera
        </Rotulo>

        {/* Viento entrante */}
        {vientoY ? (
          <>
            <Rotulo x={ox} y={oy - 42} tam={10} mono color={COLOR.accent}>
              viento según Y
            </Rotulo>
            {[0.2, 0.5, 0.8].map((k) => (
              <Flecha key={k} x1={px(dims.x * k)} y1={oy - 34} x2={px(dims.x * k)} y2={oy - 6} punta={m.punta('accent')} color={COLOR.accent} />
            ))}
          </>
        ) : (
          <>
            <Rotulo x={ox - 6} y={oy - 10} tam={10} mono color={COLOR.accent} ancla="end">
              viento según X
            </Rotulo>
            {[0.2, 0.5, 0.8].map((k) => (
              <Flecha key={k} x1={ox - 40} y1={py(dims.y * k)} x2={ox - 6} y2={py(dims.y * k)} punta={m.punta('accent')} color={COLOR.accent} />
            ))}
          </>
        )}

        {/* Zonas */}
        {planta.rects.map((r) => (
          <rect key={`r-${r.zona.zona}-${r.x}-${r.y}`} x={px(r.x)} y={py(r.y)} width={r.w * s} height={r.h * s} fill={rellenoZona(r.zona.succion, r.zona.presion, maximo)} stroke={COLOR.fondo} strokeWidth={1.5} />
        ))}
        {planta.rects.map(rotulosZona)}
        <rect x={ox} y={oy} width={pw} height={ph} fill="none" stroke={COLOR.seccion} strokeWidth={1.5} />
        <line x1={px(planta.cumbrera.x1)} y1={py(planta.cumbrera.y1)} x2={px(planta.cumbrera.x2)} y2={py(planta.cumbrera.y2)} stroke={COLOR.seccion} strokeWidth={1.5} strokeDasharray="6 4" />
        <Rotulo x={cumbrera === 'x' ? px(dims.x) - 4 : px(dims.x / 2) + 5} y={cumbrera === 'x' ? py(dims.y / 2) - 5 : oy + 12} tam={10} mono color={COLOR.secundario} ancla={cumbrera === 'x' ? 'end' : 'start'}>
          cumbrera
        </Rotulo>

        {/* Cotas */}
        {bandaF > 0 &&
          (vientoY ? (
            <CotaV x={ox - 14} y1={oy} y2={py(bandaF)} texto={`e/10 = ${dec(bandaF, 1)} m`} lado="izquierda" />
          ) : (
            <CotaH x1={ox} x2={px(bandaF)} y={oy - 14} texto={`e/10 = ${dec(bandaF, 1)} m`} />
          ))}
        <CotaH x1={ox} x2={ox + pw} y={oy + ph + 24} texto={`${dec(dims.x, 2)} m · lado X${vientoY ? ` · b = ${dec(d.b, 0)} m` : ` · d = ${dec(d.d, 0)} m`}`} />
        <CotaV x={ox + pw + 22} y1={oy} y2={oy + ph} texto={`${dec(dims.y, 0)} m · Y`} />
        <Rotulo x={ox} y={oy + ph + 44} tam={10} color={COLOR.atenuado}>
          e = min(b, 2h) = {dec(d.e, 1)} m · la banda e/10 y los rincones e/4 se miden desde donde entra el viento
        </Rotulo>

        {/* Sección del hastial */}
        {!estrecho && (
          <>
            <Cabecera x={xSec} y={ySec + 8}>
              Sección · de dónde sale el ce
            </Cabecera>
            <polygon points={`${xSec},${baseSec} ${apexSec},${baseSec - subida * sSec} ${xSec + anchoHastial * sSec},${baseSec}`} fill={mezcla(COLOR.accent, 8)} stroke={COLOR.seccion} strokeWidth={1.5} />
            <line x1={xSec} y1={baseSec} x2={xSec} y2={baseSec + 18} stroke={COLOR.seccion} strokeWidth={1.5} />
            <line x1={xSec + anchoHastial * sSec} y1={baseSec} x2={xSec + anchoHastial * sSec} y2={baseSec + 18} stroke={COLOR.seccion} strokeWidth={1.5} />
            <Rotulo x={xSec + 30} y={baseSec - 6} tam={10} mono color={COLOR.accent}>
              α = {dec(cubierta.pendiente, 0)}º
            </Rotulo>
            <CotaV x={xSec + anchoHastial * sSec + 18} y1={baseSec - subida * sSec} y2={baseSec} texto={`${dec(subida, 2)} m`} />
            <Rotulo x={xSec} y={baseSec + 34} tam={10} mono color={COLOR.secundario}>
              coronación {dec(cubierta.alturaCoronacion, 2)} m · ce {dec(cubierta.ce, 3)} · qb·ce = {f.presion(cubierta.qe)} {f.uQ}
            </Rotulo>

            <Cabecera x={xTexto} y={ySec + 8}>
              {d.resultante ? 'Resultante horizontal de los faldones' : 'Viento a lo largo de la cumbrera'}
            </Cabecera>
            {(d.resultante
              ? [
                  'Σ cpe·A·tan α sobre cada cara entera:',
                  `+${f.fuerza(d.resultante.haciaSotavento)} ${f.uF} hacia sotavento · ${f.fuerza(d.resultante.haciaBarlovento)} ${f.uF} hacia barlovento`,
                  '→ se suma a la planta de cubierta en «Edificio».',
                  '',
                  'Donde la tabla da dos valores la zona puede pasar',
                  'de presión a succión: las dos posibilidades, sin',
                  'mezclarlas en una misma cara (Anejo D.3-2).',
                ]
              : [
                  'Los faldones son simétricos respecto al viento:',
                  'no empujan a lo largo de la cumbrera. La planta',
                  'de cubierta recibe el hastial (vista Edificio).',
                  '',
                  'F y G en los rincones del hastial, H hasta e/2',
                  'e I el resto, todos en succión.',
                ]
            ).map((l, i) => (
              <Rotulo key={i} x={xTexto} y={ySec + 28 + i * 14} tam={10.5} color={COLOR.secundario}>
                {l}
              </Rotulo>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
