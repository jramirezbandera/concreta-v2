/**
 * El ÚNICO sitio de la app que toca `localStorage`.
 *
 * Por qué existe: antes había ~17 puntos de escritura y casi todos se tragaban
 * `QuotaExceededError` en silencio. Con una instancia de todo era un guarda
 * defensivo razonable; con varias obras en el mismo navegador es una máquina
 * que deja de guardar el trabajo del usuario mientras la pantalla se lo sigue
 * mostrando. Aquí un fallo se clasifica (cuota llena o almacenamiento no
 * disponible), se publica a quien esté suscrito (la banda persistente y el
 * toast, en `components/layout/BandaAlmacen`) y se devuelve `false`.
 *
 * Una regla de ESLint prohíbe el identificador `localStorage` fuera de este
 * fichero, y el test `src/test/obra/proyectoKeys.test.ts` clasifica cada clave
 * que pasa por aquí.
 *
 * Cola drenable: los módulos que persisten con debounce (`useModuleState`,
 * `useFem2DState`, `useSlopeState`, muros de fábrica) NO llevan cada uno su
 * temporizador; encolan con `escribirClaveDiferida()` y esta cola escribe a los
 * 300 ms. Así (1) desmontar un módulo VUELCA lo pendiente en vez de cancelarlo,
 * y (2) `serializar()` y el cambio de obra pueden volcar desde fuera de React
 * con los módulos montados. Es un `Map` + un temporizador de módulo, no un
 * registro de hooks vivos: ese patrón (variable de módulo escrita en un
 * inicializador y leída en un efecto) ya rompió con el compilador de React.
 */

export type MotivoFallo = 'cuota' | 'no-disponible';

export interface EstadoAlmacen {
  /** `null` mientras la última operación haya ido bien. */
  readonly fallo: MotivoFallo | null;
  /** Clave en la que se produjo el fallo. */
  readonly clave: string | null;
}

const SIN_FALLO: EstadoAlmacen = { fallo: null, clave: null };

let estado: EstadoAlmacen = SIN_FALLO;
const oyentes = new Set<() => void>();

function fijar(siguiente: EstadoAlmacen): void {
  if (siguiente.fallo === estado.fallo && siguiente.clave === estado.clave) return;
  estado = siguiente;
  for (const fn of oyentes) fn();
}

/** Caracteres (UTF-16) de la última escritura que no cupo. */
let tamanoFallo = 0;

/**
 * Una escritura que va bien sólo levanta el fallo si demuestra algo: es la
 * misma clave que falló, o un valor al menos tan grande como el que no cupo.
 * Si no, la clave de versión (un carácter) que sigue al estado de un módulo
 * (varios KB) levantaría la banda en el mismo lote en que el estado se acaba
 * de perder. Con el almacén no disponible cualquier éxito vale: ya está.
 */
function levantarSiProcede(clave: string, tamano: number): void {
  if (estado.fallo === null) return;
  if (estado.fallo === 'no-disponible' || clave === estado.clave || tamano >= tamanoFallo) fijar(SIN_FALLO);
}

/** Instantánea estable (misma referencia mientras no cambie): apta para `useSyncExternalStore`. */
export function estadoAlmacen(): EstadoAlmacen {
  return estado;
}

