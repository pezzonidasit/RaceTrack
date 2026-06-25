import type { Vec2, Circuit, CellType } from './types';
import { calculateNewPosition, checkCollision } from './physics';

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Master switch for the power-ups feature. Flip to `false` to ship a build
 * without power-ups (placement returns [] and the game renders/resolves as
 * before), preserving game balance until the mechanic is tuned.
 */
export const POWERUPS_ENABLED = true;

// ---------------------------------------------------------------------------
// Model + effect table
// ---------------------------------------------------------------------------

export type PowerUpType = 'boost' | 'shield' | 'teleport';

/** Ordered list of types — first `n` are guaranteed when placing `n` power-ups. */
export const POWERUP_TYPES: PowerUpType[] = ['boost', 'shield', 'teleport'];

export interface PowerUp {
  type: PowerUpType;
  cell: Vec2;
}

export interface PowerUpEffect {
  label: string;
  /** Boost: number of turns the speed bonus stays active after pickup. */
  durationTurns: number;
  /** Shield: number of crashes absorbed before the shield is spent. */
  charges: number;
  /** Teleport: number of centerline cells jumped forward on pickup. */
  jumpCells: number;
}

/**
 * Bounded, balance-friendly effect parameters. Every effect is finite in time
 * (boost), charges (shield), or distance (teleport).
 */
export const POWERUP_EFFECTS: Record<PowerUpType, PowerUpEffect> = {
  boost:    { label: 'Boost',    durationTurns: 3, charges: 0, jumpCells: 0 },
  shield:   { label: 'Bouclier', durationTurns: 0, charges: 1, jumpCells: 0 },
  teleport: { label: 'Téléport', durationTurns: 0, charges: 0, jumpCells: 4 },
};

/** Per-player effect state carried across turns. */
export interface PowerUpState {
  boostTurnsLeft: number;
  shieldCharges: number;
}

