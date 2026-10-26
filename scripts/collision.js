// =============================================
// COLLISION - Oriented box (OBB) tests for vehicles
// =============================================

import { PHYSICS } from './constants.js';

const EPSILON = 1e-6;

/**
 * Returns the world-space axes of a box rotated around the Y axis
 * @param {number} rotationY - Rotation around Y in radians
 * @returns {Array<{x:number,z:number}>} [local +X axis, local +Z axis]
 */
function axesOf(rotationY) {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    return [
        { x: cos, z: -sin }, // local +X in world space
        { x: sin, z: cos }   // local +Z in world space
    ];
}

/**
 * Builds the collision box of a vehicle from its userData dimensions
 * @param {THREE.Object3D} vehicle
 * @returns {{x:number,z:number,halfWidth:number,halfLength:number,rotationY:number}}
 */
export function getVehicleBox(vehicle) {
    return {
        x: vehicle.position.x,
        z: vehicle.position.z,
        halfWidth: (vehicle.userData.width || 2) / 2,
        halfLength: (vehicle.userData.length || 4) / 2,
        rotationY: vehicle.rotation.y
    };
}

/**
 * Projects a box onto an axis and returns its radius on that axis
 */
function projectRadius(box, axes, axis) {
    const alongX = Math.abs(axes[0].x * axis.x + axes[0].z * axis.z);
    const alongZ = Math.abs(axes[1].x * axis.x + axes[1].z * axis.z);
    return box.halfWidth * alongX + box.halfLength * alongZ;
}

/**
 * Separating-axis test between two oriented boxes.
 * @param {Object} a - Box A
 * @param {Object} b - Box B
 * @returns {?{nx:number,nz:number,depth:number}} Penetration info (normal points from A to B) or null
 */
export function testBoxOverlap(a, b) {
    const aAxes = axesOf(a.rotationY);
    const bAxes = axesOf(b.rotationY);
    const axes = [aAxes[0], aAxes[1], bAxes[0], bAxes[1]];

    const dx = b.x - a.x;
    const dz = b.z - a.z;

    let minOverlap = Infinity;
    let normalX = 0;
    let normalZ = 0;

    for (const axis of axes) {
        const centerDistance = Math.abs(dx * axis.x + dz * axis.z);
        const overlap =
            projectRadius(a, aAxes, axis) +
            projectRadius(b, bAxes, axis) -
            centerDistance;

        if (overlap <= EPSILON) {
            return null; // separated on this axis
        }

        if (overlap < minOverlap) {
            minOverlap = overlap;
            const sign = dx * axis.x + dz * axis.z < 0 ? -1 : 1;
            normalX = axis.x * sign;
            normalZ = axis.z * sign;
        }
    }

    return { nx: normalX, nz: normalZ, depth: minOverlap };
}

/**
 * Resolves an overlap between two AI cars (neither takes priority).
 * @param {THREE.Object3D} a
 * @param {THREE.Object3D} b
 * @returns {boolean} true when the cars were overlapping
 */
export function separateVehicles(a, b) {
    const overlap = testBoxOverlap(getVehicleBox(a), getVehicleBox(b));
    if (!overlap) return false;

    const push = (overlap.depth + 0.01) / 2;
    a.position.x -= overlap.nx * push;
    a.position.z -= overlap.nz * push;
    b.position.x += overlap.nx * push;
    b.position.z += overlap.nz * push;

    // Both lose most of their speed in a rear-end shunt
    a.userData.speed *= 0.4;
    b.userData.speed *= 0.4;
    a.userData.hitTimer = PHYSICS.CAR_HIT_RECOVERY;
    b.userData.hitTimer = PHYSICS.CAR_HIT_RECOVERY;

    return true;
}

/**
 * Pushes two overlapping vehicles apart and reports the impact.
 * The lighter vehicle (car) takes most of the separation, the heavier one
 * (bus) only a small share, so the bus shoves traffic instead of clipping it.
 * @param {THREE.Object3D} bus - Player bus
 * @param {THREE.Object3D} car - AI car
 * @returns {boolean} true when an impact happened
 */
export function resolveVehicleImpact(bus, car) {
    const overlap = testBoxOverlap(getVehicleBox(bus), getVehicleBox(car));
    if (!overlap) return false;

    const carShare = PHYSICS.CAR_SHOVE;          // 0.8
    const busShare = 1 - carShare;               // 0.2

    const separation = overlap.depth + 0.01;

    // Normal points from the bus towards the car
    bus.position.x -= overlap.nx * separation * busShare;
    bus.position.z -= overlap.nz * separation * busShare;
    car.position.x += overlap.nx * separation * carShare;
    car.position.z += overlap.nz * separation * carShare;

    // The car loses momentum and needs a moment to recover
    car.userData.speed = Math.max(0, car.userData.speed * 0.15);
    car.userData.targetSpeed = Math.max(PHYSICS.CAR_MIN_SPEED * 0.5, car.userData.speed);
    car.userData.hitTimer = PHYSICS.CAR_HIT_RECOVERY;

    return true;
}