export function suscribirAlmacen(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

/**
 * ¿Se puede tocar `localStorage`? El `typeof` NO basta por sí solo: cuando el
 * navegador bloquea el almacenamiento del sitio (Chrome con los datos de sitio
 * bloqueados, un `<iframe sandbox>`, algunas WebView), el ACCESO al
 * identificador lanza `SecurityError`, y `typeof` propaga esa excepción igual
 * que una lectura. Sin este `try` la app no llegaba ni a pintar: `main.tsx`
 * llama a `repararAlArrancar()` antes del primer render, y eso lee de aquí.
 */
// ---------------------------------------------------------------------------
// Filtro de escritura
// ---------------------------------------------------------------------------

/** `false` = esta clave no se puede escribir ahora mismo. */
export type FiltroEscritura = (clave: string) => boolean;

let filtro: FiltroEscritura | null = null;

/**
 * Pone (o quita, con `null`) un guardia que decide qué claves se pueden
 * escribir. Lo usa el contenedor de proyectos para que una pestaña que se ha
 * quedado con otra obra deje de persistir las claves de la obra: sin él, un
 * módulo montado sigue escribiendo su estado encima de la obra que abrió la
 * otra pestaña, y el aviso de la banda es una recomendación que la propia app
 * incumple. Vive aquí, y no en cada punto de escritura, porque aquí es donde
 * pasan TODAS.
 */
export function fijarFiltroDeEscritura(f: FiltroEscritura | null): void {
  filtro = f;
}

/**
 * Ejecuta `cuerpo` sin el filtro. Es para el propio contenedor: quien cambia
 * de obra tiene que poder escribir las claves de la obra, precisamente cuando
 * el guardia diría que no.
 */
export function conEscrituraLibre<T>(cuerpo: () => T): T {
  const previo = filtro;
  filtro = null;
  try {
    return cuerpo();
  } finally {
    filtro = previo;
  }
}

/** Escritura descartada por el guardia. No es un fallo del almacén: no se publica nada. */
function vetada(clave: string): boolean {
  return filtro !== null && !filtro(clave);
}

function hayAlmacen(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

/**
 * Sin almacén no hay nada que guardar, y hay que decirlo: es el mismo aviso
 * que la cuota llena. Sin `clave` a propósito —el fallo no es de una clave sino
 * de todo el almacén—, para que `fijar` no vuelva a notificar en cada lectura.
 */
function sinAlmacen(): void {
  fijar({ fallo: 'no-disponible', clave: null });
}

function longitudSegura(): number {
  try {
    return localStorage.length;
  } catch {
    return 0;
  }
}

/**
 * Cuota llena o almacenamiento no disponible. `QuotaExceededError` (código 22)
 * es la cuota en todos los navegadores actuales; `NS_ERROR_DOM_QUOTA_REACHED`
 * (1014) era Firefox antiguo. El Safari antiguo en modo privado lanzaba la
 * MISMA excepción con cuota cero: si el almacén está vacío, no es que esté
 * lleno, es que no se puede usar.
 */
function clasificar(err: unknown): MotivoFallo {
  const e = err as { name?: unknown; code?: unknown } | null;
  const esCuota =
    !!e &&
    typeof e === 'object' &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
  if (!esCuota) return 'no-disponible';
  return longitudSegura() === 0 ? 'no-disponible' : 'cuota';
}

/** `null` si la clave no existe o el almacenamiento no se puede leer. */
export function leerClave(clave: string): string | null {
  if (!hayAlmacen()) {
    sinAlmacen();
    return null;
  }
  try {
    return localStorage.getItem(clave);
  } catch (err) {
    fijar({ fallo: clasificar(err), clave });
    return null;
  }
}

/** Escribe ahora. `false` si no se pudo, con el fallo ya publicado. Sustituye a cualquier escritura diferida de la misma clave. */
export function escribirClave(clave: string, valor: string): boolean {
  if (vetada(clave)) return false;
  pendientes.delete(clave);
  if (!hayAlmacen()) {
    sinAlmacen();
    return false;
  }
  try {
    localStorage.setItem(clave, valor);
    levantarSiProcede(clave, valor.length);
    return true;
  } catch (err) {
    const fallo = clasificar(err);
    if (fallo === 'cuota') tamanoFallo = valor.length;
    fijar({ fallo, clave });
    return false;
  }
}

/** Borra la clave y descarta cualquier escritura diferida de ella. */
export function borrarClave(clave: string): boolean {
  if (vetada(clave)) return false;
  pendientes.delete(clave);
  if (!hayAlmacen()) {
    sinAlmacen();
    return false;
  }
  try {
    localStorage.removeItem(clave);
    return true;
  } catch (err) {
    fijar({ fallo: clasificar(err), clave });
    return false;
  }
}

/** Todas las claves del almacén, para enumerarlo (serializar, reparar el índice). */
export function clavesAlmacenadas(): string[] {
  if (!hayAlmacen()) {
    sinAlmacen();
    return [];
  }
  try {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  } catch (err) {
    fijar({ fallo: clasificar(err), clave: null });
    return [];
  }
}

/**
 * Ocupación del almacén en unidades UTF-16 (claves + valores), que es como
 * cuentan los navegadores los ~5 MB de cuota: ~2,5 millones de caracteres de
 * JSON, no 5. Sirve para avisar del tope de proyectos antes de chocar con él.
 */
export function ocupacionAlmacen(): number {
  let total = 0;
  for (const k of clavesAlmacenadas()) total += k.length + (leerClave(k)?.length ?? 0);
  return total;
}

// ---------------------------------------------------------------------------
// Cola drenable
// ---------------------------------------------------------------------------

/** El valor puede ser perezoso: se serializa al volcar, no al encolar. */
type ValorDiferido = string | (() => string);

const pendientes = new Map<string, ValorDiferido>();
let temporizador: ReturnType<typeof setTimeout> | null = null;

export const RETARDO_ESCRITURA_MS = 300;

/**
 * Encola la escritura y (re)arma el temporizador. Encolar la misma clave dos
 * veces sustituye el valor: sólo se escribe el último.
 */
export function escribirClaveDiferida(clave: string, valor: ValorDiferido, ms: number = RETARDO_ESCRITURA_MS): void {
  // El guardia se consulta al ENCOLAR además de al escribir: así una pestaña
  // desfasada ni siquiera acumula estado de la obra ajena esperando su turno.
  if (vetada(clave)) return;
  pendientes.set(clave, valor);
  if (temporizador !== null) clearTimeout(temporizador);
  temporizador = setTimeout(volcarPendientes, ms);
}

export function hayPendientes(): boolean {
  return pendientes.size > 0;
}

/**
 * Escribe ahora todo lo encolado. `true` si todo fue bien. Es lo que llama el
 * desmontaje de cada módulo, y lo que `serializar()` llamará antes de leer.
 */
export function volcarPendientes(): boolean {
  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  if (pendientes.size === 0) return true;
  const lote = [...pendientes];
  pendientes.clear();
  let todoBien = true;
  for (const [clave, valor] of lote) {
    let texto: string;
    try {
      texto = typeof valor === 'function' ? valor() : valor;
    } catch (err) {
      // Un serializador que revienta es un bug del módulo, no del almacén: que se vea.
      console.error(`seguro: no se pudo serializar '${clave}'`, err);
      todoBien = false;
      continue;
    }
    if (!escribirClave(clave, texto)) todoBien = false;
  }
  return todoBien;
}

/** Sólo para tests: vacía la cola, para el temporizador, olvida el fallo y quita el guardia. */
export function _reiniciarAlmacenParaTests(): void {
  if (temporizador !== null) clearTimeout(temporizador);
  temporizador = null;
  pendientes.clear();
  estado = SIN_FALLO;
  tamanoFallo = 0;
  oyentes.clear();
  filtro = null;
}
