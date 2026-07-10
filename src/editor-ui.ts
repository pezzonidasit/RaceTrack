import type { Circuit, Vec2, CellType } from './types';
import {
  EDITOR_WIDTH,
  EDITOR_HEIGHT,
  createEmptyCircuit,
  applyTool,
  validateForSave,
  listSavedCircuits,
  saveCircuit,
  deleteSavedCircuit,
} from './editor';
import { createSoloState, stepSolo } from './solo';
import type { SoloState } from './solo';
import { getPossibleMoves } from './physics';
import { showScreen } from './app';

// ---------------------------------------------------------------------------
// Couleurs (alignées sur grid.ts / COLOR_MAP)
// ---------------------------------------------------------------------------

const COLOR_MAP: Record<CellType, string> = {
  wall: '#1a1a2e',
  track: '#2a2a4a',
  start: '#3a5a3a',
  finish: '#5a3a3a',
};

// ---------------------------------------------------------------------------
// État module
// ---------------------------------------------------------------------------

let editorCircuit: Circuit = createEmptyCircuit(EDITOR_WIDTH, EDITOR_HEIGHT);
let currentTool: CellType = 'track';
let painting = false;

let soloState: SoloState | null = null;

// ---------------------------------------------------------------------------
// Rendu « fit » — tout le circuit tient à l'écran (pas de pan/zoom)
// ---------------------------------------------------------------------------

