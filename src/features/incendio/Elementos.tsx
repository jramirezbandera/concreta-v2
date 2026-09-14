/**
 * Los elementos estructurales, y hasta dónde aguanta cada sección.
 *
 * La segunda mitad del módulo. Arriba se dice QUÉ hay que aguantar; aquí, si la
 * sección aguanta sola —«por su propia configuración», que es la primera vía
 * del SI 6 § 3.1— o si hay que protegerla, y cuánto le falta.
 *
 * Una ficha por elemento y no una tabla, por lo mismo que los sectores: cada
 * tipo de elemento teclea cosas distintas —un soporte no tiene alma, una losa
 * en dos direcciones tiene relación de luces— y en una tabla habría que enseñar
 * columnas que casi siempre sobran.
 *
 * El resultado se enseña SIEMPRE, aunque falten datos: entonces dice qué falta.
 * Es la misma regla que en el resto del módulo —no se inventa un número— y aquí
 * importa más que en ningún sitio, porque una R declarada de más en una memoria
 * firmada no la corrige nadie.
 */

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MenuAnadir } from '../../components/ui/MenuAnadir';
import {
  TIPOS_HORMIGON,
  type EntradaHormigon,
  type TipoHormigon,
} from '../../lib/incendio/anejoC';
import {
  MODOS_CALENTAMIENTO,
  ROTULOS_PERFIL,
  TIPOS_ACERO,
  type EntradaAcero,
  type ModoCalentamiento,
  type TipoAcero,
} from '../../lib/incendio/anejoD';
import type {
  ElementoEntrada,
  ElementoResuelto,
  EntradaProteccion,
} from '../../lib/incendio/elementos';
import { familiaPorId, familiasDe } from '../../lib/incendio/protecciones';
import type { SectorResuelto } from '../../lib/incendio/sectores';
import { RESISTENCIA_FUEGO_OPCIONES } from './catalogos';
import { Campo } from './Campo';
import { AYUDA, DERIVADO, FONDO_HUECO, INPUT, ROTULO } from './estilos';

interface Props {
  elementos: ElementoEntrada[];
  resueltos: ElementoResuelto[];
  sectores: SectorResuelto[];
  ayuda: boolean;
  onCambiar: (id: string, cambio: Partial<ElementoEntrada>) => void;
  onBorrar: (id: string) => void;
  onAnadir: (nombre: string) => void;
}

/** Nombres habituales, para el menú de añadir. */
const NOMBRES = ['Soportes', 'Vigas', 'Forjado', 'Losa de escalera', 'Muro de sótano', 'Jácenas metálicas'];

const CASILLA = 'flex items-center gap-1.5 text-[11px] text-text-secondary';

/** Los tipos de hormigón que llevan alma, relación de luces o entrevigado. */
const CON_ALMA: readonly TipoHormigon[] = ['vigaTresCaras', 'vigaTodasCaras', 'forjadoUnidireccional'];
const ES_SOPORTE: readonly TipoHormigon[] = ['soporte'];
const ES_LOSA_O_FORJADO: readonly TipoHormigon[] = [
  'losaUnaDireccion',
  'losaDosDirecciones',
  'forjadoBidireccional',
  'forjadoUnidireccional',
];

function Casilla({
  marcado,
  aria,
  texto,
  detalle,
  onCambiar,
}: {
  marcado: boolean;
  aria: string;
  texto: string;
  detalle?: string;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <label className={CASILLA}>
      <input type="checkbox" checked={marcado} aria-label={aria} onChange={(e) => onCambiar(e.target.checked)} />
      {texto} {detalle && <span className="text-text-disabled">{detalle}</span>}
    </label>
  );
}

/**
 * Con qué se protege, cuando no llega por su propia sección.
 *
 * Va aquí, pegado al veredicto, y no detrás de «Afinar»: es la decisión que
 * sigue a «necesita protección», y esconderla dejaría al proyectista con un
 * d/λp en la mano y sin saber si eso son 18 mm o 60.
 */
