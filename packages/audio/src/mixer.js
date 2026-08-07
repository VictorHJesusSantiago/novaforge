import { clamp } from '@novaforge/math';
import { Bus } from './bus.js';

/** Resource key under which the world's `AudioMixer` is registered. */
export const AUDIO_RESOURCE = 'audio';

/**
 * Sound playback through Web Audio.
 *
 * **Degrades rather than throws.** Every browser blocks audio until the user has interacted with
 * the page, `AudioContext` does not exist in Node, and a decode can fail on a corrupt file. In
 * all three cases the mixer keeps a complete, queryable model of what *would* be playing and
 * simply produces no sound. A game that crashes on a missing sound effect is unshippable, and a
 * mixer that cannot be constructed headlessly is untestable — this handles both with one design.
 */
export class AudioMixer {
  /**
   * @param {object} [options]
   * @param {AudioContext | null} [options.context] pass `null` to force silent mode
   * @param {string[]} [options.buses] bus names to create up front
   */
  constructor(options = {}) {
    /**
     * @type {AudioContext | null}
     */
    this.context = options.context !== undefined ? options.context : createContext();

    /** @type {Map<string, Bus>} @private */
    this._buses = new Map();

    /** @type {number} @private */
    this._masterVolume = 1;

    /** @type {boolean} */
    this.muted = false;

    /** @type {GainNode | null} @private */
    this._masterNode = null;

    /** @type {Map<string, AudioBuffer>} @private */
    this._sounds = new Map();

    /**
     * Currently playing voices, keyed by a monotonic id so a caller can stop a specific one.
     * @type {Map<number, { id: string, bus: string, loop: boolean, source: AudioBufferSourceNode | null, gain: GainNode | null }>}
     * @private
     */
    this._voices = new Map();

    /** @type {number} @private */
    this._nextVoiceId = 1;

    /** @type {Set<string>} @private */
    this._warned = new Set();

    /**
     * Cap on simultaneous voices. An explosion that spawns 200 identical sounds in one frame
     * is both inaudible as anything but clipping and a real performance problem.
     * @type {number}
     */
    this.maxVoices = 32;

    if (this.context !== null) {
      this._masterNode = this.context.createGain();
      this._masterNode.connect(this.context.destination);
    }

    for (const name of options.buses ?? ['sfx', 'music', 'ui']) {
      this.createBus(name);
    }
  }

  /** @returns {boolean} true when actually able to produce sound. */
  get isAudible() {
    return this.context !== null;
  }

  /** @returns {number} */
  get masterVolume() {
    return this._masterVolume;
  }

  /** @param {number} value */
  set masterVolume(value) {
    this._masterVolume = clamp(value, 0, 1);
    if (this._masterNode !== null) {
      this._masterNode.gain.value = this.muted ? 0 : this._masterVolume;
    }
  }

  /**
   * @param {boolean} muted
   * @returns {void}
   */
  setMuted(muted) {
    this.muted = muted;
    this.masterVolume = this._masterVolume; // re-apply through the setter
  }

  /**
   * @param {string} name
   * @param {number} [volume]
   * @returns {Bus}
   */
  createBus(name, volume = 1) {
    const existing = this._buses.get(name);
    if (existing !== undefined) return existing;

    const bus = new Bus(name, volume);
    if (this.context !== null && this._masterNode !== null) {
      bus.node = this.context.createGain();
      bus.node.gain.value = bus.effectiveVolume();
      bus.node.connect(this._masterNode);
    }
    this._buses.set(name, bus);
    return bus;
  }

  /**
   * @param {string} name
   * @returns {Bus} the named bus, creating it if it does not exist.
   *   Creating on demand rather than throwing: a typo'd bus name should mis-route the sound,
   *   not kill the frame it was triggered on.
   */
  bus(name) {
    return this._buses.get(name) ?? this.createBus(name);
  }

  /** @returns {string[]} */
  busNames() {
    return Array.from(this._buses.keys());
  }

