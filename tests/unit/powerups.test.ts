import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  POWERUPS_ENABLED,
  POWERUP_EFFECTS,
  POWERUP_TYPES,
  emptyState,
  placePowerUps,
  findPowerUpAt,
  boostedVelocity,
  teleportPosition,
  activeEffectIndicators,
  resolveMove,
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

// ---------------------------------------------------------------------------
// findPowerUpAt — détection de ramassage
// ---------------------------------------------------------------------------

describe('findPowerUpAt — détection', () => {
  const powerups = [
    { type: 'boost' as const, cell: { x: 3, y: 4 } },
    { type: 'shield' as const, cell: { x: 7, y: 2 } },
  ];

  it('retourne le power-up sur la case occupée', () => {
    const found = findPowerUpAt(powerups, { x: 3, y: 4 });
    assert.ok(found);
    assert.strictEqual(found!.type, 'boost');
  });

  it('retourne null si aucune case ne correspond', () => {
    assert.strictEqual(findPowerUpAt(powerups, { x: 0, y: 0 }), null);
  });

  it('liste vide → null', () => {
    assert.strictEqual(findPowerUpAt([], { x: 3, y: 4 }), null);
  });
});

// ---------------------------------------------------------------------------
// boostedVelocity — effet boost sur la vitesse
// ---------------------------------------------------------------------------

describe('boostedVelocity', () => {
  it('ajoute +1 dans la direction de chaque axe non nul', () => {
    assert.deepStrictEqual(boostedVelocity({ x: 2, y: -1 }), { x: 3, y: -2 });
  });

  it('vitesse nulle reste nulle (pas de direction à booster)', () => {
    assert.deepStrictEqual(boostedVelocity({ x: 0, y: 0 }), { x: 0, y: 0 });
  });

  it('ne booste que les axes en mouvement', () => {
    assert.deepStrictEqual(boostedVelocity({ x: 0, y: 3 }), { x: 0, y: 4 });
  });
});

// ---------------------------------------------------------------------------
// teleportPosition — saut court le long de la centerline
// ---------------------------------------------------------------------------

describe('teleportPosition', () => {
  const centerline = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
  ];

  it('saute jumpCells cases en avant à partir du point le plus proche', () => {
    // proche de l'index 1 → +3 → index 4
    const result = teleportPosition({ x: 1, y: 0 }, centerline, 3);
    assert.deepStrictEqual(result, { x: 4, y: 0 });
  });

  it('clamp à la dernière case si le saut dépasse la fin', () => {
    const result = teleportPosition({ x: 4, y: 0 }, centerline, 10);
    assert.deepStrictEqual(result, { x: 5, y: 0 });
  });

  it('centerline vide → position inchangée', () => {
    const pos = { x: 9, y: 9 };
    assert.deepStrictEqual(teleportPosition(pos, [], 3), pos);
  });
});

// ---------------------------------------------------------------------------
// resolveMove — orchestration : application + expiration des effets
// ---------------------------------------------------------------------------

/** Piste libre 10×10 (aucun mur) pour isoler la logique d'effets. */
function openCells(): CellType[][] {
  return Array.from({ length: 10 }, () =>
    Array<CellType>(10).fill('track'),
  );
}

describe('resolveMove — déplacement de base (sans power-up)', () => {
  it('applique la physique standard et ne ramasse rien', () => {
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 0, y: 0 },
      cells: openCells(),
      centerline: [],
      powerups: [],
      state: emptyState(),
    });
    assert.deepStrictEqual(result.position, { x: 3, y: 2 });
    assert.deepStrictEqual(result.velocity, { x: 1, y: 0 });
    assert.strictEqual(result.crashed, false);
    assert.strictEqual(result.pickedUp, null);
  });

  it('détecte une collision contre un mur', () => {
    const cells = openCells();
    cells[2][4] = 'wall';
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 1, y: 0 }, // → vel(2,0) → cible (4,2) = mur
      cells,
      centerline: [],
      powerups: [],
      state: emptyState(),
    });
    assert.strictEqual(result.crashed, true);
  });
});

