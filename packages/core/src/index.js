/**
 * @typedef {import('./component.js').ComponentType} ComponentType
 * @typedef {import('./component.js').ComponentSchemaField} ComponentSchemaField
 *
 * Type-only re-exports. A `@typedef` produces no runtime code, so this costs nothing at the
 * "no build step" bar the rest of the engine holds itself to — it exists purely so a consumer
 * can write `import('@novaforge/core').ComponentType` from the barrel, the same way they import
 * the runtime values, instead of having to know that the type actually lives in
 * `component.js`. `@novaforge/editor` is the reason this was needed: its inspector and
 * serialiser are generic over "some component type", which is exactly what this typedef names.
 */

/**
 * @novaforge/core — the entity-component-system runtime.
 *
 * This package has no DOM dependency by design (SPEC §2). A world can be created, ticked, and
 * asserted against in Node, which is what makes the engine testable without a browser.
 */

export {
  NULL_ENTITY,
  MAX_ENTITIES,
  MAX_GENERATION,
  ENTITY_INDEX_BITS,
  ENTITY_INDEX_MASK,
  ENTITY_GENERATION_BITS,
  ENTITY_GENERATION_MASK,
  makeEntity,
  entityIndex,
  entityGeneration,
  describeEntity,
} from './entity.js';

export { SparseSet } from './sparse-set.js';
export {
  defineComponent,
  defineTag,
  componentCount,
  resetComponentRegistry,
  getComponentType,
  listComponentTypes,
  registerComponentType,
} from './component.js';
export { World } from './world.js';
export { Query } from './query.js';
export { Scheduler, STAGES } from './scheduler.js';
export { EventBus } from './events.js';
export { Clock } from './clock.js';
export { Transform } from './transform.js';
export { Name } from './name.js';
export {
  Parent,
  getParent,
  isAncestorOf,
  setParent,
  getChildren,
  getRoots,
  getDescendants,
  destroyHierarchy,
} from './hierarchy.js';
