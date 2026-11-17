// =============================================
// HUD SYSTEM (pastel, rounded, friendly)
// =============================================

import { ROUTE } from './constants.js';

// Pastel palette shared by every panel
const INK = '#5B4B6B';
const INK_SOFT = '#8E7FA0';
const PANEL = 'rgba(255, 250, 244, 0.94)';
const MINT = '#8FD9B6';
const SKY = '#8EC5F0';
const PEACH = '#FFC9A8';
const PINK = '#FFB8D0';
const BUTTER = '#FFE29A';
const LILAC = '#C9B6F0';
const FONT = "'Trebuchet MS', 'Segoe UI', system-ui, -apple-system, sans-serif";

/**
 * Small helper: creates an element with an id, inline style and text.
 * @param {string} tag
 * @param {{id?: string, css?: string, text?: string}} [options]
 * @returns {HTMLElement}
 */
function makeElement(tag, { id = '', css = '', text = '' } = {}) {
    const element = document.createElement(tag);
    if (id) element.id = id;
    if (css) element.style.cssText = css;
    if (text) element.textContent = text;
    return element;
}

/**
 * Writes text only when it changed, so the HUD does not re-layout every frame.
 */
function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
}

/**
 * Sets a text colour only when it changed.
 */
function setColor(element, color) {
    if (element.dataset && element.dataset.color === color) return;
    if (element.dataset) element.dataset.color = color;
    element.style.color = color;
}

/**
 * Sets a style property only when it changed.
 */
function setStyle(element, prop, value) {
    if (element.dataset) {
        const key = 'css' + prop;
        if (element.dataset[key] === value) return;
        element.dataset[key] = value;
    }
    element.style[prop] = value;
}

const CONTROL_LINES_DESKTOP = [
    'W / Up: accelerate (automatic gears)',
    'S / Down: brake / reverse   Space: handbrake',
    'A D / Left Right: steer',
    'Q E: indicators   L: headlights',
    'C: camera   H: horn   M: mute   P: pause'
];

const CONTROL_LINES_TOUCH = [
    'Left pad: steer   Right pad: brake / accelerate',
    'Tap AUTO to let the driver take over'
];

function fillControlHints(controls, touch) {
    if (!controls) return;
    controls.textContent = '';
    (touch ? CONTROL_LINES_TOUCH : CONTROL_LINES_DESKTOP).forEach(line => {
        controls.appendChild(makeElement('div', { text: line }));
    });
}

// References to the pieces that live outside #hud (route bar, objective, pause)
let routeUI = null;

/**
 * Builds the route progress bar, objective pill and pause button.
 * They are separate from #hud so the phone layout keeps AUTO as its only
 * button inside the HUD.
 */
function createRouteUI({ onPause } = {}) {
    const bar = makeElement('div', {
        id: 'route-bar',
        css: `
            position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
            width: min(46vw, 560px); min-width: 240px; z-index: 100;
            pointer-events: none; font-family: ${FONT}; color: ${INK};
            text-align: center;
        `
    });

    const title = makeElement('div', {
        id: 'route-title',
        // (hidden on phones by the mobile stylesheet)
        css: `
            display: inline-block; background: ${PANEL}; border-radius: 999px;
            padding: 4px 14px; font-size: 13px; font-weight: bold;
            box-shadow: 0 3px 10px rgba(91, 75, 107, 0.22);
        `,
        text: `${ROUTE.START_NAME} → ${ROUTE.END_NAME}`
    });
    bar.appendChild(title);

    const track = makeElement('div', {
        id: 'route-track',
        css: `
            position: relative; height: 14px; margin: 18px 10px 0 10px;
            background: ${PANEL}; border-radius: 999px;
            box-shadow: 0 3px 10px rgba(91, 75, 107, 0.22);
        `
    });
    const fill = makeElement('div', {
        id: 'route-fill',
        css: `
            position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
            background: linear-gradient(90deg, ${MINT}, ${SKY}); border-radius: 999px;
        `
    });
    track.appendChild(fill);

    const markers = [];
    const stops = ROUTE.STOPS || [];
    const addMarker = (km, name, kind) => {
        const pct = Math.max(0, Math.min(100, (km / ROUTE.TOTAL_KM) * 100));
        const big = kind !== 'village';
        const dot = makeElement('div', {
            css: `
                position: absolute; top: 50%; left: ${pct}%;
                width: ${big ? 14 : 9}px; height: ${big ? 14 : 9}px;
                margin: ${big ? -7 : -4.5}px 0 0 ${big ? -7 : -4.5}px;
                border-radius: 50%; background: #FFFFFF;
                border: 3px solid ${big ? LILAC : PEACH};
            `
        });
        track.appendChild(dot);
        if (big) {
            const label = makeElement('div', {
                css: `
                    position: absolute; top: -17px; left: ${pct}%; transform: translateX(-50%);
                    font-size: 10px; font-weight: bold; white-space: nowrap;
                    color: ${INK}; text-shadow: 0 1px 0 rgba(255,255,255,0.8);
                `,
                text: name
            });
            track.appendChild(label);
        }
        return dot;
    };
    addMarker(0, ROUTE.START_NAME, 'town');
    stops.forEach(stop => markers.push({ id: stop.id, dot: addMarker(stop.km, stop.name, stop.kind), kind: stop.kind }));
    addMarker(ROUTE.TOTAL_KM, ROUTE.END_NAME, 'town');

    const busDot = makeElement('div', {
        id: 'route-bus',
        css: `
            position: absolute; top: 50%; left: 0%; width: 20px; height: 20px;
            margin: -10px 0 0 -10px; border-radius: 50%; background: ${PINK};
            border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(91, 75, 107, 0.4);
        `
    });
    track.appendChild(busDot);
    bar.appendChild(track);

    const objective = makeElement('div', {
        id: 'objective',
        css: `
            display: inline-block; margin-top: 12px; background: ${BUTTER};
            border-radius: 999px; padding: 6px 16px; font-size: 14px; font-weight: bold;
            box-shadow: 0 3px 10px rgba(91, 75, 107, 0.22); max-width: 100%;
        `,
        text: ''
    });
    bar.appendChild(objective);
    document.body.appendChild(bar);

    const pause = makeElement('button', {
        id: 'pause-button',
        css: `
            position: fixed; top: 12px; right: 12px; z-index: 101;
            width: 44px; height: 44px; border-radius: 50%; border: none;
            background: ${PANEL}; color: ${INK}; font-size: 18px; font-weight: bold;
            box-shadow: 0 3px 10px rgba(91, 75, 107, 0.3); cursor: pointer;
            pointer-events: auto; touch-action: manipulation; display: none;
        `,
        text: '❚❚'
    });
    pause.type = 'button';
    if (typeof onPause === 'function') {
        pause.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            if (pause.blur) pause.blur();
            onPause();
        });
    }
    document.body.appendChild(pause);

    return { bar, fill, busDot, objective, markers, pause };
}

