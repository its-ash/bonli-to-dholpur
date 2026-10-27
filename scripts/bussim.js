// =============================================
// BUS SIMULATION - the day-to-day work of running a bus
// Fuel burns while driving and is topped up at a petrol pump. Kerb-side bus
// stops hold passengers: when the bus stops at one, the doors open for a few
// seconds, passengers get off and on, and each boarding passenger pays a fare.
// A safety score falls with every crash and pedestrian hit, and
// lowers the fares. The horn is on the H key.
// =============================================

import * as THREE from 'three';
import { BUS_SIM, PLAYER_START_Z } from './constants.js';
import { recycleBehind } from './endless.js';

const SIGN_FONT = '"Noto Sans Devanagari", "Nirmala UI", sans-serif';

// First shelter sits this far ahead of the start, and shelters are kept this
// far behind the bus before they are moved to the far end of the road
const STOP_FIRST_LEAD = 180;
const STOP_RECYCLE_BEHIND = 90;

// Below this speed the bus counts as stopped (for stops and pumps)
const STOPPED_SPEED = 1;

// A pump only counts when the bus is on the kerb of its side of the road
const PUMP_KERB_X = 3;

/**
 * Draws the shelter sign: a yellow board with the words for bus stop.
 * @returns {THREE.CanvasTexture}
 */
function createStopSignTexture() {
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
    ctx.font = `bold 40px ${SIGN_FONT}`;
    ctx.fillText('बस स्टॉप', 128, 66);

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
function createBusStop() {
    const stop = new THREE.Group();

    const frame = new THREE.MeshLambertMaterial({ color: 0xB0B0B0, flatShading: true });
    const roof = new THREE.MeshLambertMaterial({ color: 0x2E7D32, flatShading: true });
    const bench = new THREE.MeshLambertMaterial({ color: 0x8B5A2B, flatShading: true });

    const add = (geometry, material, x, y, z) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        stop.add(mesh);
        return mesh;
    };

    add(new THREE.BoxGeometry(0.15, 2.4, 3.2), roof, -0.9, 1.2, 0);       // back wall
    add(new THREE.BoxGeometry(2.2, 0.2, 3.4), roof, -0.45, 2.5, 0);       // roof
    add(new THREE.BoxGeometry(0.12, 2.5, 0.12), frame, 0.5, 1.25, -1.5);  // front posts
    add(new THREE.BoxGeometry(0.12, 2.5, 0.12), frame, 0.5, 1.25, 1.5);
    add(new THREE.BoxGeometry(0.6, 0.12, 2.6), bench, -0.5, 0.45, 0);     // bench

    const signTexture = createStopSignTexture();
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
 * Moves a shelter to a new z, with a fresh crowd waiting at it.
 * @param {THREE.Group} stop
 * @param {number} z
 */
function placeStop(stop, z) {
    stop.position.set(BUS_SIM.STOP_X, 0, z);
    stop.userData.served = false;
    stop.userData.waiting = Math.floor(Math.random() * (BUS_SIM.STOP_WAITING_MAX + 1));
}

/**
 * Creates the bus simulation: fuel, stops, passengers, fares, safety and horn.
 *
 * @param {{bus: THREE.Object3D, scene: THREE.Object3D, pumps: Array<THREE.Group>}} options
 * @returns {{
 *   stops: Array<THREE.Group>,
 *   update: (dt: number) => void,
 *   honk: () => void,
 *   getState: () => {fuelPercent: number, passengers: number, capacity: number,
 *                    fares: number, safety: number, doorsOpen: boolean, message: string}
 * }}
 */
export function createBusSim({ bus, scene, pumps = [] }) {
    const data = bus.userData;

    const stops = [];
    for (let i = 0; i < BUS_SIM.STOP_COUNT; i++) {
        const stop = createBusStop();
        placeStop(stop, PLAYER_START_Z - STOP_FIRST_LEAD - i * BUS_SIM.STOP_SPACING_MIN);
        scene.add(stop);
        stops.push(stop);
    }

    const state = {
        fuel: BUS_SIM.FUEL_CAPACITY,   // litres
        passengers: 0,
        fares: 0,                      // rupees earned so far
        safety: BUS_SIM.SAFETY_MAX,
        dwell: 0,                      // seconds left with the doors open
        refuelling: false,
        // Hit counters already charged against the safety score
        seen: { impacts: 0, pedestrianHits: 0 }
    };

    let audio = null;

    /** @returns {THREE.Group|null} an unserved shelter the bus is stopped at */
    function findStopAtBus() {
        return stops.find(stop =>
            !stop.userData.served &&
            Math.abs(bus.position.z - stop.position.z) < BUS_SIM.STOP_ZONE &&
            Math.abs(bus.position.x - BUS_SIM.STOP_X) < BUS_SIM.STOP_KERB_X
        ) || null;
    }

    /** @returns {THREE.Group|null} the petrol pump whose forecourt the bus is on */
    function findPumpAtBus() {
        return pumps.find(pump =>
            Math.abs(bus.position.z - pump.position.z) < BUS_SIM.PUMP_ZONE &&
            Math.sign(bus.position.x) === pump.userData.side &&
            Math.abs(bus.position.x) > PUMP_KERB_X
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
        state.fares += boarding * BUS_SIM.FARE * (state.safety / BUS_SIM.SAFETY_MAX);

        stop.userData.waiting = 0;
        stop.userData.served = true;
        state.dwell = BUS_SIM.STOP_DWELL;
        data.doorsOpen = true;
    }

    /** Charges the safety score for every new crash and pedestrian hit. */
    function updateSafety() {
        const lost =
            (data.impacts - state.seen.impacts) * BUS_SIM.SAFETY_CAR_HIT +
            (data.pedestrianHits - state.seen.pedestrianHits) * BUS_SIM.SAFETY_PEDESTRIAN_HIT;

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
        recycleBehind(stops, bus.position.z, {
            behind: STOP_RECYCLE_BEHIND,
            gapFor: () => BUS_SIM.STOP_SPACING_MIN +
                Math.random() * (BUS_SIM.STOP_SPACING_MAX - BUS_SIM.STOP_SPACING_MIN),
            place: placeStop
        });

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
            const burn = BUS_SIM.FUEL_IDLE_RATE + BUS_SIM.FUEL_DRIVE_RATE * load;
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
        if (!Context) return;

        audio = audio || new Context();
        if (audio.state === 'suspended') audio.resume();

        const now = audio.currentTime;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'square';
        oscillator.frequency.value = BUS_SIM.HORN_FREQUENCY;
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.12, now + 0.35);
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
        getState: () => ({
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
