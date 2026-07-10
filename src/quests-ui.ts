// ---------------------------------------------------------------------------
// UI + intégration des défis quotidiens
//
// Couche DOM/intégration au-dessus du moteur pur src/quests.ts :
// - résolution offline-safe de l'identité du profil (namespacing localStorage)
// - hooks d'avancement appelés par game.ts (fin de course) et shop.ts (achat)
// - rendu de la section « Défis du jour » + bouton « réclamer »
// - branchement de la récompense sur progression.ts (coins/XP)
// ---------------------------------------------------------------------------

import {
  loadQuests,
  recordEvent,
  claim,
  questLabel,
  isComplete,
  type Quest,
  type QuestEvent,
} from './quests';
import { creditRewards } from './progression';
import { getUserId } from './profiles';

// ---------------------------------------------------------------------------
// Identité du profil — namespacing localStorage (offline-safe)
// ---------------------------------------------------------------------------

const LOCAL_FALLBACK_ID = 'local';

/**
 * Identifiant servant à namespacer les défis. Utilise l'user id Supabase si
 * authentifié, sinon un id local stable — le système reste 100 % jouable
 * offline (aucune dépendance réseau requise).
 */
function getProfileId(): string {
  try {
    return getUserId();
  } catch {
    return LOCAL_FALLBACK_ID;
  }
}

// ---------------------------------------------------------------------------
// Hooks d'avancement (appelés par les autres modules de jeu)
// ---------------------------------------------------------------------------

export function notifyRaceFinished(opts: { won: boolean; crashed: boolean; distance: number }): void {
  const event: QuestEvent = {
    kind: 'race_finished',
    won: opts.won,
    crashed: opts.crashed,
    distance: opts.distance,
  };
  recordEvent(getProfileId(), event);
  renderQuests();
}

export function notifyItemUnlocked(): void {
  recordEvent(getProfileId(), { kind: 'item_unlocked' });
  renderQuests();
}

// ---------------------------------------------------------------------------
// Réclamation d'une récompense → crédit progression
// ---------------------------------------------------------------------------

async function handleClaim(questId: string): Promise<void> {
  const reward = claim(getProfileId(), questId);
  if (!reward) return;

  try {
    await creditRewards(reward);
  } catch (err) {
    console.warn('creditRewards (défis) a échoué — profil non synchronisé:', err);
  }

  renderQuests();
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function questCardHtml(q: Quest): string {
  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
  const complete = isComplete(q);

  let btn: string;
  if (q.claimed) {
    btn = `<button class="btn btn-small quest-claim" disabled>Réclamé ✓</button>`;
  } else if (complete) {
    btn = `<button class="btn btn-small btn-primary quest-claim" data-quest-id="${q.id}">Réclamer</button>`;
  } else {
    btn = `<button class="btn btn-small quest-claim" disabled>${q.progress}/${q.target}</button>`;
  }

  return `
    <div class="quest-card${q.claimed ? ' claimed' : ''}${complete && !q.claimed ? ' ready' : ''}">
      <div class="quest-info">
        <div class="quest-label">${questLabel(q)}</div>
        <div class="quest-reward">🪙 ${q.reward.coins} · ${q.reward.xp} XP</div>
      </div>
      <div class="quest-bar"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
      ${btn}
    </div>
  `;
}

export function renderQuests(): void {
  const container = document.getElementById('quests-container');
  if (!container) return;

  const quests = loadQuests(getProfileId());

  container.innerHTML = quests.map(questCardHtml).join('');

  container.querySelectorAll<HTMLButtonElement>('.quest-claim:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.questId;
      if (id) handleClaim(id).catch(console.error);
    });
  });
}
