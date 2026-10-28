// =============================================
// VEHICLES - Bus and AI Cars
// =============================================

import * as THREE from 'three';
import {
    BUS_LENGTH, BUS_WIDTH, BUS_HEIGHT, WHEEL_RADIUS, WHEEL_WIDTH,
    CAR_LENGTH, CAR_WIDTH, CAR_HEIGHT, CAR_WHEEL_RADIUS, CAR_WHEEL_WIDTH,
    LANE_LEFT, LANE_RIGHT, LANES_FORWARD, LANES_ONCOMING,
    PLAYER_START_Z, ROAD_LENGTH,
    COLORS, PHYSICS, TRAFFIC_LANE_CHANGE,
    SAME_DIRECTION_CAR_COUNT, ONCOMING_CAR_COUNT, HEART_TEXT_LINES
} from './constants.js';
import { createBusBodyTexture, createCarTexture, createHeartTextTexture } from './utils.js';
import { separateVehicles, resolveVehicleImpact } from './collision.js';
import { roundedBox } from './rounded.js';

// How far ahead of / behind the bus AI traffic is kept alive. Anything further
// than this is recycled back into view (the road itself never ends).
const TRAFFIC_AHEAD = 260;
const TRAFFIC_BEHIND = 120;

/**
 * Creates the player bus
 * @returns {THREE.Group} Bus group with all components
 */
export function createBus() {
    const busGroup = new THREE.Group();

    // Initialize physics userData
    busGroup.userData = {
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
        wheels.push(wheel);
        busGroup.add(wheel);
    });
    busGroup.userData.wheels = wheels;
    busGroup.userData.wheelRadius = WHEEL_RADIUS;

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

    headlightPositions.forEach(pos => {
        const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        headlight.position.set(pos.x, pos.y, -BUS_LENGTH / 2 - 0.2);
        busGroup.add(headlight);
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

    // Store bus properties for physics/movement
    busGroup.userData.length = BUS_LENGTH;
    busGroup.userData.width = BUS_WIDTH;
    busGroup.userData.height = BUS_HEIGHT;

    return busGroup;
}

/**
 * Creates an AI car
 * @param {string} color - Hex color for car body
 * @param {number} variant - Variant index (0=sedan, 1=hatchback, 2=SUV)
 * @returns {THREE.Group} Car group
 */
export function createCar(color, variant = 0) {
    const carGroup = new THREE.Group();
    
    let bodyLength = CAR_LENGTH;
    let bodyHeight = CAR_HEIGHT;
    let bodyWidth = CAR_WIDTH;
    
    if (variant === 1) { // Hatchback
        bodyLength = CAR_LENGTH * 0.85;
        bodyHeight = CAR_HEIGHT * 0.9;
    } else if (variant === 2) { // SUV
        bodyHeight = CAR_HEIGHT * 1.2;
        bodyWidth = CAR_WIDTH * 1.1;
    }

    // --- Car Body ---
    const bodyTexture = createCarTexture(color);
    const bodyGeometry = roundedBox(bodyWidth, bodyHeight, bodyLength);
    const bodyMaterial = new THREE.MeshLambertMaterial({
        map: bodyTexture
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = bodyHeight / 2 + CAR_WHEEL_RADIUS;
    body.castShadow = true;
    body.receiveShadow = true;
    carGroup.add(body);

    // --- Roof ---
    const roofGeometry = roundedBox(bodyWidth * 0.85, bodyHeight * 0.35, bodyLength * 0.7);
    const roofMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.CAR_ROOF
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = bodyHeight + CAR_WHEEL_RADIUS + roofGeometry.parameters.height / 2;
    roof.castShadow = true;
    carGroup.add(roof);

    // --- Wheels ---
    // Same fix as the bus: rotate around Z so the axle points along X.
    const wheelGeometry = new THREE.CylinderGeometry(CAR_WHEEL_RADIUS, CAR_WHEEL_RADIUS, CAR_WHEEL_WIDTH, 8);
    const wheelMaterial = new THREE.MeshLambertMaterial({
        color: COLORS.CAR_WHEEL
    });

    const wheelOffsetX = bodyWidth / 2 + CAR_WHEEL_WIDTH / 2;
    const wheelOffsetZ = bodyLength / 2 - 0.5;

    const wheelPositions = [
        { x: -wheelOffsetX, z: wheelOffsetZ },
        { x: wheelOffsetX, z: wheelOffsetZ },
        { x: -wheelOffsetX, z: -wheelOffsetZ },
        { x: wheelOffsetX, z: -wheelOffsetZ }
    ];

    const wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Group();

        const tyre = new THREE.Mesh(wheelGeometry, wheelMaterial);
        tyre.rotation.z = Math.PI / 2;
        tyre.castShadow = true;
        tyre.receiveShadow = true;
        wheel.add(tyre);

        wheel.position.set(pos.x, CAR_WHEEL_RADIUS, pos.z);
        wheels.push(wheel);
        carGroup.add(wheel);
    });

    // --- Lights ---
    const lightGeometry = roundedBox(0.3, 0.15, 0.05);
    const headlightMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.HEADLIGHT
    });
    const tailLightMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.TAILLIGHT
    });

    // Front headlights (car front faces -Z, matching its travel direction)
    [-0.5, 0.5].forEach(x => {
        const light = new THREE.Mesh(lightGeometry, headlightMaterial);
        light.position.set(x * bodyWidth * 0.4, bodyHeight * 0.4 + CAR_WHEEL_RADIUS, -bodyLength / 2 - 0.05);
        carGroup.add(light);
    });

    // Rear lights
    [-0.5, 0.5].forEach(x => {
        const light = new THREE.Mesh(lightGeometry, tailLightMaterial);
        light.position.set(x * bodyWidth * 0.4, bodyHeight * 0.4 + CAR_WHEEL_RADIUS, bodyLength / 2 + 0.05);
        carGroup.add(light);
    });

    // Store AI properties
    carGroup.userData = {
        speed: 0,
        targetSpeed: 0,
        laneX: 0,
        length: bodyLength,
        width: bodyWidth,
        isOncoming: false,
        wheels: wheels,
        wheelRadius: CAR_WHEEL_RADIUS,
        hitTimer: 0,
        laneCooldown: 0
    };

    return carGroup;
}