function fitCanvas(canvas: HTMLCanvasElement, circuit: Circuit): number {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cell = Math.max(
    1,
    Math.floor(Math.min(rect.width / circuit.width, rect.height / circuit.height)),
  );
  canvas.width = circuit.width * cell * dpr;
  canvas.height = circuit.height * cell * dpr;
  // Affichage CSS centré, taille pixel-perfect
  canvas.style.width = `${circuit.width * cell}px`;
  canvas.style.height = `${circuit.height * cell}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return cell;
}

function drawCircuit(
  canvas: HTMLCanvasElement,
  circuit: Circuit,
  cell: number,
  opts: { player?: Vec2; moves?: Vec2[] } = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  for (let y = 0; y < circuit.height; y++) {
    for (let x = 0; x < circuit.width; x++) {
      ctx.fillStyle = COLOR_MAP[circuit.cells[y]?.[x] ?? 'wall'];
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // Lignes de grille discrètes
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= circuit.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, circuit.height * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= circuit.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(circuit.width * cell, y * cell);
    ctx.stroke();
  }

  // Coups possibles (mode solo)
  if (opts.moves) {
    for (const m of opts.moves) {
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(m.x * cell, m.y * cell, cell, cell);
      ctx.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(m.x * cell + 0.5, m.y * cell + 0.5, cell - 1, cell - 1);
    }
  }

  // Pilote (mode solo)
  if (opts.player) {
    const cx = opts.player.x * cell + cell / 2;
    const cy = opts.player.y * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, cell * 0.38), 0, Math.PI * 2);
    ctx.fillStyle = '#FF4444';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function eventToCell(
  canvas: HTMLCanvasElement,
  cell: number,
  clientX: number,
  clientY: number,
): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((clientX - rect.left) / cell),
    y: Math.floor((clientY - rect.top) / cell),
  };
}

// ---------------------------------------------------------------------------
// Écran « Mes circuits »
// ---------------------------------------------------------------------------

export function initMyCircuitsScreen(): void {
  document.getElementById('btn-circuits')?.addEventListener('click', () => {
    renderMyCircuits();
    showScreen('circuits');
  });
  document.getElementById('btn-circuits-back')?.addEventListener('click', () => {
    showScreen('home');
  });
  document.getElementById('btn-new-circuit')?.addEventListener('click', () => {
    openEditor();
  });
}

function renderMyCircuits(): void {
  const list = document.getElementById('circuits-list');
  if (!list) return;

  const saved = listSavedCircuits();
  if (saved.length === 0) {
    list.innerHTML = '<div class="circuits-empty">Aucun circuit. Crée le premier !</div>';
    return;
  }

  list.innerHTML = saved
    .map(
      (s) => `
      <div class="circuit-row" data-id="${s.id}">
        <span class="circuit-name">${escapeHtml(s.name)}</span>
        <span class="circuit-row-actions">
          <button class="btn btn-small circuit-play" data-id="${s.id}">▶︎</button>
          <button class="btn btn-small circuit-edit" data-id="${s.id}">✎</button>
          <button class="btn btn-small circuit-del" data-id="${s.id}">🗑️</button>
        </span>
      </div>`,
    )
    .join('');

  list.querySelectorAll<HTMLElement>('.circuit-play').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = findCircuit(btn.dataset.id);
      if (c) startSolo(c);
    });
  });
  list.querySelectorAll<HTMLElement>('.circuit-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = findCircuit(btn.dataset.id);
      if (c) openEditor(c);
    });
  });
  list.querySelectorAll<HTMLElement>('.circuit-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.id && confirm('Supprimer ce circuit ?')) {
        deleteSavedCircuit(btn.dataset.id);
        renderMyCircuits();
      }
    });
  });
}

function findCircuit(id: string | undefined): Circuit | null {
  if (!id) return null;
  return listSavedCircuits().find((s) => s.id === id)?.circuit ?? null;
}

// ---------------------------------------------------------------------------
// Écran « Éditeur »
// ---------------------------------------------------------------------------

export function initEditorScreen(): void {
  const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  // Sélection d'outil
  document.querySelectorAll<HTMLElement>('#editor-tools .tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTool = (btn.dataset.tool as CellType) ?? 'track';
      document
        .querySelectorAll('#editor-tools .tool-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Dessin tactile / souris (pointer events couvrent les deux)
  const paintAt = (clientX: number, clientY: number) => {
    const cell = lastEditorCell || 1;
    const pos = eventToCell(canvas, cell, clientX, clientY);
    const next = applyTool(editorCircuit, pos, currentTool);
    if (next !== editorCircuit) {
      editorCircuit = next;
      drawEditor();
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    painting = true;
    paintAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!painting) return;
    e.preventDefault();
    paintAt(e.clientX, e.clientY);
  });
  const stop = () => { painting = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', stop);

  document.getElementById('btn-editor-clear')?.addEventListener('click', () => {
    editorCircuit = createEmptyCircuit(EDITOR_WIDTH, EDITOR_HEIGHT);
    setEditorMsg('');
    drawEditor();
  });

  document.getElementById('btn-editor-test')?.addEventListener('click', () => {
    const res = validateForSave(editorCircuit);
    if (!res.ok) {
      setEditorMsg(res.error ?? 'Circuit invalide.', true);
      return;
    }
    startSolo(editorCircuit);
  });

  document.getElementById('btn-editor-save')?.addEventListener('click', () => {
    const nameInput = document.getElementById('editor-name') as HTMLInputElement | null;
    const name = nameInput?.value.trim() || '';
    if (!name) {
      setEditorMsg('Donne un nom au circuit.', true);
      return;
    }
    try {
      saveCircuit(name, editorCircuit);
      setEditorMsg('Circuit sauvegardé ✓');
      renderMyCircuits();
      showScreen('circuits');
    } catch (err) {
      setEditorMsg((err as Error).message, true);
    }
  });

  document.getElementById('btn-editor-back')?.addEventListener('click', () => {
    showScreen('circuits');
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('screen-editor')?.classList.contains('active')) {
      drawEditor();
    }
  });
}

let lastEditorCell = 0;

function openEditor(circuit?: Circuit): void {
  editorCircuit = circuit
    ? cloneCircuit(circuit)
    : createEmptyCircuit(EDITOR_WIDTH, EDITOR_HEIGHT);
  const nameInput = document.getElementById('editor-name') as HTMLInputElement | null;
  if (nameInput) nameInput.value = '';
  setEditorMsg('');
  showScreen('editor');
  // Le canvas doit être visible avant de mesurer sa taille
  requestAnimationFrame(() => drawEditor());
}

function drawEditor(): void {
  const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  lastEditorCell = fitCanvas(canvas, editorCircuit);
  drawCircuit(canvas, editorCircuit, lastEditorCell);
}

function setEditorMsg(msg: string, isError = false): void {
  const el = document.getElementById('editor-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// ---------------------------------------------------------------------------
// Écran « Solo » — rejouer le circuit hors-ligne
// ---------------------------------------------------------------------------

let lastSoloCell = 0;
let soloCircuit: Circuit | null = null;

export function initSoloScreen(): void {
  const canvas = document.getElementById('solo-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  canvas.addEventListener('click', (e) => {
    if (!soloState || soloState.status === 'finished') return;
    const cell = lastSoloCell || 1;
    const tapped = eventToCell(canvas, cell, e.clientX, e.clientY);
    const moves = currentSoloMoves();
    const chosen = moves.find((m) => m.target.x === tapped.x && m.target.y === tapped.y);
    if (!chosen) return;
    soloState = stepSolo(soloState, chosen.acceleration);
    drawSolo();
  });

  document.getElementById('btn-solo-restart')?.addEventListener('click', () => {
    if (soloCircuit) soloState = createSoloState(soloCircuit);
    drawSolo();
  });
  document.getElementById('btn-solo-back')?.addEventListener('click', () => {
    showScreen('circuits');
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('screen-solo')?.classList.contains('active')) {
      drawSolo();
    }
  });
}

function startSolo(circuit: Circuit): void {
  soloCircuit = cloneCircuit(circuit);
  soloState = createSoloState(soloCircuit);
  showScreen('solo');
  requestAnimationFrame(() => drawSolo());
}

function currentSoloMoves(): { target: Vec2; acceleration: Vec2 }[] {
  if (!soloState) return [];
  return getPossibleMoves(soloState.position, soloState.velocity).filter(
    (m) =>
      m.target.x >= 0 &&
      m.target.y >= 0 &&
      m.target.x < soloState!.circuit.width &&
      m.target.y < soloState!.circuit.height,
  );
}

function drawSolo(): void {
  const canvas = document.getElementById('solo-canvas') as HTMLCanvasElement | null;
  if (!canvas || !soloState) return;

  lastSoloCell = fitCanvas(canvas, soloState.circuit);
  const moves = soloState.status === 'finished' ? [] : currentSoloMoves().map((m) => m.target);
  drawCircuit(canvas, soloState.circuit, lastSoloCell, {
    player: soloState.position,
    moves,
  });

  const status = document.getElementById('solo-status');
  if (status) {
    status.textContent =
      soloState.status === 'finished'
        ? `🏁 Arrivée ! ${soloState.turns} tours, ${soloState.crashes} crashs`
        : `Tour ${soloState.turns} · Crashs ${soloState.crashes} — touche une case rouge`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneCircuit(c: Circuit): Circuit {
  return {
    width: c.width,
    height: c.height,
    cells: c.cells.map((row) => row.slice()),
    startPositions: c.startPositions.map((p) => ({ ...p })),
    finishLine: c.finishLine.map((p) => ({ ...p })),
    centerline: c.centerline.map((p) => ({ ...p })),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
