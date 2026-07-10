import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  createRng,
  signedArc,
  nearestCenterlineIndex,
  chooseMove,
} from '../../src/ai';

import { checkCollision } from '../../src/physics';

import type { Circuit, CellType, Vec2 } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Piste horizontale rectiligne : ligne 1 = piste, lignes 0 et 2 = murs.
 * Centerline orientée +x, départ à gauche, arrivée à droite.
 */
function makeStraightCircuit(length: number): Circuit {
  const width = length;
  const height = 3;
  const cells: CellType[][] = [
    Array<CellType>(width).fill('wall'),
    Array<CellType>(width).fill('track'),
    Array<CellType>(width).fill('wall'),
  ];
  const centerline: Vec2[] = [];
  for (let x = 0; x < width; x++) centerline.push({ x, y: 1 });

  cells[1][0] = 'start';
  cells[1][width - 1] = 'finish';

  return {
    width,
    height,
    cells,
    startPositions: [{ x: 1, y: 1 }],
    finishLine: [{ x: width - 1, y: 1 }],
    centerline,
  };
}

// ---------------------------------------------------------------------------
// createRng — RNG seedable déterministe
// ---------------------------------------------------------------------------

describe('createRng', () => {
  it('même seed → même séquence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(a(), b());
    }
  });

  it('seeds différentes → séquences différentes', () => {
    const a = createRng(1);
    const b = createRng(2);
    assert.notStrictEqual(a(), b());
  });

  it('valeurs dans [0,1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, `valeur hors [0,1): ${v}`);
    }
  });
});

// ---------------------------------------------------------------------------
// signedArc — distance signée la plus courte sur un anneau
// ---------------------------------------------------------------------------

describe('signedArc', () => {
  it('avance d\'un cran', () => {
    assert.strictEqual(signedArc(0, 1, 10), 1);
  });

  it('recule d\'un cran via le wrap', () => {
    assert.strictEqual(signedArc(0, 9, 10), -1);
  });

  it('avance via le wrap', () => {
    assert.strictEqual(signedArc(9, 0, 10), 1);
  });

  it('même index = 0', () => {
    assert.strictEqual(signedArc(3, 3, 10), 0);
  });
});

// ---------------------------------------------------------------------------
// nearestCenterlineIndex
// ---------------------------------------------------------------------------

describe('nearestCenterlineIndex', () => {
  it('retourne l\'index du point le plus proche', () => {
    const centerline: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    assert.strictEqual(nearestCenterlineIndex({ x: 11, y: 1 }, centerline), 1);
  });

  it('centerline vide = 0', () => {
    assert.strictEqual(nearestCenterlineIndex({ x: 5, y: 5 }, []), 0);
  });
});

// ---------------------------------------------------------------------------
// chooseMove — légalité + progression
// ---------------------------------------------------------------------------

describe('chooseMove', () => {
  it('le coup choisi est toujours légal (ne crashe pas)', () => {
    const circuit = makeStraightCircuit(12);
    const state = { position: { x: 1, y: 1 }, velocity: { x: 0, y: 0 } };
    const move = chooseMove(state, circuit, createRng(1));
    const collision = checkCollision(state.position, move.target, circuit.cells);
    assert.strictEqual(collision.crashed, false);
  });

  it('progresse vers l\'arrivée (avance en +x sur piste rectiligne)', () => {
    const circuit = makeStraightCircuit(12);
    const state = { position: { x: 1, y: 1 }, velocity: { x: 0, y: 0 } };
    const move = chooseMove(state, circuit, createRng(1));
    assert.ok(move.target.x > state.position.x, `attendu avance en +x, reçu ${JSON.stringify(move.target)}`);
    assert.strictEqual(move.target.y, 1, 'doit rester sur la piste (y=1)');
  });

  it('déterministe : même état + même seed → même coup', () => {
    const circuit = makeStraightCircuit(12);
    const state = { position: { x: 1, y: 1 }, velocity: { x: 0, y: 0 } };
    const m1 = chooseMove(state, circuit, createRng(99));
    const m2 = chooseMove(state, circuit, createRng(99));
    assert.deepStrictEqual(m1.acceleration, m2.acceleration);
  });

  it('freine devant un mur : ne fonce pas dans une impasse à grande vitesse', () => {
    // Voiture lancée vite vers le mur de droite, mais avec assez de place pour
    // freiner. L'IA doit choisir un coup qui laisse une continuation légale
    // (freiner) plutôt que de foncer dans l'impasse.
    const circuit = makeStraightCircuit(12);
    const state = { position: { x: 7, y: 1 }, velocity: { x: 3, y: 0 } };
    const move = chooseMove(state, circuit, createRng(1));
    // Le coup choisi ne crashe pas...
    assert.strictEqual(checkCollision(state.position, move.target, circuit.cells).crashed, false);
    // ...et laisse au moins une continuation légale au tour suivant.
    const { getPossibleMoves } = require('../../src/physics');
    const safeNext = getPossibleMoves(move.target, move.newVelocity).filter(
      (n: { target: Vec2 }) => !checkCollision(move.target, n.target, circuit.cells).crashed,
    );
    assert.ok(safeNext.length > 0, 'le coup choisi ne doit pas mener à une impasse');
  });
});
