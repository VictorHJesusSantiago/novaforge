/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { World, Name, setParent, getParent, NULL_ENTITY } from '@novaforge/core';
import { CommandStack } from '../command-stack.js';
import { Selection } from '../selection.js';
import { SceneTree } from '../scene-tree.js';

/** @type {World} */ let world;
/** @type {Selection} */ let selection;
/** @type {CommandStack} */ let stack;
/** @type {HTMLElement} */ let container;
/** @type {SceneTree} */ let tree;

beforeEach(() => {
  world = new World();
  selection = new Selection();
  stack = new CommandStack();
  container = document.createElement('div');
  tree = new SceneTree(container, world, selection, stack);
});

describe('listing entities', () => {
  it('lists a bare entity as "Entity #N"', () => {
    const entity = world.createEntity();
    tree.refresh();
    const label = container.querySelector(`[data-entity="${entity}"] .nf-scene-tree__label`);
    expect(label?.textContent).toBe(`Entity #${entity}`);
  });

  it('prefers the Name component when present', () => {
    const entity = world.spawn([Name, { value: 'Player' }]);
    tree.refresh();
    const label = container.querySelector(`[data-entity="${entity}"] .nf-scene-tree__label`);
    expect(label?.textContent).toBe('Player');
  });

  it('falls back to the entity id for an empty name', () => {
    const entity = world.spawn([Name, { value: '' }]);
    tree.refresh();
    const label = container.querySelector(`[data-entity="${entity}"] .nf-scene-tree__label`);
    expect(label?.textContent).toBe(`Entity #${entity}`);
  });

  it('lists every live entity and none of the dead ones', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    world.destroyImmediate(b);
    tree.refresh();

    expect(container.querySelectorAll('.nf-scene-tree__item')).toHaveLength(1);
    expect(container.querySelector(`[data-entity="${a}"]`)).not.toBeNull();
  });
});

describe('selection', () => {
  it('clicking a row selects that entity', () => {
    const entity = world.createEntity();
    tree.refresh();

    /** @type {HTMLElement | null} */ (
      container.querySelector(`[data-entity="${entity}"]`)
    )?.click();

    expect(selection.entity).toBe(entity);
  });

  it('highlights the selected row', () => {
    const entity = world.createEntity();
    tree.refresh();
    selection.select(entity);

    const row = container.querySelector(`[data-entity="${entity}"]`);
    expect(row?.classList.contains('nf-scene-tree__item--selected')).toBe(true);
  });

  it('moves the highlight when the selection changes externally', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    tree.refresh();

    selection.select(a);
    selection.select(b);

    expect(container.querySelector(`[data-entity="${a}"]`)?.classList.contains('nf-scene-tree__item--selected')).toBe(false);
    expect(container.querySelector(`[data-entity="${b}"]`)?.classList.contains('nf-scene-tree__item--selected')).toBe(true);
  });
});

describe('toolbar actions', () => {
  it('the create button spawns and selects a new entity', () => {
    tree.refresh();
    const createButton = /** @type {HTMLButtonElement} */ (
      container.querySelector('.nf-scene-tree__toolbar button')
    );
    createButton.click();

    expect(world.entities()).toHaveLength(1);
    expect(selection.entity).not.toBeNull();
  });

  it('creation is undoable', () => {
    tree.refresh();
    /** @type {HTMLButtonElement} */ (container.querySelector('.nf-scene-tree__toolbar button')).click();
    stack.undo();
    expect(world.entities()).toHaveLength(0);
  });

  it('the row delete button removes the entity and clears a matching selection', () => {
    const entity = world.createEntity();
    tree.refresh();
    selection.select(entity);

    const deleteButton = /** @type {HTMLButtonElement} */ (
      container.querySelector(`[data-entity="${entity}"] .nf-scene-tree__delete`)
    );
    deleteButton.click();

    expect(world.isAlive(entity)).toBe(false);
    expect(selection.entity).toBeNull();
  });

  it('deleting a row does not clear an unrelated selection', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    tree.refresh();
    selection.select(a);

    /** @type {HTMLButtonElement} */ (
      container.querySelector(`[data-entity="${b}"] .nf-scene-tree__delete`)
    ).click();

    expect(selection.entity).toBe(a);
  });
});

