import { listComponentTypes } from '@novaforge/core';
import { Vec2 } from '@novaforge/math';
import {
  setFieldCommand,
  addComponentCommand,
  removeComponentCommand,
  deleteEntityCommand,
} from './commands.js';

/**
 * The schema-driven property panel (SPEC §12).
 *
 * Every field it renders comes from a component's schema, which is why adding an editable
 * field to a new component costs one object literal in `defineComponent` and nothing here —
 * there is no per-component inspector code to write, which is the entire point of driving the
 * UI from the schema rather than hand-building a panel per component the way most small engines
 * do.
 *
 * Committing an edit: a text/number/select/checkbox field reads the component's *current* value
 * at the moment its native `change` event fires (still the old value, since nothing has touched
 * the component yet) and executes a `setFieldCommand` with that as `oldValue`. That is enough
 * for ordinary fields; a drag gesture (the viewport's move gizmo) is a different case — it
 * mutates the component continuously before any command exists — and is handled by
 * `viewport-overlay.js`, not here.
 */
export class Inspector {
  /**
   * @param {HTMLElement} container
   * @param {import('@novaforge/core').World} world
   * @param {import('./command-stack.js').CommandStack} commandStack
   * @param {import('./selection.js').Selection} [selection] if given, deletion clears it
   */
  constructor(container, world, commandStack, selection) {
    /** @type {HTMLElement} */
    this.container = container;
    /** @type {import('@novaforge/core').World} */
    this.world = world;
    /** @type {import('./command-stack.js').CommandStack} */
    this.commandStack = commandStack;
    /** @type {import('./selection.js').Selection | undefined} */
    this.selection = selection;

    /** @type {number | null} @private */
    this._entity = null;

    this.container.classList.add('nf-inspector');
  }

  /**
   * Display an entity's components, or clear the panel for `null`.
   * @param {number | null} entity
   * @returns {void}
   */
  show(entity) {
    this._entity = entity;
    this.refresh();
  }

  /** Re-render the panel for whichever entity is currently shown. @returns {void} */
  refresh() {
    const container = this.container;
    container.replaceChildren();

    if (this._entity === null || !this.world.isAlive(this._entity)) {
      const empty = document.createElement('p');
      empty.className = 'nf-inspector__empty';
      empty.textContent = 'No entity selected.';
      container.appendChild(empty);
      return;
    }

    const entity = this._entity;
    const header = document.createElement('div');
    header.className = 'nf-inspector__header';
    header.appendChild(this._buildEntityHeader(entity));
    container.appendChild(header);

    for (const { type, value } of this.world.componentsOf(entity)) {
      container.appendChild(this._buildComponentSection(entity, type, value));
    }

    container.appendChild(this._buildAddComponentRow(entity));
  }

