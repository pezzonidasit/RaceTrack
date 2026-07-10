import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  createSoloRace,
  currentRacer,
  aiChooseMove,
  applyMove,
  getFinalRanking,
} from '../../src/solo-ai';

import type { Circuit, CellType, Vec2 } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers — circuits hermétiques déterministes
// ---------------------------------------------------------------------------

function wallGrid(width: number, height: number): CellType[][] {
  return Array.from({ length: height }, () => Array<CellType>(width).fill('wall'));
}

/**
 * Anneau rectangulaire large (piste 5 cases). Centerline orientée dans le sens
 * des index croissants, arrivée à l'index 0, départ ~10 % plus loin.
 * Circuit « trivial » : assez large pour que l'IA boucle sans s'enfermer.
 */
function makeLoopCircuit(): Circuit {
  const W = 28;
  const H = 20;
  const cells = wallGrid(W, H);
  const left = 5;
  const right = 22;
  const top = 5;
  const bottom = 14;

  const centerline: Vec2[] = [];
  for (let x = left; x <= right; x++) centerline.push({ x, y: top });
  for (let y = top + 1; y <= bottom; y++) centerline.push({ x: right, y });
  for (let x = right - 1; x >= left; x--) centerline.push({ x, y: bottom });
  for (let y = bottom - 1; y >= top + 1; y--) centerline.push({ x: left, y });

  // Creuse une piste de 5 cases de large (±2) autour de la centerline.
  for (const pt of centerline) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nx = pt.x + dx;
        const ny = pt.y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) cells[ny][nx] = 'track';
      }
    }
  }

  const n = centerline.length;
  const startIdx = Math.floor(n * 0.1);
  const startPositions: Vec2[] = [];
  for (let i = 0; i < 4; i++) {
    startPositions.push({ ...centerline[(startIdx + i) % n] });
  }

  // Ligne d'arrivée : bande autour de centerline[0].
  const f0 = centerline[0];
  const finishLine: Vec2[] = [
    { x: f0.x, y: f0.y },
    { x: f0.x, y: f0.y + 1 },
    { x: f0.x, y: f0.y - 1 },
  ].filter(p => p.y >= 0 && p.y < H && cells[p.y][p.x] !== 'wall');

  for (const p of startPositions) cells[p.y][p.x] = 'start';
  for (const p of finishLine) cells[p.y][p.x] = 'finish';

  return { width: W, height: H, cells, startPositions, finishLine, centerline };
}

/** Circuit serré (piste 1 case) — pour tester la robustesse (pas d'exception). */
function makeTightCircuit(): Circuit {
  const W = 10;
  const H = 5;
  const cells = wallGrid(W, H);
  const centerline: Vec2[] = [];
  for (let x = 1; x < W - 1; x++) {
    cells[2][x] = 'track';
    centerline.push({ x, y: 2 });
  }
  cells[2][1] = 'start';
  cells[2][W - 2] = 'finish';
  return {
    width: W,
    height: H,
    cells,
    startPositions: [{ x: 1, y: 2 }],
    finishLine: [{ x: W - 2, y: 2 }],
    centerline,
  };
}

/** Pilote tous les racers via l'IA jusqu'à la fin (ou un cap dur de sécurité). */
function driveAll(race: ReturnType<typeof createSoloRace>, hardCap = 5000): number {
  let steps = 0;
  while (race.status === 'playing' && steps < hardCap) {
    const r = currentRacer(race);
    const move = aiChooseMove(race, r);
    applyMove(race, r.id, move);
    steps++;
  }
  return steps;
}

// ---------------------------------------------------------------------------
// createSoloRace
// ---------------------------------------------------------------------------