/**
 * Creates the HUD element (speed, trip, fuel, AUTO button, key hints).
 * Sits at the right, below the pause button.
 *
 * @param {{onToggleAuto?: Function, onPause?: Function}} [options]
 * @returns {HTMLElement} HUD container
 */
export function createHUD({ onToggleAuto, onPause } = {}) {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.style.cssText = `
        position: fixed;
        top: 66px;
        right: 12px;
        color: ${INK};
        font-family: ${FONT};
        font-size: 14px;
        font-weight: bold;
        pointer-events: none;
        z-index: 100;
        background: ${PANEL};
        padding: 12px 14px;
        border: 3px solid ${PINK};
        border-radius: 20px;
        box-shadow: 0 6px 18px rgba(91, 75, 107, 0.25);
        width: 250px;
        white-space: nowrap;
        line-height: 1.5;
    `;

    hud.appendChild(makeElement('div', {
        id: 'speed',
        css: `font-size: 26px; color: ${INK}; white-space: pre;`,
        text: 'SPEED:   0 KM/H'
    }));

    hud.appendChild(makeElement('div', {
        id: 'status',
        css: `font-size: 12px; color: #3FA877; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;`,
        text: 'Ready'
    }));

    hud.appendChild(makeElement('div', {
        id: 'distance',
        css: `font-size: 12px; color: ${INK_SOFT}; margin-top: 4px;`,
        text: `Left: ${ROUTE.TOTAL_KM.toFixed(1)} km`
    }));

    hud.appendChild(makeElement('div', {
        id: 'next-town',
        css: `font-size: 14px; color: #B5651D; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;`,
        text: `Next: ${ROUTE.START_NAME}`
    }));

    hud.appendChild(makeElement('div', {
        id: 'sim',
        css: `font-size: 12px; color: ${INK_SOFT}; margin-top: 4px; white-space: pre;`
    }));

    const autoButton = makeElement('button', {
        id: 'auto-button',
        css: `
            margin-top: 10px;
            width: 100%;
            background: ${SKY};
            color: ${INK};
            border: none;
            border-radius: 14px;
            font-family: inherit;
            font-size: 13px;
            font-weight: bold;
            padding: 8px 10px;
            cursor: pointer;
            pointer-events: auto;
            touch-action: manipulation;
        `,
        text: 'AUTO DRIVE'
    });
    autoButton.type = 'button';
    hud.appendChild(autoButton);

    const controls = makeElement('div', {
        id: 'controls',
        css: `font-size: 11px; margin-top: 8px; color: ${INK_SOFT}; font-weight: normal;`
    });
    fillControlHints(controls, false);
    hud.appendChild(controls);

    document.body.appendChild(hud);

    if (typeof onToggleAuto === 'function') {
        autoButton.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            if (autoButton.blur) autoButton.blur();
            onToggleAuto();
        });
    }

    routeUI = createRouteUI({ onPause });
    return hud;
}

/**
 * Switches the HUD hint block between keyboard and touch wording.
 */
export function setHudTouchMode(hud, touch) {
    if (!hud) return;
    fillControlHints(hud.querySelector('#controls'), Boolean(touch));
}

// ---------------------------------------------
// Phone layout. Every element keeps its desktop inline style; this sheet only
// applies under html.touch-ui and swaps positions between portrait and
// landscape without any JavaScript (rotation just works).
//
//   landscape                         portrait
//   [♪]  ===route bar===  [❚❚]        [♪] ==route== [❚❚]
//   [info + AUTO]                     [info + AUTO]
//                      ◀▶◐☀▣                          ◀
//   [◀][▶]  [dash]  [BRAKE][▲]                       ▶ (switch column)
//                                         [dashboard]
//                                     [◀][▶]   [BRAKE][▲]
// ---------------------------------------------
const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
const SAFE_LEFT = 'env(safe-area-inset-left, 0px)';
const SAFE_RIGHT = 'env(safe-area-inset-right, 0px)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

const MOBILE_CSS = `
html.touch-ui #route-bar {
    top: calc(${SAFE_TOP} + 8px) !important;
    left: calc(${SAFE_LEFT} + 62px) !important;
    right: calc(${SAFE_RIGHT} + 62px) !important;
    width: auto !important; min-width: 0 !important; transform: none !important;
}
html.touch-ui #route-title { display: none !important; }
html.touch-ui #route-track { margin-top: 16px !important; }
html.touch-ui #objective {
    font-size: 12px !important; padding: 5px 12px !important; margin-top: 8px !important;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100% !important;
}
html.touch-ui #pause-button {
    top: calc(${SAFE_TOP} + 8px) !important; right: calc(${SAFE_RIGHT} + 8px) !important;
    width: 46px !important; height: 46px !important;
}
html.touch-ui #music {
    top: calc(${SAFE_TOP} + 8px) !important; left: calc(${SAFE_LEFT} + 8px) !important;
    min-width: 0 !important; max-width: none !important; padding: 0 !important;
    background: transparent !important; border: none !important; box-shadow: none !important;
}
html.touch-ui #music #track-title, html.touch-ui #music #track-counter { display: none !important; }
html.touch-ui #music-settings {
    width: 46px; height: 46px; margin: 0 !important; padding: 0 !important;
    border-radius: 50% !important; font-size: 20px !important; background: ${PANEL} !important;
    border: 3px solid ${LILAC} !important; box-shadow: 0 3px 10px rgba(91, 75, 107, 0.3);
}
html.touch-ui #zone-toast {
    top: calc(${SAFE_TOP} + 84px) !important; font-size: 15px !important;
    padding: 7px 16px !important; max-width: 60vw !important;
}
html.touch-ui #dashboard { padding: 2px 4px 0 !important; border-radius: 20px !important; }
html.touch-ui #dashboard-label { display: none; }

/* Overlays scroll on short screens instead of clipping the card */
html.touch-ui #title-screen > div, html.touch-ui #pause-screen > div,
html.touch-ui #summary-screen > div, html.touch-ui #sound-settings > div {
    padding: 18px 20px !important; border-radius: 24px !important;
}

@media (orientation: landscape) {
    html.touch-ui #dashboard { bottom: calc(${SAFE_BOTTOM} + 6px) !important; }
    html.touch-ui #dashboard-canvas { width: min(230px, 32vw) !important; }
    html.touch-ui #touch-switches {
        flex-direction: row !important;
        bottom: calc(${SAFE_BOTTOM} + 124px) !important;
    }
}
@media (orientation: portrait) {
    html.touch-ui #dashboard { bottom: calc(${SAFE_BOTTOM} + 118px) !important; }
    html.touch-ui #dashboard-canvas { width: min(270px, 64vw) !important; }
    html.touch-ui #touch-switches { bottom: calc(${SAFE_BOTTOM} + 126px) !important; }
}
/* Short landscape phones: tighter cards and smaller text on the title screen */
@media (max-height: 480px) {
    html.touch-ui #title-screen > div div { font-size: 12px; }
    html.touch-ui #title-screen button, html.touch-ui #pause-screen button,
    html.touch-ui #summary-screen button {
        padding: 10px 22px !important; font-size: 16px !important; min-height: 46px !important;
    }
    html.touch-ui #sound-settings > div > div { margin-top: 6px !important; margin-bottom: 6px !important; }
}
`;

