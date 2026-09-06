/**
 * Vista Edificio: el alzado del edificio en la dirección del viento elegida.
 *
 * Dibuja los forjados a su cota, las bandas tributarias (media planta por
 * debajo y media por encima de cada forjado), la cubierta —el hastial si la
 * cumbrera es perpendicular al viento, el rectángulo hasta la coronación si
 * es paralela— y una flecha por forjado cuyo largo es la fuerza que va al
 * programa de cálculo. Sin resultado (falta la provincia) el edificio se
 * dibuja igual con lo que se teclea: es el feedback geométrico que el
 * formulario no daba. La planta pequeña es el selector de dirección.
 */

import type { KeyboardEvent } from 'react';
import type { VientoResultado } from '../../../lib/acciones/viento';
import { alturaCoronacionEfectiva, cotasPlantas, type VientoUI } from '../state';
import { Marcadores } from '../../../components/canvas/Marcadores';
import { COLOR, dec, mezcla } from './paleta';
import { Cabecera, CotaH, Flecha, PlantaLocalizador, Rotulo, Suelo } from './primitivas';
import { useFormato } from './useFormato';
import { useMarcadores } from '../../../components/canvas/useMarcadores';
import { useMedida } from '../../../components/canvas/useMedida';

interface Props {
  viento: VientoUI;
  resultado: VientoResultado | null;
  direccion: 'x' | 'y';
  plantaSel: string | null;
  onSelectPlanta: (id: string | null) => void;
  onDireccion: (d: 'x' | 'y') => void;
  forceWidth?: number;
  forceHeight?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function EdificioSVG({ viento, resultado, direccion, plantaSel, onSelectPlanta, onDireccion, forceWidth, forceHeight }: Props) {
  const { ref, width, height } = useMedida(forceWidth, forceHeight);
  const m = useMarcadores();
  const f = useFormato();

  const D = direccion.toUpperCase();
  const cotas = cotasPlantas(viento.plantas);
  const H = cotas.reduce((a, z) => Math.max(a, z), 0);
  const conCubierta = viento.cubierta.activa;
  const hc = conCubierta ? Math.max(H, alturaCoronacionEfectiva(viento)) : H;
  const d = Math.max(0, viento.dimensiones[direccion]);
  // La sección corta la cumbrera cuando ésta es perpendicular al viento: se ve el hastial.
  const hastialVisible = conCubierta && (viento.cubierta.cumbrera === 'x') === (direccion === 'y');

  // ── Escala y sitio ──────────────────────────────────────────────────────
  const estrecho = width < 600;
  const margenIzq = estrecho ? 150 : 200;
  const margenDer = estrecho ? 96 : 130;
  const arriba = 52;
  const bandaInferior = estrecho ? 170 : 210;
  const altoAlzado = Math.max(160, height - arriba - bandaInferior - 40);
  const s = clamp(Math.min((width - margenIzq - margenDer) / Math.max(d, 1), altoAlzado / Math.max(hc, 1)), 3, 34);
  const bw = d * s;
  const bx = margenIzq + (width - margenIzq - margenDer - bw) / 2;
  const y0 = arriba + hc * s + 4;
  const yz = (z: number) => y0 - z * s;
  const apexX = bx + bw / 2;

  const dir = resultado ? resultado[direccion] : null;
  const porId = new Map(dir?.plantas.map((p) => [p.id, p]) ?? []);
  const Fmax = dir ? dir.plantas.reduce((a, p) => Math.max(a, p.F), 0) : 0;
  // La flecha más larga deja sitio a su rótulo («112,9 kN») a la izquierda.
  const largoMax = Math.max(40, Math.min(150, bx - 96));

  // Bandas tributarias: la de cada forjado va de la mitad de la planta de abajo a la mitad de la de arriba;
  // lo que queda entre la rasante y la mitad de la planta baja se va a cimentación.
  const bandas = cotas.map((z, i) => ({
    zb: i === 0 ? z / 2 : (cotas[i - 1] + z) / 2,
    zt: i === cotas.length - 1 ? z : (z + cotas[i + 1]) / 2,
  }));

  const teclado = (id: string) => (ev: KeyboardEvent<SVGGElement>) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onSelectPlanta(plantaSel === id ? null : id);
    }
  };

  // Presiones sobre los faldones (sólo con el hastial a la vista y cubierta resuelta).
  const cub = resultado?.cubierta ?? null;
  const zona = (k: string) => cub?.perpendicular.zonas.find((z) => z.zona === k);
  const nIzq = (() => {
    const dx = apexX - bx;
    const dy = yz(hc) - yz(H);
    const L = Math.hypot(dx, dy) || 1;
    return [dy / L, -dx / L] as const; // hacia fuera del faldón de barlovento
  })();
  const nDer = [-nIzq[0], nIzq[1]] as const;

  // Rótulos de la derecha: si las plantas están apretadas, menos líneas.
  const lineasPorPlanta = (i: number) => {
    const alto = viento.plantas[i].altura * s;
    return alto >= 44 ? 4 : alto >= 26 ? 2 : 1;
  };

  const rotuloDireccion = (eje: 'x' | 'y', r: { Ftotal: number } | null) => `según ${eje.toUpperCase()} · ${r ? `${f.fuerza(r.Ftotal)} ${f.uF}` : '—'}`;
  const pct = (r: { fraccion: number; aplicado: boolean } | null | undefined) => (r ? `${dec(r.fraccion * 100, 0)} % (${r.aplicado ? 'sumado' : 'despreciado'})` : '—');

  const explicacion: string[] = resultado
    ? [
        'Fuerza por planta = banda de fachada, media planta',
        'por debajo y media por encima: (cp − cs)·qb·ce·b·h.',
        `Rozamiento (3.3.2-3): según X ${pct(resultado.x.rozamiento)},`,
        `según Y ${pct(resultado.y.rozamiento)}; se suma si pasa del 10 %.`,
        conCubierta
          ? `Sobre el último forjado: según Y ${resultado.y.encima?.tipo ?? '—'} +${f.fuerza(resultado.y.encima?.F ?? 0)} ${f.uF},`
          : 'Cubierta plana: nada por encima del último forjado.',
        conCubierta ? `según X ${resultado.x.encima?.tipo ?? '—'} +${f.fuerza(resultado.x.encima?.F ?? 0)} ${f.uF}.` : '',
        `Excentricidad del 5 % de b: ${dec(resultado[direccion].excentricidad, 2)} m según ${D}.`,
      ].filter(Boolean)
    : ['Elija la provincia y la altitud en la columna de', 'datos: la norma pone la zona, la presión dinámica', 'y el coeficiente de exposición de cada forjado.', '', 'El edificio ya se dibuja con lo que teclee:', 'alturas, lados en planta y cubierta.'];

  const escalaPlanta = estrecho ? 6 : 9;
  const yBanda = y0 + 92;
  const xTexto = 60 + Math.max(1, viento.dimensiones.x) * escalaPlanta + 70;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Alzado del edificio con la fuerza del viento por planta, viento según ${D}`} style={{ display: 'block' }}>
        <title>Alzado con la fuerza por planta, viento según {D}</title>
        <Marcadores id={m.id} />

        <Rotulo x={0} y={14} tam={11} mono color={COLOR.secundario}>
          {estrecho
            ? `ALZADO · viento según ${D}${resultado ? '' : ' · sin resultado'}`
            : resultado
              ? `ALZADO · viento según ${D} · empuja la fachada de ${dec(viento.dimensiones[direccion === 'x' ? 'y' : 'x'], 0)} m${hastialVisible ? ' · perpendicular a la cumbrera' : conCubierta ? ' · paralelo a la cumbrera' : ''}`
              : `ALZADO · viento según ${D} · sin resultado: falta la provincia o la altitud`}
        </Rotulo>

        {/* Viento entrante */}
        <Rotulo x={20} y={arriba + 6} tam={10} mono color={COLOR.atenuado}>
          viento según {D}
        </Rotulo>
        {[20, 32, 44].map((dy) => (
          <Flecha key={dy} x1={20} y1={arriba + dy} x2={64} y2={arriba + dy} punta={m.punta('atenuado')} color={COLOR.cota} grosor={1.25} />
        ))}

        {/* Bandas tributarias, clicables */}
        {viento.plantas.map((p, i) => {
          const b = bandas[i];
          const sel = p.id === plantaSel;
          return (
            <g key={p.id} role="button" tabIndex={0} aria-label={`Seleccionar ${p.nombre || 'la planta'}`} aria-pressed={sel} onClick={() => onSelectPlanta(sel ? null : p.id)} onKeyDown={teclado(p.id)} style={{ cursor: 'pointer' }}>
              <rect x={bx} y={yz(b.zt)} width={bw} height={Math.max(0, (b.zt - b.zb) * s)} fill={mezcla(COLOR.accent, resultado ? (sel ? 14 : i % 2 ? 3 : 7) : sel ? 8 : 0)} stroke="none" />
            </g>
          );
        })}
        {bandas.map((b, i) => (
          <line key={`corte-${i}`} x1={bx - 10} y1={yz(b.zb)} x2={bx + bw + 10} y2={yz(b.zb)} stroke={COLOR.cota} strokeWidth={1} strokeDasharray="3 3" />
        ))}
        {cotas.length > 0 && resultado && (
          <Rotulo x={bx - 14} y={yz(bandas[0].zb) + 3} tam={9} mono color={COLOR.atenuado} ancla="end">
            {dec(bandas[0].zb, 1)} m: a cimentación
          </Rotulo>
        )}

        {/* Edificio */}
        <rect x={bx} y={yz(H)} width={bw} height={Math.max(0, H * s)} fill="none" stroke={COLOR.seccion} strokeWidth={1.5} />
        {cotas.slice(0, -1).map((z, i) => (
          <line key={`forjado-${i}`} x1={bx} y1={yz(z)} x2={bx + bw} y2={yz(z)} stroke={COLOR.seccion} strokeWidth={1} />
        ))}
        {conCubierta && hastialVisible && <polygon points={`${bx},${yz(H)} ${apexX},${yz(hc)} ${bx + bw},${yz(H)}`} fill={mezcla(COLOR.accent, 10)} stroke={COLOR.seccion} strokeWidth={1.5} />}
        {conCubierta && !hastialVisible && hc > H && (
          <>
            <rect x={bx} y={yz(hc)} width={bw} height={(hc - H) * s} fill={mezcla(COLOR.accent, 6)} stroke={COLOR.seccion} strokeWidth={1.25} strokeDasharray="5 3" />
            <Rotulo x={apexX} y={yz(H) - (hc - H) * s * 0.5 + 4} tam={10} mono color={COLOR.atenuado} ancla="middle">
              hastial · cumbrera ∥ {viento.cubierta.cumbrera.toUpperCase()}
            </Rotulo>
          </>
        )}
        {!conCubierta && (
          <Rotulo x={apexX} y={yz(H) - 8} tam={10} mono color={COLOR.atenuado} ancla="middle">
            cubierta plana u omitida
          </Rotulo>
        )}

        {/* Presiones sobre los faldones */}
        {hastialVisible && cub && (
          <>
            {[0.3, 0.55, 0.8].map((k) => {
              const px = bx + (apexX - bx) * k;
              const py = yz(H) + (yz(hc) - yz(H)) * k;
              const qx = apexX + (bx + bw - apexX) * k;
              const qy = yz(hc) + (yz(H) - yz(hc)) * k;
              return (
                <g key={k}>
                  <Flecha x1={px + nIzq[0] * 30} y1={py + nIzq[1] * 30} x2={px + nIzq[0] * 5} y2={py + nIzq[1] * 5} punta={m.punta('presion')} color={COLOR.presion} grosor={1.25} />
                  <Flecha x1={qx + nDer[0] * 5} y1={qy + nDer[1] * 5} x2={qx + nDer[0] * 30} y2={qy + nDer[1] * 30} punta={m.punta('accent')} color={COLOR.accent} grosor={1.25} />
                </g>
              );
            })}
            {/* En estrecho las flechas bastan: los rótulos se pisarían con los de las plantas. */}
            {!estrecho && zona('H')?.presion != null && (
              <Rotulo x={bx - 8} y={yz(H + (hc - H) * 0.5) - 8} tam={10} mono color={COLOR.presion} ancla="end">
                presión +{dec(zona('H')!.presion!, 2)}
              </Rotulo>
            )}
            {!estrecho && zona('F')?.presion != null && (
              <Rotulo x={bx - 8} y={yz(H + (hc - H) * 0.5) + 4} tam={10} mono color={COLOR.presion} ancla="end">
                alero +{dec(zona('F')!.presion!, 2)}
              </Rotulo>
            )}
            {!estrecho && zona('J')?.succion != null && (
              <Rotulo x={bx + bw + 8} y={yz(H + (hc - H) * 0.3) - 8} tam={10} mono color={COLOR.accent}>
                succión {dec(zona('J')!.succion!, 2)}
              </Rotulo>
            )}
            {!estrecho && zona('I')?.succion != null && (
              <Rotulo x={bx + bw + 8} y={yz(H + (hc - H) * 0.3) + 4} tam={10} mono color={COLOR.accent}>
                resto {dec(zona('I')!.succion!, 2)}
              </Rotulo>
            )}
          </>
        )}
        {dir?.encima && (
          <Rotulo x={apexX} y={yz(hc) - 8} tam={10} mono color={COLOR.accent} ancla="middle" peso={600}>
            {estrecho ? `${dir.encima.tipo} +${f.fuerza(dir.encima.F)} ${f.uF}` : `${dir.encima.tipo}: +${f.fuerza(dir.encima.F)} ${f.uF} a la planta de cubierta`}
          </Rotulo>
        )}

        <Suelo x1={bx - 60} x2={bx + bw + 60} y={y0} patron={m.suelo} />

        {/* Flechas de fuerza por planta */}
        {resultado
          ? viento.plantas.map((p) => {
              const r = porId.get(p.id);
              if (!r) return null;
              const L = Fmax > 0 ? (r.F / Fmax) * largoMax : 0;
              const y = yz(r.z);
              const sel = p.id === plantaSel;
              return (
                <g key={`F-${p.id}`}>
                  <Flecha x1={bx - 8 - L} y1={y} x2={bx - 3} y2={y} punta={m.punta('accent')} color={COLOR.accent} grosor={sel ? 2.5 : 2} />
                  <Rotulo x={bx - 14 - L} y={y - 5} tam={12} mono color={COLOR.accent} ancla="end" peso={600}>
                    {f.fuerza(r.F)} {f.uF}
                  </Rotulo>
                  {r.Fencima > 0 && (
                    <Rotulo x={bx - 14 - L} y={y + 8} tam={9.5} mono color={COLOR.atenuado} ancla="end">
                      {f.fuerza(r.Fbanda + r.Frozamiento)} + {f.fuerza(r.Fencima)}
                    </Rotulo>
                  )}
                </g>
              );
            })
          : cotas.length > 0 && (
              <>
                <Rotulo x={bx - 14} y={yz(H / 2) - 2} tam={11} color={COLOR.cota} ancla="end">
                  las fuerzas
                </Rotulo>
                <Rotulo x={bx - 14} y={yz(H / 2) + 12} tam={11} color={COLOR.cota} ancla="end">
                  aparecerán aquí
                </Rotulo>
              </>
            )}

        {/* Rótulos de planta a la derecha */}
        {viento.plantas.map((p, i) => {
          const z = cotas[i];
          const y = yz(z);
          const sel = p.id === plantaSel;
          const r = porId.get(p.id);
          const lineas = lineasPorPlanta(i);
          const invalida = p.altura <= 0;
          return (
            <g key={`rot-${p.id}`}>
              <Rotulo x={bx + bw + 14} y={y - 2} tam={11} color={invalida ? COLOR.fallo : sel ? COLOR.accent : COLOR.rotulo} peso={sel ? 600 : 500}>
                {p.nombre || 'Planta'}
              </Rotulo>
              {lineas >= 2 && (
                <Rotulo x={bx + bw + 14} y={y + 11} tam={10} mono color={COLOR.atenuado}>
                  z {dec(z, 2)} m
                </Rotulo>
              )}
              {lineas >= 4 && r && (
                <>
                  <Rotulo x={bx + bw + 14} y={y + 23} tam={10} mono color={COLOR.atenuado}>
                    ce {dec(r.ce, 3)}
                  </Rotulo>
                  <Rotulo x={bx + bw + 14} y={y + 35} tam={10} mono color={COLOR.atenuado}>
                    {f.presion(r.qe)} {f.uQ}
                  </Rotulo>
                </>
              )}
            </g>
          );
        })}
        {conCubierta && hc > H && (
          <>
            <Rotulo x={bx + bw + 14} y={yz(hc) + 4} tam={11} color={COLOR.rotulo} peso={500}>
              coronación
            </Rotulo>
            <Rotulo x={bx + bw + 14} y={yz(hc) + 17} tam={10} mono color={COLOR.atenuado}>
              {dec(hc, 2)} m
            </Rotulo>
            {dir?.encima && !estrecho && (
              <Rotulo x={bx + bw + 14} y={yz(hc) + 29} tam={10} mono color={COLOR.atenuado}>
                ce {dec(dir.encima.ce, 3)}
              </Rotulo>
            )}
          </>
        )}

        <CotaH x1={bx} x2={bx + bw} y={y0 + 26} texto={`${dec(d, 2)} m · lado ${D}, paralelo al viento (d)`} />

        {/* Planta pequeña: selector de dirección */}
        <PlantaLocalizador
          x={60}
          y={yBanda}
          dimensiones={viento.dimensiones}
          cumbrera={conCubierta ? viento.cubierta.cumbrera : null}
          direccion={direccion}
          punta={m.punta}
          onDireccion={onDireccion}
          rotulos={{ x: rotuloDireccion('x', resultado ? resultado.x : null), y: rotuloDireccion('y', resultado ? resultado.y : null) }}
          escala={escalaPlanta}
        />
        <Cabecera x={30} y={yBanda - 34}>
          Planta · pulse una dirección
        </Cabecera>

        {/* De qué se compone la fuerza */}
        {!estrecho && (
          <>
            <Cabecera x={xTexto} y={yBanda - 34}>
              De qué se compone la fuerza por planta
            </Cabecera>
            {explicacion.map((l, i) => (
              <Rotulo key={i} x={xTexto} y={yBanda - 14 + i * 14} tam={10.5} color={COLOR.secundario}>
                {l}
              </Rotulo>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