/**
 * Creates all AI cars on the four-lane road.
 * Traffic is spread over both lanes of its direction of travel, so the road
 * feels busy: same-direction cars in the negative-X half, oncoming traffic in
 * the positive-X half.
 *
 * @returns {Array<THREE.Group>} Array of AI car groups
 */
export function makeAICars() {
    const cars = [];

    // Same-direction cars (the two lanes on the bus's side of the road)
    for (let i = 0; i < SAME_DIRECTION_CAR_COUNT; i++) {
        const laneX = LANES_FORWARD[i % LANES_FORWARD.length];
        const car = createCar(
            COLORS.CAR_COLORS_SAME_DIR[i % COLORS.CAR_COLORS_SAME_DIR.length],
            i % 3
        );
        
        const z = PLAYER_START_Z - 90 - i * 80 - Math.random() * 20;
        car.position.set(laneX, 0, z);
        car.rotation.y = 0;

        car.userData.speed = 12 + Math.random() * 6;
        car.userData.targetSpeed = car.userData.speed;
        car.userData.laneX = laneX;
        car.userData.isOncoming = false;
        
        cars.push(car);
    }

    // Oncoming cars (the two lanes on the far side)
    for (let i = 0; i < ONCOMING_CAR_COUNT; i++) {
        const laneX = LANES_ONCOMING[i % LANES_ONCOMING.length];
        const car = createCar(
            COLORS.CAR_COLORS_ONCOMING[i % COLORS.CAR_COLORS_ONCOMING.length],
            i % 3
        );
        
        const z = PLAYER_START_Z - 160 - i * 120 - Math.random() * 30;
        car.position.set(laneX, 0, z);
        car.rotation.y = Math.PI;
        
        car.userData.speed = 15 + Math.random() * 5;
        car.userData.targetSpeed = car.userData.speed;
        car.userData.laneX = laneX;
        car.userData.isOncoming = true;
        
        cars.push(car);
    }

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
 * @param {THREE.Group} car
 * @param {number} laneX
 * @param {Array<THREE.Group>} aiCars
 * @param {THREE.Group} [bus]
 * @returns {boolean}
 */
function isLaneFree(car, laneX, aiCars, bus) {
    const direction = car.userData.isOncoming ? 1 : -1;
    const blocks = (other) => {
        if (Math.abs(other.position.x - laneX) > TRAFFIC_LANE_CHANGE.LANE_TOLERANCE) return false;
        // Positive means the other vehicle is in front of this car
        const ahead = (other.position.z - car.position.z) * direction;
        return ahead > -TRAFFIC_LANE_CHANGE.CLEAR_BEHIND && ahead < TRAFFIC_LANE_CHANGE.CLEAR_AHEAD;
    };

    if (bus && blocks(bus)) return false;
    return !aiCars.some(other => other !== car && blocks(other));
}

/**
 * Updates all AI cars
 * Each car now has proper driving physics: it accelerates towards a target
 * speed, brakes (harder than it accelerates) for whatever is in front of it,
 * keeps its lane by yawing, rolls its wheels, and is separated from other
 * vehicles after a shunt.
 * @param {Array<THREE.Group>} aiCars - Array of AI car groups
 * @param {number} dt - Delta time in seconds
 * @param {THREE.Group} [bus] - Player bus, so traffic can react to it
 */
export function updateAICars(aiCars, dt, bus) {
    // Group cars per lane so following logic only compares relevant vehicles
    const carsByLane = {};
    aiCars.forEach(car => {
        const laneKey = car.userData.laneX.toFixed(1);
        if (!carsByLane[laneKey]) carsByLane[laneKey] = [];
        carsByLane[laneKey].push(car);
    });

    // Update each car
    aiCars.forEach(car => {
        const data = car.userData;
        const previousX = car.position.x;
        const previousZ = car.position.z;

        // --- Recovery timer after an impact ---
        if (data.hitTimer > 0) {
            data.hitTimer = Math.max(0, data.hitTimer - dt);
        }

        data.laneCooldown = Math.max(0, data.laneCooldown - dt);

        // --- Steering: drift sideways towards the lane center, at a limited rate ---
        const laneDiff = data.laneX - car.position.x;
        const lateralStep = TRAFFIC_LANE_CHANGE.LATERAL_SPEED * dt;
        car.position.x += THREE.MathUtils.clamp(laneDiff * PHYSICS.CAR_STEER_SPEED * dt, -lateralStep, lateralStep);

        // Point the car at its lane center (small yaw so it visibly steers)
        const heading = data.isOncoming ? Math.PI : 0;
        const steerYaw = THREE.MathUtils.clamp(laneDiff * 0.12, -0.12, 0.12) * (data.isOncoming ? -1 : 1);
        car.rotation.y = heading + steerYaw;

        // --- Vary the cruising speed a little ---
        if (Math.random() < 0.01) {
            const variation = (Math.random() - 0.5) * 3;
            data.targetSpeed = THREE.MathUtils.clamp(
                data.targetSpeed + variation,
                PHYSICS.CAR_MIN_SPEED,
                PHYSICS.CAR_MAX_SPEED
            );
        }

        // --- Look ahead for a vehicle to follow ---
        // A gap is measured along the car's travel direction, so cars in the
        // other lane (coming the other way) never count as "ahead".
        const direction = data.isOncoming ? 1 : -1;
        let gap = Infinity;
        let speedAhead = 0;

        const considerAhead = (z, otherSpeed) => {
            const candidate = (z - car.position.z) * direction;
            if (candidate > 0 && candidate < gap) {
                gap = candidate;
                speedAhead = otherSpeed;
            }
        };

        const laneCars = carsByLane[data.laneX.toFixed(1)] || [];
        laneCars.forEach(other => {
            if (other === car) return;
            if (Math.abs(other.position.x - car.position.x) > 2.0) return;
            considerAhead(other.position.z, other.userData.speed);
        });

        // React to the player bus as well
        if (bus) {
            const lateral = Math.abs(bus.position.x - car.position.x);
            if (lateral < 2.2) {
                considerAhead(bus.position.z, Math.abs(bus.userData.speed));
            }
        }

        // --- Lane change: stuck behind a slower vehicle, so look for a clear lane ---
        if (data.laneCooldown <= 0 && gap < TRAFFIC_LANE_CHANGE.TRIGGER_GAP && speedAhead < data.targetSpeed - 2) {
            const target = otherLaneOf(data.laneX);
            if (target !== null && isLaneFree(car, target, aiCars, bus)) {
                data.laneX = target;
                data.laneCooldown = TRAFFIC_LANE_CHANGE.COOLDOWN_MIN +
                    Math.random() * (TRAFFIC_LANE_CHANGE.COOLDOWN_MAX - TRAFFIC_LANE_CHANGE.COOLDOWN_MIN);
            }
        }

        // --- Speed control: brake for the gap ahead, accelerate otherwise ---
        const safeGap = PHYSICS.CAR_MIN_GAP + Math.abs(data.speed) * 0.6;
        let desiredSpeed = data.targetSpeed;

        if (gap < safeGap) {
            // Emergency braking scales with how close the obstacle is
            const closeness = THREE.MathUtils.clamp(gap / safeGap, 0, 1);
            desiredSpeed = Math.min(desiredSpeed, speedAhead * closeness * 0.95 + closeness * 2);
        }

        if (data.hitTimer > 0) {
            desiredSpeed = Math.min(desiredSpeed, PHYSICS.CAR_MIN_SPEED * 0.5);
        }

        // Cars brake harder than they accelerate (as real vehicles do)
        const accelRate = desiredSpeed > data.speed
            ? PHYSICS.CAR_ACCEL_RATE
            : PHYSICS.CAR_BRAKE_RATE;

        if (data.speed < desiredSpeed) {
            data.speed = Math.min(desiredSpeed, data.speed + accelRate * dt);
        } else if (data.speed > desiredSpeed) {
            data.speed = Math.max(desiredSpeed, data.speed - accelRate * dt);
        }
        data.speed = Math.max(0, data.speed);

        // --- Move car along its heading ---
        if (data.speed > 0.01) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(car.quaternion);
            car.position.addScaledVector(forward, data.speed * dt);
        }

        // --- Wheel roll (signed along the car's own heading) ---
        // The wheels are children of the car, so the spin must be measured in
        // the car's local frame: that is why the sign follows the heading.
        if (data.wheels && data.wheelRadius) {
            const forwardAxis = new THREE.Vector3(0, 0, -1).applyQuaternion(car.quaternion);
            const signed =
                (car.position.x - previousX) * forwardAxis.x +
                (car.position.z - previousZ) * forwardAxis.z;

            if (Math.abs(signed) > 0.0001) {
                const spin = -signed / data.wheelRadius;
                for (const wheel of data.wheels) {
                    wheel.rotation.x += spin;
                }
            }
        }

        // --- Recycle cars around the bus ---
        // The road never ends, so traffic wraps around the player: anything that
        // has dropped a long way behind is put back ahead of the bus (in front
        // of its nose for same-direction cars, and far up the road for oncoming
        // traffic that has driven past).
        const aheadOfBus = car.position.z < (bus ? bus.position.z : 0) - TRAFFIC_AHEAD;
        const behindBus = car.position.z > (bus ? bus.position.z : 0) + TRAFFIC_BEHIND;

        if (aheadOfBus) {
            car.position.z = (bus ? bus.position.z : 0) + TRAFFIC_BEHIND * 0.6;
        } else if (behindBus) {
            car.position.z = (bus ? bus.position.z : 0) - TRAFFIC_AHEAD * 0.8;
        }

        // Respawned cars get a fresh cruising speed, which also keeps traffic
        // varied over a long drive.
        if (aheadOfBus || behindBus) {
            car.userData.speed = data.isOncoming
                ? 15 + Math.random() * 5
                : 12 + Math.random() * 6;
            car.userData.targetSpeed = car.userData.speed;
        }
    });

    // --- Hard separation pass so cars never end up inside each other ---
    for (let i = 0; i < aiCars.length; i++) {
        for (let j = i + 1; j < aiCars.length; j++) {
            const a = aiCars[i];
            const b = aiCars[j];

            // Cheap rejection before the full box test
            if (Math.abs(a.position.z - b.position.z) > 12) continue;
            if (Math.abs(a.position.x - b.position.x) > 4) continue;

            separateVehicles(a, b);
        }
    }

    // --- Push AI cars out of the player bus as well ---
    if (bus) {
        aiCars.forEach(car => {
            if (Math.abs(car.position.z - bus.position.z) > 14) return;
            if (Math.abs(car.position.x - bus.position.x) > 5) return;
            resolveVehicleImpact(bus, car, { react: false });
        });
    }
}
