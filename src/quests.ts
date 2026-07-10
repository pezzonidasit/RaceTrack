// ---------------------------------------------------------------------------
// Défis quotidiens (daily quests)
//
// Boucle d'engagement solo, 100 % offline : 3 défis générés chaque jour de
// façon déterministe (seedés sur la date locale), trackés en localStorage
// namespacé par profil, avec reset à minuit (heure locale) et récompense
// coins/XP branchée sur progression.ts à la réclamation.
//
// Ce module est volontairement sans dépendance réseau : les fonctions de
// génération / avancement / réclamation sont pures, la persistance est isolée
// derrière loadQuests/saveQuests pour rester testable hermétiquement.
// ---------------------------------------------------------------------------

export type QuestType =
  | 'race_count'      // terminer N courses
  | 'win_count'       // gagner N courses
  | 'no_crash_race'   // terminer N courses sans crash
  | 'distance'        // parcourir N mètres (cumulés)
  | 'unlock_item';    // débloquer N objet(s) en boutique

export interface QuestReward {
  coins: number;
  xp: number;
}

export interface Quest {
  id: string;
  type: QuestType;
  target: number;
  progress: number;
  reward: QuestReward;
  claimed: boolean;
}

/** Modèle d'un défi (avant seed du jour). */
export interface QuestTemplate {
  type: QuestType;
  /** Libellé affiché, `{target}` est remplacé par la cible. */
  label: string;
  target: number;
  reward: QuestReward;
}

// Événements de jeu qui font avancer les défis.
export type QuestEvent =
  | { kind: 'race_finished'; won: boolean; crashed: boolean; distance: number }
  | { kind: 'item_unlocked' };

// ---------------------------------------------------------------------------
// Pool de défis — simples, lisibles, atteignables en une session par un enfant
// ---------------------------------------------------------------------------

export const QUEST_POOL: QuestTemplate[] = [
  { type: 'race_count',    label: 'Termine {target} courses',            target: 3,   reward: { coins: 30, xp: 40 } },
  { type: 'race_count',    label: 'Termine {target} courses',            target: 5,   reward: { coins: 50, xp: 60 } },
  { type: 'win_count',     label: 'Gagne {target} course',               target: 1,   reward: { coins: 50, xp: 70 } },
  { type: 'win_count',     label: 'Gagne {target} courses',              target: 2,   reward: { coins: 80, xp: 110 } },
  { type: 'no_crash_race', label: 'Termine {target} course sans crash',  target: 1,   reward: { coins: 40, xp: 50 } },
  { type: 'distance',      label: 'Parcours {target} m',                 target: 500, reward: { coins: 30, xp: 40 } },
  { type: 'distance',      label: 'Parcours {target} m',                 target: 800, reward: { coins: 45, xp: 55 } },
  { type: 'unlock_item',   label: 'Débloque {target} nouveau skin',      target: 1,   reward: { coins: 20, xp: 30 } },
];

const QUESTS_PER_DAY = 3;
const LS_PREFIX = 'rt_quests_';

