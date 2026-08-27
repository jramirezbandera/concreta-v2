// Dibujos del módulo de sismo: espectro, alzado con fuerzas y cortantes.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA GRÁFICA DEL ESPECTRO DIBUJA LAS DOS CURVAS, Y ESO ES EL PUNTO
// ─────────────────────────────────────────────────────────────────────────────
// Hay DOS expresiones distintas y confundirlas es la trampa de este módulo:
//
//   art. 2.3   espectro ELÁSTICO      alpha = 1 + 1,5·T/T_A   por debajo de T_A
//   art. 3.7.3 alpha de las FUERZAS   alpha = 2,5             por debajo de T_B
//
// Sólo difieren por debajo de T_A; a partir de ahí son algebraicamente la misma
// (2,5·T_B/T = K·C/T). Un edificio achaparrado de fábrica cae justo en esa zona
// y la diferencia llega al 24 %, siempre del lado de la inseguridad si se usa la
// elástica para las fuerzas.
//
// Por eso se pintan las dos y se rotulan las zonas SOBRE la curva. Se descartó
// un diagrama aparte de "dónde cae tu período": duplicaba esta misma gráfica.

import type { SeismicEvaluation } from './state';
import { elasticSpectrum, staticForceAlpha } from '../../lib/codes/seismic/ncse02';

const EJE = '#2c2c34';
const TEXTO = '#6b6f79';
const ACENTO = '#38bdf8';
const ELASTICO = '#9a9ea7';
const FUERZA = '#f59e0b';

// ── Espectro ─────────────────────────────────────────────────────────────────

/**
 * @param eje Dirección cuyos modos y T_F se marcan sobre la curva.
 *
 * La curva es del EMPLAZAMIENTO y no depende de la dirección, pero los puntos
 * que se marcan encima sí: en los sistemas cuyo T_F depende de la dimensión en
 * planta —fábrica, pantallas, acero triangulado— X e Y caen en sitios distintos
 * de la gráfica. Antes se pintaba siempre X, sin decirlo y sin reaccionar al
 * selector de eje, así que los modos de Y no se veían nunca.
 */
