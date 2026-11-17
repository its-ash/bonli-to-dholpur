// =============================================
// SOUND SETTINGS
// Music and game-sound (engine, horn, effects) switches and volumes, saved in
// localStorage so they survive a restart or a reload.
// =============================================

import { MUSIC_VOLUME } from './constants.js';

const STORAGE_KEY = 'bonli-jaipur-sound-v1';

export const SOUND_DEFAULTS = Object.freeze({
    musicOn: true,
    musicVolume: MUSIC_VOLUME,  // 0..1
    sfxOn: true,
    sfxVolume: 0.8              // 0..1
});

const clamp01 = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

/** Cleans a stored / patched object into a valid settings object. */
function sanitize(raw, base = SOUND_DEFAULTS) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        musicOn: typeof src.musicOn === 'boolean' ? src.musicOn : base.musicOn,
        musicVolume: clamp01(src.musicVolume, base.musicVolume),
        sfxOn: typeof src.sfxOn === 'boolean' ? src.sfxOn : base.sfxOn,
        sfxVolume: clamp01(src.sfxVolume, base.sfxVolume)
    };
}

function getStorage() {
    try {
        const s = globalThis.localStorage;
        return s && typeof s.getItem === 'function' ? s : null;
    } catch (e) {
        return null;    // blocked (private mode, file://, sandbox)
    }
}

/**
 * Creates the sound settings store.
 * @returns {{
 *   get: () => typeof SOUND_DEFAULTS,
 *   set: (patch: Object) => typeof SOUND_DEFAULTS,
 *   reset: () => typeof SOUND_DEFAULTS,
 *   toggleAll: () => typeof SOUND_DEFAULTS,
 *   onChange: (fn: Function) => Function
 * }}
 */
export function createSoundSettings() {
    const storage = getStorage();
    let state = { ...SOUND_DEFAULTS };
    if (storage) {
        try {
            state = sanitize(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
        } catch (e) {
            state = { ...SOUND_DEFAULTS };
        }
    }
    const listeners = new Set();

    function commit(next) {
        state = next;
        if (storage) {
            try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* full / blocked */ }
        }
        listeners.forEach(fn => fn({ ...state }));
        return { ...state };
    }

    return {
        get: () => ({ ...state }),
        set: (patch) => commit(sanitize({ ...state, ...patch }, state)),
        reset: () => commit({ ...SOUND_DEFAULTS }),
        /** M key: silence everything, or bring everything back */
        toggleAll() {
            const anyOn = state.musicOn || state.sfxOn;
            return commit({ ...state, musicOn: !anyOn, sfxOn: !anyOn });
        },
        onChange(fn) {
            listeners.add(fn);
            fn({ ...state });
            return () => listeners.delete(fn);
        }
    };
}
