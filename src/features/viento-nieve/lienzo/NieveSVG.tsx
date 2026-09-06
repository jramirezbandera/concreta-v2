/**
 * Vista Nieve: un glifo por faldón y la curva sk–altitud de la zona.
 *
 * La lista de faldones no dice qué faldón toca a cuál, así que no se inventa
 * una sección del edificio: cada faldón se dibuja solo, con su pendiente real,
 * la banda de nieve cuyo espesor es la carga (qn = μ · sk), la hipótesis
 * asimétrica a trazos y lo que hay al pie —alero, limahoya, cambio de nivel
 * con su cuña de acumulación—. Debajo, la tabla E.2 como curva con el punto
 * de la obra: la altitud manda tanto como la zona.
 */

import type { KeyboardEvent } from 'react';
import { ALTITUDES_TABLA_E2, cargaNieveTerreno, TABLA_E2, type ZonaInvernal } from '../../../lib/acciones';
import type { FaldonResuelto, NieveResultado } from '../../../lib/acciones/nieve';
import type { FaldonUI, NieveUI } from '../state';
import { Marcadores } from '../../../components/canvas/Marcadores';
import { COLOR, dec, mezcla } from './paleta';
import { Cabecera, CotaH, Flecha, Rotulo } from './primitivas';
import { useFormato } from './useFormato';
import { useMarcadores } from '../../../components/canvas/useMarcadores';
import { useMedida } from '../../../components/canvas/useMedida';

