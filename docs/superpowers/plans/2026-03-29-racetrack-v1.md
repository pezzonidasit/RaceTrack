# RaceTrack v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first multiplayer async racing game on a grid, inspired by the paper RaceTrack game, deployed as a PWA on GitHub Pages with Supabase backend.

**Architecture:** TypeScript vanilla SPA with HTML5 Canvas rendering. Supabase handles auth, game state persistence, and realtime notifications. esbuild bundles TS → single JS file. No framework.

**Tech Stack:** TypeScript, esbuild, HTML5 Canvas, Supabase (PostgreSQL + Realtime + Anonymous Auth), Playwright, GitHub Pages

---

## File Structure

| File | Responsibility |
|------|---------------|
| `index.html` | SPA shell — all screens as hidden divs, Canvas element, script/style refs |
| `css/style.css` | Dark theme, CSS custom properties, mobile-first layout, screen transitions |
| `src/types.ts` | All shared TypeScript interfaces and types (Vec2, Player, Game, Circuit, etc.) |
| `src/grid.ts` | Canvas rendering — draw grid, track, cars, trails, highlights. Zoom/pan touch. |
| `src/physics.ts` | Movement calculation, collision detection (line-segment vs walls), respawn logic |
| `src/circuit.ts` | Random circuit generation + pathfinder validation |
| `src/game.ts` | Game state machine (home → lobby → playing → result), turn management |
| `src/multiplayer.ts` | Supabase client init, CRUD for games/players/moves, Realtime subscriptions |
| `src/profiles.ts` | Anonymous auth, pseudo management, localStorage profile |
| `src/progression.ts` | XP, ranks, coins, reward calculation, diminishing returns |
| `src/shop.ts` | Shop catalog (skins, trails, themes), purchase logic, inventory |
| `src/app.ts` | Entry point — screen navigation, init sequence, event wiring |
| `sw.js` | Service worker — cache-first for assets, network-first for Supabase |
| `manifest.json` | PWA manifest — name, icons, theme color, display standalone |
| `tsconfig.json` | TypeScript config — strict mode, ES2020 target, DOM lib |
| `package.json` | Scripts (build, watch, test), deps (esbuild, @supabase/supabase-js, playwright) |
| `tests/test_physics.spec.ts` | Playwright tests for physics/collision (unit-style via page.evaluate) |
| `tests/test_circuit.spec.ts` | Playwright tests for circuit generation |
| `tests/test_game.spec.ts` | Playwright E2E tests for game flow |
| `CLAUDE.md` | Project instructions for Claude Code |
| `supabase/migrations/001_init.sql` | Supabase migration — all 4 tables + RLS policies |

---

## Task 1: Project Scaffold & Build Pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `css/style.css`
- Create: `src/types.ts`
- Create: `src/app.ts`
- Create: `CLAUDE.md`

- [ ] **Step 1: Initialize package.json**

```bash
cd ~/projects/claude-workspace/RaceTrack
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install --save-dev esbuild typescript @playwright/test
npm install @supabase/supabase-js
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Add build scripts to package.json**

Add to `scripts`:
```json
{
  "build": "esbuild src/app.ts --bundle --outfile=dist/bundle.js --format=iife --target=es2020",
  "watch": "esbuild src/app.ts --bundle --outfile=dist/bundle.js --format=iife --target=es2020 --watch",
  "typecheck": "tsc --noEmit",
  "test": "npx playwright test"
}
```

- [ ] **Step 5: Create src/types.ts with core types**

```typescript
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

export const PLAYER_COLORS = ['#FF4444', '#44AAFF', '#44FF44', '#FFAA00'];
```

- [ ] **Step 6: Create minimal src/app.ts entry point**

```typescript
import type { ScreenId } from './types';

const screens: ScreenId[] = ['home', 'lobby', 'game', 'result', 'shop', 'profile'];

export function showScreen(id: ScreenId): void {
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('active', s === id);
  });
}

function init(): void {
  showScreen('home');
  console.log('RaceTrack v1 initialized');
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 7: Create index.html with all screen shells**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a1a2e">
  <title>RaceTrack</title>
  <link rel="stylesheet" href="css/style.css">
  <link rel="manifest" href="manifest.json">
  <link rel="icon" type="image/png" href="icons/icon-192.png">
</head>
<body>
  <div id="screen-home" class="screen active">
    <h1>🏎️ RaceTrack</h1>
    <div id="home-profile"></div>
    <button id="btn-create" class="btn btn-primary">Créer une course</button>
    <button id="btn-join" class="btn btn-secondary">Rejoindre</button>
    <div class="home-nav">
      <button id="btn-shop" class="btn btn-small">Shop</button>
      <button id="btn-profile" class="btn btn-small">Profil</button>
    </div>
  </div>

  <div id="screen-lobby" class="screen">
    <h2>Lobby</h2>
    <div id="lobby-code" class="code-display"></div>
    <div id="lobby-players"></div>
    <button id="btn-start" class="btn btn-primary" style="display:none">Lancer la course!</button>
    <button id="btn-leave" class="btn btn-secondary">Quitter</button>
  </div>

  <div id="screen-game" class="screen">
    <div id="game-hud">
      <span id="hud-turn"></span>
      <span id="hud-player"></span>
    </div>
    <canvas id="game-canvas"></canvas>
    <div id="game-status"></div>
  </div>

  <div id="screen-result" class="screen">
    <h2>Résultats</h2>
    <div id="result-ranking"></div>
    <div id="result-rewards"></div>
    <button id="btn-home" class="btn btn-primary">Retour</button>
  </div>

  <div id="screen-shop" class="screen">
    <h2>Shop</h2>
    <div id="shop-coins"></div>
    <div id="shop-grid"></div>
    <button id="btn-shop-back" class="btn btn-secondary">Retour</button>
  </div>

  <div id="screen-profile" class="screen">
    <h2>Profil</h2>
    <div id="profile-stats"></div>
    <div id="profile-history"></div>
    <button id="btn-profile-back" class="btn btn-secondary">Retour</button>
  </div>

  <script src="dist/bundle.js"></script>
</body>
</html>
```

- [ ] **Step 8: Create css/style.css with dark theme and design tokens**

```css
:root {
  --bg-dark: #1a1a2e;
  --bg-card: #16213e;
  --bg-surface: #0f3460;
  --accent: #e94560;
  --accent-hover: #ff6b81;
  --text: #eee;
  --text-muted: #888;
  --green: #44ff44;
  --blue: #44aaff;
  --yellow: #ffaa00;
  --radius: 12px;
  --transition: 0.3s ease;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: var(--bg-dark);
  color: var(--text);
  min-height: 100dvh;
  overflow: hidden;
}

.screen {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  min-height: 100dvh;
  gap: 16px;
}
.screen.active { display: flex; }

h1 { font-size: 2.2rem; }
h2 { font-size: 1.6rem; }

.btn {
  padding: 14px 28px;
  border: none;
  border-radius: var(--radius);
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  min-height: 48px;
  min-width: 48px;
}
.btn-primary {
  background: var(--accent);
  color: white;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary {
  background: var(--bg-surface);
  color: var(--text);
}
.btn-small {
  padding: 10px 20px;
  font-size: 0.9rem;
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--bg-surface);
  border-radius: var(--radius);
}

.code-display {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 8px;
  color: var(--accent);
  background: var(--bg-card);
  padding: 16px 32px;
  border-radius: var(--radius);
}

.home-nav {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

#game-canvas {
  width: 100%;
  flex: 1;
  touch-action: none;
}

#game-hud {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 8px 16px;
  background: var(--bg-card);
  border-radius: var(--radius);
  font-size: 0.9rem;
}

