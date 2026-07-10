import type { Circuit, Vec2 } from './types';
import { calculateNewPosition, checkCollision } from './physics';

// ---------------------------------------------------------------------------
// Solo (local, hors-ligne) — rejouer un circuit perso sans Supabase.
//
// Logique de tour PURE (aucun DOM, aucun réseau) réutilisant le moteur de
// `physics.ts` : même calcul de position/vitesse et même détection de collision
// que le mode multijoueur.
// ---------------------------------------------------------------------------

export type SoloStatus = 'racing' | 'finished';

export interface SoloState {
  circuit: Circuit;
  position: Vec2;
  velocity: Vec2;
  status: SoloStatus;
  turns: number;
  crashes: number;
}

/** Crée l'état initial : pilote immobile sur la première case de départ. */
export function createSoloState(circuit: Circuit): SoloState {
  const start = circuit.startPositions[0] ?? { x: 0, y: 0 };
  return {
    circuit,
    position: { x: start.x, y: start.y },
    velocity: { x: 0, y: 0 },
    status: 'racing',
    turns: 0,
    crashes: 0,
  };
}

/**
 * Applique une accélération (composantes ∈ {-1,0,1}) et renvoie le nouvel état.
 * Fonction pure : ne mute pas l'état d'entrée.
 *
 * - collision (mur / hors-piste) → crash : respawn au départ, vitesse remise à
 *   zéro, compteur de crashs incrémenté ;
 * - case d'arrivée atteinte → statut « finished ».
 */
export function stepSolo(state: SoloState, acceleration: Vec2): SoloState {
  if (state.status === 'finished') {
    return state; // course terminée — no-op
  }

  const { newPosition, newVelocity } = calculateNewPosition(
    state.position,
    state.velocity,
    acceleration,
  );

  const { crashed } = checkCollision(state.position, newPosition, state.circuit.cells);
  const turns = state.turns + 1;

  if (crashed) {
    const respawn = nearestStart(state.circuit, state.position);
    return {
      ...state,
      position: { x: respawn.x, y: respawn.y },
      velocity: { x: 0, y: 0 },
      turns,
      crashes: state.crashes + 1,
    };
  }

  const onFinish = state.circuit.finishLine.some(
    (p) => p.x === newPosition.x && p.y === newPosition.y,
  );

  return {
    ...state,
    position: newPosition,
    velocity: newVelocity,
    turns,
    status: onFinish ? 'finished' : 'racing',
  };
}

/** Case de départ la plus proche du point de crash (fallback respawn). */
function nearestStart(circuit: Circuit, from: Vec2): Vec2 {
  const starts = circuit.startPositions;
  if (starts.length === 0) return from;

  let best = starts[0];
  let bestDist = Infinity;
  for (const s of starts) {
    const dx = s.x - from.x;
    const dy = s.y - from.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
