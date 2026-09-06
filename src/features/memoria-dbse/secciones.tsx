/**
 * Las secciones del formulario, una por apartado de la ficha y en su orden.
 * Cada una enseña en azul lo que se va a imprimir —la frase exacta, con el
 * chip de dónde sale— y, donde toca, los campos residuales que la ficha no
 * puede sacar de ninguna publicación. Sin previsualización: el formulario ES
 * la ficha.
 */

import type { FichaDatos, Tipologia } from '../../lib/memoria/ensamblar';
import type { MemoriaState } from '../../lib/memoria/estado';
import { CATEGORIA_LABELS, EJECUCION_LABELS, TABLA_4_4, type CategoriaControl, type ClaseEjecucion, type PiezaTipo } from '../../lib/calculations/masonryWalls';
import { num } from '../../lib/materiales/cuadros';
import { CE, NCSE, SE, SEAE } from '../../lib/memoria/plantilla';
import { Campo } from '../../components/ui/Campo';
import { CIMENTACION, CONTENCIONES, ESTRUCTURA, ESTUDIO_AYUDA, FABRICA, FORJADO, GEOTECNIA, JUNTAS, PIEZAS_FORJADO } from './catalogos';
import { Area, CampoObra, Derivado, Interruptor, Numero, Selector, Texto, TextoConSugerencias } from './campos';
import { idDom } from './ids';
import { ANCHO, INPUT, REJILLA } from './estilos';

export interface Acciones {
  teclear: (id: string, valor: unknown) => void;
  confirmar: (id: string) => void;
  fabrica: (procede: boolean) => void;
  estudio: (ruta: string, valor: unknown) => void;
}

interface Props {
  datos: FichaDatos;
  state: MemoriaState;
  ayuda: boolean;
  on: Acciones;
}

const GUION = '—';

// ── 3.1.1 ───────────────────────────────────────────────────────────────────

export function SeccionSE({ datos, ayuda }: Props) {
  const se = datos.se;
  return (
    <div className={REJILLA}>
      <Derivado valor={se.periodoServicio} ayuda={ayuda} etiqueta={SE.periodoServicio.rotulo}>
        {se.periodoServicio.valor !== null ? SE.periodoServicio.texto(se.periodoServicio.valor) : GUION}
      </Derivado>
      <Derivado valor={{ valor: se.flechaActiva, estado: 'derivado', origen: 'estudio' }} ayuda={ayuda} etiqueta="Flechas y desplomes">
        {SE.flechas.texto(se.flechaActiva)}. {SE.desplome.texto(se.desplome)}
      </Derivado>
      <div className={ANCHO}>
        <Derivado valor={{ valor: se.modeloAnalisis, estado: 'derivado', origen: 'estudio' }} ayuda={ayuda} etiqueta={SE.acciones.modelo.rotulo}>
          {se.modeloAnalisis}
        </Derivado>
      </div>
      {ayuda && <p className={`${ANCHO} text-[10.5px] leading-snug text-text-disabled`}>El resto del 3.1.1 es texto fijo del DB SE: el proceso, las situaciones de dimensionado, los estados límite y las verificaciones. Se imprime tal cual.</p>}
    </div>
  );
}

// ── 3.1.2 ───────────────────────────────────────────────────────────────────

export function SeccionSEAE({ datos, ayuda }: Props) {
  const { viento, nieve, niveles } = datos.seae;
  const c = SEAE.variables.climaticas;
  return (
    <div className={REJILLA}>
      <Derivado valor={viento} ayuda={ayuda} etiqueta="El viento">
        {viento.valor ? c.viento.zona(viento.valor.lugar, viento.valor.zona, num(viento.valor.vb)) : (viento.nota ?? GUION)}
        {viento.valor ? ` Presión dinámica qb = ${num(viento.valor.qb, 2)} kN/m².` : ''}
      </Derivado>
      <Derivado valor={nieve} ayuda={ayuda} etiqueta="La nieve">
        {nieve.valor ? c.nieve.valor(nieve.valor.lugar, String(nieve.valor.zona), num(nieve.valor.sk, 2)) : 'Se escribe la regla general del DB SE-AE: sobrecarga no menor de 0,20 kN/m².'}
      </Derivado>
      <div className={ANCHO}>
        <Derivado valor={niveles} ayuda={ayuda} etiqueta={SEAE.niveles.titulo}>
          {niveles.valor ? `${niveles.valor.length} ${niveles.valor.length === 1 ? 'nivel' : 'niveles'} de Cargas por planta: ${niveles.valor.map((n) => `${n.nivel} ${n.total}`).join(' · ')}` : 'Sin la publicación de Cargas por planta no hay tabla de niveles.'}
        </Derivado>
      </div>
    </div>
  );
}

