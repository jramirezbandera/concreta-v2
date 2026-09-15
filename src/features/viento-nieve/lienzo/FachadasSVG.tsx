/**
 * Vista Fachadas: el desarrollo de las cuatro fachadas con las zonas de la
 * tabla D.3 a su ancho real, para la dirección de viento elegida.
 *
 * D recibe el viento (⊗, hacia el papel), E es la opuesta, y en las laterales
 * A, B y C se miden desde la arista de barlovento. El hastial va a trazos
 * porque las áreas de las zonas laterales van hasta el último forjado. La
 * planta pequeña sitúa e/10 y e. Los segmentos los coloca `geometria.ts`.
 */

import type { ParamentosResueltos } from '../../../lib/acciones/viento';
import type { VientoUI } from '../state';
import { desarrolloFachadas } from './geometria';
import { Marcadores } from '../../../components/canvas/Marcadores';
import { COLOR, dec, mezcla, rellenoZona } from './paleta';
import { anchoCabecera, anchoEstimado, Cabecera, CotaH, CotaV, Flecha, Rotulo, Suelo } from './primitivas';
import { useFormato } from './useFormato';
import { useMarcadores } from '../../../components/canvas/useMarcadores';
import { useMedida } from '../../../components/canvas/useMedida';

interface Props {
  viento: VientoUI;
  paramentos: ParamentosResueltos | null;
  cumbrera: 'x' | 'y' | null;
  direccion: 'x' | 'y';
  forceWidth?: number;
  forceHeight?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const HUECO = 8;

export function FachadasSVG({ viento, paramentos, cumbrera, direccion, forceWidth, forceHeight }: Props) {
  const { ref, width, height } = useMedida(forceWidth, forceHeight);
  const m = useMarcadores();
  const f = useFormato();
  const D = direccion.toUpperCase();
  const dims = viento.dimensiones;

  if (!paramentos) {
    return (
      <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 320 }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fachadas sin zonas" style={{ display: 'block' }}>
          <title>Fachadas por zonas omitidas</title>
          <Rotulo x={0} y={14} tam={11} mono color={COLOR.secundario}>
            FACHADAS · tabla D.3
          </Rotulo>
          <Rotulo x={width / 2} y={height / 2 - 4} tam={11} color={COLOR.atenuado} ancla="middle">
            {viento.paramentos.activos ? 'sin resultado: falta la provincia' : 'fachadas por zonas omitidas'}
          </Rotulo>
          <Rotulo x={width / 2} y={height / 2 + 12} tam={10.5} color={COLOR.atenuado} ancla="middle">
            {viento.paramentos.activos ? 'la norma pondrá las zonas A…E en cuanto haya zona eólica' : 'inclúyalas en Datos para ver las zonas A…E de carpinterías, aplacados y anclajes'}
          </Rotulo>
        </svg>
      </div>
    );
  }

  const d = paramentos[direccion];
  const des = desarrolloFachadas(d, cumbrera);
  const maximo = d.zonas.reduce((a, z) => Math.max(a, Math.abs(z.presion)), 0);
  const hf = paramentos.alturaFachada;
  const subida = Math.max(0, paramentos.h - hf);
  const estrecho = width < 600;

  // ── Sitio: el desarrollo arriba, la planta y el texto abajo ─────────────
  const margen = 20;
  // En estrecho las notas bajo el desarrollo van en dos líneas cada una: la banda inferior crece 28 px.
  const altoBanda = estrecho ? 178 : 230;
  const s = clamp(Math.min((width - 2 * margen - 3 * HUECO) / Math.max(des.total, 1), (height - altoBanda - 150) / Math.max(hf + subida, 1)), 1.5, 30);
  const base = 90 + (hf + subida) * s;
  const x0 = margen + (width - 2 * margen - 3 * HUECO - des.total * s) / 2;
  const xSeg = (x0m: number, i: number) => x0 + x0m * s + i * HUECO;

