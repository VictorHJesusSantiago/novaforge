/**
 * Event channels.
 *
 * Two delivery models, because the engine genuinely needs both:
 *
 * - **Buffered** (`emit` / `read`) — double-buffered and swapped once per frame in `preUpdate`.
 *   An event emitted during frame N is readable by every system during frame N+1, in a stable
 *   order, whether that system runs before or after the emitter. This is the default, and it is
 *   what keeps system ordering from silently changing which events a system sees.
 *
 * - **Immediate** (`subscribe` / `publish`) — synchronous callbacks, for engine-internal
 *   plumbing where deferring by a frame would be wrong (a scene teardown hook, an asset finishing
 *   its load).
 *
 * Gameplay should use the buffered path. Reaching for the immediate one reintroduces exactly
 * the ordering coupling the buffer exists to remove.
 */
export class EventBus {
  constructor() {
    /**
     * Events readable this frame.
     * @type {Map<string, any[]>}
     * @private
     */
    this._read = new Map();

    /**
     * Events being written this frame, readable next frame.
     * @type {Map<string, any[]>}
     * @private
     */
    this._write = new Map();

    /**
     * @type {Map<string, Set<(payload: any) => void>>}
     * @private
     */
    this._listeners = new Map();

    /**
     * Guard against a channel growing without bound when nothing ever reads it — a typo in a
     * channel name would otherwise leak memory for the lifetime of the session.
     * @type {number}
     */
    this.maxEventsPerChannel = 10000;

    /** @type {Set<string>} @private */
    this._overflowWarned = new Set();
  }

  /**
   * Queue an event for next frame's readers.
   * @param {string} channel
   * @param {any} [payload]
   * @returns {void}
   */
  emit(channel, payload) {
    let queue = this._write.get(channel);
    if (queue === undefined) {
      queue = [];
      this._write.set(channel, queue);
    }
    if (queue.length >= this.maxEventsPerChannel) {
      if (!this._overflowWarned.has(channel)) {
        this._overflowWarned.add(channel);
        console.warn(
          `EventBus: channel "${channel}" exceeded ${this.maxEventsPerChannel} events in one ` +
            'frame; dropping the surplus. Is anything reading it?',
        );
      }
      return;
    }
    queue.push(payload);
  }

  /**
   * @param {string} channel
   * @returns {readonly any[]} this frame's events. Empty array when there are none, never
   *   `undefined`, so callers can iterate without a guard.
   */
  read(channel) {
    return this._read.get(channel) ?? EMPTY;
  }

  /**
   * @param {string} channel
   * @returns {number}
   */
  count(channel) {
    return this._read.get(channel)?.length ?? 0;
  }

  /**
   * Promote this frame's writes to next frame's reads. Called once per frame by the runtime,
   * at the top of `preUpdate`.
   * @returns {void}
   */
  swap() {
    // Reuse the outgoing read buffers as the new write buffers instead of allocating fresh
    // arrays every frame.
    for (const queue of this._read.values()) queue.length = 0;
    const previousRead = this._read;
    this._read = this._write;
    this._write = previousRead;

    // Channels that exist in write but not in read would otherwise be dropped on the swap.
    for (const channel of this._read.keys()) {
      if (!this._write.has(channel)) this._write.set(channel, []);
    }
    this._overflowWarned.clear();
  }

  /**
   * Subscribe to synchronous delivery.
   * @param {string} channel
   * @param {(payload: any) => void} handler
   * @returns {() => void} an unsubscribe function.
   */
  subscribe(channel, handler) {
    let handlers = this._listeners.get(channel);
    if (handlers === undefined) {
      handlers = new Set();
      this._listeners.set(channel, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  /**
   * Deliver synchronously to subscribers. Does not touch the buffered channels.
   *
   * A throwing handler is caught and logged rather than allowed to abort the remaining
   * handlers — one broken listener should not take down the frame.
   *
   * @param {string} channel
   * @param {any} [payload]
   * @returns {number} how many handlers ran.
   */
  publish(channel, payload) {
    const handlers = this._listeners.get(channel);
    if (handlers === undefined) return 0;
    let delivered = 0;
    for (const handler of handlers) {
      try {
        handler(payload);
        delivered += 1;
      } catch (error) {
        console.error(`EventBus: handler for "${channel}" threw`, error);
      }
    }
    return delivered;
  }

  /**
   * @returns {string[]} channels holding readable events this frame.
   */
  activeChannels() {
    /** @type {string[]} */
    const active = [];
    for (const [channel, queue] of this._read) {
      if (queue.length > 0) active.push(channel);
    }
    return active;
  }

  /** Drop every buffered event and every subscriber. */
  clear() {
    this._read.clear();
    this._write.clear();
    this._listeners.clear();
    this._overflowWarned.clear();
  }
}

/**
 * Shared empty array so `read()` on an idle channel allocates nothing.
 * @type {any[]}
 */
const EMPTY = [];