describe('createSoloRace', () => {
  it('crée 1 joueur humain + N adversaires IA', () => {
    const race = createSoloRace({ circuit: makeLoopCircuit(), opponentCount: 2, seed: 1 });
    assert.strictEqual(race.racers.length, 3);
    const humans = race.racers.filter(r => !r.isAi);
    assert.strictEqual(humans.length, 1);
    assert.strictEqual(race.racers.filter(r => r.isAi).length, 2);
  });

  it('borne le nombre d\'adversaires entre 1 et 3', () => {
    const tooMany = createSoloRace({ circuit: makeLoopCircuit(), opponentCount: 9, seed: 1 });
    assert.strictEqual(tooMany.racers.filter(r => r.isAi).length, 3);
    const tooFew = createSoloRace({ circuit: makeLoopCircuit(), opponentCount: 0, seed: 1 });
    assert.strictEqual(tooFew.racers.filter(r => r.isAi).length, 1);
  });

  it('tous les racers démarrent en course, sans position d\'arrivée', () => {
    const race = createSoloRace({ circuit: makeLoopCircuit(), opponentCount: 3, seed: 1 });
    for (const r of race.racers) {
      assert.strictEqual(r.status, 'racing');
      assert.strictEqual(r.finishPosition, null);
    }
    assert.strictEqual(race.status, 'playing');
  });

  it('démarre les racers sur des cellules non-mur', () => {
    const circuit = makeLoopCircuit();
    const race = createSoloRace({ circuit, opponentCount: 3, seed: 1 });
    for (const r of race.racers) {
      assert.notStrictEqual(circuit.cells[r.position.y][r.position.x], 'wall');
    }
  });
});

// ---------------------------------------------------------------------------
// Boucle de course — terminaison bornée & légalité
// ---------------------------------------------------------------------------

describe('boucle solo pilotée par l\'IA', () => {
  it('le joueur atteint l\'arrivée en un nombre de tours borné (circuit trivial)', () => {
    const race = createSoloRace({ circuit: makeLoopCircuit(), opponentCount: 1, seed: 3 });
    driveAll(race);
    assert.strictEqual(race.status, 'finished');
    const human = race.racers.find(r => !r.isAi)!;
    assert.notStrictEqual(human.finishPosition, null, 'le joueur doit avoir terminé');
    assert.ok(race.turn < race.maxTurns, `tours ${race.turn} >= cap ${race.maxTurns}`);
  });

  it('aucun racer ne triche : chaque position appliquée reste sur une cellule non-mur', () => {
    const circuit = makeLoopCircuit();
    const race = createSoloRace({ circuit, opponentCount: 3, seed: 5 });
    let steps = 0;
    while (race.status === 'playing' && steps < 5000) {
      const r = currentRacer(race);
      applyMove(race, r.id, aiChooseMove(race, r));
      // Après chaque coup, chaque racer est sur une case valide.
      for (const rr of race.racers) {
        assert.notStrictEqual(
          circuit.cells[rr.position.y][rr.position.x],
          'wall',
          `racer ${rr.id} sur un mur`,
        );
      }
      steps++;
    }
    assert.strictEqual(race.status, 'finished');
  });

  it('classement final : les arrivés sont ordonnés par position d\'arrivée', () => {
    const race = createSoloRace({ circuit: makeLoopCircuit(), opponentCount: 3, seed: 7 });
    driveAll(race);
    const ranking = getFinalRanking(race);
    assert.strictEqual(ranking.length, 4);
    const finished = ranking.filter(r => r.finishPosition !== null);
    for (let i = 1; i < finished.length; i++) {
      assert.ok(
        (finished[i - 1].finishPosition ?? 0) < (finished[i].finishPosition ?? 0),
        'positions d\'arrivée non ordonnées',
      );
    }
    // Les arrivés précèdent les non-arrivés dans le classement.
    const firstUnfinished = ranking.findIndex(r => r.finishPosition === null);
    if (firstUnfinished !== -1) {
      assert.ok(
        ranking.slice(firstUnfinished).every(r => r.finishPosition === null),
        'un arrivé est classé après un non-arrivé',
      );
    }
  });

  it('circuit serré : la boucle ne lève aucune exception', () => {
    const race = createSoloRace({ circuit: makeTightCircuit(), opponentCount: 2, seed: 11, maxTurns: 60 });
    assert.doesNotThrow(() => driveAll(race));
    // La course se termine proprement (arrivée ou cap maxTurns), jamais bloquée.
    assert.strictEqual(race.status, 'finished');
  });
});
