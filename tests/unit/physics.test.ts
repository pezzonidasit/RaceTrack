import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  calculateNewPosition,
  checkCollision,
  getPossibleMoves,
  getRespawnPosition,
} from '../../src/physics';

import type { CellType } from '../../src/types';

// ---------------------------------------------------------------------------
// calculateNewPosition
// ---------------------------------------------------------------------------

describe('calculateNewPosition', () => {
  it('position nulle + vitesse nulle + accélération nulle = position nulle', () => {
    const result = calculateNewPosition({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    assert.deepStrictEqual(result.newPosition, { x: 0, y: 0 });
    assert.deepStrictEqual(result.newVelocity, { x: 0, y: 0 });
  });

  it('accélération simple : vitesse et position calculées correctement', () => {
    // pos(2,3) + vel(1,0) + acc(1,1) → newVel(2,1) → newPos(4,4)
    const result = calculateNewPosition({ x: 2, y: 3 }, { x: 1, y: 0 }, { x: 1, y: 1 });
    assert.deepStrictEqual(result.newVelocity, { x: 2, y: 1 });
    assert.deepStrictEqual(result.newPosition, { x: 4, y: 4 });
  });

  it('décélération : vitesse peut devenir négative', () => {
    // pos(5,5) + vel(2,2) + acc(-2,-2) → newVel(0,0) → newPos(5,5)
    const result = calculateNewPosition({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: -2, y: -2 });
    assert.deepStrictEqual(result.newVelocity, { x: 0, y: 0 });
    assert.deepStrictEqual(result.newPosition, { x: 5, y: 5 });
  });

  it('vitesse persiste sans accélération (inertie)', () => {
    // pos(0,0) + vel(3,-1) + acc(0,0) → newVel(3,-1) → newPos(3,-1)
    const result = calculateNewPosition({ x: 0, y: 0 }, { x: 3, y: -1 }, { x: 0, y: 0 });
    assert.deepStrictEqual(result.newVelocity, { x: 3, y: -1 });
    assert.deepStrictEqual(result.newPosition, { x: 3, y: -1 });
  });
});

// ---------------------------------------------------------------------------
// getPossibleMoves
// ---------------------------------------------------------------------------

describe('getPossibleMoves', () => {
  it('retourne exactement 9 options de mouvement', () => {
    const moves = getPossibleMoves({ x: 5, y: 5 }, { x: 0, y: 0 });
    assert.strictEqual(moves.length, 9);
  });

  it('toutes les accélérations sont dans [-1,1]²', () => {
    const moves = getPossibleMoves({ x: 5, y: 5 }, { x: 2, y: -1 });
    for (const m of moves) {
      assert.ok(m.acceleration.x >= -1 && m.acceleration.x <= 1);
      assert.ok(m.acceleration.y >= -1 && m.acceleration.y <= 1);
    }
  });

  it('les 9 accélérations sont toutes distinctes', () => {
    const moves = getPossibleMoves({ x: 0, y: 0 }, { x: 0, y: 0 });
    const keys = moves.map(m => `${m.acceleration.x},${m.acceleration.y}`);
    const unique = new Set(keys);
    assert.strictEqual(unique.size, 9);
  });

  it('chaque cible est cohérente avec position + vitesse + accélération', () => {
    const pos = { x: 3, y: 4 };
    const vel = { x: 1, y: 2 };
    const moves = getPossibleMoves(pos, vel);
    for (const m of moves) {
      const expectedVel = { x: vel.x + m.acceleration.x, y: vel.y + m.acceleration.y };
      const expectedPos = { x: pos.x + expectedVel.x, y: pos.y + expectedVel.y };
      assert.deepStrictEqual(m.target, expectedPos);
      assert.deepStrictEqual(m.newVelocity, expectedVel);
    }
  });
});

// ---------------------------------------------------------------------------
// checkCollision
// ---------------------------------------------------------------------------

function makeGrid(rows: CellType[][]): CellType[][] {
  return rows;
}

describe('checkCollision', () => {
  it('déplacement sur piste libre = pas de collision', () => {
    const cells: CellType[][] = [
      ['track', 'track', 'track'],
      ['track', 'track', 'track'],
      ['track', 'track', 'track'],
    ];
    const result = checkCollision({ x: 0, y: 0 }, { x: 2, y: 2 }, cells);
    assert.strictEqual(result.crashed, false);
  });

  it('déplacement vers un mur = collision', () => {
    const cells: CellType[][] = [
      ['track', 'track', 'wall'],
      ['track', 'track', 'track'],
      ['track', 'track', 'track'],
    ];
    const result = checkCollision({ x: 0, y: 0 }, { x: 2, y: 0 }, cells);
    assert.strictEqual(result.crashed, true);
  });

  it('déplacement hors grille = collision', () => {
    const cells: CellType[][] = [
      ['track', 'track'],
      ['track', 'track'],
    ];
    const result = checkCollision({ x: 0, y: 0 }, { x: 5, y: 5 }, cells);
    assert.strictEqual(result.crashed, true);
  });

  it('déplacement sur start/finish = pas de collision (cellules non-wall)', () => {
    const cells: CellType[][] = [
      ['start', 'finish', 'track'],
      ['track',  'track',  'track'],
    ];
    const result = checkCollision({ x: 0, y: 0 }, { x: 2, y: 0 }, cells);
    assert.strictEqual(result.crashed, false);
  });

  it('déplacement immobile sur une case track = pas de collision', () => {
    const cells: CellType[][] = [['track']];
    const result = checkCollision({ x: 0, y: 0 }, { x: 0, y: 0 }, cells);
    assert.strictEqual(result.crashed, false);
  });

  it('déplacement immobile sur un mur = collision', () => {
    const cells: CellType[][] = [['wall']];
    const result = checkCollision({ x: 0, y: 0 }, { x: 0, y: 0 }, cells);
    assert.strictEqual(result.crashed, true);
  });
});

// ---------------------------------------------------------------------------
// getRespawnPosition
// ---------------------------------------------------------------------------

describe('getRespawnPosition', () => {
  it('centerline vide = retourne la position du crash', () => {
    const pos = { x: 10, y: 5 };
    const result = getRespawnPosition(pos, []);
    assert.deepStrictEqual(result, pos);
  });

  it('respawn 3 cases en arrière sur la centerline', () => {
    const centerline = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }, // index 3 — le plus proche
      { x: 4, y: 0 },
    ];
    // crash près de l'index 3 → respawn à index max(0, 3-3) = 0
    const result = getRespawnPosition({ x: 3, y: 0 }, centerline);
    assert.deepStrictEqual(result, { x: 0, y: 0 });
  });

  it('respawn clampé à 0 si crash proche du début', () => {
    const centerline = [
      { x: 10, y: 10 },
      { x: 11, y: 10 },
      { x: 12, y: 10 },
    ];
    // crash près index 1 → max(0, 1-3) = 0
    const result = getRespawnPosition({ x: 11, y: 10 }, centerline);
    assert.deepStrictEqual(result, { x: 10, y: 10 });
  });

  it('crash loin de la centerline — choisit le point le plus proche', () => {
    const centerline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    // crash à (21,5) → plus proche = index 2 (20,0) → respawn à max(0,2-3)=0
    const result = getRespawnPosition({ x: 21, y: 5 }, centerline);
    assert.deepStrictEqual(result, { x: 0, y: 0 });
  });
});