@media (max-width: 480px) {
  body { font-size: 0.95rem; }
  h1 { font-size: 1.7rem; }
  .btn { padding: 12px 20px; font-size: 1rem; }
  .code-display { font-size: 1.6rem; letter-spacing: 6px; }
}
```

- [ ] **Step 9: Create CLAUDE.md**

```markdown
# RaceTrack

Jeu de course multijoueur sur grille — adaptation mobile du jeu papier RaceTrack.

## Stack
- **Frontend** : TypeScript vanilla, HTML5 Canvas 2D
- **Build** : esbuild (src/ → dist/bundle.js)
- **Backend** : Supabase (PostgreSQL + Realtime + Anonymous Auth)
- **PWA** : manifest.json + service worker
- **Deploy** : GitHub Pages
- **Tests** : Playwright

## Commandes
```bash
npm run build     # Build once
npm run watch     # Build + watch
npm run typecheck # Type checking
npm run test      # Playwright tests
```

## Structure
- `src/types.ts` — Interfaces et types partagés
- `src/grid.ts` — Rendu Canvas, grille, zoom/pan
- `src/physics.ts` — Mouvement, collisions, respawn
- `src/circuit.ts` — Génération et validation de circuits
- `src/game.ts` — State machine (lobby → playing → finished)
- `src/multiplayer.ts` — Supabase client, realtime, tours
- `src/profiles.ts` — Auth anonyme, pseudo, localStorage
- `src/progression.ts` — XP, rangs, coins, rewards
- `src/shop.ts` — Catalogue, achats, inventaire
- `src/app.ts` — Navigation écrans, init

## Conventions
- UI en français
- Mobile-first (portrait)
- Dark theme (CSS custom properties)
- Touch targets minimum 44px
- `python3` pour les scripts (Linux VPS)
```

- [ ] **Step 10: Build and verify**

```bash
npm run build
```

Expected: `dist/bundle.js` created, no errors.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json index.html css/ src/ dist/ CLAUDE.md
git commit -m "feat: scaffold RaceTrack project — TS + esbuild + HTML shell"
```

---

## Task 2: Physics Engine (Movement + Collision)

**Files:**
- Create: `src/physics.ts`
- Create: `tests/test_physics.spec.ts`

- [ ] **Step 1: Write failing tests for movement and collision**

Create `tests/test_physics.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Physics Engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + process.cwd() + '/index.html');
    await page.waitForSelector('#screen-home');
  });

  test('calculateNewPosition applies velocity + acceleration', async ({ page }) => {
    const result = await page.evaluate(() => {
      // @ts-ignore — exposed on window for testing
      const { calculateNewPosition } = window.RaceTrack.physics;
      return calculateNewPosition(
        { x: 5, y: 5 },   // position
        { x: 2, y: 1 },   // velocity
        { x: 1, y: -1 }   // acceleration
      );
    });
    expect(result.newPosition).toEqual({ x: 8, y: 5 });
    expect(result.newVelocity).toEqual({ x: 3, y: 0 });
  });

  test('checkCollision detects wall crossing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { checkCollision } = window.RaceTrack.physics;
      // Simple 5x5 grid: track in middle row, walls elsewhere
      const cells: string[][] = [];
      for (let y = 0; y < 5; y++) {
        cells[y] = [];
        for (let x = 0; x < 5; x++) {
          cells[y][x] = (y === 2) ? 'track' : 'wall';
        }
      }
      // Move from (1,2) to (3,0) — crosses wall at y=1
      return checkCollision({ x: 1, y: 2 }, { x: 3, y: 0 }, cells);
    });
    expect(result.crashed).toBe(true);
  });

  test('checkCollision allows movement on track', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { checkCollision } = window.RaceTrack.physics;
      const cells: string[][] = [];
      for (let y = 0; y < 5; y++) {
        cells[y] = [];
        for (let x = 0; x < 5; x++) {
          cells[y][x] = 'track';
        }
      }
      return checkCollision({ x: 1, y: 1 }, { x: 3, y: 3 }, cells);
    });
    expect(result.crashed).toBe(false);
  });

  test('getPossibleMoves returns 9 options', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { getPossibleMoves } = window.RaceTrack.physics;
      return getPossibleMoves({ x: 5, y: 5 }, { x: 1, y: 0 });
    });
    expect(result).toHaveLength(9);
    // Center option (no accel) should land at (6, 5)
    const center = result.find((m: any) => m.acceleration.x === 0 && m.acceleration.y === 0);
    expect(center.target).toEqual({ x: 6, y: 5 });
  });

  test('getRespawnPosition returns position 3 cells back on centerline', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { getRespawnPosition } = window.RaceTrack.physics;
      const centerline = [
        { x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 },
        { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
        { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 },
      ];
      // Player at position closest to (6,5), respawn 3 back
      return getRespawnPosition({ x: 6, y: 5 }, centerline);
    });
    expect(result).toEqual({ x: 3, y: 5 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx playwright test tests/test_physics.spec.ts
```

Expected: FAIL — `window.RaceTrack.physics` is undefined.

- [ ] **Step 3: Implement src/physics.ts**

```typescript
import type { Vec2, CellType } from './types';

export interface MoveOption {
  acceleration: Vec2;
  target: Vec2;
  newVelocity: Vec2;
}

export interface MoveResult {
  newPosition: Vec2;
  newVelocity: Vec2;
}

export interface CollisionResult {
  crashed: boolean;
}

export function calculateNewPosition(
  position: Vec2,
  velocity: Vec2,
  acceleration: Vec2
): MoveResult {
  const newVelocity: Vec2 = {
    x: velocity.x + acceleration.x,
    y: velocity.y + acceleration.y,
  };
  const newPosition: Vec2 = {
    x: position.x + newVelocity.x,
    y: position.y + newVelocity.y,
  };
  return { newPosition, newVelocity };
}

export function checkCollision(
  from: Vec2,
  to: Vec2,
  cells: CellType[][]
): CollisionResult {
  // Bresenham line: check every cell the trajectory passes through
  const points = getLinePoints(from, to);
  for (const p of points) {
    if (p.y < 0 || p.y >= cells.length || p.x < 0 || p.x >= cells[0].length) {
      return { crashed: true };
    }
    if (cells[p.y][p.x] === 'wall') {
      return { crashed: true };
    }
  }
  return { crashed: false };
}

function getLinePoints(from: Vec2, to: Vec2): Vec2[] {
  const points: Vec2[] = [];
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return points;
}

export function getPossibleMoves(position: Vec2, velocity: Vec2): MoveOption[] {
  const moves: MoveOption[] = [];
  for (let ax = -1; ax <= 1; ax++) {
    for (let ay = -1; ay <= 1; ay++) {
      const acceleration: Vec2 = { x: ax, y: ay };
      const { newPosition, newVelocity } = calculateNewPosition(position, velocity, acceleration);
      moves.push({ acceleration, target: newPosition, newVelocity });
    }
  }
  return moves;
}

export function getRespawnPosition(crashPosition: Vec2, centerline: Vec2[]): Vec2 {
  // Find closest centerline point to crash position
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < centerline.length; i++) {
    const dx = centerline[i].x - crashPosition.x;
    const dy = centerline[i].y - crashPosition.y;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }
  // Go 3 cells back on centerline
  const respawnIdx = Math.max(0, closestIdx - 3);
  return centerline[respawnIdx];
}
```

- [ ] **Step 4: Expose physics on window for tests — update app.ts**

Add to `src/app.ts`:
```typescript
import * as physics from './physics';

// Expose modules for Playwright tests
(window as any).RaceTrack = { physics };
```

- [ ] **Step 5: Rebuild and run tests**

```bash
npm run build && npx playwright test tests/test_physics.spec.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/physics.ts tests/test_physics.spec.ts src/app.ts
git commit -m "feat: physics engine — movement, collision (Bresenham), respawn"
```

---

## Task 3: Circuit Generation & Validation

