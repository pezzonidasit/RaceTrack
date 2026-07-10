import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

// ---------------------------------------------------------------------------
// Stub localStorage avant import du module quests (persistance namespacée)
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

import {
  generateDailyQuests,
  applyProgress,
  claimReward,
  localDateKey,
  loadQuests,
  saveQuests,
  recordEvent,
  claim,
  QUEST_POOL,
  type Quest,
} from '../../src/quests';

// ---------------------------------------------------------------------------
// localDateKey — clé de jour en heure LOCALE (pas UTC)
// ---------------------------------------------------------------------------

describe('localDateKey — bascule de jour en heure locale', () => {
  it('formate YYYY-MM-DD', () => {
    const d = new Date(2026, 5, 24, 12, 0, 0); // 24 juin 2026 midi local
    assert.strictEqual(localDateKey(d), '2026-06-24');
  });

  it('23h59 local reste le même jour', () => {
    const d = new Date(2026, 5, 24, 23, 59, 0);
    assert.strictEqual(localDateKey(d), '2026-06-24');
  });

  it('00h00 local = jour suivant', () => {
    const d = new Date(2026, 5, 25, 0, 0, 0);
    assert.strictEqual(localDateKey(d), '2026-06-25');
  });

  it('mois et jour sont zero-paddés', () => {
    const d = new Date(2026, 0, 3, 9, 0, 0); // 3 janvier 2026
    assert.strictEqual(localDateKey(d), '2026-01-03');
  });
});

// ---------------------------------------------------------------------------
// generateDailyQuests — génération déterministe seedée sur la date
// ---------------------------------------------------------------------------

describe('generateDailyQuests — génération déterministe', () => {
  it('génère exactement 3 défis', () => {
    const quests = generateDailyQuests(new Date(2026, 5, 24));
    assert.strictEqual(quests.length, 3);
  });

  it('même date → mêmes défis (déterministe, pas de hasard)', () => {
    const a = generateDailyQuests(new Date(2026, 5, 24, 8, 0));
    const b = generateDailyQuests(new Date(2026, 5, 24, 20, 0));
    assert.deepStrictEqual(a.map(q => q.type), b.map(q => q.type));
    assert.deepStrictEqual(a.map(q => q.target), b.map(q => q.target));
  });

  it('dates différentes → sélection différente (au moins un jour distinct)', () => {
    const a = generateDailyQuests(new Date(2026, 5, 24)).map(q => q.type).join();
    const b = generateDailyQuests(new Date(2026, 5, 25)).map(q => q.type).join();
    const c = generateDailyQuests(new Date(2026, 5, 26)).map(q => q.type).join();
    // Pas tous identiques sur 3 jours consécutifs
    assert.ok(!(a === b && b === c), 'la sélection devrait varier selon le jour');
  });

  it('3 défis distincts (pas de doublon de type le même jour)', () => {
    const quests = generateDailyQuests(new Date(2026, 5, 24));
    const types = quests.map(q => q.type);
    assert.strictEqual(new Set(types).size, types.length);
  });

  it('chaque défi démarre à progress 0, non réclamé', () => {
    const quests = generateDailyQuests(new Date(2026, 5, 24));
    for (const q of quests) {
      assert.strictEqual(q.progress, 0);
      assert.strictEqual(q.claimed, false);
      assert.ok(q.target > 0);
      assert.ok(q.reward.coins > 0 || q.reward.xp > 0);
    }
  });

  it('tous les types générés existent dans QUEST_POOL', () => {
    const poolTypes = new Set(QUEST_POOL.map(t => t.type));
    const quests = generateDailyQuests(new Date(2026, 5, 24));
    for (const q of quests) {
      assert.ok(poolTypes.has(q.type), `type inconnu: ${q.type}`);
    }
  });
});

// ---------------------------------------------------------------------------
// applyProgress — tracking d'avancement depuis les événements de jeu
// ---------------------------------------------------------------------------

describe('applyProgress — avancement des défis', () => {
  function questOfType(type: Quest['type'], target: number): Quest {
    return { id: `${type}-x`, type, target, progress: 0, reward: { coins: 10, xp: 10 }, claimed: false };
  }

  it('race_count avance de 1 à chaque course terminée', () => {
    let quests = [questOfType('race_count', 3)];
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: true, distance: 0 });
    assert.strictEqual(quests[0].progress, 1);
  });

  it("win_count n'avance que si la course est gagnée", () => {
    let quests = [questOfType('win_count', 2)];
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 0 });
    assert.strictEqual(quests[0].progress, 0);
    quests = applyProgress(quests, { kind: 'race_finished', won: true, crashed: false, distance: 0 });
    assert.strictEqual(quests[0].progress, 1);
  });

  it('no_crash_race avance seulement si la course est sans crash', () => {
    let quests = [questOfType('no_crash_race', 1)];
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: true, distance: 0 });
    assert.strictEqual(quests[0].progress, 0);
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 0 });
    assert.strictEqual(quests[0].progress, 1);
  });

  it('distance accumule les mètres parcourus', () => {
    let quests = [questOfType('distance', 500)];
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 300 });
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 250 });
    assert.strictEqual(quests[0].progress, 500); // cappé à la cible
  });

  it('unlock_item avance sur un achat boutique', () => {
    let quests = [questOfType('unlock_item', 1)];
    quests = applyProgress(quests, { kind: 'item_unlocked' });
    assert.strictEqual(quests[0].progress, 1);
    // un race_finished ne touche pas unlock_item
    quests = applyProgress(quests, { kind: 'race_finished', won: true, crashed: false, distance: 99 });
    assert.strictEqual(quests[0].progress, 1);
  });

  it('progress est cappé à target (jamais au-dessus)', () => {
    let quests = [questOfType('race_count', 2)];
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 0 });
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 0 });
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 0 });
    assert.strictEqual(quests[0].progress, 2);
  });

  it("un défi déjà réclamé n'avance plus", () => {
    let quests = [{ ...questOfType('race_count', 3), progress: 3, claimed: true }];
    quests = applyProgress(quests, { kind: 'race_finished', won: false, crashed: false, distance: 0 });
    assert.strictEqual(quests[0].progress, 3);
  });
});

