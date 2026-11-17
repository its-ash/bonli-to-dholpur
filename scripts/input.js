// =============================================
// INPUT HANDLING
// Keyboard plus an API for the on-screen mobile pad and the autopilot.
// =============================================

// `steer` is an analog axis (-1 = full right, +1 = full left) written by the
// autopilot; the keyboard and the touch pad only use the digital left/right.
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    steer: 0,
    // Held while the key / button is down
    handbrake: false,
    // Switches that stay on until toggled (not cleared by releaseAllKeys)
    indicatorLeft: false,
    indicatorRight: false,
    headlights: false
};

// One-shot actions (camera cycle) are delivered to a listener set by main.js
let actionHandler = null;
export function setActionHandler(fn) {
    actionHandler = typeof fn === 'function' ? fn : null;
}

/** Left indicator on/off (cancels the right one). */
export function toggleIndicator(side) {
    if (side === 'left') {
        keys.indicatorLeft = !keys.indicatorLeft;
        keys.indicatorRight = false;
    } else {
        keys.indicatorRight = !keys.indicatorRight;
        keys.indicatorLeft = false;
    }
}

export function toggleHeadlights() {
    keys.headlights = !keys.headlights;
}

/** Asks the game to run a one-shot action ('camera'). */
export function triggerAction(name) {
    if (actionHandler) actionHandler(name);
}

const keyMap = {
    'KeyW': 'forward',
    'ArrowUp': 'forward',
    'KeyS': 'backward',
    'ArrowDown': 'backward',
    'KeyA': 'left',
    'ArrowLeft': 'left',
    'KeyD': 'right',
    'ArrowRight': 'right',
    'Space': 'handbrake'
};

// Every code that counts as "the player is driving" (used to cancel autopilot)
export const DRIVING_KEY_CODES = Object.keys(keyMap);

export function initInput() {
    window.addEventListener('keydown', (e) => {
        const action = keyMap[e.code];
        if (action) {
            keys[action] = true;
            if (e.code.startsWith('Arrow') || e.code === 'Space') {
                e.preventDefault();
            }
            return;
        }

        // Driver's switches: Q / E indicators, L headlights, C camera
        if (e.repeat) return;
        if (e.target && e.target.tagName === 'BUTTON') return;
        if (e.code === 'KeyQ') toggleIndicator('left');
        else if (e.code === 'KeyE') toggleIndicator('right');
        else if (e.code === 'KeyL') toggleHeadlights();
        else if (e.code === 'KeyC') triggerAction('camera');
    });

    window.addEventListener('keyup', (e) => {
        const action = keyMap[e.code];
        if (action) {
            keys[action] = false;
        }
    });

    // A window that loses focus must not leave a key stuck down
    window.addEventListener('blur', () => releaseAllKeys());
}

export function getKeys() {
    return keys;
}

/**
 * Presses or releases a driving key programmatically.
 * Used by the mobile pad and by the autopilot.
 * @param {'forward'|'backward'|'left'|'right'} action
 * @param {boolean} value
 */
export function setKey(action, value) {
    if (action in keys) {
        keys[action] = Boolean(value);
    }
}

/**
 * Sets the analog steering axis (used by the autopilot).
 * @param {number} value - -1 (full right) to +1 (full left)
 */
export function setSteer(value) {
    const next = Number(value);
    keys.steer = Number.isFinite(next) ? Math.max(-1, Math.min(1, next)) : 0;
}

/**
 * Releases every driving key (window blur, touch end, autopilot handoff)
 */
export function releaseAllKeys() {
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
    keys.handbrake = false;
    keys.steer = 0;
}
