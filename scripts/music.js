// =============================================
// MUSIC PLAYER
// Plays the playlist from song/ and exposes simple controls for the HUD.
// =============================================

import { SONG_PLAYLIST, MUSIC_VOLUME } from './constants.js';

/**
 * Turns a file path into a readable track title
 * @param {string} path - e.g. 'song/Some Track.mp3'
 * @returns {string}
 */
function titleFromPath(path) {
    const file = path.split('/').pop() || path;
    return decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');
}

/**
 * Creates the music player.
 * Browsers block audio until the user interacts with the page, so playback
 * starts on the first key press / click (see startOnFirstInteraction).
 * @param {Object} [options]
 * @param {Array<string>} [options.playlist] - Track paths
 * @param {number} [options.volume] - 0..1
 * @returns {Object} player
 */
export function createMusicPlayer({ playlist = SONG_PLAYLIST, volume = MUSIC_VOLUME } = {}) {
    const tracks = playlist.filter(Boolean).map(path => ({
        path,
        title: titleFromPath(path)
    }));

    const audio = new Audio();
    audio.volume = volume;
    audio.preload = 'auto';

    let index = 0;
    let started = false;
    let muted = false;

    const listeners = new Set();

    const current = () => tracks[index] || null;

    function buildState() {
        return {
            tracks,
            index,
            title: current() ? current().title : 'NO TRACKS',
            isPlaying: started && !audio.paused,
            isMuted: muted,
            hasTracks: tracks.length > 0,
            total: tracks.length,
            currentTime: audio.currentTime || 0,
            duration: Number.isFinite(audio.duration) ? audio.duration : 0,
            error: audio.error ? audio.error.code : null
        };
    }

    function notify() {
        const state = buildState();
        listeners.forEach(fn => fn(state));
    }

    function load(indexToLoad) {
        if (tracks.length === 0) return;
        index = ((indexToLoad % tracks.length) + tracks.length) % tracks.length;
        audio.src = tracks[index].path;
        notify();
    }

    async function play() {
        if (tracks.length === 0) return false;
        try {
            await audio.play();
            started = true;
            notify();
            return true;
        } catch (err) {
            // Autoplay block or unsupported file: the next user gesture retries
            notify();
            return false;
        }
    }

    function pause() {
        audio.pause();
        notify();
    }

    function toggle() {
        if (audio.paused) {
            play();
        } else {
            pause();
        }
    }

    function next() {
        if (tracks.length === 0) return;
        // With a single track there is nowhere to advance to: restart it so the
        // NEXT button still does something useful.
        if (tracks.length === 1) {
            audio.currentTime = 0;
            play();
            return;
        }
        load(index + 1);
        play();
    }

    function previous() {
        if (tracks.length === 0) return;
        // Restart the track when more than 3s have played
        if (tracks.length === 1 || audio.currentTime > 3) {
            audio.currentTime = 0;
            play();
            return;
        }
        load(index - 1);
        play();
    }

    function setMuted(value) {
        muted = value;
        audio.muted = muted;
        notify();
    }

    function setVolume(value) {
        audio.volume = Math.max(0, Math.min(1, value));
        notify();
    }

    // Auto-advance to the next track
    audio.addEventListener('ended', () => next());

    // Skip tracks that cannot be decoded instead of stopping the music
    audio.addEventListener('error', () => {
        if (tracks.length <= 1) {
            notify();
            return;
        }
        const failed = index;
        load(index + 1);
        if (index !== failed) play();
    });

    audio.addEventListener('play', notify);
    audio.addEventListener('pause', notify);
    audio.addEventListener('volumechange', notify);

    load(0);

    const player = {
        tracks,
        // Exposed so callers (and tests) can inspect the media element
        audio,
        play,
        pause,
        toggle,
        next,
        previous,
        setMuted,
        setVolume,
        getState: buildState,
        /**
         * Registers a state listener, calls it immediately, returns an unsubscribe fn
         * @param {Function} fn
         * @returns {Function}
         */
        onChange(fn) {
            listeners.add(fn);
            fn(buildState());
            return () => listeners.delete(fn);
        },
        /**
         * Starts playback on the first user gesture (browser autoplay policy)
         */
        startOnFirstInteraction() {
            if (started) return;
            const start = () => {
                if (!started) play();
                window.removeEventListener('pointerdown', start);
                window.removeEventListener('keydown', start);
            };
            window.addEventListener('pointerdown', start);
            window.addEventListener('keydown', start);
        }
    };

    return player;
}