function installMobileStyles(on) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (root && root.classList) {
        if (on) root.classList.add('touch-ui'); else root.classList.remove('touch-ui');
    }
    if (!on || !document.head || typeof document.getElementById !== 'function') return;
    if (document.getElementById('mobile-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-ui-style';
    style.textContent = MOBILE_CSS;
    document.head.appendChild(style);
}

/**
 * Turns the HUD into the phone layout: a compact info card in the top-left
 * corner whose only control is the AUTO DRIVE button, so the bottom of the
 * screen stays free for the thumb pad (touch.js) and the dashboard.
 */
export function setHudMobileMode(hud, mobile) {
    if (!hud) return;

    const autoButton = hud.querySelector('#auto-button');
    const controls = hud.querySelector('#controls');
    const speedEl = hud.querySelector('#speed');
    installMobileStyles(Boolean(mobile));

    const hideMusicButtons = (hide) => {
        if (typeof document === 'undefined' || !document.querySelector) return;
        const musicPanel = document.querySelector('#music');
        if (!musicPanel || !musicPanel.querySelector) return;
        ['#music-prev', '#music-play', '#music-next'].forEach(selector => {
            const button = musicPanel.querySelector(selector);
            if (button) button.style.display = hide ? 'none' : '';
        });
    };

    if (!mobile) {
        hud.dataset.layout = 'desktop';
        hideMusicButtons(false);
        hud.style.top = '66px';
        hud.style.bottom = '';
        hud.style.left = '';
        hud.style.right = '12px';
        hud.style.width = '250px';
        hud.style.minWidth = '';
        hud.style.maxWidth = '';
        hud.style.borderWidth = '3px';
        hud.style.boxShadow = '0 6px 18px rgba(91, 75, 107, 0.25)';
        hud.style.borderRadius = '20px';
        hud.style.padding = '12px 14px';
        hud.style.fontSize = '14px';
        hud.style.lineHeight = '1.5';
        hud.style.background = PANEL;
        if (speedEl) {
            speedEl.style.fontSize = '26px';
            speedEl.style.display = '';
        }
        if (controls) controls.style.display = '';
        if (autoButton) {
            autoButton.style.marginTop = '10px';
            autoButton.style.padding = '8px 10px';
            autoButton.style.fontSize = '13px';
            autoButton.style.minHeight = '';
        }
        return;
    }

    hud.dataset.layout = 'mobile';
    // Below the route bar (its title pill is hidden on phones)
    hud.style.top = `calc(${SAFE_TOP} + 84px)`;
    hud.style.bottom = '';
    hud.style.left = `calc(${SAFE_LEFT} + 8px)`;
    hud.style.right = '';
    hud.style.width = 'min(44vw, 196px)';
    hud.style.minWidth = '0';
    hud.style.maxWidth = 'none';
    hud.style.borderWidth = '3px';
    hud.style.boxShadow = '0 4px 12px rgba(91, 75, 107, 0.22)';
    hud.style.borderRadius = '18px';
    hud.style.padding = '7px 10px 9px';
    hud.style.fontSize = '12px';
    hud.style.lineHeight = '1.35';
    hud.style.background = 'rgba(255, 250, 244, 0.86)';

    // The dashboard shows the speed, so the card only carries the trip info
    if (speedEl) speedEl.style.display = 'none';
    if (controls) controls.style.display = 'none';
    hideMusicButtons(true);

    if (autoButton) {
        autoButton.style.marginTop = '6px';
        autoButton.style.padding = '8px 8px';
        autoButton.style.fontSize = '13px';
        autoButton.style.minHeight = '48px';
    }
}

/**
 * True when the HUD is currently in the mobile (single-button) layout.
 */
export function isHudMobileLayout(hud) {
    if (!hud || !hud.dataset) return false;
    return hud.dataset.layout === 'mobile';
}

/**
 * Reflects the autopilot state on the AUTO button.
 */
export function setAutoButtonState(hud, state) {
    if (!hud) return;

    const button = hud.querySelector('#auto-button');
    if (!button) return;

    const on = Boolean(state && state.active);
    if (button.dataset && button.dataset.on === String(on)) return;
    if (button.dataset) button.dataset.on = String(on);
    button.textContent = on ? 'AUTO ON - TAP TO STOP' : 'AUTO DRIVE';
    button.style.background = on ? MINT : SKY;
    button.style.color = INK;
}

const STATUS_LABELS = {
    ready: 'Ready to roll',
    driving: 'Driving',
    atStop: 'At a stop',
    at_stop: 'At a stop',
    arrived: 'Arrived!',
    gameOver: 'Trip over',
    game_over: 'Trip over'
};

/**
 * Updates the HUD with speed, trip progress, objective and AUTO button.
 *
 * @param {HTMLElement} hud
 * @param {number} speed - units/sec
 * @param {object} [extra] {status, distanceKm, nextTown, journey, objective, auto, sim}
 */
export function updateHUD(hud, speed, extra = {}) {
    if (!hud) return;

    const info = typeof extra === 'object' && extra !== null ? extra : {};

    const speedKmh = Math.round(Math.abs(speed) * 3.6);
    const speedEl = hud.querySelector('#speed');
    if (speedEl) {
        setText(speedEl, `SPEED: ${String(speedKmh).padStart(3)} KM/H`);
        setColor(speedEl, speedKmh > 60 ? '#D9534F' : speedKmh > 30 ? '#D9822B' : INK);
    }

    const journey = info.journey || null;

    // --- Distance remaining ---
    const distanceEl = hud.querySelector('#distance');
    if (distanceEl) {
        if (journey && typeof journey.remainingKm === 'number') {
            setText(distanceEl, `Left: ${journey.remainingKm.toFixed(1)} km of ${ROUTE.TOTAL_KM}`);
        } else if (typeof info.distanceKm === 'number') {
            setText(distanceEl, `Driven: ${info.distanceKm.toFixed(1)} km`);
        }
    }

    // --- Next town ---
    const nextTownEl = hud.querySelector('#next-town');
    if (nextTownEl && info.nextTown) {
        const km = Math.max(0, Math.round(info.nextTown.km - (journey ? journey.routeKmDriven : 0)));
        setText(nextTownEl, journey
            ? `Next: ${info.nextTown.name} - ${km} km`
            : `Next: ${info.nextTown.name} ${Math.max(0, Math.round(info.nextTown.km))} km`);
    }

    // --- Fuel, passengers, fares and safety ---
    const simEl = hud.querySelector('#sim');
    if (simEl && info.sim) {
        const sim = info.sim;
        const pad = (value, width) => String(value).padStart(width);
        setText(simEl,
            `FUEL ${pad(sim.fuelPercent, 3)}%   PAX ${pad(sim.passengers, 2)}/${sim.capacity}\n` +
            `FARE ₹${pad(sim.fares, 5)}  SAFE ${pad(sim.safety, 3)}%`);
        const lowFuel = sim.fuelPercent <= ROUTE.LOW_FUEL_PERCENT;
        setColor(simEl, lowFuel ? '#D9534F' : INK_SOFT);
    }

    // --- Status line ---
    const statusEl = hud.querySelector('#status');
    if (statusEl) {
        let text = STATUS_LABELS[info.status] || 'Driving';
        let color = '#3FA877';

        if (info.auto && info.auto.active) {
            text = info.auto.overtaking ? 'Auto: overtaking' : 'Auto driving';
            color = '#3F7FBF';
        } else if (info.auto && info.auto.reason) {
            text = info.auto.reason;
            color = '#D9822B';
        } else if (info.sim && info.sim.message) {
            text = info.sim.message;
            color = '#D9822B';
        }

        setText(statusEl, text);
        setColor(statusEl, color);
    }

    if (info.auto) setAutoButtonState(hud, info.auto);

    // --- Route bar, objective and pause button ---
    if (routeUI) {
        if (journey) {
            const pct = Math.max(0, Math.min(1, journey.progress || 0)) * 100;
            setStyle(routeUI.fill, 'width', `${pct.toFixed(1)}%`);
            setStyle(routeUI.busDot, 'left', `${pct.toFixed(1)}%`);
            if (Array.isArray(journey.stops)) {
                journey.stops.forEach(stop => {
                    const marker = routeUI.markers.find(m => m.id === stop.id);
                    if (!marker) return;
                    const color = stop.state === 'served' ? MINT : stop.state === 'missed' ? '#E58A8A' : '#FFFFFF';
                    setStyle(marker.dot, 'background', color);
                });
            }
        }
        const text = typeof info.objective === 'string' ? info.objective : '';
        setText(routeUI.objective, text);
        setStyle(routeUI.objective, 'display', text ? 'inline-block' : 'none');
        const lowFuelPrompt = /fuel|petrol/i.test(text);
        setStyle(routeUI.objective, 'background', lowFuelPrompt ? PEACH : BUTTER);

        const playing = info.status === 'driving' || info.status === 'atStop' || info.status === 'at_stop';
        setStyle(routeUI.pause, 'display', playing ? 'block' : 'none');
    }
}

// ---------------------------------------------
// Title, pause and summary screens
// ---------------------------------------------

function makeButton(id, label, color, onClick) {
    const button = makeElement('button', {
        id,
        css: `
            background: ${color}; color: ${INK}; border: none; border-radius: 18px;
            font-family: inherit; font-size: 18px; font-weight: bold;
            padding: 14px 34px; margin: 6px; cursor: pointer; pointer-events: auto;
            touch-action: manipulation; min-height: 52px;
            box-shadow: 0 5px 0 rgba(91, 75, 107, 0.25);
        `,
        text: label
    });
    button.type = 'button';
    // click covers mouse and touch; no separate touchstart handler needed
    button.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (button.blur) button.blur();
        if (typeof onClick === 'function') onClick();
    });
    return button;
}

