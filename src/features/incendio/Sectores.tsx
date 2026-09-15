/**
 * Los sectores de incendio, de los que sale la R por la tabla 3.1.
 *
 * Una ficha por sector en vez de una tabla: las llamadas al pie de la tabla
 * 3.1 sólo aplican a algunos usos —el aparcamiento robotizado, la unifamiliar
 * adosada— y en una tabla habría que enseñar columnas que casi siempre sobran.
 *
 * La R que sale de la tabla se enseña SIEMPRE, y siempre se puede pisar. Si se
 * pisa, el documento dice que la declaró el proyectista: en una memoria firmada
 * hay que poder distinguir lo que dice la norma de lo que decidió alguien.
 */

import { Trash2 } from 'lucide-react';
import { MenuAnadir } from '../../components/ui/MenuAnadir';
import {
  claseRegla,
  claseRiesgo,
  claseUso,
  datosAnejoBIniciales,
  type DatosAnejoB,
  type SectorResuelto,
} from '../../lib/incendio/sectores';
import { ETIQUETA_RIESGO, REGLAS_SUELTAS, USOS_DB_SI } from '../../lib/incendio/tabla31';
import { RESISTENCIA_FUEGO_OPCIONES } from './catalogos';
import { TiempoEquivalente } from './TiempoEquivalente';
import { AYUDA, FONDO_HUECO, INPUT, ROTULO } from './estilos';
import type { SectorUI } from './state';

interface Props {
  sectores: SectorUI[];
  resueltos: SectorResuelto[];
  ayuda: boolean;
  onCambiar: (id: string, cambio: Partial<SectorUI>) => void;
  onBorrar: (id: string) => void;
  onAnadir: (nombre: string) => void;
}

/** Nombres habituales de sector, para el menú de añadir. */
const NOMBRES = [
  'Plantas sobre rasante',
  'Sótano',
  'Aparcamiento',
  'Garaje',
  'Locales comerciales',
  'Cubierta',
  'Escalera protegida',
];

const CASILLA = 'flex items-center gap-1.5 text-[11px] text-text-secondary';

/**
 * Sólo el nivel bajo lleva ejemplo, y sólo uno: el garaje.
 *
 * «Riesgo especial bajo» es el nombre que le da la tabla 3.2, y no lo busca ahí
 * quien tiene un garaje: acababa dentro del sector de la casa, que es el R 30
 * de la tabla 3.1 donde la norma pide R 90. Los otros dos niveles se dejan
 * limpios a propósito —la tabla 2.1 del DB SI 1 tiene tres docenas de filas y
 * un ejemplo suelto orienta tan mal como ninguno— y la explicación entera vive
 * en la ayuda del tablero, que no compite por el ancho del desplegable.
 */
const EJEMPLO_RIESGO: Record<'bajo' | 'medio' | 'alto', string> = {
  bajo: ' — garaje…',
  medio: '',
  alto: '',
};