// ---------------------------------------------------------------------------
// claimReward — attribution de récompense (logique pure)
// ---------------------------------------------------------------------------

describe('claimReward — réclamation de récompense', () => {
  function completeQuest(): Quest {
    return { id: 'q1', type: 'race_count', target: 3, progress: 3, reward: { coins: 40, xp: 60 }, claimed: false };
  }

  it('défi complété non réclamé → renvoie la récompense et marque claimed', () => {
    const { quests, reward } = claimReward([completeQuest()], 'q1');
    assert.deepStrictEqual(reward, { coins: 40, xp: 60 });
    assert.strictEqual(quests[0].claimed, true);
  });

  it('défi incomplet → aucune récompense, pas de claim', () => {
    const incomplete: Quest = { ...completeQuest(), progress: 1 };
    const { quests, reward } = claimReward([incomplete], 'q1');
    assert.strictEqual(reward, null);
    assert.strictEqual(quests[0].claimed, false);
  });

  it('double réclamation → aucune récompense la 2ème fois', () => {
    let state = claimReward([completeQuest()], 'q1');
    assert.deepStrictEqual(state.reward, { coins: 40, xp: 60 });
    state = claimReward(state.quests, 'q1');
    assert.strictEqual(state.reward, null);
  });

  it('id inconnu → aucune récompense', () => {
    const { reward } = claimReward([completeQuest()], 'inconnu');
    assert.strictEqual(reward, null);
  });
});

// ---------------------------------------------------------------------------
// Persistance namespacée par profil + reset quotidien
// ---------------------------------------------------------------------------

describe('loadQuests — persistance par profil et reset à minuit', () => {
  beforeEach(() => localStorageMock.clear());

  it('premier chargement génère et persiste les défis du jour', () => {
    const day = new Date(2026, 5, 24, 10, 0);
    const quests = loadQuests('alice', day);
    assert.strictEqual(quests.length, 3);
    // persisté
    assert.ok(localStorageStore['rt_quests_alice']);
  });

  it("recharger le même jour conserve la progression", () => {
    const day = new Date(2026, 5, 24, 10, 0);
    let quests = loadQuests('alice', day);
    quests[0].progress = quests[0].target; // simulate progress
    saveQuests('alice', quests, day);
    const reloaded = loadQuests('alice', day);
    assert.strictEqual(reloaded[0].progress, reloaded[0].target);
  });

  it('le lendemain (jour local différent) → reset, progression repart à 0', () => {
    const day1 = new Date(2026, 5, 24, 23, 30);
    let quests = loadQuests('alice', day1);
    quests[0].progress = quests[0].target;
    saveQuests('alice', quests, day1);

    const day2 = new Date(2026, 5, 25, 0, 30); // 30 min plus tard mais nouveau jour
    const reloaded = loadQuests('alice', day2);
    assert.strictEqual(reloaded.every(q => q.progress === 0), true);
    assert.strictEqual(reloaded.every(q => q.claimed === false), true);
  });

  it('namespacé par profil — alice et bob ne partagent pas leur progression', () => {
    const day = new Date(2026, 5, 24, 10, 0);
    let aliceQ = loadQuests('alice', day);
    aliceQ[0].progress = aliceQ[0].target;
    saveQuests('alice', aliceQ, day);

    const bobQ = loadQuests('bob', day);
    assert.strictEqual(bobQ.every(q => q.progress === 0), true);
  });
});

describe('recordEvent + claim — flux complet de bout en bout', () => {
  beforeEach(() => localStorageMock.clear());

  it('recordEvent persiste l’avancement et claim renvoie la récompense', () => {
    const day = new Date(2026, 5, 24, 10, 0);
    // Forcer un état connu : un seul défi race_count target 1
    const seeded: Quest[] = [
      { id: 'rc1', type: 'race_count', target: 1, progress: 0, reward: { coins: 25, xp: 30 }, claimed: false },
    ];
    saveQuests('alice', seeded, day);

    recordEvent('alice', { kind: 'race_finished', won: false, crashed: false, distance: 0 }, day);
    const afterEvent = loadQuests('alice', day);
    assert.strictEqual(afterEvent[0].progress, 1);

    const reward = claim('alice', 'rc1', day);
    assert.deepStrictEqual(reward, { coins: 25, xp: 30 });

    // claimed persisté
    const afterClaim = loadQuests('alice', day);
    assert.strictEqual(afterClaim[0].claimed, true);

    // double claim → null
    const reward2 = claim('alice', 'rc1', day);
    assert.strictEqual(reward2, null);
  });
});
