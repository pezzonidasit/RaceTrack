import type { Game, Player, Profile } from './types';
import type { MoveOption } from './physics';
import * as physics from './physics';
import * as grid from './grid';
import * as multiplayer from './multiplayer';
import * as profiles from './profiles';
import { calculateRewards, updateProfileAfterGame } from './progression';
import { showScreen } from './app';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentGame: Game | null = null;
let currentPlayerId: string | null = null;
let currentMoves: MoveOption[] | null = null;
let unsubscribe: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Game screen
// ---------------------------------------------------------------------------

export function initGameScreen(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('initGameScreen: #game-canvas not found');
    return;
  }

  grid.initGrid(canvas);
  canvas.addEventListener('click', handleCanvasTap);
}

function handleCanvasTap(e: MouseEvent): void {
  if (!currentGame || !currentPlayerId || !currentMoves) return;

  // Check it's my turn
  const myPlayer = currentGame.players.find(p => p.id === currentPlayerId);
  if (!myPlayer) return;

  const currentPlayer = currentGame.players[currentGame.current_player_index];
  if (!currentPlayer || currentPlayer.id !== currentPlayerId) return;

  if (myPlayer.status !== 'alive') return;

  // Convert click to grid coords
  const canvas = e.currentTarget as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  const gridCoord = grid.screenToGrid(screenX, screenY);

  // Find matching move option
  const move = currentMoves.find(
    m => m.target.x === gridCoord.x && m.target.y === gridCoord.y,
  );

  if (!move) return;

  executeMove(move).catch(err => {
    console.error('executeMove failed:', err);
  });
}

async function executeMove(move: MoveOption): Promise<void> {
  if (!currentGame || !currentPlayerId) return;

  const myPlayer = currentGame.players.find(p => p.id === currentPlayerId);
  if (!myPlayer) return;

  // Calculate new position
  const result = physics.calculateNewPosition(myPlayer.position, myPlayer.velocity, move.acceleration);

  // Check collision
  const collision = physics.checkCollision(myPlayer.position, result.newPosition, currentGame.circuit.cells);

  try {
    await multiplayer.submitMove(
      currentGame.id,
      currentPlayerId,
      move.acceleration,
      result.newPosition,
      result.newVelocity,
      collision.crashed,
      currentGame.current_turn,
    );
  } catch (err) {
    console.error('submitMove failed:', err);
    return;
  }

  // Refresh state after move
  await refreshGameState();
}

export async function refreshGameState(): Promise<void> {
  if (!currentGame) return;

  try {
    currentGame = await multiplayer.getGameState(currentGame.id);
  } catch (err) {
    console.error('refreshGameState failed:', err);
    return;
  }

  if (currentGame.status === 'finished') {
    handleGameEnd();
    return;
  }

  // Is it my turn?
  const currentPlayer = currentGame.players[currentGame.current_player_index];
  const isMyTurn = !!currentPlayerId && !!currentPlayer && currentPlayer.id === currentPlayerId;

  if (isMyTurn && currentPlayer) {
    currentMoves = physics.getPossibleMoves(currentPlayer.position, currentPlayer.velocity);
    grid.centerOnPlayer(currentPlayer);
  } else {
    currentMoves = [];
  }

  const myPlayer = currentGame.players.find(p => p.id === currentPlayerId);
  const playerName = myPlayer?.name ?? '';
  const turnLabel = `Tour ${currentGame.current_turn + 1}`;

  updateHUD(playerName, turnLabel, isMyTurn);

  grid.render(
    currentGame.circuit,
    currentGame.players,
    currentMoves,
    currentPlayerId ?? '',
  );
}

function updateHUD(playerName: string, turn: string, isMyTurn: boolean): void {
  const hudTurn = document.getElementById('hud-turn');
  const hudPlayer = document.getElementById('hud-player');

  if (hudTurn) {
    hudTurn.textContent = turn;
  }
  if (hudPlayer) {
    hudPlayer.textContent = isMyTurn ? `${playerName} — à vous de jouer!` : `${playerName} — en attente…`;
  }
}

function handleGameEnd(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (!currentGame) return;

  const game = currentGame;

  // Find the local player's finish data
  const myPlayer = game.players.find(p => p.id === currentPlayerId);
  const finishPosition = myPlayer?.finish_position ?? game.players.length;
  const noCrash = myPlayer?.status !== 'crashed';
  const totalTurns = game.current_turn;
  const won = finishPosition === 1;

  const rewards = calculateRewards(finishPosition, noCrash, totalTurns);

  // Persist to Supabase (fire-and-forget — don't block the result screen)
  updateProfileAfterGame(rewards, won).catch(err => {
    console.error('updateProfileAfterGame failed:', err);
  });

  showResultScreen(game.players, rewards);
}

