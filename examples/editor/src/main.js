import { Game } from '@novaforge/runtime';
import { Canvas2DRenderer, WebGL2Renderer } from '@novaforge/renderer';
import { Editor, Splitter, installDefaultShortcuts } from '@novaforge/editor';
import { buildSandboxScene } from './sandbox-scene.js';

import '../../../packages/editor/src/style.css';

const gameCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const overlayCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('overlay'));

const game = new Game({
  canvas: gameCanvas,
  gravity: { x: 0, y: 980 },
  backgroundColor: 0x101018,
});

buildSandboxScene(game);

const editor = new Editor(game, {
  sceneTree: /** @type {HTMLElement} */ (document.getElementById('scene-tree')),
  inspector: /** @type {HTMLElement} */ (document.getElementById('inspector')),
  assetPanel: /** @type {HTMLElement} */ (document.getElementById('asset-panel')),
  timelinePanel: /** @type {HTMLElement} */ (document.getElementById('timeline-panel')),
  overlayCanvas,
});

installDefaultShortcuts(editor);


const appRoot = /** @type {HTMLElement} */ (document.getElementById('app'));

new Splitter(/** @type {HTMLElement} */ (document.getElementById('splitter-tree')), {
  orientation: 'horizontal',
  target: appRoot,
  property: '--tree-width',
  initial: 240,
  min: 160,
  max: 480,
});

new Splitter(/** @type {HTMLElement} */ (document.getElementById('splitter-inspector')), {
  orientation: 'horizontal',
  target: appRoot,
  property: '--inspector-width',
  initial: 300,
  min: 220,
  max: 520,
  invert: true,
});

new Splitter(/** @type {HTMLElement} */ (document.getElementById('splitter-bottom')), {
  orientation: 'vertical',
  target: appRoot,
  property: '--bottom-height',
  initial: 180,
  min: 100,
  max: 420,
  invert: true,
});


const assetsTab = /** @type {HTMLButtonElement} */ (document.getElementById('tab-assets'));
const timelineTab = /** @type {HTMLButtonElement} */ (document.getElementById('tab-timeline'));
const assetPanelEl = /** @type {HTMLElement} */ (document.getElementById('asset-panel'));
const timelinePanelEl = /** @type {HTMLElement} */ (document.getElementById('timeline-panel'));

/** @param {'assets'|'timeline'} which */
function showBottomTab(which) {
  assetsTab.dataset.active = String(which === 'assets');
  timelineTab.dataset.active = String(which === 'timeline');
  assetPanelEl.hidden = which !== 'assets';
  timelinePanelEl.hidden = which !== 'timeline';
}
assetsTab.addEventListener('click', () => showBottomTab('assets'));
timelineTab.addEventListener('click', () => showBottomTab('timeline'));


const gizmoButtons = /** @type {Record<'translate'|'rotate'|'scale', HTMLButtonElement>} */ ({
  translate: /** @type {HTMLButtonElement} */ (document.getElementById('gizmo-translate')),
  rotate: /** @type {HTMLButtonElement} */ (document.getElementById('gizmo-rotate')),
  scale: /** @type {HTMLButtonElement} */ (document.getElementById('gizmo-scale')),
});

/** @param {'translate'|'rotate'|'scale'} mode */
function setGizmoMode(mode) {
  editor.viewportOverlay.gizmoMode = mode;
  for (const [name, button] of Object.entries(gizmoButtons)) {
    button.dataset.active = String(name === mode);
  }
}
gizmoButtons.translate.addEventListener('click', () => setGizmoMode('translate'));
gizmoButtons.rotate.addEventListener('click', () => setGizmoMode('rotate'));
gizmoButtons.scale.addEventListener('click', () => setGizmoMode('scale'));

function syncGizmoButtons() {
  for (const [name, button] of Object.entries(gizmoButtons)) {
    button.dataset.active = String(name === editor.viewportOverlay.gizmoMode);
  }
}

const snapPositionToggle = /** @type {HTMLInputElement} */ (document.getElementById('snap-position'));
const snapGridSizeInput = /** @type {HTMLInputElement} */ (document.getElementById('snap-grid-size'));
const snapRotationToggle = /** @type {HTMLInputElement} */ (document.getElementById('snap-rotation'));
const snapAngleSizeInput = /** @type {HTMLInputElement} */ (document.getElementById('snap-angle-size'));

