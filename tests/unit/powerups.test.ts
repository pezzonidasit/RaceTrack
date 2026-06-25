import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  POWERUPS_ENABLED,
  POWERUP_EFFECTS,
  POWERUP_TYPES,
  emptyState,
  placePowerUps,
} from '../../src/powerups';
import { validateCircuit } from '../../src/circuit';

import type { Circuit, CellType, Vec2 } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers — a small valid circuit with an open track interior
// ---------------------------------------------------------------------------

/**
 * 10×10 grid: outer ring of walls, interior is track.
 * Start positions and finish line carved into the track.
 */
function makeCircuit(): Circuit {
  const width = 10;
  const height = 10;
  const cells: CellType[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (__, x): CellType => {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return 'wall';
      return 'track';
    }),
  );

  const startPositions: Vec2[] = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
  const finishLine: Vec2[] = [{ x: 1, y: 8 }, { x: 2, y: 8 }];
  for (const p of startPositions) cells[p.y][p.x] = 'start';
  for (const p of finishLine) cells[p.y][p.x] = 'finish';

  const centerline: Vec2[] = [];
  for (let y = 1; y <= 8; y++) centerline.push({ x: 1, y });

  return { width, height, cells, startPositions, finishLine, centerline };
}

function cloneCells(cells: CellType[][]): CellType[][] {
  return cells.map(row => row.slice());
}

// ---------------------------------------------------------------------------
// Model + effect table
// ---------------------------------------------------------------------------

describe('powerups — modèle et table d\'effets', () => {
  it('définit au moins 3 types de power-ups', () => {
    assert.ok(POWERUP_TYPES.length >= 3, 'au moins 3 types attendus');
  });

  it('inclut boost, shield et teleport', () => {
    assert.ok(POWERUP_TYPES.includes('boost'));
    assert.ok(POWERUP_TYPES.includes('shield'));
    assert.ok(POWERUP_TYPES.includes('teleport'));
  });

  it('chaque type a une entrée dans la table d\'effets avec un label', () => {
    for (const t of POWERUP_TYPES) {
      const effect = POWERUP_EFFECTS[t];
      assert.ok(effect, `effet manquant pour ${t}`);
      assert.ok(typeof effect.label === 'string' && effect.label.length > 0);
    }
  });

  it('le boost est borné dans le temps (durationTurns > 0)', () => {
    assert.ok(POWERUP_EFFECTS.boost.durationTurns > 0);
  });

  it('le bouclier a au moins 1 charge', () => {
    assert.ok(POWERUP_EFFECTS.shield.charges >= 1);
  });

  it('le téléport a une distance bornée (jumpCells > 0)', () => {
    assert.ok(POWERUP_EFFECTS.teleport.jumpCells > 0);
  });

  it('emptyState() retourne un état sans effet actif', () => {
    const s = emptyState();
    assert.strictEqual(s.boostTurnsLeft, 0);
    assert.strictEqual(s.shieldCharges, 0);
  });

  it('le flag POWERUPS_ENABLED est un booléen', () => {
    assert.strictEqual(typeof POWERUPS_ENABLED, 'boolean');
  });
});

// ---------------------------------------------------------------------------
// placePowerUps — placement déterministe seedé
// ---------------------------------------------------------------------------

describe('placePowerUps — placement', () => {
  it('retourne [] quand le flag est désactivé', () => {
    const circuit = makeCircuit();
    const result = placePowerUps(circuit, 42, 3, false);
    assert.deepStrictEqual(result, []);
  });

  it('place le nombre demandé de power-ups (si assez de cases libres)', () => {
    const circuit = makeCircuit();
    const result = placePowerUps(circuit, 42, 3, true);
    assert.strictEqual(result.length, 3);
  });

  it('est déterministe : même seed → placement identique', () => {
    const circuit = makeCircuit();
    const a = placePowerUps(circuit, 123, 3, true);
    const b = placePowerUps(circuit, 123, 3, true);
    assert.deepStrictEqual(a, b);
  });

  it('place uniquement sur des cases track (jamais wall/start/finish)', () => {
    const circuit = makeCircuit();
    const result = placePowerUps(circuit, 7, 3, true);
    for (const pu of result) {
      assert.strictEqual(circuit.cells[pu.cell.y][pu.cell.x], 'track');
    }
  });

  it('ne place jamais deux power-ups sur la même case', () => {
    const circuit = makeCircuit();
    const result = placePowerUps(circuit, 99, 3, true);
    const keys = new Set(result.map(pu => `${pu.cell.x},${pu.cell.y}`));
    assert.strictEqual(keys.size, result.length);
  });

  it('garantit au moins un de chaque type quand count >= 3', () => {
    const circuit = makeCircuit();
    const result = placePowerUps(circuit, 5, 3, true);
    const types = new Set(result.map(pu => pu.type));
    assert.ok(types.has('boost'));
    assert.ok(types.has('shield'));
    assert.ok(types.has('teleport'));
  });

  it('ne mute jamais circuit.cells (overlay only — BFS intact)', () => {
    const circuit = makeCircuit();
    const before = cloneCells(circuit.cells);
    placePowerUps(circuit, 11, 3, true);
    assert.deepStrictEqual(circuit.cells, before);
    // La validation BFS reste vraie après placement
    assert.strictEqual(validateCircuit(circuit), true);
  });
});