function showResultScreen(players: Player[], rewards: { xp: number; coins: number }): void {
  const rankingEl = document.getElementById('result-ranking');
  const rewardsEl = document.getElementById('result-rewards');

  if (rankingEl) {
    const finished = players
      .filter(p => p.finish_position !== null)
      .sort((a, b) => (a.finish_position ?? 99) - (b.finish_position ?? 99));
    const others = players.filter(p => p.finish_position === null);
    const sorted = [...finished, ...others];

    rankingEl.innerHTML = sorted.map((p, i) => {
      const pos = p.finish_position ?? '—';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `<div class="result-row">
        <span class="result-medal">${medal}</span>
        <span class="result-dot" style="background:${p.color}"></span>
        <span class="result-name">${p.name}</span>
        <span class="result-pos">${pos}</span>
      </div>`;
    }).join('');
  }

  if (rewardsEl) {
    rewardsEl.innerHTML = `
      <div class="rewards-title">Récompenses</div>
      <div class="rewards-row">+${rewards.xp} XP &nbsp; +${rewards.coins} coins</div>
    `;
  }

  showScreen('result');
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export async function handleCreateGame(): Promise<void> {
  try {
    // Ensure name
    let name = profiles.getLocalName();
    if (!name) {
      name = prompt('Votre pseudo?') ?? '';
      if (!name.trim()) return;
      profiles.setLocalName(name.trim());
    }

    const userId = profiles.getUserId();
    const { gameId, code } = await multiplayer.createGame();
    const { playerId } = await multiplayer.joinGame(code, name, userId);

    currentGame = await multiplayer.getGameState(gameId);
    currentPlayerId = playerId;

    showLobby(gameId, code, true);
  } catch (err) {
    console.error('handleCreateGame failed:', err);
    alert(`Erreur: ${(err as Error).message}`);
  }
}

export async function handleJoinGame(): Promise<void> {
  try {
    let name = profiles.getLocalName();
    if (!name) {
      name = prompt('Votre pseudo?') ?? '';
      if (!name.trim()) return;
      profiles.setLocalName(name.trim());
    }

    const code = prompt('Code de la partie?') ?? '';
    if (!code.trim()) return;

    const userId = profiles.getUserId();
    const { gameId, playerId } = await multiplayer.joinGame(code.trim().toUpperCase(), name, userId);

    currentGame = await multiplayer.getGameState(gameId);
    currentPlayerId = playerId;

    showLobby(gameId, currentGame.code, false);
  } catch (err) {
    console.error('handleJoinGame failed:', err);
    alert(`Erreur: ${(err as Error).message}`);
  }
}

function showLobby(gameId: string, code: string, isCreator: boolean): void {
  const codeEl = document.getElementById('lobby-code');
  if (codeEl) {
    codeEl.textContent = `Code: ${code}`;
  }

  const startBtn = document.getElementById('btn-start') as HTMLButtonElement | null;
  if (startBtn) {
    startBtn.style.display = isCreator ? '' : 'none';
    startBtn.onclick = async () => {
      try {
        await multiplayer.startGame(gameId);
      } catch (err) {
        console.error('startGame failed:', err);
        alert(`Erreur: ${(err as Error).message}`);
      }
    };
  }

  // Subscribe to realtime updates
  if (unsubscribe) {
    unsubscribe();
  }
  unsubscribe = multiplayer.subscribeToGame(gameId, async (_event, _table, _record) => {
    if (!currentGame) return;

    try {
      currentGame = await multiplayer.getGameState(gameId);
    } catch {
      return;
    }

    if (currentGame.status === 'playing') {
      // Transition to game screen
      showScreen('game');
      initGameScreen();
      await refreshGameState();
      return;
    }

    // Still in lobby — update player list
    renderLobbyPlayers(currentGame.players);
  });

  // Initial player list render
  if (currentGame) {
    renderLobbyPlayers(currentGame.players);
  }

  showScreen('lobby');
}

function renderLobbyPlayers(players: Player[]): void {
  const el = document.getElementById('lobby-players');
  if (!el) return;

  el.innerHTML = players.map(p => `
    <div class="lobby-player">
      <span class="lobby-dot" style="background:${p.color}"></span>
      <span class="lobby-name">${p.name}</span>
    </div>
  `).join('');
}
