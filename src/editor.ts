import type { Circuit, Vec2, CellType } from './types';
import { validateCircuit } from './circuit';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dimensions de la grille d'édition — identiques aux circuits auto-générés. */
export const EDITOR_WIDTH = 40;
export const EDITOR_HEIGHT = 30;

/** Plafond local pour éviter de saturer localStorage. */
export const MAX_SAVED_CIRCUITS = 20;

const STORAGE_KEY = 'rt_circuits';

const CELL_TYPES: ReadonlySet<string> = new Set<CellType>(['track', 'wall', 'start', 'finish']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Un circuit dessiné et nommé, tel que persisté en local. */
export interface SavedCircuit {
  id: string;
  name: string;
  circuit: Circuit;
}

/** Sous-ensemble de localStorage utilisé ici — injectable pour les tests. */
export interface CircuitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Modèle d'édition — fonctions pures (aucun DOM, aucun réseau)
// ---------------------------------------------------------------------------

/** Crée un circuit vierge : entièrement en murs, sans départ ni arrivée. */
export function createEmptyCircuit(width: number, height: number): Circuit {
  const cells: CellType[][] = Array.from({ length: height }, () =>
    Array<CellType>(width).fill('wall'),
  );
  return {
    width,
    height,
    cells,
    startPositions: [],
    finishLine: [],
    centerline: [],
  };
}

/**
 * Applique un outil (type de cellule) à une position. Fonction pure : renvoie
 * un nouveau circuit, sans muter l'original. Maintient la cohérence entre la
 * grille `cells` et les listes `startPositions` / `finishLine`.
 *
 * - `'track'` / `'wall'` : pose / efface, retire la case des listes start/finish.
 * - `'start'` / `'finish'` : marque la case et l'ajoute à la liste correspondante.
 */
export function applyTool(circuit: Circuit, pos: Vec2, tool: CellType): Circuit {
  const { x, y } = pos;
  if (x < 0 || y < 0 || x >= circuit.width || y >= circuit.height) {
    return circuit; // hors limites — no-op
  }

  const cells = circuit.cells.map((row) => row.slice());
  cells[y][x] = tool;

  const sameAs = (p: Vec2) => p.x === x && p.y === y;

  const startPositions = circuit.startPositions.filter((p) => !sameAs(p));
  const finishLine = circuit.finishLine.filter((p) => !sameAs(p));

  if (tool === 'start') {
    startPositions.push({ x, y });
  } else if (tool === 'finish') {
    finishLine.push({ x, y });
  }

  return { ...circuit, cells, startPositions, finishLine };
}

// ---------------------------------------------------------------------------
// Validation — réutilise le BFS de circuit.ts (pas de réimplémentation)
// ---------------------------------------------------------------------------

/**
 * Valide un circuit dessiné pour la sauvegarde, en réutilisant exactement la
 * logique de jouabilité (`validateCircuit`). Renvoie un message clair en cas
 * de refus.
 */
export function validateForSave(circuit: Circuit): ValidationResult {
  if (circuit.startPositions.length === 0) {
    return { ok: false, error: 'Place une case de départ.' };
  }
  if (circuit.finishLine.length === 0) {
    return { ok: false, error: "Place une ligne d'arrivée." };
  }
  if (!validateCircuit(circuit)) {
    return {
      ok: false,
      error: "Circuit infranchissable : aucun chemin du départ jusqu'à l'arrivée.",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sérialisation — round-trip identique au schéma consommé par physics/renderer
// ---------------------------------------------------------------------------

export function serializeCircuit(circuit: Circuit): string {
  return JSON.stringify(circuit);
}

/** Désérialise et valide la *forme* du circuit (pas sa jouabilité). */
export function deserializeCircuit(json: string): Circuit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Format de circuit invalide : JSON illisible.');
  }
  return assertCircuitShape(parsed);
}

function assertCircuitShape(value: unknown): Circuit {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Format de circuit invalide.');
  }
  const c = value as Record<string, unknown>;

  if (typeof c.width !== 'number' || typeof c.height !== 'number') {
    throw new Error('Format de circuit invalide : dimensions manquantes.');
  }
  if (!Array.isArray(c.cells) || c.cells.length !== c.height) {
    throw new Error('Format de circuit invalide : grille incohérente.');
  }
  for (const row of c.cells) {
    if (!Array.isArray(row) || row.length !== c.width) {
      throw new Error('Format de circuit invalide : ligne de grille incohérente.');
    }
    for (const cell of row) {
      if (!CELL_TYPES.has(cell as string)) {
        throw new Error('Format de circuit invalide : type de cellule inconnu.');
      }
    }
  }
  assertVecArray(c.startPositions, 'startPositions');
  assertVecArray(c.finishLine, 'finishLine');
  assertVecArray(c.centerline, 'centerline');

  return {
    width: c.width,
    height: c.height,
    cells: c.cells as CellType[][],
    startPositions: c.startPositions as Vec2[],
    finishLine: c.finishLine as Vec2[],
    centerline: c.centerline as Vec2[],
  };
}

function assertVecArray(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`Format de circuit invalide : ${field} manquant.`);
  }
  for (const v of value) {
    if (typeof v !== 'object' || v === null ||
        typeof (v as Vec2).x !== 'number' || typeof (v as Vec2).y !== 'number') {
      throw new Error(`Format de circuit invalide : ${field} mal formé.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Persistance localStorage (storage injectable → tests hermétiques)
// ---------------------------------------------------------------------------

function defaultStorage(): CircuitStorage {
  // `localStorage` n'existe qu'en navigateur ; ce chemin n'est jamais pris par
  // les tests hermétiques (qui injectent un stub).
  return localStorage as unknown as CircuitStorage;
}

export function listSavedCircuits(storage: CircuitStorage = defaultStorage()): SavedCircuit[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Valide la forme de chaque circuit ; ignore silencieusement les entrées corrompues.
    return parsed
      .map((entry): SavedCircuit | null => {
        try {
          return {
            id: String((entry as SavedCircuit).id),
            name: String((entry as SavedCircuit).name),
            circuit: assertCircuitShape((entry as SavedCircuit).circuit),
          };
        } catch {
          return null;
        }
      })
      .filter((e): e is SavedCircuit => e !== null);
  } catch {
    return [];
  }
}

/**
 * Valide puis persiste un circuit dessiné. Lève une erreur (message clair) si
 * le circuit est infranchissable ou si le plafond est atteint.
 */
export function saveCircuit(
  name: string,
  circuit: Circuit,
  storage: CircuitStorage = defaultStorage(),
): SavedCircuit {
  const validation = validateForSave(circuit);
  if (!validation.ok) {
    throw new Error(validation.error ?? 'Circuit invalide.');
  }

  const existing = listSavedCircuits(storage);
  if (existing.length >= MAX_SAVED_CIRCUITS) {
    throw new Error(
      `Limite de ${MAX_SAVED_CIRCUITS} circuits atteinte. Supprime-en un d'abord.`,
    );
  }

  const saved: SavedCircuit = {
    id: generateId(),
    name: name.trim() || 'Sans nom',
    circuit,
  };

  storage.setItem(STORAGE_KEY, JSON.stringify([...existing, saved]));
  return saved;
}

export function deleteSavedCircuit(
  id: string,
  storage: CircuitStorage = defaultStorage(),
): void {
  const remaining = listSavedCircuits(storage).filter((c) => c.id !== id);
  storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `c_${Date.now().toString(36)}_${idCounter}`;
}
