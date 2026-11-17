// =============================================
// TOUCH CONTROLS - on-screen driving pad for phones and tablets
// The pad is only built when the device has a touch screen (or a coarse
// pointer), so desktop players only see the keyboard hints.
// =============================================

import { setKey, releaseAllKeys, getKeys, toggleIndicator, toggleHeadlights } from './input.js';

/**
 * True when the device looks touch-first (phone / tablet).
 * @returns {boolean}
 */
export function isTouchDevice() {
    if (typeof window === 'undefined') return false;

    // ?touch=1 / ?touch=0 forces the phone or desktop layout (handy for testing)
    const search = (window.location && window.location.search) || '';
    const forced = /[?&]touch=([01])/.exec(search);
    if (forced) return forced[1] === '1';

    const coarse = typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;

    const touchPoints = (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0;

    return Boolean(coarse || touchPoints > 0);
}

// Pastel accents per pad button, and the idle (unpressed) fill
const PAD_COLORS = {
    left: '#BEE1FA', right: '#BEE1FA', backward: '#FFC9B5', forward: '#B9EBD3'
};
const PAD_IDLE = 'rgba(255, 250, 244, 0.78)';

/**
 * Builds one rounded on-screen button that maps to a driving action.
 * Pointer events (not click) are used so holding the button keeps driving,
 * and pointer capture means a finger that slides off still releases cleanly.
 *
 * @param {HTMLElement} parent
 * @param {string} label
 * @param {string} action - 'forward' | 'backward' | 'left' | 'right'
 * @param {string} hint
 * @param {Function} onManualInput - called on every press
 * @param {{tall?: boolean}} [options] - tall: the accelerator pedal
 * @returns {HTMLElement}
 */
function createPadButton(parent, label, action, hint, onManualInput, { tall = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `pad-${action}`;
    button.className = 'touch-pad-button';
    button.setAttribute('aria-label', hint);
    button.textContent = label;
    const accent = PAD_COLORS[action] || '#C9B6F0';
    button.style.cssText = `
        width: var(--pad-size, 68px);
        height: ${tall ? 'calc(var(--pad-size, 68px) * 1.3)' : 'var(--pad-size, 68px)'};
        background: ${PAD_IDLE};
        color: #5B4B6B;
        border: 4px solid ${accent};
        border-radius: 22px;
        box-shadow: 0 5px 14px rgba(91, 75, 107, 0.3);
        font-family: inherit;
        font-size: 24px;
        font-weight: bold;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
    `;

    const paint = (down) => {
        button.style.background = down ? accent : PAD_IDLE;
        button.style.transform = down ? 'scale(0.94)' : '';
    };

    const press = (event) => {
        if (event && event.cancelable) event.preventDefault();
        setKey(action, true);
        onManualInput();
        paint(true);
        if (event && button.setPointerCapture && event.pointerId !== undefined) {
            try {
                button.setPointerCapture(event.pointerId);
            } catch (e) {
                // Pointer capture is a nicety, not a requirement
            }
        }
    };

    // Only this button's own finger releases it, so holding the accelerator
    // while tapping the steering buttons keeps the bus going
    const release = (event) => {
        if (event && event.cancelable) event.preventDefault();
        setKey(action, false);
        paint(false);
    };
    button.resetPad = () => paint(false);

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
        padding: 10px calc(10px + env(safe-area-inset-right, 0px))
                 calc(10px + env(safe-area-inset-bottom, 0px)) calc(10px + env(safe-area-inset-left, 0px));
        z-index: 150;
        pointer-events: none;
        --pad-size: clamp(58px, 16vmin, 80px);
    `;

    // --- Steering cluster (left thumb) ---
    const steer = document.createElement('div');
    steer.id = 'touch-steer';
    steer.style.cssText = 'display: flex; gap: 10px; align-items: flex-end; pointer-events: none;';

    const left = createPadButton(steer, '◀', 'left', 'Steer left', notify);
    const right = createPadButton(steer, '▶', 'right', 'Steer right', notify);
    pad.appendChild(steer);

    // --- Pedals (right thumb): brake, then a taller accelerator ---
    const throttle = document.createElement('div');
    throttle.id = 'touch-pedals';
    throttle.style.cssText = 'display: flex; gap: 10px; align-items: flex-end; pointer-events: none;';

    const back = createPadButton(throttle, 'BRAKE', 'backward', 'Brake / reverse', notify);
    back.style.fontSize = '13px';
    const forward = createPadButton(throttle, '▲', 'forward', 'Accelerate', notify, { tall: true });
    pad.appendChild(throttle);

    document.body.appendChild(pad);

    const buttons = { left, right, forward, backward: back };
    const releaseAll = () => {
        Object.values(buttons).forEach(button => button.resetPad());
        releaseAllKeys();
    };

    // Leaving the page (app switch, notification, lock) must not leave a key held
    window.addEventListener('blur', releaseAll);
    if (typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) releaseAll();
        });
    }

    return { pad, buttons, releaseAll };
}

/**
 * Builds the small on-screen switches for phones: indicators, headlights,
 * handbrake (hold) and camera. They sit above the pedals on the right edge
 * (a column in portrait, a row in landscape - see the mobile stylesheet in
 * hud.js), so the driving view stays clear.
 *
 * @param {{onManualInput?: Function, onCamera?: Function, bottom?: number}} [options]
 * @returns {{root: HTMLElement, buttons: Object}}
 */
export function createTouchSwitches({ onManualInput, onCamera, bottom = 210 } = {}) {
    const notify = typeof onManualInput === 'function' ? onManualInput : () => {};

    const root = document.createElement('div');
    root.id = 'touch-switches';
    root.style.cssText = `
        position: fixed; right: calc(8px + env(safe-area-inset-right, 0px)); bottom: ${bottom}px; z-index: 150;
        display: flex; flex-direction: column; gap: 8px; pointer-events: none;
    `;

    const style = (button, on) => {
        button.style.background = on ? '#FFE29A' : 'rgba(255, 250, 244, 0.92)';
        button.style.borderColor = on ? '#F0B429' : '#C9B6F0';
    };

    const make = (id, label, hint) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.textContent = label;
        button.setAttribute('aria-label', hint);
        button.style.cssText = `
            width: 46px; height: 46px; border-radius: 50%; border: 3px solid #C9B6F0;
            background: rgba(255, 250, 244, 0.92); color: #5B4B6B; font-size: 18px;
            font-weight: bold; font-family: inherit; padding: 0; line-height: 1;
            box-shadow: 0 3px 10px rgba(91, 75, 107, 0.3); pointer-events: auto;
            touch-action: manipulation; user-select: none; -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        `;
        root.appendChild(button);
        return button;
    };

    const left = make('switch-left', '◀', 'Left indicator');
    const right = make('switch-right', '▶', 'Right indicator');
    const lights = make('switch-lights', '☀', 'Headlights');
    const handbrake = make('switch-handbrake', 'P', 'Handbrake (hold)');
    const camera = make('switch-camera', '▣', 'Change camera');

    const tap = (button, fn) => {
        const handler = (event) => {
            if (event.cancelable) event.preventDefault();
            fn();
        };
        button.addEventListener('click', handler);
    };

    tap(left, () => { toggleIndicator('left'); style(left, getKeys().indicatorLeft); style(right, false); });
    tap(right, () => { toggleIndicator('right'); style(right, getKeys().indicatorRight); style(left, false); });
    tap(lights, () => { toggleHeadlights(); style(lights, getKeys().headlights); });
    tap(camera, () => { if (typeof onCamera === 'function') onCamera(); });

    // The handbrake is held, like the pedals
    const hold = (event) => {
        if (event.cancelable) event.preventDefault();
        notify();
        setKey('handbrake', true);
        style(handbrake, true);
    };
    const drop = () => { setKey('handbrake', false); style(handbrake, false); };
    handbrake.addEventListener('pointerdown', hold);
    handbrake.addEventListener('pointerup', drop);
    handbrake.addEventListener('pointercancel', drop);
    handbrake.addEventListener('pointerleave', drop);

    document.body.appendChild(root);
    return { root, buttons: { left, right, lights, handbrake, camera } };
}