  // Planta pequeña con las zonas marcadas, reducida hasta caber: a 8 px/m una nave de
  // 60 m serían 480 px, y una torre de 40 m de fondo se saldría por abajo.
  const vientoY = direccion === 'y';
  const bandaA = d.zonas.find((z) => z.zona === 'A')?.ancho ?? 0;
  const cotaA = `A: e/10 = ${dec(bandaA, 1)} m`;
  const plx = 60;
  const ply = base + (estrecho ? 152 : 124);
  // Con el lienzo bajo (móvil apaisado) la planta pequeña no cabe: el desarrollo de arriba ya lo dice todo.
  const conPlanta = height - ply - (vientoY ? 24 : 40) >= 40;
  // Según Y la cota de A va a la derecha de la planta; según X, debajo.
  const anchoLateral = vientoY ? 22 + anchoEstimado(cotaA, 10, true) + 10 : 20;
  const anchoTexto = 330;
  const anchoLibre = width - plx - anchoLateral;
  const altoPlanMax = Math.max(40, height - ply - (vientoY ? 24 : 40));
  const escalaCon = (anchoMax: number) => clamp(Math.min(estrecho ? 5 : 8, anchoMax / Math.max(1, dims.x), altoPlanMax / Math.max(1, dims.y)), 1, 8);
  // Primero con el texto a la derecha: el texto empieza tras la planta y su cota, y nunca antes de que acabe la cabecera «Planta · …».
  // Si ni así cabe, la planta se queda con todo el ancho y el texto no se dibuja.
  const cabeceraPlanta = `Planta · ${d.zonas.some((z) => z.zona === 'C') ? 'A, B y C el resto' : 'sin zona C (e ≥ d)'}`;
  let escalaPlanta = escalaCon(Math.max(1, anchoLibre - anchoTexto - 40));
  const xTexto = Math.max(plx + dims.x * escalaPlanta + anchoLateral + 40, plx - 30 + anchoCabecera(cabeceraPlanta) + 24);
  const conTexto = !estrecho && anchoLibre - anchoTexto - 40 >= 90 && xTexto + anchoTexto <= width + 4;
  if (!conTexto) escalaPlanta = escalaCon(anchoLibre);
  const plw = dims.x * escalaPlanta;
  const plh = dims.y * escalaPlanta;
  // Las letras de la planta pequeña sólo si tienen sitio: en una planta diminuta se pisarían.
  const bandaPx = bandaA * escalaPlanta;
  const sitioA = bandaPx >= 12;
  const sitioB = (vientoY ? plh / 2 : plw / 2) - bandaPx >= 20;
  const sitioDE = (vientoY ? plh : plw) >= 32;
  const pieCaption = `viento según ${D} · ${dec(dims.x, 0)} × ${dec(dims.y, 0)} m`;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Desarrollo de las fachadas con las zonas de la tabla D.3, viento según ${D}`} style={{ display: 'block' }}>
        <title>Fachadas por zonas con viento según {D}</title>
        <Marcadores id={m.id} />
        <Rotulo x={0} y={14} tam={11} mono color={COLOR.secundario}>
          FACHADAS · tabla D.3 · viento según {D}: d = {dec(d.d, 0)} m, b = {dec(d.b, 0)} m, e = {dec(d.e, 1)} m, h/d = {dec(d.esbeltez, 2)}
        </Rotulo>
        <Cabecera x={x0} y={48}>
          {estrecho ? `Fachadas · altura ${dec(hf, 2)} m` : `Desarrollo de las cuatro fachadas · altura de fachada ${dec(hf, 2)} m hasta el último forjado`}
        </Cabecera>

        {des.segmentos.map((seg, i) => {
          const xs = xSeg(seg.x0, i);
          const ws = seg.ancho * s;
          // El rótulo del segmento: largo, corto («D 15 m · hastial»), la letra o «lat.», el primero que quepa centrado
          // sin pisar al vecino ni salirse del lienzo. Cada rótulo puede asomar 3 px por cada lado de su segmento (el
          // hueco entre segmentos es de 8). Los de los hastiales van una fila más arriba si la subida se nota (≥ 14 px):
          // entonces sólo se pisarían entre sí y cada uno tiene de holgura la mitad del segmento de en medio.
          const filaAparte = seg.hastial && subida * s >= 14;
          const enMedio = seg.nombre === 'D' || seg.nombre === 'E' ? d.d : d.b;
          const holgura = filaAparte ? HUECO + (enMedio * s) / 2 : 3;
          const esDE = seg.nombre === 'D' || seg.nombre === 'E';
          const candidatos = [`${seg.rotulo} (${dec(seg.ancho, 0)} m)${seg.hastial ? ' · hastial' : ''}`, `${esDE ? seg.nombre : 'lat.'} ${dec(seg.ancho, 0)} m${seg.hastial ? ' · hastial' : ''}`, ...(esDE ? [seg.nombre] : ['lateral', 'lat.'])];
          const colocar = (texto: string) => {
            const mitad = anchoEstimado(texto, 11, false, 600) / 2;
            const x = clamp(xs + ws / 2, mitad + 2, width - mitad - 2);
            return { texto, x, cabe: x - mitad >= xs - holgura && x + mitad <= xs + ws + holgura };
          };
          const rotuloSeg = candidatos.map(colocar).find((c) => c.cabe) ?? colocar(candidatos[candidatos.length - 1]);
          // La fila de cpe bajo el segmento sólo si cabe: en un hastial de 30 px se saldría sobre los vecinos.
          const cpeTexto = seg.tramos.map((t) => `${t.zona.zona} ${t.zona.cpe > 0 ? '+' : ''}${dec(t.zona.cpe, 2)}`).join(' · ');
          const cpeCabe = anchoEstimado(cpeTexto, 9.5, true) <= ws + HUECO;
          return (
            <g key={seg.nombre}>
              {seg.hastial && subida > 0 && (
                <polygon points={`${xs},${base - hf * s} ${xs + ws / 2},${base - (hf + subida) * s} ${xs + ws},${base - hf * s}`} fill="none" stroke={COLOR.cota} strokeWidth={1} strokeDasharray="4 3" />
              )}
              {seg.tramos.map((t) => {
                const xt = xs + t.x0 * s;
                const wt = t.ancho * s;
                const z = t.zona;
                const cx = xt + wt / 2;
                const cy = base - (hf * s) / 2;
                return (
                  <g key={z.zona}>
                    <rect x={xt} y={base - hf * s} width={wt} height={hf * s} fill={rellenoZona(z.presion < 0 ? z.presion : null, z.presion > 0 ? z.presion : null, maximo)} stroke={COLOR.seccion} strokeWidth={1.25} />
                    <Rotulo x={cx} y={cy + (wt >= 40 && hf * s >= 40 ? 0 : 5)} tam={wt >= 30 ? 14 : 11} color={COLOR.rotulo} peso={600} ancla="middle">
                      {z.zona}
                    </Rotulo>
                    {wt >= 40 && hf * s >= 40 && (
                      <Rotulo x={cx} y={cy + 15} tam={9.5} mono color={COLOR.rotulo} ancla="middle">
                        {z.presion > 0 ? '+' : ''}
                        {f.presion(z.presion)}
                      </Rotulo>
                    )}
                  </g>
                );
              })}
              {seg.nombre === 'D' && (
                <g>
                  <circle cx={xs + ws - 16} cy={base - hf * s + 16} r={7} fill={COLOR.fondo} stroke={COLOR.presion} strokeWidth={1.25} />
                  <path d={`M${xs + ws - 21} ${base - hf * s + 11}l10 10M${xs + ws - 11} ${base - hf * s + 11}l-10 10`} stroke={COLOR.presion} strokeWidth={1.25} />
                </g>
              )}
              <Rotulo x={rotuloSeg.x} y={base - (hf + (seg.hastial ? subida : 0)) * s - 8} tam={11} color={COLOR.rotulo} peso={600} ancla="middle">
                {rotuloSeg.texto}
              </Rotulo>
              {cpeCabe && (
                <Rotulo x={xs + ws / 2} y={base + 16} tam={9.5} mono color={COLOR.secundario} ancla="middle">
                  {cpeTexto}
                </Rotulo>
              )}
            </g>
          );
        })}
        <Suelo x1={x0 - 10} x2={x0 + des.total * s + 3 * HUECO + 10} y={base} patron={m.suelo} />
        {/* Notas bajo el desarrollo: en estrecho, cada una en dos líneas */}
        {(estrecho
          ? [`${des.segmentos[1].tramos.map((t) => `${t.zona.zona} ${dec(t.ancho, 2)} m`).join(' · ')} en cada lateral,`, 'medidos desde la arista de barlovento.', ...(subida > 0 ? ['El hastial (a trazos) no cuenta en A, B y C:', 'sus áreas van hasta el último forjado.'] : [])]
          : [`${des.segmentos[1].tramos.map((t) => `${t.zona.zona} ${dec(t.ancho, 2)} m`).join(' · ')} en cada lateral, medidos desde la arista de barlovento.`, ...(subida > 0 ? ['El hastial (a trazos) no cuenta en A, B y C: sus áreas van hasta el último forjado.'] : [])]
        ).map((l, i) => (
          <Rotulo key={i} x={x0} y={base + 40 + i * 14} tam={10} color={COLOR.atenuado}>
            {l}
          </Rotulo>
        ))}

        {/* Planta pequeña con las zonas */}
        {conPlanta && (
          <>
            <Cabecera x={plx - 30} y={ply - 44}>
              {cabeceraPlanta}
            </Cabecera>
            {vientoY
              ? [0.25, 0.5, 0.75].map((k) => <Flecha key={k} x1={plx + plw * k} y1={ply - 30} x2={plx + plw * k} y2={ply - 4} punta={m.punta('accent')} color={COLOR.accent} />)
              : [0.25, 0.5, 0.75].map((k) => <Flecha key={k} x1={plx - 30} y1={ply + plh * k} x2={plx - 4} y2={ply + plh * k} punta={m.punta('accent')} color={COLOR.accent} />)}
            <rect x={plx} y={ply} width={plw} height={plh} fill={COLOR.fondo} stroke={COLOR.seccion} strokeWidth={1.25} />
            {vientoY ? (
              <>
                <line x1={plx} y1={ply} x2={plx + plw} y2={ply} stroke={COLOR.presion} strokeWidth={4} />
                <line x1={plx} y1={ply + plh} x2={plx + plw} y2={ply + plh} stroke={COLOR.accent} strokeWidth={3} />
                <line x1={plx} y1={ply} x2={plx} y2={ply + bandaA * escalaPlanta} stroke={COLOR.accent} strokeWidth={5} />
                <line x1={plx + plw} y1={ply} x2={plx + plw} y2={ply + bandaA * escalaPlanta} stroke={COLOR.accent} strokeWidth={5} />
                <line x1={plx} y1={ply + bandaA * escalaPlanta} x2={plx} y2={ply + plh} stroke={mezcla(COLOR.accent, 60)} strokeWidth={2} />
                <line x1={plx + plw} y1={ply + bandaA * escalaPlanta} x2={plx + plw} y2={ply + plh} stroke={mezcla(COLOR.accent, 60)} strokeWidth={2} />
                {sitioDE && (
                  <>
                    <Rotulo x={plx + plw / 2} y={ply + 14} tam={10} color={COLOR.presion} peso={600} ancla="middle">
                      D
                    </Rotulo>
                    <Rotulo x={plx + plw / 2} y={ply + plh - 6} tam={10} color={COLOR.accent} peso={600} ancla="middle">
                      E
                    </Rotulo>
              </>
            )}
            {sitioA && (
              <Rotulo x={plx + 8} y={ply + bandaPx + 12} tam={10} color={COLOR.accent} peso={600}>
                A
              </Rotulo>
            )}
            {sitioB && (
              <Rotulo x={plx + 8} y={ply + plh / 2 + 4} tam={10} color={COLOR.accent} peso={600}>
                B
              </Rotulo>
            )}
            <CotaV x={plx + plw + 16} y1={ply} y2={ply + bandaA * escalaPlanta} texto={cotaA} />
          </>
        ) : (
          <>
            <line x1={plx} y1={ply} x2={plx} y2={ply + plh} stroke={COLOR.presion} strokeWidth={4} />
            <line x1={plx + plw} y1={ply} x2={plx + plw} y2={ply + plh} stroke={COLOR.accent} strokeWidth={3} />
            <line x1={plx} y1={ply} x2={plx + bandaA * escalaPlanta} y2={ply} stroke={COLOR.accent} strokeWidth={5} />
            <line x1={plx} y1={ply + plh} x2={plx + bandaA * escalaPlanta} y2={ply + plh} stroke={COLOR.accent} strokeWidth={5} />
            <line x1={plx + bandaA * escalaPlanta} y1={ply} x2={plx + plw} y2={ply} stroke={mezcla(COLOR.accent, 60)} strokeWidth={2} />
            <line x1={plx + bandaA * escalaPlanta} y1={ply + plh} x2={plx + plw} y2={ply + plh} stroke={mezcla(COLOR.accent, 60)} strokeWidth={2} />
            {sitioDE && (
              <>
                <Rotulo x={plx + 6} y={ply + plh / 2 + 4} tam={10} color={COLOR.presion} peso={600}>
                  D
                </Rotulo>
                <Rotulo x={plx + plw - 6} y={ply + plh / 2 + 4} tam={10} color={COLOR.accent} peso={600} ancla="end">
                  E
                </Rotulo>
              </>
            )}
            {sitioA && (
              <Rotulo x={plx + bandaPx + 4} y={ply + 12} tam={10} color={COLOR.accent} peso={600}>
                A
              </Rotulo>
            )}
            {sitioB && (
              <Rotulo x={plx + plw / 2} y={ply + 12} tam={10} color={COLOR.accent} peso={600} ancla="middle">
                B
              </Rotulo>
            )}
            <CotaH x1={plx} x2={plx + bandaA * escalaPlanta} y={ply + plh + 18} texto={cotaA} />
          </>
        )}
        {/* El pie de la planta, centrado en ella pero sin salirse del lienzo cuando la planta es diminuta */}
        <Rotulo x={clamp(plx + plw / 2, anchoEstimado(pieCaption, 10, true) / 2 + 2, width - anchoEstimado(pieCaption, 10, true) / 2 - 2)} y={ply + plh + (vientoY ? 16 : 32)} tam={10} mono color={COLOR.accent} ancla="middle">
          {pieCaption}
        </Rotulo>
          </>
        )}

        {/* Para qué sirve: sólo si cabe a la derecha de la planta */}
        {conTexto && (
          <>
            <Cabecera x={xTexto} y={ply - 44}>
              Para qué sirve
            </Cabecera>
            {[
              'Carpinterías, acristalamientos, aplacados,',
              'anclajes y correas de fachada (art. 3.3.4-3).',
              'La estructura del edificio de pisos va con la',
              'fuerza por planta de la vista «Edificio».',
              '',
              'El viento va en los dos sentidos: D y E se',
              'intercambian, y A, B y C se miden desde la',
              'arista que quede a barlovento.',
              '',
              `h = ${dec(paramentos.h, 2)} m → ce ${dec(paramentos.ce, 3)} → qb·ce = ${f.presion(paramentos.qe)} ${f.uQ},`,
              'del lado de la seguridad para los elementos bajos.',
            ].map((l, i) => (
              <Rotulo key={i} x={xTexto} y={ply - 24 + i * 14} tam={10.5} color={COLOR.secundario}>
                {l}
              </Rotulo>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
