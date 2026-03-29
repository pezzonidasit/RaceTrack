import type { Game, Player, Vec2, PlayerStatus, GameStatus } from './types';
import { PLAYER_COLORS } from './types';
import { generateCircuit } from './circuit';
import { supabase } from './profiles';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAME_CODES = [
  'TURBO', 'BLAZE', 'DRIFT', 'NITRO', 'FLASH', 'SPEED', 'BOOST', 'RACER',
  'VROOM', 'PILOT', 'APEX',  'SLICK', 'BRAKE', 'LAUNCH', 'SHIFT', 'CURVE',
  'SKID',  'GRIP',  'POLE',  'PODIUM',
];

const CIRCUIT_WIDTH = 40;
const CIRCUIT_HEIGHT = 30;
const MAX_PLAYERS = 4;
const CRASH_RESPAWN_TURNS = 2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new game: generate a circuit, pick a random code, insert into DB.
 * Returns { gameId, code }.
 */
export async function createGame(): Promise<{ gameId: string; code: string }> {
  const circuit = generateCircuit(CIRCUIT_WIDTH, CIRCUIT_HEIGHT);
  const code = pickCode();

  const { data, error } = await supabase
    .from('games')
    .insert({
      code,
      status: 'lobby',
      circuit_data: circuit,
      current_turn: 0,
      current_player_index: 0,
    })
    .select('id, code')
    .single();

  if (error || !data) {
    throw new Error(`createGame failed: ${error?.message}`);
  }

  return { gameId: data.id as string, code: data.code as string };
}

/**
 * Join an existing game by code. Inserts a player row.
 * Returns { gameId, playerId }.
 */
