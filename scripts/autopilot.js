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
    LANES_FORWARD, LANES_ONCOMING, ROAD_HALF_WIDTH, PHYSICS, BUS_LENGTH
} from './constants.js';
import { roadHeading, lateralOffset } from './roadpath.js';

// Turn rate of the road at z, in radians per metre driven (+ = bending left)
function roadCurvature(z) {
    return (roadHeading(z - 5) - roadHeading(z + 5)) / 10;
}

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

    // Optional route guide: () => {gap, hold} | null. `gap` is the distance to a
    // place the AI should pull up at (a stop, a pump, the terminus); `hold` is
    // true while the bus should stay put there.
    let guide = null;
    function setGuide(fn) {
        guide = typeof fn === 'function' ? fn : null;
    }

    // Normalise a lane so the bus always stays on its own side of the double
    // yellow line, even if it was left facing the wrong way.
    function laneFor(lateral) {
        return lateral > 0 ? LANE_RIGHT : LANE_LEFT;
    }

    // Lateral position of the bus across the road (follows the bends)
    const busLateral = () => lateralOffset(bus.position.x, bus.position.z);

    /**
     * The two lanes of this bus's direction of travel, as [inside, outside].
     * The inside lane is the one next to the centre line.
     * @returns {Array<number>}
     */
    function ownLanes() {
        return busLateral() > 0 ? LANES_ONCOMING : LANES_FORWARD;
    }

    function engage() {
        if (active) return;

        active = true;
        reason = '';
        stoppedFor = 0;
        mode = MODE.CRUISE;

        // Start from whichever of its own lanes the bus is closest to
        targetLaneX = laneFor(busLateral());
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
            if (Math.abs(lateralOffset(car.position.x, car.position.z) - laneX) > 2.6) continue;

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
            if (Math.abs(lateralOffset(car.position.x, car.position.z) - laneX) > 1.6) return false;

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
    function chooseLane(ahead, aiCars, target = null) {
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
        } else if (Math.abs(busLateral() - inside) < 0.4) {
            mode = MODE.CRUISE;
        }

        targetLaneX = mode === MODE.OVERTAKING ? outside : inside;

        // Approaching a stop: use the kerb-side lane and never start a pass
        if (target && target.gap < 160) {
            if (mode === MODE.CRUISE) targetLaneX = outside;
        }

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

        const target = guide ? guide() : null;
        const ahead = findTrafficAhead(aiCars, targetLaneX);
        chooseLane(ahead, aiCars, target);

        // --- Speed: cruise (faster while passing), brake for traffic, stop if boxed in ---
        let desiredSpeed = Math.min(AUTOPILOT.CRUISE_SPEED, data.maxSpeed * 0.9);

        if (mode === MODE.OVERTAKING) {
            desiredSpeed = Math.min(data.maxSpeed * 0.95, AUTOPILOT.CRUISE_SPEED + AUTOPILOT.OVERTAKE_BOOST);
        }

        // Pull up at the next stop / pump / terminus: brake so the bus rolls to
        // a halt on the spot
        if (target) {
            if (target.hold) {
                desiredSpeed = 0;
            } else {
                const room = Math.max(0, target.gap - 2);
                desiredSpeed = Math.min(desiredSpeed, Math.max(room < 1.5 ? 0 : 2.5, Math.sqrt(2 * 5 * room)));
            }
        }

        // Red / amber signal ahead: stop short of the line, go on green
        const sig = globalThis.__junctions?.signalAhead?.(bus.position.z - BUS_LENGTH / 2);
        const waitingAtSignal = !!sig && (sig.state === 'red' || sig.state === 'amber') && sig.gap < 60;
        if (waitingAtSignal) {
            const room = Math.max(0, sig.gap - 3);
            desiredSpeed = Math.min(desiredSpeed, room < 1.5 ? 0 : Math.max(1.5, Math.sqrt(2 * 4 * room)));
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
        // Everything is relative to the road: the lane error is measured across
        // the road, the heading is the road's heading a little way ahead plus a
        // lane-closing offset, and the steering gets a feed-forward for the
        // bend (the wheel angle that holds the bus on the road's curve).
        const lookAhead = Math.max(6, Math.min(24, 6 + Math.abs(data.speed) * 0.6));
        const laneError = targetLaneX - busLateral();
        const closing = Math.max(
            -AUTOPILOT.MAX_HEADING,
            Math.min(AUTOPILOT.MAX_HEADING, -laneError * AUTOPILOT.HEADING_GAIN)
        );
        const desiredHeading = roadHeading(bus.position.z) + closing;
        const headingError = desiredHeading - bus.rotation.y;
        const feedForward = data.speed > 0.5
            ? Math.atan(PHYSICS.BUS_WHEELBASE * roadCurvature(bus.position.z - lookAhead * 0.5)) / PHYSICS.BUS_MAX_STEER
            : 0;
        setSteer(Math.max(-1, Math.min(1, feedForward + headingError / AUTOPILOT.STEER_FULL)));

        // --- Give up when the bus cannot move any more ---
        if (waitingAtSignal || (target && (target.hold || target.gap < 12))) {
            stoppedFor = 0;     // waiting at a stop or a red light on purpose
        } else if (Math.abs(data.speed) < AUTOPILOT.STOPPED_SPEED) {
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
        setGuide,
        isActive: () => active,
        getState: () => ({
            active,
            reason,
            laneX: targetLaneX,
            overtaking: mode === MODE.OVERTAKING
        })
    };
}
