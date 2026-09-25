import { moduleRegistry } from '../../data/moduleRegistry';

/** Una entrada de la barra lateral: a dónde lleva y cómo se llama. */
export interface Destino {
  key: string;
  route: string;
  label: string;
  group: string;
  shipped: boolean;
}

/**
 * El grupo PROYECTO va antes que los módulos y no sale del registro: no son
 * cálculos con estado propio (los datos de obra escriben `concreta-obra`, del
 * contenedor; el anejo ordena lo guardado desde los módulos y monta el PDF).
 *
 * Los dos son DE ESTA OBRA, y ése es el criterio de la lista. «Mi estudio» se
 * fue al menú Ajustes de la topbar el 2026-09-13 (F6): es del despacho y de
 * esta máquina, no del proyecto abierto.
 */
export const PROYECTO: readonly Destino[] = [
  { key: 'concreta-obra', route: '/obra', label: 'La obra', group: 'Proyecto', shipped: true },
  { key: 'concreta-anejo', route: '/proyecto/anejo', label: 'Anejo de cálculo', group: 'Proyecto', shipped: true },
];

/** Los grupos de módulos en el orden de la barra: el de su primera aparición en el registro. */
export const GRUPOS = Array.from(new Set(moduleRegistry.map((m) => m.group)));

/**
 * Todo lo que enseña la barra lateral, en su mismo orden. Ojo: NO es el orden
 * del registro, que mezcla grupos (Punzonamiento va detrás de Muros); la barra
 * agrupa, y el buscador tiene que listar lo mismo que se ve.
 */
export const DESTINOS: readonly Destino[] = [
  ...PROYECTO,
  ...GRUPOS.flatMap((g) => moduleRegistry.filter((m) => m.group === g)),
];

/**
 * Con qué otras palabras se busca cada destino, además de su nombre y su
 * grupo. Son las de obra y las de la norma: quien busca «sismo» no sabe que el
 * módulo se llama «Acción sísmica», y «vigas» sale en tres grupos. Sacadas de
 * lo que cada módulo dice de sí mismo en la portada (`pages/landing/modules.tsx`).
 */
const TERMINOS: Record<string, string> = {
  'concreta-obra': 'datos de obra proyecto emplazamiento municipio',
  'concreta-anejo': 'memoria de calculo pdf indice capitulos',
  'concreta-materiales': 'hormigon acero exposicion ambiente recubrimiento cemento anclaje madera ce db se-m',
  'concreta-memoria-dbse': 'ficha memoria cte db se geotecnico',
  'concreta-cargas-planta': 'peso propio permanentes sobrecarga de uso plantas forjado db se-ae',
  'concreta-viento-nieve': 'viento nieve cubierta fachadas presion db se-ae',
  'concreta-seismic': 'sismo terremoto ncse-02 espectro aceleracion',
  'concreta-incendio': 'fuego resistencia al fuego db si proteccion',
  'concreta-rc-beams': 'flexion cortante fisuracion armado',
  'concreta-rc-columns': 'soportes flexocompresion pandeo',
  'concreta-punching': 'losa perimetro critico cercos',
  'concreta-forjados': 'losa unidireccional reticular vigueta',
  'concreta-steel-beams': 'perfiles ipe heb flexion cortante vuelco lateral flecha db se-a',
  'concreta-steel-columns': 'perfiles soportes pandeo esbeltez db se-a',
  'concreta-composite-section': 'perfiles armados chapa angulares soldados',
  'concreta-anchor-plate': 'placa base pernos',
  'concreta-footings': 'zapatas aisladas cimentacion superficial tensiones vuelco deslizamiento db se-c',
  'concreta-retaining-wall': 'muros de contencion empuje sotano db se-c',
  'concreta-pile-cap': 'pilotes bielas y tirantes',
  'concreta-micropiles': 'pilotes fuste hundimiento',
  'concreta-empresillado': 'pilares empresillados presillas cordones refuerzo',
  'concreta-masonry-walls': 'ladrillo muros de carga db se-f',
  'concreta-timber-beams': 'madera laminada eurocodigo 5',
  'concreta-timber-columns': 'madera laminada pandeo eurocodigo 5',
  'concreta-fem-2d': 'vigas continuas envolventes elementos finitos',
  'concreta-fem2d': 'porticos cerchas elementos finitos',
  'concreta-slope-stability': 'estabilidad bishop factor de seguridad geotecnia',
  'concreta-rockfill-wall': 'gaviones muro de gravedad',
};

/** Minúsculas y sin tildes: «Acción» y «accion» se encuentran igual. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function empiezaPalabra(texto: string, trozo: string): boolean {
  return texto.startsWith(trozo) || texto.includes(` ${trozo}`);
}

/**
 * Los destinos que casan con lo tecleado, del más al menos parecido. Cada
 * palabra tiene que aparecer en algún sitio (nombre, grupo o términos), así que
 * «vigas acero» deja sólo la de acero. Pesa más lo que está en el nombre que en
 * el grupo, y el grupo más que los términos; a igualdad, el orden de la barra.
 * Sin nada escrito, la barra entera.
 */
export function buscarDestinos(consulta: string, destinos: readonly Destino[] = DESTINOS): Destino[] {
  const disponibles = destinos.filter((d) => d.shipped);
  const trozos = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (trozos.length === 0) return [...disponibles];

  const puntuados: { destino: Destino; puntos: number; orden: number }[] = [];
  disponibles.forEach((destino, orden) => {
    const nombre = normalizar(destino.label);
    const grupo = normalizar(destino.group);
    const terminos = normalizar(TERMINOS[destino.key] ?? '');
    let puntos = 0;
    for (const t of trozos) {
      if (empiezaPalabra(nombre, t)) puntos += 4;
      else if (nombre.includes(t)) puntos += 3;
      else if (empiezaPalabra(grupo, t)) puntos += 2;
      else if (grupo.includes(t) || terminos.includes(t)) puntos += 1;
      else return; // una palabra que no está en ningún sitio lo descarta
    }
    puntuados.push({ destino, puntos, orden });
  });

  return puntuados.sort((a, b) => b.puntos - a.puntos || a.orden - b.orden).map((p) => p.destino);
}
