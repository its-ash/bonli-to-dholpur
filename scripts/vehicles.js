// =============================================
// VEHICLES - Bus and AI Cars
// =============================================

import * as THREE from 'three';
import {
    BUS_LENGTH, BUS_WIDTH, BUS_HEIGHT, WHEEL_RADIUS, WHEEL_WIDTH,
    CAR_LENGTH, TRAFFIC_TYPES, TRAFFIC_MIX, TRAFFIC_CAR_PAINTS,
    LANE_LEFT, LANE_RIGHT, LANES_FORWARD, LANES_ONCOMING,
    PLAYER_START_Z, ROAD_LENGTH, ROAD_HALF_WIDTH,
    COLORS, PHYSICS, TRAFFIC_LANE_CHANGE, ANIM,
    SAME_DIRECTION_CAR_COUNT, ONCOMING_CAR_COUNT, HEART_TEXT_LINES
} from './constants.js';
import { createBusBodyTexture, createHeartTextTexture } from './utils.js';
import { roadPoint, roadHeading, lateralOffset } from './roadpath.js';
import {
    CAR_STYLES, buildCarModel, buildAuto, buildBike, buildBicycle, buildTruck, buildTractor, animateModel
} from './traffic_models.js';
import { separateVehicles, resolveVehicleImpact } from './collision.js';
import { roundedBox, lerp, setHex, setRGB, cloneMaterial } from './rounded.js';

// How far ahead of / behind the bus AI traffic is kept alive. Anything further
// than this is recycled back into view (the road itself never ends).
const TRAFFIC_AHEAD = 260;
const TRAFFIC_BEHIND = 120;

