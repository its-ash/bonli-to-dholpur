// =============================================
// PHYSICS AND COLLISIONS
// =============================================

import * as THREE from 'three';
import { ROAD_HALF_WIDTH, SHOULDER_WIDTH, PHYSICS, POTHOLE_DRAG, POTHOLE_MIN_SPEED } from './constants.js';
import { resolveVehicleImpact, getVehicleBox, testBoxOverlap } from './collision.js';
import { findPotholeAt, applyPotholeBump } from './potholes.js';

const BUS_HALF_WIDTH = 1.25;

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
 * lateral road edges, traffic, pedestrians and pot holes act on it.
 *
 * @param {THREE.Group} bus - The bus group
 * @param {Array<THREE.Group>} aiCars - Array of AI cars
 * @param {Array<THREE.Group>} pedestrians - Array of pedestrians (optional)
 * @param {Object} keys - Input keys state
 * @param {number} dt - Delta time in seconds
 * @param {Object} [extra] - Optional world hooks
 * @param {Array<THREE.Group>} [extra.potholes] - Pot holes to drive over
 */
export function updateBusPhysics(bus, aiCars, pedestrians, keys, dt, { potholes } = {}) {
    const data = bus.userData;
    const previousX = bus.position.x;
    const previousZ = bus.position.z;

    // Acceleration / braking
    if (keys.forward) {
        data.speed = Math.min(data.speed + data.acceleration * dt, data.maxSpeed);
    } else if (keys.backward) {
        data.speed = Math.max(data.speed - data.brakeForce * dt, -data.maxSpeed * 0.4);
    } else {
        // Natural deceleration (rolling resistance)
        if (data.speed > 0) {
            data.speed = Math.max(0, data.speed - data.drag * dt);
        } else if (data.speed < 0) {
            data.speed = Math.min(0, data.speed + data.drag * dt);
        }
    }

    // Steering - only rotate when moving
    if (Math.abs(data.speed) > 0.1) {
        const turnDirection = data.speed > 0 ? 1 : -1;
        const turnAmount = data.turnSpeed * dt * turnDirection;

        if (keys.left) {
            bus.rotation.y += turnAmount;
        }
        if (keys.right) {
            bus.rotation.y -= turnAmount;
        }
    }

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
                data.speed = 0;
            }
        });
    }

    // --- Pot holes: a wheel dropping into one shakes the bus and costs speed ---
    if (data.bumpTimer > 0) {
        data.bumpTimer = Math.max(0, data.bumpTimer - dt);
    } else if (potholes && potholes.length > 0) {
        const hit = findPotholeAt(potholes, bus.position.x, bus.position.z, BUS_HALF_WIDTH * 0.4);
        if (hit) {
            applyPotholeBump(bus, hit, { drag: POTHOLE_DRAG, minSpeed: POTHOLE_MIN_SPEED });
        }
    }

    // Roll the wheels based on the distance actually travelled
    const travelled = Math.hypot(bus.position.x - previousX, bus.position.z - previousZ);
    if (travelled > 0.0001) {
        const direction = Math.sign(data.speed) || 1;
        spinWheels(bus, travelled * direction);
    }
}