describe('resolveMove — ramassage et activation', () => {
  it('ramasser un boost l\'active pour durationTurns et le retire de la piste', () => {
    const powerups = [{ type: 'boost' as const, cell: { x: 3, y: 2 } }];
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 0, y: 0 }, // cible (3,2) = boost
      cells: openCells(),
      centerline: [],
      powerups,
      state: emptyState(),
    });
    assert.ok(result.pickedUp);
    assert.strictEqual(result.pickedUp!.type, 'boost');
    assert.strictEqual(result.state.boostTurnsLeft, POWERUP_EFFECTS.boost.durationTurns);
    assert.strictEqual(result.powerups.length, 0); // retiré de la piste
  });

  it('le boost actif augmente la vitesse au tour suivant puis expire', () => {
    const cells = openCells();
    // tour avec boost actif (turnsLeft=1) : vel(1,0)+acc(0,0)=（1,0) → boosté (2,0)
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 0, y: 0 },
      cells,
      centerline: [],
      powerups: [],
      state: { boostTurnsLeft: 1, shieldCharges: 0 },
    });
    assert.deepStrictEqual(result.velocity, { x: 2, y: 0 });
    assert.deepStrictEqual(result.position, { x: 4, y: 2 });
    assert.strictEqual(result.state.boostTurnsLeft, 0); // expiré
  });

  it('ramasser un bouclier ajoute une charge', () => {
    const powerups = [{ type: 'shield' as const, cell: { x: 3, y: 2 } }];
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 0, y: 0 },
      cells: openCells(),
      centerline: [],
      powerups,
      state: emptyState(),
    });
    assert.strictEqual(result.state.shieldCharges, POWERUP_EFFECTS.shield.charges);
  });

  it('le bouclier absorbe un crash, consomme la charge et garde la voiture en place', () => {
    const cells = openCells();
    cells[2][4] = 'wall';
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 1, y: 0 }, // cible (4,2) = mur
      cells,
      centerline: [],
      powerups: [],
      state: { boostTurnsLeft: 0, shieldCharges: 1 },
    });
    assert.strictEqual(result.crashed, false); // absorbé
    assert.strictEqual(result.state.shieldCharges, 0); // charge consommée
    assert.deepStrictEqual(result.position, { x: 2, y: 2 }); // reste en place
    assert.deepStrictEqual(result.velocity, { x: 0, y: 0 }); // vitesse remise à zéro
  });

  it('sans bouclier, le crash n\'est pas absorbé', () => {
    const cells = openCells();
    cells[2][4] = 'wall';
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 1, y: 0 },
      cells,
      centerline: [],
      powerups: [],
      state: emptyState(),
    });
    assert.strictEqual(result.crashed, true);
  });

  it('ramasser un téléport projette la voiture en avant sur la centerline', () => {
    const centerline = [
      { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
      { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 },
    ];
    const powerups = [{ type: 'teleport' as const, cell: { x: 3, y: 2 } }];
    const result = resolveMove({
      position: { x: 2, y: 2 },
      velocity: { x: 1, y: 0 },
      acceleration: { x: 0, y: 0 }, // cible (3,2) = téléport (index 2)
      cells: openCells(),
      centerline,
      powerups,
      state: emptyState(),
    });
    assert.strictEqual(result.pickedUp!.type, 'teleport');
    // index 2 + jumpCells(4) = index 6 → (7,2)
    assert.deepStrictEqual(result.position, { x: 7, y: 2 });
  });
});

// ---------------------------------------------------------------------------
// activeEffectIndicators — descripteurs d'affichage pour le HUD
// ---------------------------------------------------------------------------

describe('activeEffectIndicators', () => {
  it('état vide → aucun indicateur', () => {
    assert.deepStrictEqual(activeEffectIndicators(emptyState()), []);
  });

  it('boost actif → indicateur avec tours restants', () => {
    const out = activeEffectIndicators({ boostTurnsLeft: 2, shieldCharges: 0 });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].type, 'boost');
    assert.ok(out[0].text.includes('2'));
  });

  it('bouclier actif → indicateur avec charges', () => {
    const out = activeEffectIndicators({ boostTurnsLeft: 0, shieldCharges: 1 });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].type, 'shield');
    assert.ok(out[0].text.includes('1'));
  });

  it('boost + bouclier actifs → deux indicateurs', () => {
    const out = activeEffectIndicators({ boostTurnsLeft: 3, shieldCharges: 2 });
    assert.strictEqual(out.length, 2);
    const types = out.map(o => o.type);
    assert.ok(types.includes('boost'));
    assert.ok(types.includes('shield'));
  });
});