/** Soft fading light pool for the headlight beams (bright at the bus, gone far ahead). */
function createBeamTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    // The plane's +Y (top of the texture) ends up further from the bus
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 64);
    const edge = ctx.createLinearGradient(0, 0, 32, 0);
    edge.addColorStop(0, 'rgba(0,0,0,0.9)');
    edge.addColorStop(0.5, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, 32, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Creates the player bus
 * @returns {THREE.Group} Bus group with all components
 */
export function createBus() {
    // rootGroup is what the game moves; busGroup is the sprung body inside it
    // (bob / pitch), while the wheels hang off the root so they stay planted.
    const rootGroup = new THREE.Group();
    const busGroup = new THREE.Group();
    rootGroup.add(busGroup);

    // Initialize physics userData
    rootGroup.userData = {
        speed: 0,
        maxSpeed: PHYSICS.BUS_MAX_SPEED,
        acceleration: PHYSICS.BUS_ACCELERATION,
        brakeForce: PHYSICS.BUS_BRAKE_FORCE,
        drag: PHYSICS.BUS_DRAG,
        steer: 0,            // smoothed wheel input, -1 (right) to +1 (left)
        roll: 0,             // body lean in radians
        doorsOpen: false,    // held at a stop while passengers board
        noFuel: false,       // engine stops when the tank is empty
        impacts: 0,          // hard hits on traffic (counted by physics)
        pedestrianHits: 0
    };

    // Create pixel-art body texture
    const bodyTexture = createBusBodyTexture();

    // --- Bus Body ---
    // Lambert + flat shading keeps the surfaces flat and saturated (pixel-art),
    // instead of the smooth PBR gradients of MeshStandardMaterial.
    const bodyGeometry = roundedBox(BUS_WIDTH, BUS_HEIGHT - 0.5, BUS_LENGTH);
    const bodyMaterial = new THREE.MeshLambertMaterial({
        map: bodyTexture
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = (BUS_HEIGHT - 0.5) / 2 + 0.3;
    body.castShadow = true;
    body.receiveShadow = true;
    busGroup.add(body);

    // --- Cabin/Windows ---
    const cabinWidth = BUS_WIDTH * 0.9;
    const cabinHeight = 1.6;
    const cabinDepth = 3.5;
    const cabinGeometry = roundedBox(cabinWidth, cabinHeight, cabinDepth);
    const cabinMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.BUS_CABIN,
        transparent: true,
        opacity: 0.85
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(0, BUS_HEIGHT - cabinHeight / 2 - 0.1, -BUS_LENGTH / 2 + cabinDepth / 2 + 0.5);
    cabin.castShadow = true;
    busGroup.add(cabin);

    // --- Roof ---
    const roofGeometry = roundedBox(BUS_WIDTH + 0.1, 0.2, BUS_LENGTH + 0.2);
    const roofMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.BUS_ROOF
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = BUS_HEIGHT + 0.1;
    roof.castShadow = true;
    busGroup.add(roof);

    // --- Wheels ---
    // A CylinderGeometry is built around the Y axis. Rotating the tyre around Z
    // by 90 degrees puts the axle along X, so the tyre rolls fore/aft
    // (before, the tyres were rotated around X and lay flat like barrels).
    const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 8);
    const wheelMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.BUS_WHEEL
    });
    const hubMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.WHEEL_HUB
    });

    const wheelPositions = [
        { x: -BUS_WIDTH / 2 - WHEEL_WIDTH / 2, z: BUS_LENGTH / 2 - 1.5 },
        { x: BUS_WIDTH / 2 + WHEEL_WIDTH / 2, z: BUS_LENGTH / 2 - 1.5 },
        { x: -BUS_WIDTH / 2 - WHEEL_WIDTH / 2, z: -BUS_LENGTH / 2 + 1.5 },
        { x: BUS_WIDTH / 2 + WHEEL_WIDTH / 2, z: -BUS_LENGTH / 2 + 1.5 }
    ];

    // Wheels are wrapped in groups so the physics module can spin them around
    // their axle (group rotation) independently of the tyre orientation.
    const wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Group();

        const tyre = new THREE.Mesh(wheelGeometry, wheelMaterial);
        tyre.rotation.z = Math.PI / 2;
        tyre.castShadow = true;
        tyre.receiveShadow = true;
        wheel.add(tyre);

        // Blocky hub cap so the spin is readable in pixel-art style
        const hub = new THREE.Mesh(
            roundedBox(WHEEL_WIDTH * 1.1, WHEEL_RADIUS * 0.7, WHEEL_RADIUS * 0.7),
            hubMaterial
        );
        hub.castShadow = true;
        wheel.add(hub);

        wheel.position.set(pos.x, WHEEL_RADIUS, pos.z);
        // Yaw outside, spin inside, so front wheels can steer while rolling
        wheel.rotation.order = 'YXZ';
        wheel.userData.isFront = pos.z < 0;
        wheels.push(wheel);
        rootGroup.add(wheel);
    });
    rootGroup.userData.wheels = wheels;
    rootGroup.userData.wheelRadius = WHEEL_RADIUS;
    rootGroup.userData.body = busGroup;

    // --- Front Bumper (models face -Z, which is the forward direction) ---
    const bumperGeometry = roundedBox(BUS_WIDTH + 0.2, 0.4, 0.3);
    const bumperMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.BUS_BUMPER
    });
    const bumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
    bumper.position.set(0, 0.6, -BUS_LENGTH / 2 - 0.15);
    bumper.castShadow = true;
    busGroup.add(bumper);

    // --- Headlights (emissive) ---
    const headlightGeometry = roundedBox(0.4, 0.25, 0.05);
    const headlightMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.HEADLIGHT
    });

    const headlightPositions = [
        { x: -BUS_WIDTH / 2 + 0.6, y: 0.7 },
        { x: BUS_WIDTH / 2 - 0.6, y: 0.7 }
    ];

    // Lamps stay a dull cream until the driver switches the headlights on (L)
    setHex(headlightMaterial, 0xB9B49A);
    const beamTexture = createBeamTexture();
    const beamMat = new THREE.MeshBasicMaterial({
        map: beamTexture, color: 0xFFF3B0, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2
    });
    headlightPositions.forEach(pos => {
        const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        headlight.position.set(pos.x, pos.y, -BUS_LENGTH / 2 - 0.2);
        busGroup.add(headlight);

        // Light pool on the road ahead of each lamp
        const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 18), beamMat);
        beam.rotation.x = -Math.PI / 2;
        beam.position.set(pos.x * 0.8, 0.07, -BUS_LENGTH / 2 - 9.5);
        beam.renderOrder = 2;
        busGroup.add(beam);
    });

    // --- Rear Lights ---
    const rearLightGeometry = roundedBox(0.5, 0.3, 0.05);
    const rearLightMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.TAILLIGHT
    });

    const rearLightPositions = [
        { x: -BUS_WIDTH / 2 + 0.5, y: 0.8 },
        { x: BUS_WIDTH / 2 - 0.5, y: 0.8 }
    ];

    rearLightPositions.forEach(pos => {
        const rearLight = new THREE.Mesh(rearLightGeometry, rearLightMaterial);
        rearLight.position.set(pos.x, pos.y, BUS_LENGTH / 2 + 0.05);
        busGroup.add(rearLight);
    });

    // --- Rear Decal: heart with "कुकू संग चुनमुन" ---
    // The rear face is at +Z (the bus drives towards -Z). A BasicMaterial keeps
    // the decal at full colour regardless of the sun angle.
    const heartTexture = createHeartTextTexture({ lines: HEART_TEXT_LINES });
    const heartMaterial = new THREE.MeshBasicMaterial({
        map: heartTexture,
        transparent: true,
        depthWrite: false
    });
    const heartDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), heartMaterial);
    heartDecal.position.set(0, 1.95, BUS_LENGTH / 2 + 0.02);
    heartDecal.renderOrder = 1;
    busGroup.add(heartDecal);

    // --- Pixel Art Extras: Side Mirrors ---
    const mirrorGeometry = roundedBox(0.1, 0.3, 0.25);
    const mirrorMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.BUS_BASE
    });
    
    [-1, 1].forEach(side => {
        const mirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
        mirror.position.set(side * (BUS_WIDTH / 2 + 0.05), BUS_HEIGHT - 1.0, -BUS_LENGTH / 2 + 2.5);
        busGroup.add(mirror);
    });

    // --- Pixel Art Extras: Exhaust Pipe ---
    const exhaustGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6);
    const exhaustMaterial = new THREE.MeshLambertMaterial({
        color: 0x222222
    });
    const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    exhaust.position.set(BUS_WIDTH / 2 - 0.3, 0.5, BUS_LENGTH / 2 - 0.5);
    exhaust.rotation.x = Math.PI / 2;
    busGroup.add(exhaust);

    // --- Brake-light glow: soft halos that fade in when braking ---
    const brakeGlowMat = new THREE.MeshBasicMaterial({
        color: 0xFF6B7A, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    rearLightPositions.forEach(pos => {
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), brakeGlowMat);
        glow.position.set(pos.x, pos.y, BUS_LENGTH / 2 + 0.09);
        glow.renderOrder = 2;
        busGroup.add(glow);
    });
    setHex(rearLightMaterial, 0xB85C6A); // dim until the brakes are used

    // --- Indicators (pastel amber), front and rear on each side ---
    const indicatorMats = { left: [], right: [] };
    [-1, 1].forEach(side => {
        const mat = new THREE.MeshBasicMaterial({ color: 0x6B5A3A });
        (side < 0 ? indicatorMats.left : indicatorMats.right).push(mat);
        [-1, 1].forEach(end => {
            const lamp = new THREE.Mesh(roundedBox(0.22, 0.2, 0.08), mat);
            lamp.position.set(side * (BUS_WIDTH / 2 - 0.2), 1.05, end * (BUS_LENGTH / 2 + 0.06));
            busGroup.add(lamp);
        });
    });

    // --- Sliding passenger door on the kerb side (left, -X) ---
    const door = new THREE.Mesh(
        roundedBox(0.08, 2.0, 1.1),
        new THREE.MeshLambertMaterial({ color: 0xFFF1D6 })
    );
    const doorZ = -BUS_LENGTH / 2 + 2.2;
    door.position.set(-BUS_WIDTH / 2 - 0.06, 1.55, doorZ);
    door.castShadow = true;
    busGroup.add(door);

    // --- Exhaust puff pool (world-space, spawned lazily once the bus is in a scene) ---
    const puffMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0 });
    const puffGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const puffs = [];
    for (let i = 0; i < ANIM.PUFF_COUNT; i++) {
        const mesh = new THREE.Mesh(puffGeo, cloneMaterial(puffMat));
        mesh.visible = false;
        puffs.push({ mesh, life: 0, vx: 0, vz: 0 });
    }

    // Store bus properties for physics/movement
    rootGroup.userData.length = BUS_LENGTH;
    rootGroup.userData.width = BUS_WIDTH;
    rootGroup.userData.height = BUS_HEIGHT;
    rootGroup.userData.visual = {
        body: busGroup, door, doorZ, doorOpen: 0,
        brakeMat: rearLightMaterial, glowMat: brakeGlowMat,
        headlightMat: headlightMaterial, beamMat, headlightOn: 0,
        indicatorMats, puffs, puffTimer: 0,
        bob: 0, bobVel: 0, pitch: 0, pitchVel: 0, rollSmooth: 0,
        prevSpeed: 0, accel: 0, braking: 0, time: 0, puffsAttached: false
    };

    return rootGroup;
}

