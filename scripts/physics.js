// =============================================
// PHYSICS AND COLLISIONS
// =============================================

import * as THREE from 'three';
import { ROAD_HALF_WIDTH, SHOULDER_WIDTH, PHYSICS } from './constants.js';
import { resolveVehicleImpact, getVehicleBox, testBoxOverlap } from './collision.js';

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

    // A bus with its doors open at a stop, or with an empty tank, cannot drive
    const canDrive = !data.doorsOpen && !data.noFuel;

    // Acceleration / braking
    if (data.doorsOpen) {
        // Held at the kerb while passengers get on and off
        data.speed = moveTowards(data.speed, 0, data.brakeForce * dt);
    } else if (canDrive && keys.forward) {
        data.speed = Math.min(data.speed + data.acceleration * dt, data.maxSpeed);
    } else if (canDrive && keys.backward) {
        data.speed = Math.max(data.speed - data.brakeForce * dt, -data.maxSpeed * 0.4);
    } else {
        // Natural deceleration (rolling resistance)
        if (data.speed > 0) {
            data.speed = Math.max(0, data.speed - data.drag * dt);
        } else if (data.speed < 0) {
            data.speed = Math.min(0, data.speed + data.drag * dt);
        }
    }

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
    data.roll += (leanTarget - data.roll) * Math.min(1, 4 * dt);
    bus.rotation.z = data.roll;

    // Advance position along bus heading (the models face -Z)
    if (Math.abs(data.speed) > 0.01) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(bus.quaternion);
        bus.position.addScaledVector(forward, data.speed * dt);
    }

    // Road boundary collision - clamp to road with strong deceleration on shoulder
    const roadEdge = ROAD_HALF_WIDTH - BUS_HALF_WIDTH;

    if (Math.abs(bus.position.x) > roadEdge) {
        // On shoulder or beyond - strong deceleration
        const overshoot = Math.abs(bus.position.x) - roadEdge;
        if (overshoot > SHOULDER_WIDTH) {
            // Beyond the shoulder - snap back onto the road and lose speed
            bus.position.x = Math.sign(bus.position.x) * roadEdge;
            data.speed = Math.max(0, data.speed - 60 * dt);
        } else {
            // On shoulder - moderate deceleration
            data.speed = Math.max(0, data.speed - 15 * dt);
        }
    }

    // Collision with AI cars (oriented box test: a 10-unit bus is not a circle)
    aiCars.forEach(car => {
        if (resolveVehicleImpact(bus, car)) {
            const impactSpeed = Math.abs(data.speed);
            if (impactSpeed > 1) data.impacts += 1;
            // Momentum is lost in the crash (heavier bus keeps a share of it)
            data.speed *= PHYSICS.BUS_RESTITUTION;

            // A hard hit knocks the bus sideways a little
            if (impactSpeed > 5) {
                const dx = car.position.x - bus.position.x;
                bus.position.x -= Math.sign(dx) * 0.15;
            }
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
                if (Math.abs(data.speed) > 1) data.pedestrianHits += 1;
                data.speed = 0;
            }
        });
    }

    // Roll the wheels based on the distance actually travelled
    const travelled = Math.hypot(bus.position.x - previousX, bus.position.z - previousZ);
    if (travelled > 0.0001) {
        const direction = Math.sign(data.speed) || 1;
        spinWheels(bus, travelled * direction);
    }
}