function syncSnapSettings() {
  editor.viewportOverlay.snapGridSize = snapPositionToggle.checked ? Number(snapGridSizeInput.value) : 0;
  editor.viewportOverlay.snapAngleDegrees = snapRotationToggle.checked ? Number(snapAngleSizeInput.value) : 0;
}
for (const input of [snapPositionToggle, snapGridSizeInput, snapRotationToggle, snapAngleSizeInput]) {
  input.addEventListener('change', syncSnapSettings);
}
syncSnapSettings();


const canvas2dCanvas = gameCanvas;
const webgl2Canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-webgl'));
const backendButtons = {
  canvas2d: /** @type {HTMLButtonElement} */ (document.getElementById('btn-backend-canvas2d')),
  webgl2: /** @type {HTMLButtonElement} */ (document.getElementById('btn-backend-webgl2')),
};
const statsReadout = /** @type {HTMLElement} */ (document.getElementById('renderer-stats'));

/** @type {'canvas2d'|'webgl2'} */
let currentBackend = 'canvas2d';

/** @param {'canvas2d'|'webgl2'} kind */
function switchBackend(kind) {
  if (kind === currentBackend) return;

  if (kind === 'webgl2') {
    try {
      editor.game.renderer = new WebGL2Renderer(webgl2Canvas, { textures: game.textures });
    } catch (error) {
      console.warn('WebGL2 unavailable, staying on Canvas2D:', error);
      return;
    }
  } else {
    editor.game.renderer = new Canvas2DRenderer(canvas2dCanvas, { textures: game.textures });
  }

  canvas2dCanvas.style.display = kind === 'canvas2d' ? 'block' : 'none';
  webgl2Canvas.style.display = kind === 'webgl2' ? 'block' : 'none';

  currentBackend = kind;
  backendButtons.canvas2d.dataset.active = String(kind === 'canvas2d');
  backendButtons.webgl2.dataset.active = String(kind === 'webgl2');
}

backendButtons.canvas2d.addEventListener('click', () => switchBackend('canvas2d'));
backendButtons.webgl2.addEventListener('click', () => switchBackend('webgl2'));

function updateRendererStats() {
  const info = editor.game.debugInfo();
  statsReadout.textContent = `${info.fps} fps · ${info.drawCalls} draw calls · ${info.drawCommands} cmds`;
}


const playButton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-play'));
const stopButton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-stop'));
const stepButton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-step'));
const undoButton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-undo'));
const redoButton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-redo'));
const saveButton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-save'));
const loadButton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-load'));
const loadInput = /** @type {HTMLInputElement} */ (document.getElementById('load-input'));

function refreshToolbar() {
  playButton.dataset.active = String(editor.mode === 'play');
  stopButton.dataset.active = String(editor.mode === 'edit');
  stepButton.disabled = editor.mode === 'play';
  undoButton.disabled = !editor.commandStack.canUndo;
  redoButton.disabled = !editor.commandStack.canRedo;
}

playButton.addEventListener('click', () => {
  editor.play();
  refreshToolbar();
});

stopButton.addEventListener('click', () => {
  editor.stop();
  refreshToolbar();
});

stepButton.addEventListener('click', () => {
  editor.step();
});

undoButton.addEventListener('click', () => {
  editor.commandStack.undo();
});

redoButton.addEventListener('click', () => {
  editor.commandStack.redo();
});

editor.commandStack.onChange(refreshToolbar);

saveButton.addEventListener('click', () => {
  const text = editor.save();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'scene.json';
  link.click();
  URL.revokeObjectURL(url);
});

loadButton.addEventListener('click', () => loadInput.click());

loadInput.addEventListener('change', async () => {
  const file = loadInput.files?.[0];
  if (file === undefined) return;
  const text = await file.text();
  editor.load(text);
  loadInput.value = '';
});

refreshToolbar();


/**
 * The editor is the sole driver of the frame loop (see the Editor class doc for why) — this is
 * the host page's own `requestAnimationFrame`, exactly as if it were driving a plain `Game`.
 * @param {number} now
 */
function tick(now) {
  editor.frame(now);
  syncGizmoButtons();
  updateRendererStats();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/** @type {any} */ (window).editor = editor;
/** @type {any} */ (window).game = game;
