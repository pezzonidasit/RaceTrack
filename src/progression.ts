import type { Profile } from './types';
import { RANKS } from './types';
import { updateProfile, getOrCreateProfile } from './profiles';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const XP_BY_PLACE = [100, 60, 35, 20];
const COINS_BY_PLACE = [50, 30, 20, 10];
const BONUS_NO_CRASH = 30;
const BONUS_FAST_WIN = 20;
const FAST_WIN_THRESHOLD = 20;
const DAILY_MULTIPLIERS = [1.0, 1.0, 1.0, 0.5, 0.3, 0.1];

const LS_DAILY_DATE = 'rt_daily_date';
const LS_DAILY_COUNT = 'rt_daily_count';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface Rewards {
  xp: number;
  coins: number;
  newRank: string | null;
}

// ---------------------------------------------------------------------------
// calculateRewards
// ---------------------------------------------------------------------------

/**
 * Calculate XP and coins for a finished game.
 * @param finishPosition 1-indexed finish position (1 = 1st place)
 * @param noCrash        true if the player never crashed
 * @param totalTurns     total turns the game lasted
 */
export function calculateRewards(
  finishPosition: number,
  noCrash: boolean,
  totalTurns: number,
): Rewards {
  const idx = Math.min(finishPosition - 1, XP_BY_PLACE.length - 1);

  // Base XP
  let xp = XP_BY_PLACE[idx] ?? 0;
  if (noCrash) xp += BONUS_NO_CRASH;
  if (finishPosition === 1 && totalTurns < FAST_WIN_THRESHOLD) xp += BONUS_FAST_WIN;

  // Base coins with daily diminishing returns
  const dailyCount = getDailyGameCount();
  const multiplierIdx = Math.min(dailyCount, DAILY_MULTIPLIERS.length - 1);
  const multiplier = DAILY_MULTIPLIERS[multiplierIdx] ?? 0.1;
  const baseCoins = COINS_BY_PLACE[idx] ?? 0;
  const coins = Math.round(baseCoins * multiplier);

  return { xp, coins, newRank: null };
}

// ---------------------------------------------------------------------------
// getRankForXp
// ---------------------------------------------------------------------------

/**
 * Return the rank name corresponding to the given XP total.
 */
export function getRankForXp(xp: number): string {
  let rank = RANKS[0].name as string;
  for (const r of RANKS) {
    if (xp >= r.xp) {
      rank = r.name;
    }
  }
  return rank;
}

// ---------------------------------------------------------------------------
// updateProfileAfterGame
// ---------------------------------------------------------------------------

/**
 * Fetch the current profile, apply rewards, recalculate rank, persist.
 */
export async function updateProfileAfterGame(rewards: Rewards, won: boolean): Promise<void> {
  const profile: Profile = await getOrCreateProfile();

  const newXp = profile.xp + rewards.xp;
  const newCoins = profile.coins + rewards.coins;
  const newRank = getRankForXp(newXp);
  const newGamesPlayed = profile.games_played + 1;
  const newGamesWon = won ? profile.games_won + 1 : profile.games_won;

  await updateProfile({
    xp: newXp,
    coins: newCoins,
    rank: newRank,
    games_played: newGamesPlayed,
    games_won: newGamesWon,
  });

  incrementDailyGameCount();
}

// ---------------------------------------------------------------------------
// Private helpers — daily game count (localStorage)
// ---------------------------------------------------------------------------

function getDailyGameCount(): number {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const storedDate = localStorage.getItem(LS_DAILY_DATE);
  if (storedDate !== today) {
    // New day — reset
    localStorage.setItem(LS_DAILY_DATE, today);
    localStorage.setItem(LS_DAILY_COUNT, '0');
    return 0;
  }
  const count = parseInt(localStorage.getItem(LS_DAILY_COUNT) ?? '0', 10);
  return isNaN(count) ? 0 : count;
}

function incrementDailyGameCount(): void {
  const count = getDailyGameCount();
  localStorage.setItem(LS_DAILY_COUNT, String(count + 1));
}
