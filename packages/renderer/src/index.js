/**
 * @novaforge/renderer — everything between the simulation and the screen.
 *
 * The simulation never calls a drawing API. Render systems append commands to a `DrawList`,
 * and a backend consumes it (SPEC §8, ADR-0003). That indirection is what makes culling and
 * sort order unit-testable in Node with no canvas involved, and what will let the WebGL2
 * backend drop in without touching a single system.
 */

export { DrawList, DrawKind } from './draw-list.js';
export { Renderer } from './renderer.js';
export { Canvas2DRenderer } from './canvas2d-renderer.js';
export { Camera2D } from './camera.js';
export { TextureCache } from './texture-cache.js';
export {
  rgb,
  rgba,
  fromHexString,
  toCssColor,
  channels,
  lerpColor,
  WHITE,
  BLACK,
  MAGENTA,
} from './color.js';
export { Transform, Sprite, ShapeRect, ShapeCircle, TextLabel } from './components.js';
export {
  DRAW_LIST_RESOURCE,
  syncPreviousTransform,
  spriteRenderSystem,
  shapeRenderSystem,
  textRenderSystem,
  installRenderSystems,
} from './systems.js';
export { TextureAtlas, AtlasRegistry } from './atlas.js';
export { packRects, packingEfficiency, packTextures } from './atlas-packer.js';
export {
  defineClip,
  play,
  Animator,
  animationSystem,
  installAnimationSystem,
  ATLAS_REGISTRY_RESOURCE,
  SPRITE_COMPONENT_RESOURCE,
} from './animation.js';
export {
  Tilemap,
  resizeTilemap,
  inTilemapBounds,
  setTile,
  getTile,
  worldToTile,
  tilemapRenderSystem,
  installTilemapSystem,
} from './tilemap.js';
export { WebGL2Renderer } from './webgl2-renderer.js';
export { RenderTarget } from './render-target.js';
export { PostProcessChain, POSTPROCESS_EFFECTS } from './postprocess.js';
export { computePostProcessPlan, fullscreenQuadVertices } from './postprocess-plan.js';