/**
 * Per-frame visual polish for the player bus (suspension, wheels, door, lights,
 * exhaust). Called from updateBusPhysics; it never touches handling.
 * @param {THREE.Group} bus
 * @param {number} dt
 * @param {Object} [keys]
 */
export function updateBusVisuals(bus, dt, keys = {}) {
    const v = bus.userData.visual;
    if (!v || dt <= 0) return;
    const data = bus.userData;
    dt = Math.min(dt, 0.05);
    v.time += dt;

    // Smoothed acceleration drives the suspension
    const rawAccel = (data.speed - v.prevSpeed) / dt;
    v.prevSpeed = data.speed;
    v.accel += (rawAccel - v.accel) * Math.min(1, 8 * dt);

    const pitchTarget = THREE.MathUtils.clamp(v.accel * ANIM.PITCH_PER_ACCEL, -ANIM.PITCH_MAX, ANIM.PITCH_MAX);
    const bobTarget = -Math.abs(v.accel) * ANIM.BOB_PER_ACCEL;
    const speedFrac = Math.min(1, Math.abs(data.speed) / (data.maxSpeed || 25));
    const rumble = Math.sin(v.time * 31) * 0.006 * speedFrac;

    // Spring-damper (semi-implicit Euler)
    v.pitchVel += ((pitchTarget - v.pitch) * ANIM.SPRING_K - v.pitchVel * ANIM.SPRING_DAMP) * dt;
    v.pitch += v.pitchVel * dt;
    v.bobVel += ((bobTarget - v.bob) * ANIM.SPRING_K - v.bobVel * ANIM.SPRING_DAMP) * dt;
    v.bob += v.bobVel * dt;
    v.body.rotation.x = v.pitch;
    v.body.position.y = v.bob + rumble;

    // Front wheels follow the steering
    for (const wheel of data.wheels) {
        if (wheel.userData.isFront) wheel.rotation.y = -data.steer * PHYSICS.BUS_MAX_STEER;
    }

    // Door slides open along the body while stopped at a stop
    const doorTarget = data.doorsOpen ? 1 : 0;
    v.doorOpen += THREE.MathUtils.clamp(doorTarget - v.doorOpen, -ANIM.DOOR_SPEED * dt, ANIM.DOOR_SPEED * dt);
    const eased = v.doorOpen * v.doorOpen * (3 - 2 * v.doorOpen);
    v.door.position.z = v.doorZ + eased * ANIM.DOOR_TRAVEL;
    v.door.position.x = -BUS_WIDTH / 2 - 0.06 - eased * 0.12;

    // Brake lights
    const braking = (keys.backward && data.speed > 0.5) || v.accel < -ANIM.BRAKE_DECEL ||
        data.doorsOpen || data.handbrake;
    v.braking += ((braking ? 1 : 0) - v.braking) * Math.min(1, 14 * dt);
    setRGB(v.brakeMat, 0.72 + 0.28 * v.braking, 0.36 - 0.2 * v.braking, 0.42 - 0.2 * v.braking);
    v.glowMat.opacity = 0.65 * v.braking;
    // Indicators: steering side, or both hazards at a stop
    const blink = Math.sin(v.time * Math.PI * 2 * ANIM.INDICATOR_HZ) > 0;
    // A manual indicator (Q/E) overrides the automatic steering/hazard logic
    const manualL = !!keys.indicatorLeft, manualR = !!keys.indicatorRight;
    const manual = manualL || manualR;
    const left = (manual ? manualL : (data.steer > 0.3 || data.doorsOpen)) && blink;
    const right = (manual ? manualR : (data.steer < -0.3 || data.doorsOpen)) && blink;
    data.indicatorLamp = (left ? 1 : 0) | (right ? 2 : 0);
    v.indicatorMats.left.forEach(m => setHex(m, left ? 0xFFC04D : 0x6B5A3A));
    v.indicatorMats.right.forEach(m => setHex(m, right ? 0xFFC04D : 0x6B5A3A));

    // Headlights (L): lamps brighten and the beams fade in
    v.headlightOn += ((keys.headlights ? 1 : 0) - v.headlightOn) * Math.min(1, 10 * dt);
    setRGB(v.headlightMat, 0.73 + 0.27 * v.headlightOn, 0.71 + 0.29 * v.headlightOn, 0.6 + 0.3 * v.headlightOn);
    v.beamMat.opacity = 0.5 * v.headlightOn;

    // Exhaust puffs, in world space so they trail behind the moving bus
    const scene = bus.parent;
    if (scene && !v.puffsAttached) {
        v.puffs.forEach(p => scene.add(p.mesh));
        v.puffsAttached = true;
    }
    if (v.puffsAttached) {
        v.puffTimer -= dt;
        if (v.puffTimer <= 0 && !data.noFuel) {
            v.puffTimer = lerp(0.35, 0.12, keys.forward ? 1 : speedFrac);
            const p = v.puffs.find(q => q.life <= 0);
            if (p) {
                bus.updateMatrixWorld();
                p.mesh.position.set(BUS_WIDTH / 2 - 0.3, 0.55, BUS_LENGTH / 2 + 0.3);
                bus.localToWorld(p.mesh.position);
                p.life = ANIM.PUFF_LIFE;
                p.vx = (Math.random() - 0.5) * 0.4;
                p.vz = 0.5 + Math.random() * 0.3;
                p.mesh.visible = true;
            }
        }
        for (const p of v.puffs) {
            if (p.life <= 0) continue;
            p.life -= dt;
            if (p.life <= 0) { p.mesh.visible = false; continue; }
            const t = 1 - p.life / ANIM.PUFF_LIFE;
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += (0.5 + t) * dt;
            p.mesh.scale.setScalar(0.6 + t * 2.2);
            p.mesh.material.opacity = 0.45 * (1 - t);
        }
    }
}

