// =============================================
// HUD SYSTEM (pixel-art style)
// =============================================

/**
 * Small helper: creates an element with an id, inline style and text.
 * Building the HUD node by node (instead of one innerHTML string) keeps the
 * AUTO button reachable as a real node, which the tests rely on.
 *
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
 * @param {HTMLElement} element
 * @param {string} text
 */
function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
}

/**
 * Sets a text colour only when it changed (browsers normalise colour strings,
 * so the last value is remembered on the element).
 * @param {HTMLElement} element
 * @param {string} color
 */
function setColor(element, color) {
    if (element.dataset && element.dataset.color === color) return;
    if (element.dataset) element.dataset.color = color;
    element.style.color = color;
}

const CONTROL_LINES_DESKTOP = [
    'W / UP: ACCELERATE',
    'S / DOWN: BRAKE',
    'A / LEFT: STEER LEFT',
    'D / RIGHT: STEER RIGHT'
];

const CONTROL_LINES_TOUCH = [
    'HOLD THE PAD TO DRIVE',
    'TAP AUTO TO COAST'
];

/**
 * Fills the hint block of the HUD with the right control hints.
 * @param {HTMLElement} controls
 * @param {boolean} touch
 */
function fillControlHints(controls, touch) {
    if (!controls) return;

    controls.textContent = '';
    (touch ? CONTROL_LINES_TOUCH : CONTROL_LINES_DESKTOP).forEach(line => {
        controls.appendChild(makeElement('div', { text: line }));
    });
}

/**
 * Creates the HUD element.
 * It sits in the top-right corner so it never fights with the music panel
 * (top-left) or the touch pad (bottom of the screen on phones).
 *
 * @param {{onToggleAuto?: Function}} [options]
 * @returns {HTMLElement} HUD container
 */
export function createHUD({ onToggleAuto } = {}) {
    const hud = document.createElement('div');
    hud.id = 'hud';
    // Rounded corners and a soft shadow match the rounded vehicles and
    // buildings; the bold border and monospace font keep it readable.
    hud.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        color: #FFFFFF;
        font-family: 'Courier New', ui-monospace, monospace;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 1px;
        text-transform: uppercase;
        pointer-events: none;
        z-index: 100;
        background: #16161F;
        padding: 10px 12px;
        border: 4px solid #FFD700;
        border-radius: 12px;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
        width: 260px;
        white-space: nowrap;
        line-height: 1.5;
    `;

    const speed = makeElement('div', {
        id: 'speed',
        css: 'font-size: 24px; color: #FFD700; letter-spacing: 2px; white-space: pre;',
        text: 'SPEED: 0 KM/H'
    });
    hud.appendChild(speed);

    const status = makeElement('div', {
        id: 'status',
        css: 'font-size: 11px; color: #2ECC71; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;',
        text: 'DRIVING'
    });
    hud.appendChild(status);

    // --- Trip meter: distance driven and the next town on the boards ---
    const distance = makeElement('div', {
        id: 'distance',
        css: 'font-size: 11px; color: #9AA0A6; margin-top: 2px;',
        text: 'DISTANCE: 0.0 KM'
    });
    hud.appendChild(distance);

    const nextTown = makeElement('div', {
        id: 'next-town',
        css: 'font-size: 13px; color: #F5C400; margin-top: 2px;',
        text: 'NEXT: बौंली'
    });
    hud.appendChild(nextTown);

    // --- Bus sim read-out: fuel, passengers, fares and safety on one line ---
    const sim = makeElement('div', {
        id: 'sim',
        css: 'font-size: 11px; color: #9AA0A6; margin-top: 2px; white-space: pre;'
    });
    hud.appendChild(sim);

    // --- AUTO button: hands the bus over to the AI driver ---
    // The HUD itself has pointer-events:none, so the button re-enables them.
    const autoButton = makeElement('button', {
        id: 'auto-button',
        css: `
            margin-top: 8px;
            width: 100%;
            background: #262633;
            color: #4A90D9;
            border: 2px solid #4A90D9;
            border-radius: 8px;
            font-family: inherit;
            font-size: 12px;
            font-weight: bold;
            letter-spacing: 1px;
            text-transform: uppercase;
            padding: 6px 8px;
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
        css: 'font-size: 11px; margin-top: 8px; color: #9AA0A6;'
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

    return hud;
}