**Files:**
- Create: `src/circuit.ts`
- Create: `tests/test_circuit.spec.ts`

- [ ] **Step 1: Write failing tests for circuit generation**

Create `tests/test_circuit.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Circuit Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('file://' + process.cwd() + '/index.html');
    await page.waitForSelector('#screen-home');
  });

  test('generateCircuit returns a valid circuit', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { generateCircuit } = window.RaceTrack.circuit;
      return generateCircuit(30, 40);
    });
    expect(result.width).toBe(30);
    expect(result.height).toBe(40);
    expect(result.cells.length).toBe(40);
    expect(result.cells[0].length).toBe(30);
    expect(result.startPositions.length).toBeGreaterThanOrEqual(2);
    expect(result.finishLine.length).toBeGreaterThan(0);
    expect(result.centerline.length).toBeGreaterThan(10);
  });

  test('circuit has minimum 3-cell track width', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { generateCircuit } = window.RaceTrack.circuit;
      const circuit = generateCircuit(30, 40);
      // Check that track cells exist and have neighbors
      let minWidth = Infinity;
      for (let y = 0; y < circuit.height; y++) {
        let rowTrack = 0;
        let inTrack = false;
        for (let x = 0; x < circuit.width; x++) {
          if (circuit.cells[y][x] !== 'wall') {
            if (!inTrack) inTrack = true;
            rowTrack++;
          } else if (inTrack) {
            if (rowTrack > 0 && rowTrack < minWidth) minWidth = rowTrack;
            rowTrack = 0;
            inTrack = false;
          }
        }
        if (inTrack && rowTrack > 0 && rowTrack < minWidth) minWidth = rowTrack;
      }
      return minWidth;
    });
    expect(result).toBeGreaterThanOrEqual(3);
  });

  test('validateCircuit confirms circuit is solvable', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { generateCircuit, validateCircuit } = window.RaceTrack.circuit;
      const circuit = generateCircuit(30, 40);
      return validateCircuit(circuit);
    });
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx playwright test tests/test_circuit.spec.ts
```

Expected: FAIL — `window.RaceTrack.circuit` is undefined.

- [ ] **Step 3: Implement src/circuit.ts**

```typescript
import type { Vec2, CellType, Circuit } from './types';
import { checkCollision, calculateNewPosition } from './physics';

export function generateCircuit(width: number, height: number): Circuit {
  for (let attempt = 0; attempt < 50; attempt++) {
    const circuit = buildCircuit(width, height);
    if (validateCircuit(circuit)) {
      return circuit;
    }
  }
  // Fallback: simple oval
  return buildOvalCircuit(width, height);
}

function buildCircuit(width: number, height: number): Circuit {
  const cells: CellType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'wall' as CellType)
  );

  // Generate centerline as a closed loop using control points
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const rx = Math.floor(width * 0.35);
  const ry = Math.floor(height * 0.35);

  // Random perturbation of an ellipse
  const numPoints = 60;
  const centerline: Vec2[] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const perturbX = (Math.random() - 0.5) * rx * 0.4;
    const perturbY = (Math.random() - 0.5) * ry * 0.4;
    const px = Math.round(cx + Math.cos(angle) * rx + perturbX);
    const py = Math.round(cy + Math.sin(angle) * ry + perturbY);
    centerline.push({
      x: Math.max(3, Math.min(width - 4, px)),
      y: Math.max(3, Math.min(height - 4, py)),
    });
  }

  // Carve track with variable width (3-5 cells) around centerline
  for (const point of centerline) {
    const trackWidth = 3 + Math.floor(Math.random() * 3); // 3-5
    const halfW = Math.floor(trackWidth / 2);
    for (let dy = -halfW; dy <= halfW; dy++) {
      for (let dx = -halfW; dx <= halfW; dx++) {
        const nx = point.x + dx;
        const ny = point.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          cells[ny][nx] = 'track';
        }
      }
    }
  }

  // Set start/finish at the top of the loop
  const startIdx = 0;
  const startPositions: Vec2[] = [];
  const finishLine: Vec2[] = [];

  const startPoint = centerline[startIdx];
  // Place 4 start positions side by side
  for (let i = 0; i < 4; i++) {
    const sp: Vec2 = { x: startPoint.x - 1 + i, y: startPoint.y };
    if (sp.x >= 0 && sp.x < width && cells[sp.y][sp.x] !== 'wall') {
      startPositions.push(sp);
      cells[sp.y][sp.x] = 'start';
    }
  }

  // Finish line: 2 cells ahead of start on centerline
  const finishIdx = Math.min(centerline.length - 1, 2);
  const fp = centerline[finishIdx];
  for (let dx = -2; dx <= 2; dx++) {
    const fx = fp.x + dx;
    if (fx >= 0 && fx < width && cells[fp.y][fx] !== 'wall') {
      finishLine.push({ x: fx, y: fp.y });
      cells[fp.y][fx] = 'finish';
    }
  }

  return { width, height, cells, startPositions, finishLine, centerline };
}

function buildOvalCircuit(width: number, height: number): Circuit {
  const cells: CellType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'wall' as CellType)
  );

  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const rx = Math.floor(width * 0.35);
  const ry = Math.floor(height * 0.35);
  const trackWidth = 4;
  const centerline: Vec2[] = [];

  for (let i = 0; i < 80; i++) {
    const angle = (2 * Math.PI * i) / 80;
    const px = Math.round(cx + Math.cos(angle) * rx);
    const py = Math.round(cy + Math.sin(angle) * ry);
    centerline.push({ x: px, y: py });

    for (let dy = -trackWidth; dy <= trackWidth; dy++) {
      for (let dx = -trackWidth; dx <= trackWidth; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          cells[ny][nx] = 'track';
        }
      }
    }
  }

  const startPositions: Vec2[] = [];
  const sp = centerline[0];
  for (let i = 0; i < 4; i++) {
    startPositions.push({ x: sp.x - 1 + i, y: sp.y });
    cells[sp.y][sp.x - 1 + i] = 'start';
  }

  const fp = centerline[2];
  const finishLine: Vec2[] = [];
  for (let dx = -2; dx <= 2; dx++) {
    finishLine.push({ x: fp.x + dx, y: fp.y });
    cells[fp.y][fp.x + dx] = 'finish';
  }

  return { width, height, cells, startPositions, finishLine, centerline };
}

export function validateCircuit(circuit: Circuit): boolean {
  if (circuit.startPositions.length < 2) return false;
  if (circuit.finishLine.length === 0) return false;

  // Simple BFS: can we reach finish from start staying on track?
  const start = circuit.startPositions[0];
  const visited = new Set<string>();
  const queue: Vec2[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check if we reached finish
    if (circuit.finishLine.some(f => f.x === current.x && f.y === current.y)) {
      return true;
    }

    // Explore neighbors (8-directional, simulating low-speed movement)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (ny < 0 || ny >= circuit.height || nx < 0 || nx >= circuit.width) continue;
        if (circuit.cells[ny][nx] === 'wall') continue;
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return false;
}
```

- [ ] **Step 4: Expose circuit on window — update app.ts**

Add to `src/app.ts`:
```typescript
import * as circuit from './circuit';

(window as any).RaceTrack = { physics, circuit };
```

- [ ] **Step 5: Rebuild and run tests**

```bash
npm run build && npx playwright test tests/test_circuit.spec.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/circuit.ts tests/test_circuit.spec.ts src/app.ts
git commit -m "feat: circuit generation — random loops with validation"
```

---

## Task 4: Canvas Grid Renderer

**Files:**
- Create: `src/grid.ts`

- [ ] **Step 1: Implement src/grid.ts — Canvas rendering + touch**