// =============================================
// AI TRAFFIC
// Every vehicle keeps (pathZ, lat): its progress along the curving road and
// its lateral offset from the centre line. World position is always
// roadPoint(pathZ, lat), yaw is roadHeading(pathZ) (+PI when oncoming).
// If something else moves a vehicle (a shove, separation, a test), the path
// state is re-read from its position, so nothing fights over it.
// =============================================

/**
 * Suspension and brake-light polish for one AI car or truck (visual only).
 * @param {THREE.Group} car
 * @param {number} dt
 * @param {number} steerYaw - current lane-keeping yaw, used for body roll
 */
function updateCarVisuals(car, dt, steerYaw) {
    const data = car.userData;
    const s = data.suspension;
    if (!s || dt <= 0) return;
    dt = Math.min(dt, 0.05);

    const rawAccel = (data.speed - s.prevSpeed) / dt;
    s.prevSpeed = data.speed;
    s.accel += (rawAccel - s.accel) * Math.min(1, 8 * dt);

    const pitchTarget = THREE.MathUtils.clamp(s.accel * ANIM.PITCH_PER_ACCEL * 1.3, -ANIM.PITCH_MAX, ANIM.PITCH_MAX);
    const bobTarget = -Math.abs(s.accel) * ANIM.BOB_PER_ACCEL;
    s.pitchVel += ((pitchTarget - s.pitch) * ANIM.SPRING_K - s.pitchVel * ANIM.SPRING_DAMP) * dt;
    s.pitch += s.pitchVel * dt;
    s.bobVel += ((bobTarget - s.bob) * ANIM.SPRING_K - s.bobVel * ANIM.SPRING_DAMP) * dt;
    s.bob += s.bobVel * dt;

    const rollTarget = -steerYaw * 0.25 * Math.min(1, data.speed / 15);
    s.roll += (rollTarget - s.roll) * Math.min(1, ANIM.ROLL_SMOOTH * dt);

    data.chassis.rotation.x = s.pitch;
    data.chassis.rotation.z = s.roll;
    for (let i = 0; i < data.sprung.length; i++) {
        data.sprung[i].mesh.position.y = data.sprung[i].y + s.bob;
    }

    const braking = s.accel < -ANIM.BRAKE_DECEL ? 1 : 0;
    s.brake += (braking - s.brake) * Math.min(1, 14 * dt);
    setRGB(data.tailMat, 0.72 + 0.28 * s.brake, 0.36 - 0.2 * s.brake, 0.42 - 0.2 * s.brake);
}

