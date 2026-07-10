import type { Circuit, Vec2 } from './types';
import type { MoveOption } from './physics';
import { getPossibleMoves, checkCollision } from './physics';

// ---------------------------------------------------------------------------
// RNG seedable — mulberry32 (déterministe, reproductible pour les tests)
// ---------------------------------------------------------------------------

export type Rng = () => number;

/**
 * PRNG déterministe seedable. Retourne une fonction qui produit des nombres
 * dans [0,1). Pas de Math.random() : le chemin IA reste reproductible.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Géométrie centerline
// ---------------------------------------------------------------------------

/**
 * Distance signée la plus courte de `from` vers `to` sur un anneau de taille `n`.
 * Positif = sens de progression (index croissant), négatif = recul.
 */
export function signedArc(from: number, to: number, n: number): number {
  if (n <= 0) return 0;
  let d = (((to - from) % n) + n) % n;
  if (d > n / 2) d -= n;
  return d;
}

/**
 * Index du point de la centerline le plus proche de `pos` (distance au carré).
 */
export function nearestCenterlineIndex(pos: Vec2, centerline: Vec2[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centerline.length; i++) {
    const dx = centerline[i].x - pos.x;
    const dy = centerline[i].y - pos.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Choix de coup — heuristique lisible
// ---------------------------------------------------------------------------

export interface AiState {
  position: Vec2;
  velocity: Vec2;
}

// Pondérations de l'heuristique (un seul niveau « normal » pour le V1 solo).
const PROGRESS_WEIGHT = 10; // priorité : avancer vers l'arrivée
const DEAD_END_PENALTY = 1000; // forte pénalité si le coup mène à une impasse

/**
 * Choisit le meilleur coup légal depuis l'état courant :
 *   1. énumère les 9 coups (mêmes règles ±1/axe que le joueur),
 *   2. élimine ceux qui crashent (collision Bresenham — moteur partagé),
 *   3. score chaque coup légal par progression sur la centerline + sécurité
 *      anti-mur (au moins une continuation légale au tour suivant),
 *   4. choisit le score max ; départage seedable via `rng`.
 *
 * Si aucun coup n'est légal (voiture piégée), retourne le coup le plus lent
 * pour limiter la casse — le crash/respawn sera géré par le moteur de course.
 */
export function chooseMove(state: AiState, circuit: Circuit, rng?: Rng): MoveOption {
  const { cells, centerline } = circuit;
  const options = getPossibleMoves(state.position, state.velocity);
  const curIndex = nearestCenterlineIndex(state.position, centerline);
  const n = centerline.length;

  const legal = options.filter(
    o => !checkCollision(state.position, o.target, cells).crashed,
  );

  // Aucun coup légal : freiner au maximum (coup minimisant la vitesse).
  if (legal.length === 0) {
    return options.reduce((best, o) =>
      speedSquared(o.newVelocity) < speedSquared(best.newVelocity) ? o : best,
    );
  }

  let best: MoveOption | null = null;
  let bestScore = -Infinity;

  for (const o of legal) {
    const score = scoreMove(o, curIndex, n, cells, centerline);
    const tieBreak = rng ? rng() : 0;
    // On compare au score ; en cas d'égalité, le tie-break seedable tranche.
    if (
      score > bestScore ||
      (score === bestScore && best !== null && tieBreak > 0.5)
    ) {
      bestScore = score;
      best = o;
    }
  }

  return best ?? legal[0];
}

function scoreMove(
  o: MoveOption,
  curIndex: number,
  n: number,
  cells: Circuit['cells'],
  centerline: Vec2[],
): number {
  const nextIndex = nearestCenterlineIndex(o.target, centerline);
  const progress = signedArc(curIndex, nextIndex, n);

  // Sécurité : le coup laisse-t-il une continuation légale au tour suivant ?
  const safeContinuations = getPossibleMoves(o.target, o.newVelocity).filter(
    next => !checkCollision(o.target, next.target, cells).crashed,
  ).length;

  let score = progress * PROGRESS_WEIGHT;
  if (safeContinuations === 0) {
    score -= DEAD_END_PENALTY; // impasse : à éviter (freiner avant le mur)
  } else {
    // Bonus marginal pour garder des options ouvertes (conduite prudente).
    score += safeContinuations;
  }
  return score;
}

function speedSquared(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}
