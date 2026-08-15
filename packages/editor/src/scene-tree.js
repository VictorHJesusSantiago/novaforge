import { getComponentType, getParent, getChildren, getRoots, isAncestorOf, NULL_ENTITY } from '@novaforge/core';
import { createEntityCommand, deleteEntityCommand, setParentCommand } from './commands.js';

/**
 * The entity tree panel (SPEC §12).
 *
 * A real nested tree, built from `Parent`/`getChildren`/`getRoots` (`@novaforge/core`'s
 * organisational-only hierarchy — see `hierarchy.js`'s doc for what it deliberately does not
 * do: compose transforms). Drag a row onto another to reparent it; drag a row onto the panel's
 * empty background to make it a root. Every reparent goes through `setParentCommand`, so it is
 * undoable, and it is rejected (silently — the row simply does not accept the drop) exactly
 * when `@novaforge/core`'s own cycle guard would reject it, since this panel calls the same
 * `isAncestorOf` check before ever attempting the command.
 */
export class SceneTree {
  /**
   * @param {HTMLElement} container
   * @param {import('@novaforge/core').World} world
   * @param {import('./selection.js').Selection} selection
   * @param {import('./command-stack.js').CommandStack} commandStack
   */
  constructor(container, world, selection, commandStack) {
    /** @type {HTMLElement} */
    this.container = container;
    /** @type {import('@novaforge/core').World} */
    this.world = world;
    /** @type {import('./selection.js').Selection} */
    this.selection = selection;
    /** @type {import('./command-stack.js').CommandStack} */
    this.commandStack = commandStack;

    this.container.classList.add('nf-scene-tree');

    /** @private */
    this._unsubscribeSelection = selection.onChange(() => this._highlightSelection());
  }

  /** Rebuild the tree from the world's current entities. @returns {void} */
  refresh() {
    const container = this.container;
    container.replaceChildren();

    const toolbar = document.createElement('div');
    toolbar.className = 'nf-scene-tree__toolbar';
    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'nf-button';
    createButton.textContent = '+ Entity';
    createButton.addEventListener('click', () => {
      const command = createEntityCommand(this.world);
      this.commandStack.execute(command);
      this.refresh();
      const entity = command.entity();
      if (entity !== null) this.selection.select(entity);
    });
    toolbar.appendChild(createButton);
    container.appendChild(toolbar);

    const list = document.createElement('ul');
    list.className = 'nf-scene-tree__list';
    list.addEventListener('dragover', (event) => event.preventDefault());
    list.addEventListener('drop', (event) => {
      if (event.target !== list) return;
      this._handleDrop(event, NULL_ENTITY);
    });

    for (const root of getRoots(this.world)) {
      list.appendChild(this._buildNode(root));
    }

    container.appendChild(list);
    this._highlightSelection();
  }

  /**
   * @param {number} entity
   * @returns {HTMLElement}
   * @private
   */
  _buildNode(entity) {
    const NameType = getComponentType('Name');

    const li = document.createElement('li');
    li.className = 'nf-scene-tree__node';

    const row = document.createElement('div');
    row.className = 'nf-scene-tree__item';
    row.dataset.entity = String(entity);
    row.draggable = true;

    const label = document.createElement('span');
    label.className = 'nf-scene-tree__label';
    const name = NameType !== undefined ? this.world.get(entity, NameType)?.value : undefined;
    label.textContent = name && name.length > 0 ? name : `Entity #${entity}`;
    row.addEventListener('click', () => this.selection.select(entity));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'nf-button nf-button--small nf-scene-tree__delete';
    deleteButton.textContent = '✕';
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.commandStack.execute(deleteEntityCommand(this.world, entity));
      if (this.selection.entity === entity) this.selection.clear();
      this.refresh();
    });

    row.append(label, deleteButton);

    row.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', String(entity));
      event.stopPropagation();
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    row.addEventListener('drop', (event) => {
      event.stopPropagation();
      this._handleDrop(event, entity);
    });

    li.appendChild(row);

    const children = getChildren(this.world, entity);
    if (children.length > 0) {
      const childList = document.createElement('ul');
      childList.className = 'nf-scene-tree__children';
      for (const child of children) childList.appendChild(this._buildNode(child));
      li.appendChild(childList);
    }

    return li;
  }

  /**
   * @param {DragEvent} event
   * @param {number} newParent `NULL_ENTITY` for a drop onto the tree's background
   * @returns {void}
   * @private
   */
  _handleDrop(event, newParent) {
    event.preventDefault();
    const raw = event.dataTransfer?.getData('text/plain');
    if (raw === undefined || raw === '') return;
    const dragged = Number(raw);

    if (dragged === newParent) return;
    if (newParent !== NULL_ENTITY && isAncestorOf(this.world, dragged, newParent)) return;

    const oldParent = getParent(this.world, dragged);
    if (oldParent === newParent) return;

    this.commandStack.execute(setParentCommand(this.world, dragged, oldParent, newParent));
    this.refresh();
  }

  /** @private */
  _highlightSelection() {
    const items = this.container.querySelectorAll('.nf-scene-tree__item');
    const selected = this.selection.entity;
    for (const item of items) {
      const isSelected = item.getAttribute('data-entity') === String(selected);
      item.classList.toggle('nf-scene-tree__item--selected', isSelected);
    }
  }

  /** Release the selection subscription. @returns {void} */
  dispose() {
    this._unsubscribeSelection();
  }
}