const TRAFFIC_KINDS = {
    auto: buildAuto, bike: buildBike, bicycle: buildBicycle, truck: buildTruck, tractor: buildTractor
};

function speedRange(kind, oncoming) {
    const t = TRAFFIC_TYPES[kind];
    return kind === 'car' && oncoming ? t.oncomingSpeed : t.speed;
}

function rollSpeed(kind, oncoming) {
    const [lo, hi] = speedRange(kind, oncoming);
    return lo + Math.random() * (hi - lo);
}

function pickPaint() {
    return TRAFFIC_CAR_PAINTS[Math.floor(Math.random() * TRAFFIC_CAR_PAINTS.length)];
}

function baseTrafficData(kind) {
    return {
        kind,
        speed: 0, targetSpeed: 0, laneX: 0, homeLane: 0, isOncoming: false,
        hitTimer: 0, laneCooldown: 0,
        lat: 0, pathZ: 0, steerYaw: 0, time: Math.random() * 100, weaveSeed: Math.random() * 6.28
    };
}

/**
 * Creates an AI car in one of the Indian car body styles.
 * @param {string|number} [color] - Body colour (hex string or number); random Indian paint by default
 * @param {number} [variant] - Body style index into CAR_STYLES (hatch, sedan, SUV, MPV, taxi...)
 * @param {boolean} [taxi] - White taxi with yellow plates and a roof sign
 * @returns {THREE.Group} Car group
 */
export function createCar(color, variant = 0, taxi = false) {
    // The root is both the traffic-driven object and the sprung chassis: yaw is
    // set by the AI, pitch/roll come from the suspension ('YXZ' keeps them
    // independent), and bob moves the body meshes (see sprung[]).
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.userData = baseTrafficData('car');
    Object.assign(root.userData, buildCarModel(root, variant, color === undefined ? pickPaint() : color, taxi));
    return root;
}

/**
 * Creates a non-car traffic vehicle ('auto' | 'bike' | 'bicycle' | 'truck' | 'tractor').
 * @param {string} kind
 * @returns {THREE.Group}
 */
export function createTrafficVehicle(kind) {
    if (kind === 'car') return createCar();
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.userData = baseTrafficData(kind);
    Object.assign(root.userData, TRAFFIC_KINDS[kind](root));
    return root;
}

/** Rebuilds a vehicle with a fresh random look (new body style / paint / riders). */
function reskin(vehicle) {
    const d = vehicle.userData;
    if (d.kind === 'car') {
        const style = Math.floor(Math.random() * CAR_STYLES.length);
        Object.assign(d, buildCarModel(vehicle, style, pickPaint(), Math.random() < 0.18));
    } else {
        Object.assign(d, TRAFFIC_KINDS[d.kind](vehicle));
    }
    vehicle.rotation.x = 0;
    vehicle.rotation.z = 0;
}

function chooseLane(kind, oncoming) {
    const lanes = oncoming ? LANES_ONCOMING : LANES_FORWARD;   // [inner, outer]
    if (TRAFFIC_TYPES[kind].lane === 'outer') return lanes[1];
    return lanes[Math.random() < 0.5 ? 0 : 1];
}