  /**
   * @param {number} entity
   * @returns {HTMLElement}
   * @private
   */
  _buildEntityHeader(entity) {
    const row = document.createElement('div');
    row.className = 'nf-inspector__entity-row';

    const label = document.createElement('span');
    label.className = 'nf-inspector__entity-id';
    label.textContent = `Entity #${entity}`;
    row.appendChild(label);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'nf-button nf-button--danger';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      const command = deleteEntityCommand(this.world, entity);
      this.commandStack.execute(command);
      this.selection?.clear();
    });
    row.appendChild(deleteButton);

    return row;
  }

  /**
   * @param {number} entity
   * @param {import('@novaforge/core').ComponentType} type
   * @param {any} value
   * @returns {HTMLElement}
   * @private
   */
  _buildComponentSection(entity, type, value) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'nf-inspector__component';
    fieldset.dataset.component = type.name;

    const legend = document.createElement('legend');
    legend.textContent = type.name;
    fieldset.appendChild(legend);

    if (!type.isTag) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'nf-button nf-button--small';
      removeButton.textContent = '✕';
      removeButton.title = `Remove ${type.name}`;
      removeButton.addEventListener('click', () => {
        this.commandStack.execute(removeComponentCommand(this.world, entity, type));
        this.refresh();
      });
      legend.appendChild(removeButton);
    }

    if (type.isTag) {
      const note = document.createElement('p');
      note.className = 'nf-inspector__tag-note';
      note.textContent = '(tag — no fields)';
      fieldset.appendChild(note);
      return fieldset;
    }

    if (type.schema === null) {
      const note = document.createElement('pre');
      note.className = 'nf-inspector__opaque';
      note.textContent = JSON.stringify(value, null, 1);
      fieldset.appendChild(note);
      return fieldset;
    }

    for (const [field, spec] of Object.entries(type.schema)) {
      fieldset.appendChild(this._buildField(entity, type, value, field, spec));
    }

    return fieldset;
  }

  /**
   * @param {number} entity
   * @param {import('@novaforge/core').ComponentType} type
   * @param {any} value
   * @param {string} field
   * @param {import('@novaforge/core').ComponentSchemaField} spec
   * @returns {HTMLElement}
   * @private
   */
  _buildField(entity, type, value, field, spec) {
    const row = document.createElement('label');
    row.className = 'nf-inspector__field';

    const labelText = document.createElement('span');
    labelText.className = 'nf-inspector__field-label';
    labelText.textContent = spec.label ?? field;
    row.appendChild(labelText);

    const commit = (/** @type {any} */ newValue) => {
      const oldValue = value[field];
      this.commandStack.execute(setFieldCommand(this.world, entity, type, field, oldValue, newValue));
    };

    row.appendChild(this._buildControl(value, field, spec, commit));
    return row;
  }

  /**
   * @param {any} value
   * @param {string} field
   * @param {import('@novaforge/core').ComponentSchemaField} spec
   * @param {(newValue: any) => void} commit
   * @returns {HTMLElement}
   * @private
   */
  _buildControl(value, field, spec, commit) {
    switch (spec.type) {
      case 'number': {
        const input = document.createElement('input');
        input.type = 'number';
        if (spec.min !== undefined) input.min = String(spec.min);
        if (spec.max !== undefined) input.max = String(spec.max);
        input.step = String(spec.step ?? 'any');
        input.value = String(value[field]);
        input.addEventListener('change', () => commit(Number(input.value)));
        return input;
      }

      case 'boolean': {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(value[field]);
        input.addEventListener('change', () => commit(input.checked));
        return input;
      }

      case 'color': {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = packedToHex(value[field]);
        input.addEventListener('change', () => commit(hexToPacked(input.value)));
        return input;
      }

      case 'enum': {
        const select = document.createElement('select');
        for (const option of spec.options ?? []) {
          const optionEl = document.createElement('option');
          optionEl.value = option;
          optionEl.textContent = option;
          select.appendChild(optionEl);
        }
        select.value = value[field];
        select.addEventListener('change', () => commit(select.value));
        return select;
      }

      case 'vec2': {
        const wrapper = document.createElement('span');
        wrapper.className = 'nf-inspector__vec2';

        const current = value[field];
        const xInput = document.createElement('input');
        xInput.type = 'number';
        xInput.step = 'any';
        xInput.value = String(current.x);
        const yInput = document.createElement('input');
        yInput.type = 'number';
        yInput.step = 'any';
        yInput.value = String(current.y);

        const commitVector = () => commit(new Vec2(Number(xInput.value), Number(yInput.value)));
        xInput.addEventListener('change', commitVector);
        yInput.addEventListener('change', commitVector);

        wrapper.appendChild(xInput);
        wrapper.appendChild(yInput);
        return wrapper;
      }

      case 'string':
      case 'asset': {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = String(value[field] ?? '');
        input.addEventListener('change', () => commit(input.value));
        return input;
      }

      case 'entity':
      case 'opaque':
      default: {
        const span = document.createElement('span');
        span.className = 'nf-inspector__readonly';
        span.textContent = JSON.stringify(value[field]);
        return span;
      }
    }
  }

  /**
   * @param {number} entity
   * @returns {HTMLElement}
   * @private
   */
  _buildAddComponentRow(entity) {
    const row = document.createElement('div');
    row.className = 'nf-inspector__add-row';

    const existing = new Set(this.world.componentsOf(entity).map((c) => c.type.name));
    const available = listComponentTypes().filter((type) => !existing.has(type.name));

    const select = document.createElement('select');
    for (const type of available) {
      const option = document.createElement('option');
      option.value = type.name;
      option.textContent = type.name;
      select.appendChild(option);
    }
    select.disabled = available.length === 0;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'nf-button';
    addButton.textContent = 'Add Component';
    addButton.disabled = available.length === 0;
    addButton.addEventListener('click', () => {
      const type = available.find((t) => t.name === select.value);
      if (type === undefined) return;
      this.commandStack.execute(addComponentCommand(this.world, entity, type));
      this.refresh();
    });

    row.appendChild(select);
    row.appendChild(addButton);
    return row;
  }
}

/**
 * @param {number} packed 0xRRGGBB
 * @returns {string} `#rrggbb`, what an `<input type="color">` expects.
 */
function packedToHex(packed) {
  return `#${(packed >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

/**
 * @param {string} hex `#rrggbb`
 * @returns {number} packed 0xRRGGBB
 */
function hexToPacked(hex) {
  return parseInt(hex.replace('#', ''), 16);
}