interface Props {
  nieve: NieveUI;
  resultado: NieveResultado | null;
  zona: ZonaInvernal | null;
  altitud: number | null;
  faldonSel: string | null;
  onSelectFaldon: (id: string | null) => void;
  forceWidth?: number;
  forceHeight?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rad = (g: number) => (g * Math.PI) / 180;

const PIE: Record<FaldonUI['limahoya'], string> = {
  ninguna: 'alero: la nieve cae fuera',
  contrario: 'limahoya con el de enfrente',
  mismoSentido: 'limahoya: el siguiente sigue bajando',
  cambioNivel: 'cambio de nivel: se acumula abajo',
};

interface GlifoProps {
  f: FaldonUI;
  r: FaldonResuelto | undefined;
  x: number;
  y: number;
  w: number;
  h: number;
  seleccionado: boolean;
  nieve: string;
  punta: string;
  formato: ReturnType<typeof useFormato>;
  onSelect: () => void;
}

function Glifo({ f, r, x, y, w, h, seleccionado, nieve, punta, formato, onSelect }: GlifoProps) {
  const nombre = f.nombre || 'Faldón';
  const alfa = clamp(f.inclinacion, 0, 89);
  // Zona de dibujo: bajo las dos líneas de cabecera, sobre la cota L y el pie.
  const top = y + 44;
  const bottom = y + h - 48;
  const xAlto = x + 18;
  const xPie = x + w - 56;
  const run = Math.max(30, xPie - xAlto);
  const espesor = r ? clamp(r.qn * 26, 4, 24) : 0;
  const altoUtil = Math.max(20, bottom - top - espesor - 6);
  const subida = Math.min(altoUtil, run * Math.tan(rad(alfa)));
  const yPie = bottom;
  const yAlto = yPie - subida;
  // Normal hacia fuera del faldón (arriba), para la banda de nieve.
  const L = Math.hypot(run, subida) || 1;
  const n = [subida / L, -run / L] as const;
  const teclado = (ev: KeyboardEvent<SVGGElement>) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onSelect();
    }
  };
  const otro = clamp(f.inclinacionOtro, 0, 89);
  const acum = r?.acumulacion;
  const cuna = acum ? clamp(acum.pa * 14, 6, 22) : 0;

  return (
    <g role="button" tabIndex={0} aria-label={`Seleccionar ${nombre}`} aria-pressed={seleccionado} onClick={onSelect} onKeyDown={teclado} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={seleccionado ? mezcla(COLOR.accent, 8) : COLOR.fondo} stroke={seleccionado ? mezcla(COLOR.accent, 45) : COLOR.borde} strokeWidth={1} />
      <Rotulo x={x + 10} y={y + 16} tam={11} color={seleccionado ? COLOR.accent : COLOR.rotulo} peso={600}>
        {nombre}
      </Rotulo>
      <Rotulo x={x + 10} y={y + 30} tam={10} mono color={COLOR.secundario}>
        α {dec(f.inclinacion, 0)}º{r ? ` · μ ${dec(r.mu, 2)}${f.impedimento ? ' (petos)' : ''}` : ''}
      </Rotulo>

      {/* Banda de nieve y su hipótesis asimétrica */}
      {r && (
        <>
          <polygon points={`${xAlto},${yAlto} ${xPie},${yPie} ${xPie + n[0] * espesor},${yPie + n[1] * espesor} ${xAlto + n[0] * espesor},${yAlto + n[1] * espesor}`} fill={nieve} stroke={COLOR.accent} strokeWidth={1} />
          <line x1={xAlto + (n[0] * espesor) / 2} y1={yAlto + (n[1] * espesor) / 2} x2={xPie + (n[0] * espesor) / 2} y2={yPie + (n[1] * espesor) / 2} stroke={COLOR.accent} strokeWidth={1} strokeDasharray="3 3" />
          <Rotulo x={(xAlto + xPie) / 2 + n[0] * (espesor + 12)} y={(yAlto + yPie) / 2 + n[1] * (espesor + 12) + 4} tam={10} mono color={COLOR.accent} peso={600} ancla="middle">
            qn {formato.presion(r.qn)} {formato.uQ}
          </Rotulo>
        </>
      )}

      {/* El faldón */}
      <line x1={xAlto} y1={yAlto} x2={xPie} y2={yPie} stroke={COLOR.seccion} strokeWidth={2} />
      {f.impedimento && <line x1={xPie} y1={yPie} x2={xPie} y2={yPie - 12} stroke={COLOR.seccion} strokeWidth={2.5} />}

      {/* Lo que hay al pie */}
      {f.limahoya === 'ninguna' && (
        <>
          <line x1={xPie} y1={yPie} x2={xPie} y2={yPie + 16} stroke={COLOR.seccion} strokeWidth={1.5} />
          {!f.impedimento && <Flecha x1={xPie + 4} y1={yPie + 2} x2={xPie + 18} y2={yPie + 18} punta={punta} color={COLOR.cota} grosor={1} discontinua />}
        </>
      )}
      {f.limahoya === 'contrario' && (
        <>
          <line x1={xPie} y1={yPie} x2={xPie + 40} y2={yPie - Math.min(40, 40 * Math.tan(rad(otro)))} stroke={COLOR.seccion} strokeWidth={2} />
          <line x1={xPie - 14} y1={yPie + 8} x2={xPie + 14} y2={yPie + 8} stroke={COLOR.accent} strokeWidth={1} />
          {r?.limahoya && (
            <Rotulo x={xPie} y={yPie + 20} tam={9.5} mono color={COLOR.accent} ancla="middle">
              μ {dec(r.limahoya.mu, 2)} en {r.limahoya.ancho} m
            </Rotulo>
          )}
        </>
      )}
      {f.limahoya === 'mismoSentido' && (
        <>
          <line x1={xPie} y1={yPie} x2={xPie + 40} y2={yPie + Math.min(24, 40 * Math.tan(rad(otro)))} stroke={COLOR.seccion} strokeWidth={2} />
          <line x1={xPie - 14} y1={yPie + 8} x2={xPie + 14} y2={yPie + 8} stroke={COLOR.accent} strokeWidth={1} />
          {r?.limahoya && (
            <Rotulo x={xPie} y={yPie + 20} tam={9.5} mono color={COLOR.accent} ancla="middle">
              μ {dec(r.limahoya.mu, 2)} en {r.limahoya.ancho} m
            </Rotulo>
          )}
        </>
      )}
      {f.limahoya === 'cambioNivel' && (
        <>
          <line x1={xPie} y1={yPie} x2={xPie} y2={yPie + 26} stroke={COLOR.seccion} strokeWidth={2} />
          <line x1={xPie} y1={yPie + 26} x2={xPie + 46} y2={yPie + 26} stroke={COLOR.seccion} strokeWidth={2} />
          {acum && (
            <>
              <polygon points={`${xPie},${yPie + 26 - cuna} ${xPie + 28},${yPie + 26} ${xPie},${yPie + 26}`} fill={mezcla(COLOR.accent, 35)} stroke={COLOR.accent} strokeWidth={1} />
              <Flecha x1={xPie + 6} y1={yPie + 2} x2={xPie + 6} y2={yPie + 26 - cuna - 4} punta={punta} color={COLOR.accent} grosor={1} discontinua />
            </>
          )}
        </>
      )}
      {r?.hielo !== undefined && (
        <>
          <circle cx={xPie + (f.limahoya === 'ninguna' ? 0 : -6)} cy={yPie + 6} r={3} fill={COLOR.accent} />
          <Rotulo x={xPie - 10} y={yPie + 32} tam={9.5} mono color={COLOR.accent} ancla="end">
            hielo {formato.lineal(r.hielo)} {formato.uL}
          </Rotulo>
        </>
      )}

      {/* Cota L y el pie */}
      {f.L !== null && <CotaH x1={xAlto} x2={xPie} y={y + h - 36} texto={`L = ${dec(f.L, 2)} m`} />}
      <Rotulo x={x + 10} y={y + h - 20} tam={9.5} color={COLOR.atenuado}>
        {PIE[f.limahoya]}
      </Rotulo>
      {acum && (
        <Rotulo x={x + 10} y={y + h - 8} tam={9.5} mono color={COLOR.accent}>
          pd {formato.lineal(acum.pd)} → pa {formato.lineal(acum.pa)} {formato.uL} en {acum.ancho} m
        </Rotulo>
      )}
    </g>
  );
}

