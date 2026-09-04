/**
 * M0 y M1 — de qué es la estructura, y los datos generales.
 *
 * M0 poda: lo que no se marca desaparece del formulario Y del documento. Sólo
 * se ven campos que se van a imprimir.
 *
 * M1 es la capa de estudio: lo que no cambia entre obras del mismo despacho. Es
 * editable, pero no pide confirmación en cada obra nueva — ese es justo el
 * reparto que evita la fatiga de confirmación.
 */

import { CONTROL_EJECUCION_OPCIONES, RESISTENCIA_FUEGO_OPCIONES } from './catalogos';
import type { MaterialesState, PerfilEstudio as Perfil } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

const CEMENTOS: { id: Perfil['cemento']; etiqueta: string }[] = [
  { id: 'CEM I', etiqueta: 'CEM I — portland puro' },
  { id: 'CEM II/A-D', etiqueta: 'CEM II/A-D — con humo de sílice' },
  { id: 'CEM II/A-S', etiqueta: 'CEM II/A-S — con escoria (poca)' },
  { id: 'CEM II/A-P', etiqueta: 'CEM II/A-P — con puzolana (poca)' },
  { id: 'CEM II/A-V', etiqueta: 'CEM II/A-V — con cenizas volantes (pocas)' },
  { id: 'CEM II/B-S', etiqueta: 'CEM II/B-S — con escoria (el habitual)' },
  { id: 'CEM II/B-P', etiqueta: 'CEM II/B-P — con puzolana' },
  { id: 'CEM II/B-V', etiqueta: 'CEM II/B-V — con cenizas volantes' },
  { id: 'CEM III/A', etiqueta: 'CEM III/A — de horno alto' },
  { id: 'CEM III/B', etiqueta: 'CEM III/B — de horno alto (alto contenido)' },
  { id: 'CEM IV', etiqueta: 'CEM IV — puzolánico' },
  { id: 'CEM V', etiqueta: 'CEM V — compuesto' },
];

interface Props {
  state: MaterialesState;
  ayuda: boolean;
  onMaterial: (
    cambio: Partial<
      Pick<MaterialesState, 'usaHormigon' | 'usaAceroEstructural' | 'usaMadera' | 'resistenciaFuego'>
    >,
  ) => void;
  onEstudio: (cambio: Partial<Perfil>) => void;
}

function Conmutador({
  activo,
  etiqueta,
  onToggle,
}: {
  activo: boolean;
  etiqueta: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={activo}
      className={[
        'rounded px-3 py-1 text-[12px] font-medium transition-colors',
        activo
          ? 'border border-accent/40 bg-accent/15 text-accent'
          : 'border border-border-main bg-bg-elevated text-text-disabled hover:text-text-secondary',
      ].join(' ')}
    >
      {etiqueta}
    </button>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-text-secondary">{etiqueta}</span>
      {children}
    </label>
  );
}