describe('hierarchy rendering', () => {
  it('nests a child under its parent', () => {
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    tree.refresh();

    const childRow = /** @type {HTMLElement} */ (container.querySelector(`[data-entity="${child}"]`));
    const parentNode = container.querySelector(`[data-entity="${parent}"]`)?.closest('.nf-scene-tree__node');
    expect(parentNode?.contains(childRow)).toBe(true);
  });

  it('only lists roots at the top level', () => {
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    tree.refresh();

    const topLevelEntities = Array.from(
      container.querySelectorAll(':scope > .nf-scene-tree__list > .nf-scene-tree__node > [data-entity]'),
    ).map((el) => el.getAttribute('data-entity'));
    expect(topLevelEntities).toEqual([String(parent)]);
  });

  it('is draggable', () => {
    const entity = world.createEntity();
    tree.refresh();
    const row = /** @type {HTMLElement} */ (container.querySelector(`[data-entity="${entity}"]`));
    expect(row.draggable).toBe(true);
  });
});

describe('drag-and-drop reparenting', () => {
  /**
   * jsdom has no native drag-and-drop; a DataTransfer-carrying DragEvent is simulated the same
   * way `viewport-overlay.test.js` simulates PointerEvent with MouseEvent — by dispatching the
   * exact event type the listener is registered for, with the data the handler actually reads.
   * @param {string} type
   * @param {string} data
   * @returns {DragEvent}
   */
  function dragEvent(type, data) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const store = new Map([['text/plain', data]]);
    Object.defineProperty(event, 'dataTransfer', {
      value: { getData: (/** @type {string} */ key) => store.get(key) ?? '', setData: () => {} },
    });
    return /** @type {DragEvent} */ (event);
  }

  it('reparents a row dropped onto another row', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    tree.refresh();

    const targetRow = /** @type {HTMLElement} */ (container.querySelector(`[data-entity="${b}"]`));
    targetRow.dispatchEvent(dragEvent('drop', String(a)));

    expect(getParent(world, a)).toBe(b);
  });

  it('reparenting is undoable', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    tree.refresh();

    const targetRow = /** @type {HTMLElement} */ (container.querySelector(`[data-entity="${b}"]`));
    targetRow.dispatchEvent(dragEvent('drop', String(a)));
    stack.undo();

    expect(getParent(world, a)).toBe(NULL_ENTITY);
  });

  it('dropping onto the list background clears the parent', () => {
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    tree.refresh();

    const list = /** @type {HTMLElement} */ (container.querySelector('.nf-scene-tree__list'));
    list.dispatchEvent(dragEvent('drop', String(child)));

    expect(getParent(world, child)).toBe(NULL_ENTITY);
  });

  it('refuses to drop an entity onto its own descendant', () => {
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    tree.refresh();

    const childRow = /** @type {HTMLElement} */ (container.querySelector(`[data-entity="${child}"]`));
    childRow.dispatchEvent(dragEvent('drop', String(parent)));

    expect(getParent(world, parent)).toBe(NULL_ENTITY);
  });

  it('dropping onto its own current parent is a harmless no-op', () => {
    const parent = world.createEntity();
    const child = world.createEntity();
    setParent(world, child, parent);
    tree.refresh();

    const parentRow = /** @type {HTMLElement} */ (container.querySelector(`[data-entity="${parent}"]`));
    parentRow.dispatchEvent(dragEvent('drop', String(child)));

    expect(stack.canUndo).toBe(false);
  });

  it('dropping an entity onto itself is a no-op', () => {
    const entity = world.createEntity();
    tree.refresh();
    const row = /** @type {HTMLElement} */ (container.querySelector(`[data-entity="${entity}"]`));
    row.dispatchEvent(dragEvent('drop', String(entity)));
    expect(stack.canUndo).toBe(false);
  });
});

describe('dispose', () => {
  it('stops reacting to selection changes after dispose', () => {
    const entity = world.createEntity();
    tree.refresh();
    tree.dispose();

    expect(() => selection.select(entity)).not.toThrow();
  });
});