// ── 3.1.3 ───────────────────────────────────────────────────────────────────

export function SeccionSEC({ datos, ayuda, on }: Props) {
  const g = datos.sec.geotecnia;
  const cim = datos.sec.cimentacion;
  const con = datos.sec.contenciones;
  const desc = con.descripcion;
  const mat = con.material;
  const largos = new Set(['empresa', 'sondeos', 'descripcionTerrenos']);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Estudio geotécnico</p>
      <div className={REJILLA}>
        {(Object.keys(GEOTECNIA) as (keyof typeof GEOTECNIA)[]).map((k) => (
          <div key={k} className={largos.has(k) ? ANCHO : undefined}>
            <CampoObra valor={g[k]} ayuda={ayuda} texto={GEOTECNIA[k]} onConfirmar={on.confirmar}>
              {k === 'descripcionTerrenos' ? (
                <Area id={g[k].id!} valor={g[k].valor} placeholder={GEOTECNIA[k].placeholder} onChange={(v) => on.teclear(g[k].id!, v)} />
              ) : (
                <Texto id={g[k].id!} valor={g[k].valor} placeholder={GEOTECNIA[k].placeholder} onChange={(v) => on.teclear(g[k].id!, v)} />
              )}
            </CampoObra>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Cimentación</p>
      <div className={REJILLA}>
        <div className={ANCHO}>
          <CampoObra valor={cim.descripcion} ayuda={ayuda} texto={CIMENTACION.descripcion} onConfirmar={on.confirmar}>
            <Area id={cim.descripcion.id!} valor={cim.descripcion.valor} placeholder={CIMENTACION.descripcion.placeholder} onChange={(v) => on.teclear(cim.descripcion.id!, v)} />
          </CampoObra>
        </div>
        <CampoObra valor={cim.material} ayuda={ayuda} texto={CIMENTACION.material} onConfirmar={on.confirmar}>
          <Texto id={cim.material.id!} valor={cim.material.valor} placeholder={CIMENTACION.material.placeholder} onChange={(v) => on.teclear(cim.material.id!, v)} />
        </CampoObra>
        <CampoObra valor={con.existen} ayuda={ayuda} texto={CONTENCIONES.existen} onConfirmar={on.confirmar}>
          <Interruptor id={con.existen.id!} valor={con.existen.valor ?? false} onChange={(v) => on.teclear(con.existen.id!, v)} />
        </CampoObra>
        {desc && mat && (
          <>
            <div className={ANCHO}>
              <CampoObra valor={desc} ayuda={ayuda} texto={CONTENCIONES.descripcion} onConfirmar={on.confirmar}>
                <Area id={desc.id!} valor={desc.valor} placeholder={CONTENCIONES.descripcion.placeholder} onChange={(v) => on.teclear(desc.id!, v)} />
              </CampoObra>
            </div>
            <CampoObra valor={mat} ayuda={ayuda} texto={CONTENCIONES.material} onConfirmar={on.confirmar}>
              <Texto id={mat.id!} valor={mat.valor} placeholder={CONTENCIONES.material.placeholder} onChange={(v) => on.teclear(mat.id!, v)} />
            </CampoObra>
          </>
        )}
      </div>
    </div>
  );
}

// ── 3.1.4 ───────────────────────────────────────────────────────────────────

export function SeccionNCSE({ datos, state, ayuda, on }: Props) {
  const s = datos.ncse;
  const sismo = s.valor;
  const tipo = state.obra.tipoEstructuraSismo;
  const tipoValor = sismo?.tipoEstructura ?? { valor: tipo.valor, estado: 'ok' as const, origen: 'tecleado' as const };
  return (
    <div className={REJILLA}>
      <div className={ANCHO}>
        <Derivado valor={s} ayuda={ayuda} etiqueta="Lo que dice la tabla sísmica">
          {sismo
            ? sismo.completo
              ? `${sismo.clasificacion}. ${sismo.ab}. ${sismo.completo.K}; ${sismo.completo.C}; ${sismo.completo.ac}. ${sismo.completo.ductilidad}.`
              : `${sismo.clasificacion}. ${sismo.ab}. ${sismo.exencion ?? ''} ${NCSE.textos.exento}`
            : (s.nota ?? 'Sin la publicación del módulo de sismo no hay tabla sísmica.')}
        </Derivado>
      </div>
      <Campo etiqueta={ESTRUCTURA.tipoEstructuraSismo.etiqueta} ayuda={ESTRUCTURA.tipoEstructuraSismo.ayuda} estado={tipoValor.estado === 'derivado' ? 'derivado' : tipoValor.estado} accion={tipoValor.estado === 'heredado' && tipoValor.id ? <button type="button" className="text-[10.5px] text-state-warn underline" onClick={() => on.confirmar(tipoValor.id!)}>✓ Confirmar</button> : null}>
        <Texto id="obra.tipoEstructuraSismo" valor={tipo.valor} placeholder={sismo?.tipoEstructura.valor ?? 'Se toma del módulo de sismo'} onChange={(v) => on.teclear('obra.tipoEstructuraSismo', v || null)} />
      </Campo>
    </div>
  );
}

// ── 3.1.5 ───────────────────────────────────────────────────────────────────

export function SeccionCE({ datos, ayuda, on }: Props) {
  const ce = datos.ce;
  const j = ce.juntas;
  return (
    <div className={REJILLA}>
      <div className={ANCHO}>
        <CampoObra valor={ce.descripcionSistema} ayuda={ayuda} texto={ESTRUCTURA.descripcionSistema} onConfirmar={on.confirmar}>
          <Area id={ce.descripcionSistema.id!} valor={ce.descripcionSistema.valor} placeholder={ESTRUCTURA.descripcionSistema.placeholder} onChange={(v) => on.teclear(ce.descripcionSistema.id!, v)} />
        </CampoObra>
      </div>
      <CampoObra valor={j.existen} ayuda={ayuda} texto={JUNTAS.existen} onConfirmar={on.confirmar}>
        <Interruptor id={j.existen.id!} valor={j.existen.valor ?? false} onChange={(v) => on.teclear(j.existen.id!, v)} />
      </CampoObra>
      {j.existen.valor && (
        <div className="flex gap-4">
          <CampoObra valor={j.numero} ayuda={ayuda} texto={JUNTAS.numero} onConfirmar={on.confirmar}>
            <Numero id={j.numero.id!} valor={j.numero.valor} min={1} max={50} onChange={(v) => on.teclear(j.numero.id!, v)} />
          </CampoObra>
          <CampoObra valor={j.separacionMax} ayuda={ayuda} texto={JUNTAS.separacionMax} onConfirmar={on.confirmar}>
            <Numero id={j.separacionMax.id!} valor={j.separacionMax.valor} unidad="m" min={1} max={500} onChange={(v) => on.teclear(j.separacionMax.id!, v)} />
          </CampoObra>
        </div>
      )}
      <CampoObra valor={j.termicasConsideradas} ayuda={ayuda} texto={JUNTAS.termicasConsideradas} onConfirmar={on.confirmar}>
        <Interruptor id={j.termicasConsideradas.id!} valor={j.termicasConsideradas.valor ?? false} onChange={(v) => on.teclear(j.termicasConsideradas.id!, v)} />
      </CampoObra>
      <CampoObra valor={ce.sobrecargaTerreno} ayuda={ayuda} texto={ESTRUCTURA.sobrecargaTerreno} onConfirmar={on.confirmar}>
        <Numero id={ce.sobrecargaTerreno.id!} valor={ce.sobrecargaTerreno.valor} unidad="kN/m²" min={0} max={100} onChange={(v) => on.teclear(ce.sobrecargaTerreno.id!, v)} />
      </CampoObra>
      <Derivado valor={ce.materiales} ayuda={ayuda} etiqueta={CE.materiales.titulo}>
        {ce.materiales.valor && ce.materiales.valor.length > 0 ? ce.materiales.valor.map((e) => `${e.ubicacion}: ${e.hormigon}`).join(' · ') : (ce.materiales.nota ?? 'Sin el cuadro de materiales no hay hormigones.')}
      </Derivado>
      <Derivado valor={ce.coeficientes} ayuda={ayuda} etiqueta="Coeficientes y niveles de control">
        {ce.coeficientes.valor ? `γc = ${num(ce.coeficientes.valor.gammaC, 2)} · γs = ${num(ce.coeficientes.valor.gammaS, 2)} · γG = ${num(ce.coeficientes.valor.gammaG, 2)} · γQ = ${num(ce.coeficientes.valor.gammaQ, 2)} · control ${ce.coeficientes.valor.nivelHormigon.toLowerCase()} / ${ce.coeficientes.valor.nivelAcero.toLowerCase()} / ejecución ${ce.coeficientes.valor.nivelEjecucion.toLowerCase()}` : GUION}
      </Derivado>
      <Derivado valor={ce.cargas} ayuda={ayuda} etiqueta="Estado de cargas">
        {ce.cargas.valor ? `${ce.cargas.valor.usos.length} usos de forjado y ${ce.cargas.valor.lineales.length} cargas lineales de Cargas por planta.` : 'Sin la publicación de Cargas por planta.'}
      </Derivado>
    </div>
  );
}

// ── 3.1.6 ───────────────────────────────────────────────────────────────────

function Forjado({ t, ayuda, on }: { t: Tipologia; ayuda: boolean; on: Acciones }) {
  const campo = (valor: Tipologia['intereje'], texto: (typeof FORJADO)[keyof typeof FORJADO], unidad: string) =>
    valor ? (
      <CampoObra valor={valor} ayuda={ayuda} texto={texto} onConfirmar={on.confirmar}>
        <Numero id={valor.id!} valor={valor.valor} unidad={unidad} min={0} max={200} onChange={(v) => on.teclear(valor.id!, v)} />
      </CampoObra>
    ) : null;
  return (
    <div className="rounded border border-border-sub px-3 py-2">
      <p className="mb-2 text-[11.5px] text-text-primary">
        {t.titulo} <span className="font-mono text-text-secondary">h = {num(t.canto)} cm · {num(t.pp, 2)} kN/m²</span>
        {t.hormigon ? <span className="ml-2 text-[10.5px] text-accent">{t.hormigon} · {t.acero}</span> : null}
      </p>
      {t.intereje ? (
        <div className={REJILLA}>
          {campo(t.intereje, FORJADO.intereje, 'cm')}
          {campo(t.anchoNervio, FORJADO.anchoNervio, 'cm')}
          {campo(t.capaCompresion, FORJADO.capaCompresion, 'cm')}
          {t.pieza && (
            <CampoObra valor={t.pieza} ayuda={ayuda} texto={FORJADO.pieza} onConfirmar={on.confirmar}>
              <TextoConSugerencias id={t.pieza.id!} valor={t.pieza.valor} sugerencias={PIEZAS_FORJADO} onChange={(v) => on.teclear(t.pieza!.id!, v || null)} />
            </CampoObra>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-text-disabled">Esta tipología no pide más datos: el canto y el peso propio vienen de Cargas por planta.</p>
      )}
    </div>
  );
}

export function SeccionForjados({ datos, ayuda, on }: Props) {
  const f = datos.forjados;
  if (!f.valor) {
    return (
      <Derivado valor={f} ayuda={ayuda}>
        {f.nota ?? 'Las tipologías de forjado salen de la publicación de Cargas por planta.'}
      </Derivado>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {f.valor.map((t) => (
        <Forjado key={t.clave} t={t} ayuda={ayuda} on={on} />
      ))}
    </div>
  );
}

// ── 3.1.7 ───────────────────────────────────────────────────────────────────

export function SeccionSEA({ datos, ayuda }: Props) {
  const a = datos.sea;
  if (!a) return null;
  return (
    <div className={REJILLA}>
      <div className={ANCHO}>
        <Derivado valor={{ valor: a.verificacion, estado: 'derivado', origen: 'estudio' }} ayuda={ayuda} etiqueta="Criterios de verificación">
          {a.verificacion}
        </Derivado>
      </div>
      <Derivado valor={datos.fuentes.materiales} ayuda={ayuda} etiqueta="El acero">
        {a.acero.designacion} · {a.acero.elementos.length} {a.acero.elementos.length === 1 ? 'elemento' : 'elementos'} · clase de ejecución EXC{a.acero.claseEjecucion}
      </Derivado>
      {ayuda && <p className="text-[10.5px] leading-snug text-text-disabled">Las juntas de dilatación y las acciones térmicas se contestan en el 3.1.5 y se imprimen también aquí.</p>}
    </div>
  );
}

// ── 3.1.8 ───────────────────────────────────────────────────────────────────

const PIEZAS: { id: PiezaTipo; etiqueta: string }[] = (Object.keys(TABLA_4_4) as PiezaTipo[]).map((id) => ({ id, etiqueta: TABLA_4_4[id].label }));
const CATEGORIAS: { id: CategoriaControl; etiqueta: string }[] = (['I', 'II', 'III'] as const).map((id) => ({ id, etiqueta: CATEGORIA_LABELS[id] }));
const EJECUCIONES: { id: ClaseEjecucion; etiqueta: string }[] = (['A', 'B'] as const).map((id) => ({ id, etiqueta: EJECUCION_LABELS[id] }));

export function SeccionSEF({ datos, state, ayuda, on }: Props) {
  const f = datos.sef;
  return (
    <div className={REJILLA}>
      <Campo etiqueta={FABRICA.procede.etiqueta} ayuda={FABRICA.procede.ayuda}>
        <Interruptor id="obra.fabrica.procede" valor={state.obra.fabrica.procede} onChange={on.fabrica} />
      </Campo>
      {f && (
        <>
          <CampoObra valor={f.pieza} ayuda={ayuda} texto={FABRICA.pieza} onConfirmar={on.confirmar}>
            <Selector id={f.pieza.id!} valor={f.pieza.valor} opciones={PIEZAS} onChange={(v) => on.teclear(f.pieza.id!, v)} />
          </CampoObra>
          <CampoObra valor={f.fb} ayuda={ayuda} texto={FABRICA.fb} onConfirmar={on.confirmar}>
            <Numero id={f.fb.id!} valor={f.fb.valor} unidad="N/mm²" min={1} max={100} onChange={(v) => on.teclear(f.fb.id!, v)} />
          </CampoObra>
          <CampoObra valor={f.fm} ayuda={ayuda} texto={FABRICA.fm} onConfirmar={on.confirmar}>
            <Numero id={f.fm.id!} valor={f.fm.valor} unidad="N/mm²" min={1} max={50} onChange={(v) => on.teclear(f.fm.id!, v)} />
          </CampoObra>
          <CampoObra valor={f.categoriaControl} ayuda={ayuda} texto={FABRICA.categoriaControl} onConfirmar={on.confirmar}>
            <Selector id={f.categoriaControl.id!} valor={f.categoriaControl.valor} opciones={CATEGORIAS} onChange={(v) => on.teclear(f.categoriaControl.id!, v)} />
          </CampoObra>
          <CampoObra valor={f.claseEjecucion} ayuda={ayuda} texto={FABRICA.claseEjecucion} onConfirmar={on.confirmar}>
            <Selector id={f.claseEjecucion.id!} valor={f.claseEjecucion.valor} opciones={EJECUCIONES} onChange={(v) => on.teclear(f.claseEjecucion.id!, v)} />
          </CampoObra>
          <Derivado valor={f.fk} ayuda={ayuda} etiqueta="Resistencia de la fábrica y coeficiente parcial">
            {f.fk.valor !== null ? `fk = ${num(f.fk.valor, 1)} N/mm² (tabla 4.4)` : (f.fk.nota ?? 'fk sale de la tabla 4.4 con la pieza, fb y fm.')}
            {f.gammaM.valor !== null ? ` · γM = ${num(f.gammaM.valor, 2)} (tabla 4.8)` : ''}
          </Derivado>
        </>
      )}
    </div>
  );
}

// ── 3.1.9 ───────────────────────────────────────────────────────────────────

export function SeccionSEM({ datos, ayuda }: Props) {
  const m = datos.sem;
  if (!m) return null;
  return (
    <div className={REJILLA}>
      <div className={ANCHO}>
        <Derivado valor={datos.fuentes.materiales} ayuda={ayuda} etiqueta="La madera">
          {m.madera.grupos.map((g) => `${g.nombre}: ${g.claseResistente}, clase de servicio ${g.claseServicio}, clase de uso ${g.claseUso}, γM = ${num(g.gammaM, 2)}`).join(' · ')}
        </Derivado>
      </div>
    </div>
  );
}

// ── Perfil de estudio ───────────────────────────────────────────────────────

export function SeccionEstudio({ state, ayuda, on }: Props) {
  const e = state.estudio;
  const texto = (ruta: string, etiqueta: string, valor: string, ayudaTexto?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayudaTexto}>
      <input type="text" className={INPUT} value={valor} id={idDom(`estudio.${ruta}`)} onChange={(ev) => on.estudio(ruta, ev.target.value)} />
    </Campo>
  );
  return (
    <div className="flex flex-col gap-3">
      {ayuda && <p className="text-[10.5px] leading-snug text-text-disabled">{ESTUDIO_AYUDA}</p>}
      <div className={REJILLA}>
        {texto('programa.nombre', 'Programa de cálculo', e.programa.nombre)}
        {texto('programa.version', 'Versión', e.programa.version)}
        {texto('programa.empresa', 'Empresa del programa', e.programa.empresa)}
        {texto('programa.domicilio', 'Domicilio de la empresa', e.programa.domicilio)}
        <div className={ANCHO}>
          <Campo etiqueta="Descripción del programa (idealización de la estructura)">
            <textarea className={INPUT + ' min-h-[64px] resize-y'} value={e.programa.descripcion} onChange={(ev) => on.estudio('programa.descripcion', ev.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Verificación del acero (3.1.7.1)">
          <select className={INPUT} value={e.verificacionAcero} onChange={(ev) => on.estudio('verificacionAcero', ev.target.value)}>
            <option value="informatica">Con el programa, toda la estructura</option>
            <option value="manual">A mano, toda la estructura</option>
          </select>
        </Campo>
        <Campo etiqueta="Redistribución de momentos negativos en vigas (%)">
          <Numero id="estudio.redistribucion" valor={e.redistribucion} unidad="%" min={0} max={30} onChange={(v) => on.estudio('redistribucion', v)} />
        </Campo>
        {texto('flechas.total', 'Límite de flecha total (vigas)', e.flechas.total)}
        {texto('flechas.activa', 'Límite de flecha activa (vigas)', e.flechas.activa)}
        {texto('flechas.maxRecomendada', 'Flecha máxima recomendada', e.flechas.maxRecomendada)}
        {texto('flechaActivaGeneral', 'Flecha activa general (3.1.1)', e.flechaActivaGeneral, 'Fracción de la luz: 1/500.')}
        {texto('desplome', 'Desplome total límite (3.1.1)', e.desplome, 'Fracción de la altura total: 1/500.')}
        {texto('barandillas', 'Barandillas (3.1.5.3)', e.barandillas)}
      </div>
    </div>
  );
}