// ---------------------------------------------------------------------------
// Dates — clé de jour en HEURE LOCALE (pas UTC, cf. PRD reset à minuit local)
// ---------------------------------------------------------------------------

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Seed entier déterministe dérivé de la clé de jour locale. */
function dateSeed(date: Date): number {
  const key = localDateKey(date);
  let h = 2166136261; // FNV-1a 32-bit
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG déterministe (mulberry32) — pas de Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Génération déterministe des défis du jour
// ---------------------------------------------------------------------------

export function questLabel(q: Quest): string {
  const tpl = QUEST_POOL.find(t => t.type === q.type && t.target === q.target);
  const label = tpl?.label ?? '{target}';
  return label.replace('{target}', String(q.target));
}

/**
 * Génère exactement 3 défis distincts (par type) pour le jour donné.
 * Déterministe : même jour local → mêmes défis.
 */
export function generateDailyQuests(date: Date): Quest[] {
  const rng = mulberry32(dateSeed(date));
  const dayKey = localDateKey(date);

  // Mélange déterministe du pool (Fisher-Yates seedé)
  const pool = QUEST_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Sélection : 3 défis de types distincts
  const chosen: QuestTemplate[] = [];
  const seenTypes = new Set<QuestType>();
  for (const tpl of pool) {
    if (seenTypes.has(tpl.type)) continue;
    seenTypes.add(tpl.type);
    chosen.push(tpl);
    if (chosen.length === QUESTS_PER_DAY) break;
  }

  return chosen.map((tpl, idx) => ({
    id: `${dayKey}-${idx}-${tpl.type}`,
    type: tpl.type,
    target: tpl.target,
    progress: 0,
    reward: { ...tpl.reward },
    claimed: false,
  }));
}

// ---------------------------------------------------------------------------
// Avancement (pur) — applique un événement de jeu aux défis
// ---------------------------------------------------------------------------

function incrementFor(quest: Quest, event: QuestEvent): number {
  switch (quest.type) {
    case 'race_count':
      return event.kind === 'race_finished' ? 1 : 0;
    case 'win_count':
      return event.kind === 'race_finished' && event.won ? 1 : 0;
    case 'no_crash_race':
      return event.kind === 'race_finished' && !event.crashed ? 1 : 0;
    case 'distance':
      return event.kind === 'race_finished' ? Math.max(0, event.distance) : 0;
    case 'unlock_item':
      return event.kind === 'item_unlocked' ? 1 : 0;
  }
}

/** Renvoie une nouvelle liste de défis avec la progression mise à jour. */
export function applyProgress(quests: Quest[], event: QuestEvent): Quest[] {
  return quests.map(q => {
    if (q.claimed) return q; // un défi réclamé n'avance plus
    const inc = incrementFor(q, event);
    if (inc <= 0) return q;
    return { ...q, progress: Math.min(q.target, q.progress + inc) };
  });
}

// ---------------------------------------------------------------------------
// Réclamation (pur) — récompense uniquement si complété et non encore réclamé
// ---------------------------------------------------------------------------

export function isComplete(q: Quest): boolean {
  return q.progress >= q.target;
}

export function claimReward(
  quests: Quest[],
  questId: string,
): { quests: Quest[]; reward: QuestReward | null } {
  const target = quests.find(q => q.id === questId);
  if (!target || target.claimed || !isComplete(target)) {
    return { quests, reward: null };
  }
  const updated = quests.map(q => (q.id === questId ? { ...q, claimed: true } : q));
  return { quests: updated, reward: { ...target.reward } };
}

// ---------------------------------------------------------------------------
// Persistance namespacée par profil + reset quotidien
// ---------------------------------------------------------------------------

interface StoredQuests {
  date: string;     // clé de jour local de génération
  quests: Quest[];
}

function storageKey(profileId: string): string {
  return `${LS_PREFIX}${profileId}`;
}

/**
 * Charge les défis du jour pour un profil. Si aucun état n'existe ou si le jour
 * local a changé depuis la dernière génération, régénère (reset à minuit local).
 */
export function loadQuests(profileId: string, now: Date = new Date()): Quest[] {
  const today = localDateKey(now);
  const raw = localStorage.getItem(storageKey(profileId));

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredQuests;
      if (parsed.date === today && Array.isArray(parsed.quests)) {
        return parsed.quests;
      }
    } catch {
      // état corrompu → on régénère
    }
  }

  const fresh = generateDailyQuests(now);
  saveQuests(profileId, fresh, now);
  return fresh;
}

export function saveQuests(profileId: string, quests: Quest[], now: Date = new Date()): void {
  const payload: StoredQuests = { date: localDateKey(now), quests };
  localStorage.setItem(storageKey(profileId), JSON.stringify(payload));
}

/** Charge → applique l'événement → persiste. Renvoie les défis à jour. */
export function recordEvent(profileId: string, event: QuestEvent, now: Date = new Date()): Quest[] {
  const quests = applyProgress(loadQuests(profileId, now), event);
  saveQuests(profileId, quests, now);
  return quests;
}

/**
 * Réclame la récompense d'un défi. Persiste l'état réclamé et renvoie la
 * récompense (ou null si non réclamable). Le branchement sur progression.ts
 * (crédit coins/XP au profil) est fait par l'appelant côté UI.
 */
export function claim(profileId: string, questId: string, now: Date = new Date()): QuestReward | null {
  const { quests, reward } = claimReward(loadQuests(profileId, now), questId);
  if (reward) saveQuests(profileId, quests, now);
  return reward;
}
