import type { ScreenId } from './types';

const screens: ScreenId[] = ['home', 'lobby', 'game', 'result', 'shop', 'profile'];

export function showScreen(id: ScreenId): void {
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) {
      el.classList.toggle('active', s === id);
    }
  });
}

function init(): void {
  showScreen('home');
  console.log('RaceTrack v1 initialized');
}

document.addEventListener('DOMContentLoaded', init);