function Proteccion({
  d,
  r,
  nombre,
  onCambiar,
}: {
  d: EntradaProteccion;
  r: ElementoResuelto;
  nombre: string;
  onCambiar: (c: Partial<EntradaProteccion>) => void;
}) {
  const familias = familiasDe(r.material);
  const elegida = familiaPorId(d.familia);
  // Sólo las familias sin λ tabulado piden el del producto; en las que el
  // D.2.1 autoriza el de 20 ºC, preguntarlo sería ruido.
  const pideLambda = elegida !== undefined && elegida.lambda === null && elegida.vehiculo === 'aislante';

  return (
    <div className="mt-1.5 flex flex-wrap items-end gap-2 rounded bg-bg-elevated px-2 py-1.5">
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase text-text-disabled">Se protege con</span>
        <select
          value={d.familia}
          aria-label={`Protección de ${nombre}`}
          className={`${INPUT} max-w-[250px]`}
          onChange={(e) => onCambiar({ familia: e.target.value })}
        >
          <option value="">— sin concretar —</option>
          {familias.map((f) => (
            <option key={f.id} value={f.id}>
              {f.etiqueta}
            </option>
          ))}
        </select>
      </label>
      {pideLambda && (
        <Campo
          rotulo="λp"
          simbolo
          unidad="W/mK"
          valor={d.lambda}
          paso="0.01"
          requerido
          aria={`Conductividad declarada del revestimiento de ${nombre}`}
          onCambiar={(lambda) => onCambiar({ lambda })}
        />
      )}
      {r.proteccion?.espesor != null && (
        <span className={`${DERIVADO} pb-1`} title={r.proteccion.cuenta}>
          {r.proteccion.espesor.toString().replace('.', ',')} mm
        </span>
      )}
    </div>
  );
}

/** El veredicto: la línea que el proyectista mira antes que nada. */
function Veredicto({ r }: { r: ElementoResuelto }) {
  if (r.via === 'sinResolver') {
    const falta = r.hormigon?.faltan ?? r.acero?.faltan ?? [];
    return (
      <p className="pt-1.5 text-[11px] leading-snug text-text-disabled">
        {r.exigida === null && falta.length === 0
          ? 'Sin R exigida: elija un sector o indíquela a mano.'
          : falta.length > 0
            ? `Falta ${falta.join(', ')}.`
            : 'La tabla no resuelve este caso; vea los avisos.'}
      </p>
    );
  }
  const propia = r.via === 'propia';
  return (
    <p className="pt-1.5 text-[11px] leading-snug">
      <span style={{ color: propia ? 'var(--color-state-pass)' : 'var(--color-state-warn)' }}>
        {propia ? 'Aguanta por su propia sección' : 'Necesita protección'}
      </span>
      <span className="text-text-disabled">
        {' · '}
        {propia ? r.justificacion : r.loQueFalta}
      </span>
      {r.alcanza !== null && (
        <span className="text-text-disabled">
          {' · '}
          {r.material === 'acero' ? 'desnudo llega a' : 'alcanza'} R {r.alcanza}
        </span>
      )}
    </p>
  );
}

