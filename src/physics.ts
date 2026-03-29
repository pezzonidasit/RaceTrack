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

/**
 * Bresenham line algorithm — returns all integer grid cells the segment passes through.
 */
function bresenhamCells(from: Vec2, to: Vec2): Vec2[] {
  const cells: Vec2[] = [];

  let x0 = Math.round(from.x);
  let y0 = Math.round(from.y);
  const x1 = Math.round(to.x);
  const y1 = Math.round(to.y);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    cells.push({ x: x0, y: y0 });

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return cells;
}

export function checkCollision(
  from: Vec2,
  to: Vec2,
  cells: CellType[][]
): CollisionResult {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;

  const path = bresenhamCells(from, to);

  for (const cell of path) {
    const { x, y } = cell;

    // Out of bounds
    if (x < 0 || y < 0 || y >= height || x >= width) {
      return { crashed: true };
    }

    // Wall cell
    if (cells[y][x] === 'wall') {
      return { crashed: true };
    }
  }

  return { crashed: false };
}

export function getPossibleMoves(
  position: Vec2,
  velocity: Vec2
): MoveOption[] {
  const options: MoveOption[] = [];

  for (let ax = -1; ax <= 1; ax++) {
    for (let ay = -1; ay <= 1; ay++) {
      const acceleration: Vec2 = { x: ax, y: ay };
      const { newPosition, newVelocity } = calculateNewPosition(
        position,
        velocity,
        acceleration
      );
      options.push({
        acceleration,
        target: newPosition,
        newVelocity,
      });
    }
  }

  return options;
}

export function getRespawnPosition(
  crashPosition: Vec2,
  centerline: Vec2[]
): Vec2 {
  if (centerline.length === 0) {
    return crashPosition;
  }

  // Find closest centerline point to crash position
  let closestIndex = 0;
  let closestDist = Infinity;

  for (let i = 0; i < centerline.length; i++) {
    const dx = centerline[i].x - crashPosition.x;
    const dy = centerline[i].y - crashPosition.y;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = i;
    }
  }

  // Go 3 cells back along centerline, clamped to index 0
  const respawnIndex = Math.max(0, closestIndex - 3);
  return centerline[respawnIndex];
}
