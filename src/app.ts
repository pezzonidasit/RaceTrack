import type { ScreenId } from './types';
import * as physics from './physics';
import * as circuit from './circuit';
import * as grid from './grid';
import * as multiplayer from './multiplayer';
import * as profiles from './profiles';

(window as any).RaceTrack = { physics, circuit, grid, multiplayer, profiles };

const screens: ScreenId[] = ['home', 'lobby', 'game', 'result', 'shop', 'profile'];

export function showScreen(id: ScreenId): void {
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) {
      el.classList.toggle('active', s === id);
    }
  });
}

async function init(): Promise<void> {
  try {
    await profiles.initAuth();
    console.log('RaceTrack auth initialized');
  } catch (err) {
    console.warn('Auth init failed (offline?):', err);
  }

  showScreen('home');
  console.log('RaceTrack v1 initialized');
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});