```typescript
import type { Vec2, Circuit, Player, CellType } from './types';
import type { MoveOption } from './physics';

const CELL_SIZE = 20;

interface Camera {
  offsetX: number;
  offsetY: number;
  scale: number;
}

let camera: Camera = { offsetX: 0, offsetY: 0, scale: 1 };
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

const COLORS: Record<CellType, string> = {
  wall: '#1a1a2e',
  track: '#2a2a4a',
  start: '#3a5a3a',
  finish: '#5a3a3a',
};

export function initGrid(canvasEl: HTMLCanvasElement): void {
  canvas = canvasEl;
  ctx = canvas.getContext('2d')!;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  setupTouchHandlers();
}

function resizeCanvas(): void {
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

export function render(
  circuit: Circuit,
  players: Player[],
  possibleMoves: MoveOption[] | null,
  currentPlayerId: string | null
): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);

  // Draw cells
  for (let y = 0; y < circuit.height; y++) {
    for (let x = 0; x < circuit.width; x++) {
      const cellType = circuit.cells[y][x];
      ctx.fillStyle = COLORS[cellType];
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= circuit.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, circuit.height * CELL_SIZE);
    ctx.stroke();
  }
  for (let y = 0; y <= circuit.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(circuit.width * CELL_SIZE, y * CELL_SIZE);
    ctx.stroke();
  }

  // Draw possible moves (highlighted cells)
  if (possibleMoves) {
    for (const move of possibleMoves) {
      const { x, y } = move.target;
      if (x >= 0 && x < circuit.width && y >= 0 && y < circuit.height) {
        ctx.fillStyle = 'rgba(233, 69, 96, 0.4)';
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }
  }

  // Draw players
  for (const player of players) {
    if (player.status === 'kicked') continue;
    const px = player.position.x * CELL_SIZE + CELL_SIZE / 2;
    const py = player.position.y * CELL_SIZE + CELL_SIZE / 2;
    const radius = CELL_SIZE * 0.4;

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player name
    ctx.fillStyle = 'white';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, px, py - radius - 4);
  }

  ctx.restore();
}

export function screenToGrid(screenX: number, screenY: number): Vec2 {
  const rect = canvas.getBoundingClientRect();
  const x = (screenX - rect.left - camera.offsetX) / camera.scale;
  const y = (screenY - rect.top - camera.offsetY) / camera.scale;
  return {
    x: Math.floor(x / CELL_SIZE),
    y: Math.floor(y / CELL_SIZE),
  };
}

export function centerOnPlayer(player: Player): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.offsetX = w / 2 - player.position.x * CELL_SIZE * camera.scale;
  camera.offsetY = h / 2 - player.position.y * CELL_SIZE * camera.scale;
}

// Touch: pinch-zoom and pan
let touches: Touch[] = [];
let lastPinchDist = 0;

function setupTouchHandlers(): void {
  canvas.addEventListener('touchstart', (e) => {
    touches = Array.from(e.touches);
    if (touches.length === 2) {
      lastPinchDist = getTouchDistance(touches[0], touches[1]);
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const newTouches = Array.from(e.touches);

    if (newTouches.length === 1 && touches.length === 1) {
      // Pan
      const dx = newTouches[0].clientX - touches[0].clientX;
      const dy = newTouches[0].clientY - touches[0].clientY;
      camera.offsetX += dx;
      camera.offsetY += dy;
    } else if (newTouches.length === 2) {
      // Pinch zoom
      const dist = getTouchDistance(newTouches[0], newTouches[1]);
      if (lastPinchDist > 0) {
        const scale = dist / lastPinchDist;
        camera.scale = Math.max(0.3, Math.min(3, camera.scale * scale));
      }
      lastPinchDist = dist;
    }

    touches = newTouches;
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    touches = [];
    lastPinchDist = 0;
  });
}

function getTouchDistance(t1: Touch, t2: Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
```

- [ ] **Step 2: Update app.ts to import grid**

Add to `src/app.ts`:
```typescript
import * as grid from './grid';

(window as any).RaceTrack = { physics, circuit, grid };
```

- [ ] **Step 3: Build and manually verify canvas renders**

```bash
npm run build
```

Open `index.html` in browser, check console for errors. Canvas should be present in the game screen.

- [ ] **Step 4: Commit**

```bash
git add src/grid.ts src/app.ts
git commit -m "feat: Canvas grid renderer — cells, players, moves, touch zoom/pan"
```

---

## Task 5: Supabase Setup & Multiplayer

**Files:**
- Create: `supabase/migrations/001_init.sql`
- Create: `src/multiplayer.ts`
- Create: `src/profiles.ts`

- [ ] **Step 1: Create Supabase migration**

Create `supabase/migrations/001_init.sql`:

```sql
-- Games table
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'lobby',
  circuit_data JSONB,
  current_turn INT DEFAULT 0,
  current_player_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Players in a game
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name VARCHAR(30) NOT NULL,
  color VARCHAR(7) NOT NULL,
  skin VARCHAR(50) DEFAULT 'default',
  trail VARCHAR(50) DEFAULT 'default',
  position_x INT DEFAULT 0,
  position_y INT DEFAULT 0,
  velocity_x INT DEFAULT 0,
  velocity_y INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'alive',
  finish_position INT,
  skip_count INT DEFAULT 0,
  crash_turns_left INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Move history
CREATE TABLE moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  turn INT NOT NULL,
  accel_x INT NOT NULL,
  accel_y INT NOT NULL,
  new_position_x INT NOT NULL,
  new_position_y INT NOT NULL,
  crashed BOOLEAN DEFAULT FALSE,
  auto_skip BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Persistent profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  xp INT DEFAULT 0,
  coins INT DEFAULT 0,
  rank VARCHAR(30) DEFAULT 'Karting',
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  owned_skins JSONB DEFAULT '[]'::jsonb,
  owned_trails JSONB DEFAULT '[]'::jsonb,
  owned_themes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable realtime on moves and players
ALTER PUBLICATION supabase_realtime ADD TABLE moves;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- RLS policies
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read games (needed for joining)
CREATE POLICY "Games are readable by all" ON games FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Game updates" ON games FOR UPDATE USING (true);

-- Players
CREATE POLICY "Players are readable" ON players FOR SELECT USING (true);
CREATE POLICY "Players can join" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update own" ON players FOR UPDATE USING (user_id = auth.uid());

-- Moves
CREATE POLICY "Moves are readable" ON moves FOR SELECT USING (true);
CREATE POLICY "Players can insert moves" ON moves FOR INSERT WITH CHECK (true);

-- Profiles
CREATE POLICY "Profiles are readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can manage own profile" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (id = auth.uid());

-- Index for fast game lookups
CREATE INDEX idx_games_code ON games(code) WHERE status != 'finished';
CREATE INDEX idx_players_game ON players(game_id);
CREATE INDEX idx_moves_game ON moves(game_id);
```

- [ ] **Step 2: Apply migration in Supabase dashboard**

Go to Supabase dashboard → SQL Editor → paste and run `001_init.sql`.

- [ ] **Step 3: Implement src/profiles.ts**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './types';

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // TODO: replace during setup
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // TODO: replace during setup

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUserId: string | null = null;

export async function initAuth(): Promise<string> {
  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    currentUserId = session.user.id;
  } else {
    // Anonymous sign in
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    currentUserId = data.user!.id;
  }

  return currentUserId;
}

export function getUserId(): string {
  if (!currentUserId) throw new Error('Not authenticated');
  return currentUserId;
}

export function getLocalName(): string {
  return localStorage.getItem('rt_name') || '';
}

export function setLocalName(name: string): void {
  localStorage.setItem('rt_name', name);
}

