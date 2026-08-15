import { Vec2 } from '@novaforge/math';
import { TimelinePlayer } from '@novaforge/animation';
import { setKeyframeCommand } from './timeline-commands.js';

/**
 * The keyframe timeline panel (SPEC §12 / Milestone 7): scrub, insert a keyframe at the
 * playhead, click a keyframe marker to jump to it.
 *
 * Shows the **selected entity's** `TimelinePlayer`. An entity with no `TimelinePlayer`, or one
 * whose `timeline` is unset, gets a plain placeholder rather than an empty grid — there is
 * nothing useful to scrub for either case, and pretending otherwise would just be a confusing
 * empty panel with no explanation.
 *
 * **Capturing a keyframe.** The "+" button on a track reads the entity's *current, live* value
 * for that track's field and inserts a keyframe at the playhead holding it — the standard
 * "record" keyframing gesture. The value is deep-copied at capture time
 * (`new Vec2(...)` for a `'vec2'` field, `JSON.parse(JSON.stringify(...))` otherwise): the
 * keyframe must own an independent value, because `player.js`'s sampler applies it directly
 * to the live component every frame `timelineSystem` runs, and taking a live reference instead
 * would let a later in-place mutation of the component (`.set()` on its `Vec2`, for instance)
 * silently corrupt the authored keyframe alongside it.
 */
export class TimelinePanel {
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

    this.container.classList.add('nf-timeline');

    /** @private */
    this._unsubscribeSelection = selection.onChange(() => this.refresh());
  }

  /** Re-render for whichever entity is currently selected. @returns {void} */
  refresh() {
    const container = this.container;
    container.replaceChildren();

    const entity = this.selection.entity;
    if (entity === null || !this.world.isAlive(entity)) {
      this._empty('No entity selected.');
      return;
    }

    const player = this.world.get(entity, TimelinePlayer);
    if (player === undefined) {
      this._empty('Selected entity has no TimelinePlayer.');
      return;
    }
    if (player.timeline === null) {
      this._empty('TimelinePlayer has no timeline assigned.');
      return;
    }

    this._renderPlayer(entity, player);
  }

  /**
   * @param {string} message
   * @private
   */
  _empty(message) {
    const p = document.createElement('p');
    p.className = 'nf-timeline__empty';
    p.textContent = message;
    this.container.appendChild(p);
  }

  /**
   * @param {number} entity
   * @param {any} player a TimelinePlayer instance
   * @private
   */
  _renderPlayer(entity, player) {
    const timeline = player.timeline;

    const header = document.createElement('div');
    header.className = 'nf-timeline__header';

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'nf-button nf-button--small';
    playButton.textContent = player.playing ? '⏸' : '▶';
    playButton.addEventListener('click', () => {
      player.playing = !player.playing;
      this.refresh();
    });

    const label = document.createElement('span');
    label.className = 'nf-timeline__label';
    label.textContent = `${timeline.name} — ${player.time.toFixed(2)}s / ${timeline.duration.toFixed(2)}s`;

    header.append(playButton, label);
    this.container.appendChild(header);

    const scrubber = document.createElement('input');
    scrubber.type = 'range';
    scrubber.className = 'nf-timeline__scrubber';
    scrubber.min = '0';
    scrubber.max = String(Math.max(timeline.duration, 0.001));
    scrubber.step = '0.01';
    scrubber.value = String(player.time);
    scrubber.addEventListener('input', () => {
      player.playing = false;
      player.time = Number(scrubber.value);
      label.textContent = `${timeline.name} — ${player.time.toFixed(2)}s / ${timeline.duration.toFixed(2)}s`;
    });
    this.container.appendChild(scrubber);

    const tracks = document.createElement('div');
    tracks.className = 'nf-timeline__tracks';
    for (const track of timeline.tracks) {
      tracks.appendChild(this._buildTrackRow(entity, player, track));
    }
    this.container.appendChild(tracks);
  }

  /**
   * @param {number} entity
   * @param {any} player
   * @param {import('@novaforge/animation').KeyframeTrack} track
   * @returns {HTMLElement}
   * @private
   */
  _buildTrackRow(entity, player, track) {
    const timeline = /** @type {import('@novaforge/animation').Timeline} */ (player.timeline);
    const duration = Math.max(timeline.duration, 0.001);

    const row = document.createElement('div');
    row.className = 'nf-timeline__track';

    const label = document.createElement('span');
    label.className = 'nf-timeline__track-label';
    label.textContent = `${track.component.name}.${track.field}`;
    row.appendChild(label);

    const strip = document.createElement('div');
    strip.className = 'nf-timeline__strip';

    for (const keyframe of track.keyframes) {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'nf-timeline__keyframe';
      marker.style.left = `${(keyframe.time / duration) * 100}%`;
      marker.title = `t=${keyframe.time.toFixed(2)}`;
      marker.addEventListener('click', () => {
        player.time = keyframe.time;
        player.playing = false;
        this.refresh();
      });
      strip.appendChild(marker);
    }
    row.appendChild(strip);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'nf-button nf-button--small nf-timeline__add-keyframe';
    addButton.textContent = '+';
    addButton.title = 'Insert a keyframe at the playhead from the current value';
    addButton.addEventListener('click', () => {
      const component = this.world.get(entity, track.component);
      if (component === undefined) return;
      const value = captureFieldValue(track.component, track.field, component[track.field]);
      this.commandStack.execute(setKeyframeCommand(track, player.time, value));
      this.refresh();
    });
    row.appendChild(addButton);

    return row;
  }

  /** Release the selection subscription. @returns {void} */
  dispose() {
    this._unsubscribeSelection();
  }
}

/**
 * Deep-copy a field's current value for storage as an independent keyframe — see the class doc
 * for why a live reference would be a bug.
 * @param {import('@novaforge/core').ComponentType} component
 * @param {string} field
 * @param {any} value
 * @returns {any}
 */
function captureFieldValue(component, field, value) {
  const fieldType = component.schema?.[field]?.type;
  if (fieldType === 'vec2') return new Vec2(value.x, value.y);
  return JSON.parse(JSON.stringify(value));
}
