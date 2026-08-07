/**
 * @novaforge/audio — a small Web Audio mixer.
 *
 * Sounds are addressed by id and routed through named **buses** (`sfx`, `music`, `ui`), each with
 * its own volume, all feeding a master. That is the minimum structure a game needs to give the
 * player separate music and effects sliders, and retrofitting it later means touching every
 * `play()` call in the codebase.
 */

export { AudioMixer, AUDIO_RESOURCE } from './mixer.js';
export { Bus } from './bus.js';
