// =============================================
// JOURNEY - the trip from Bonli to Jaipur
// Tracks real progress along the route (distance driven and left, current and
// next town), the trip status (ready, driving, at a stop, arrived, game over),
// which compulsory town stops were served or missed, and the final score.
// =============================================

import { ROUTE } from './constants.js';

export const JOURNEY_STATUS = {
    READY: 'ready',
    DRIVING: 'driving',
    AT_STOP: 'at_stop',
    ARRIVED: 'arrived',
    GAME_OVER: 'game_over'
};

// A jump bigger than this in one frame is a teleport (tests, debugging), not driving
const MAX_STEP = 60;

/**
 * Loads the saved best result, if the browser has storage.
 * @returns {{score: number, stars: number, time: number}|null}
 */
export function loadBest() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(ROUTE.BEST_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Saves a result when it beats the stored best.
 * @param {{score: number, stars: number, time: number}} result
 * @returns {boolean} true when it is a new best
 */
export function saveBest(result) {
    const best = loadBest();
    if (best && best.score >= result.score) return false;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(ROUTE.BEST_KEY, JSON.stringify(result));
        }
    } catch (e) {
        // Private mode: the best score just is not remembered
    }
    return true;
}

/**
 * Creates the journey.
 *
 * @param {THREE.Object3D} bus - The player bus
 * @returns {Object} journey controller
 */