/** Lo del hormigón: los anejos C.2 a C.5. */
function Hormigon({
  d,
  r,
  nombre,
  afinar,
  onCambiar,
}: {
  d: EntradaHormigon;
  r: ElementoResuelto | undefined;
  nombre: string;
  afinar: boolean;
  onCambiar: (c: Partial<EntradaHormigon>) => void;
}) {
  const def = TIPOS_HORMIGON.find((t) => t.id === d.tipo);
  const am = r?.am ?? null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-1.5">
        <select
          value={d.tipo}
          aria-label={`Tipo de ${nombre}`}
          className={`${INPUT} max-w-[250px]`}
          onChange={(e) => onCambiar({ tipo: e.target.value as TipoHormigon })}
        >
          {TIPOS_HORMIGON.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 pt-1.5">
        <Campo
          rotulo={def?.rotuloB ?? 'b'}
          unidad="mm"
          valor={d.b}
          paso="5"
          requerido
          aria={`${def?.rotuloB ?? 'Dimensión'} de ${nombre}`}
          onCambiar={(b) => onCambiar({ b })}
        />
        <Campo
          rotulo={ES_LOSA_O_FORJADO.includes(d.tipo) ? 'Espesor' : 'Canto'}
          unidad="mm"
          valor={d.h}
          paso="5"
          aria={`Canto de ${nombre}`}
          onCambiar={(h) => onCambiar({ h })}
        />
        {CON_ALMA.includes(d.tipo) && (
          <Campo
            rotulo="Alma b₀"
            simbolo
            unidad="mm"
            valor={d.b0}
            paso="5"
            aria={`Ancho del alma de ${nombre}`}
            onCambiar={(b0) => onCambiar({ b0 })}
          />
        )}
      </div>

      {/* La distancia al eje: donde está el error clásico del anejo C. */}
      <div className="flex flex-wrap items-end gap-2 pt-1.5">
        <Campo
          rotulo="Recubr."
          unidad="mm"
          valor={d.rnom}
          paso="5"
          requerido={d.ejeManual === null}
          aria={`Recubrimiento nominal de ${nombre}`}
          onCambiar={(rnom) => onCambiar({ rnom })}
        />
        <Campo
          rotulo="ø cerco"
          simbolo
          unidad="mm"
          valor={d.dCerco === 0 ? null : d.dCerco}
          paso="1"
          aria={`Diámetro del cerco de ${nombre}`}
          onCambiar={(v) => onCambiar({ dCerco: v ?? 0 })}
        />
        <Campo
          rotulo="ø barra"
          simbolo
          unidad="mm"
          valor={d.dBarra}
          paso="1"
          requerido={d.ejeManual === null}
          aria={`Diámetro de la armadura de ${nombre}`}
          onCambiar={(dBarra) => onCambiar({ dBarra })}
        />
        {am !== null && (
          <span className={`${DERIVADO} pb-1`} title={r?.amCuenta}>
            am = {am} mm
          </span>
        )}
      </div>
      {r?.amCuenta !== '' && r?.amCuenta !== undefined && (
        <p className="pt-0.5 text-[10.5px] leading-tight text-text-disabled">{r.amCuenta}</p>
      )}

      {afinar && (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-border-sub pt-1.5">
          <div className="flex flex-wrap gap-2">
            <Campo
              rotulo="μfi"
              simbolo
              unidad=""
              valor={d.mufi}
              paso="0.05"
              aria={`Coeficiente de sobredimensionado de ${nombre}`}
              onCambiar={(mufi) => onCambiar({ mufi })}
            />
            <Campo
              rotulo="as"
              simbolo
              unidad="mm"
              valor={d.ejeManual}
              paso="1"
              aria={`Distancia al eje de ${nombre}`}
              onCambiar={(ejeManual) => onCambiar({ ejeManual })}
            />
            {d.tipo === 'losaDosDirecciones' && (
              <Campo
                rotulo="ly/lx"
                simbolo
                unidad=""
                valor={d.relacionLuces}
                paso="0.1"
                aria={`Relación de luces de ${nombre}`}
                onCambiar={(relacionLuces) => onCambiar({ relacionLuces })}
              />
            )}
          </div>
          <Casilla
            marcado={d.aridoCalizo}
            aria={`Áridos calizos en ${nombre}`}
            texto="áridos calizos"
            detalle={def?.calizaAplica ? '(−10 %, C.2.1.3)' : '(sin efecto en este tipo)'}
            onCambiar={(aridoCalizo) => onCambiar({ aridoCalizo })}
          />
          <Casilla
            marcado={d.compartimenta}
            aria={`${nombre} compartimenta`}
            texto="separa sectores (E e I)"
            detalle="manda también el espesor"
            onCambiar={(compartimenta) => onCambiar({ compartimenta })}
          />
          {d.mufi !== null && (
            <Casilla
              marcado={d.cargaUniforme}
              aria={`Cargas uniformes en ${nombre}`}
              texto="cargas sensiblemente uniformes"
              detalle="lo pide la C.1 para μfi < 0,60"
              onCambiar={(cargaUniforme) => onCambiar({ cargaUniforme })}
            />
          )}
          {(d.tipo === 'vigaTresCaras' || d.tipo === 'vigaTodasCaras') && (
            <Casilla
              marcado={d.esquinaUnaCapa}
              aria={`Armadura de esquina en una capa en ${nombre}`}
              texto="armadura de esquina en una sola capa"
              detalle="(llamada 1 de la C.1)"
              onCambiar={(esquinaUnaCapa) => onCambiar({ esquinaUnaCapa })}
            />
          )}
          {ES_SOPORTE.includes(d.tipo) && (
            <>
              <Casilla
                marcado={d.ejecutadoEnObra}
                aria={`${nombre} hormigonado en obra`}
                texto="hormigonado en obra"
                detalle="(mínimo 250 mm)"
                onCambiar={(ejecutadoEnObra) => onCambiar({ ejecutadoEnObra })}
              />
              <Casilla
                marcado={d.cuantiaAlta}
                aria={`Cuantía superior al 2 % en ${nombre}`}
                texto="armadura por encima del 2 %"
                onCambiar={(cuantiaAlta) => onCambiar({ cuantiaAlta })}
              />
            </>
          )}
          {ES_LOSA_O_FORJADO.includes(d.tipo) && (
            <Casilla
              marcado={d.apoyosPuntuales}
              aria={`${nombre} sobre apoyos puntuales`}
              texto="sobre apoyos puntuales"
              onCambiar={(apoyosPuntuales) => onCambiar({ apoyosPuntuales })}
            />
          )}
          {d.tipo === 'forjadoUnidireccional' && (
            <Casilla
              marcado={d.entrevigadoProtegido}
              aria={`Entrevigado cerámico con revestimiento en ${nombre}`}
              texto="entrevigado cerámico o de hormigón con revestimiento inferior"
              onCambiar={(entrevigadoProtegido) => onCambiar({ entrevigadoProtegido })}
            />
          )}
          <Casilla
            marcado={d.traccionado}
            aria={`${nombre} traccionado`}
            texto="traccionado"
            detalle="(se comprueba como acero revestido)"
            onCambiar={(traccionado) => onCambiar({ traccionado })}
          />
        </div>
      )}
    </>
  );
}