export function emptyState(): PowerUpState {
  return { boostTurnsLeft: 0, shieldCharges: 0 };
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic placement, zero dependencies
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Place `count` power-ups on free `track` cells of a validated circuit.
 *
 * Power-ups are an OVERLAY: this never writes into `circuit.cells`, so the BFS
 * circuit validation is unaffected. Placement is fully deterministic for a
 * given (circuit, seed) pair. The first `POWERUP_TYPES.length` power-ups cycle
 * through the types so each type appears at least once when `count >= 3`.
 */
export function placePowerUps(
  circuit: Circuit,
  seed: number,
  count: number,
  enabled: boolean = POWERUPS_ENABLED,
): PowerUp[] {
  if (!enabled || count <= 0) return [];

  // Eligible = plain track cells only (never start/finish/wall).
  const eligible: Vec2[] = [];
  for (let y = 0; y < circuit.height; y++) {
    for (let x = 0; x < circuit.width; x++) {
      if (circuit.cells[y]?.[x] === 'track') {
        eligible.push({ x, y });
      }
    }
  }

  if (eligible.length === 0) return [];

  // Deterministic shuffle (Fisher–Yates with seeded RNG).
  const rng = mulberry32(seed);
  const pool = eligible.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Greedily pick spread-out cells: keep a minimum spacing when possible so
  // power-ups don't cluster, but fall back to any free cell if the track is
  // too small to honour the spacing.
  const minSpacing = 2;
  const chosen: Vec2[] = [];
  for (const cell of pool) {
    if (chosen.length >= count) break;
    const farEnough = chosen.every(c => {
      const dx = c.x - cell.x;
      const dy = c.y - cell.y;
      return Math.abs(dx) + Math.abs(dy) >= minSpacing;
    });
    if (farEnough) chosen.push(cell);
  }
  // Top up ignoring spacing if we couldn't place enough spread-out cells.
  if (chosen.length < count) {
    for (const cell of pool) {
      if (chosen.length >= count) break;
      if (!chosen.some(c => c.x === cell.x && c.y === cell.y)) {
        chosen.push(cell);
      }
    }
  }

  return chosen.map((cell, i) => ({
    type: POWERUP_TYPES[i % POWERUP_TYPES.length],
    cell,
  }));
}

// ---------------------------------------------------------------------------
// Pickup detection
// ---------------------------------------------------------------------------

/** Return the power-up occupying `cell`, or null if none. */
export function findPowerUpAt(powerups: PowerUp[], cell: Vec2): PowerUp | null {
  for (const pu of powerups) {
    if (pu.cell.x === cell.x && pu.cell.y === cell.y) return pu;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Effect helpers
// ---------------------------------------------------------------------------

/**
 * Boost effect: add +1 of speed in the current direction of each moving axis.
 * Bounded (only +1 per axis per turn) and only active while a boost is running.
 */
export function boostedVelocity(velocity: Vec2): Vec2 {
  return {
    x: velocity.x + Math.sign(velocity.x),
    y: velocity.y + Math.sign(velocity.y),
  };
}

/**
 * Teleport effect: jump `jumpCells` forward along the centerline from the
 * nearest centerline point, clamped to the last point. Centerline cells are
 * guaranteed on-track, so the landing is always safe.
 */
export function teleportPosition(
  position: Vec2,
  centerline: Vec2[],
  jumpCells: number,
): Vec2 {
  if (centerline.length === 0) return position;

  let closest = 0;
  let closestDist = Infinity;
  for (let i = 0; i < centerline.length; i++) {
    const dx = centerline[i].x - position.x;
    const dy = centerline[i].y - position.y;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }

  const target = Math.min(centerline.length - 1, closest + jumpCells);
  return { x: centerline[target].x, y: centerline[target].y };
}

// ---------------------------------------------------------------------------
// resolveMove — turn orchestrator
// ---------------------------------------------------------------------------

export interface ResolveInput {
  position: Vec2;
  velocity: Vec2;
  acceleration: Vec2;
  cells: CellType[][];
  centerline: Vec2[];
  powerups: PowerUp[];
  state: PowerUpState;
}

export interface ResolveResult {
  position: Vec2;
  velocity: Vec2;
  crashed: boolean;
  pickedUp: PowerUp | null;
  /** Updated effect state for the next turn. */
  state: PowerUpState;
  /** Remaining power-ups on the track (picked-up one removed). */
  powerups: PowerUp[];
}

/**
 * Resolve a single move with power-up effects layered on top of the base
 * physics. Pure: inputs are never mutated, a fresh state/powerups list is
 * returned. The integration order is:
 *
 *  1. Base physics (velocity += acceleration), then boost bonus if active.
 *  2. Collision check along the boosted path.
 *  3. Tick the entering boost (decrement, expire at 0).
 *  4. Shield absorbs a crash: stay in place, velocity zeroed, charge spent.
 *  5. On a clean move, pick up a power-up on the landing cell and activate it
 *     (boost → timer, shield → charge, teleport → forward jump).
 */
export function resolveMove(input: ResolveInput): ResolveResult {
  const { position, velocity, acceleration, cells, centerline, powerups, state } = input;

  // 1. Base physics + boost bonus (boost applies while it is still active).
  const base = calculateNewPosition(position, velocity, acceleration);
  const boostActive = state.boostTurnsLeft > 0;
  let newVelocity = boostActive ? boostedVelocity(base.newVelocity) : base.newVelocity;
  let newPosition: Vec2 = {
    x: position.x + newVelocity.x,
    y: position.y + newVelocity.y,
  };

  // 2. Collision along the (possibly boosted) path.
  let crashed = checkCollision(position, newPosition, cells).crashed;

  // 3. Tick the boost that was active entering this move.
  const nextState: PowerUpState = {
    boostTurnsLeft: Math.max(0, state.boostTurnsLeft - 1),
    shieldCharges: state.shieldCharges,
  };

  // 4. Shield absorbs the crash.
  if (crashed && nextState.shieldCharges > 0) {
    crashed = false;
    nextState.shieldCharges -= 1;
    newPosition = { x: position.x, y: position.y };
    newVelocity = { x: 0, y: 0 };
    return {
      position: newPosition,
      velocity: newVelocity,
      crashed,
      pickedUp: null,
      state: nextState,
      powerups,
    };
  }

  if (crashed) {
    return {
      position: newPosition,
      velocity: newVelocity,
      crashed,
      pickedUp: null,
      state: nextState,
      powerups,
    };
  }

  // 5. Pick up a power-up on the landing cell.
  const pickedUp = findPowerUpAt(powerups, newPosition);
  let remaining = powerups;
  if (pickedUp) {
    remaining = powerups.filter(pu => pu !== pickedUp);
    const effect = POWERUP_EFFECTS[pickedUp.type];
    switch (pickedUp.type) {
      case 'boost':
        nextState.boostTurnsLeft = effect.durationTurns;
        break;
      case 'shield':
        nextState.shieldCharges += effect.charges;
        break;
      case 'teleport':
        newPosition = teleportPosition(newPosition, centerline, effect.jumpCells);
        break;
    }
  }

  return {
    position: newPosition,
    velocity: newVelocity,
    crashed,
    pickedUp,
    state: nextState,
    powerups: remaining,
  };
}