export function Sectores({ sectores, resueltos, ayuda, onCambiar, onBorrar, onAnadir }: Props) {
  return (
    <section className="border-b border-border-sub px-1 py-4">
      <p className={ROTULO}>Sectores de incendio</p>

      {sectores.length === 0 ? (
        <p className="pb-2 text-[12px] text-text-disabled">
          Sin sectores: la R no se deduce y hay que indicarla a mano más abajo.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sectores.map((s) => {
            const r = resueltos.find((x) => x.id === s.id);
            const esUso = s.clase.startsWith('uso:');
            const esRiesgo = s.clase.startsWith('riesgo:');
            return (
              <div
                key={s.id}
                className="rounded border border-border-sub px-2.5 py-2"
                style={r?.hueco ? FONDO_HUECO : undefined}
              >
                <div className="flex items-center gap-2">
                  <input
                    value={s.nombre}
                    placeholder="Nombre del sector…"
                    aria-label="Nombre del sector"
                    className={INPUT}
                    onChange={(e) => onCambiar(s.id, { nombre: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => onBorrar(s.id)}
                    aria-label={`Quitar ${s.nombre || 'el sector sin nombre'}`}
                    className="shrink-0 text-text-disabled transition-colors hover:text-state-fail"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1.5">
                  <select
                    value={s.clase}
                    aria-label={`Qué es ${s.nombre || 'el sector sin nombre'}`}
                    className={`${INPUT} max-w-[240px]`}
                    onChange={(e) => onCambiar(s.id, { clase: e.target.value })}
                  >
                    <option value="">— qué es —</option>
                    <optgroup label="Uso del sector (tabla 3.1)">
                      {USOS_DB_SI.map((u) => (
                        <option key={u.id} value={claseUso(u.id)}>
                          {u.etiqueta}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Zona de riesgo especial (tabla 3.2)">
                      {(['bajo', 'medio', 'alto'] as const).map((n) => (
                        <option key={n} value={claseRiesgo(n)}>
                          {ETIQUETA_RIESGO[n]}
                          {EJEMPLO_RIESGO[n]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Casos aparte (§ 3.2 a § 4.2)">
                      {REGLAS_SUELTAS.map((x) => (
                        <option key={x.id} value={claseRegla(x.id)}>
                          {x.etiqueta}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  {/* También en las zonas de riesgo: la llamada (1) de la
                      tabla 3.2 las compara con la estructura de SU planta, y
                      sin decir de qué lado de la rasante están se compararían
                      con las plantas de arriba. Una sala de calderas en el
                      sótano de un aparcamiento saldría R 90 donde toca R 120. */}
                  {(esUso || esRiesgo) && (
                    <label className={CASILLA}>
                      <input
                        type="checkbox"
                        checked={s.sotano}
                        aria-label={`${s.nombre || 'El sector'} está bajo rasante`}
                        onChange={(e) => onCambiar(s.id, { sotano: e.target.checked })}
                      />
                      bajo rasante
                    </label>
                  )}
                </div>

                {/* Las llamadas al pie, sólo donde aplican. */}
                {s.clase === claseUso('aparcamientoBajoOtroUso') && (
                  <label className={`${CASILLA} pt-1.5`}>
                    <input
                      type="checkbox"
                      checked={s.robotizado}
                      aria-label="Aparcamiento robotizado"
                      onChange={(e) => onCambiar(s.id, { robotizado: e.target.checked })}
                    />
                    robotizado <span className="text-text-disabled">(llamada 4: R 180)</span>
                  </label>
                )}
                {s.clase === claseUso('viviendaUnifamiliar') && (
                  <label className={`${CASILLA} pt-1.5`}>
                    <input
                      type="checkbox"
                      checked={s.adosada}
                      aria-label="Estructura común de viviendas adosadas"
                      onChange={(e) => onCambiar(s.id, { adosada: e.target.checked })}
                    />
                    estructura común de adosadas{' '}
                    <span className="text-text-disabled">(llamada 2)</span>
                  </label>
                )}
                {esRiesgo && (
                  <label className={`${CASILLA} pt-1.5`}>
                    <input
                      type="checkbox"
                      checked={s.bajoCubiertaSinRiesgo}
                      aria-label="Bajo cubierta no prevista para evacuación cuyo fallo no compromete nada"
                      onChange={(e) => onCambiar(s.id, { bajoCubiertaSinRiesgo: e.target.checked })}
                    />
                    bajo cubierta sin riesgo <span className="text-text-disabled">(R 30)</span>
                  </label>
                )}

                {/* El Anejo B: sustituye a la tabla, y por eso va ANTES de la R.
                    La casilla sale también con el Anejo B ya encendido aunque
                    la clase no lo admita: reclasificando un sector a «caso
                    aparte» desaparecía y no quedaba forma de apagarlo. */}
                {(esUso || esRiesgo || s.anejoB !== null) && (
                  <label className={`${CASILLA} pt-2`}>
                    <input
                      type="checkbox"
                      checked={s.anejoB !== null}
                      aria-label={`Calcular el tiempo equivalente de ${s.nombre || 'el sector sin nombre'}`}
                      onChange={(e) =>
                        onCambiar(s.id, { anejoB: e.target.checked ? datosAnejoBIniciales() : null })
                      }
                    />
                    calcular el tiempo equivalente{' '}
                    <span className="text-text-disabled">(Anejo B)</span>
                  </label>
                )}
                {s.anejoB !== null && (
                  <TiempoEquivalente
                    datos={s.anejoB}
                    resuelto={r}
                    ayuda={ayuda}
                    nombre={s.nombre || 'el sector sin nombre'}
                    clase={s.clase}
                    onCambiar={(cambio: Partial<DatosAnejoB>) =>
                      onCambiar(s.id, { anejoB: { ...(s.anejoB as DatosAnejoB), ...cambio } })
                    }
                  />
                )}

                {/* La R: la de la tabla o la del Anejo B, y la que se declara. */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="text-[11px] text-text-secondary">R</span>
                  <select
                    value={s.minutosManual ?? ''}
                    aria-label={`Resistencia al fuego de ${s.nombre || 'el sector sin nombre'}`}
                    className={`${INPUT} max-w-[150px]`}
                    onChange={(e) =>
                      onCambiar(s.id, {
                        minutosManual: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">
                      {r?.sinExigencia
                        ? 'sin exigencia (norma)'
                        : r?.derivada !== null && r?.derivada !== undefined
                          ? // De dónde sale la que se enseña: el tiempo equivalente
                            // sólo si SE HA APLICADO. Mirando `s.anejoB` se rotulaba
                            // «(Anejo B)» en un sector reclasificado a caso aparte,
                            // donde la R la pone su apartado y no el Anejo B.
                            `R${r.derivada} (${r.ted ? 'Anejo B' : s.clase.startsWith('regla:') ? 'norma' : 'tabla'})`
                          : '— sin resolver —'}
                    </option>
                    {RESISTENCIA_FUEGO_OPCIONES.map((v) => (
                      <option key={v} value={v}>
                        R{v}
                      </option>
                    ))}
                  </select>
                  {r && r.referencia !== '' && (
                    <span className="text-[10.5px] leading-tight text-text-disabled">
                      {r.aMano ? 'declarado a mano' : `según ${r.referencia}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
        <MenuAnadir
          etiqueta="+ Añadir sector"
          nombres={NOMBRES}
          etiquetaLibre="Otro sector… (en blanco)"
          onElegir={onAnadir}
        />
        {ayuda && (
          <span className={AYUDA}>
            Un sector por cada zona con uso propio. La R sale de la tabla 3.1 y se puede pisar. El
            garaje va SIEMPRE en su propio sector, como riesgo especial bajo: la tabla 2.1 del DB SI
            1 clasifica así el de una vivienda unifamiliar —cualquiera que sea su superficie— y el
            aparcamiento de hasta 100 m², que por debajo de esa superficie no llega al uso
            Aparcamiento (Anejo SI A). Son R 90 por la tabla 3.2, no el R 30 de la vivienda.
          </span>
        )}
      </div>
    </section>
  );
}
