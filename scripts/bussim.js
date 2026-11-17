// =============================================
// BUS SIMULATION - the day-to-day work of running a bus
// Fuel burns while driving and is topped up at a petrol pump. Kerb-side bus
// stops hold passengers: when the bus stops at one, the doors open for a few
// seconds, passengers get off and on, and each boarding passenger pays a fare.
// A safety score falls with every crash and pedestrian hit, and
// lowers the fares. The horn is on the H key.
// =============================================

import * as THREE from 'three';
import { BUS_SIM, ROUTE, PLAYER_START_Z } from './constants.js';
import { roundedBox } from './rounded.js';
import { roadPoint, lateralOffset } from './roadpath.js';

const SIGN_FONT = '"Noto Sans Devanagari", "Nirmala UI", sans-serif';

// Below this speed the bus counts as stopped (for stops and pumps)
const STOPPED_SPEED = 1;

// A pump only counts when the bus is on the kerb of its side of the road
const PUMP_KERB_X = 3;

/**
 * Draws the shelter sign: a yellow board with the words for bus stop.
 * @returns {THREE.CanvasTexture}
 */
function createStopSignTexture(name = '') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#F5C400';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#16161F';
    ctx.fillRect(0, 0, 256, 10);
    ctx.fillRect(0, 118, 256, 10);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (name) {
        ctx.font = `bold ${name.length > 9 ? 30 : 38}px ${SIGN_FONT}`;
        ctx.fillText(name, 128, 48);
        ctx.font = `bold 26px ${SIGN_FONT}`;
        ctx.fillText('बस स्टॉप', 128, 90);
    } else {
        ctx.font = `bold 40px ${SIGN_FONT}`;
        ctx.fillText('बस स्टॉप', 128, 66);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Builds one kerb-side bus shelter: back wall, roof, bench and a sign that
 * faces the road. The shelter's local +X points at the road.
 * @returns {THREE.Group}
 */
function createBusStop(name = '') {
    const stop = new THREE.Group();

    const frame = new THREE.MeshLambertMaterial({ color: 0xB0B0B0 });
    const roof = new THREE.MeshLambertMaterial({ color: 0x2E7D32 });
    const bench = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });

    const add = (geometry, material, x, y, z) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        stop.add(mesh);
        return mesh;
    };

    add(roundedBox(0.15, 2.4, 3.2), roof, -0.9, 1.2, 0);       // back wall
    add(roundedBox(2.2, 0.2, 3.4), roof, -0.45, 2.5, 0);       // roof
    add(roundedBox(0.12, 2.5, 0.12), frame, 0.5, 1.25, -1.5);  // front posts
    add(roundedBox(0.12, 2.5, 0.12), frame, 0.5, 1.25, 1.5);
    add(roundedBox(0.6, 0.12, 2.6), bench, -0.5, 0.45, 0);     // bench

    const signTexture = createStopSignTexture(name);
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.8),
        new THREE.MeshBasicMaterial({ map: signTexture })
    );
    sign.position.set(0.85, 2.2, 0);
    sign.rotation.y = Math.PI / 2;
    stop.add(sign);

    stop.userData.isBusStop = true;
    stop.userData.waiting = 0;
    stop.userData.served = false;
    return stop;
}

/**
 * Puts a shelter at a route stop, with a crowd waiting at it. Towns have
 * bigger crowds than villages.
 * @param {THREE.Group} stop
 * @param {Object} config - an entry of ROUTE.STOPS
 */
function placeStop(stop, config) {
    // Beside the road (STOP_X is a distance from the centre line), square to it
    const p = roadPoint(PLAYER_START_Z - config.km * ROUTE.UNITS_PER_KM, BUS_SIM.STOP_X);
    stop.position.set(p.x, 0, p.z);
    stop.rotation.y = p.heading;
    const [min, max] = config.kind === 'town' ? ROUTE.TOWN_WAITING : ROUTE.VILLAGE_WAITING;
    stop.userData.served = false;
    stop.userData.waiting = min + Math.floor(Math.random() * (max - min + 1));
    stop.userData.routeStop = config;
    stop.userData.stopId = config.id;
    stop.userData.stopName = config.name;
    stop.userData.stopKind = config.kind;
}

