/**
 * Drag-and-drop asset hot reload (SPEC §12's "asset browser" and "hot reload"), for both
 * textures and sounds.
 *
 * The whole feature is two facts about the engine meeting each other: a `Sprite.texture` (or a
 * sound id passed to `AudioMixer.play`) is looked up by **id string**, never by URL (SPEC §11);
 * and `TextureCache.set(id, image)` / a fresh `AudioMixer.load(id, url)` overwrite whatever is
 * resident under that id immediately. So dropping a file named `player.png` (or `jump.wav`) onto
 * this panel and having every entity already using that id change on the very next frame — or
 * the very next `play()` call — requires no scene reload and no cache invalidation logic. The
 * id-indirection the engine already had for other reasons is what makes hot reload fall out for
 * free; this panel is the thin UI on top of it.
 */
export class AssetPanel {
  /**
   * @param {HTMLElement} container
   * @param {import('@novaforge/renderer').TextureCache | null} [textures] omit to disable
   *   dropping image files
   * @param {import('@novaforge/audio').AudioMixer | null} [audio] omit to disable dropping
   *   sound files
   */
  constructor(container, textures = null, audio = null) {
    /** @type {HTMLElement} */
    this.container = container;
    /** @type {import('@novaforge/renderer').TextureCache | null} */
    this.textures = textures;
    /** @type {import('@novaforge/audio').AudioMixer | null} */
    this.audio = audio;

    /**
     * id -> its object URL and kind, so a reload can revoke the old URL and the list can be
     * rendered appropriately per kind.
     * @type {Map<string, { url: string, kind: 'texture' | 'sound' }>}
     * @private
     */
    this._entries = new Map();

    this.container.classList.add('nf-asset-panel');

    /** @private */
    this._onDrop = (/** @type {DragEvent} */ event) => this._handleDrop(event);
    /** @private */
    this._onDragOver = (/** @type {DragEvent} */ event) => event.preventDefault();

    container.addEventListener('drop', this._onDrop);
    container.addEventListener('dragover', this._onDragOver);
  }

  /**
   * Load a file under an explicit id — what the drop handler calls per file, and directly
   * usable from a "browse files" input as an alternative to dragging.
   * @param {string} id
   * @param {File} file
   * @returns {Promise<void>}
   * @throws {Error} if the file's kind has no corresponding subsystem attached, or if a sound
   *   fails to decode — a texture's own failure degrades to the placeholder (Invariant A1) and
   *   does not throw, since `TextureCache` already handles that; `AudioMixer.load` instead
   *   returns `false` on failure, which this method turns into a rejection so the drop handler's
   *   per-file try/catch reports it the same way for both kinds.
   */
  async loadFile(id, file) {
    const kind = file.type.startsWith('audio/') ? 'sound' : 'texture';
    const url = URL.createObjectURL(file);

    if (kind === 'texture') {
      if (this.textures === null) throw new Error('AssetPanel: no TextureCache attached');
      const image = await decodeImage(url);
      this.textures.set(id, image);
    } else {
      if (this.audio === null) throw new Error('AssetPanel: no AudioMixer attached');
      const ok = await this.audio.load(id, url);
      if (!ok) throw new Error(`AssetPanel: failed to decode sound "${id}"`);
    }

    const previous = this._entries.get(id);
    this._entries.set(id, { url, kind });
    if (previous !== undefined) URL.revokeObjectURL(previous.url);

    this.refresh();
  }

  /**
   * @param {DragEvent} event
   * @private
   */
  async _handleDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);

    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      if (!isImage && !isAudio) continue;

      const id = file.name.replace(/\.[^.]+$/, '');
      try {
        await this.loadFile(id, file);
      } catch (error) {
        console.warn(`AssetPanel: failed to load "${file.name}"`, error);
      }
    }
  }

  /** Rebuild the resident-asset list. @returns {void} */
  refresh() {
    const container = this.container;
    container.replaceChildren();

    const dropZone = document.createElement('div');
    dropZone.className = 'nf-asset-panel__dropzone';
    dropZone.textContent = 'Drop images or sounds here to load or hot-reload an asset';
    container.appendChild(dropZone);

    const list = document.createElement('ul');
    list.className = 'nf-asset-panel__list';
    for (const [id, entry] of this._entries) {
      list.appendChild(entry.kind === 'texture' ? this._buildTextureItem(id, entry) : this._buildSoundItem(id, entry));
    }
    container.appendChild(list);
  }

  /**
   * @param {string} id
   * @param {{ url: string, kind: 'texture' | 'sound' }} entry
   * @returns {HTMLElement}
   * @private
   */
  _buildTextureItem(id, entry) {
    const item = document.createElement('li');
    item.className = 'nf-asset-panel__item';

    const thumb = document.createElement('img');
    thumb.className = 'nf-asset-panel__thumb';
    thumb.src = entry.url;
    thumb.alt = id;

    const label = document.createElement('span');
    label.textContent = id;

    item.append(thumb, label);
    return item;
  }

  /**
   * @param {string} id
   * @param {{ url: string, kind: 'texture' | 'sound' }} entry
   * @returns {HTMLElement}
   * @private
   */
  _buildSoundItem(id, entry) {
    void entry;

    const item = document.createElement('li');
    item.className = 'nf-asset-panel__item nf-asset-panel__item--sound';

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'nf-asset-panel__thumb nf-asset-panel__sound-icon';
    playButton.textContent = '♪';
    playButton.title = `Preview "${id}"`;
    playButton.addEventListener('click', () => this.audio?.play(id));

    const label = document.createElement('span');
    label.textContent = id;

    item.append(playButton, label);
    return item;
  }

  /** Revoke every object URL and remove listeners. @returns {void} */
  dispose() {
    for (const entry of this._entries.values()) URL.revokeObjectURL(entry.url);
    this._entries.clear();
    this.container.removeEventListener('drop', this._onDrop);
    this.container.removeEventListener('dragover', this._onDragOver);
  }
}

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not decode image at ${url}`));
    image.src = url;
  });
}
