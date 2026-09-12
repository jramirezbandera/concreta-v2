/**
 * Ajustes › Mi estudio: el perfil del despacho.
 *
 * Lo que NO cambia de una obra a otra —programa de cálculo, límites de flecha,
 * niveles de control, las redacciones del método— y que por eso no tiene nada
 * que hacer dentro de la ficha de una obra concreta, donde además era una
 * sección plegada más entre diez y sólo dejaba editar la mitad de los campos.
 *
 * Vive en `concreta-estudio`, clave de PREFERENCIA: es de este despacho y de
 * esta máquina, así que NO viaja dentro del `.concreta`. Lo que sí viaja es
 * una copia informativa de con qué perfil se guardó cada obra, para poder
 * avisar al abrir la de un compañero.
 *
 * Se autoguarda: no hay botón de guardar, como en el resto de la app.
 */

import { useState } from 'react';
import { useDrawer } from '../../components/layout/AppShell';
import { Topbar } from '../../components/layout/Topbar';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { CONTROL_EJECUCION_OPCIONES } from '../materiales/catalogos';
import { guardarPerfilEstudio, leerPerfilEstudio } from '../memoria-dbse/state';
import { perfilEstudioPorDefecto, type LimitesFlecha, type PerfilEstudio } from '../../lib/memoria/estado';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none';
const AREA = `${INPUT} min-h-[72px] resize-y leading-relaxed`;
const ETIQUETA = 'block text-[11.5px] text-text-secondary mb-1';
const NOTA = 'mt-1 text-[11px] text-text-disabled';
const CABECERA = 'mt-6 mb-2 border-b border-border-sub pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled';

/** Los siete tipos de forjado, con su nombre de obra. */
const FORJADOS: ReadonlyArray<[keyof PerfilEstudio['forjados'], string]> = [
  ['unidireccional', 'Unidireccional'],
  ['reticular', 'Reticular'],
  ['losa', 'Losa maciza'],
  ['solera', 'Solera'],
  ['chapa', 'Chapa colaborante'],
  ['madera', 'Madera'],
  ['otro', 'Otro'],
];

const CONTROL_HORMIGON = [
  { id: 'estadistico', etiqueta: 'Estadístico (el corriente)' },
  { id: 'indirecto', etiqueta: 'Indirecto' },
  { id: '100_por_100', etiqueta: 'Al 100 %' },
] as const;