export function EspectroSVG({
  evaluacion,
  width = 360,
  eje = 'x',
}: {
  evaluacion: SeismicEvaluation;
  width?: number;
  eje?: 'x' | 'y';
}) {
  const { TA, TB } = evaluacion.emplazamiento;
  const h = Math.round(width * 0.62);
  const m = { t: 16, r: 14, b: 26, l: 30 };
  const w = width - m.l - m.r;
  const hh = h - m.t - m.b;
  if (!(TA > 0) || !(TB > 0) || w <= 0 || hh <= 0) return null;

  const TMax = Math.max(2, TB * 3);
  const aMax = 3;
  const px = (T: number) => m.l + (T / TMax) * w;
  const py = (a: number) => m.t + hh - (a / aMax) * hh;

  const puntos = 240;
  const camino = (fn: (T: number) => number) => {
    let d = '';
    for (let i = 0; i <= puntos; i++) {
      const T = (i / puntos) * TMax;
      const a = fn(T);
      d += `${i === 0 ? 'M' : 'L'}${px(T).toFixed(2)},${py(a).toFixed(2)}`;
    }
    return d;
  };

  const TF = evaluacion.resultado?.[eje].TF;
  const modos = evaluacion.resultado?.[eje].modos ?? [];
  const EJE_ROTULO = eje.toUpperCase();

  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      role="img"
      aria-label={`Espectro de respuesta, dirección ${EJE_ROTULO}`}
    >
      <title>
        Espectro de respuesta: la curva elástica del art. 2.3 y la alpha de las fuerzas del art.
        3.7.3, que sólo difieren por debajo de T_A. Los modos marcados son los de la dirección{' '}
        {EJE_ROTULO}.
      </title>

      {/* ejes */}
      <line x1={m.l} y1={m.t} x2={m.l} y2={m.t + hh} stroke={EJE} strokeWidth={1} />
      <line x1={m.l} y1={m.t + hh} x2={m.l + w} y2={m.t + hh} stroke={EJE} strokeWidth={1} />
      {[0, 1, 2, 3].map((a) => (
        <g key={a}>
          <line x1={m.l - 3} y1={py(a)} x2={m.l} y2={py(a)} stroke={EJE} />
          <text x={m.l - 5} y={py(a) + 3} fontSize={8} fill={TEXTO} textAnchor="end" fontFamily="monospace">
            {a}
          </text>
        </g>
      ))}
      <text x={m.l + w} y={h - 6} fontSize={8} fill={TEXTO} textAnchor="end" fontFamily="monospace">
        T [s]
      </text>

      {/* T_A y T_B */}
      {[
        { T: TA, t: 'T_A' },
        { T: TB, t: 'T_B' },
      ].map((v) => (
        <g key={v.t}>
          <line
            x1={px(v.T)}
            y1={m.t}
            x2={px(v.T)}
            y2={m.t + hh}
            stroke={EJE}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text x={px(v.T)} y={h - 14} fontSize={8} fill={TEXTO} textAnchor="middle" fontFamily="monospace">
            {v.t}
          </text>
          <text x={px(v.T)} y={h - 5} fontSize={7} fill={TEXTO} textAnchor="middle" fontFamily="monospace">
            {v.T.toFixed(2)}
          </text>
        </g>
      ))}

      {/* curvas */}
      <path d={camino((T) => elasticSpectrum(T, TA, TB))} fill="none" stroke={ELASTICO} strokeWidth={1.25} strokeDasharray="3 2" />
      <path d={camino((T) => staticForceAlpha(T, TB))} fill="none" stroke={FUERZA} strokeWidth={1.75} />

      {/* rótulos de zona SOBRE la curva, que es donde se leen */}
      <text x={px(TB * 0.5)} y={py(2.5) - 6} fontSize={8} fill={FUERZA} textAnchor="middle" fontFamily="monospace">
        α = 2,5
      </text>
      <text x={px(TB * 1.9)} y={py(staticForceAlpha(TB * 1.9, TB)) - 6} fontSize={8} fill={FUERZA} textAnchor="middle" fontFamily="monospace">
        α = 2,5·T_B/T
      </text>
      <text x={px(TA * 0.35)} y={py(0.5)} fontSize={7} fill={ELASTICO} textAnchor="start" fontFamily="monospace">
        elástico · art. 2.3
      </text>

      {/* dónde caen los modos */}
      {modos.map((mo) => (
        <g key={mo.i}>
          <circle cx={px(mo.T)} cy={py(mo.alpha)} r={3} fill={ACENTO} />
          <text x={px(mo.T)} y={py(mo.alpha) - 6} fontSize={7} fill={ACENTO} textAnchor="middle" fontFamily="monospace">
            {mo.i}
          </text>
        </g>
      ))}
      {/*
        El eje va EN el rótulo. Sin él, un edificio de fábrica con L distinta en
        cada dirección enseñaba un T_F sin decir de cuál de las dos, y la otra no
        aparecía en ninguna parte.
      */}
      {TF !== undefined && TF > 0 ? (
        <text x={m.l + 3} y={m.t + 8} fontSize={8} fill={ACENTO} fontFamily="monospace">
          T_F · {EJE_ROTULO} = {TF.toFixed(2)} s
        </text>
      ) : null}
    </svg>
  );
}

// ── Alzado con fuerzas y cortantes ───────────────────────────────────────────