/**
 * Switches the HUD hint block between keyboard and touch wording.
 * @param {HTMLElement} hud
 * @param {boolean} touch - true on phones / tablets
 */
export function setHudTouchMode(hud, touch) {
    if (!hud) return;
    fillControlHints(hud.querySelector('#controls'), Boolean(touch));
}

/**
 * Turns the HUD into the mobile layout: a single bottom bar whose only control
 * is the AUTO DRIVE button.
 *
 * On a phone there is no room for a driving pad, music buttons or keyboard
 * hints, so the bar keeps just the read-out and one large, thumb-sized AUTO
 * button pinned to the bottom edge.
 *
 * @param {HTMLElement} hud
 * @param {boolean} mobile
 */
export function setHudMobileMode(hud, mobile) {
    if (!hud) return;

    const autoButton = hud.querySelector('#auto-button');
    const controls = hud.querySelector('#controls');
    const speedEl = hud.querySelector('#speed');

    // The music panel's buttons are a separate element; on mobile nothing but
    // AUTO DRIVE may be tappable, so they are hidden along with the hints.
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
        // Restore the desktop corner panel
        hud.dataset.layout = 'desktop';
        hideMusicButtons(false);
        hud.style.top = '16px';
        hud.style.bottom = '';
        hud.style.left = '';
        hud.style.right = '16px';
        hud.style.width = '260px';
        hud.style.minWidth = '';
        hud.style.maxWidth = '';
        hud.style.borderWidth = '4px';
        hud.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.45)';
        hud.style.borderRadius = '12px';
        hud.style.padding = '10px 12px';
        if (speedEl) speedEl.style.fontSize = '24px';
        if (controls) controls.style.display = '';
        if (autoButton) {
            autoButton.style.marginTop = '8px';
            autoButton.style.padding = '6px 8px';
            autoButton.style.fontSize = '12px';
            autoButton.style.letterSpacing = '1px';
            autoButton.style.minHeight = '';
        }
        return;
    }

    // --- The whole panel becomes a bottom bar ---
    // The flag is what isHudMobileLayout() reads: comparing inline styles is
    // unreliable because browsers normalise '0' to '0px'.
    hud.dataset.layout = 'mobile';
    hud.style.top = 'auto';
    hud.style.bottom = '0';
    hud.style.left = '0';
    hud.style.right = '0';
    hud.style.width = 'auto';
    hud.style.minWidth = '0';
    hud.style.maxWidth = 'none';
    hud.style.borderWidth = '4px 0 0 0';
    hud.style.boxShadow = 'none';
    hud.style.borderRadius = '16px 16px 0 0';
    hud.style.padding = '8px 12px calc(8px + env(safe-area-inset-bottom, 0px)) 12px';

    // Keep the read-out compact so the button stays in thumb reach
    if (speedEl) speedEl.style.fontSize = '18px';

    // Keyboard hints are meaningless on a touch screen
    if (controls) controls.style.display = 'none';

    // Nothing else may be tappable on mobile
    hideMusicButtons(true);

    // --- One large AUTO button, pinned to the bottom ---
    if (autoButton) {
        autoButton.style.marginTop = '10px';
        autoButton.style.padding = '16px 12px';
        autoButton.style.fontSize = '16px';
        autoButton.style.letterSpacing = '2px';
        autoButton.style.minHeight = '60px';
    }
}

/**
 * True when the HUD is currently in the mobile (single-button) layout.
 * @param {HTMLElement} hud
 * @returns {boolean}
 */
export function isHudMobileLayout(hud) {
    if (!hud || !hud.dataset) return false;
    return hud.dataset.layout === 'mobile';
}

