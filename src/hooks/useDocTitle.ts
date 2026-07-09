import { useCallback, useState } from 'react';

/**
 * Título de documento persistido en localStorage, para módulos cuyo modelo de
 * cálculo NO vive en `useModuleState` (FEM 1D, muros de fábrica, taludes).
 *
 * El título se mantiene DELIBERADAMENTE fuera del estado de cálculo: en esos
 * módulos el estado alimenta un solver pesado (PySlope, FEM) y/o un hash de
 * procedencia (inputsFingerprint). Si el título viviera ahí, teclearlo
 * reejecutaría el solver y contaminaría el hash del cálculo. Al almacenarlo
 * aparte se cumple "excluir el título del fingerprint" por construcción.
 *
 * No viaja en el enlace compartido: es metadato del documento del usuario, no
 * del caso de cálculo.
 */
export function useDocTitle(storageKey: string): [string, (t: string) => void] {
  const [title, set] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  const setTitle = useCallback(
    (t: string) => {
      set(t);
      try {
        localStorage.setItem(storageKey, t);
      } catch {
        /* almacenamiento no disponible (modo privado): el título vive solo en memoria */
      }
    },
    [storageKey],
  );
  return [title, setTitle];
}
