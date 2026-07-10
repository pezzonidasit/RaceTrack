import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEmptyCircuit, applyTool } from '../../src/editor';
import { createSoloState, stepSolo } from '../../src/solo';

import type { Circuit } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Couloir horizontal track sur la ligne 0 ; start à gauche, finish à droite. */
function corridor(len: number): Circuit {
  let c = createEmptyCircuit(len, 1);
  for (let x = 0; x < len; x++) c = applyTool(c, { x, y: 0 }, 'track');
  c = applyTool(c, { x: 0, y: 0 }, 'start');
  c = applyTool(c, { x: len - 1, y: 0 }, 'finish');
  return c;
}

// ---------------------------------------------------------------------------
// createSoloState
// ---------------------------------------------------------------------------

describe('createSoloState', () => {
  it('place le pilote sur la première case de départ, immobile', () => {
    const s = createSoloState(corridor(3));
    assert.deepEqual(s.position, { x: 0, y: 0 });
    assert.deepEqual(s.velocity, { x: 0, y: 0 });
    assert.strictEqual(s.status, 'racing');
    assert.strictEqual(s.turns, 0);
    assert.strictEqual(s.crashes, 0);
  });
});

// ---------------------------------------------------------------------------
// stepSolo
// ---------------------------------------------------------------------------

describe('stepSolo', () => {
  it('avancer sur la ligne d’arrivée passe en statut « finished »', () => {
    // start (0,0), finish (1,0) ; accélération (1,0) → vit (1,0) → pos (1,0)
    const s0 = createSoloState(corridor(2));
    const s1 = stepSolo(s0, { x: 1, y: 0 });

    assert.deepEqual(s1.position, { x: 1, y: 0 });
    assert.strictEqual(s1.status, 'finished');
    assert.strictEqual(s1.turns, 1);
  });

  it('foncer dans un mur = crash → respawn au départ, vitesse remise à zéro', () => {
    // start (0,0) track, (1,0) mur, finish (2,0)
    let c = createEmptyCircuit(3, 1);
    c = applyTool(c, { x: 0, y: 0 }, 'track');
    c = applyTool(c, { x: 2, y: 0 }, 'track');
    c = applyTool(c, { x: 0, y: 0 }, 'start');
    c = applyTool(c, { x: 2, y: 0 }, 'finish');
    // (1,0) reste un mur

    const s0 = createSoloState(c);
    const s1 = stepSolo(s0, { x: 1, y: 0 }); // tente d'aller en (1,0) = mur

    assert.deepEqual(s1.position, { x: 0, y: 0 }, 'respawn au départ');
    assert.deepEqual(s1.velocity, { x: 0, y: 0 }, 'vitesse réinitialisée');
    assert.strictEqual(s1.status, 'racing');
    assert.strictEqual(s1.crashes, 1);
  });

  it('la vitesse s’accumule entre les tours', () => {
    const s0 = createSoloState(corridor(10));
    const s1 = stepSolo(s0, { x: 1, y: 0 }); // vit (1,0), pos (1,0)
    const s2 = stepSolo(s1, { x: 1, y: 0 }); // vit (2,0), pos (3,0)

    assert.deepEqual(s2.velocity, { x: 2, y: 0 });
    assert.deepEqual(s2.position, { x: 3, y: 0 });
  });

  it('une fois terminé, stepSolo est un no-op', () => {
    const s0 = createSoloState(corridor(2));
    const finished = stepSolo(s0, { x: 1, y: 0 });
    const after = stepSolo(finished, { x: 1, y: 0 });
    assert.deepEqual(after, finished);
  });
});