function makeOverlay(id, background) {
    return makeElement('div', {
        id,
        css: `
            position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 200;
            display: none; flex-direction: column;
            padding: ${SAFE_TOP} ${SAFE_RIGHT} ${SAFE_BOTTOM} ${SAFE_LEFT};
            background: ${background}; font-family: ${FONT}; color: ${INK};
            pointer-events: auto; touch-action: pan-y; overflow-y: auto;
            overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
        `
    });
}

function makeCard() {
    return makeElement('div', {
        css: `
            background: ${PANEL}; border-radius: 28px; padding: 26px 30px;
            max-width: min(92vw, 460px); text-align: center;
            /* auto margins centre the card but, unlike align-items: center,
               let a card taller than the screen scroll from its top */
            margin: auto; flex-shrink: 0; box-sizing: border-box;
            box-shadow: 0 12px 36px rgba(91, 75, 107, 0.35);
        `
    });
}

function line(text, css = '') {
    return makeElement('div', { css, text });
}

function stars(count) {
    let s = '';
    for (let i = 0; i < 3; i++) s += i < count ? '★' : '☆';
    return s;
}

/**
 * Builds the title, pause and end-of-trip overlays.
 *
 * @param {{touch?: boolean, onStart?: Function, onResume?: Function, onRestart?: Function}} options
 */
