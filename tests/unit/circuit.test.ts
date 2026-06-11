import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { validateCircuit } from '../../src/circuit';

import type { Circuit, CellType } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrackGrid(width: number, height: number): CellType[][] {
  return Array.from({ length: height }, () =>
    Array<CellType>(width).fill('track')
  );
}

function makeWallGrid(width: number, height: number): CellType[][] {
  return Array.from({ length: height }, () =>
    Array<CellType>(width).fill('wall')
  );
}

/** Circuit minimal valide : piste 5×5 entourée de murs, start et finish accessibles. */
function makeValidCircuit(): Circuit {
  const width = 5;
  const height = 5;
  const cells: CellType[][] = makeWallGrid(width, height);

  // Carve a ring of track cells (border of interior)
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) {
      cells[y][x] = 'track';
    }
  }

  // start and finish on track
  cells[1][1] = 'start';
  cells[3][3] = 'finish';

  return {
    width,
    height,
    cells,
    startPositions: [{ x: 1, y: 1 }],
    finishLine: [{ x: 3, y: 3 }],
    centerline: [],
  };
}

// ---------------------------------------------------------------------------
// validateCircuit — circuits valides
// ---------------------------------------------------------------------------

describe('validateCircuit — circuits valides', () => {
  it('circuit minimal valide : start et finish accessibles', () => {
    const circuit = makeValidCircuit();
    assert.strictEqual(validateCircuit(circuit), true);
  });

  it('circuit avec plusieurs positions finish — valide si au moins une atteignable', () => {
    const width = 7;
    const height = 3;
    const cells: CellType[][] = makeTrackGrid(width, height);
    cells[0] = Array<CellType>(width).fill('wall');
    cells[2] = Array<CellType>(width).fill('wall');
    cells[1][0] = 'start';
    cells[1][6] = 'finish';

    const circuit: Circuit = {
      width, height, cells,
      startPositions: [{ x: 0, y: 1 }],
      finishLine: [{ x: 6, y: 1 }],
      centerline: [],
    };

    assert.strictEqual(validateCircuit(circuit), true);
  });

  it('grande grille totalement en track — valide', () => {
    const width = 10;
    const height = 10;
    const cells: CellType[][] = makeTrackGrid(width, height);
    cells[0][0] = 'start';
    cells[9][9] = 'finish';

    const circuit: Circuit = {
      width, height, cells,
      startPositions: [{ x: 0, y: 0 }],
      finishLine: [{ x: 9, y: 9 }],
      centerline: [],
    };

    assert.strictEqual(validateCircuit(circuit), true);
  });
});

// ---------------------------------------------------------------------------
// validateCircuit — circuits invalides
// ---------------------------------------------------------------------------

describe('validateCircuit — circuits invalides', () => {
  it('aucune startPosition = invalide', () => {
    const circuit = makeValidCircuit();
    circuit.startPositions = [];
    assert.strictEqual(validateCircuit(circuit), false);
  });

  it('aucune finishLine = invalide', () => {
    const circuit = makeValidCircuit();
    circuit.finishLine = [];
    assert.strictEqual(validateCircuit(circuit), false);
  });

  it('start en dehors des limites = invalide', () => {
    const circuit = makeValidCircuit();
    circuit.startPositions = [{ x: 100, y: 100 }];
    assert.strictEqual(validateCircuit(circuit), false);
  });

  it('start sur un mur = invalide', () => {
    const circuit = makeValidCircuit();
    // Place start sur une cellule wall (x:0, y:0 est un mur dans makeValidCircuit)
    circuit.startPositions = [{ x: 0, y: 0 }];
    assert.strictEqual(validateCircuit(circuit), false);
  });

  it('finish inatteignable (séparé par large bande de murs) = invalide', () => {
    // Deux zones de track séparées par une bande de murs de largeur > 2
    // Le BFS utilise des pas de ±2 max — une bande de murs de 3 cellules est infranchissable.
    //
    // Grille 12×3 :
    //   col 0..3  : track (zone start)
    //   col 4..7  : murs (bande épaisse, infranchissable même en ±2)
    //   col 8..11 : track (zone finish)
    const width = 12;
    const height = 3;
    const cells: CellType[][] = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (__, x): CellType => {
        if (x >= 4 && x <= 7) return 'wall';
        return 'track';
      })
    );

    cells[1][0] = 'start';
    cells[1][11] = 'finish';

    const circuit: Circuit = {
      width, height, cells,
      startPositions: [{ x: 0, y: 1 }],
      finishLine: [{ x: 11, y: 1 }],
      centerline: [],
    };

    assert.strictEqual(validateCircuit(circuit), false);
  });

  it('grille entièrement en murs = invalide', () => {
    const width = 4;
    const height = 4;
    const cells: CellType[][] = makeWallGrid(width, height);
    // mettre start sur un mur (invalide car cellule wall)
    const circuit: Circuit = {
      width, height, cells,
      startPositions: [{ x: 0, y: 0 }],
      finishLine: [{ x: 3, y: 3 }],
      centerline: [],
    };

    assert.strictEqual(validateCircuit(circuit), false);
  });
});
