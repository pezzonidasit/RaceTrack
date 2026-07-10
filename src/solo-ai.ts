import type { Circuit, Vec2 } from './types';
import { PLAYER_COLORS } from './types';
import type { MoveOption } from './physics';
import { calculateNewPosition, checkCollision, getRespawnPosition } from './physics';
import { createRng, nearestCenterlineIndex, signedArc, chooseMove } from './ai';
import type { Rng } from './ai';

// ---------------------------------------------------------------------------
// Modèle de course solo — 100 % local, sans DOM ni réseau.
// ---------------------------------------------------------------------------

export type SoloRacerStatus = 'racing' | 'finished';

export interface SoloRacer {
  id: string;
  name: string;
  color: string;
  isAi: boolean;
  position: Vec2;
  velocity: Vec2;
  status: SoloRacerStatus;
  finishPosition: number | null;
  /** Avancement cumulé (déroulé) le long de la centerline depuis le départ. */
  lapProgress: number;
  /** Index de centerline le plus proche au dernier coup (pour dérouler le wrap). */
  lastIndex: number;
  /** Progression à atteindre pour franchir l'arrivée. */
  targetProgress: number;
  /** A crashé au moins une fois (impacte le bonus « sans crash »). */
  everCrashed: boolean;
  /** Tour où le racer a franchi l'arrivée. */
  finishTurn: number | null;
}

export type SoloStatus = 'playing' | 'finished';

export interface SoloRace {
  circuit: Circuit;
  racers: SoloRacer[];
  currentIndex: number;
  turn: number;
  status: SoloStatus;
  rng: Rng;
  nextRank: number;
  maxTurns: number;
}

export interface CreateSoloRaceOptions {
  circuit: Circuit;
  opponentCount: number;
  seed?: number;
  playerName?: string;
  aiNames?: string[];
  maxTurns?: number;
}

const DEFAULT_AI_NAMES = ['Rapido', 'Bolide', 'Turbo'];

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export function createSoloRace(opts: CreateSoloRaceOptions): SoloRace {
  const { circuit } = opts;
  const opponentCount = clamp(opts.opponentCount, 1, 3);
  const seed = opts.seed ?? 1;
  const rng = createRng(seed);

  const centerline = circuit.centerline;
  const n = centerline.length;
  const finishIndex = circuit.finishLine.length > 0
    ? nearestCenterlineIndex(circuit.finishLine[0], centerline)
    : 0;

  const racers: SoloRacer[] = [];
  const total = opponentCount + 1;
  const aiNames = opts.aiNames ?? DEFAULT_AI_NAMES;

  for (let i = 0; i < total; i++) {
    const isAi = i > 0;
    const start = pickStart(circuit, i);
    const startIndex = n > 0 ? nearestCenterlineIndex(start, centerline) : 0;
    // Arc avant à parcourir : du départ jusqu'à l'arrivée (tour complet si confondus).
    let targetProgress = n > 0 ? (((finishIndex - startIndex) % n) + n) % n : 0;
    if (targetProgress === 0 && n > 0) targetProgress = n;

    racers.push({
      id: isAi ? `ai-${i}` : 'human',
      name: isAi ? (aiNames[i - 1] ?? `IA ${i}`) : (opts.playerName ?? 'Vous'),
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      isAi,
      position: { ...start },
      velocity: { x: 0, y: 0 },
      status: 'racing',
      finishPosition: null,
      lapProgress: 0,
      lastIndex: startIndex,
      targetProgress,
      everCrashed: false,
      finishTurn: null,
    });
  }

  return {
    circuit,
    racers,
    currentIndex: 0,
    turn: 0,
    status: 'playing',
    rng,
    nextRank: 1,
    maxTurns: opts.maxTurns ?? Math.max(60, n * 4),
  };
}

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

export function currentRacer(race: SoloRace): SoloRacer {
  return race.racers[race.currentIndex];
}

export function isHumanTurn(race: SoloRace): boolean {
  const r = currentRacer(race);
  return !!r && !r.isAi && r.status === 'racing';
}