export function createGameScreens({ touch = false, onStart, onResume, onRestart, onSound } = {}) {
    const soundButton = (id) => makeButton(id, '⚙ SOUND', LILAC, () => { if (onSound) onSound(); });
    // --- Title ---
    const title = makeOverlay('title-screen', 'linear-gradient(180deg, rgba(255,214,224,0.9), rgba(190,225,250,0.9))');
    const titleCard = makeCard();
    titleCard.appendChild(line('Bus Simulator', `font-size: 15px; color: ${INK_SOFT};`));
    titleCard.appendChild(line(`${ROUTE.START_NAME} → ${ROUTE.END_NAME}`, 'font-size: 34px; margin: 4px 0;'));
    titleCard.appendChild(line(`${ROUTE.START_EN} to ${ROUTE.END_EN} - ${ROUTE.TOTAL_KM} km`, `font-size: 14px; color: ${INK_SOFT};`));
    titleCard.appendChild(line(
        `Pick up passengers in the towns, keep the tank filled and arrive at ${ROUTE.END_STAND_EN}.`,
        'font-size: 14px; margin: 14px 0; line-height: 1.4;'
    ));
    const route = ROUTE.STOPS.map(s => s.name).join(' • ');
    titleCard.appendChild(line(route, `font-size: 12px; color: ${INK_SOFT}; margin-bottom: 12px; line-height: 1.5;`));
    const hints = touch
        ? ['Left thumb: ◀ ▶ steer   Right thumb: BRAKE / ▲ accelerate', 'Round buttons: indicators, lights, handbrake, camera',
            'Stop at a bus stop: doors open on their own', 'AUTO lets the driver take over   ♪: sound settings']
        : ['W / Up: accelerate (automatic gearbox)   S / Down: brake / reverse', 'A D / Left Right: steer   Space: handbrake',
            'Q E: indicators   L: headlights   C: camera view', 'Stop at a bus stop: doors open on their own', 'H: horn   M: mute all   N: next song   P / Esc: pause'];
    hints.forEach(h => titleCard.appendChild(line(h, `font-size: 13px; color: ${INK};`)));
    const best = makeElement('div', { id: 'title-best', css: `font-size: 13px; margin-top: 12px; color: #B5651D;` });
    titleCard.appendChild(best);
    titleCard.appendChild(makeButton('start-button', 'START TRIP', MINT, () => { if (onStart) onStart(); }));
    if (onSound) titleCard.appendChild(soundButton('title-sound-button'));
    title.appendChild(titleCard);
    document.body.appendChild(title);

    // --- Pause ---
    const pause = makeOverlay('pause-screen', 'rgba(190, 225, 250, 0.7)');
    const pauseCard = makeCard();
    pauseCard.appendChild(line('Paused', 'font-size: 30px; margin-bottom: 10px;'));
    pauseCard.appendChild(makeButton('resume-button', 'RESUME', MINT, () => { if (onResume) onResume(); }));
    pauseCard.appendChild(makeButton('pause-restart-button', 'RESTART', PEACH, () => { if (onRestart) onRestart(); }));
    if (onSound) pauseCard.appendChild(soundButton('pause-sound-button'));
    pause.appendChild(pauseCard);
    document.body.appendChild(pause);

    // --- Summary ---
    const summary = makeOverlay('summary-screen', 'linear-gradient(180deg, rgba(255,226,154,0.88), rgba(255,184,208,0.88))');
    const summaryCard = makeCard();
    const summaryBody = makeElement('div', { id: 'summary-body' });
    summaryCard.appendChild(summaryBody);
    summaryCard.appendChild(makeButton('restart-button', 'DRIVE AGAIN', MINT, () => { if (onRestart) onRestart(); }));
    summary.appendChild(summaryCard);
    document.body.appendChild(summary);

    const show = (el) => { el.style.display = 'flex'; };
    const hide = (el) => { el.style.display = 'none'; };

    return {
        title, pause, summary,
        showTitle(bestResult) {
            best.textContent = bestResult && typeof bestResult.score === 'number'
                ? `Best: ${bestResult.score} pts  ${stars(bestResult.stars || 0)}`
                : '';
            show(title);
        },
        hideTitle() { hide(title); },
        showPause() { show(pause); },
        hidePause() { hide(pause); },
        showSummary(result, { newBest = false, best: bestResult = null } = {}) {
            summaryBody.textContent = '';
            const arrived = Boolean(result && result.arrived);
            summaryBody.appendChild(line(arrived ? `Arrived in ${ROUTE.END_NAME}!` : 'Trip over', 'font-size: 28px;'));
            summaryBody.appendChild(line(
                arrived ? ROUTE.END_STAND_EN : (result && result.reason) || '',
                `font-size: 13px; color: ${INK_SOFT}; margin-bottom: 6px;`
            ));
            summaryBody.appendChild(line(stars(result ? result.stars : 0), `font-size: 42px; color: #F0B429; margin: 4px 0 8px;`));
            const mins = Math.floor((result ? result.time : 0) / 60);
            const secs = Math.floor((result ? result.time : 0) % 60);
            const rows = [
                ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
                ['Passengers carried', String(result ? result.passengers : 0)],
                ['Fares', `₹${result ? result.fares : 0}`],
                ['Safety', `${result ? result.safety : 0}%`],
                ['Missed stops', String(result ? result.missed : 0)],
                ['Score', `${result ? result.score : 0} pts`]
            ];
            rows.forEach(([label, value], index) => {
                const last = index === rows.length - 1;
                const row = makeElement('div', {
                    css: `display: flex; justify-content: space-between; gap: 24px; font-size: ${last ? 18 : 14}px; ` +
                        `padding: 4px 0; font-weight: ${last ? 'bold' : 'normal'};`
                });
                row.appendChild(makeElement('span', { text: label }));
                row.appendChild(makeElement('span', { text: value }));
                summaryBody.appendChild(row);
            });
            if (newBest) summaryBody.appendChild(line('New best score!', `font-size: 15px; color: #3FA877; margin-top: 8px;`));
            else if (bestResult && typeof bestResult.score === 'number') {
                summaryBody.appendChild(line(`Best: ${bestResult.score} pts`, `font-size: 12px; color: ${INK_SOFT}; margin-top: 8px;`));
            }
            show(summary);
        },
        hideSummary() { hide(summary); }
    };
}

// ---------------------------------------------
// Music panel
// ---------------------------------------------

