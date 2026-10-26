// =============================================
// AUTOPILOT - the AI driver behind the AUTO button
// One press hands the bus over: it accelerates to a cruising speed, keeps the
// left lane, slides into the other lane to overtake slower traffic, brakes for
// whatever is still in the way, and lets go (stopping the bus) when the road is
// blocked or the end of the road is reached.
// =============================================

import {
    AUTOPILOT, LANE_LEFT, LANE_RIGHT,
    LANES_FORWARD, LANES_ONCOMING, ROAD_HALF_WIDTH, PHYSICS
} from './constants.js';
import { findPotholeAt } from './potholes.js';

/**
 * Creates the autopilot controller.
 *
 * @param {THREE.Object3D} bus - The player bus (needs userData.speed etc.)
 * @param {Function} setKey - (action, value) => void, from scripts/input.js
 * @returns {{
 *   engage: () => void,
 *   disengage: (reason?: string) => void,
 *   toggle: () => boolean,
 *   update: (dt: number, aiCars: Array, potholes?: Array) => void,
 *   isActive: () => boolean,
 *   getState: () => {active: boolean, reason: string, laneX: number}
 * }}
 */
export function createAutopilot(bus, setKey) {
    let active = false;
    let reason = '';
    let stoppedFor = 0;

    // Lane the AI driver currently aims for (it changes lanes to overtake)
    let targetLaneX = LANE_LEFT;
    // True while the driver is passing a slower vehicle in the other lane
    let overtaking = false;

    // Normalise a lane so the bus always stays on its own side of the double
    // yellow line, even if it was left facing the wrong way.
    function laneFor(x) {
        return x > 0 ? LANE_RIGHT : LANE_LEFT;
    }

    function engage() {
        if (active) return;

        active = true;
        reason = '';
        stoppedFor = 0;
        overtaking = false;

        // Start from whichever of its own lanes the bus is closest to
        targetLaneX = laneFor(bus.position.x);
    }

    function releaseKeys() {
        setKey('forward', false);
        setKey('backward', false);
        setKey('left', false);
        setKey('right', false);
    }

    function disengage(why = '') {
        if (!active) {
            reason = why || reason;
            return;
        }
        active = false;
        reason = why;

        // Hand the controls back to the player in a neutral state
        releaseKeys();
    }

    function toggle() {
        if (active) {
            disengage('AUTO OFF');
        } else {
            engage();
        }
        return active;
    }

    /**
     * Finds the closest vehicle ahead of the bus inside the look-ahead window.
     * The bus drives towards -Z, so "ahead" means a smaller Z.
     * @param {Array} aiCars
     * @returns {{vehicle: Object, gap: number}|null}
     */
    function findTrafficAhead(aiCars) {
        let closest = null;

        for (const car of aiCars || []) {
            // Only vehicles roughly in our lane matter
            if (Math.abs(car.position.x - bus.position.x) > 2.6) continue;

            // Vehicles driving the other way are not something to follow
            if (car.userData.isOncoming) continue;

            const gap = bus.position.z - car.position.z;
            if (gap <= 0 || gap > AUTOPILOT.LOOK_AHEAD) continue;

            if (!closest || gap < closest.gap) {
                closest = { vehicle: car, gap };
            }
        }

        return closest;
    }

    /**
     * Picks the lane to aim for: dodge into the free lane when something is in
     * the way, otherwise settle back into the inner lane.
     * Only the two lanes on the bus's own side of the road are ever used, so the
     * AI never drifts into oncoming traffic.
     * @param {{vehicle: Object, gap: number}|null} ahead
     */
    function chooseLane(ahead) {
        const blocked = ahead !== null && ahead.gap < AUTOPILOT.OVERTAKE_GAP;

        // The two lanes available to this direction of travel
        const ownLanes = bus.position.x > 0 ? LANES_ONCOMING : LANES_FORWARD;

        if (blocked) {
            overtaking = true;
            // Move to the lane the obstacle is NOT in
            const obstacleX = ahead.vehicle.position.x;
            const freeLanes = ownLanes.filter(lane => Math.abs(lane - obstacleX) > 1.5);
            targetLaneX = freeLanes.length > 0 ? freeLanes[0] : ownLanes[0];
        } else if (overtaking) {
            // Only return to the inner lane once well clear of the traffic
            const clearAhead = ahead === null || ahead.gap > AUTOPILOT.OVERTAKE_GAP * 1.6;
            if (clearAhead) {
                overtaking = false;
                targetLaneX = ownLanes[0];
            }
        } else {
            targetLaneX = ownLanes[0];
        }

        // Never aim outside the asphalt
        const edge = ROAD_HALF_WIDTH - bus.userData.width / 2 - 0.3;
        targetLaneX = Math.max(-edge, Math.min(edge, targetLaneX));
    }

    /**
     * Advances the autopilot by one frame.
     * @param {number} dt - Delta time in seconds
     * @param {Array} aiCars - AI traffic the bus has to avoid
     * @param {Array} [potholes] - Pot holes the AI driver steers around
     */
    function update(dt, aiCars, potholes) {
        if (!active) return;

        const data = bus.userData;

        const ahead = findTrafficAhead(aiCars);
        chooseLane(ahead);

        // The AI driver also dips around holes in the asphalt
        const holeAhead = findPotholeAt(potholes, targetLaneX, bus.position.z - 12, 3);

        // --- Speed: cruise, brake for traffic, stop if boxed in ---
        let desiredSpeed = Math.min(AUTOPILOT.CRUISE_SPEED, data.maxSpeed * 0.9);

        if (ahead) {
            // Keep a two-second-ish gap behind the vehicle in front
            const safeGap = 10 + Math.abs(data.speed) * 0.8;
            if (ahead.gap < safeGap) {
                const closeness = Math.max(0, Math.min(1, ahead.gap / safeGap));
                const aheadSpeed = Math.abs(ahead.vehicle.userData.speed || 0);
                desiredSpeed = Math.min(desiredSpeed, aheadSpeed * closeness);
            }
            // Something right on the bumper: brake hard
            if (ahead.gap < AUTOPILOT.EMERGENCY_GAP) {
                desiredSpeed = 0;
            }
        }

        // Ease off for a pot hole instead of hammering through it
        if (holeAhead) {
            desiredSpeed = Math.min(desiredSpeed, desiredSpeed * AUTOPILOT.POTHOLE_SLOWDOWN);
        }

        if (data.speed < desiredSpeed - 0.4) {
            setKey('forward', true);
            setKey('backward', false);
        } else if (data.speed > desiredSpeed + 0.4) {
            setKey('forward', false);
            setKey('backward', true);
        } else {
            setKey('forward', false);
            setKey('backward', false);
        }

        // --- Steering: turn towards the target lane, then straighten up ---
        // Steering keys only rotate the bus, so the AI drives a heading that
        // is proportional to the lateral error and lets the bus drift over.
        // A positive rotation.y points the bus towards -X, so the heading is
        // the NEGATIVE of the lane error.
        const laneError = targetLaneX - bus.position.x;
        const desiredHeading = Math.max(
            -AUTOPILOT.MAX_HEADING,
            Math.min(AUTOPILOT.MAX_HEADING, -laneError * AUTOPILOT.HEADING_GAIN)
        );

        const headingError = desiredHeading - bus.rotation.y;

        if (headingError > AUTOPILOT.STEER_TOLERANCE) {
            // Steering left increases rotation.y (see updateBusPhysics)
            setKey('left', true);
            setKey('right', false);
        } else if (headingError < -AUTOPILOT.STEER_TOLERANCE) {
            setKey('left', false);
            setKey('right', true);
        } else {
            setKey('left', false);
            setKey('right', false);

            // Nudge the heading into the dead zone so it does not creep
            const correction = Math.min(
                Math.abs(headingError),
                PHYSICS.BUS_TURN_SPEED * dt
            );
            bus.rotation.y += Math.sign(headingError) * correction;
        }

        // --- Give up when the bus cannot move any more ---
        if (Math.abs(data.speed) < AUTOPILOT.STOPPED_SPEED) {
            stoppedFor += dt;
            if (stoppedFor >= AUTOPILOT.STOPPED_TIME_LIMIT) {
                disengage('AUTO STOPPED');
                data.speed = 0;
                return;
            }
        } else {
            stoppedFor = 0;
        }
    }

    return {
        engage,
        disengage,
        toggle,
        update,
        isActive: () => active,
        getState: () => ({ active, reason, laneX: targetLaneX })
    };
}
