import type { Vec2, Circuit, Player, CellType } from './types';
import type { MoveOption } from './physics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_SIZE = 20;

const COLOR_MAP: Record<CellType, string> = {
  wall:   '#1a1a2e',
  track:  '#2a2a4a',
  start:  '#3a5a3a',
  finish: '#5a3a3a',
};

// ---------------------------------------------------------------------------
// Camera state
// ---------------------------------------------------------------------------

const camera = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

// Touch state
let lastTouchDist = 0;
let lastTouchMidX = 0;
let lastTouchMidY = 0;
let isPinching = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resizeCanvas(): void {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  // Assigning canvas.width/height resets the context transform to identity,
  // so ctx.scale(dpr, dpr) is always applied on a clean state.
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
}

function touchDist(t0: Touch, t1: Touch): number {
  const dx = t1.clientX - t0.clientX;
  const dy = t1.clientY - t0.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function touchMid(t0: Touch, t1: Touch): { x: number; y: number } {
  return {
    x: (t0.clientX + t1.clientX) / 2,
    y: (t0.clientY + t1.clientY) / 2,
  };
}

// ---------------------------------------------------------------------------
// Touch handlers
// ---------------------------------------------------------------------------

function onTouchStart(e: TouchEvent): void {
  if (e.touches.length === 1) {
    isPinching = false;
    lastTouchMidX = e.touches[0].clientX;
    lastTouchMidY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    isPinching = true;
    lastTouchDist = touchDist(e.touches[0], e.touches[1]);
    const mid = touchMid(e.touches[0], e.touches[1]);
    lastTouchMidX = mid.x;
    lastTouchMidY = mid.y;
  }
}

function onTouchMove(e: TouchEvent): void {
  e.preventDefault();

  if (e.touches.length === 1 && !isPinching) {
    // Pan
    const dx = e.touches[0].clientX - lastTouchMidX;
    const dy = e.touches[0].clientY - lastTouchMidY;
    camera.offsetX += dx;
    camera.offsetY += dy;
    lastTouchMidX = e.touches[0].clientX;
    lastTouchMidY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    // Pinch zoom
    const newDist = touchDist(e.touches[0], e.touches[1]);
    const mid = touchMid(e.touches[0], e.touches[1]);

    if (lastTouchDist > 0) {
      const factor = newDist / lastTouchDist;
      const newScale = Math.min(3, Math.max(0.3, camera.scale * factor));

      // Zoom toward pinch midpoint
      const rect = canvas!.getBoundingClientRect();
      const mx = mid.x - rect.left;
      const my = mid.y - rect.top;

      camera.offsetX = mx - (mx - camera.offsetX) * (newScale / camera.scale);
      camera.offsetY = my - (my - camera.offsetY) * (newScale / camera.scale);
      camera.scale = newScale;
    }

    // Pan by midpoint delta
    const pdx = mid.x - lastTouchMidX;
    const pdy = mid.y - lastTouchMidY;
    camera.offsetX += pdx;
    camera.offsetY += pdy;

    lastTouchDist = newDist;
    lastTouchMidX = mid.x;
    lastTouchMidY = mid.y;
  }
}

function onTouchEnd(e: TouchEvent): void {
  if (e.touches.length < 2) {
    isPinching = false;
    lastTouchDist = 0;
    if (e.touches.length === 1) {
      lastTouchMidX = e.touches[0].clientX;
      lastTouchMidY = e.touches[0].clientY;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initGrid(canvasEl: HTMLCanvasElement): void {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
}

export function render(
  circuit: Circuit,
  players: Player[],
  possibleMoves: MoveOption[],
  _currentPlayerId: string  // reserved: future highlight for current player
): void {
  if (!canvas || !ctx) return;

  // Clear
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Apply camera transform (in CSS pixels — ctx was already scaled by dpr in resizeCanvas)
  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);

  const cellW = CELL_SIZE;
  const cellH = CELL_SIZE;

  // --- Draw cells ---
  for (let row = 0; row < circuit.height; row++) {
    for (let col = 0; col < circuit.width; col++) {
      const cellType: CellType = circuit.cells[row]?.[col] ?? 'wall';
      ctx.fillStyle = COLOR_MAP[cellType];
      ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
    }
  }

  // --- Draw grid lines ---
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5 / camera.scale;

  for (let col = 0; col <= circuit.width; col++) {
    ctx.beginPath();
    ctx.moveTo(col * cellW, 0);
    ctx.lineTo(col * cellW, circuit.height * cellH);
    ctx.stroke();
  }
  for (let row = 0; row <= circuit.height; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * cellH);
    ctx.lineTo(circuit.width * cellW, row * cellH);
    ctx.stroke();
  }

  // --- Draw possible moves ---
  for (const move of possibleMoves) {
    const px = move.target.x * cellW;
    const py = move.target.y * cellH;

    // Red overlay
    ctx.fillStyle = 'rgba(255,60,60,0.35)';
    ctx.fillRect(px, py, cellW, cellH);

    // Red border
    ctx.strokeStyle = 'rgba(255,60,60,0.9)';
    ctx.lineWidth = 1.5 / camera.scale;
    ctx.strokeRect(px + 0.5, py + 0.5, cellW - 1, cellH - 1);
  }

  // --- Draw players ---
  for (const player of players) {
    if (player.status === 'kicked') continue;

    const cx = player.position.x * cellW + cellW / 2;
    const cy = player.position.y * cellH + cellH / 2;
    const radius = cellW * 0.38;

    // Circle fill
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();

    // White border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / camera.scale;
    ctx.stroke();

    // Name label above
    const fontSize = Math.max(8, 10 / camera.scale);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Shadow for readability
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(player.name, cx, cy - radius - 2);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

export function screenToGrid(screenX: number, screenY: number): Vec2 {
  return {
    x: Math.floor((screenX - camera.offsetX) / (CELL_SIZE * camera.scale)),
    y: Math.floor((screenY - camera.offsetY) / (CELL_SIZE * camera.scale)),
  };
}

export function centerOnPlayer(player: Player): void {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssWidth  = canvas.width / dpr;
  const cssHeight = canvas.height / dpr;

  camera.offsetX = cssWidth  / 2 - player.position.x * CELL_SIZE * camera.scale - (CELL_SIZE * camera.scale) / 2;
  camera.offsetY = cssHeight / 2 - player.position.y * CELL_SIZE * camera.scale - (CELL_SIZE * camera.scale) / 2;
}