function createMusicPanel() {
    const panel = document.createElement('div');
    panel.id = 'music';
    panel.style.cssText = `
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 100;
        background: ${PANEL};
        color: ${INK};
        font-family: ${FONT};
        font-size: 11px;
        font-weight: bold;
        padding: 10px 12px;
        border: 3px solid ${LILAC};
        border-radius: 18px;
        box-shadow: 0 6px 18px rgba(91, 75, 107, 0.25);
        min-width: 180px;
        max-width: 24vw;
    `;

    const title = document.createElement('div');
    title.id = 'track-title';
    title.style.cssText = `
        color: ${INK};
        margin-bottom: 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;
    title.textContent = 'Music: loading...';
    panel.appendChild(title);

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

    const buttonStyle = `
        background: ${LILAC};
        color: ${INK};
        border: none;
        border-radius: 999px;
        font-family: inherit;
        font-size: 11px;
        font-weight: bold;
        padding: 5px 10px;
        cursor: pointer;
        touch-action: manipulation;
    `;

    const makeMusicButton = (id, label) => {
        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = label;
        button.style.cssText = buttonStyle;
        buttons.appendChild(button);
        return button;
    };

    const prevButton = makeMusicButton('music-prev', '<< Prev');
    const playButton = makeMusicButton('music-play', 'Play');
    const nextButton = makeMusicButton('music-next', 'Next >>');

    panel.appendChild(buttons);

    const counter = document.createElement('div');
    counter.id = 'track-counter';
    counter.style.cssText = `color: ${INK_SOFT}; margin-top: 8px; font-size: 10px;`;
    counter.textContent = '1 / 1';
    panel.appendChild(counter);

    document.body.appendChild(panel);

    return { panel, buttonsRow: buttons, title, counter, prevButton, playButton, nextButton };
}

/**
 * Wires a music player to the music panel.
 * On phones `showButtons: false` keeps the track title but renders no buttons.
 */
export function createMusicUI(player, { showButtons = true, onSettings = null, compact = false } = {}) {
    const ui = createMusicPanel();

    // Sound settings button: kept outside the button row so phones get it too
    if (typeof onSettings === 'function') {
        const settingsButton = makeElement('button', {
            id: 'music-settings',
            css: `
                background: ${MINT}; color: ${INK}; border: none; border-radius: 999px;
                font-family: inherit; font-size: 11px; font-weight: bold;
                padding: 5px 10px; margin-top: 8px; cursor: pointer; touch-action: manipulation;
            `,
            // On phones the whole panel shrinks to this one round button
            text: compact ? '♪' : '⚙ Sound settings'
        });
        settingsButton.type = 'button';
        settingsButton.setAttribute('aria-label', 'Sound settings');
        settingsButton.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            if (settingsButton.blur) settingsButton.blur();
            onSettings();
        });
        ui.panel.appendChild(settingsButton);
        ui.settingsButton = settingsButton;
    }

    const label = (state) => {
        ui.title.textContent = state.hasTracks ? `Music: ${state.title}` : 'Music: no tracks found';
        ui.title.title = state.hasTracks ? state.title : '';
        ui.counter.textContent = state.hasTracks
            ? `Track ${state.index + 1} / ${state.total}`
            : 'Add MP3 files to song/';
    };

    if (!showButtons) {
        const row = ui.buttonsRow;
        if (row && row.parentNode) row.parentNode.removeChild(row);
        player.onChange(label);
        return ui;
    }

    [ui.prevButton, ui.playButton, ui.nextButton].forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            button.blur();
        });
    });

    ui.prevButton.addEventListener('click', () => player.previous());
    ui.playButton.addEventListener('click', () => player.toggle());
    ui.nextButton.addEventListener('click', () => player.next());

    player.onChange((state) => {
        label(state);
        ui.playButton.textContent = state.isPlaying ? 'Pause' : 'Play';

        const disabled = !state.hasTracks;
        [ui.prevButton, ui.playButton, ui.nextButton].forEach(button => {
            button.disabled = disabled;
            button.style.opacity = disabled ? '0.4' : '1';
            button.style.cursor = disabled ? 'not-allowed' : 'pointer';
        });
    });

    return ui;
}

// ---------------------------------------------
// Sound settings: music and game sound, each with a switch and a volume
// ---------------------------------------------

/**
 * Builds the sound settings overlay.
 * @param {Object} options
 * @param {ReturnType<import('./settings.js').createSoundSettings>} options.settings
 * @param {Object} [options.player] - music player (track title, prev / next, play)
 * @param {Function} [options.onTestSound] - plays a short game sound (horn)
 * @param {Function} [options.onClose]
 * @returns {{overlay: HTMLElement, open: Function, close: Function, isOpen: Function, elements: Object}}
 */
export function createSoundSettingsUI({ settings, player = null, onTestSound = null, onClose = null } = {}) {
    const overlay = makeOverlay('sound-settings', 'rgba(91, 75, 107, 0.35)');
    overlay.style.zIndex = '260';      // above the title and pause screens
    const card = makeCard();
    card.style.textAlign = 'left';
    card.style.minWidth = 'min(86vw, 340px)';
    card.appendChild(line('Sound settings', 'font-size: 26px; text-align: center; margin-bottom: 12px;'));

    const smallButton = (id, text, color, onClick) => {
        const b = makeElement('button', {
            id,
            css: `
                background: ${color}; color: ${INK}; border: none; border-radius: 999px;
                font-family: inherit; font-size: 13px; font-weight: bold; min-width: 44px;
                padding: 7px 14px; cursor: pointer; touch-action: manipulation;
                box-shadow: 0 3px 0 rgba(91, 75, 107, 0.2);
            `,
            text
        });
        b.type = 'button';
        b.addEventListener('click', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            onClick();
        });
        return b;
    };

    const row = (css = '') => makeElement('div', {
        css: `display: flex; align-items: center; gap: 10px; margin: 8px 0; ${css}`
    });

    /** A section: heading + ON/OFF switch, then a volume slider */
    const section = (key, heading, sub) => {
        const box = makeElement('div', {
            css: `background: rgba(201, 182, 240, 0.18); border-radius: 18px; padding: 10px 14px; margin: 10px 0;`
        });
        const head = row('justify-content: space-between; margin-top: 0;');
        const titles = makeElement('div');
        titles.appendChild(line(heading, 'font-size: 17px; font-weight: bold;'));
        titles.appendChild(line(sub, `font-size: 11px; color: ${INK_SOFT};`));
        head.appendChild(titles);
        const onKey = `${key}On`;
        const volKey = `${key}Volume`;
        const toggle = smallButton(`${key}-toggle`, 'ON', MINT, () => {
            const now = settings.get();
            settings.set({ [onKey]: !now[onKey] });
            if (key === 'music' && player && settings.get().musicOn && !player.getState().isPlaying) player.play();
        });
        head.appendChild(toggle);
        box.appendChild(head);

        const volRow = row('margin-bottom: 0;');
        volRow.appendChild(makeElement('span', { css: 'font-size: 12px; min-width: 52px;', text: 'Volume' }));
        const slider = makeElement('input', {
            id: `${key}-volume`,
            css: `flex: 1; accent-color: ${key === 'music' ? '#B69BEA' : '#5FC79A'}; cursor: pointer;`
        });
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.step = '1';
        const percent = makeElement('span', { css: 'font-size: 12px; min-width: 38px; text-align: right;' });
        const onSlide = () => {
            const v = Number(slider.value) / 100;
            // Dragging the volume up also switches the sound back on
            settings.set(v > 0 ? { [volKey]: v, [onKey]: true } : { [volKey]: v });
        };
        slider.addEventListener('input', onSlide);
        slider.addEventListener('change', onSlide);
        // Arrow keys move the slider, not the bus
        slider.addEventListener('keydown', (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
        volRow.appendChild(slider);
        volRow.appendChild(percent);
        box.appendChild(volRow);
        card.appendChild(box);
        return { box, toggle, slider, percent, onKey, volKey };
    };

    const music = section('music', 'Music', 'Songs from the song/ folder');

    // Track picker inside the music section
    const trackRow = row('margin-bottom: 0;');
    const prev = smallButton('settings-music-prev', '◀', LILAC, () => player && player.previous());
    const play = smallButton('settings-music-play', 'Play', LILAC, () => {
        if (!player) return;
        if (!settings.get().musicOn) settings.set({ musicOn: true });
        player.toggle();
    });
    const next = smallButton('settings-music-next', '▶', LILAC, () => player && player.next());
    const track = makeElement('div', {
        id: 'settings-track',
        css: 'flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
    });
    [prev, track, play, next].forEach(el => trackRow.appendChild(el));
    music.box.appendChild(trackRow);

    const sfx = section('sfx', 'Game sound', 'Engine, horn, brakes, indicators, wind');
    if (typeof onTestSound === 'function') {
        const testRow = row('justify-content: flex-end; margin-bottom: 0;');
        testRow.appendChild(smallButton('sfx-test', 'Test horn', BUTTER, () => onTestSound()));
        sfx.box.appendChild(testRow);
    }

    card.appendChild(line('M: mute / unmute all   N: next song', `font-size: 11px; color: ${INK_SOFT}; text-align: center; margin-top: 4px;`));
    const footer = row('justify-content: center; margin-top: 12px;');
    footer.appendChild(smallButton('sound-reset', 'Reset', PEACH, () => settings.reset()));
    footer.appendChild(smallButton('sound-done', 'Done', MINT, () => close()));
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Clicking the dimmed background closes the panel too
    overlay.addEventListener('click', (e) => { if (e && e.target === overlay) close(); });

    const paint = (s) => {
        [music, sfx].forEach(part => {
            const on = s[part.onKey];
            const pct = Math.round(s[part.volKey] * 100);
            part.toggle.textContent = on ? 'ON' : 'OFF';
            part.toggle.style.background = on ? MINT : '#E4DDEB';
            if (String(part.slider.value) !== String(pct)) part.slider.value = String(pct);
            part.percent.textContent = `${pct}%`;
            part.slider.style.opacity = on ? '1' : '0.45';
        });
    };
    settings.onChange(paint);

    if (player) {
        player.onChange((state) => {
            track.textContent = state.hasTracks ? `♪ ${state.title}` : 'No songs: add MP3 files to song/';
            play.textContent = state.isPlaying ? 'Pause' : 'Play';
            [prev, play, next].forEach(b => { b.disabled = !state.hasTracks; b.style.opacity = state.hasTracks ? '1' : '0.4'; });
        });
    } else {
        trackRow.style.display = 'none';
    }

    let openNow = false;
    function open() {
        openNow = true;
        overlay.style.display = 'flex';
    }
    function close() {
        if (!openNow) return;
        openNow = false;
        overlay.style.display = 'none';
        if (typeof onClose === 'function') onClose();
    }

    return {
        overlay, open, close,
        isOpen: () => openNow,
        elements: { music, sfx, prev, play, next, track }
    };
}

// --- Zone toast: "Entering Aravalli Hills / अरावली पहाड़ियाँ" ---
let zoneToast = null;
let zoneToastTimer = null;

/**
 * Shows a short banner at the top of the screen (a new biome was entered).
 * @param {string} text
 * @param {number} [seconds]
 */
export function showZoneToast(text, seconds = 3.5) {
    if (!zoneToast) {
        zoneToast = document.createElement('div');
        zoneToast.id = 'zone-toast';
        zoneToast.style.cssText = `
            position: fixed; top: 74px; left: 50%; transform: translateX(-50%);
            padding: 10px 22px; border-radius: 18px; z-index: 150;
            background: rgba(255, 255, 255, 0.88); color: ${INK};
            font-family: ${FONT}; font-size: 20px; font-weight: bold;
            box-shadow: 0 4px 14px rgba(91, 75, 107, 0.25);
            pointer-events: none; opacity: 0; transition: opacity 0.5s;
            max-width: 90vw; text-align: center;
        `;
        document.body.appendChild(zoneToast);
    }
    zoneToast.textContent = text;
    zoneToast.style.opacity = '1';
    if (zoneToastTimer) clearTimeout(zoneToastTimer);
    zoneToastTimer = setTimeout(() => { zoneToast.style.opacity = '0'; }, seconds * 1000);
}

// ---------------------------------------------
// Dashboard: tachometer, speedometer, gear, indicators, lights, fuel
// ---------------------------------------------

const DASH_W = 440;
const DASH_H = 156;

/**
 * Draws one round dial with ticks, numbers, an optional red zone and a needle.
 */
function drawDial(ctx, cx, cy, r, value, { max, step, labelDiv = 1, redFrom = null, title = '', unit = '' }) {
    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const angleOf = (v) => start + sweep * Math.min(1, Math.max(0, v / max));

    // Face
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = LILAC;
    ctx.stroke();

    // Red zone
    if (redFrom !== null) {
        ctx.beginPath();
        ctx.arc(cx, cy, r - 7, angleOf(redFrom), angleOf(max));
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#F2A0A0';
        ctx.stroke();
    }

    // Ticks and numbers
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= max + 0.001; v += step) {
        const a = angleOf(v);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
        ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
        ctx.stroke();
        ctx.fillText(String(Math.round(v / labelDiv)), cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
    }

    ctx.fillStyle = INK_SOFT;
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillText(title, cx, cy + r * 0.52);

    // Needle
    const a = angleOf(value);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#E0605E';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8);
    ctx.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.lineCap = 'butt';
    if (unit) {
        ctx.fillStyle = INK;
        ctx.font = `bold 13px ${FONT}`;
        ctx.fillText(unit, cx, cy + r * 0.3);
    }
}

function drawArrow(ctx, x, y, dir, on) {
    ctx.beginPath();
    ctx.moveTo(x + dir * 14, y);
    ctx.lineTo(x - dir * 4, y - 12);
    ctx.lineTo(x - dir * 4, y - 5);
    ctx.lineTo(x - dir * 14, y - 5);
    ctx.lineTo(x - dir * 14, y + 5);
    ctx.lineTo(x - dir * 4, y + 5);
    ctx.lineTo(x - dir * 4, y + 12);
    ctx.closePath();
    ctx.fillStyle = on ? '#4CC38A' : '#E4DDEA';
    ctx.fill();
}

/**
 * Creates the dashboard panel (bottom centre): tachometer, speedometer, gear,
 * indicator arrows, headlight / handbrake lamps and the fuel gauge.
 * @param {{mobile?: boolean}} [options]
 * @returns {{root: HTMLElement, canvas: HTMLCanvasElement, label: HTMLElement}|null}
 */
export function createDashboard({ mobile = false } = {}) {
    if (typeof document === 'undefined') return null;
    const root = makeElement('div', {
        id: 'dashboard',
        css: `
            position: fixed; left: 50%; bottom: 10px; transform: translateX(-50%);
            z-index: 99; pointer-events: none; font-family: ${FONT};
            background: ${PANEL}; border: 3px solid ${LILAC}; border-radius: 26px;
            box-shadow: 0 6px 18px rgba(91, 75, 107, 0.25); padding: 4px 6px 2px;
            text-align: center; color: ${INK_SOFT}; font-size: 10px; font-weight: bold;
        `
    });
    const canvas = document.createElement('canvas');
    canvas.id = 'dashboard-canvas';
    canvas.width = DASH_W;
    canvas.height = DASH_H;
    canvas.style.cssText = `display: block; width: ${mobile ? 300 : DASH_W}px; max-width: 92vw; height: auto;`;
    root.appendChild(canvas);
    const label = makeElement('div', { id: 'dashboard-label', css: 'padding-bottom: 2px;' });
    root.appendChild(label);
    document.body.appendChild(root);
    return { root, canvas, label, mobile, key: '', frames: 0 };
}

/**
 * Redraws the dashboard from the bus state (only when something changed).
 * @param {Object} dash - from createDashboard
 * @param {Object} data - bus.userData
 * @param {{fuelPercent?: number, cameraLabel?: string, visible?: boolean, hud?: HTMLElement}} [extra]
 */
export function updateDashboard(dash, data, { fuelPercent = 100, cameraLabel = '', visible = true, hud = null } = {}) {
    if (!dash || !dash.canvas || !dash.canvas.getContext) return;
    setStyle(dash.root, 'display', visible ? 'block' : 'none');
    if (!visible) return;

    // (on phones the mobile stylesheet places the dashboard between the pads)
    const speedKmh = Math.abs(data.speed || 0) * 3.6;
    const rpm = data.rpm || 750;
    const gear = data.gear === -1 ? 'R' : data.shifting > 0 ? 'N' : String(data.gear || 1);
    const lamp = data.indicatorLamp || 0;
    const key = [Math.round(speedKmh * 2), Math.round(rpm / 15), gear, lamp, data.headlights ? 1 : 0,
        data.handbrake ? 1 : 0, Math.round(fuelPercent), data.noFuel ? 1 : 0].join('|');
    setText(dash.label, cameraLabel ? `Camera: ${cameraLabel}${dash.mobile ? '' : '  (C)'}` : '');
    if (dash.key === key) return;
    dash.key = key;

    const ctx = dash.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, DASH_W, DASH_H);

    drawDial(ctx, 76, 80, 66, rpm, {
        max: 3000, step: 500, labelDiv: 1000, redFrom: 2600, title: 'RPM x1000'
    });
    drawDial(ctx, 364, 80, 66, speedKmh, {
        max: 100, step: 20, redFrom: 80, title: 'KM/H', unit: String(Math.round(speedKmh))
    });

    // Centre: gear, indicators, lamps, fuel
    const cx = DASH_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK_SOFT;
    ctx.font = `bold 10px ${FONT}`;
    ctx.fillText('GEAR', cx, 16);
    ctx.fillStyle = gear === 'N' ? '#D9822B' : gear === 'R' ? '#E0605E' : INK;
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText(gear, cx, 52);

    drawArrow(ctx, cx - 40, 86, -1, lamp & 1);
    drawArrow(ctx, cx + 40, 86, 1, lamp & 2);

    // Headlight icon (blue when on)
    const lightOn = Boolean(data.headlights);
    ctx.fillStyle = lightOn ? '#4F9BE0' : '#E4DDEA';
    ctx.beginPath();
    ctx.ellipse(cx - 22, 112, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lightOn ? '#4F9BE0' : '#E4DDEA';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 33, 112 + i * 6);
        ctx.lineTo(cx - 42, 112 + i * 8);
        ctx.stroke();
    }

    // Handbrake lamp (red circle with P)
    const hb = Boolean(data.handbrake);
    ctx.beginPath();
    ctx.arc(cx + 22, 112, 10, 0, Math.PI * 2);
    ctx.fillStyle = hb ? '#E0605E' : '#E4DDEA';
    ctx.fill();
    ctx.fillStyle = hb ? '#FFFFFF' : '#B8AEC4';
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText('P', cx + 22, 113);

    // Fuel gauge
    const barW = 100;
    const fx = cx - barW / 2;
    const frac = Math.max(0, Math.min(1, fuelPercent / 100));
    ctx.fillStyle = '#E4DDEA';
    ctx.fillRect(fx, 134, barW, 9);
    ctx.fillStyle = frac < 0.15 || data.noFuel ? '#E0605E' : frac < 0.35 ? '#F0B429' : '#4CC38A';
    ctx.fillRect(fx, 134, barW * frac, 9);
    ctx.fillStyle = INK_SOFT;
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillText('E', fx - 8, 139);
    ctx.fillText('F', fx + barW + 8, 139);
    ctx.fillText('FUEL', cx, 128);
}
