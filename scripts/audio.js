// =============================================
// BUS AUDIO - everything is synthesised with the Web Audio API (no files)
// Diesel engine tied to rpm / throttle, gear-shift hiss, air-brake "pssh",
// indicator tick-tock, tyre / gravel rumble and wind. Starts on the first user
// gesture; M mutes. The horn stays in bussim.js (its volume follows the
// same game-sound setting, see busSim.setHornVolume).
// =============================================

const MASTER_LEVEL = 0.55;

/**
 * Creates a looping white-noise buffer source.
 * @param {AudioContext} ctx
 * @returns {AudioBufferSourceNode}
 */
function createNoiseSource(ctx) {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
}

/**
 * Creates the audio engine for the bus.
 *
 * @returns {{
 *   start: () => void,
 *   update: (bus: Object, dt: number, options?: {paused?: boolean}) => void,
 *   setMuted: (muted: boolean) => void,
 *   setVolume: (volume: number) => void,
 *   getVolume: () => number,
 *   toggleMute: () => boolean,
 *   isMuted: () => boolean,
 *   isRunning: () => boolean
 * }}
 */
export function createBusAudio() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    let ctx = null;
    let nodes = null;
    let muted = false;
    let volume = 1;               // 0..1, from the sound settings
    let wanted = false;           // a gesture asked for audio
    const level = () => (muted ? 0 : MASTER_LEVEL * volume);
    const last = { shiftCount: 0, doorsOpen: false, braking: false, lamp: 0, impacts: 0, speed: 0 };

    function build() {
        ctx = new Context();
        const master = ctx.createGain();
        master.gain.value = level();
        master.connect(ctx.destination);

        // --- Engine: sawtooth firing pulses + octave + sub, through a low-pass ---
        const engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 400;
        engineFilter.Q.value = 2;
        const oscA = ctx.createOscillator();
        oscA.type = 'sawtooth';
        const oscB = ctx.createOscillator();
        oscB.type = 'square';
        const oscSub = ctx.createOscillator();
        oscSub.type = 'triangle';
        const gA = ctx.createGain(); gA.gain.value = 0.5;
        const gB = ctx.createGain(); gB.gain.value = 0.18;
        const gSub = ctx.createGain(); gSub.gain.value = 0.6;
        oscA.connect(gA); oscB.connect(gB); oscSub.connect(gSub);
        gA.connect(engineFilter); gB.connect(engineFilter); gSub.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);

        // Rough diesel clatter: a slow tremolo on the engine level
        const lfo = ctx.createOscillator();
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 0.02;
        lfo.connect(lfoDepth);
        lfoDepth.connect(engineGain.gain);

        // Intake / turbo whoosh follows the throttle
        const turbo = createNoiseSource(ctx);
        const turboFilter = ctx.createBiquadFilter();
        turboFilter.type = 'bandpass';
        turboFilter.frequency.value = 1800;
        turboFilter.Q.value = 1.2;
        const turboGain = ctx.createGain();
        turboGain.gain.value = 0;
        turbo.connect(turboFilter); turboFilter.connect(turboGain); turboGain.connect(master);

        // --- Road: tyre hum (asphalt) and gravel crunch (shoulder) ---
        const road = createNoiseSource(ctx);
        const roadFilter = ctx.createBiquadFilter();
        roadFilter.type = 'lowpass';
        roadFilter.frequency.value = 500;
        const roadGain = ctx.createGain();
        roadGain.gain.value = 0;
        road.connect(roadFilter); roadFilter.connect(roadGain); roadGain.connect(master);

        const gravel = createNoiseSource(ctx);
        gravel.playbackRate.value = 0.8;
        const gravelFilter = ctx.createBiquadFilter();
        gravelFilter.type = 'bandpass';
        gravelFilter.frequency.value = 1100;
        gravelFilter.Q.value = 0.6;
        const gravelGain = ctx.createGain();
        gravelGain.gain.value = 0;
        gravel.connect(gravelFilter); gravelFilter.connect(gravelGain); gravelGain.connect(master);

        // --- Wind ---
        const wind = createNoiseSource(ctx);
        wind.playbackRate.value = 0.6;
        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 600;
        windFilter.Q.value = 0.5;
        const windGain = ctx.createGain();
        windGain.gain.value = 0;
        wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);

        [oscA, oscB, oscSub, lfo, turbo, road, gravel, wind].forEach(n => n.start());

        nodes = {
            master, engineGain, engineFilter, oscA, oscB, oscSub, lfo,
            turboGain, turboFilter, roadGain, roadFilter, gravelGain, windGain, windFilter
        };
    }

    /** One-shot noise burst (hiss / pssh), shaped by a filter and a decay. */
    function burst({ type = 'highpass', freq = 3000, peak = 0.3, attack = 0.02, length = 0.4, q = 0.7 }) {
        if (!ctx || !nodes) return;
        const now = ctx.currentTime;
        const src = createNoiseSource(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + attack);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + attack + length);
        src.connect(filter); filter.connect(gain); gain.connect(nodes.master);
        src.start(now);
        src.stop(now + attack + length + 0.05);
    }

    function shiftHiss() {
        burst({ type: 'highpass', freq: 3500, peak: 0.12, attack: 0.01, length: 0.25 });
        thump(70, 0.12);
    }

    function airBrake() {
        burst({ type: 'highpass', freq: 2200, peak: 0.34, attack: 0.015, length: 0.75 });
    }

    /** Short low sine drop: gear clunk or crash. */
    function thump(freq, peak) {
        if (!ctx || !nodes) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), now + 0.25);
        gain.gain.setValueAtTime(peak, now);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.3);
        osc.connect(gain); gain.connect(nodes.master);
        osc.start(now);
        osc.stop(now + 0.35);
    }

    /** Indicator relay: a sharp tick when the lamp lights, a softer tock when it goes out. */
    function tick(on) {
        if (!ctx || !nodes) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = on ? 2300 : 1500;
        gain.gain.setValueAtTime(on ? 0.1 : 0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.03);
        osc.connect(gain); gain.connect(nodes.master);
        osc.start(now);
        osc.stop(now + 0.04);
    }

    function start() {
        wanted = true;
        if (!Context) return;
        try {
            if (!ctx) build();
            if (ctx.state === 'suspended') ctx.resume();
        } catch (e) {
            // Audio is a bonus: never break the game
            ctx = null;
            nodes = null;
        }
    }

    // The first key press or tap anywhere also starts the sound (autoplay rules)
    if (typeof window !== 'undefined' && window.addEventListener) {
        const gesture = () => start();
        ['pointerdown', 'keydown', 'touchstart'].forEach(type =>
            window.addEventListener(type, gesture, { once: true }));
    }

    function ramp(param, value, tau = 0.08) {
        param.setTargetAtTime(value, ctx.currentTime, tau);
    }

    /**
     * Drives every sound from the bus state. Call once per frame.
     * @param {Object} bus - bus Object3D (userData has speed, rpm, throttle ...)
     * @param {number} dt
     * @param {{paused?: boolean}} [options]
     */
    function update(bus, dt, { paused = false } = {}) {
        if (!ctx || !nodes || ctx.state !== 'running') return;
        const d = bus.userData;
        const speed = Math.abs(d.speed || 0);
        const speedFrac = Math.min(1, speed / (d.maxSpeed || 25));
        const rpm = d.rpm || 750;
        const throttle = d.throttle || 0;
        const rpmFrac = Math.max(0, Math.min(1, (rpm - 700) / 1900));

        ramp(nodes.master.gain, paused ? 0 : level(), 0.05);

        // --- Engine ---
        const firing = rpm / 60 * 3;                        // 6-cylinder, 4-stroke
        const wobble = 1 + Math.sin(ctx.currentTime * 7) * 0.004;
        nodes.oscA.frequency.setTargetAtTime(firing * wobble, ctx.currentTime, 0.03);
        nodes.oscB.frequency.setTargetAtTime(firing * 2 * wobble, ctx.currentTime, 0.03);
        nodes.oscSub.frequency.setTargetAtTime(firing * 0.5, ctx.currentTime, 0.03);
        nodes.lfo.frequency.setTargetAtTime(firing * 0.5, ctx.currentTime, 0.1);
        const load = d.shifting > 0 ? 0.1 : throttle;
        ramp(nodes.engineFilter.frequency, 260 + 520 * load + 480 * rpmFrac);
        ramp(nodes.engineGain.gain, d.noFuel ? 0 : 0.085 + 0.09 * load + 0.04 * rpmFrac, 0.06);
        ramp(nodes.turboGain.gain, d.noFuel ? 0 : 0.18 * Math.max(0, load - 0.2) * rpmFrac, 0.1);
        ramp(nodes.turboFilter.frequency, 1200 + 2500 * rpmFrac);

        // --- Road, gravel, wind ---
        const rolling = Math.min(1, speed / 6);
        ramp(nodes.roadGain.gain, d.onShoulder ? 0 : 0.2 * speedFrac * rolling);
        ramp(nodes.roadFilter.frequency, 250 + 700 * speedFrac);
        ramp(nodes.gravelGain.gain, d.onShoulder ? 0.5 * Math.min(1, speed / 8) : 0);
        ramp(nodes.windGain.gain, 0.22 * speedFrac * speedFrac);
        ramp(nodes.windFilter.frequency, 350 + 900 * speedFrac);

        // --- One-shots ---
        if (d.shiftCount > last.shiftCount) shiftHiss();
        last.shiftCount = d.shiftCount || 0;

        // Air brake: doors opening, doors closing and a hard stop
        if (d.doorsOpen !== last.doorsOpen) airBrake();
        last.doorsOpen = Boolean(d.doorsOpen);
        const hardStop = last.speed > 4 && speed < 0.2 && d.braking;
        if (hardStop) airBrake();
        last.speed = speed;
        if (d.handbrake && !last.braking && speed < 0.5) burst({ type: 'highpass', freq: 1800, peak: 0.2, length: 0.35 });
        last.braking = Boolean(d.handbrake);

        const lamp = d.indicatorLamp || 0;
        if (lamp !== last.lamp) tick(lamp !== 0);
        last.lamp = lamp;

        const impacts = d.impactCount || 0;
        if (impacts > last.impacts) {
            thump(90, 0.5);
            burst({ type: 'lowpass', freq: 900, peak: 0.4, length: 0.4 });
        }
        last.impacts = impacts;
    }

    function setMuted(value) {
        muted = Boolean(value);
        if (ctx && nodes) nodes.master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
    }

    function setVolume(value) {
        const v = Number(value);
        volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
        if (ctx && nodes) nodes.master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
    }

    return {
        start,
        update,
        setMuted,
        setVolume,
        getVolume: () => volume,
        toggleMute() { setMuted(!muted); return muted; },
        isMuted: () => muted,
        isRunning: () => Boolean(ctx && ctx.state === 'running' && wanted)
    };
}
