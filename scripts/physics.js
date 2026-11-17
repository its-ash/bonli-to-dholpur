// =============================================
// PHYSICS AND COLLISIONS
// =============================================

import * as THREE from 'three';
import { ROAD_HALF_WIDTH, SHOULDER_WIDTH, PHYSICS, ANIM } from './constants.js';
import { resolveVehicleImpact, getVehicleBox, testBoxOverlap } from './collision.js';
import { updateBusVisuals } from './vehicles.js';
import { tickAnimations } from './rounded.js';
import { lateralOffset, roadHeading } from './roadpath.js';

const BUS_HALF_WIDTH = 1.25;

/**
 * Moves a value towards a target by at most `step`, never overshooting.
 * @param {number} value
 * @param {number} target
 * @param {number} step - Largest change allowed this frame (positive)
 * @returns {number}
 */
function moveTowards(value, target, step) {
    return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/**
 * Spins the wheels of a vehicle so they roll at the given speed
 * @param {THREE.Object3D} vehicle
 * @param {number} distanceTravelled - Signed distance in units
 */
function spinWheels(vehicle, distanceTravelled) {
    const wheels = vehicle.userData.wheels;
    const radius = vehicle.userData.wheelRadius;
    if (!wheels || !radius) return;

    // Wheels roll: a wheel turning forward (bus moves towards -Z) rotates
    // positively around +X, which in a Z-rotated tyre means decreasing angle.
    const spin = -distanceTravelled / radius;
    for (const wheel of wheels) {
        wheel.rotation.x += spin;
    }
}

// =============================================
// DRIVETRAIN: diesel engine, automatic 6-speed gearbox, brakes
// Speeds are in world units per second (1 u/s = 3.6 km/h on the dials).
// =============================================
export const DRIVETRAIN = {
    IDLE_RPM: 750,
    REDLINE_RPM: 2600,
    // Speed at the redline in each forward gear
    GEAR_TOP: [4.6, 8.2, 12.2, 16.6, 21.0, 26.5],
    // Peak-torque acceleration (u/s^2) in each forward gear (heavy bus: slow off the line)
    GEAR_ACCEL: [4.8, 3.6, 2.8, 2.2, 1.8, 1.5],
    REVERSE_ACCEL: 2.0,
    REVERSE_MAX: 7,
    SHIFT_TIME: 0.45,        // torque is cut for this long during a gear change
    MIN_SHIFT_GAP: 0.9,      // seconds between changes (no hunting)
    SERVICE_BRAKE: 11,       // u/s^2 with the pedal fully down
    HANDBRAKE: 16,
    DOOR_HOLD_BRAKE: 14,     // air brake holding the bus at a stop
    ROLLING: 0.22,           // u/s^2 rolling resistance
    AERO: 0.0007,            // u/s^2 per (u/s)^2
    ENGINE_BRAKE: 1.1        // u/s^2 extra at the redline with the throttle off
};

// Normalised engine torque against rpm (flat diesel curve, peak ~1400-1800)
const TORQUE_CURVE = [
    [0, 0.4], [750, 0.5], [1000, 0.82], [1400, 1], [1800, 1],
    [2200, 0.82], [2500, 0.55], [2600, 0.3], [2700, 0]
];

/**
 * Engine torque (0..1) at an rpm.
 * @param {number} rpm
 * @returns {number}
 */
export function engineTorque(rpm) {
    const c = TORQUE_CURVE;
    if (rpm <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
        if (rpm <= c[i][0]) {
            const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
            return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t;
        }
    }
    return 0;
}

/** Makes sure the bus has all drivetrain state (older code creates it without). */
function ensureDrivetrainState(data) {
    if (data.gear !== undefined) return;
    Object.assign(data, {
        gear: 1,             // 1..6 forward, -1 reverse, 0 neutral
        rpm: DRIVETRAIN.IDLE_RPM,
        throttle: 0,         // smoothed pedal, 0..1
        brakePedal: 0,       // smoothed pedal, 0..1
        shifting: 0,         // seconds of shift pause left
        shiftCount: 0,       // increments on every gear change (audio listens)
        sinceShift: 99,
        handbrake: false,
        indicator: 0,        // 1 = left, -1 = right, 0 = off
        indicatorTimer: 0,
        headlights: false,
        onShoulder: false,
        braking: false
    });
}

/**
 * Advances engine, gearbox and brakes for one frame and updates data.speed.
 * @param {Object} data - bus.userData
 * @param {Object} keys - input state
 * @param {number} dt
 */
function updateDrivetrain(data, keys, dt) {
    ensureDrivetrainState(data);
    const D = DRIVETRAIN;

    // Driver's switches
    data.handbrake = Boolean(keys.handbrake);
    data.headlights = Boolean(keys.headlights);
    const stalk = keys.indicatorLeft ? 1 : keys.indicatorRight ? -1 : 0;
    if (stalk !== data.indicator) {
        data.indicator = stalk;
        data.indicatorTimer = 0;
    }
    if (data.indicator !== 0) {
        // Self-cancelling stalk after a while, like a real one after the turn
        data.indicatorTimer += dt;
        if (data.indicatorTimer > 12) {
            keys.indicatorLeft = false;
            keys.indicatorRight = false;
            data.indicator = 0;
        }
    }

    // A bus with its doors open at a stop, or with an empty tank, cannot drive
    const canDrive = !data.doorsOpen && !data.noFuel && !data.handbrake;
    const wantForward = canDrive && keys.forward;
    const wantBack = canDrive && keys.backward;

    const speed = data.speed;
    // Pressing the opposite pedal while rolling is braking, not accelerating
    const brakingNow = (wantBack && speed > 0.3) || (wantForward && speed < -0.3);
    const reversing = wantBack && speed <= 0.3 && !brakingNow;
    const driving = (wantForward && !brakingNow) || reversing;

    // Pedals ease in and out
    data.throttle += ((driving ? 1 : 0) - data.throttle) * Math.min(1, (driving ? 4.5 : 8) * dt);
    data.brakePedal += ((brakingNow ? 1 : 0) - data.brakePedal) * Math.min(1, 9 * dt);

    // --- Gearbox ---
    data.sinceShift += dt;
    if (reversing || (speed < -0.3)) {
        data.gear = -1;
        data.shifting = 0;
    } else if (data.gear < 1) {
        data.gear = 1;
    }
    if (data.shifting > 0) data.shifting = Math.max(0, data.shifting - dt);

    const top = D.GEAR_TOP[Math.max(0, data.gear - 1)] || D.GEAR_TOP[0];
    const wheelRpm = data.gear === -1
        ? Math.abs(speed) / D.REVERSE_MAX * 2000
        : Math.abs(speed) / top * D.REDLINE_RPM;

    if (data.gear > 0 && data.shifting <= 0 && data.sinceShift > D.MIN_SHIFT_GAP) {
        const upRpm = 1750 + 700 * data.throttle;
        const downRpm = 800 + 150 * data.throttle;
        let next = data.gear;
        if (data.gear < 6 && wheelRpm > upRpm && data.throttle > 0.05) next = data.gear + 1;
        else if (data.gear > 1 && wheelRpm < downRpm) next = data.gear - 1;
        // Kick-down when the pedal is floored and the engine is lugging
        else if (data.gear > 1 && data.throttle > 0.9 && wheelRpm < 1150) next = data.gear - 1;
        if (next !== data.gear) {
            data.gear = next;
            data.shifting = D.SHIFT_TIME;
            data.sinceShift = 0;
            data.shiftCount += 1;
        }
    }

    // --- Engine speed ---
    let rpmTarget = Math.max(D.IDLE_RPM, wheelRpm);
    if (data.gear === 1 && wheelRpm < 1300) rpmTarget = Math.max(rpmTarget, D.IDLE_RPM + data.throttle * 650);
    if (data.shifting > 0) rpmTarget = Math.max(D.IDLE_RPM, rpmTarget * 0.9); // revs hang during the change
    rpmTarget = Math.min(rpmTarget, D.REDLINE_RPM + 100);
    data.rpm += (rpmTarget - data.rpm) * (1 - Math.exp(-9 * dt));

    // --- Forces (u/s^2, along the direction of travel) ---
    let accel = 0;
    if (data.doorsOpen) {
        // Held at the kerb while passengers get on and off (air brake)
        data.speed = moveTowards(data.speed, 0, D.DOOR_HOLD_BRAKE * dt);
        data.braking = true;
        return;
    }

    if (data.gear > 0 && data.shifting <= 0 && wantForward && !brakingNow) {
        const limit = data.rpm >= D.REDLINE_RPM ? 0 : 1;
        accel += D.GEAR_ACCEL[data.gear - 1] * data.throttle * engineTorque(data.rpm) * limit;
    } else if (data.gear === -1 && reversing) {
        accel -= D.REVERSE_ACCEL * data.throttle * engineTorque(data.rpm);
    }

    // Resistances always act against the motion
    const sign = Math.sign(speed);
    let resist = D.ROLLING + D.AERO * speed * speed;
    if (data.throttle < 0.1 && data.gear > 0) {
        // Engine braking: grows with rpm, felt most in the low gears
        resist += D.ENGINE_BRAKE * Math.max(0, (data.rpm - D.IDLE_RPM) / (D.REDLINE_RPM - D.IDLE_RPM));
    }
    if (data.noFuel) resist += 0.8;
    resist += data.brakePedal * D.SERVICE_BRAKE;
    if (data.handbrake) resist += D.HANDBRAKE;

    let next = speed + accel * dt;
    if (sign !== 0 || Math.abs(next) > 0) {
        const s = Math.sign(next) || sign;
        const reduced = Math.abs(next) - resist * dt;
        // Resistance can stop the bus but never push it backwards
        next = reduced <= 0 ? 0 : s * reduced;
        // Pulling away from rest: static resistance must not cancel the first
        // push. Add to the current speed (setting it to accel * dt pinned the
        // bus at ~0 on high-refresh screens where dt is small)
        if (accel !== 0 && Math.abs(speed) < 0.05) next = speed + accel * dt;
    }

    data.speed = THREE.MathUtils.clamp(next, -D.REVERSE_MAX, data.maxSpeed);
    if (data.speed === 0 && data.gear === -1 && !reversing) data.gear = 1;
    data.braking = data.brakePedal > 0.3 || data.handbrake;
}

/**
 * Updates bus physics and handles collisions.
 *
 * The road is endless, so nothing here clamps the bus along Z - only the
 * lateral road edges, traffic and pedestrians act on it.
 *
 * @param {THREE.Group} bus - The bus group
 * @param {Array<THREE.Group>} aiCars - Array of AI cars
 * @param {Array<THREE.Group>} pedestrians - Array of pedestrians (optional)
 * @param {Object} keys - Input keys state
 * @param {number} dt - Delta time in seconds
 */
export function updateBusPhysics(bus, aiCars, pedestrians, keys, dt) {
    const data = bus.userData;
    const previousX = bus.position.x;
    const previousZ = bus.position.z;

    // Engine, gearbox, brakes, handbrake and the driver's switches
    updateDrivetrain(data, keys, dt);

    // Steering: the wheel swings towards the input at a limited rate, so the
    // bus never snaps round. The yaw follows the bicycle model
    // (yaw rate = speed * tan(wheel angle) / wheelbase): a bus turns wider the
    // faster it goes, and a stationary bus cannot turn at all.
    const steerInput = THREE.MathUtils.clamp(
        (keys.left ? 1 : 0) - (keys.right ? 1 : 0) + (keys.steer || 0), -1, 1
    );
    const steerStep = PHYSICS.BUS_STEER_RATE * dt;
    data.steer += THREE.MathUtils.clamp(steerInput - data.steer, -steerStep, steerStep);

    const wheelAngle = data.steer * PHYSICS.BUS_MAX_STEER;
    bus.rotation.y += (data.speed * Math.tan(wheelAngle) / PHYSICS.BUS_WHEELBASE) * dt;

    // Body lean: the bus rolls away from the turn, more the faster it goes
    const leanTarget = -data.steer * PHYSICS.BUS_ROLL * Math.min(1, Math.abs(data.speed) / data.maxSpeed);
    data.roll += (leanTarget - data.roll) * Math.min(1, ANIM.ROLL_SMOOTH * dt);
    bus.rotation.z = data.roll;

    // Advance position along bus heading (the models face -Z)
    if (Math.abs(data.speed) > 0.01) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(bus.quaternion);
        bus.position.addScaledVector(forward, data.speed * dt);
    }

    // Road boundary collision - clamp to road with strong deceleration on shoulder
    const roadEdge = ROAD_HALF_WIDTH - BUS_HALF_WIDTH;

    // Never clamp the speed to >= 0 here: that cancelled reverse and pinned the
    // bus against the edge. Instead cap the speed and let the bus slide along.
    // All measured across the (possibly bending) road, not along world X
    const lateral = lateralOffset(bus.position.x, bus.position.z);
    if (Math.abs(lateral) > roadEdge) {
        const side = Math.sign(lateral);
        const overshoot = Math.abs(lateral) - roadEdge;
        const roadYaw = roadHeading(bus.position.z);

        // Rough shoulder: limit the speed (either direction), never stop the bus
        const shoulderMax = data.maxSpeed * 0.45;
        if (Math.abs(data.speed) > shoulderMax) {
            data.speed = Math.sign(data.speed) *
                Math.max(shoulderMax, Math.abs(data.speed) - 15 * dt);
        }

        if (overshoot > SHOULDER_WIDTH) {
            // Hit the barrier: hold the bus at the edge of the shoulder
            // by pushing it back perpendicular to the road
            const excess = overshoot - SHOULDER_WIDTH;
            bus.position.x -= side * excess * Math.cos(roadYaw);
            bus.position.z += side * excess * Math.sin(roadYaw);

            // Moving into the barrier? Scrape off some speed and turn the bus
            // to run along it, so it slides instead of getting stuck. The
            // road's right-hand vector is (cos h, -sin h); the bus moves along
            // (-sin yaw, -cos yaw), so its rightwards speed is sin(h - yaw) * speed.
            const outward = Math.sin(roadYaw - bus.rotation.y) * data.speed * side;
            if (outward > 0) {
                data.speed *= Math.max(0, 1 - 2.5 * dt);
                bus.rotation.y += Math.cos(bus.rotation.y - roadYaw) * Math.sign(data.speed) * side * 1.5 * dt;
            }
        }
    }

    // Collision with AI cars (oriented box test: a 10-unit bus is not a circle)
    // Only the first frame of a crash costs momentum and counts as a hit;
    // staying in contact (pushing a car along, scraping past) must not pin the bus
    aiCars.forEach(car => {
        const impact = resolveVehicleImpact(bus, car);
        if (!impact || !impact.firstContact) return;

        const impactSpeed = Math.abs(data.speed);
        if (impactSpeed > 1) {
            data.impacts += 1;
            // What was hit, for the HUD / debugging
            data.lastImpact = {
                kind: car.userData.kind, oncoming: !!car.userData.isOncoming, speed: impactSpeed,
                dx: car.position.x - bus.position.x, dz: car.position.z - bus.position.z
            };
        }
        // Momentum is lost in the crash (heavier bus keeps a share of it)
        data.speed *= PHYSICS.BUS_RESTITUTION;

        // A hard hit knocks the bus sideways a little
        if (impactSpeed > 5) {
            const dx = car.position.x - bus.position.x;
            bus.position.x -= Math.sign(dx) * 0.15;
        }
    });

    // Collision with pedestrians - stop the bus
    if (pedestrians) {
        const busBox = getVehicleBox(bus);
        pedestrians.forEach(ped => {
            const pedBox = {
                x: ped.position.x,
                z: ped.position.z,
                halfWidth: 0.3,
                halfLength: 0.2,
                rotationY: ped.rotation.y
            };

            if (testBoxOverlap(busBox, pedBox)) {
                // Count the hit and stop once, then move the walker clear of
                // the bus: zeroing the speed on every overlapping frame pinned
                // the bus while the pedestrian kept walking through it
                if (Math.abs(data.speed) > 1) data.pedestrianHits += 1;
                data.speed = 0;
                ped.position.z = bus.position.z - 80 - Math.random() * 60;
                if (ped.userData) ped.userData.startZ = ped.position.z;
            }
        });
    }

    // Tyres on the rough shoulder (audio / HUD only)
    data.onShoulder = Math.abs(lateralOffset(bus.position.x, bus.position.z)) >
        ROAD_HALF_WIDTH - BUS_HALF_WIDTH;
    data.impactCount = data.impacts + data.pedestrianHits;

    // Roll the wheels based on the distance actually travelled
    const travelled = Math.hypot(bus.position.x - previousX, bus.position.z - previousZ);
    if (travelled > 0.0001) {
        const direction = Math.sign(data.speed) || 1;
        spinWheels(bus, travelled * direction);
    }

    // Visual polish only: suspension, door, lights, exhaust, then prop idles
    updateBusVisuals(bus, dt, keys);
    tickAnimations(dt);
}