/** Writes position/yaw from the path state and remembers what was written. */
function applyPath(vehicle) {
    const d = vehicle.userData;
    const p = roadPoint(d.pathZ, d.lat);
    vehicle.position.x = p.x;
    vehicle.position.z = p.z;
    const steer = d.isOncoming ? d.steerYaw : -d.steerYaw;
    vehicle.rotation.y = p.heading + (d.isOncoming ? Math.PI : 0) + steer;
    d.wx = p.x;
    d.wz = p.z;
}

/** Re-reads the path state when something else moved the vehicle. */
function syncPath(vehicle) {
    const d = vehicle.userData;
    const p = vehicle.position;
    if (d.wx !== undefined && Math.abs(p.x - d.wx) < 1e-4 && Math.abs(p.z - d.wz) < 1e-4) return;
    const lim = ROAD_HALF_WIDTH - 0.2;   // a shove never carries traffic off the tarmac
    d.lat = Math.max(-lim, Math.min(lim, lateralOffset(p.x, p.z)));
    d.pathZ = p.z + d.lat * Math.sin(roadHeading(p.z));
    d.wx = p.x;
    d.wz = p.z;
}

/** A z near `z` where no vehicle of the same lane sits within `clear` units. */
function freeZ(vehicle, others, z, clear = 30) {
    const lane = vehicle.userData.laneX;
    for (let tries = 0; tries < 8; tries++) {
        const busy = others.some(o => o !== vehicle &&
            Math.abs(o.userData.laneX - lane) < 1 && Math.abs(o.position.z - z) < clear);
        if (!busy) return z;
        z += (Math.random() < 0.5 ? -1 : 1) * (clear * 0.6 + Math.random() * 15);
    }
    return z;
}

function placeVehicle(vehicle, z, others) {
    const d = vehicle.userData;
    d.pathZ = freeZ(vehicle, others, z);
    d.lat = d.laneX;
    d.steerYaw = 0;
    applyPath(vehicle);
}

function spawnData(vehicle, oncoming) {
    const d = vehicle.userData;
    d.isOncoming = oncoming;
    d.laneX = chooseLane(d.kind, oncoming);
    d.homeLane = d.laneX;
    d.speed = d.targetSpeed = rollSpeed(d.kind, oncoming);
    d.laneCooldown = 0;
    d.hitTimer = 0;
    d.touchingBus = false;
}

/**
 * Creates all AI traffic: cars (SAME_DIRECTION_CAR_COUNT + ONCOMING_CAR_COUNT,
 * always first in the array) followed by autos, bikes, bicycles, trucks and
 * tractors from TRAFFIC_MIX.
 *
 * @returns {Array<THREE.Group>} Array of AI vehicle groups
 */
export function makeAICars() {
    const cars = [];

    // Same-direction cars (the two lanes on the bus's side of the road)
    for (let i = 0; i < SAME_DIRECTION_CAR_COUNT; i++) {
        const car = createCar(pickPaint(), Math.floor(Math.random() * CAR_STYLES.length), Math.random() < 0.18);
        spawnData(car, false);
        car.userData.laneX = car.userData.homeLane = LANES_FORWARD[i % LANES_FORWARD.length];
        placeVehicle(car, PLAYER_START_Z - 90 - i * 80 - Math.random() * 20, cars);
        cars.push(car);
    }

    // Oncoming cars (the two lanes on the far side)
    for (let i = 0; i < ONCOMING_CAR_COUNT; i++) {
        const car = createCar(pickPaint(), Math.floor(Math.random() * CAR_STYLES.length), Math.random() < 0.18);
        spawnData(car, true);
        car.userData.laneX = car.userData.homeLane = LANES_ONCOMING[i % LANES_ONCOMING.length];
        placeVehicle(car, PLAYER_START_Z - 160 - i * 120 - Math.random() * 30, cars);
        cars.push(car);
    }

    // Autos, bikes, bicycles, trucks and tractors, spread along the first stretch
    let k = 0;
    [[TRAFFIC_MIX.sameDir, false], [TRAFFIC_MIX.oncoming, true]].forEach(([mix, oncoming]) => {
        k = 0;
        Object.entries(mix).forEach(([kind, count]) => {
            for (let n = 0; n < count; n++) {
                const v = createTrafficVehicle(kind);
                spawnData(v, oncoming);
                const z = PLAYER_START_Z - (oncoming ? 100 : 45) - k * (oncoming ? 32 : 36) - Math.random() * 8;
                placeVehicle(v, z, cars);
                cars.push(v);
                k++;
            }
        });
    });

    return cars;
}

/**
 * The other lane of the pair this lane belongs to (same direction of travel).
 * @param {number} laneX
 * @returns {number|null}
 */
function otherLaneOf(laneX) {
    const pair = [LANES_FORWARD, LANES_ONCOMING].find(lanes => lanes.includes(laneX));
    return pair ? pair.find(lane => lane !== laneX) : null;
}

/**
 * True when no vehicle (the bus included) sits in `laneX` from a little behind
 * the car up to a clear distance ahead of it. Used before a lane change.
 */