/** Coups légaux possibles pour le racer courant (pour l'UI joueur). */
export function aiChooseMove(race: SoloRace, racer: SoloRacer): MoveOption {
  return chooseMove(
    { position: racer.position, velocity: racer.velocity },
    race.circuit,
    race.rng,
  );
}

// ---------------------------------------------------------------------------
// Application d'un coup
// ---------------------------------------------------------------------------

/**
 * Applique le coup `move` au racer `racerId` : physique partagée, gestion du
 * crash (respawn), mise à jour de la progression, détection d'arrivée, puis
 * passage au racer suivant. Aucune triche : tout passe par le moteur.
 */
export function applyMove(race: SoloRace, racerId: string, move: MoveOption): void {
  if (race.status !== 'playing') return;

  const racer = race.racers.find(r => r.id === racerId);
  if (!racer || racer.status !== 'racing') return;

  const { cells, centerline } = race.circuit;
  const n = centerline.length;

  const result = calculateNewPosition(racer.position, racer.velocity, move.acceleration);
  const collision = checkCollision(racer.position, result.newPosition, cells);

  if (collision.crashed) {
    // Respawn sur la centerline, vitesse remise à zéro.
    racer.everCrashed = true;
    const respawn = getRespawnPosition(result.newPosition, centerline);
    racer.position = { ...respawn };
    racer.velocity = { x: 0, y: 0 };
  } else {
    racer.position = result.newPosition;
    racer.velocity = result.newVelocity;
  }

  // Déroule la progression le long de la centerline (gère le wrap).
  if (n > 0) {
    const newIndex = nearestCenterlineIndex(racer.position, centerline);
    racer.lapProgress += signedArc(racer.lastIndex, newIndex, n);
    racer.lastIndex = newIndex;
  }

  // Détection d'arrivée : a parcouru tout l'arc avant jusqu'à la ligne.
  if (!collision.crashed && racer.lapProgress >= racer.targetProgress) {
    racer.status = 'finished';
    racer.finishPosition = race.nextRank++;
    racer.finishTurn = race.turn;
  }

  advanceTurn(race, racer);
}

function advanceTurn(race: SoloRace, justMoved: SoloRacer): void {
  // Fin anticipée : dès que le joueur humain franchit l'arrivée, la course
  // s'arrête (les IA restantes sont classées par progression).
  if (justMoved.status === 'finished' && !justMoved.isAi) {
    race.status = 'finished';
    return;
  }

  const racingLeft = race.racers.some(r => r.status === 'racing');
  if (!racingLeft) {
    race.status = 'finished';
    return;
  }

  let idx = race.currentIndex;
  for (let i = 0; i < race.racers.length; i++) {
    idx = (idx + 1) % race.racers.length;
    if (idx === 0) race.turn += 1; // nouveau tour de table
    if (race.racers[idx].status === 'racing') {
      race.currentIndex = idx;
      break;
    }
  }

  if (race.turn >= race.maxTurns) {
    race.status = 'finished';
  }
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------

/**
 * Classement final : les arrivés d'abord (par position d'arrivée croissante),
 * puis les non-arrivés par progression décroissante.
 */
export function getFinalRanking(race: SoloRace): SoloRacer[] {
  const finished = race.racers
    .filter(r => r.finishPosition !== null)
    .sort((a, b) => (a.finishPosition ?? 0) - (b.finishPosition ?? 0));
  const unfinished = race.racers
    .filter(r => r.finishPosition === null)
    .sort((a, b) => b.lapProgress - a.lapProgress);
  return [...finished, ...unfinished];
}

/** Place 1-indexée du joueur humain dans le classement final. */
export function getHumanPlace(race: SoloRace): number {
  const ranking = getFinalRanking(race);
  const idx = ranking.findIndex(r => !r.isAi);
  return idx === -1 ? ranking.length : idx + 1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickStart(circuit: Circuit, i: number): Vec2 {
  const starts = circuit.startPositions;
  if (starts.length === 0) return { x: 0, y: 0 };
  return { ...(starts[i] ?? starts[starts.length - 1]) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
