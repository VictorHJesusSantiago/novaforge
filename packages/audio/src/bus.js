import { clamp } from '@novaforge/math';

/**
 * A named volume group.
 *
 * The effective volume of a sound is `master × bus × sound`, so a player muting music does not
 * disturb per-sound mixing, and a duck effect on the music bus does not need to touch every
 * playing source.
 */
export class Bus {
  /**
   * @param {string} name
   * @param {number} [volume] 0 to 1
   */
  constructor(name, volume = 1) {
    /** @type {string} */
    this.name = name;

    /** @type {number} @private */
    this._volume = clamp(volume, 0, 1);

    /** @type {boolean} */
    this.muted = false;

    /**
     * The Web Audio node this bus owns, or `null` when running without an audio context.
     * @type {GainNode | null}
     */
    this.node = null;
  }

  /** @returns {number} */
  get volume() {
    return this._volume;
  }

  /**
   * @param {number} value clamped to [0, 1]
   */
  set volume(value) {
    this._volume = clamp(value, 0, 1);
    this._apply();
  }

  /**
   * @returns {number} the volume actually applied, accounting for mute.
   */
  effectiveVolume() {
    return this.muted ? 0 : this._volume;
  }

  /**
   * @param {boolean} muted
   * @returns {void}
   */
  setMuted(muted) {
    this.muted = muted;
    this._apply();
  }

  /** @private */
  _apply() {
    if (this.node !== null) {
      this.node.gain.value = this.effectiveVolume();
    }
  }
}
