/**
 * @novaforge/input — device sampling and action mapping.
 *
 * Gameplay code reads **actions**, not keys (SPEC §10). `input.pressed('jump')` survives
 * rebinding, gamepad support, and a second local player; `input.pressed('Space')` does not.
 */

export { InputManager, INPUT_RESOURCE } from './input-manager.js';
export { ActionMap } from './action-map.js';
export { MouseButton } from './mouse.js';
export { installInputSystems } from './systems.js';