/**
 * Creates the bus simulation: fuel, stops, passengers, fares, safety and horn.
 *
 * @param {{bus: THREE.Object3D, scene: THREE.Object3D, pumps: Array<THREE.Group>}} options
 * @returns {{
 *   stops: Array<THREE.Group>,
 *   update: (dt: number) => void,
 *   honk: () => void,
 *   setHornVolume: (volume: number) => void,
 *   getState: () => {fuelPercent: number, passengers: number, capacity: number,
 *                    fares: number, safety: number, doorsOpen: boolean, message: string}
 * }}
 */
export function createBusSim({ bus, scene, pumps = [], onStopServed = null }) {
    const data = bus.userData;

    // One shelter per route stop, standing where the route says
    const stops = [];
    for (const config of ROUTE.STOPS) {
        const stop = createBusStop(config.name);
        placeStop(stop, config);
        scene.add(stop);
        stops.push(stop);
    }

    const state = {
        fuel: BUS_SIM.FUEL_CAPACITY,   // litres
        passengers: 0,
        carried: 0,                    // passengers who boarded during the trip
        fares: 0,                      // rupees earned so far
        safety: BUS_SIM.SAFETY_MAX,
        dwell: 0,                      // seconds left with the doors open
        refuelling: false,
        // Hit counters already charged against the safety score
        seen: { impacts: 0, pedestrianHits: 0 }
    };

    let audio = null;
    let hornVolume = 1;     // 0..1, follows the game-sound setting

    /** @returns {THREE.Group|null} an unserved shelter the bus is stopped at */
    function findStopAtBus() {
        return stops.find(stop =>
            !stop.userData.served &&
            Math.abs(bus.position.z - stop.position.z) < BUS_SIM.STOP_ZONE &&
            Math.abs(lateralOffset(bus.position.x, bus.position.z) - BUS_SIM.STOP_X) < BUS_SIM.STOP_KERB_X
        ) || null;
    }

    /** @returns {THREE.Group|null} the petrol pump whose forecourt the bus is on */
    function findPumpAtBus() {
        const lateral = lateralOffset(bus.position.x, bus.position.z);
        return pumps.find(pump =>
            Math.abs(bus.position.z - pump.position.z) < BUS_SIM.PUMP_ZONE &&
            Math.sign(lateral) === pump.userData.side &&
            Math.abs(lateral) > PUMP_KERB_X
        ) || null;
    }

    /**
     * Opens the doors: passengers get off, the waiting crowd gets on, and the
     * fares for the boarding passengers are added (scaled by safety).
     * @param {THREE.Group} stop
     */
    function openDoors(stop) {
        const alighting = Math.floor(Math.random() * (state.passengers + 1));
        state.passengers -= alighting;

        const boarding = Math.min(stop.userData.waiting, BUS_SIM.PASSENGER_CAPACITY - state.passengers);
        state.passengers += boarding;
        state.carried += boarding;
        state.fares += boarding * BUS_SIM.FARE * (state.safety / BUS_SIM.SAFETY_MAX);

        stop.userData.waiting = 0;
        stop.userData.served = true;
        state.dwell = BUS_SIM.STOP_DWELL;
        data.doorsOpen = true;
        if (onStopServed && stop.userData.stopId) onStopServed(stop.userData.stopId);
    }

    /** Ends the trip at the terminus: everyone gets off and the doors open. */
    function finish() {
        state.passengers = 0;
        state.dwell = 0;
        data.doorsOpen = true;
        data.speed = 0;
    }

    /** Charges the safety score for every new crash and pedestrian hit. */
    function updateSafety() {
        // Red lights run (counted by junctions.js in data.redLightRuns) cost 6 safety each
        const redRuns = data.redLightRuns || 0;
        const lost =
            (data.impacts - state.seen.impacts) * BUS_SIM.SAFETY_CAR_HIT +
            (data.pedestrianHits - state.seen.pedestrianHits) * BUS_SIM.SAFETY_PEDESTRIAN_HIT +
            (redRuns - (state.redSeen || 0)) * 6;
        state.redSeen = redRuns;

        state.seen = {
            impacts: data.impacts,
            pedestrianHits: data.pedestrianHits
        };
        state.safety = Math.max(0, state.safety - lost);
    }

    /**
     * Advances stops, fuel and safety by one frame.
     * @param {number} dt - Delta time in seconds
     */
    function update(dt) {
        const stopped = Math.abs(data.speed) < STOPPED_SPEED;

        // --- Stops: doors open for a while once the bus has pulled up ---
        if (state.dwell > 0) {
            state.dwell = Math.max(0, state.dwell - dt);
            if (state.dwell === 0) data.doorsOpen = false;
        } else if (stopped) {
            const stop = findStopAtBus();
            if (stop) openDoors(stop);
        }

        // --- Fuel: the engine burns it, the pump refills it while stopped ---
        const pump = stopped ? findPumpAtBus() : null;
        state.refuelling = Boolean(pump) && state.fuel < BUS_SIM.FUEL_CAPACITY;

        if (state.refuelling) {
            state.fuel = Math.min(BUS_SIM.FUEL_CAPACITY, state.fuel + BUS_SIM.REFUEL_RATE * dt);
        } else {
            const load = Math.min(1, Math.abs(data.speed) / data.maxSpeed);
            const burn = (BUS_SIM.FUEL_IDLE_RATE + BUS_SIM.FUEL_DRIVE_RATE * load) * ROUTE.FUEL_BURN_SCALE;
            state.fuel = Math.max(0, state.fuel - burn * dt);
        }
        data.noFuel = state.fuel <= 0;

        updateSafety();
    }

    /**
     * Sounds the horn (a short square-wave beep, generated in the browser).
     * Does nothing where the Web Audio API is not available.
     */
    function honk() {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context || hornVolume <= 0) return;

        audio = audio || new Context();
        if (audio.state === 'suspended') audio.resume();

        const now = audio.currentTime;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'square';
        oscillator.frequency.value = BUS_SIM.HORN_FREQUENCY;
        const peak = 0.12 * hornVolume;
        gain.gain.setValueAtTime(peak, now);
        gain.gain.setValueAtTime(peak, now + 0.35);
        gain.gain.linearRampToValueAtTime(0, now + 0.45);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
    }

    /** @returns {string} the most important warning for the HUD, or '' */
    function message() {
        if (data.doorsOpen) return 'DOORS OPEN - PASSENGERS BOARDING';
        if (state.refuelling) return 'REFUELLING AT PUMP';
        if (state.fuel <= 0) return 'OUT OF FUEL';
        if (state.fuel < BUS_SIM.FUEL_CAPACITY * 0.15) return 'LOW FUEL - FIND A PUMP';
        return '';
    }

    return {
        stops,
        update,
        honk,
        /** @param {number} value - 0..1 (0 silences the horn) */
        setHornVolume(value) {
            const v = Number(value);
            hornVolume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
        },
        finish,
        getState: () => ({
            carried: state.carried,
            impacts: state.seen.impacts,
            pedestrianHits: state.seen.pedestrianHits,
            noFuel: state.fuel <= 0,
            fuelPercent: Math.round((state.fuel / BUS_SIM.FUEL_CAPACITY) * 100),
            passengers: state.passengers,
            capacity: BUS_SIM.PASSENGER_CAPACITY,
            fares: Math.round(state.fares),
            safety: Math.round(state.safety),
            doorsOpen: Boolean(data.doorsOpen),
            message: message()
        })
    };
}
