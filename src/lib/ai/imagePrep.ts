// Preparación de imágenes para el asistente IA (T2.5 — UI compartida).
// Extraído por COPIA de src/features/steel-beams/AiFillModal.tsx (que conserva
// sus copias privadas hasta la Fase 4 — duplicación temporal deliberada).
//
// Límites (riesgos del plan: 5 MB/imagen de Anthropic es el más restrictivo
// entre proveedores → margen a 4 MB de base64). Sin React: funciones puras de
// DOM (FileReader/Image/canvas) reutilizables por cualquier composer.
import type { AiImageAttachment, AiImageMediaType } from './types';

/** Máximo de imágenes adjuntas por turno del composer. */
export const MAX_IMAGES = 3;
/** Ficheros por encima de este tamaño se recomprimen en canvas (JPEG 0.85). */
export const RESIZE_BYTES = 1.5 * 1024 * 1024;
/** Lado mayor máximo enviado al modelo (px). */
export const MAX_SIDE_PX = 2048;
/** Límite duro del base64 resultante (1 char base64 = 1 byte). */
export const MAX_BASE64_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_MEDIA_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
/** Valor para el atributo `accept` del <input type="file"> del composer. */
export const IMAGE_ACCEPT_ATTR = ACCEPTED_MEDIA_TYPES.join(',');

/** Toast cuando ya no quedan huecos para más imágenes en el turno. */
export const MAX_IMAGES_TOAST = `Máximo ${MAX_IMAGES} imágenes.`;
/** Toast cuando la selección excede los huecos libres (se descartan sobrantes). */
export const MAX_IMAGES_OVERFLOW_TOAST = `Máximo ${MAX_IMAGES} imágenes: se han descartado las sobrantes.`;

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen.'));
    };
    img.src = url;
  });
}

/**
 * Prepara un fichero de imagen para el proveedor: valida el formato, reescala
 * en canvas si pesa >1.5 MB o su lado mayor supera 2048 px (lado mayor 2048,
 * JPEG calidad 0.85) y devuelve el base64 SIN prefijo `data:...;base64,`
 * (contrato AiImageAttachment). Rechaza con Error legible si el resultado
 * sigue por encima de 4 MB.
 */
export async function prepareImage(file: File): Promise<AiImageAttachment> {
  if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
    throw new Error('Formato no soportado: solo PNG, JPEG o WebP.');
  }
  const img = await loadImage(file);
  const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
  let data: string;
  let mediaType: AiImageMediaType;
  if (file.size > RESIZE_BYTES || maxSide > MAX_SIDE_PX) {
    const scale = Math.min(1, MAX_SIDE_PX / maxSide);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen (canvas no disponible).');
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    data = dataUrl.slice(dataUrl.indexOf(',') + 1);
    mediaType = 'image/jpeg';
  } else {
    data = await fileToBase64(file);
    mediaType = file.type as AiImageMediaType;
  }
  if (data.length > MAX_BASE64_BYTES) {
    throw new Error('La imagen supera 4 MB incluso tras comprimirla. Usa una captura más pequeña.');
  }
  return { data, mediaType };
}