export async function getOrCreateProfile(): Promise<Profile> {
  const userId = getUserId();
  const name = getLocalName();

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (existing) return existing as Profile;

  const newProfile: Partial<Profile> = {
    id: userId,
    name: name || 'Pilote',
    xp: 0,
    coins: 0,
    rank: 'Karting',
    games_played: 0,
    games_won: 0,
    owned_skins: [],
    owned_trails: [],
    owned_themes: [],
  };

  const { data, error } = await supabase
    .from('profiles')
    .insert(newProfile)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(updates: Partial<Profile>): Promise<void> {
  const userId = getUserId();
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  if (error) throw error;
}
```

- [ ] **Step 4: Implement src/multiplayer.ts**

```typescript
import { supabase, getUserId } from './profiles';
import { generateCircuit } from './circuit';
import type { Vec2, Game, Player, Move, Circuit } from './types';
import { PLAYER_COLORS } from './types';

// Generate a random 4-letter game code
function generateCode(): string {
  const words = [
    'TURBO', 'BLAZE', 'DRIFT', 'NITRO', 'FLASH',
    'SPEED', 'BOOST', 'RACER', 'TRACK', 'MOTOR',
    'RAPID', 'SPARK', 'VROOM', 'ARROW', 'FLAME',
    'STORM', 'PULSE', 'STEEL', 'POWER', 'SUPER',
  ];
  return words[Math.floor(Math.random() * words.length)];
}

export async function createGame(): Promise<{ gameId: string; code: string }> {
  const circuit = generateCircuit(30, 40);
  const code = generateCode();

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

  if (error) throw error;
  return { gameId: data.id, code: data.code };
}

export async function joinGame(code: string, playerName: string): Promise<{ gameId: string; playerId: string }> {
  // Find game
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('id, status')
    .eq('code', code.toUpperCase())
    .eq('status', 'lobby')
    .single();

  if (gameErr || !game) throw new Error('Partie introuvable ou déjà lancée');

  // Count existing players
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', game.id);

  if ((count ?? 0) >= 4) throw new Error('Partie pleine (4 joueurs max)');

  const colorIndex = count ?? 0;
  const userId = getUserId();

  const { data: player, error: playerErr } = await supabase
    .from('players')
    .insert({
      game_id: game.id,
      user_id: userId,
      name: playerName,
      color: PLAYER_COLORS[colorIndex],
      status: 'alive',
    })
    .select('id')
    .single();

  if (playerErr) throw playerErr;
  return { gameId: game.id, playerId: player.id };
}

export async function getGameState(gameId: string): Promise<Game> {
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameErr) throw gameErr;

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });

  if (playersErr) throw playersErr;

  return {
    id: game.id,
    code: game.code,
    status: game.status,
    circuit: game.circuit_data as Circuit,
    current_turn: game.current_turn,
    current_player_index: game.current_player_index,
    players: players.map(p => ({
      id: p.id,
      game_id: p.game_id,
      user_id: p.user_id,
      name: p.name,
      color: p.color,
      skin: p.skin,
      trail: p.trail,
      position: { x: p.position_x, y: p.position_y },
      velocity: { x: p.velocity_x, y: p.velocity_y },
      status: p.status,
      finish_position: p.finish_position,
      skip_count: p.skip_count,
      crash_turns_left: p.crash_turns_left,
    })),
  };
}

export async function startGame(gameId: string): Promise<void> {
  // Fetch circuit to set start positions
  const game = await getGameState(gameId);

  // Assign start positions to players
  for (let i = 0; i < game.players.length; i++) {
    const startPos = game.circuit.startPositions[i] ?? game.circuit.startPositions[0];
    await supabase
      .from('players')
      .update({
        position_x: startPos.x,
        position_y: startPos.y,
        velocity_x: 0,
        velocity_y: 0,
      })
      .eq('id', game.players[i].id);
  }

  await supabase
    .from('games')
    .update({ status: 'playing', current_turn: 1, current_player_index: 0 })
    .eq('id', gameId);
}