/**
 * Reflects the autopilot state on the AUTO button.
 * @param {HTMLElement} hud
 * @param {{active: boolean, reason?: string}} state
 */
export function setAutoButtonState(hud, state) {
    if (!hud) return;

    const button = hud.querySelector('#auto-button');
    if (!button) return;

    const on = Boolean(state && state.active);
    // Restyle only when the state flips, not on every frame
    if (button.dataset && button.dataset.on === String(on)) return;
    if (button.dataset) button.dataset.on = String(on);
    button.textContent = on ? 'AUTO ON - TAP TO STOP' : 'AUTO DRIVE';
    button.style.background = on ? '#4A90D9' : '#262633';
    button.style.color = on ? '#16161F' : '#4A90D9';
    button.style.borderColor = '#4A90D9';
}

/**
 * Updates HUD with the current speed, the trip status and the AUTO button.
 *
 * @param {HTMLElement} hud - HUD container
 * @param {number} speed - Current speed in units/sec
 * @param {{status?: string, message?: string, distanceKm?: number,
 *          nextTown?: {name: string, km: number},
 *          auto?: {active: boolean}}|number} [extra]
 *        Extra trip state; older callers that only pass a speed still work.
 */
export function updateHUD(hud, speed, extra = {}) {
    if (!hud) return;

    const info = typeof extra === 'object' && extra !== null ? extra : {};

    const speedKmh = Math.round(Math.abs(speed) * 3.6); // Convert to km/h
    const speedEl = hud.querySelector('#speed');
    if (speedEl) {
        // Padded to three digits so the line never changes width
        setText(speedEl, `SPEED: ${String(speedKmh).padStart(3)} KM/H`);

        // Color based on speed (palette-limited, no gradients)
        setColor(speedEl, speedKmh > 60 ? '#E74C3C' : speedKmh > 30 ? '#F39C12' : '#FFD700');
    }

    // --- Distance driven ---
    const distanceEl = hud.querySelector('#distance');
    if (distanceEl && typeof info.distanceKm === 'number') {
        setText(distanceEl, `DISTANCE: ${info.distanceKm.toFixed(1)} KM`);
    }

    // --- Next town from the roadside distance boards ---
    const nextTownEl = hud.querySelector('#next-town');
    if (nextTownEl && info.nextTown) {
        setText(nextTownEl, `NEXT: ${info.nextTown.name} ${Math.max(0, Math.round(info.nextTown.km))} KM`);
    }

    // --- Fuel, passengers, fares and safety ---
    const simEl = hud.querySelector('#sim');
    if (simEl && info.sim) {
        // Two fixed-width lines: padded numbers keep the panel from resizing
        const sim = info.sim;
        const pad = (value, width) => String(value).padStart(width);
        setText(simEl,
            `FUEL ${pad(sim.fuelPercent, 3)}%   PAX ${pad(sim.passengers, 2)}/${sim.capacity}\n` +
            `FARE ₹${pad(sim.fares, 5)}  SAFE ${pad(sim.safety, 3)}%`);
    }

    const statusEl = hud.querySelector('#status');
    if (statusEl) {
        let text = 'DRIVING';
        let color = '#2ECC71';

        if (info.auto && info.auto.active) {
            text = info.auto.overtaking ? 'AUTO OVERTAKING' : 'AUTO DRIVING';
            color = '#4A90D9';
        } else if (info.auto && info.auto.reason) {
            text = info.auto.reason;
            color = '#F39C12';
        } else if (info.sim && info.sim.message) {
            text = info.sim.message;
            color = '#F39C12';
        }

        setText(statusEl, text);
        setColor(statusEl, color);
    }

    if (info.auto) {
        setAutoButtonState(hud, info.auto);
    }
}

