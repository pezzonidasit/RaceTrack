import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  createEmptyCircuit,
  applyTool,
  validateForSave,
  serializeCircuit,
  deserializeCircuit,
  listSavedCircuits,
  saveCircuit,
  deleteSavedCircuit,
  MAX_SAVED_CIRCUITS,
} from '../../src/editor';

import type { Circuit, CellType } from '../../src/types';
import type { CircuitStorage } from '../../src/editor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** In-memory storage stub mimicking the localStorage subset we use. */
function makeStorage(): CircuitStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

/**
 * A small, hand-drawn valid circuit: an open corridor (track) from start to
 * finish. Reusable across tests.
 */
function makeValidDrawnCircuit(): Circuit {
  let c = createEmptyCircuit(7, 3);
  // Carve a horizontal corridor on row 1
  for (let x = 0; x < 7; x++) {
    c = applyTool(c, { x, y: 1 }, 'track');
  }
  c = applyTool(c, { x: 0, y: 1 }, 'start');
  c = applyTool(c, { x: 6, y: 1 }, 'finish');
  return c;
}

// ---------------------------------------------------------------------------
// createEmptyCircuit
// ---------------------------------------------------------------------------

describe('createEmptyCircuit', () => {
  it('produit une grille entièrement en murs aux bonnes dimensions', () => {
    const c = createEmptyCircuit(40, 30);
    assert.strictEqual(c.width, 40);
    assert.strictEqual(c.height, 30);
    assert.strictEqual(c.cells.length, 30);
    assert.strictEqual(c.cells[0].length, 40);
    assert.ok(c.cells.every((row) => row.every((cell) => cell === 'wall')));
  });

  it('start, finish et centerline sont vides au départ', () => {
    const c = createEmptyCircuit(10, 10);
    assert.deepEqual(c.startPositions, []);
    assert.deepEqual(c.finishLine, []);
    assert.deepEqual(c.centerline, []);
  });
});

// ---------------------------------------------------------------------------
// applyTool — pose / effacement / départ / arrivée
// ---------------------------------------------------------------------------

describe('applyTool', () => {
  it("pose une case de piste sans muter l'original (fonction pure)", () => {
    const before = createEmptyCircuit(5, 5);
    const after = applyTool(before, { x: 2, y: 2 }, 'track');

    assert.strictEqual(before.cells[2][2], 'wall', "l'original ne doit pas être muté");
    assert.strictEqual(after.cells[2][2], 'track');
  });

  it("définir un départ met à jour la cellule ET startPositions", () => {
    let c = createEmptyCircuit(5, 5);
    c = applyTool(c, { x: 1, y: 1 }, 'track');
    c = applyTool(c, { x: 1, y: 1 }, 'start');

    assert.strictEqual(c.cells[1][1], 'start');
    assert.deepEqual(c.startPositions, [{ x: 1, y: 1 }]);
  });

  it("définir une arrivée met à jour la cellule ET finishLine", () => {
    let c = createEmptyCircuit(5, 5);
    c = applyTool(c, { x: 3, y: 3 }, 'finish');

    assert.strictEqual(c.cells[3][3], 'finish');
    assert.deepEqual(c.finishLine, [{ x: 3, y: 3 }]);
  });

  it("effacer (mur) une case de départ la retire de startPositions", () => {
    let c = createEmptyCircuit(5, 5);
    c = applyTool(c, { x: 1, y: 1 }, 'start');
    c = applyTool(c, { x: 1, y: 1 }, 'wall');

    assert.strictEqual(c.cells[1][1], 'wall');
    assert.deepEqual(c.startPositions, []);
  });

  it("repasser une case de départ en arrivée la déplace entre les listes", () => {
    let c = createEmptyCircuit(5, 5);
    c = applyTool(c, { x: 2, y: 2 }, 'start');
    c = applyTool(c, { x: 2, y: 2 }, 'finish');

    assert.strictEqual(c.cells[2][2], 'finish');
    assert.deepEqual(c.startPositions, []);
    assert.deepEqual(c.finishLine, [{ x: 2, y: 2 }]);
  });

  it("ne duplique pas une même position de départ", () => {
    let c = createEmptyCircuit(5, 5);
    c = applyTool(c, { x: 1, y: 1 }, 'start');
    c = applyTool(c, { x: 1, y: 1 }, 'start');

    assert.deepEqual(c.startPositions, [{ x: 1, y: 1 }]);
  });

  it('hors limites = no-op (circuit inchangé)', () => {
    const c = createEmptyCircuit(5, 5);
    const after = applyTool(c, { x: 99, y: 99 }, 'track');
    assert.deepEqual(after, c);
  });
});

