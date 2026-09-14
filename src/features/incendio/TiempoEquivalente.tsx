/**
 * El tiempo equivalente de exposición al fuego de un sector (Anejo B).
 *
 * La alternativa del SI 6 § 3.1.b: en vez de la clase de la tabla 3.1 se
 * declara el tiempo que la estructura tiene que aguantar la curva normalizada,
 * calculado con la geometría del sector y su carga de fuego. Casi siempre sale
 * menos, porque la tabla no sabe si el sector tiene diez metros de ventana o
 * ninguna, ni si hay rociadores.
 *
 * Lo único que hay que teclear sí o sí es la GEOMETRÍA. La actividad de la
 * tabla B.3 y la carga de fuego de la B.6 salen del uso que ya tiene el sector,
 * y la fila de la B.5 de la altura de evacuación del edificio; todo eso se
 * puede pisar desde «Afinar», que es donde van los coeficientes que casi nadie
 * toca.
 */

import { useState } from 'react';
import {
  ACTIVIDADES_B3,
  CONSECUENCIAS_B5,
  ETIQUETA_MATERIAL,
  KB_POR_DEFECTO,
  M_CELULOSICO,
  M_DESCONOCIDO,
  USOS_B6,
  type MaterialSeccion,
} from '../../lib/incendio/anejoB';
import type { DatosAnejoB, SectorResuelto } from '../../lib/incendio/sectores';
import { AYUDA, INPUT } from './estilos';

interface Props {
  datos: DatosAnejoB;
  resuelto: SectorResuelto | undefined;
  ayuda: boolean;
  nombre: string;
  onCambiar: (cambio: Partial<DatosAnejoB>) => void;
}

const CASILLA = 'flex items-center gap-1.5 text-[11px] text-text-secondary';
const NUM = `${INPUT} max-w-[74px]`;
const n2 = (v: number) => v.toFixed(2).replace('.', ',');

