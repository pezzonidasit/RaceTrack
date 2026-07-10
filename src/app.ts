import type { ScreenId, Profile } from './types';
import * as physics from './physics';
import * as circuit from './circuit';
import * as grid from './grid';
import * as multiplayer from './multiplayer';
import * as profiles from './profiles';
import * as game from './game';
import { renderShop } from './shop';
import { renderQuests } from './quests-ui';
import * as editorUi from './editor-ui';

// ---------------------------------------------------------------------------
// Screen routing
// ---------------------------------------------------------------------------

const screens: ScreenId[] = [
  'home', 'lobby', 'game', 'result', 'shop', 'profile',
  'quests', 'circuits', 'editor', 'solo', 'solo-ai',
];

export function showScreen(id: ScreenId): void {
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) {
      el.classList.toggle('active', s === id);
    }
  });
}

// ---------------------------------------------------------------------------
// Home profile display
// ---------------------------------------------------------------------------

function updateHomeProfile(profile: Profile): void {
  const el = document.getElementById('home-profile');
  if (!el) return;

  el.innerHTML = `
    <div class="home-profile-name">${profile.name}</div>
    <div class="home-profile-stats">
      <span class="home-profile-rank">${profile.rank}</span>
      <span class="home-profile-xp">${profile.xp} XP</span>
      <span class="home-profile-coins">${profile.coins} 🪙</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  // Wire button handlers first (before async work so UI is responsive immediately)

  // --- Solo (contre IA) ---
  let soloOpponentCount = 1;
  const soloOptionBtns = Array.from(
    document.querySelectorAll<HTMLElement>('#solo-ai-opponents .btn-opt'),
  );
  const selectSoloOption = (btn: HTMLElement): void => {
    soloOpponentCount = parseInt(btn.dataset.count ?? '1', 10) || 1;
    soloOptionBtns.forEach(b => b.classList.toggle('selected', b === btn));
  };
  soloOptionBtns.forEach(btn => btn.addEventListener('click', () => selectSoloOption(btn)));
  // Sélection par défaut : 1 IA
  const defaultSoloBtn = soloOptionBtns.find(b => b.dataset.count === '1');
  if (defaultSoloBtn) selectSoloOption(defaultSoloBtn);

  document.getElementById('btn-solo-ai')?.addEventListener('click', () => {
    showScreen('solo-ai');
  });
  document.getElementById('btn-solo-ai-back')?.addEventListener('click', () => {
    showScreen('home');
  });
  document.getElementById('btn-solo-ai-start')?.addEventListener('click', () => {
    game.startSolo(soloOpponentCount);
  });

  document.getElementById('btn-create')?.addEventListener('click', () => {
    game.handleCreateGame().catch(console.error);
  });

  document.getElementById('btn-join')?.addEventListener('click', () => {
    game.handleJoinGame().catch(console.error);
  });

  document.getElementById('btn-home')?.addEventListener('click', () => {
    showScreen('home');
  });

  document.getElementById('btn-shop')?.addEventListener('click', () => {
    showScreen('shop');
    renderShop().catch(console.error);
  });

  document.getElementById('btn-shop-back')?.addEventListener('click', () => {
    showScreen('home');
  });

  document.getElementById('btn-quests')?.addEventListener('click', () => {
    showScreen('quests');
    renderQuests();
  });

  document.getElementById('btn-quests-back')?.addEventListener('click', () => {
    showScreen('home');
  });

  document.getElementById('btn-profile')?.addEventListener('click', () => {
    showScreen('profile');
  });

  document.getElementById('btn-profile-back')?.addEventListener('click', () => {
    showScreen('home');
  });

  document.getElementById('btn-leave')?.addEventListener('click', () => {
    showScreen('home');
  });

  // Éditeur de circuits perso (mode local, sans réseau)
  editorUi.initMyCircuitsScreen();
  editorUi.initEditorScreen();
  editorUi.initSoloScreen();

  showScreen('home');
  console.log('RaceTrack v1 initialized');

  // Async auth + profile (non-blocking — UI is already wired above)
  try {
    await profiles.initAuth();
    console.log('RaceTrack auth initialized');
  } catch (err) {
    console.warn('Auth init failed (offline?):', err);
  }

  try {
    const profile = await profiles.getOrCreateProfile();
    updateHomeProfile(profile);
  } catch (err) {
    console.warn('Profile load failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});

// ---------------------------------------------------------------------------
// Window exposure for debugging / console access
// ---------------------------------------------------------------------------

(window as any).RaceTrack = { physics, circuit, grid, multiplayer, profiles, game, editorUi, showScreen };
