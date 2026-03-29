import type { ScreenId, Profile } from './types';
import * as physics from './physics';
import * as circuit from './circuit';
import * as grid from './grid';
import * as multiplayer from './multiplayer';
import * as profiles from './profiles';
import * as game from './game';
import { renderShop } from './shop';

// ---------------------------------------------------------------------------
// Screen routing
// ---------------------------------------------------------------------------

const screens: ScreenId[] = ['home', 'lobby', 'game', 'result', 'shop', 'profile'];

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

  document.getElementById('btn-profile')?.addEventListener('click', () => {
    showScreen('profile');
  });

  document.getElementById('btn-profile-back')?.addEventListener('click', () => {
    showScreen('home');
  });

  document.getElementById('btn-leave')?.addEventListener('click', () => {
    showScreen('home');
  });

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

(window as any).RaceTrack = { physics, circuit, grid, multiplayer, profiles, game, showScreen };
