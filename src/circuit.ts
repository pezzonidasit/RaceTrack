import type { Circuit, Vec2, CellType } from './types';

const MAX_ATTEMPTS = 50;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateCircuit(width: number, height: number): Circuit {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = buildCircuit(width, height);
    if (validateCircuit(candidate)) {
      return candidate;
    }
  }
  // All random attempts failed — fall back to guaranteed oval
  return buildOvalCircuit(width, height);
}

export function validateCircuit(circuit: Circuit): boolean {
  if (circuit.startPositions.length === 0 || circuit.finishLine.length === 0) {
    return false;
  }

  const start = circuit.startPositions[0];
  const { cells, width, height } = circuit;

  // Quick sanity: start cell must be non-wall
  if (
    start.x < 0 || start.y < 0 ||
    start.x >= width || start.y >= height ||
    cells[start.y][start.x] === 'wall'
  ) {
    return false;
  }

  // Build a set of finish positions for quick lookup
  const finishSet = new Set<string>(
    circuit.finishLine.map(p => `${p.x},${p.y}`)
  );

  // BFS — 8-directional with step range ±2 to simulate low-speed movement
  const visited = new Set<string>();
  const queue: Vec2[] = [{ x: Math.round(start.x), y: Math.round(start.y) }];
  const startKey = `${queue[0].x},${queue[0].y}`;
  visited.add(startKey);

  while (queue.length > 0) {
    const cur = queue.shift()!;

    if (finishSet.has(`${cur.x},${cur.y}`)) {
      return true;
    }

    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (dx === 0 && dy === 0) continue;

        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const key = `${nx},${ny}`;

        if (visited.has(key)) continue;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (cells[ny][nx] === 'wall') continue;

        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Private — random perturbed ellipse circuit
// ---------------------------------------------------------------------------

function buildCircuit(width: number, height: number): Circuit {
  const cells: CellType[][] = createGrid(width, height, 'wall');

  const centerline = generatePerturbedEllipse(width, height, 60);

  // Variable track width: 3–5 cells
  const trackWidth = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
  carveTrack(cells, centerline, trackWidth, width, height);

  const startPositions = pickStartPositions(centerline, cells, width, height, 4);
  const finishLine = buildFinishLine(centerline, cells, width, height);

  markCells(cells, startPositions, 'start');
  markCells(cells, finishLine, 'finish');

  return { width, height, cells, startPositions, finishLine, centerline };
}

// ---------------------------------------------------------------------------
// Private — guaranteed oval fallback
// ---------------------------------------------------------------------------

function buildOvalCircuit(width: number, height: number): Circuit {
  const cells: CellType[][] = createGrid(width, height, 'wall');

  const centerline = generateEllipse(width, height, 80);

  carveTrack(cells, centerline, 4, width, height);

  const startPositions = pickStartPositions(centerline, cells, width, height, 4);
  const finishLine = buildFinishLine(centerline, cells, width, height);

  markCells(cells, startPositions, 'start');
  markCells(cells, finishLine, 'finish');

  return { width, height, cells, startPositions, finishLine, centerline };
}

// ---------------------------------------------------------------------------
// Helpers — geometry
// ---------------------------------------------------------------------------

/**
 * Generate a clean ellipse centerline (no perturbation).
 */
function generateEllipse(width: number, height: number, points: number): Vec2[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.35;
  const ry = height * 0.35;
  const result: Vec2[] = [];

  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    result.push({
      x: Math.round(cx + rx * Math.cos(angle)),
      y: Math.round(cy + ry * Math.sin(angle)),
    });
  }

  return result;
}

/**
 * Generate a perturbed ellipse centerline — random bumps to create variety.
 */
function generatePerturbedEllipse(width: number, height: number, points: number): Vec2[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.30 + Math.random() * width * 0.08;
  const ry = height * 0.28 + Math.random() * height * 0.08;

  // Generate random perturbation offsets per angle using a few sine harmonics
  const harmonics = 3 + Math.floor(Math.random() * 3); // 3–5 bumps around the loop
  const amplitudes: number[] = [];
  const phases: number[] = [];
  for (let h = 0; h < harmonics; h++) {
    amplitudes.push((Math.random() * 0.12 + 0.02) * Math.min(width, height));
    phases.push(Math.random() * 2 * Math.PI);
  }

  const result: Vec2[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;

    let perturbation = 0;
    for (let h = 0; h < harmonics; h++) {
      perturbation += amplitudes[h] * Math.sin((h + 2) * angle + phases[h]);
    }

    const r = 1 + perturbation / Math.max(rx, ry);
    result.push({
      x: Math.round(cx + rx * r * Math.cos(angle)),
      y: Math.round(cy + ry * r * Math.sin(angle)),
    });
  }

  return result;
}

/**
 * Carve track cells around every centerline point using a square brush.
 */
function carveTrack(
  cells: CellType[][],
  centerline: Vec2[],
  halfWidth: number,
  gridWidth: number,
  gridHeight: number
): void {
  const hw = Math.floor(halfWidth / 2);

  for (const pt of centerline) {
    for (let dx = -hw; dx <= hw; dx++) {
      for (let dy = -hw; dy <= hw; dy++) {
        const nx = pt.x + dx;
        const ny = pt.y + dy;
        if (nx >= 0 && ny >= 0 && nx < gridWidth && ny < gridHeight) {
          if (cells[ny][nx] === 'wall') {
            cells[ny][nx] = 'track';
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers — start / finish placement
// ---------------------------------------------------------------------------

/**
 * Pick up to `count` start positions spread along the centerline.
 * Positions must land on non-wall cells.
 */
function pickStartPositions(
  centerline: Vec2[],
  cells: CellType[][],
  width: number,
  height: number,
  count: number
): Vec2[] {
  const positions: Vec2[] = [];
  if (centerline.length === 0) return positions;

  // Start from roughly 10% into the track to avoid the finish overlap
  const offset = Math.floor(centerline.length * 0.1);

  for (let i = 0; i < count; i++) {
    const idx = (offset + i) % centerline.length;
    const pt = centerline[idx];
    if (
      pt.x >= 0 && pt.y >= 0 &&
      pt.x < width && pt.y < height &&
      cells[pt.y][pt.x] !== 'wall'
    ) {
      positions.push({ x: pt.x, y: pt.y });
    }
  }

  return positions;
}

/**
 * Build a finish line perpendicular to the track at the beginning of the centerline.
 */
function buildFinishLine(
  centerline: Vec2[],
  cells: CellType[][],
  width: number,
  height: number
): Vec2[] {
  if (centerline.length < 2) return [];

  // Use index 0 as finish location
  const pt = centerline[0];
  const next = centerline[1];

  // Direction of travel
  const dx = next.x - pt.x;
  const dy = next.y - pt.y;

  // Perpendicular direction (rotate 90°)
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = Math.round(-dy / len);
  const perpY = Math.round(dx / len);

  const finishLine: Vec2[] = [];

  // Sweep perpendicular to cover the track width (±3 cells)
  for (let step = -3; step <= 3; step++) {
    const fx = pt.x + perpX * step;
    const fy = pt.y + perpY * step;
    if (
      fx >= 0 && fy >= 0 &&
      fx < width && fy < height &&
      cells[fy][fx] !== 'wall'
    ) {
      finishLine.push({ x: fx, y: fy });
    }
  }

  return finishLine;
}

/**
 * Overwrite specific cells with a given type.
 */
function markCells(cells: CellType[][], positions: Vec2[], type: CellType): void {
  for (const p of positions) {
    cells[p.y][p.x] = type;
  }
}

/**
 * Create a 2D grid filled with a default cell type.
 */
function createGrid(width: number, height: number, fill: CellType): CellType[][] {
  return Array.from({ length: height }, () => Array(width).fill(fill) as CellType[]);
}