  /**
   * Fetch and decode a sound, registering it under `id`.
   *
   * Resolves rather than rejects on failure, so one bad path does not fail a scene's whole
   * `Promise.all` preload.
   *
   * @param {string} id
   * @param {string} url
   * @returns {Promise<boolean>} whether the sound is now playable.
   */
  async load(id, url) {
    if (this.context === null) return false;
    if (this._sounds.has(id)) return true;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(bytes);
      this._sounds.set(id, buffer);
      return true;
    } catch (error) {
      console.warn(`AudioMixer: failed to load "${id}" from ${url}`, error);
      return false;
    }
  }

  /**
   * @param {Record<string, string>} manifest id to URL
   * @returns {Promise<void>}
   */
  async loadAll(manifest) {
    await Promise.all(Object.entries(manifest).map(([id, url]) => this.load(id, url)));
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._sounds.has(id);
  }

  /**
   * Play a sound.
   *
   * @param {string} id
   * @param {object} [options]
   * @param {number} [options.volume] 0 to 1
   * @param {string} [options.bus] defaults to `sfx`
   * @param {boolean} [options.loop]
   * @param {number} [options.rate] playback rate; 2 is an octave up
   * @returns {number} a voice id for {@link stop}, or `0` when nothing was played.
   */
  play(id, options = {}) {
    const busName = options.bus ?? 'sfx';
    const bus = this.bus(busName);
    const loop = options.loop ?? false;
    const volume = clamp(options.volume ?? 1, 0, 1);

    if (this._voices.size >= this.maxVoices) {
      // Dropping the newest is the right choice: the already-playing sounds are the ones the
      // player has begun to hear, and cutting one off is more noticeable than never starting
      // the two hundredth copy of an explosion.
      return 0;
    }

    const voiceId = this._nextVoiceId;
    this._nextVoiceId += 1;

    if (this.context === null) {
      // Silent mode still models the voice, so tests and the debug overlay see the truth.
      this._voices.set(voiceId, { id, bus: busName, loop, source: null, gain: null });
      if (!loop) this._voices.delete(voiceId);
      return voiceId;
    }

    const buffer = this._sounds.get(id);
    if (buffer === undefined) {
      if (!this._warned.has(id)) {
        this._warned.add(id);
        console.warn(`AudioMixer: "${id}" was never loaded; playing silence`);
      }
      return 0;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = options.rate ?? 1;

    const gain = this.context.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(bus.node ?? /** @type {GainNode} */ (this._masterNode));

    source.onended = () => {
      this._voices.delete(voiceId);
    };
    source.start();

    this._voices.set(voiceId, { id, bus: busName, loop, source, gain });
    return voiceId;
  }

  /**
   * @param {number} voiceId
   * @returns {boolean} true if a voice was stopped.
   */
  stop(voiceId) {
    const voice = this._voices.get(voiceId);
    if (voice === undefined) return false;

    // A source already ended throws on stop(); it is not an error worth propagating.
    try {
      voice.source?.stop();
    } catch {
      /* already stopped */
    }
    this._voices.delete(voiceId);
    return true;
  }

  /**
   * Stop every voice playing a given sound id.
   * @param {string} id
   * @returns {number} how many were stopped.
   */
  stopAllOf(id) {
    let stopped = 0;
    for (const [voiceId, voice] of Array.from(this._voices)) {
      if (voice.id === id && this.stop(voiceId)) stopped += 1;
    }
    return stopped;
  }

  /** Stop everything. @returns {number} how many voices were stopped. */
  stopAll() {
    const count = this._voices.size;
    for (const voiceId of Array.from(this._voices.keys())) this.stop(voiceId);
    return count;
  }

  /** @returns {number} voices currently playing. */
  get voiceCount() {
    return this._voices.size;
  }

  /**
   * Resume the audio context.
   *
   * Browsers start it suspended until the user interacts with the page, so this must be called
   * from a click or key handler. Calling it before then is harmless and does nothing.
   * @returns {Promise<void>}
   */
  async resume() {
    if (this.context !== null && this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  /** Release the audio context. @returns {void} */
  dispose() {
    this.stopAll();
    this.context?.close();
    this.context = null;
    this._masterNode = null;
  }
}

/**
 * @returns {AudioContext | null} a context, or `null` where Web Audio is unavailable —
 *   Node, an old browser, or a locked-down embed.
 */
function createContext() {
  const Ctor = /** @type {any} */ (globalThis).AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
  if (Ctor === undefined) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}