function isLaneFree(car, laneX, aiCars, busInfo) {
    const direction = car.userData.isOncoming ? 1 : -1;
    const blocks = (lat, z, halfLen) => {
        if (Math.abs(lat - laneX) > TRAFFIC_LANE_CHANGE.LANE_TOLERANCE + 0.4) return false;
        // Positive means the other vehicle is in front of this car
        const ahead = (z - car.position.z) * direction;
        return ahead > -(TRAFFIC_LANE_CHANGE.CLEAR_BEHIND + halfLen) &&
            ahead < TRAFFIC_LANE_CHANGE.CLEAR_AHEAD + halfLen;
    };
    if (busInfo && blocks(busInfo.lat, busInfo.z, 5)) return false;
    return !aiCars.some(o => o !== car && blocks(o.userData.lat, o.position.z, o.userData.length / 2));
}

/**
 * Updates all AI traffic.
 * Each vehicle accelerates towards a target speed, brakes (harder than it
 * accelerates) for whatever is in front of it, follows the curving road,
 * changes lanes to pass slower traffic, rolls its wheels, animates (bike lean,
 * pedalling, auto sway...) and is separated from other vehicles after a shunt.
 * @param {Array<THREE.Group>} aiCars - Array of AI vehicles
 * @param {number} dt - Delta time in seconds
 * @param {THREE.Group} [bus] - Player bus, so traffic can react to it
 */
