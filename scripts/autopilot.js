// =============================================
// AUTOPILOT - the AI driver behind the AUTO button
// One press hands the bus over: it accelerates to a cruising speed, keeps the
// inside lane, pulls out into the outside lane to overtake a slower vehicle in
// front, slides back in once the passed vehicle is clear, brakes for whatever
// is still in the way, and lets go (stopping the bus) when the road is blocked
// or the end of the road is reached.
// =============================================

import {
    AUTOPILOT, LANE_LEFT, LANE_RIGHT,
    LANES_FORWARD, LANES_ONCOMING, ROAD_HALF_WIDTH
} from './constants.js';

// Where the AI driver is in a manoeuvre
const MODE = {
    CRUISE: 'cruise',           // keeps the inside lane
    OVERTAKING: 'overtaking',   // in the outside lane, passing slower traffic
    RETURNING: 'returning'      // sliding back into the inside lane
};

/**
 * Creates the autopilot controller.
 *
 * @param {THREE.Object3D} bus - The player bus (needs userData.speed etc.)
 * @param {Function} setKey - (action, value) => void, from scripts/input.js
 * @param {Function} setSteer - (value) => void, analog steering from -1 to 1
 * @returns {{
 *   engage: () => void,
 *   disengage: (reason?: string) => void,
 *   toggle: () => boolean,
 *   update: (dt: number, aiCars: Array) => void,
 *   isActive: () => boolean,
 *   getState: () => {active: boolean, reason: string, laneX: number, overtaking: boolean}
 * }}
 */
export function createAutopilot(bus, setKey, setSteer = () => {}) {
    let active = false;
    let reason = '';
    let stoppedFor = 0;
    let mode = MODE.CRUISE;

    // Lane the AI driver currently aims for
    let targetLaneX = LANE_LEFT;

    // Normalise a lane so the bus always stays on its own side of the double
    // yellow line, even if it was left facing the wrong way.
    function laneFor(x) {
        return x > 0 ? LANE_RIGHT : LANE_LEFT;
    }

    /**
     * The two lanes of this bus's direction of travel, as [inside, outside].
     * The inside lane is the one next to the centre line.
     * @returns {Array<number>}
     */
    function ownLanes() {
        return bus.position.x > 0 ? LANES_ONCOMING : LANES_FORWARD;
    }

    function engage() {
        if (active) return;

        active = true;
        reason = '';
        stoppedFor = 0;
        mode = MODE.CRUISE;

        // Start from whichever of its own lanes the bus is closest to
        targetLaneX = laneFor(bus.position.x);
    }

    function releaseKeys() {
        setKey('forward', false);
        setKey('backward', false);
        setSteer(0);
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
     * Only the lane the bus is moving into counts, so a car being passed in
     * the lane it is leaving does not make the bus brake.
     * @param {Array} aiCars
     * @param {number} laneX - Lane to look at
     * @returns {{vehicle: Object, gap: number}|null}
     */
    function findTrafficAhead(aiCars, laneX) {
        let closest = null;

        for (const car of aiCars || []) {
            // Only vehicles roughly in that lane matter
            if (Math.abs(car.position.x - laneX) > 2.6) continue;

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
     * True when no vehicle occupies `laneX` from a little way behind the bus up
     * to the clearance distance ahead. A lane change is only made when true.
     * @param {number} laneX
     * @param {Array} aiCars
     * @returns {boolean}
     */
    function isLaneClear(laneX, aiCars) {
        return !(aiCars || []).some(car => {
            if (Math.abs(car.position.x - laneX) > 1.6) return false;

            // Positive means the car is in front of the bus
            const gap = bus.position.z - car.position.z;
            return gap > -AUTOPILOT.OVERTAKE_CLEAR_BEHIND && gap < AUTOPILOT.OVERTAKE_CLEAR_AHEAD;
        });
    }

    /**
     * Runs the lane manoeuvre: cruise, overtake, then return to the inside lane.
     * Only the two lanes on the bus's own side of the road are ever used, so the
     * AI never drifts into oncoming traffic.
     * @param {{vehicle: Object, gap: number}|null} ahead
     * @param {Array} aiCars
     */
    function chooseLane(ahead, aiCars) {
        const [inside, outside] = ownLanes();

        if (mode === MODE.CRUISE) {
            // Pull out only when the slower car is close and the outside lane is free
            const blocked = ahead !== null && ahead.gap < AUTOPILOT.OVERTAKE_GAP;
            if (blocked && isLaneClear(outside, aiCars)) {
                mode = MODE.OVERTAKING;
            }
        } else if (mode === MODE.OVERTAKING) {
            // Stay out until the passed vehicle is behind and the inside lane is free
            if (isLaneClear(inside, aiCars)) {
                mode = MODE.RETURNING;
            }
        } else if (Math.abs(bus.position.x - inside) < 0.4) {
            mode = MODE.CRUISE;
        }

        targetLaneX = mode === MODE.OVERTAKING ? outside : inside;

        // Never aim outside the asphalt
        const edge = ROAD_HALF_WIDTH - bus.userData.width / 2 - 0.3;
        targetLaneX = Math.max(-edge, Math.min(edge, targetLaneX));
    }

    /**
     * Advances the autopilot by one frame.
     * @param {number} dt - Delta time in seconds
     * @param {Array} aiCars - AI traffic the bus has to avoid
     */
    function update(dt, aiCars) {
        if (!active) return;

        const data = bus.userData;

        const ahead = findTrafficAhead(aiCars, targetLaneX);
        chooseLane(ahead, aiCars);

        // --- Speed: cruise (faster while passing), brake for traffic, stop if boxed in ---
        let desiredSpeed = Math.min(AUTOPILOT.CRUISE_SPEED, data.maxSpeed * 0.9);

        if (mode === MODE.OVERTAKING) {
            desiredSpeed = Math.min(data.maxSpeed * 0.95, AUTOPILOT.CRUISE_SPEED + AUTOPILOT.OVERTAKE_BOOST);
        }

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

        // --- Steering: aim at a heading that closes the lane error, then hold it ---
        // A positive rotation.y points the bus towards -X, so the heading is the
        // NEGATIVE of the lane error. The steering axis is proportional to how
        // far the bus is from that heading, so the wheel eases in and out.
        const laneError = targetLaneX - bus.position.x;
        const desiredHeading = Math.max(
            -AUTOPILOT.MAX_HEADING,
            Math.min(AUTOPILOT.MAX_HEADING, -laneError * AUTOPILOT.HEADING_GAIN)
        );
        const headingError = desiredHeading - bus.rotation.y;
        setSteer(Math.max(-1, Math.min(1, headingError / AUTOPILOT.STEER_FULL)));

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
        getState: () => ({
            active,
            reason,
            laneX: targetLaneX,
            overtaking: mode === MODE.OVERTAKING
        })
    };
}