export function createJourney(bus) {
    const stops = ROUTE.STOPS.map(stop => ({
        ...stop,
        dist: stop.km * ROUTE.UNITS_PER_KM,
        state: 'upcoming'            // upcoming | served | missed
    }));

    const state = {
        status: JOURNEY_STATUS.READY,
        reason: '',
        distance: 0,                 // metres driven along the route
        elapsed: 0,                  // seconds of driving
        lastZ: bus && bus.position ? bus.position.z : 0,
        stuckFor: 0
    };

    function start() {
        if (state.status !== JOURNEY_STATUS.READY) return;
        state.status = JOURNEY_STATUS.DRIVING;
        state.lastZ = bus.position.z;
    }

    function markStopServed(id) {
        const stop = stops.find(s => s.id === id);
        if (stop && stop.state === 'upcoming') stop.state = 'served';
    }

    function finish(status, reason) {
        state.status = status;
        state.reason = reason;
    }

    /**
     * Advances the trip. Only forward motion counts (towards -Z), so reversing
     * does not inflate the distance and teleports are ignored.
     * @param {number} dt - Delta time in seconds
     */
    function update(dt) {
        if (!bus) return;
        const active = state.status === JOURNEY_STATUS.DRIVING || state.status === JOURNEY_STATUS.AT_STOP;
        const delta = state.lastZ - bus.position.z;
        state.lastZ = bus.position.z;
        if (!active) return;

        state.elapsed += dt;
        if (delta > 0 && delta < MAX_STEP) state.distance += delta;

        const data = bus.userData;
        state.status = data.doorsOpen ? JOURNEY_STATUS.AT_STOP : JOURNEY_STATUS.DRIVING;

        // A compulsory town stop that was driven past is missed
        for (const stop of stops) {
            if (stop.kind === 'town' && stop.state === 'upcoming' &&
                state.distance > stop.dist + ROUTE.MISS_MARGIN) {
                stop.state = 'missed';
            }
        }

        // Arrival: pulled up at the end of the route, or drove well past it
        const stopped = Math.abs(data.speed || 0) < 1;
        if ((stopped && state.distance >= ROUTE.LENGTH - ROUTE.ARRIVE_ZONE) ||
            state.distance >= ROUTE.LENGTH + ROUTE.OVERSHOOT) {
            finish(JOURNEY_STATUS.ARRIVED, '');
            return;
        }

        // Out of fuel and going nowhere: the trip is over
        if (data.noFuel && Math.abs(data.speed || 0) < 0.5) {
            state.stuckFor += dt;
            if (state.stuckFor >= ROUTE.OUT_OF_FUEL_GRACE) {
                finish(JOURNEY_STATUS.GAME_OVER, 'Out of fuel');
            }
        } else {
            state.stuckFor = 0;
        }
    }

    /** @returns {{name: string, en: string, km: number, dist: number, kind: string}} next compulsory town or the end */
    function nextTownStop() {
        const upcoming = stops.find(s => s.kind === 'town' && s.state === 'upcoming');
        if (upcoming && upcoming.dist >= state.distance - ROUTE.MISS_MARGIN) return upcoming;
        return { id: 'end', kind: 'end', name: ROUTE.END_NAME, en: ROUTE.END_EN, km: ROUTE.TOTAL_KM, dist: ROUTE.LENGTH };
    }

    function kmTo(dist) {
        return Math.max(0, Math.round(((dist - state.distance) / ROUTE.UNITS_PER_KM) * 10) / 10);
    }

    function nextTown() {
        const next = nextTownStop();
        return { name: next.name, en: next.en, km: kmTo(next.dist) };
    }

    function currentTown() {
        let current = { name: ROUTE.START_NAME, en: ROUTE.START_EN };
        for (const stop of stops) {
            if (stop.kind === 'town' && state.distance >= stop.dist - ROUTE.MISS_MARGIN) current = stop;
        }
        return { name: current.name, en: current.en };
    }

    function missedCount() {
        return stops.filter(s => s.state === 'missed').length;
    }

    /**
     * What the player should be doing right now, as one line for the HUD.
     * @param {Object} sim - busSim state
     * @param {{gap: number, side: number}|null} pump - nearest petrol pump ahead
     * @returns {string}
     */
    function objective(sim, pump = null) {
        const s = state.status;
        if (s === JOURNEY_STATUS.READY) return `Start your trip from ${ROUTE.START_EN} bus stand`;
        if (s === JOURNEY_STATUS.ARRIVED) return `Arrived at ${ROUTE.END_EN}!`;
        if (s === JOURNEY_STATUS.GAME_OVER) return state.reason || 'Trip over';
        if (sim && sim.fuelPercent <= 0) return 'Out of fuel!';
        if (s === JOURNEY_STATUS.AT_STOP) return 'Passengers are boarding...';

        if (sim && sim.fuelPercent <= ROUTE.LOW_FUEL_PERCENT) {
            if (pump) {
                const where = pump.side < 0 ? 'on the left' : 'on the right';
                return `Low fuel - petrol pump ahead ${where} (${Math.round(pump.gap)} m)`;
            }
            return 'Low fuel - look for a petrol pump';
        }

        // Next stop of any kind that is still ahead
        const ahead = stops.find(x => x.state === 'upcoming' && x.dist >= state.distance - 5);
        if (ahead) {
            const gap = ahead.dist - state.distance;
            if (ahead.kind === 'town' && gap < 600) {
                return `Stop at ${ahead.en} (${ahead.name}) to pick up passengers - ${Math.round(gap)} m`;
            }
            if (ahead.kind === 'village' && gap < 250) {
                return `Village stop: ${ahead.en} - optional pickup, ${Math.round(gap)} m`;
            }
        }

        const remaining = ROUTE.LENGTH - state.distance;
        if (remaining < 300) return `Park at ${ROUTE.END_STAND_EN}, ${ROUTE.END_EN}`;
        const next = nextTown();
        return `Next: ${next.en} - ${next.km.toFixed(1)} km. Keep to the left lanes.`;
    }

    /**
     * Scores the trip.
     * @param {Object} sim - busSim state
     * @returns {Object} summary shown on the end screen
     */
    function getSummary(sim) {
        const sc = ROUTE.SCORE;
        const arrived = state.status === JOURNEY_STATUS.ARRIVED;
        const missed = missedCount();
        const time = Math.round(state.elapsed);
        const fares = (sim && sim.fares) || 0;
        const safety = sim ? sim.safety : 100;

        const timeBonus = arrived ? Math.max(0, Math.round((ROUTE.PAR_TIME - state.elapsed) * sc.TIME_BONUS_PER_SEC)) : 0;
        const safetyBonus = arrived ? Math.round(safety * sc.SAFETY_POINTS) : 0;
        const arrivalBonus = arrived ? sc.ARRIVAL_BONUS : 0;
        const missedPenalty = missed * sc.MISSED_STOP_PENALTY;
        const crashPenalty = sim ? sim.impacts * sc.CRASH_PENALTY + sim.pedestrianHits * sc.PEDESTRIAN_PENALTY : 0;
        const score = Math.max(0, Math.round(
            fares + timeBonus + safetyBonus + arrivalBonus - missedPenalty - crashPenalty));

        let stars = 0;
        if (arrived) {
            stars = Math.max(1,
                (missed === 0 ? 1 : 0) +
                (safety >= sc.GOOD_SAFETY ? 1 : 0) +
                (state.elapsed <= ROUTE.PAR_TIME ? 1 : 0));
        }

        return {
            arrived,
            status: state.status,
            reason: state.reason,
            time,
            passengers: sim ? sim.carried : 0,
            fares,
            safety,
            missed,
            timeBonus, safetyBonus, arrivalBonus, missedPenalty, crashPenalty,
            score,
            stars
        };
    }

    function getState() {
        const remainingM = Math.max(0, ROUTE.LENGTH - state.distance);
        return {
            status: state.status,
            reason: state.reason,
            distance: state.distance,
            elapsed: state.elapsed,
            distanceKm: Math.round(state.distance / 100) / 10,
            totalLength: ROUTE.LENGTH,
            progress: Math.min(1, state.distance / ROUTE.LENGTH),
            remainingM,
            remainingKm: Math.round((remainingM / ROUTE.UNITS_PER_KM) * 10) / 10,
            routeKmDriven: Math.round((state.distance / ROUTE.UNITS_PER_KM) * 10) / 10,
            currentTown: currentTown(),
            nextTown: nextTown(),
            missed: missedCount(),
            stops: stops.map(s => ({ id: s.id, kind: s.kind, name: s.name, en: s.en, km: s.km, state: s.state }))
        };
    }

    return {
        get status() { return state.status; },
        get distance() { return state.distance; },
        get elapsed() { return state.elapsed; },
        get nextTown() { return nextTown(); },
        stops,
        start,
        update,
        markStopServed,
        objective,
        getSummary,
        getState
    };
}
