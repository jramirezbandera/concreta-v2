// Panel de resultados del módulo de sismo.
//
// El orden no es decorativo: primero el VEREDICTO (¿rige la Norma? ¿vale el
// método simplificado?), porque un cortante basal calculado sobre un edificio
// que no cumple el art. 3.5.1 no significa nada, y enseñarlo antes que la
// puerta invita a copiarlo igual.
//
// Y termina dibujando el límite de alcance. El módulo acaba en la fuerza que le
// toca a cada plano resistente: lo que sigue —esfuerzos por pilar, comprobación
// de secciones, ductilidad del cap. 4— no lo hace, y decirlo en voz alta evita
// que alguien dé por comprobado lo que sólo está repartido.
//
// La presentación es la MISMA que la del resto de módulos: cabecera
// «Resultados calculados» con badge de veredicto y ambientStyle, grupos con
// cabecera de 10px CAPS y referencia normativa a la derecha, y filas
// rótulo/valor con separador `border-sub` (DESIGN.md prohíbe expresamente las
// tarjetas decorativas y `rounded-lg`, que es como nació este panel). Los
// grupos de filas escalares van a dos columnas en pantalla ancha —el patrón de
// SectionPropertiesBlock— para que el valor no quede a medio metro de su
// rótulo.

import type {
  AvisoNorma,
  CasoDireccional,
  DireccionResult,
  MotivoImpedimento,
  Requisito,
} from '../../lib/codes/seismic/types';
import type { CheckStatus } from '../../lib/calculations/types';
import { ambientStyle } from '../../components/checks';
import type { SeismicEvaluation, SeismicState } from './state';
import { dec, pct } from './formato';

// Una sola convención decimal en todo el módulo: ver `formato.ts`.
const n0 = (v: number) => dec(v, 0);
const n1 = (v: number) => dec(v, 1);

const MOTIVOS: Record<string, string> = {
  'importancia-moderada': 'importancia moderada (art. 1.2.2)',
  'ab-inferior-0.04g': 'ab < 0,04 g',
  'porticos-arriostrados-ab-inferior-0.08g': 'pórticos bien arriostrados con ab < 0,08 g',
};

/**
 * El veredicto de la puerta, condensado en el badge de la cabecera. El vocabulario
 * de los demás módulos (CUMPLE/INCUMPLE) aquí sería falso: la pregunta no es si
 * una sección resiste, sino si la Norma rige y el método vale.
 */
const VEREDICTO: Record<MotivoImpedimento, { status: CheckStatus; tag: string }> = {
  'norma-no-obligatoria': { status: 'neutral', tag: 'NO OBLIGATORIA' },
  'obligatoriedad-indeterminada': { status: 'warn', tag: 'FALTAN DATOS' },
  'prohibicion-art-1.2.3': { status: 'fail', tag: 'PROHIBIDA' },
  'metodo-simplificado-no-aplicable': { status: 'fail', tag: 'NO APLICABLE' },
  'faltan-datos-de-calculo': { status: 'warn', tag: 'FALTAN DATOS' },
};

const TAG_CLS: Record<CheckStatus, string> = {
  ok: 'bg-state-ok/10 text-state-ok',
  warn: 'bg-state-warn/10 text-state-warn',
  fail: 'bg-state-fail/10 text-state-fail',
  neutral: 'bg-state-neutral/10 text-state-neutral',
};

/** Cabecera de grupo — el mismo dibujo que GroupHeader en acero/madera. */
function Cabecera({ titulo, refNorma }: { titulo: string; refNorma?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 pt-3.5 pb-1.75 border-b border-border-sub mb-1">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
        {titulo}
      </h3>
      {refNorma ? (
        <span className="text-[9px] font-mono text-text-disabled whitespace-nowrap">{refNorma}</span>
      ) : null}
    </div>
  );
}

/** Fila rótulo/valor con las métricas del ValueRow común (12/11px, border-sub). */
function Fila({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.75 border-b border-border-sub last:border-b-0">
      <span className="text-[12px] text-text-secondary min-w-0 truncate">
        {k}
        {sub ? <span className="text-[10px] text-text-disabled font-mono ml-1.5">{sub}</span> : null}
      </span>
      <span className="text-[11px] font-mono text-text-primary shrink-0 tabular-nums">{v}</span>
    </div>
  );
}

function Avisos({ avisos }: { avisos: AvisoNorma[] }) {
  if (!avisos.length) return null;
  return (
    <ul className="space-y-1 mt-2">
      {avisos.map((a) => (
        <li
          key={a.id}
          className={[
            'text-[11px] leading-snug border-l-2 pl-2 py-0.5',
            a.severidad === 'bloqueo'
              ? 'border-state-fail text-state-fail'
              : a.severidad === 'aviso'
                ? 'border-state-warn text-state-warn'
                : 'border-border-main text-text-disabled',
          ].join(' ')}
        >
          <span className="font-mono text-[10px] mr-1.5">{a.articulo}</span>
          {a.texto}
        </li>
      ))}
    </ul>
  );
}