/**
 * Builds the pixel-art music panel (track title + playback controls).
 * The buttons are separate from #hud because that element has
 * pointer-events: none; this one has to receive clicks.
 * @returns {{panel: HTMLElement, title: HTMLElement, counter: HTMLElement,
 *            prevButton: HTMLElement, playButton: HTMLElement, nextButton: HTMLElement}}
 */
function createMusicPanel() {
    const panel = document.createElement('div');
    panel.id = 'music';
    panel.style.cssText = `
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 100;
        background: #16161F;
        color: #FFFFFF;
        font-family: 'Courier New', ui-monospace, monospace;
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 1px;
        text-transform: uppercase;
        padding: 10px 12px;
        border: 4px solid #4A90D9;
        border-radius: 12px;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
        min-width: 200px;
        max-width: 45vw;
    `;

    const title = document.createElement('div');
    title.id = 'track-title';
    title.style.cssText = `
        color: #4A90D9;
        margin-bottom: 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;
    title.textContent = 'MUSIC: LOADING...';
    panel.appendChild(title);

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

    const buttonStyle = `
        background: #262633;
        color: #FFD700;
        border: 2px solid #FFD700;
        border-radius: 6px;
        font-family: inherit;
        font-size: 11px;
        font-weight: bold;
        text-transform: uppercase;
        padding: 4px 8px;
        cursor: pointer;
        letter-spacing: 1px;
        touch-action: manipulation;
    `;

    const makeButton = (id, label) => {
        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = label;
        button.style.cssText = buttonStyle;
        buttons.appendChild(button);
        return button;
    };

    const prevButton = makeButton('music-prev', '<< PREV');
    const playButton = makeButton('music-play', 'PLAY');
    const nextButton = makeButton('music-next', 'NEXT >>');

    panel.appendChild(buttons);

    const counter = document.createElement('div');
    counter.id = 'track-counter';
    counter.style.cssText = 'color: #9AA0A6; margin-top: 8px; font-size: 10px;';
    counter.textContent = '1 / 1';
    panel.appendChild(counter);

    document.body.appendChild(panel);

    return { panel, buttonsRow: buttons, title, counter, prevButton, playButton, nextButton };
}

/**
 * Wires a music player to the music panel.
 *
 * On phones the panel is display-only: `showButtons: false` keeps the track
 * title and counter but renders no buttons at all, so AUTO DRIVE stays the only
 * control on the screen.
 *
 * @param {ReturnType<typeof createMusicPlayer>} player
 * @param {{showButtons?: boolean}} [options]
 */
export function createMusicUI(player, { showButtons = true } = {}) {
    const ui = createMusicPanel();

    if (!showButtons) {
        // Nothing to tap: drop the whole button row and just show the track
        const row = ui.buttonsRow;
        if (row && row.parentNode) row.parentNode.removeChild(row);

        player.onChange((state) => {
            ui.title.textContent = state.hasTracks
                ? `MUSIC: ${state.title}`
                : 'MUSIC: NO TRACKS FOUND';
            ui.title.title = state.hasTracks ? state.title : '';
            ui.counter.textContent = state.hasTracks
                ? `TRACK ${state.index + 1} / ${state.total}`
                : 'ADD MP3 FILES TO song/';
        });

        return ui;
    }

    // Keep the driving keys working while a button has focus
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
        ui.title.textContent = state.hasTracks
            ? `MUSIC: ${state.title}`
            : 'MUSIC: NO TRACKS FOUND';
        ui.title.title = state.hasTracks ? state.title : '';

        ui.playButton.textContent = state.isPlaying ? 'PAUSE' : 'PLAY';
        ui.counter.textContent = state.hasTracks
            ? `TRACK ${state.index + 1} / ${state.total}`
            : 'ADD MP3 FILES TO song/';

        const disabled = !state.hasTracks;
        [ui.prevButton, ui.playButton, ui.nextButton].forEach(button => {
            button.disabled = disabled;
            button.style.opacity = disabled ? '0.4' : '1';
            button.style.cursor = disabled ? 'not-allowed' : 'pointer';
        });
    });

    return ui;
}