// ---------------------------------------------------------------------------
// validateForSave — réutilise le BFS de circuit.ts
// ---------------------------------------------------------------------------

describe('validateForSave', () => {
  it('un circuit franchissable est accepté', () => {
    const res = validateForSave(makeValidDrawnCircuit());
    assert.strictEqual(res.ok, true);
  });

  it('un circuit sans départ est refusé avec un message clair', () => {
    let c = createEmptyCircuit(7, 3);
    for (let x = 0; x < 7; x++) c = applyTool(c, { x, y: 1 }, 'track');
    c = applyTool(c, { x: 6, y: 1 }, 'finish');
    // pas de start
    const res = validateForSave(c);
    assert.strictEqual(res.ok, false);
    assert.ok(res.error && res.error.length > 0);
  });

  it('un circuit dont l’arrivée est inatteignable est refusé', () => {
    // Deux zones de piste séparées par une bande de murs de 4 cases (BFS ±2 → infranchissable)
    let c = createEmptyCircuit(12, 1);
    for (let x = 0; x <= 3; x++) c = applyTool(c, { x, y: 0 }, 'track');
    for (let x = 8; x <= 11; x++) c = applyTool(c, { x, y: 0 }, 'track');
    c = applyTool(c, { x: 0, y: 0 }, 'start');
    c = applyTool(c, { x: 11, y: 0 }, 'finish');

    const res = validateForSave(c);
    assert.strictEqual(res.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Sérialisation — round-trip
// ---------------------------------------------------------------------------

describe('sérialisation', () => {
  it('round-trip serialize → deserialize préserve la piste', () => {
    const original = makeValidDrawnCircuit();
    const restored = deserializeCircuit(serializeCircuit(original));

    assert.deepEqual(restored.cells, original.cells);
    assert.deepEqual(restored.startPositions, original.startPositions);
    assert.deepEqual(restored.finishLine, original.finishLine);
    assert.strictEqual(restored.width, original.width);
    assert.strictEqual(restored.height, original.height);
  });

  it('deserialize rejette un JSON malformé', () => {
    assert.throws(() => deserializeCircuit('pas du json{'));
  });

  it('deserialize rejette un objet de mauvaise forme', () => {
    assert.throws(() => deserializeCircuit(JSON.stringify({ foo: 'bar' })));
  });

  it('deserialize rejette une grille aux dimensions incohérentes', () => {
    const bad = {
      width: 5,
      height: 5,
      cells: [['wall'] as CellType[]], // 1 ligne au lieu de 5
      startPositions: [],
      finishLine: [],
      centerline: [],
    };
    assert.throws(() => deserializeCircuit(JSON.stringify(bad)));
  });
});

// ---------------------------------------------------------------------------
// Persistance localStorage (via stub injecté → hermétique)
// ---------------------------------------------------------------------------

describe('persistance', () => {
  it('liste vide au départ', () => {
    const storage = makeStorage();
    assert.deepEqual(listSavedCircuits(storage), []);
  });

  it('sauvegarde un circuit valide puis le retrouve dans la liste', () => {
    const storage = makeStorage();
    const saved = saveCircuit('Ma piste', makeValidDrawnCircuit(), storage);

    assert.strictEqual(saved.name, 'Ma piste');
    assert.ok(saved.id);

    const list = listSavedCircuits(storage);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, 'Ma piste');
    assert.deepEqual(list[0].circuit.startPositions, makeValidDrawnCircuit().startPositions);
  });

  it('refuse de sauvegarder un circuit invalide', () => {
    const storage = makeStorage();
    const broken = createEmptyCircuit(5, 5); // tout en murs, ni start ni finish
    assert.throws(() => saveCircuit('Cassé', broken, storage));
    assert.deepEqual(listSavedCircuits(storage), []);
  });

  it('supprime un circuit par id', () => {
    const storage = makeStorage();
    const saved = saveCircuit('A', makeValidDrawnCircuit(), storage);
    saveCircuit('B', makeValidDrawnCircuit(), storage);

    deleteSavedCircuit(saved.id, storage);

    const list = listSavedCircuits(storage);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, 'B');
  });

  it('plafonne le nombre de circuits sauvegardés', () => {
    const storage = makeStorage();
    for (let i = 0; i < MAX_SAVED_CIRCUITS; i++) {
      saveCircuit(`piste ${i}`, makeValidDrawnCircuit(), storage);
    }
    assert.throws(() => saveCircuit('overflow', makeValidDrawnCircuit(), storage));
  });
});