function Requisitos({ reqs }: { reqs: Requisito[] }) {
  return (
    <ul className="space-y-0.5">
      {reqs.map((r) => (
        <li key={r.id} className="flex items-start gap-2 py-0.5">
          <span
            className={[
              'text-[11px] font-mono shrink-0 w-4 text-center',
              r.cumple === true
                ? 'text-state-ok'
                : r.cumple === false
                  ? 'text-state-fail'
                  : 'text-text-disabled',
            ].join(' ')}
            aria-label={r.cumple === true ? 'cumple' : r.cumple === false ? 'no cumple' : 'sin declarar'}
          >
            {r.cumple === true ? '✓' : r.cumple === false ? '✕' : '—'}
          </span>
          <div className="min-w-0">
            <span className="text-[11px] text-text-secondary">{r.texto}</span>
            {/*
              La distinción numérico/declarado NO es cosmética: el PDF recoge lo
              declarado como juicio del proyectista, nunca como verificado.
            */}
            <span className="text-[9px] font-mono text-text-disabled ml-1.5">
              {r.tipo === 'declarado' ? 'declarado' : 'comprobado'}
            </span>
            {r.detalle ? (
              <div className="text-[10px] text-text-disabled font-mono">{r.detalle}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Direccion({ eje, d }: { eje: 'X' | 'Y'; d: DireccionResult }) {
  return (
    <section>
      <Cabecera titulo={`Dirección ${eje}`} refNorma="art. 3.7.3" />
      <Fila k="T_F" sub={d.TFManual ? 'impuesto' : 'art. 3.7.2.2'} v={`${dec(d.TF, 3)} s`} />
      <Fila k="Modos" sub="art. 3.7.2.1" v={String(d.nModos)} />
      <Fila k="Cortante basal" v={`${n0(d.cortanteBasal)} kN`} />
      <Fila k="Masa movilizada" sub="Σ participación" v={pct(d.participacionTotal)} />
      <Fila k="L_e" sub="planos extremos" v={`${n1(d.Le)} m`} />

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead>
            <tr className="text-text-disabled">
              <th className="text-left font-normal px-1 py-1">k</th>
              <th className="text-right font-normal px-1 py-1">F_k [kN]</th>
              <th className="text-right font-normal px-1 py-1">V_k [kN]</th>
            </tr>
          </thead>
          <tbody>
            {/* De cubierta a planta baja, que es como se lee un alzado. */}
            {d.Vk.map((_, i) => d.Vk.length - 1 - i).map((k) => (
              <tr key={k} className="border-t border-border-sub">
                <td className="px-1 py-1 text-text-disabled">{k + 1}</td>
                {/*
                  F_k puede salir NEGATIVA y no es un error: el SRSS destruye el
                  signo y el perfil combinado no tiene por qué ser monótono. Se
                  marca en ámbar para que se vea, no se recorta a cero.
                */}
                <td className={`px-1 py-1 text-right ${d.Fk[k] < 0 ? 'text-state-warn' : 'text-text-primary'}`}>
                  {n0(d.Fk[k])}
                </td>
                <td className="px-1 py-1 text-right text-text-primary">{n0(d.Vk[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.reparto.length ? (
        <details className="mt-2">
          <summary className="text-[11px] text-text-disabled cursor-pointer hover:text-text-secondary">
            Reparto por plano resistente, con torsión
          </summary>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead>
                <tr className="text-text-disabled">
                  <th className="text-left font-normal px-1 py-1">k · j</th>
                  <th className="text-right font-normal px-1 py-1">x [m]</th>
                  <th className="text-right font-normal px-1 py-1">γ_a</th>
                  <th className="text-right font-normal px-1 py-1">f [kN]</th>
                </tr>
              </thead>
              <tbody>
                {d.reparto.flatMap((p) =>
                  p.elementos.map((el, j) => (
                    <tr key={`${p.k}-${el.id}`} className="border-t border-border-sub">
                      <td className="px-1 py-1 text-text-disabled">
                        {p.k}·{j + 1}
                      </td>
                      <td className="px-1 py-1 text-right text-text-secondary">{n1(el.x)}</td>
                      <td className="px-1 py-1 text-right text-text-secondary">{dec(el.gamma, 3)}</td>
                      <td className="px-1 py-1 text-right text-text-primary">{n0(el.f)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <Avisos avisos={d.avisos} />
    </section>
  );
}

function Direccionales({ casos }: { casos: CasoDireccional[] }) {
  return (
    <section>
      <Cabecera titulo="Combinación direccional" refNorma="art. 3.4" />
      {/*
        Son OCHO, no cuatro. El signo de la dirección principal también se
        recorre, porque el sismo se combina con la gravedad y +30 % y −30 % no
        producen el mismo efecto. Una envolvente sin signo evalúa cada pilar con
        el signo equivocado frente a la gravedad, y no se nota en ningún número.
      */}
      <p className="text-[10px] leading-snug text-text-disabled pt-1 pb-1.5">
        Ocho casos con signo. El 30 % transversal se recorre en los dos sentidos porque el sismo se
        combina con la gravedad: <span className="font-mono">+0,3</span> y{' '}
        <span className="font-mono">−0,3</span> no dan el mismo efecto.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead>
            <tr className="text-text-disabled">
              <th className="text-left font-normal px-1 py-1">caso</th>
              <th className="text-right font-normal px-1 py-1">f_x</th>
              <th className="text-right font-normal px-1 py-1">f_y</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id} className="border-t border-border-sub">
                <td className="px-1 py-1 text-text-secondary">{c.id}</td>
                <td className="px-1 py-1 text-right text-text-primary">{dec(c.fx, 2)}</td>
                <td className="px-1 py-1 text-right text-text-primary">{dec(c.fy, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SeismicResults({
  state,
  evaluacion,
}: {
  state: SeismicState;
  evaluacion: SeismicEvaluation;
}) {
  const { emplazamiento: e, aplicabilidad: ap, resultado: r, impedimento: imp } = evaluacion;
  const obl = ap.obligatoriedad;
  const veredicto = imp ? VEREDICTO[imp.motivo] : { status: 'ok' as CheckStatus, tag: 'APLICABLE' };

  return (
    <div className="flex flex-col" aria-label="Resultados" style={ambientStyle(veredicto.status)}>
      {/* ── Cabecera con veredicto, como en todos los módulos ─────────────── */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-main">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
          Resultados calculados
        </span>
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-1.75 py-0.5 rounded tracking-[0.02em] ${TAG_CLS[veredicto.status]}`}
          role="status"
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
          {veredicto.tag}
        </span>
      </div>

      {/* ── Veredicto ─────────────────────────────────────────────────────── */}
      <section>
        <Cabecera titulo="Aplicabilidad" refNorma="art. 1.2.3 · 3.5.1" />
        {/*
          El veredicto sale del `impedimento` que declara la puerta, no de
          deducirlo aquí: un edificio de adobe cumple los seis requisitos del
          art. 3.5.1 y no se calcula igual, porque el art. 1.2.3 prohíbe el
          material. Decir ahí «el método simplificado NO es aplicable» sería
          falso, y la lista de requisitos en verde que viene debajo lo
          desmentiría a la vista.
        */}
        <div
          className={[
            'text-[13px] font-medium pt-1.5 pb-1.5',
            !imp
              ? 'text-state-ok'
              : imp.motivo === 'norma-no-obligatoria'
                ? 'text-text-secondary'
                : imp.motivo === 'obligatoriedad-indeterminada' ||
                    imp.motivo === 'faltan-datos-de-calculo'
                  ? 'text-state-warn'
                  : 'text-state-fail',
          ].join(' ')}
        >
          {!imp
            ? 'La Norma rige y el método simplificado es aplicable'
            : imp.motivo === 'norma-no-obligatoria'
              ? `La Norma no es de aplicación obligatoria — ${MOTIVOS[obl.motivo ?? ''] ?? 'exenta'}`
              : imp.motivo === 'obligatoriedad-indeterminada'
                ? `No se puede decidir todavía: falta ${obl.falta}`
                : imp.motivo === 'prohibicion-art-1.2.3'
                  ? 'La Norma rige y PROHÍBE esta construcción'
                  : imp.motivo === 'faltan-datos-de-calculo'
                    ? 'La Norma rige y el método vale, pero faltan datos para calcular'
                    : 'La Norma rige, pero el método simplificado NO es aplicable'}
        </div>

        {imp?.motivo === 'norma-no-obligatoria' ? (
          <p className="text-[11px] leading-snug text-text-disabled">
            Que no sea obligatoria no impide calcular la acción sísmica si el proyectista quiere
            hacerlo; lo que no hay es obligación de justificarla.
          </p>
        ) : null}

        {imp?.motivo === 'prohibicion-art-1.2.3' || imp?.motivo === 'faltan-datos-de-calculo' ? (
          <p className="text-[11px] leading-snug text-state-fail border-l-2 border-state-fail pl-2">
            {imp.texto}
          </p>
        ) : null}

        <Avisos avisos={obl.avisos} />

        {ap.metodoSimplificado ? (
          <div className="mt-2 pt-2 border-t border-border-sub">
            <div className="flex items-baseline justify-between pb-1">
              <span className="text-[11px] text-text-secondary">Requisitos del art. 3.5.1</span>
              {ap.metodoSimplificado.via ? (
                <span className="text-[10px] font-mono text-text-disabled">
                  {ap.metodoSimplificado.via === 'pasarela-4-plantas' ? 'pasarela ≤4 plantas' : 'seis requisitos'}
                </span>
              ) : null}
            </div>
            <Requisitos reqs={ap.metodoSimplificado.requisitos} />
            {ap.metodoSimplificado.bloqueo ? (
              <p className="mt-2 text-[11px] leading-snug text-state-fail border-l-2 border-state-fail pl-2">
                {ap.metodoSimplificado.bloqueo}
              </p>
            ) : null}
            <Avisos avisos={ap.metodoSimplificado.avisos} />
          </div>
        ) : null}
      </section>

      {/* ── Emplazamiento y masa, a dos columnas en pantalla ancha ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 items-start">
        <section>
          <Cabecera titulo="Emplazamiento" refNorma="art. 2.2 · 2.3" />
          <Fila k="Municipio" v={state.municipioNombre || 'entrada manual'} />
          <Fila k="ab" sub="Anejo 1" v={`${dec(e.ab, 2)} g`} />
          <Fila k="K" sub="contribución" v={dec(e.K, 1)} />
          <Fila k="ρ" sub="riesgo" v={dec(e.rho, 1)} />
          <Fila k="C" sub="terreno" v={dec(e.C, 2)} />
          <Fila k="S" sub="amplificación" v={dec(e.S, 4)} />
          <Fila k="ac" sub="S · ρ · ab" v={`${dec(e.ac, 4)} g`} />
          <Fila k="T_A" sub="esquina del espectro elástico" v={`${dec(e.TA, 3)} s`} />
          <Fila k="T_B" sub="decide la rama de α" v={`${dec(e.TB, 3)} s`} />
        </section>

        {r ? (
          <section>
            <Cabecera titulo="Masa sísmica" refNorma="art. 3.2" />
            <Fila k="Peso sísmico" sub="Σ P_k" v={`${n0(r.pesoSismico)} kN`} />
            <Fila k="ν" sub="amortiguamiento" v={dec(r.nu, 3)} />
            <Fila k="β" sub="ν / μ" v={dec(r.beta, 3)} />
          </section>
        ) : null}
      </div>

      {r ? (
        <>
          {/* Las dos direcciones en paralelo: son la misma estructura y se leen
              comparándolas. En panel estrecho vuelven a apilarse. */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 items-start">
            <Direccion eje="X" d={r.x} />
            <Direccion eje="Y" d={r.y} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 items-start">
            <Direccionales casos={r.direccionales} />

            {/* ── Límite de alcance ─────────────────────────────────────── */}
            <section>
              <Cabecera titulo="Hasta aquí llega el módulo" />
              <p className="text-[11px] leading-snug text-text-secondary pt-1.5">
                Entra emplazamiento, cargas, estructura y planos resistentes. Sale{' '}
                <span className="font-mono">F_k</span>, <span className="font-mono">V_k</span>, el
                cortante basal, <span className="font-mono">f_kj</span> con torsión y las ocho
                combinaciones direccionales.{' '}
                <strong className="text-text-primary">
                  El módulo termina en la fuerza que le toca a cada plano resistente.
                </strong>
              </p>
              <p className="text-[11px] leading-snug text-text-disabled mt-1.5">
                Lo que NO hace: esfuerzos <span className="font-mono">N/V/M</span> por pilar,
                comprobación de secciones y ductilidad del cap. 4. Eso es otro cálculo.
              </p>
            </section>
          </div>

          <Avisos avisos={r.avisos} />
        </>
      ) : (
        <section>
          <Cabecera
            titulo="Sin cálculo"
            {...(imp?.articulo ? { refNorma: `art. ${imp.articulo}` } : {})}
          />
          <p className="text-[11px] leading-snug text-text-secondary pt-1.5">
            {imp?.texto ??
              'No se calcula la acción sísmica mientras alguna de las dos puertas lo impida.'}
          </p>
          <p className="text-[11px] leading-snug text-text-disabled mt-1.5">
            {imp?.motivo === 'faltan-datos-de-calculo'
              ? 'En cuanto haya período fundamental, el resultado aparece aquí.'
              : 'Resuelve lo que marca el bloque de aplicabilidad y el resultado aparece aquí.'}
          </p>
        </section>
      )}
    </div>
  );
}