export function PerfilEstudio({ state, ayuda, onMaterial, onEstudio }: Props) {
  const e = state.estudio;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <section className="rounded border border-border-main bg-bg-surface">
        <header className="flex items-center gap-3 border-b border-border-main px-4 py-2.5">
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">
            M0
          </span>
          <h2 className="text-[13px] font-semibold text-text-primary">
            ¿De qué es la estructura?
          </h2>
        </header>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          <Conmutador
            activo={state.usaHormigon}
            etiqueta="Hormigón"
            onToggle={() => onMaterial({ usaHormigon: !state.usaHormigon })}
          />
          <Conmutador
            activo={state.usaAceroEstructural}
            etiqueta="Acero estructural"
            onToggle={() => onMaterial({ usaAceroEstructural: !state.usaAceroEstructural })}
          />
          <Conmutador
            activo={state.usaMadera}
            etiqueta="Madera"
            onToggle={() => onMaterial({ usaMadera: !state.usaMadera })}
          />
        </div>
        <div className="px-4 pb-3">
          <Fila etiqueta="Resistencia al fuego exigida (DB SI 6)">
            <select
              value={state.resistenciaFuego ?? ''}
              aria-label="Resistencia al fuego"
              className={INPUT}
              onChange={(ev) =>
                onMaterial({
                  resistenciaFuego: ev.target.value === '' ? null : Number(ev.target.value),
                })
              }
            >
              <option value="">Sin indicar</option>
              {RESISTENCIA_FUEGO_OPCIONES.map((r) => (
                <option key={r} value={r}>
                  R{r}
                </option>
              ))}
            </select>
          </Fila>
        </div>
        {ayuda && (
          <p className="px-4 pb-3 text-[11px] leading-snug text-text-disabled">
            Marque lo que lleva esta obra. El hormigón está casi siempre, aunque sólo sea la
            cimentación; acero y madera, según el proyecto. Lo que no se marca desaparece del
            formulario y del documento. La resistencia al fuego la fija el DB SI según el uso y la
            altura del edificio: sólo se imprime si la indica, y el cuadro aclara que puede
            cumplirse por la propia sección o con protecciones añadidas, sin comprometer una u otra.
          </p>
        )}
      </section>

      <section className="rounded border border-border-main bg-bg-surface">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">
            M1
          </span>
          <h2 className="text-[13px] font-semibold text-text-primary">Datos generales</h2>
        </header>

        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fila etiqueta="Acero corrugado">
            <select
              value={e.aceroPasivo}
              className={INPUT}
              onChange={(ev) => onEstudio({ aceroPasivo: ev.target.value as Perfil['aceroPasivo'] })}
            >
              <option value="B500SD">B 500 SD — alta ductilidad</option>
              <option value="B500S">B 500 S</option>
              <option value="B400SD">B 400 SD</option>
              <option value="B400S">B 400 S</option>
            </select>
          </Fila>

          <Fila etiqueta="Mallazo">
            <select
              value={e.malla ?? ''}
              className={INPUT}
              onChange={(ev) =>
                onEstudio({ malla: ev.target.value === '' ? null : (ev.target.value as Perfil['malla']) })
              }
            >
              <option value="ME-500 T">ME-500 T</option>
              <option value="ME-500 SD">ME-500 SD</option>
              <option value="">Sin mallazo</option>
            </select>
          </Fila>

          <Fila etiqueta="Acero estructural">
            <select
              value={e.aceroEstructural}
              className={INPUT}
              onChange={(ev) =>
                onEstudio({ aceroEstructural: ev.target.value as Perfil['aceroEstructural'] })
              }
            >
              <option value="S275JR">S275 JR</option>
              <option value="S235JR">S235 JR</option>
              <option value="S355JR">S355 JR</option>
              <option value="S355J2">S355 J2</option>
            </select>
          </Fila>

          <Fila etiqueta="Tipo de cemento">
            <select
              value={e.cemento}
              className={INPUT}
              onChange={(ev) => onEstudio({ cemento: ev.target.value as Perfil['cemento'] })}
            >
              {CEMENTOS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </Fila>

          <Fila etiqueta="Tamaño máximo del árido">
            <select
              value={e.tamMaxArido}
              className={INPUT}
              onChange={(ev) => onEstudio({ tamMaxArido: Number(ev.target.value) })}
            >
              {[10, 12, 20, 25, 40].map((v) => (
                <option key={v} value={v}>
                  {v} mm
                </option>
              ))}
            </select>
          </Fila>

          <Fila etiqueta="Vida útil de proyecto">
            <select
              value={e.vidaUtil}
              className={INPUT}
              onChange={(ev) => {
                const v = Number(ev.target.value) === 100 ? 100 : 50;
                onEstudio({ vidaUtil: v, vidaUtilAnios: v });
              }}
            >
              <option value={50}>50 años — edificación</option>
              <option value={100}>100 años — obra singular</option>
            </select>
          </Fila>

          <Fila etiqueta="Control del hormigón">
            <select
              value={e.nivelControlHormigon}
              className={INPUT}
              onChange={(ev) =>
                onEstudio({ nivelControlHormigon: ev.target.value as Perfil['nivelControlHormigon'] })
              }
            >
              <option value="estadistico">Estadístico</option>
              <option value="indirecto">Indirecto</option>
              <option value="100_por_100">100 por 100</option>
            </select>
          </Fila>

          <Fila etiqueta="Control de ejecución">
            <select
              value={e.nivelControlEjecucion}
              className={INPUT}
              onChange={(ev) =>
                onEstudio({
                  nivelControlEjecucion: ev.target.value as Perfil['nivelControlEjecucion'],
                })
              }
            >
              {CONTROL_EJECUCION_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Fila>
        </div>

        {ayuda && (
          <p className="px-4 pb-3 text-[11px] leading-snug text-text-disabled">
            El <b>control de ejecución</b> decide el margen que se suma al recubrimiento mínimo (10,
            5 o 0 mm). El <b>tipo de cemento</b> cambia el recubrimiento exigido: no es un detalle
            de pliego, mueve los milímetros del plano.
          </p>
        )}
      </section>
    </div>
  );
}