/** Lo del acero: la tabla D.1. */
function Acero({
  d,
  r,
  nombre,
  afinar,
  onCambiar,
}: {
  d: EntradaAcero;
  r: ElementoResuelto | undefined;
  nombre: string;
  afinar: boolean;
  onCambiar: (c: Partial<EntradaAcero>) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-1.5">
        <select
          value={d.tipo}
          aria-label={`Tipo de ${nombre}`}
          className={`${INPUT} max-w-[190px]`}
          onChange={(e) => onCambiar({ tipo: e.target.value as TipoAcero })}
        >
          {TIPOS_ACERO.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </select>
        <select
          value={d.perfil}
          aria-label={`Perfil de ${nombre}`}
          className={`${INPUT} max-w-[120px]`}
          onChange={(e) => onCambiar({ perfil: e.target.value })}
        >
          <option value="">— perfil —</option>
          {ROTULOS_PERFIL.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1.5">
        <select
          value={d.modo}
          aria-label={`Cómo se calienta ${nombre}`}
          className={`${INPUT} max-w-[280px]`}
          onChange={(e) => onCambiar({ modo: e.target.value as ModoCalentamiento })}
        >
          {MODOS_CALENTAMIENTO.map((m) => (
            <option key={m.id} value={m.id}>
              {m.etiqueta}
            </option>
          ))}
        </select>
        {r?.masividad !== null && r?.masividad !== undefined && (
          <span className={DERIVADO} title={r.acero?.cuentaMasividad}>
            Am/V = {r.masividad} m⁻¹
          </span>
        )}
      </div>
      {r?.dLambda !== null && r?.dLambda !== undefined && r.dLambda > 0 && (
        <p className="pt-1 text-[11px] text-text-secondary">
          d/λp ={' '}
          <span className={DERIVADO}>{r.dLambda.toFixed(2).replace('.', ',')} m²K/W</span>{' '}
          <span className="text-text-disabled">para la R exigida</span>
        </p>
      )}

      {afinar && (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-border-sub pt-1.5">
          <div className="flex flex-wrap gap-2">
            <Campo
              rotulo="μfi"
              simbolo
              unidad=""
              valor={d.mufi}
              paso="0.05"
              aria={`Coeficiente de sobredimensionado de ${nombre}`}
              onCambiar={(mufi) => onCambiar({ mufi })}
            />
            <Campo
              rotulo="Am/V"
              simbolo
              unidad="m⁻¹"
              valor={d.masividadManual}
              paso="1"
              aria={`Masividad de ${nombre}`}
              onCambiar={(masividadManual) => onCambiar({ masividadManual })}
            />
            {d.revestidoFabrica && (
              <Campo
                rotulo="R fábrica"
                simbolo
                unidad="min"
                valor={d.rFabrica}
                paso="30"
                aria={`Resistencia al fuego de la fábrica de ${nombre}`}
                onCambiar={(rFabrica) => onCambiar({ rFabrica })}
              />
            )}
          </div>
          <Casilla
            marcado={d.clase4}
            aria={`Sección de clase 4 en ${nombre}`}
            texto="sección de clase 4"
            detalle="(pared delgada)"
            onCambiar={(clase4) => onCambiar({ clase4 })}
          />
          {d.tipo === 'soporte' && (
            <>
              <Casilla
                marcado={d.arriostrado}
                aria={`${nombre} cumple las condiciones del D.2.2.1.2`}
                texto="estructura arriostrada, sector de una planta y Lp ≥ 0,7·h"
                onCambiar={(arriostrado) => onCambiar({ arriostrado })}
              />
              <Casilla
                marcado={d.revestidoFabrica}
                aria={`${nombre} revestido de fábrica`}
                texto="revestido de fábrica en todo el contorno"
                detalle="(D.2.2.1.1)"
                onCambiar={(revestidoFabrica) => onCambiar({ revestidoFabrica })}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}

export function Elementos({ elementos, resueltos, sectores, ayuda, onCambiar, onBorrar, onAnadir }: Props) {
  const [afinar, setAfinar] = useState<Record<string, boolean>>({});
  const conNombre = sectores.filter((s) => s.nombre !== '');

  return (
    <section className="border-b border-border-sub px-1 py-4">
      <p className={ROTULO}>Elementos estructurales</p>

      {elementos.length === 0 ? (
        <p className="pb-2 text-[12px] text-text-disabled">
          Sin elementos, la memoria enuncia la R exigida y deja abiertas las dos vías: la propia
          sección o los productos de protección.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {elementos.map((e) => {
            const r = resueltos.find((x) => x.id === e.id);
            const abierto = afinar[e.id] === true;
            const nombre = e.nombre.trim() || 'el elemento sin nombre';
            return (
              <div
                key={e.id}
                className="rounded border border-border-sub px-2.5 py-2"
                style={r?.hueco ? FONDO_HUECO : undefined}
              >
                <div className="flex items-center gap-2">
                  <input
                    value={e.nombre}
                    placeholder="Nombre del elemento…"
                    aria-label="Nombre del elemento"
                    className={INPUT}
                    onChange={(ev) => onCambiar(e.id, { nombre: ev.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => onBorrar(e.id)}
                    aria-label={`Quitar ${e.nombre || 'el elemento sin nombre'}`}
                    className="shrink-0 text-text-disabled transition-colors hover:text-state-fail"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>

                {/* De dónde sale la R que se le exige, y de qué está hecho. */}
                <div className="flex flex-wrap items-center gap-2 pt-1.5">
                  <select
                    value={e.sectorId}
                    aria-label={`Sector de ${nombre}`}
                    className={`${INPUT} max-w-[170px]`}
                    onChange={(ev) => onCambiar(e.id, { sectorId: ev.target.value })}
                  >
                    <option value="">— sector —</option>
                    {conNombre.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                  <select
                    value={e.exigidaManual ?? ''}
                    aria-label={`Resistencia exigida a ${nombre}`}
                    className={`${INPUT} max-w-[130px]`}
                    onChange={(ev) =>
                      onCambiar(e.id, {
                        exigidaManual: ev.target.value === '' ? null : Number(ev.target.value),
                      })
                    }
                  >
                    <option value="">
                      {r?.exigida !== null && r?.exigida !== undefined
                        ? `R${r.exigida} (sector)`
                        : '— R exigida —'}
                    </option>
                    {RESISTENCIA_FUEGO_OPCIONES.map((v) => (
                      <option key={v} value={v}>
                        R{v}
                      </option>
                    ))}
                  </select>
                  <select
                    value={e.material}
                    aria-label={`Material de ${nombre}`}
                    className={`${INPUT} max-w-[110px]`}
                    onChange={(ev) =>
                      onCambiar(e.id, { material: ev.target.value === 'acero' ? 'acero' : 'hormigon' })
                    }
                  >
                    <option value="hormigon">Hormigón</option>
                    <option value="acero">Acero</option>
                  </select>
                </div>

                {e.material === 'hormigon' ? (
                  <Hormigon
                    d={e.hormigon}
                    r={r}
                    nombre={nombre}
                    afinar={abierto}
                    onCambiar={(c) => onCambiar(e.id, { hormigon: { ...e.hormigon, ...c } })}
                  />
                ) : (
                  <Acero
                    d={e.acero}
                    r={r}
                    nombre={nombre}
                    afinar={abierto}
                    onCambiar={(c) => onCambiar(e.id, { acero: { ...e.acero, ...c } })}
                  />
                )}

                {r && <Veredicto r={r} />}
                {r?.via === 'proteccion' && (
                  <Proteccion
                    d={e.proteccion}
                    r={r}
                    nombre={nombre}
                    onCambiar={(c) => onCambiar(e.id, { proteccion: { ...e.proteccion, ...c } })}
                  />
                )}

                <button
                  type="button"
                  className="pt-1 text-[11px] text-text-disabled underline-offset-2 hover:underline"
                  onClick={() => setAfinar((p) => ({ ...p, [e.id]: !abierto }))}
                >
                  {abierto ? 'Ocultar el detalle' : 'Afinar la comprobación'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
        <MenuAnadir
          etiqueta="+ Añadir elemento"
          nombres={NOMBRES}
          etiquetaLibre="Otro elemento… (en blanco)"
          onElegir={onAnadir}
        />
        {ayuda && (
          <span className={AYUDA}>
            Cada elemento se comprueba por las tablas de los anejos C (hormigón) y D (acero).
          </span>
        )}
      </div>
    </section>
  );
}