export function updateAICars(aiCars, dt, bus) {
    aiCars.forEach(syncPath);

    let busInfo = null;
    if (bus) {
        busInfo = {
            lat: lateralOffset(bus.position.x, bus.position.z),
            z: bus.position.z,
            width: bus.userData.width || BUS_WIDTH,
            length: bus.userData.length || BUS_LENGTH,
            speed: Math.abs(bus.userData.speed || 0)
        };
    }

    aiCars.forEach(car => {
        const data = car.userData;
        const type = TRAFFIC_TYPES[data.kind] || TRAFFIC_TYPES.car;
        const oncoming = data.isOncoming;
        const direction = oncoming ? 1 : -1;
        data.time += dt;

        if (data.hitTimer > 0) data.hitTimer = Math.max(0, data.hitTimer - dt);
        data.laneCooldown = Math.max(0, data.laneCooldown - dt);

        // --- Steering: drift sideways towards the lane (plus a little weave) ---
        const weave = type.weave
            ? type.weave * (Math.sin(data.time * 0.9 + data.weaveSeed) * 0.7 + Math.sin(data.time * 2.1 + data.weaveSeed * 2) * 0.3)
            : 0;
        const laneDiff = data.laneX + weave - data.lat;
        const lateralStep = TRAFFIC_LANE_CHANGE.LATERAL_SPEED * (type.weave ? 1.4 : 1) * dt;
        const latBefore = data.lat;
        data.lat += THREE.MathUtils.clamp(laneDiff * PHYSICS.CAR_STEER_SPEED * dt, -lateralStep, lateralStep);
        const vlat = dt > 0 ? (data.lat - latBefore) / dt : 0;

        // --- Vary the cruising speed a little ---
        // (only for vehicles cruising in their normal range: one deliberately
        // stopped or crawling must not suddenly be lifted back to cruise speed)
        if (Math.random() < 0.01) {
            const [lo, hi] = data.kind === 'car'
                ? [PHYSICS.CAR_MIN_SPEED, PHYSICS.CAR_MAX_SPEED]
                : speedRange(data.kind, oncoming);
            if (data.targetSpeed >= lo) {
                data.targetSpeed = THREE.MathUtils.clamp(data.targetSpeed + (Math.random() - 0.5) * 3, lo, hi);
            }
        }
        // A shove or a crash must not leave a slow vehicle with a car's speed
        data.targetSpeed = Math.min(data.targetSpeed, Math.max(speedRange(data.kind, oncoming)[1], PHYSICS.CAR_MIN_SPEED));

        // --- Look ahead for a vehicle to follow ---
        // Measured along the travel direction, and only for vehicles at about
        // the same sideways position, so the other carriageway never counts.
        let gap = Infinity;
        let speedAhead = 0;
        const considerAhead = (z, otherLen, otherSpeed) => {
            const centre = (z - car.position.z) * direction;
            if (centre <= 0) return;
            // Equivalent to the old centre-to-centre gap between two cars
            const g = centre - (data.length + otherLen) / 2 + CAR_LENGTH;
            if (g < gap) { gap = g; speedAhead = otherSpeed; }
        };
        aiCars.forEach(other => {
            if (other === car || other.userData.isOncoming !== oncoming) return;
            const tol = (data.width + other.userData.width) / 2 + 0.3;
            if (Math.abs(other.userData.lat - data.lat) > tol) return;
            considerAhead(other.position.z, other.userData.length, other.userData.speed);
        });
        if (busInfo && Math.abs(busInfo.lat - data.lat) < (data.width + busInfo.width) / 2 + 0.3) {
            considerAhead(busInfo.z, busInfo.length, busInfo.speed);
        }

        // --- Lane change: stuck behind a slower vehicle, so look for a clear lane ---
        const canChange = data.laneCooldown <= 0 && type.lane !== 'outer';
        if (canChange && gap < TRAFFIC_LANE_CHANGE.TRIGGER_GAP && speedAhead < data.targetSpeed - 2) {
            const target = otherLaneOf(data.laneX);
            if (target !== null && isLaneFree(car, target, aiCars, busInfo)) {
                data.laneX = target;
                data.laneCooldown = TRAFFIC_LANE_CHANGE.COOLDOWN_MIN +
                    Math.random() * (TRAFFIC_LANE_CHANGE.COOLDOWN_MAX - TRAFFIC_LANE_CHANGE.COOLDOWN_MIN);
            }
        } else if (canChange && data.laneX !== data.homeLane && gap > 45 &&
            isLaneFree(car, data.homeLane, aiCars, busInfo)) {
            // Finished overtaking: slip back into the usual lane when it is clear
            data.laneX = data.homeLane;
            data.laneCooldown = TRAFFIC_LANE_CHANGE.COOLDOWN_MIN;
        }

        // --- Speed control: brake for the gap ahead, accelerate otherwise ---
        const safeGap = PHYSICS.CAR_MIN_GAP + Math.abs(data.speed) * 0.6;
        let desiredSpeed = data.targetSpeed;
        if (gap < safeGap) {
            const closeness = THREE.MathUtils.clamp(gap / safeGap, 0, 1);
            desiredSpeed = Math.min(desiredSpeed, speedAhead * closeness * 0.95 + closeness * 2);
        }
        if (data.hitTimer > 0) desiredSpeed = Math.min(desiredSpeed, PHYSICS.CAR_MIN_SPEED * 0.5);

        const accelRate = desiredSpeed > data.speed ? PHYSICS.CAR_ACCEL_RATE : PHYSICS.CAR_BRAKE_RATE;
        if (data.speed < desiredSpeed) data.speed = Math.min(desiredSpeed, data.speed + accelRate * dt);
        else if (data.speed > desiredSpeed) data.speed = Math.max(desiredSpeed, data.speed - accelRate * dt);
        data.speed = Math.max(0, data.speed);

        // --- Move along the road ---
        const headingBefore = roadHeading(data.pathZ);
        data.pathZ += direction * data.speed * Math.max(0.3, Math.cos(headingBefore)) * dt;
        const yawRate = dt > 0 ? (roadHeading(data.pathZ) - headingBefore) / dt : 0;

        const rawSteer = Math.atan2(vlat, Math.max(data.speed, 3));
        data.steerYaw = THREE.MathUtils.clamp(data.steerYaw + (rawSteer - data.steerYaw) * Math.min(1, 6 * dt), -0.3, 0.3);
        applyPath(car);

        // --- Wheel roll ---
        if (data.wheels) {
            const dist = data.speed * dt;
            for (const wheel of data.wheels) {
                wheel.rotation.x -= dist / (wheel.userData.r || data.wheelRadius);
            }
        }

        // --- Body animation ---
        if (data.suspension) {
            updateCarVisuals(car, dt, data.steerYaw);
        } else {
            animateModel(car, dt, { time: data.time, yawRate, vlat: oncoming ? vlat : -vlat });
        }

        // --- Recycle around the bus ---
        // The road never ends, so traffic wraps around the player: anything
        // that has dropped far behind is put back ahead of the bus, and the
        // other way round, with a fresh look and speed.
        const busZ = bus ? bus.position.z : 0;
        const aheadOfBus = car.position.z < busZ - TRAFFIC_AHEAD;
        const behindBus = car.position.z > busZ + TRAFFIC_BEHIND;
        if (aheadOfBus || behindBus) {
            const z = aheadOfBus ? busZ + TRAFFIC_BEHIND * 0.6 : busZ - TRAFFIC_AHEAD * 0.8;
            reskin(car);
            spawnData(car, oncoming);
            placeVehicle(car, z + (Math.random() - 0.5) * 20, aiCars);
        }
    });

    // --- Hard separation pass so vehicles never end up inside each other ---
    for (let i = 0; i < aiCars.length; i++) {
        for (let j = i + 1; j < aiCars.length; j++) {
            if (Math.abs(aiCars[i].position.z - aiCars[j].position.z) > 14) continue;
            separateVehicles(aiCars[i], aiCars[j]);
        }
    }

    // --- Push AI vehicles out of the player bus as well ---
    if (bus) {
        aiCars.forEach(car => {
            if (Math.abs(car.position.z - bus.position.z) > 16) return;
            resolveVehicleImpact(bus, car, { react: false });
        });
    }

    // --- Shoves never carry traffic off the tarmac ---
    const lim = ROAD_HALF_WIDTH - 0.2;
    aiCars.forEach(car => {
        const lat = lateralOffset(car.position.x, car.position.z);
        if (Math.abs(lat) <= lim) return;
        const p = roadPoint(car.position.z, Math.sign(lat) * lim);
        car.position.x = p.x;
    });
}

