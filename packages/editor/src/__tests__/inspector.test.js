/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { World, defineComponent, defineTag, resetComponentRegistry } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import { CommandStack } from '../command-stack.js';
import { Selection } from '../selection.js';
import { Inspector } from '../inspector.js';

/** @type {any} */ let Position;
/** @type {any} */ let Health;
/** @type {any} */ let Frozen;
/** @type {World} */ let world;
/** @type {CommandStack} */ let stack;
/** @type {HTMLElement} */ let container;
/** @type {Inspector} */ let inspector;

beforeEach(() => {
  resetComponentRegistry();
  Position = defineComponent('Position', () => ({ point: new Vec2(0, 0) }), {
    point: { type: 'vec2' },
  });
  Health = defineComponent(
    'Health',
    () => ({ current: 100, alive: true, name: 'hero', tint: 0xff0000, mode: 'idle' }),
    {
      current: { type: 'number', min: 0, max: 200 },
      alive: { type: 'boolean' },
      name: { type: 'string' },
      tint: { type: 'color' },
      mode: { type: 'enum', options: ['idle', 'run', 'jump'] },
    },
  );
  Frozen = defineTag('Frozen');

  world = new World();
  stack = new CommandStack();
  container = document.createElement('div');
  inspector = new Inspector(container, world, stack, new Selection());
});

describe('empty state', () => {
  it('shows a placeholder with nothing selected', () => {
    inspector.show(null);
    expect(container.textContent).toMatch(/No entity selected/);
  });

  it('shows the placeholder for a dead entity handle', () => {
    const entity = world.createEntity();
    world.destroyImmediate(entity);
    inspector.show(entity);
    expect(container.textContent).toMatch(/No entity selected/);
  });
});

describe('rendering fields', () => {
  it('renders one fieldset per component, named by the component', () => {
    const entity = world.spawn([Position], [Health]);
    inspector.show(entity);
    const legends = Array.from(container.querySelectorAll('legend')).map((el) => el.firstChild?.textContent ?? el.textContent);
    expect(legends).toContain('Position');
    expect(legends).toContain('Health');
  });

  it('renders a tag with no fields', () => {
    const entity = world.spawn([Frozen]);
    inspector.show(entity);
    expect(container.textContent).toMatch(/no fields/);
  });

  it('renders a number input reflecting the current value', () => {
    const entity = world.spawn([Health, { current: 42 }]);
    inspector.show(entity);
    const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type="number"]'));
    expect(input.value).toBe('42');
  });

  it('renders a checkbox for a boolean field', () => {
    const entity = world.spawn([Health, { alive: false }]);
    inspector.show(entity);
    const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type="checkbox"]'));
    expect(input.checked).toBe(false);
  });

  it('renders a select populated from enum options', () => {
    const entity = world.spawn([Health]);
    inspector.show(entity);
    const options = Array.from(container.querySelectorAll('fieldset select option')).map((o) => o.value);
    expect(options).toEqual(['idle', 'run', 'jump']);
  });

  it('renders two number inputs for a vec2 field', () => {
    const entity = world.spawn([Position, { point: new Vec2(3, 4) }]);
    inspector.show(entity);
    const inputs = container.querySelectorAll('.nf-inspector__vec2 input');
    expect(inputs).toHaveLength(2);
    expect(/** @type {HTMLInputElement} */ (inputs[0]).value).toBe('3');
    expect(/** @type {HTMLInputElement} */ (inputs[1]).value).toBe('4');
  });

  it('renders a colour swatch converted from the packed int', () => {
    const entity = world.spawn([Health, { tint: 0x336699 }]);
    inspector.show(entity);
    const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type="color"]'));
    expect(input.value).toBe('#336699');
  });
});

describe('editing commits a command', () => {
  it('changing a number field updates the component through the command stack', () => {
    const entity = world.spawn([Health]);
    inspector.show(entity);

    const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type="number"]'));
    input.value = '77';
    input.dispatchEvent(new Event('change'));

    expect(world.get(entity, Health)?.current).toBe(77);
    expect(stack.canUndo).toBe(true);
  });

  it('undo reverts an inspector edit', () => {
    const entity = world.spawn([Health, { current: 10 }]);
    inspector.show(entity);

    const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type="number"]'));
    input.value = '99';
    input.dispatchEvent(new Event('change'));
    stack.undo();

    expect(world.get(entity, Health)?.current).toBe(10);
  });

  it('editing a vec2 commits a real Vec2 instance', () => {
    const entity = world.spawn([Position]);
    inspector.show(entity);

    const inputs = container.querySelectorAll('.nf-inspector__vec2 input');
    /** @type {HTMLInputElement} */ (inputs[0]).value = '5';
    inputs[0].dispatchEvent(new Event('change'));

    expect(world.get(entity, Position)?.point).toBeInstanceOf(Vec2);
    expect(world.get(entity, Position)?.point.x).toBe(5);
  });

  it('toggling a checkbox commits the new boolean', () => {
    const entity = world.spawn([Health, { alive: true }]);
    inspector.show(entity);

    const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type="checkbox"]'));
    input.checked = false;
    input.dispatchEvent(new Event('change'));

    expect(world.get(entity, Health)?.alive).toBe(false);
  });

  it('editing the colour input commits a packed int', () => {
    const entity = world.spawn([Health]);
    inspector.show(entity);

    const input = /** @type {HTMLInputElement} */ (container.querySelector('input[type="color"]'));
    input.value = '#00ff00';
    input.dispatchEvent(new Event('change'));

    expect(world.get(entity, Health)?.tint).toBe(0x00ff00);
  });
});

describe('component add/remove', () => {
  it('lists only components the entity does not already have', () => {
    const entity = world.spawn([Position]);
    inspector.show(entity);
    const options = Array.from(container.querySelectorAll('.nf-inspector__add-row option')).map((o) => o.value);
    expect(options).not.toContain('Position');
    expect(options).toContain('Health');
  });

  it('adding a component through the button attaches it', () => {
    const entity = world.spawn([Position]);
    inspector.show(entity);

    const select = /** @type {HTMLSelectElement} */ (container.querySelector('.nf-inspector__add-row select'));
    select.value = 'Health';
    const button = /** @type {HTMLButtonElement} */ (container.querySelector('.nf-inspector__add-row button'));
    button.click();

    expect(world.has(entity, Health)).toBe(true);
  });

  it('removing a component detaches it and is undoable', () => {
    const entity = world.spawn([Position], [Health]);
    inspector.show(entity);

    const removeButton = /** @type {HTMLButtonElement} */ (
      container.querySelector('fieldset[data-component="Health"] button')
    );
    removeButton.click();

    expect(world.has(entity, Health)).toBe(false);
    stack.undo();
    expect(world.has(entity, Health)).toBe(true);
  });
});

describe('entity deletion', () => {
  it('the delete button destroys the entity', () => {
    const entity = world.spawn([Position]);
    inspector.show(entity);

    const deleteButton = /** @type {HTMLButtonElement} */ (
      container.querySelector('.nf-inspector__entity-row button')
    );
    deleteButton.click();

    expect(world.isAlive(entity)).toBe(false);
  });
});