export async function joinGame(
  code: string,
  playerName: string,
  userId: string,
): Promise<{ gameId: string; playerId: string }> {
  // Find game
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, status')
    .eq('code', code.toUpperCase())
    .neq('status', 'finished')
    .single();

  if (gameError || !game) {
    throw new Error('Partie introuvable ou déjà terminée');
  }

  if ((game.status as string) !== 'lobby') {
    throw new Error('La partie a déjà commencé');
  }

  // Check player count
  const { count, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', game.id);

  if (countError) {
    throw new Error(`joinGame count failed: ${countError.message}`);
  }

  if ((count ?? 0) >= MAX_PLAYERS) {
    throw new Error('La partie est complète (4 joueurs max)');
  }

  // Pick color based on current slot
  const colorIndex = (count ?? 0) % PLAYER_COLORS.length;
  const color = PLAYER_COLORS[colorIndex];

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({
      game_id: game.id,
      user_id: userId,
      name: playerName,
      color,
      skin: 'default',
      trail: 'default',
      position_x: 0,
      position_y: 0,
      velocity_x: 0,
      velocity_y: 0,
      status: 'alive',
      skip_count: 0,
      crash_turns_left: 0,
    })
    .select('id')
    .single();

  if (insertError || !player) {
    throw new Error(`joinGame insert failed: ${insertError?.message}`);
  }

  return { gameId: game.id as string, playerId: player.id as string };
}

/**
 * Fetch the full game state (game + players) from DB and map to Game type.
 */
export async function getGameState(gameId: string): Promise<Game> {
  const [gameResult, playersResult] = await Promise.all([
    supabase.from('games').select('*').eq('id', gameId).single(),
    supabase.from('players').select('*').eq('game_id', gameId).order('created_at'),
  ]);

  if (gameResult.error || !gameResult.data) {
    throw new Error(`getGameState failed: ${gameResult.error?.message}`);
  }
  if (playersResult.error) {
    throw new Error(`getGameState players failed: ${playersResult.error?.message}`);
  }

  const g = gameResult.data as Record<string, unknown>;
  const players = (playersResult.data ?? []).map(mapRowToPlayer);

  return {
    id: g.id as string,
    code: g.code as string,
    status: g.status as GameStatus,
    circuit: g.circuit_data as Game['circuit'],
    current_turn: g.current_turn as number,
    current_player_index: g.current_player_index as number,
    players,
  };
}

/**
 * Fetch players for a game.
 */
export async function getGamePlayers(gameId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at');

  if (error) throw new Error(`getGamePlayers failed: ${error.message}`);
  return (data ?? []).map(mapRowToPlayer);
}

/**
 * Assign start positions from circuit to players, update game status to 'playing'.
 */
export async function startGame(gameId: string): Promise<void> {
  const game = await getGameState(gameId);

  if (game.status !== 'lobby') {
    throw new Error('La partie a déjà commencé');
  }

  const startPositions = game.circuit.startPositions;
  const players = game.players;

  // Assign start positions round-robin if fewer positions than players
  const updates = players.map((p, i) => {
    const pos = startPositions[i % startPositions.length];
    return supabase
      .from('players')
      .update({
        position_x: pos.x,
        position_y: pos.y,
        velocity_x: 0,
        velocity_y: 0,
      })
      .eq('id', p.id);
  });

  await Promise.all(updates);

  const { error } = await supabase
    .from('games')
    .update({ status: 'playing' })
    .eq('id', gameId);

  if (error) throw new Error(`startGame failed: ${error.message}`);
}

/**
 * Submit a move for a player. Updates move log, player state, and advances turn.
 */
export async function submitMove(
  gameId: string,
  playerId: string,
  acceleration: Vec2,
  newPosition: Vec2,
  newVelocity: Vec2,
  crashed: boolean,
  turn: number,
): Promise<void> {
  // Insert move record
  const { error: moveError } = await supabase
    .from('moves')
    .insert({
      game_id: gameId,
      player_id: playerId,
      turn,
      accel_x: acceleration.x,
      accel_y: acceleration.y,
      new_position_x: newPosition.x,
      new_position_y: newPosition.y,
      crashed,
      auto_skip: false,
    });

  if (moveError) throw new Error(`submitMove insert failed: ${moveError.message}`);

  // Update player state
  const playerUpdate: Record<string, unknown> = {
    position_x: newPosition.x,
    position_y: newPosition.y,
    velocity_x: newVelocity.x,
    velocity_y: newVelocity.y,
  };

  if (crashed) {
    playerUpdate.status = 'crashed';
    playerUpdate.crash_turns_left = CRASH_RESPAWN_TURNS;
    playerUpdate.velocity_x = 0;
    playerUpdate.velocity_y = 0;
  }

  // Check if player crossed finish line
  const game = await getGameState(gameId);
  const finishSet = new Set(game.circuit.finishLine.map(p => `${p.x},${p.y}`));
  const onFinish = finishSet.has(`${newPosition.x},${newPosition.y}`);

  if (onFinish && !crashed) {
    const finishedCount = game.players.filter(p => p.status === 'finished').length;
    playerUpdate.status = 'finished';
    playerUpdate.finish_position = finishedCount + 1;
  }

  const { error: playerError } = await supabase
    .from('players')
    .update(playerUpdate)
    .eq('id', playerId);

  if (playerError) throw new Error(`submitMove player update failed: ${playerError.message}`);

  // Advance turn
  await advanceTurn(gameId);
}

/**
 * Subscribe to realtime updates for a game.
 * Returns an unsubscribe function.
 */
export function subscribeToGame(
  gameId: string,
  onUpdate: (event: string, table: string, record: Record<string, unknown>) => void,
): () => void {
  const channel = supabase
    .channel(`game:${gameId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'moves', filter: `game_id=eq.${gameId}` },
      (payload) => onUpdate(payload.eventType, 'moves', payload.new as Record<string, unknown>),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
      (payload) => onUpdate(payload.eventType, 'players', payload.new as Record<string, unknown>),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (payload) => onUpdate(payload.eventType, 'games', payload.new as Record<string, unknown>),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

/**
 * Advance to the next active player. Skip crashed players (decrement their
 * crash_turns_left). Detect game end when all non-finished players are gone.
 */
async function advanceTurn(gameId: string): Promise<void> {
  const game = await getGameState(gameId);
  const players = game.players;

  // Check if game is already done
  const activePlayers = players.filter(p => p.status === 'alive' || p.status === 'crashed');
  if (activePlayers.length === 0) {
    await supabase.from('games').update({ status: 'finished' }).eq('id', gameId);
    return;
  }

  // Find next player index (cycle through all, skip finished/kicked)
  const total = players.length;
  let nextIndex = (game.current_player_index + 1) % total;
  let safetyCounter = 0;

  while (safetyCounter < total) {
    const candidate = players[nextIndex];
    if (candidate.status === 'alive') {
      break; // Found a player who can move
    }
    if (candidate.status === 'crashed') {
      // Decrement crash_turns_left; if it reaches 0 → revive
      const newCrashTurns = candidate.crash_turns_left - 1;
      if (newCrashTurns <= 0) {
        await supabase
          .from('players')
          .update({ crash_turns_left: 0, status: 'alive' })
          .eq('id', candidate.id);
      } else {
        await supabase
          .from('players')
          .update({ crash_turns_left: newCrashTurns })
          .eq('id', candidate.id);
      }
      // Auto-skip for this turn — insert a skip move
      await supabase.from('moves').insert({
        game_id: gameId,
        player_id: candidate.id,
        turn: game.current_turn,
        accel_x: 0,
        accel_y: 0,
        new_position_x: candidate.position.x,
        new_position_y: candidate.position.y,
        crashed: false,
        auto_skip: true,
      });
      // Move to next
      nextIndex = (nextIndex + 1) % total;
      safetyCounter++;
      continue;
    }
    // finished / kicked — skip silently
    nextIndex = (nextIndex + 1) % total;
    safetyCounter++;
  }

  // Advance turn counter when we've looped through all players
  const newTurn =
    nextIndex <= game.current_player_index
      ? game.current_turn + 1
      : game.current_turn;

  await supabase
    .from('games')
    .update({ current_player_index: nextIndex, current_turn: newTurn })
    .eq('id', gameId);
}

function pickCode(): string {
  return GAME_CODES[Math.floor(Math.random() * GAME_CODES.length)];
}

function mapRowToPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    game_id: row.game_id as string,
    user_id: row.user_id as string,
    name: row.name as string,
    color: row.color as string,
    skin: (row.skin as string) ?? 'default',
    trail: (row.trail as string) ?? 'default',
    position: { x: row.position_x as number, y: row.position_y as number },
    velocity: { x: row.velocity_x as number, y: row.velocity_y as number },
    status: row.status as PlayerStatus,
    finish_position: (row.finish_position as number | null) ?? null,
    skip_count: (row.skip_count as number) ?? 0,
    crash_turns_left: (row.crash_turns_left as number) ?? 0,
  };
}
