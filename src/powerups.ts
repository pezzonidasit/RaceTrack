import type { Vec2, Circuit, CellType } from './types';
import { checkCollision } from './physics';

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