export function NieveSVG({ nieve, resultado, zona, altitud, faldonSel, onSelectFaldon, forceWidth, forceHeight }: Props) {
  const { ref, width, height } = useMedida(forceWidth, forceHeight);
  const m = useMarcadores();
  const f = useFormato();
  const estrecho = width < 600;

  const porId = new Map(resultado?.faldones.map((r) => [r.id, r]) ?? []);
  const n = nieve.faldones.length;

  // ── Rejilla de glifos ────────────────────────────────────────────────────
  const margen = 12;
  const hueco = 10;
  const anchoCelda = estrecho ? 170 : 200;
  const porFila = Math.max(1, Math.floor((width - 2 * margen + hueco) / (anchoCelda + hueco)));
  const filas = Math.max(1, Math.ceil(n / porFila));
  const altoChart = estrecho ? 0 : 190;
  const altoCelda = clamp((height - 40 - altoChart - 30 - (filas - 1) * hueco) / filas, 120, 170);
  const celdaW = Math.min(anchoCelda, (width - 2 * margen - (porFila - 1) * hueco) / Math.min(n || 1, porFila));

  const sk = resultado?.sk ?? null;
  const skTexto = sk === null ? '—' : `${f.presion(sk)} ${f.uQ}`;
  const origen = resultado?.skOrigen === 'tabla3.8' ? 'tabla 3.8, capital' : resultado?.skOrigen === 'manual' ? 'valor propio' : 'tabla E.2';

  // ── Curva sk–altitud ─────────────────────────────────────────────────────
  const yChart = 40 + filas * altoCelda + (filas - 1) * hueco + 30;
  const chartOk = !estrecho && zona !== null && height - yChart > 150;
  const puntos = zona !== null ? ALTITUDES_TABLA_E2.map((a, i) => ({ a, v: TABLA_E2[zona][i] })).filter((p): p is { a: number; v: number } => p.v !== null) : [];
  const maxA = puntos.length ? puntos[puntos.length - 1].a : 2000;
  const maxV = Math.max(1, Math.ceil(Math.max(...puntos.map((p) => p.v), sk ?? 0)));
  const cx0 = 60;
  const cw = Math.min(300, width - 360);
  const cy0 = yChart + 26 + 140;
  const ch = 140;
  const xs = cw / maxA;
  const ys = ch / maxV;
  const xLeyenda = cx0 + cw + 48;
  const skMas = zona !== null && altitud !== null ? cargaNieveTerreno(zona, altitud + 200) : null;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 320 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Nieve por faldón y sk por altitud" style={{ display: 'block' }}>
        <title>Nieve: un glifo por faldón y la curva sk–altitud de la zona</title>
        <Marcadores id={m.id} />
        <Rotulo x={0} y={14} tam={11} mono color={COLOR.secundario}>
          NIEVE · {n} {n === 1 ? 'faldón' : 'faldones'} · sk = {skTexto}
          {sk !== null ? ` (${origen}${zona !== null ? `, zona ${zona}` : ''}${altitud !== null ? `, ${altitud} m` : ''})` : nieve.activo ? ' · sin resultado: falta la altitud o la provincia' : ' · nieve omitida'}
        </Rotulo>

        {nieve.faldones.map((fal, i) => {
          const col = i % porFila;
          const fila = Math.floor(i / porFila);
          return (
            <Glifo
              key={fal.id}
              f={fal}
              r={porId.get(fal.id)}
              x={margen + col * (celdaW + hueco)}
              y={40 + fila * (altoCelda + hueco)}
              w={celdaW}
              h={altoCelda}
              seleccionado={fal.id === faldonSel}
              nieve={m.nieve}
              punta={m.punta('cota')}
              formato={f}
              onSelect={() => onSelectFaldon(fal.id === faldonSel ? null : fal.id)}
            />
          );
        })}
        {n === 0 && (
          <Rotulo x={margen} y={70} tam={11} color={COLOR.atenuado}>
            Sin faldones: añada uno en Datos.
          </Rotulo>
        )}

        {chartOk && (
          <>
            <Cabecera x={cx0 - 30} y={yChart + 8}>
              sk por altitud · zona {zona} (tabla E.2) · la altitud manda
            </Cabecera>
            <line x1={cx0} y1={cy0 - ch} x2={cx0} y2={cy0} stroke={COLOR.cota} strokeWidth={1} />
            <line x1={cx0} y1={cy0} x2={cx0 + cw} y2={cy0} stroke={COLOR.cota} strokeWidth={1} />
            {[0, 500, 1000, 1500, 2000].filter((a) => a <= maxA).map((a) => (
              <g key={a}>
                <line x1={cx0 + a * xs} y1={cy0} x2={cx0 + a * xs} y2={cy0 + 3} stroke={COLOR.cota} strokeWidth={1} />
                <Rotulo x={cx0 + a * xs} y={cy0 + 14} tam={9.5} mono color={COLOR.atenuado} ancla="middle">
                  {a}
                </Rotulo>
              </g>
            ))}
            {Array.from({ length: maxV }, (_, i) => i + 1).map((v) => (
              <g key={v}>
                <line x1={cx0} y1={cy0 - v * ys} x2={cx0 + cw} y2={cy0 - v * ys} stroke={mezcla(COLOR.cota, 25)} strokeWidth={1} />
                <Rotulo x={cx0 - 6} y={cy0 - v * ys + 3} tam={9.5} mono color={COLOR.atenuado} ancla="end">
                  {v}
                </Rotulo>
              </g>
            ))}
            <Rotulo x={cx0 + cw} y={cy0 + 26} tam={9.5} color={COLOR.atenuado} ancla="end">
              altitud (m)
            </Rotulo>
            <Rotulo x={cx0 - 6} y={cy0 - ch - 6} tam={9.5} color={COLOR.atenuado} ancla="end">
              sk {f.uQ}
            </Rotulo>
            <polyline points={puntos.map((p) => `${cx0 + p.a * xs},${cy0 - p.v * ys}`).join(' ')} fill="none" stroke={COLOR.accent} strokeWidth={1.75} strokeLinejoin="round" />
            {altitud !== null && sk !== null && altitud <= maxA && (
              <>
                <line x1={cx0 + altitud * xs} y1={cy0 - sk * ys} x2={cx0 + altitud * xs} y2={cy0} stroke={COLOR.accent} strokeWidth={1} strokeDasharray="3 3" />
                <line x1={cx0} y1={cy0 - sk * ys} x2={cx0 + altitud * xs} y2={cy0 - sk * ys} stroke={COLOR.accent} strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={cx0 + altitud * xs} cy={cy0 - sk * ys} r={4} fill={COLOR.fondo} stroke={COLOR.accent} strokeWidth={2} />
                <Rotulo x={cx0 + altitud * xs + 8} y={cy0 - sk * ys - 6} tam={10.5} mono color={COLOR.accent} peso={600}>
                  {altitud} m → {f.presion(sk)} {f.uQ}
                  {resultado?.skOrigen !== 'anejoE' ? ` (${origen})` : ''}
                </Rotulo>
                {skMas !== null && (
                  <Rotulo x={cx0 + altitud * xs + 8} y={cy0 - sk * ys + 8} tam={9.5} mono color={COLOR.atenuado}>
                    a {altitud + 200} m serían {f.presion(skMas)}
                  </Rotulo>
                )}
              </>
            )}

            <Cabecera x={xLeyenda} y={yChart + 8}>
              Cómo leer el dibujo
            </Cabecera>
            <rect x={xLeyenda} y={yChart + 20} width={14} height={14} fill={m.nieve} stroke={COLOR.accent} />
            <Rotulo x={xLeyenda + 20} y={yChart + 31} tam={10.5}>
              el espesor es la carga: qn = μ · sk
            </Rotulo>
            <polygon points={`${xLeyenda},${yChart + 42} ${xLeyenda + 14},${yChart + 56} ${xLeyenda},${yChart + 56}`} fill={mezcla(COLOR.accent, 35)} stroke={COLOR.accent} />
            <Rotulo x={xLeyenda + 20} y={yChart + 53} tam={10.5}>
              acumulación en 2 m (art. 3.5.4)
            </Rotulo>
            <line x1={xLeyenda} y1={yChart + 70} x2={xLeyenda + 14} y2={yChart + 70} stroke={COLOR.accent} strokeWidth={1} strokeDasharray="3 3" />
            <Rotulo x={xLeyenda + 20} y={yChart + 74} tam={10.5}>
              hipótesis asimétrica: μ/2
            </Rotulo>
            {['A más pendiente, menos nieve: μ = 1', 'hasta 30º, 0 desde 60º; petos: 1,0.', 'Lo que desliza no cae fuera si hay', 'limahoya o cubierta más baja.', 'Hielo en voladizos: > 1.000 m.'].map((l, i) => (
              <Rotulo key={i} x={xLeyenda} y={yChart + 98 + i * 14} tam={10.5} color={COLOR.secundario}>
                {l}
              </Rotulo>
            ))}
          </>
        )}
        {!chartOk && zona === null && (
          <Rotulo x={margen} y={yChart + 10} tam={10.5} color={COLOR.atenuado}>
            Con la provincia se dibuja aquí la curva sk–altitud de su zona de clima invernal.
          </Rotulo>
        )}
      </svg>
    </div>
  );
}