/** Un número con su rótulo encima, que es lo que cabe en la columna. */
function Campo({
  rotulo,
  unidad,
  valor,
  aria,
  paso = '0.1',
  requerido = false,
  onCambiar,
}: {
  rotulo: string;
  unidad: string;
  valor: number | null;
  aria: string;
  paso?: string;
  requerido?: boolean;
  onCambiar: (v: number | null) => void;
}) {
  const falta = requerido && (valor === null || valor <= 0);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase text-text-disabled">
        {rotulo} <span className="normal-case">{unidad}</span>
      </span>
      <input
        type="number"
        step={paso}
        min="0"
        value={valor ?? ''}
        aria-label={aria}
        className={NUM}
        style={falta ? { borderColor: 'var(--color-state-fail)' } : undefined}
        onChange={(e) => onCambiar(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );
}

export function TiempoEquivalente({ datos, resuelto, ayuda, nombre, onCambiar }: Props) {
  const [afinar, setAfinar] = useState(false);
  const ted = resuelto?.ted ?? null;
  const v = ted?.ventilacion ?? null;

  return (
    <div className="mt-2 rounded border border-border-sub bg-bg-elevated px-2.5 py-2">
      <p className="pb-1.5 text-[11px] text-text-secondary">
        Tiempo equivalente de exposición al fuego (Anejo B)
      </p>

      {/* La geometría del sector: lo único que no se puede deducir de nada. */}
      <div className="flex flex-wrap gap-2">
        <Campo
          rotulo="Af"
          unidad="m²"
          valor={datos.af}
          aria={`Superficie del sector ${nombre}`}
          requerido
          onCambiar={(af) => onCambiar({ af })}
        />
        <Campo
          rotulo="Av"
          unidad="m²"
          valor={datos.av}
          aria={`Huecos en fachada del sector ${nombre}`}
          onCambiar={(av) => onCambiar({ av })}
        />
        <Campo
          rotulo="Ah"
          unidad="m²"
          valor={datos.ah}
          aria={`Huecos en techo del sector ${nombre}`}
          onCambiar={(ah) => onCambiar({ ah: ah ?? 0 })}
        />
        <Campo
          rotulo="H"
          unidad="m"
          valor={datos.h}
          aria={`Altura del sector ${nombre}`}
          paso="0.05"
          requerido
          onCambiar={(h) => onCambiar({ h })}
        />
      </div>

      {/* Las medidas activas: δn es su producto (tabla B.4). */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2">
        <label className={CASILLA}>
          <input
            type="checkbox"
            checked={datos.medidas.deteccion}
            aria-label={`Detección automática en ${nombre}`}
            onChange={(e) => onCambiar({ medidas: { ...datos.medidas, deteccion: e.target.checked } })}
          />
          detección <span className="text-text-disabled">0,87</span>
        </label>
        <label className={CASILLA}>
          <input
            type="checkbox"
            checked={datos.medidas.alarmaBomberos}
            aria-label={`Alarma automática a bomberos en ${nombre}`}
            onChange={(e) =>
              onCambiar({ medidas: { ...datos.medidas, alarmaBomberos: e.target.checked } })
            }
          />
          alarma a bomberos <span className="text-text-disabled">0,87</span>
        </label>
        <label className={CASILLA}>
          <input
            type="checkbox"
            checked={datos.medidas.extincion}
            aria-label={`Extinción automática en ${nombre}`}
            onChange={(e) => onCambiar({ medidas: { ...datos.medidas, extincion: e.target.checked } })}
          />
          extinción <span className="text-text-disabled">0,61</span>
        </label>
      </div>

      {/* El resultado, con la cuenta a la vista. */}
      {ted && ted.ted !== null && v && (
        <div className="mt-2 border-t border-border-sub pt-2">
          <p className="font-mono text-[12px] text-accent">
            te,d = {n2(ted.ted)} min → R {ted.declarado}
          </p>
          <p className="pt-0.5 font-mono text-[10.5px] leading-snug text-text-disabled">
            kb {n2(ted.kb)} · wf {v.wf === null ? '—' : n2(v.wf)} · kc{' '}
            {ted.kc === null ? '—' : n2(ted.kc)} · qf,d {n2(ted.carga.qfd)} MJ/m²
            <br />
            δq1 {n2(ted.carga.dq1)} · δq2 {n2(ted.carga.dq2)} · δn {n2(ted.carga.dn)} · δc{' '}
            {n2(ted.carga.dc)}
          </p>
          {resuelto?.deLaTabla != null && (
            <p className="pt-1 text-[10.5px] text-text-disabled">
              La tabla 3.1 pedía R {resuelto.deLaTabla}.
            </p>
          )}
        </div>
      )}

      {/* Lo que casi nadie toca, escondido pero a un clic. */}
      <button
        type="button"
        className="mt-2 text-[11px] text-accent hover:underline"
        onClick={() => setAfinar((a) => !a)}
      >
        {afinar ? 'Ocultar los coeficientes' : 'Afinar los coeficientes…'}
      </button>

      {afinar && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border-sub pt-2">
          <div className="flex flex-wrap items-end gap-2">
            <Campo
              rotulo="kb"
              unidad=""
              valor={datos.kb}
              aria={`Coeficiente de conversión kb de ${nombre}`}
              paso="0.01"
              onCambiar={(kb) => onCambiar({ kb: kb ?? KB_POR_DEFECTO })}
            />
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-text-disabled">m combustión</span>
              <select
                value={datos.m}
                aria-label={`Coeficiente de combustión de ${nombre}`}
                className={`${INPUT} max-w-[150px]`}
                onChange={(e) => onCambiar({ m: Number(e.target.value) })}
              >
                <option value={M_CELULOSICO}>0,80 — celulósico</option>
                <option value={M_DESCONOCIDO}>1,00 — no se sabe</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-text-disabled">Sección (kc)</span>
              <select
                value={datos.material}
                aria-label={`Material de la sección de ${nombre}`}
                className={`${INPUT} max-w-[165px]`}
                onChange={(e) => onCambiar({ material: e.target.value as MaterialSeccion })}
              >
                {(Object.keys(ETIQUETA_MATERIAL) as MaterialSeccion[]).map((k) => (
                  <option key={k} value={k}>
                    {ETIQUETA_MATERIAL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Campo
              rotulo="qf,k"
              unidad="MJ/m²"
              valor={datos.qfkManual}
              aria={`Densidad de carga de fuego de ${nombre}`}
              paso="10"
              onCambiar={(qfkManual) => onCambiar({ qfkManual })}
            />
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-text-disabled">o de la tabla B.6</span>
              <select
                value={datos.usoB6 ?? ''}
                aria-label={`Uso de la tabla B.6 de ${nombre}`}
                className={`${INPUT} max-w-[190px]`}
                onChange={(e) => onCambiar({ usoB6: (e.target.value || null) as DatosAnejoB['usoB6'] })}
              >
                <option value="">— el del sector —</option>
                {USOS_B6.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-text-disabled">Actividad (δq2, tabla B.3)</span>
            <select
              value={datos.actividad ?? ''}
              aria-label={`Actividad de la tabla B.3 de ${nombre}`}
              className={INPUT}
              onChange={(e) =>
                onCambiar({ actividad: (e.target.value || null) as DatosAnejoB['actividad'] })
              }
            >
              <option value="">— la del uso del sector —</option>
              {ACTIVIDADES_B3.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-text-disabled">
              Consecuencias (δc, tabla B.5)
            </span>
            <select
              value={datos.consecuencias ?? ''}
              aria-label={`Consecuencias de la tabla B.5 de ${nombre}`}
              className={INPUT}
              onChange={(e) =>
                onCambiar({ consecuencias: (e.target.value || null) as DatosAnejoB['consecuencias'] })
              }
            >
              <option value="">— la de la altura de evacuación —</option>
              {CONSECUENCIAS_B5.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className={CASILLA}>
            <input
              type="checkbox"
              checked={datos.criticidadAlta}
              aria-label={`${nombre} no puede quedar fuera de servicio`}
              onChange={(e) => onCambiar({ criticidadAlta: e.target.checked })}
            />
            no puede quedar fuera de servicio, o muchas víctimas{' '}
            <span className="text-text-disabled">(δc ×1,5)</span>
          </label>

          {/* La envolvente: sólo hace falta para la (B.6) y el acero desnudo. */}
          <div className="flex flex-wrap items-end gap-2">
            <Campo
              rotulo="At"
              unidad="m²"
              valor={datos.at}
              aria={`Envolvente del sector ${nombre}`}
              onCambiar={(at) => onCambiar({ at })}
            />
            <Campo
              rotulo="h huecos"
              unidad="m"
              valor={datos.hHuecos}
              aria={`Altura media de los huecos de ${nombre}`}
              paso="0.05"
              onCambiar={(hHuecos) => onCambiar({ hHuecos })}
            />
            <span className={`${AYUDA} max-w-[220px]`}>
              Sólo para sectores de menos de 100 m² y para el acero sin proteger.
            </span>
          </div>
        </div>
      )}

      {ayuda && (
        <p className={`${AYUDA} pt-2`}>
          El SI 6 § 3.1.b admite declarar este tiempo en lugar de la clase de la tabla 3.1, y sale
          en minutos exactos. Lo que hay que medir es el sector: su superficie construida, los
          huecos de fachada y de techo, y su altura. Lo demás se propone desde el uso del sector y
          la altura de evacuación del edificio.
        </p>
      )}
    </div>
  );
}