export function AjustesEstudioModule() {
  const { openDrawer } = useDrawer();
  const [perfil, setPerfil] = useState<PerfilEstudio>(() => leerPerfilEstudio() ?? perfilEstudioPorDefecto());

  /** Todo cambio pasa por aquí: escribe y persiste, sin botón de guardar. */
  const cambiar = (cambio: (p: PerfilEstudio) => PerfilEstudio) => {
    setPerfil((prev) => {
      const siguiente = cambio(prev);
      guardarPerfilEstudio(siguiente);
      return siguiente;
    });
  };

  const texto = (id: string, etiqueta: string, valor: string, poner: (v: string) => PerfilEstudio, nota?: string, area = false) => (
    <div key={id}>
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta}
      </label>
      {area ? (
        <textarea id={id} value={valor} className={AREA} onChange={(e) => cambiar(() => poner(e.target.value))} />
      ) : (
        <input id={id} type="text" value={valor} className={INPUT} onChange={(e) => cambiar(() => poner(e.target.value))} />
      )}
      {nota && <p className={NOTA}>{nota}</p>}
    </div>
  );

  const flecha = (tipo: keyof PerfilEstudio['forjados'], campo: keyof LimitesFlecha, valor: string) => (
    <input
      type="text"
      aria-label={`${tipo} ${campo}`}
      value={valor}
      className={INPUT}
      onChange={(e) => cambiar((p) => ({ ...p, forjados: { ...p.forjados, [tipo]: { ...p.forjados[tipo], [campo]: e.target.value } } }))}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar moduleGroup="Ajustes" moduleLabel="Mi estudio" onMenuOpen={openDrawer} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[820px] px-5 pb-10">
          <p className="mt-4 mb-0 text-[12.5px] leading-relaxed text-text-secondary">
            Lo que no cambia entre obras de este despacho. Se rellena una vez y lo hereda cada obra nueva: la ficha del DB SE no vuelve a
            preguntarlo. Es de esta máquina, así que no viaja dentro del fichero de la obra.
          </p>

          <p className={CABECERA}>El programa de cálculo</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">
            {texto('estudio-programa-nombre', 'Programa', perfil.programa.nombre, (v) => ({ ...perfil, programa: { ...perfil.programa, nombre: v } }))}
            {texto('estudio-programa-version', 'Versión', perfil.programa.version, (v) => ({ ...perfil, programa: { ...perfil.programa, version: v } }))}
            {texto('estudio-programa-empresa', 'Empresa', perfil.programa.empresa, (v) => ({ ...perfil, programa: { ...perfil.programa, empresa: v } }))}
            {texto('estudio-programa-domicilio', 'Domicilio de la empresa', perfil.programa.domicilio, (v) => ({ ...perfil, programa: { ...perfil.programa, domicilio: v } }))}
            <div className="md:col-span-2">
              {texto(
                'estudio-programa-descripcion',
                'Cómo idealiza la estructura',
                perfil.programa.descripcion,
                (v) => ({ ...perfil, programa: { ...perfil.programa, descripcion: v } }),
                'Se imprime en la memoria de cálculo (3.1.5.2).',
                true,
              )}
            </div>
          </div>

          <p className={CABECERA}>El método</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5">
            {texto('estudio-metodo', 'Método de cálculo', perfil.metodoCalculo, (v) => ({ ...perfil, metodoCalculo: v }), undefined, true)}
            {texto('estudio-modelo', 'Modelo de análisis estructural', perfil.modeloAnalisis, (v) => ({ ...perfil, modeloAnalisis: v }), undefined, true)}
            {texto('estudio-cuantias', 'Cuantías', perfil.cuantias, (v) => ({ ...perfil, cuantias: v }), undefined, true)}
            {texto('estudio-barandillas', 'Barandillas', perfil.barandillas, (v) => ({ ...perfil, barandillas: v }), 'Se imprime en el estado de cargas (3.1.5.3).', true)}
          </div>

          <p className={CABECERA}>Deformaciones</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-3">
            {texto('estudio-flecha-total', 'Flecha total (vigas)', perfil.flechas.total, (v) => ({ ...perfil, flechas: { ...perfil.flechas, total: v } }))}
            {texto('estudio-flecha-activa', 'Flecha activa (vigas)', perfil.flechas.activa, (v) => ({ ...perfil, flechas: { ...perfil.flechas, activa: v } }))}
            {texto('estudio-flecha-max', 'Flecha máxima recomendada', perfil.flechas.maxRecomendada, (v) => ({ ...perfil, flechas: { ...perfil.flechas, maxRecomendada: v } }))}
            {texto('estudio-flecha-general', 'Flecha activa general', perfil.flechaActivaGeneral, (v) => ({ ...perfil, flechaActivaGeneral: v }), 'Fracción de la luz: 1/500.')}
            {texto('estudio-desplome', 'Desplome total límite', perfil.desplome, (v) => ({ ...perfil, desplome: v }), 'Fracción de la altura total: 1/500.')}
            <div>
              <label htmlFor="estudio-redistribucion" className={ETIQUETA}>
                Redistribución de momentos negativos
              </label>
              <RawNumberInput
                id="estudio-redistribucion"
                value={perfil.redistribucion}
                onChange={(v) => cambiar((p) => ({ ...p, redistribucion: Number.isFinite(v) ? v : 0 }))}
                ariaLabel="Redistribución de momentos negativos"
                unit="%"
                min={0}
                max={30}
                widthClass="w-full"
              />
            </div>
          </div>

          <p className={CABECERA}>Flechas por tipo de forjado</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border-sub text-left text-[11px] text-text-disabled">
                  <th className="py-1.5 pr-3 font-medium">Tipo</th>
                  <th className="py-1.5 pr-3 font-medium">Total</th>
                  <th className="py-1.5 pr-3 font-medium">Activa</th>
                  <th className="py-1.5 font-medium">Absoluta</th>
                </tr>
              </thead>
              <tbody>
                {FORJADOS.map(([tipo, nombre]) => (
                  <tr key={tipo} className="border-b border-border-sub last:border-b-0">
                    <td className="py-1.5 pr-3 text-text-primary">{nombre}</td>
                    <td className="py-1.5 pr-3">{flecha(tipo, 'total', perfil.forjados[tipo].total)}</td>
                    <td className="py-1.5 pr-3">{flecha(tipo, 'activa', perfil.forjados[tipo].activa)}</td>
                    <td className="py-1.5">{flecha(tipo, 'absoluta', perfil.forjados[tipo].absoluta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={CABECERA}>Redacciones fijas</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5">
            {texto('estudio-sismo-segundo-orden', 'Sismo: efectos de segundo orden', perfil.sismo.efectosSegundoOrden, (v) => ({ ...perfil, sismo: { ...perfil.sismo, efectosSegundoOrden: v } }), undefined, true)}
            {texto('estudio-sismo-medidas', 'Sismo: medidas constructivas', perfil.sismo.medidasConstructivas, (v) => ({ ...perfil, sismo: { ...perfil.sismo, medidasConstructivas: v } }), undefined, true)}
            {texto('estudio-cim-dimensiones', 'Cimentación: dimensiones y armado', perfil.cimentacion.dimensionesYArmado, (v) => ({ ...perfil, cimentacion: { ...perfil.cimentacion, dimensionesYArmado: v } }), undefined, true)}
            {texto('estudio-cim-ejecucion', 'Cimentación: condiciones de ejecución', perfil.cimentacion.condicionesEjecucion, (v) => ({ ...perfil, cimentacion: { ...perfil.cimentacion, condicionesEjecucion: v } }), undefined, true)}
            {texto('estudio-cont-ejecucion', 'Contenciones: condiciones de ejecución', perfil.contenciones.condicionesEjecucion, (v) => ({ ...perfil, contenciones: { ...perfil.contenciones, condicionesEjecucion: v } }), undefined, true)}
          </div>

          <p className={CABECERA}>Control y vida útil</p>
          <p className="m-0 mb-2 text-[11px] text-text-disabled">
            Sólo se usan cuando la obra no tiene cuadro de materiales publicado: en cuanto lo tiene, mandan los suyos.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">
            <div>
              <label htmlFor="estudio-vida-util" className={ETIQUETA}>
                Vida útil de proyecto
              </label>
              <RawNumberInput
                id="estudio-vida-util"
                value={perfil.control.vidaUtilAnios}
                onChange={(v) => cambiar((p) => ({ ...p, control: { ...p.control, vidaUtilAnios: Number.isFinite(v) ? v : 50 } }))}
                ariaLabel="Vida útil de proyecto"
                unit="años"
                min={1}
                max={200}
                widthClass="w-full"
              />
            </div>
            <div>
              <label htmlFor="estudio-control-ejecucion" className={ETIQUETA}>
                Control de ejecución
              </label>
              <select
                id="estudio-control-ejecucion"
                value={perfil.control.nivelControlEjecucion}
                className={INPUT}
                onChange={(e) => cambiar((p) => ({ ...p, control: { ...p.control, nivelControlEjecucion: e.target.value as PerfilEstudio['control']['nivelControlEjecucion'] } }))}
              >
                {CONTROL_EJECUCION_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="estudio-control-hormigon" className={ETIQUETA}>
                Control del hormigón
              </label>
              <select
                id="estudio-control-hormigon"
                value={perfil.control.nivelControlHormigon}
                className={INPUT}
                onChange={(e) => cambiar((p) => ({ ...p, control: { ...p.control, nivelControlHormigon: e.target.value as PerfilEstudio['control']['nivelControlHormigon'] } }))}
              >
                {CONTROL_HORMIGON.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            {texto('estudio-control-acero', 'Control del acero', perfil.control.nivelControlAcero, (v) => ({ ...perfil, control: { ...perfil.control, nivelControlAcero: v } }))}
            <div>
              <label htmlFor="estudio-verificacion-acero" className={ETIQUETA}>
                Verificación del acero
              </label>
              <select
                id="estudio-verificacion-acero"
                value={perfil.verificacionAcero}
                className={INPUT}
                onChange={(e) => cambiar((p) => ({ ...p, verificacionAcero: e.target.value as PerfilEstudio['verificacionAcero'] }))}
              >
                <option value="informatica">Con el programa, toda la estructura</option>
                <option value="manual">A mano, toda la estructura</option>
              </select>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-text-disabled">
            Los cambios se guardan solos. Afectan a las obras que se abran a partir de ahora; lo ya exportado no se toca.
          </p>
        </div>
      </div>
    </div>
  );
}
