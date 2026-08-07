/**
 * @novaforge/editor — a browser-based visual editor for NovaForge scenes (SPEC §12,
 * Milestone 5).
 *
 * `Editor` is the piece most consumers want; the rest of the exports are here because each is
 * independently useful and independently tested — the command stack and serialiser in
 * particular have no DOM dependency at all and are exactly as usable from a headless tool
 * (a CLI scene validator, say) as from the editor UI itself.
 */

export { Editor } from './editor.js';
export { CommandStack } from './command-stack.js';
export { Selection } from './selection.js';
export {
  snapshotComponent,
  restoreComponentValues,
  serializeEntity,
  serializeScene,
  deserializeEntity,
  deserializeScene,
  saveSceneToText,
  loadSceneFromText,
  SCENE_FORMAT_VERSION,
} from './serializer.js';
export {
  setFieldCommand,
  addComponentCommand,
  removeComponentCommand,
  createEntityCommand,
  deleteEntityCommand,
  renameEntityCommand,
  setParentCommand,
} from './commands.js';
export { Inspector } from './inspector.js';
export { SceneTree } from './scene-tree.js';
export { ViewportOverlay } from './viewport-overlay.js';
export { pickEntity } from './viewport-picking.js';
export {
  rotateHandlePosition,
  scaleHandlePosition,
  angleFromCenter,
  scaleFromDrag,
  snapValue,
  snapPoint,
  snapAngle,
  ROTATE_HANDLE_DISTANCE,
  SCALE_HANDLE_DISTANCE,
} from './gizmo-math.js';
export { AssetPanel } from './asset-panel.js';
export { TimelinePanel } from './timeline-panel.js';
export { setKeyframeCommand, removeKeyframeCommand } from './timeline-commands.js';
export { comboFromEvent, DEFAULT_BINDINGS, installDefaultShortcuts } from './shortcuts.js';
export { resizedSize } from './resize-math.js';
export { Splitter } from './splitter.js';