export function AlzadoSVG({
  evaluacion,
  eje = 'x',
  width = 360,
}: {
  evaluacion: SeismicEvaluation;
  eje?: 'x' | 'y';
  width?: number;
}) {
  const r = evaluacion.resultado;
  if (!r || !r.plantas.length) return null;
  const d = r[eje];

  const h = Math.round(width * 0.9);
  const m = { t: 18, r: 12, b: 26, l: 12 };
  const anchoAlzado = (width - m.l - m.r) * 0.42;
  const anchoCortante = (width - m.l - m.r) * 0.5;
  const xAlzado = m.l;
  const xCortante = m.l + anchoAlzado + (width - m.l - m.r) * 0.08;
  const hh = h - m.t - m.b;

  const H = Math.max(...r.plantas.map((p) => p.h), 1);
  const py = (altura: number) => m.t + hh - (altura / H) * hh;

  const Fmax = Math.max(...d.Fk.map(Math.abs), 1);
  const Vmax = Math.max(...d.Vk.map(Math.abs), 1);

  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`Fuerzas y cortantes en dirección ${eje.toUpperCase()}`}>
      <title>
        Alzado con las fuerzas equivalentes por planta y el diagrama de cortantes en la dirección{' '}
        {eje.toUpperCase()}.
      </title>

      {/* alzado */}
      <line x1={xAlzado} y1={m.t + hh} x2={xAlzado + anchoAlzado} y2={m.t + hh} stroke={EJE} strokeWidth={1.5} />
      <line x1={xAlzado + anchoAlzado * 0.5} y1={m.t} x2={xAlzado + anchoAlzado * 0.5} y2={m.t + hh} stroke={EJE} />
      {r.plantas.map((p, k) => {
        const y = py(p.h);
        const F = d.Fk[k];
        const largo = (Math.abs(F) / Fmax) * anchoAlzado * 0.85;
        const negativa = F < 0;
        const x0 = xAlzado + anchoAlzado * 0.5;
        return (
          <g key={k}>
            <line x1={xAlzado} y1={y} x2={xAlzado + anchoAlzado} y2={y} stroke={EJE} strokeDasharray="2 2" />
            {/*
              Una F_k negativa se dibuja hacia el otro lado en vez de recortarse:
              el SRSS destruye el signo y el perfil combinado no tiene por qué ser
              monótono. Esconderlo dejaría al usuario sin ver un caso legítimo.
            */}
            <line
              x1={x0}
              y1={y}
              x2={negativa ? x0 - largo : x0 + largo}
              y2={y}
              stroke={negativa ? '#f59e0b' : ACENTO}
              strokeWidth={2}
              markerEnd="url(#punta)"
            />
          </g>
        );
      })}

      {/* diagrama de cortantes */}
      <line x1={xCortante} y1={m.t} x2={xCortante} y2={m.t + hh} stroke={EJE} />
      <line x1={xCortante} y1={m.t + hh} x2={xCortante + anchoCortante} y2={m.t + hh} stroke={EJE} />
      <path
        d={(() => {
          // Escalonado: el cortante es constante dentro de cada planta.
          let s = `M${xCortante},${m.t + hh}`;
          for (let k = 0; k < d.Vk.length; k++) {
            const x = xCortante + (Math.abs(d.Vk[k]) / Vmax) * anchoCortante;
            const yInf = k === 0 ? m.t + hh : py(r.plantas[k - 1].h);
            const ySup = py(r.plantas[k].h);
            s += `L${x.toFixed(2)},${yInf.toFixed(2)}L${x.toFixed(2)},${ySup.toFixed(2)}`;
          }
          s += `L${xCortante},${py(r.plantas[r.plantas.length - 1].h).toFixed(2)}Z`;
          return s;
        })()}
        fill={`${ACENTO}22`}
        stroke={ACENTO}
        strokeWidth={1.25}
      />
      <text x={xCortante} y={h - 14} fontSize={8} fill={TEXTO} fontFamily="monospace">
        V_k
      </text>
      <text x={xCortante + anchoCortante} y={h - 14} fontSize={8} fill={TEXTO} textAnchor="end" fontFamily="monospace">
        {Vmax.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kN
      </text>
      <text x={xAlzado} y={h - 14} fontSize={8} fill={TEXTO} fontFamily="monospace">
        F_k · {eje.toUpperCase()}
      </text>

      <defs>
        <marker id="punta" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={ACENTO} />
        </marker>
      </defs>
    </svg>
  );
}
