import { strict as assert } from 'node:assert';
import { describe, it, before } from 'node:test';

// ---------------------------------------------------------------------------
// Stub localStorage avant tout import du module progression
// (calculateRewards appelle getDailyGameCount qui utilise localStorage)
// ---------------------------------------------------------------------------

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => localStorageStore[key] ?? null,
  setItem: (key: string, value: string): void => { localStorageStore[key] = value; },
  removeItem: (key: string): void => { delete localStorageStore[key]; },
  clear: (): void => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
};

// @ts-ignore — injection globale pour Node (pas de localStorage natif)
globalThis.localStorage = localStorageMock;

import { calculateRewards, getRankForXp } from '../../src/progression';
import { RANKS } from '../../src/types';

// ---------------------------------------------------------------------------
// getRankForXp — valeurs limites
// ---------------------------------------------------------------------------

describe('getRankForXp — frontières de rangs', () => {
  it('0 XP = Karting (rang initial)', () => {
    assert.strictEqual(getRankForXp(0), 'Karting');
  });

  it('499 XP = Karting (juste sous Rally)', () => {
    assert.strictEqual(getRankForXp(499), 'Karting');
  });

  it('500 XP = Rally (exactement le seuil)', () => {
    assert.strictEqual(getRankForXp(500), 'Rally');
  });

  it('1499 XP = Rally (juste sous F3)', () => {
    assert.strictEqual(getRankForXp(1499), 'Rally');
  });

  it('1500 XP = F3', () => {
    assert.strictEqual(getRankForXp(1500), 'F3');
  });

  it('3500 XP = F1', () => {
    assert.strictEqual(getRankForXp(3500), 'F1');
  });

  it('7000 XP = Champion', () => {
    assert.strictEqual(getRankForXp(7000), 'Champion');
  });

  it('15000 XP = Légende', () => {
    assert.strictEqual(getRankForXp(15000), 'Légende');
  });

  it('XP très élevé (999999) = Légende', () => {
    assert.strictEqual(getRankForXp(999999), 'Légende');
  });

  it('XP négatif = Karting (plancher)', () => {
    assert.strictEqual(getRankForXp(-100), 'Karting');
  });
});

// ---------------------------------------------------------------------------
// calculateRewards — XP et coins
// ---------------------------------------------------------------------------

describe('calculateRewards — calcul des récompenses', () => {
  before(() => {
    // Reset localStorage pour isoler les tests (compteur quotidien = 0)
    localStorageMock.clear();
  });

  it('1ère place sans crash, partie rapide = XP max (100+30+20=150)', () => {
    localStorageMock.clear();
    const r = calculateRewards(1, true, 10);
    assert.strictEqual(r.xp, 150);
  });

  it('1ère place sans crash, partie lente = 100+30=130 XP (pas de bonus rapide)', () => {
    localStorageMock.clear();
    const r = calculateRewards(1, true, 25);
    assert.strictEqual(r.xp, 130);
  });

  it('1ère place avec crash, partie rapide = 100+20=120 XP (pas de bonus no-crash)', () => {
    localStorageMock.clear();
    const r = calculateRewards(1, false, 10);
    assert.strictEqual(r.xp, 120);
  });

  it('2ème place sans crash = 60+30=90 XP', () => {
    localStorageMock.clear();
    const r = calculateRewards(2, true, 30);
    assert.strictEqual(r.xp, 90);
  });

  it('3ème place avec crash = 35 XP', () => {
    localStorageMock.clear();
    const r = calculateRewards(3, false, 30);
    assert.strictEqual(r.xp, 35);
  });

  it('4ème place ou plus = 20 XP minimum (plancher)', () => {
    localStorageMock.clear();
    const r = calculateRewards(4, false, 40);
    assert.strictEqual(r.xp, 20);
  });

  it('position 99 (hors tableau) = planché à 20 XP', () => {
    localStorageMock.clear();
    const r = calculateRewards(99, false, 40);
    assert.strictEqual(r.xp, 20);
  });

  it('1ère partie du jour = multiplicateur 1.0 (coins pleins)', () => {
    localStorageMock.clear();
    const r = calculateRewards(1, false, 30);
    // COINS_BY_PLACE[0] = 50, multiplier[0] = 1.0
    assert.strictEqual(r.coins, 50);
  });

  it('newRank est null (calculateRewards ne détermine pas le rang)', () => {
    localStorageMock.clear();
    const r = calculateRewards(1, false, 30);
    assert.strictEqual(r.newRank, null);
  });
});
