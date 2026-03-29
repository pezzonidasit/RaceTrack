export interface Vec2 {
  x: number;
  y: number;
}

export type CellType = 'track' | 'wall' | 'start' | 'finish';

export interface Circuit {
  width: number;
  height: number;
  cells: CellType[][];
  startPositions: Vec2[];
  finishLine: Vec2[];
  centerline: Vec2[];
}

export type PlayerStatus = 'alive' | 'crashed' | 'finished' | 'kicked';
export type GameStatus = 'lobby' | 'playing' | 'finished';

export interface Player {
  id: string;
  game_id: string;
  user_id: string;
  name: string;
  color: string;
  skin: string;
  trail: string;
  position: Vec2;
  velocity: Vec2;
  status: PlayerStatus;
  finish_position: number | null;
  skip_count: number;
  crash_turns_left: number;
}

export interface Game {
  id: string;
  code: string;
  status: GameStatus;
  circuit: Circuit;
  current_turn: number;
  current_player_index: number;
  players: Player[];
}

export interface Move {
  id: string;
  game_id: string;
  player_id: string;
  turn: number;
  acceleration: Vec2;
  new_position: Vec2;
  crashed: boolean;
  auto_skip: boolean;
}

export interface Profile {
  id: string;
  name: string;
  xp: number;
  coins: number;
  rank: string;
  games_played: number;
  games_won: number;
  owned_skins: string[];
  owned_trails: string[];
  owned_themes: string[];
}

export type ScreenId = 'home' | 'lobby' | 'game' | 'result' | 'shop' | 'profile';

export const RANKS = [
  { name: 'Karting', xp: 0 },
  { name: 'Rally', xp: 500 },
  { name: 'F3', xp: 1500 },
  { name: 'F1', xp: 3500 },
  { name: 'Champion', xp: 7000 },
  { name: 'Légende', xp: 15000 },
] as const;

export const PLAYER_COLORS = ['#FF4444', '#44AAFF', '#44FF44', '#FFAA00'] as const;

export type RankName = typeof RANKS[number]['name'];
export type PlayerColor = typeof PLAYER_COLORS[number];

export function isValidRank(name: string): name is RankName {
  return RANKS.some(r => r.name === name);
}

export function isValidColor(color: string): color is PlayerColor {
  return PLAYER_COLORS.includes(color as PlayerColor);
}