export async function submitMove(
  gameId: string,
  playerId: string,
  acceleration: Vec2,
  newPosition: Vec2,
  newVelocity: Vec2,
  crashed: boolean,
  turn: number
): Promise<void> {
  // Insert move record
  await supabase.from('moves').insert({
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

  // Update player state
  if (crashed) {
    const game = await getGameState(gameId);
    const respawnPos = game.circuit.centerline[Math.max(0, findCenterlineIndex(game.circuit.centerline, newPosition) - 3)];
    await supabase.from('players').update({
      position_x: respawnPos.x,
      position_y: respawnPos.y,
      velocity_x: 0,
      velocity_y: 0,
      status: 'crashed',
      crash_turns_left: 2,
      skip_count: 0,
    }).eq('id', playerId);
  } else {
    // Check if crossed finish line
    const game = await getGameState(gameId);
    const finished = game.circuit.finishLine.some(f => f.x === newPosition.x && f.y === newPosition.y);
    const finishedCount = game.players.filter(p => p.status === 'finished').length;

    await supabase.from('players').update({
      position_x: newPosition.x,
      position_y: newPosition.y,
      velocity_x: newVelocity.x,
      velocity_y: newVelocity.y,
      ...(finished ? { status: 'finished', finish_position: finishedCount + 1 } : {}),
    }).eq('id', playerId);
  }

  // Advance to next player
  await advanceTurn(gameId);
}

async function advanceTurn(gameId: string): Promise<void> {
  const game = await getGameState(gameId);
  const activePlayers = game.players.filter(p => p.status === 'alive' || p.status === 'crashed');

  // Check if game is over
  if (activePlayers.length === 0 || game.players.some(p => p.status === 'finished')) {
    const allFinishedOrDead = activePlayers.length <= 1;
    if (allFinishedOrDead || game.players.filter(p => p.status === 'finished').length > 0) {
      // Assign remaining positions
      let nextPos = game.players.filter(p => p.finish_position !== null).length + 1;
      for (const p of activePlayers) {
        if (p.finish_position === null) {
          await supabase.from('players').update({ finish_position: nextPos++ }).eq('id', p.id);
        }
      }
      await supabase.from('games').update({ status: 'finished' }).eq('id', gameId);
      return;
    }
  }

  // Find next active player
  let nextIdx = (game.current_player_index + 1) % game.players.length;
  let attempts = 0;
  while (attempts < game.players.length) {
    const nextPlayer = game.players[nextIdx];
    if (nextPlayer.status === 'alive') break;
    if (nextPlayer.status === 'crashed' && nextPlayer.crash_turns_left > 0) {
      // Skip crashed player, decrement turns
      await supabase.from('players').update({
        crash_turns_left: nextPlayer.crash_turns_left - 1,
        ...(nextPlayer.crash_turns_left - 1 === 0 ? { status: 'alive' } : {}),
      }).eq('id', nextPlayer.id);
      nextIdx = (nextIdx + 1) % game.players.length;
      attempts++;
      continue;
    }
    nextIdx = (nextIdx + 1) % game.players.length;
    attempts++;
  }

  const newTurn = nextIdx <= game.current_player_index ? game.current_turn + 1 : game.current_turn;

  await supabase.from('games').update({
    current_player_index: nextIdx,
    current_turn: newTurn,
  }).eq('id', gameId);
}

function findCenterlineIndex(centerline: Vec2[], position: Vec2): number {
  let closest = 0;
  let minDist = Infinity;
  for (let i = 0; i < centerline.length; i++) {
    const dx = centerline[i].x - position.x;
    const dy = centerline[i].y - position.y;
    const dist = dx * dx + dy * dy;
    if (dist < minDist) { minDist = dist; closest = i; }
  }
  return closest;
}

export function subscribeToGame(gameId: string, onUpdate: () => void): () => void {
  const channel = supabase
    .channel(`game-${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'moves', filter: `game_id=eq.${gameId}` }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, onUpdate)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export async function getGamePlayers(gameId: string): Promise<Player[]> {
  const game = await getGameState(gameId);
  return game.players;
}
```

- [ ] **Step 5: Update app.ts imports**

```typescript
import * as physics from './physics';
import * as circuit from './circuit';
import * as grid from './grid';
import * as multiplayer from './multiplayer';
import * as profiles from './profiles';
import type { ScreenId } from './types';

(window as any).RaceTrack = { physics, circuit, grid, multiplayer, profiles };

const screens: ScreenId[] = ['home', 'lobby', 'game', 'result', 'shop', 'profile'];

export function showScreen(id: ScreenId): void {
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('active', s === id);
  });
}

async function init(): Promise<void> {
  await profiles.initAuth();
  showScreen('home');
  console.log('RaceTrack v1 initialized');
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 6: Build and verify no errors**

```bash
npm run build
```

Expected: `dist/bundle.js` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/ src/multiplayer.ts src/profiles.ts src/app.ts
git commit -m "feat: Supabase multiplayer — auth, games, moves, realtime"
```

---

## Task 6: Game State Machine & Screen Wiring

**Files:**
- Create: `src/game.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Implement src/game.ts — state machine + UI wiring**

```typescript
import type { Game, Player, Vec2, ScreenId } from './types';
import { getPossibleMoves, calculateNewPosition, checkCollision } from './physics';
import { initGrid, render, screenToGrid, centerOnPlayer } from './grid';
import {
  createGame, joinGame, getGameState, startGame,
  submitMove, subscribeToGame,
} from './multiplayer';
import { getUserId, getLocalName, setLocalName, getOrCreateProfile } from './profiles';
import { calculateRewards, getRankForXp, updateProfileAfterGame } from './progression';
import { showScreen } from './app';
import type { MoveOption } from './physics';

let currentGame: Game | null = null;
let currentPlayerId: string | null = null;
let currentMoves: MoveOption[] | null = null;
let unsubscribe: (() => void) | null = null;

export async function initGameScreen(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  initGrid(canvas);

  // Tap handler for moves
  canvas.addEventListener('click', handleCanvasTap);
}

function handleCanvasTap(e: MouseEvent): void {
  if (!currentGame || !currentMoves || !currentPlayerId) return;

  const me = currentGame.players.find(p => p.id === currentPlayerId);
  if (!me) return;

  // Check it's my turn
  const activePlayer = currentGame.players[currentGame.current_player_index];
  if (activePlayer.id !== currentPlayerId) return;

  const gridPos = screenToGrid(e.clientX, e.clientY);

  // Find which move was tapped
  const selectedMove = currentMoves.find(m =>
    m.target.x === gridPos.x && m.target.y === gridPos.y
  );

  if (!selectedMove) return;

  executeMove(selectedMove);
}

async function executeMove(move: MoveOption): Promise<void> {
  if (!currentGame || !currentPlayerId) return;

  const me = currentGame.players.find(p => p.id === currentPlayerId)!;
  const { newPosition, newVelocity } = calculateNewPosition(
    me.position, me.velocity, move.acceleration
  );
  const collision = checkCollision(me.position, newPosition, currentGame.circuit.cells);

  await submitMove(
    currentGame.id,
    currentPlayerId,
    move.acceleration,
    newPosition,
    newVelocity,
    collision.crashed,
    currentGame.current_turn
  );

  await refreshGameState();
}

async function refreshGameState(): Promise<void> {
  if (!currentGame) return;

  currentGame = await getGameState(currentGame.id);

  if (currentGame.status === 'finished') {
    await handleGameEnd();
    return;
  }

  // Update possible moves if it's my turn
  const activePlayer = currentGame.players[currentGame.current_player_index];
  if (activePlayer && activePlayer.id === currentPlayerId && activePlayer.status === 'alive') {
    currentMoves = getPossibleMoves(activePlayer.position, activePlayer.velocity);
    centerOnPlayer(activePlayer);
    updateHUD(activePlayer.name, currentGame.current_turn, true);
  } else {
    currentMoves = null;
    updateHUD(activePlayer?.name ?? '...', currentGame.current_turn, false);
  }

  render(currentGame.circuit, currentGame.players, currentMoves, currentPlayerId);
}

function updateHUD(playerName: string, turn: number, isMyTurn: boolean): void {
  const hudTurn = document.getElementById('hud-turn')!;
  const hudPlayer = document.getElementById('hud-player')!;
  hudTurn.textContent = `Tour ${turn}`;
  hudPlayer.textContent = isMyTurn ? "C'est à toi!" : `Tour de ${playerName}`;
  hudPlayer.style.color = isMyTurn ? '#e94560' : '#888';
}

async function handleGameEnd(): Promise<void> {
  if (!currentGame || !currentPlayerId) return;

  const me = currentGame.players.find(p => p.id === currentPlayerId);
  if (!me) return;

  const noCrash = !currentGame.players.some(p => p.id === currentPlayerId); // simplified
  const rewards = calculateRewards(me.finish_position ?? 4, false, currentGame.current_turn);

  await updateProfileAfterGame(rewards, me.finish_position === 1);

  showResultScreen(currentGame.players, rewards);

  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

function showResultScreen(
  players: Player[],
  rewards: { xp: number; coins: number }
): void {
  const ranking = document.getElementById('result-ranking')!;
  const rewardsEl = document.getElementById('result-rewards')!;

  const sorted = [...players]
    .filter(p => p.finish_position !== null)
    .sort((a, b) => (a.finish_position ?? 99) - (b.finish_position ?? 99));

  ranking.innerHTML = sorted.map((p, i) => `
    <div style="color:${p.color}; font-size:1.2rem; margin:8px 0;">
      ${i + 1}. ${p.name} ${p.id === currentPlayerId ? '(toi)' : ''}
    </div>
  `).join('');

  rewardsEl.innerHTML = `
    <div style="margin-top:16px;">
      <div>+${rewards.xp} XP</div>
      <div>+${rewards.coins} coins</div>
    </div>
  `;

  showScreen('result');
}

// Public API for app.ts

export async function handleCreateGame(): Promise<void> {
  let name = getLocalName();
  if (!name) {
    name = prompt('Ton pseudo?') || 'Pilote';
    setLocalName(name);
  }

  const { gameId, code } = await createGame();
  const { playerId } = await joinGame(code, name);
  currentPlayerId = playerId;

  await showLobby(gameId, code);
}

export async function handleJoinGame(): Promise<void> {
  let name = getLocalName();
  if (!name) {
    name = prompt('Ton pseudo?') || 'Pilote';
    setLocalName(name);
  }

  const code = prompt('Code de la partie?');
  if (!code) return;

  const { gameId, playerId } = await joinGame(code, name);
  currentPlayerId = playerId;

  await showLobby(gameId, code);
}

async function showLobby(gameId: string, code: string): Promise<void> {
  showScreen('lobby');

  document.getElementById('lobby-code')!.textContent = code;

  // Subscribe to player changes
  unsubscribe = subscribeToGame(gameId, async () => {
    const game = await getGameState(gameId);
    currentGame = game;
    renderLobbyPlayers(game.players);

    if (game.status === 'playing') {
      await initGameScreen();
      showScreen('game');
      await refreshGameState();
    }
  });

  currentGame = await getGameState(gameId);
  renderLobbyPlayers(currentGame.players);

  // Show start button if creator
  const isCreator = currentGame.players[0]?.user_id === getUserId();
  const startBtn = document.getElementById('btn-start') as HTMLButtonElement;
  startBtn.style.display = isCreator ? 'block' : 'none';
  startBtn.onclick = async () => {
    if (currentGame!.players.length < 2) {
      alert('Il faut au moins 2 joueurs!');
      return;
    }
    await startGame(gameId);
  };
}

function renderLobbyPlayers(players: Player[]): void {
  const container = document.getElementById('lobby-players')!;
  container.innerHTML = players.map(p => `
    <div style="display:flex; align-items:center; gap:8px; margin:8px 0;">
      <span style="width:16px; height:16px; border-radius:50%; background:${p.color}; display:inline-block;"></span>
      <span>${p.name}</span>
    </div>
  `).join('');
}
```

- [ ] **Step 2: Wire up app.ts with all screen events**

Replace `src/app.ts`:

```typescript
import * as physics from './physics';
import * as circuit from './circuit';
import * as grid from './grid';
import * as multiplayer from './multiplayer';
import * as profiles from './profiles';
import * as progression from './progression';
import * as shop from './shop';
import { handleCreateGame, handleJoinGame } from './game';
import type { ScreenId } from './types';

(window as any).RaceTrack = { physics, circuit, grid, multiplayer, profiles, progression };

const screens: ScreenId[] = ['home', 'lobby', 'game', 'result', 'shop', 'profile'];

export function showScreen(id: ScreenId): void {
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('active', s === id);
  });
}

async function init(): Promise<void> {
  await profiles.initAuth();
  const profile = await profiles.getOrCreateProfile();

  // Home screen
  updateHomeProfile(profile);

  // Button handlers
  document.getElementById('btn-create')!.onclick = handleCreateGame;
  document.getElementById('btn-join')!.onclick = handleJoinGame;
  document.getElementById('btn-home')!.onclick = () => { showScreen('home'); location.reload(); };
  document.getElementById('btn-shop')!.onclick = () => showScreen('shop');
  document.getElementById('btn-shop-back')!.onclick = () => showScreen('home');
  document.getElementById('btn-profile')!.onclick = () => showScreen('profile');
  document.getElementById('btn-profile-back')!.onclick = () => showScreen('home');
  document.getElementById('btn-leave')!.onclick = () => { showScreen('home'); location.reload(); };

  showScreen('home');
}

function updateHomeProfile(profile: any): void {
  const el = document.getElementById('home-profile')!;
  el.innerHTML = `
    <div style="text-align:center; margin:16px 0;">
      <div style="font-size:1.2rem; font-weight:600;">${profile.name}</div>
      <div style="color:#888;">${profile.rank} — ${profile.xp} XP</div>
      <div style="color:#ffaa00;">${profile.coins} coins</div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/game.ts src/app.ts
git commit -m "feat: game state machine — lobby, playing, result screens wired"
```

---

## Task 7: Progression System (XP, Ranks, Coins)

**Files:**
- Create: `src/progression.ts`

- [ ] **Step 1: Implement src/progression.ts**

```typescript
import type { Profile } from './types';
import { RANKS } from './types';
import { updateProfile, getOrCreateProfile } from './profiles';

const XP_BY_PLACE = [100, 60, 35, 20];
const COINS_BY_PLACE = [50, 30, 20, 10];
const BONUS_NO_CRASH = 30;
const BONUS_FAST_WIN = 20;
const FAST_WIN_THRESHOLD = 20;

const DAILY_MULTIPLIERS = [1.0, 1.0, 1.0, 0.5, 0.3, 0.1];

interface Rewards {
  xp: number;
  coins: number;
  newRank: string | null;
}

export function calculateRewards(
  finishPosition: number,
  noCrash: boolean,
  totalTurns: number
): Rewards {
  const placeIdx = Math.min(finishPosition - 1, 3);
  let xp = XP_BY_PLACE[placeIdx];
  let coins = COINS_BY_PLACE[placeIdx];

  if (noCrash) xp += BONUS_NO_CRASH;
  if (finishPosition === 1 && totalTurns < FAST_WIN_THRESHOLD) xp += BONUS_FAST_WIN;

  // Diminishing returns
  const dailyCount = getDailyGameCount();
  const multiplierIdx = Math.min(dailyCount, DAILY_MULTIPLIERS.length - 1);
  coins = Math.round(coins * DAILY_MULTIPLIERS[multiplierIdx]);

  incrementDailyGameCount();

  return { xp, coins, newRank: null };
}

export function getRankForXp(xp: number): string {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (xp >= r.xp) rank = r.name;
    else break;
  }
  return rank;
}

export async function updateProfileAfterGame(
  rewards: Rewards,
  won: boolean
): Promise<void> {
  const profile = await getOrCreateProfile();
  const newXp = profile.xp + rewards.xp;
  const newCoins = profile.coins + rewards.coins;
  const newRank = getRankForXp(newXp);

  await updateProfile({
    xp: newXp,
    coins: newCoins,
    rank: newRank,
    games_played: profile.games_played + 1,
    ...(won ? { games_won: profile.games_won + 1 } : {}),
  });

  rewards.newRank = newRank !== profile.rank ? newRank : null;
}

function getDailyGameCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const stored = localStorage.getItem('rt_daily_date');
  if (stored !== today) return 0;
  return parseInt(localStorage.getItem('rt_daily_count') || '0', 10);
}

function incrementDailyGameCount(): void {
  const today = new Date().toISOString().slice(0, 10);
  const stored = localStorage.getItem('rt_daily_date');
  if (stored !== today) {
    localStorage.setItem('rt_daily_date', today);
    localStorage.setItem('rt_daily_count', '1');
  } else {
    const count = parseInt(localStorage.getItem('rt_daily_count') || '0', 10);
    localStorage.setItem('rt_daily_count', String(count + 1));
  }
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/progression.ts
git commit -m "feat: progression — XP, ranks, coins, diminishing returns"
```

---

## Task 8: Shop System

**Files:**
- Create: `src/shop.ts`
- Modify: `index.html` (shop screen content)

- [ ] **Step 1: Implement src/shop.ts**

```typescript
import { getOrCreateProfile, updateProfile } from './profiles';
import type { Profile } from './types';

export interface ShopItem {
  id: string;
  name: string;
  category: 'skin' | 'trail' | 'theme';
  price: number;
  rarity: 'common' | 'rare' | 'epic';
  emoji: string;
}

export const SHOP_CATALOG: ShopItem[] = [
  // Skins
  { id: 'skin-red', name: 'Rouge Feu', category: 'skin', price: 0, rarity: 'common', emoji: '🔴' },
  { id: 'skin-blue', name: 'Bleu Glace', category: 'skin', price: 0, rarity: 'common', emoji: '🔵' },
  { id: 'skin-rocket', name: 'Fusée', category: 'skin', price: 100, rarity: 'rare', emoji: '🚀' },
  { id: 'skin-f1', name: 'Formule 1', category: 'skin', price: 150, rarity: 'rare', emoji: '🏎️' },
  { id: 'skin-moto', name: 'Superbike', category: 'skin', price: 200, rarity: 'epic', emoji: '🏍️' },
  // Trails
  { id: 'trail-dots', name: 'Pointillés', category: 'trail', price: 0, rarity: 'common', emoji: '···' },
  { id: 'trail-fire', name: 'Flammes', category: 'trail', price: 150, rarity: 'rare', emoji: '🔥' },
  { id: 'trail-stars', name: 'Étoiles', category: 'trail', price: 200, rarity: 'rare', emoji: '⭐' },
  { id: 'trail-rainbow', name: 'Arc-en-ciel', category: 'trail', price: 300, rarity: 'epic', emoji: '🌈' },
  // Themes
  { id: 'theme-asphalt', name: 'Asphalte', category: 'theme', price: 0, rarity: 'common', emoji: '🛣️' },
  { id: 'theme-snow', name: 'Neige', category: 'theme', price: 250, rarity: 'rare', emoji: '❄️' },
  { id: 'theme-space', name: 'Espace', category: 'theme', price: 400, rarity: 'epic', emoji: '🌌' },
  { id: 'theme-lava', name: 'Lave', category: 'theme', price: 500, rarity: 'epic', emoji: '🌋' },
];

export async function renderShop(): Promise<void> {
  const profile = await getOrCreateProfile();
  const container = document.getElementById('shop-grid')!;
  const coinsEl = document.getElementById('shop-coins')!;

  coinsEl.textContent = `${profile.coins} coins`;

  const owned = [
    ...profile.owned_skins,
    ...profile.owned_trails,
    ...profile.owned_themes,
  ];

  container.innerHTML = SHOP_CATALOG.map(item => {
    const isOwned = owned.includes(item.id) || item.price === 0;
    const canAfford = profile.coins >= item.price;
    return `
      <div class="shop-item ${isOwned ? 'owned' : ''}" data-id="${item.id}">
        <div class="shop-emoji">${item.emoji}</div>
        <div class="shop-name">${item.name}</div>
        <div class="shop-price">${isOwned ? '✓' : `${item.price} 🪙`}</div>
        ${!isOwned ? `<button class="btn btn-small shop-buy" data-id="${item.id}" ${!canAfford ? 'disabled' : ''}>
          ${canAfford ? 'Acheter' : 'Pas assez'}
        </button>` : ''}
      </div>
    `;
  }).join('');

  // Buy handlers
  container.querySelectorAll('.shop-buy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = (e.target as HTMLElement).dataset.id!;
      await buyItem(id);
      await renderShop(); // Re-render
    });
  });
}

async function buyItem(itemId: string): Promise<void> {
  const item = SHOP_CATALOG.find(i => i.id === itemId);
  if (!item) return;

  const profile = await getOrCreateProfile();
  if (profile.coins < item.price) return;

  const field = item.category === 'skin' ? 'owned_skins'
    : item.category === 'trail' ? 'owned_trails'
    : 'owned_themes';

  const owned = (profile as any)[field] as string[];
  if (owned.includes(itemId)) return;

  await updateProfile({
    coins: profile.coins - item.price,
    [field]: [...owned, itemId],
  });
}
```

- [ ] **Step 2: Add shop CSS to style.css**

Append to `css/style.css`:

```css
#shop-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  width: 100%;
  max-width: 400px;
  padding: 16px 0;
}

.shop-item {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.shop-item.owned { opacity: 0.6; }
.shop-emoji { font-size: 2rem; }
.shop-name { font-weight: 600; }
.shop-price { color: var(--yellow); font-size: 0.9rem; }
.shop-buy:disabled { opacity: 0.4; cursor: not-allowed; }

#shop-coins {
  font-size: 1.3rem;
  color: var(--yellow);
  font-weight: 600;
  text-align: center;
}
```

- [ ] **Step 3: Wire shop into app.ts**

Update the shop button handler in `app.ts`:
```typescript
document.getElementById('btn-shop')!.onclick = async () => {
  showScreen('shop');
  const { renderShop } = await import('./shop');
  await renderShop();
};
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/shop.ts css/style.css src/app.ts
git commit -m "feat: shop — skins, trails, grid themes with coin purchase"
```

---

## Task 9: PWA (Service Worker + Manifest)

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/` (placeholder icons)

- [ ] **Step 1: Create manifest.json**

```json
{
  "name": "RaceTrack",
  "short_name": "RaceTrack",
  "description": "Course multijoueur sur grille!",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#1a1a2e",
  "theme_color": "#e94560",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create sw.js**

```javascript
const CACHE_NAME = 'racetrack-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './dist/bundle.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for Supabase API calls
  if (url.hostname.includes('supabase')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for local assets
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

- [ ] **Step 3: Register service worker in index.html**

Add before `</body>`:
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
</script>
```

- [ ] **Step 4: Create placeholder icons**

```bash
# Generate simple placeholder PNGs (will replace with real icons later)
python3 -c "
from PIL import Image, ImageDraw
for size in [192, 512]:
    img = Image.new('RGB', (size, size), '#e94560')
    draw = ImageDraw.Draw(img)
    draw.text((size//4, size//3), 'RT', fill='white')
    img.save(f'icons/icon-{size}.png')
" || echo "Pillow not available — create icons manually"
mkdir -p icons
```

- [ ] **Step 5: Commit**

```bash
git add manifest.json sw.js icons/ index.html
git commit -m "feat: PWA — service worker, manifest, offline support"
```

---

## Task 10: Playwright E2E Tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/test_game.spec.ts`

- [ ] **Step 1: Create playwright.config.ts**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 375, height: 812 }, // iPhone size
  },
  webServer: {
    command: 'npx serve . -l 3000 -s',
    port: 3000,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Add serve as dev dependency**

```bash
npm install --save-dev serve
```

- [ ] **Step 3: Create tests/test_game.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test.describe('RaceTrack Game', () => {
  test('home screen loads with buttons', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page.locator('#screen-home')).toBeVisible();
    await expect(page.locator('#btn-create')).toBeVisible();
    await expect(page.locator('#btn-join')).toBeVisible();
    await expect(page.locator('#btn-shop')).toBeVisible();
    await expect(page.locator('#btn-profile')).toBeVisible();
  });

  test('screen navigation works', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('#btn-shop');
    await expect(page.locator('#screen-shop')).toBeVisible();
    await page.click('#btn-shop-back');
    await expect(page.locator('#screen-home')).toBeVisible();
  });

  test('physics module is exposed and works', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const result = await page.evaluate(() => {
      const { calculateNewPosition } = window.RaceTrack.physics;
      return calculateNewPosition({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 });
    });
    expect(result.newPosition).toEqual({ x: 1, y: 1 });
  });

  test('circuit generation produces valid circuit', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const result = await page.evaluate(() => {
      const { generateCircuit, validateCircuit } = window.RaceTrack.circuit;
      const circuit = generateCircuit(30, 40);
      return { valid: validateCircuit(circuit), hasStart: circuit.startPositions.length >= 2 };
    });
    expect(result.valid).toBe(true);
    expect(result.hasStart).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx playwright install chromium
npm run test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/test_game.spec.ts package.json package-lock.json
git commit -m "feat: Playwright E2E tests — home screen, navigation, physics, circuits"
```

---

## Task 11: GitHub Pages Deploy Setup

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create GitHub Actions workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build
      - run: npm run typecheck

      - name: Prepare deploy
        run: |
          mkdir -p _site
          cp index.html _site/
          cp -r css _site/
          cp -r dist _site/
          cp -r icons _site/ 2>/dev/null || true
          cp manifest.json _site/
          cp sw.js _site/

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

      - uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Create GitHub repo and push**

```bash
cd ~/projects/claude-workspace/RaceTrack
git init
git add -A
git commit -m "chore: initial RaceTrack v1 project"
```

Then create repo on GitHub and push (confirm with user first).

- [ ] **Step 3: Verify GitHub Pages deploys**

After push, check Actions tab → verify deploy succeeds → visit the GitHub Pages URL.

- [ ] **Step 4: Commit workflow**

```bash
git add .github/
git commit -m "ci: GitHub Pages deploy workflow"
```

---

## Task Summary

| Task | Description | Files | Est. |
|------|-------------|-------|------|
| 1 | Project scaffold & build | package.json, tsconfig, index.html, css, types, app, CLAUDE.md | 10 min |
| 2 | Physics engine | physics.ts + tests | 10 min |
| 3 | Circuit generation | circuit.ts + tests | 10 min |
| 4 | Canvas grid renderer | grid.ts | 10 min |
| 5 | Supabase setup & multiplayer | migration, multiplayer.ts, profiles.ts | 15 min |
| 6 | Game state machine | game.ts, app.ts wiring | 15 min |
| 7 | Progression system | progression.ts | 5 min |
| 8 | Shop system | shop.ts, CSS | 10 min |
| 9 | PWA setup | manifest, sw.js, icons | 5 min |
| 10 | E2E tests | playwright config + tests | 10 min |
| 11 | GitHub Pages deploy | CI/CD workflow | 5 min |
