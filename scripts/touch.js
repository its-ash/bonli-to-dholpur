// =============================================
// TOUCH CONTROLS - on-screen driving pad for phones and tablets
// The pad is only built when the device has a touch screen (or a coarse
// pointer), so desktop players only see the keyboard hints.
// =============================================

import { setKey, releaseAllKeys } from './input.js';

/**
 * True when the device looks touch-first (phone / tablet).
 * @returns {boolean}
 */
export function isTouchDevice() {
    if (typeof window === 'undefined') return false;

    const coarse = typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;

    const touchPoints = (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0;

    return Boolean(coarse || touchPoints > 0);
}

/**
 * Builds one blocky on-screen button that maps to a driving action.
 * Pointer events (not click) are used so holding the button keeps driving,
 * and pointer capture means a finger that slides off still releases cleanly.
 *
 * @param {HTMLElement} parent
 * @param {string} label
 * @param {string} action - 'forward' | 'backward' | 'left' | 'right'
 * @param {string} hint
 * @param {Function} onManualInput - called on every press
 * @returns {HTMLElement}
 */
function createPadButton(parent, label, action, hint, onManualInput) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `pad-${action}`;
    button.setAttribute('aria-label', hint);
    button.textContent = label;
    button.style.cssText = `
        width: 68px;
        height: 68px;
        background: #262633;
        color: #FFD700;
        border: 4px solid #FFD700;
        box-shadow: 4px 4px 0 #000000;
        font-family: 'Courier New', ui-monospace, monospace;
        font-size: 22px;
        font-weight: bold;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        image-rendering: pixelated;
    `;

    const press = (event) => {
        if (event.cancelable) event.preventDefault();
        setKey(action, true);
        onManualInput();
        button.style.background = '#FFD700';
        button.style.color = '#16161F';
        if (button.setPointerCapture && event.pointerId !== undefined) {
            try {
                button.setPointerCapture(event.pointerId);
            } catch (e) {
                // Pointer capture is a nicety, not a requirement
            }
        }
    };

    const release = (event) => {
        if (event && event.cancelable) event.preventDefault();
        setKey(action, false);
        button.style.background = '#262633';
        button.style.color = '#FFD700';
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);

    // Some older mobile browsers only fire touch events
    button.addEventListener('touchstart', press, { passive: false });
    button.addEventListener('touchend', release);
    button.addEventListener('touchcancel', release);

    parent.appendChild(button);
    return button;
}

/**
 * Creates the touch pad (call only on touch devices).
 * Layout: a D-pad of steering buttons on the left, throttle/brake on the right.
 *
 * @param {Function} [onManualInput] - called when the player touches the pad,
 *        so the game can hand control back from the autopilot
 * @returns {{pad: HTMLElement, buttons: Object}}
 */
export function createTouchControls(onManualInput) {
    const notify = typeof onManualInput === 'function' ? onManualInput : () => {};

    const pad = document.createElement('div');
    pad.id = 'touch-controls';
    pad.style.cssText = `
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 12px;
        z-index: 150;
        pointer-events: none;
    `;

    // --- Steering cluster (left) ---
    const steer = document.createElement('div');
    steer.style.cssText = 'display: flex; gap: 10px; pointer-events: none;';

    const left = createPadButton(steer, '◀', 'left', 'Steer left', notify);
    const right = createPadButton(steer, '▶', 'right', 'Steer right', notify);
    pad.appendChild(steer);

    // --- Throttle cluster (right) ---
    const throttle = document.createElement('div');
    throttle.style.cssText = 'display: flex; gap: 10px; pointer-events: none;';

    const back = createPadButton(throttle, '▼', 'backward', 'Brake / reverse', notify);
    const forward = createPadButton(throttle, '▲', 'forward', 'Accelerate', notify);
    pad.appendChild(throttle);

    document.body.appendChild(pad);

    const buttons = { left, right, forward, backward: back };

    // A finger lifted anywhere must not leave a key held down
    window.addEventListener('blur', () => releaseAllKeys());
    window.addEventListener('pointerup', () => {
        [buttons.left, buttons.right, buttons.forward, buttons.backward].forEach(button => {
            button.style.background = '#262633';
            button.style.color = '#FFD700';
        });
        releaseAllKeys();
    });

    return { pad, buttons };
}
