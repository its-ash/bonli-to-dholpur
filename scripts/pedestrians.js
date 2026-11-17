// =============================================
// PEDESTRIANS - pastel toy villagers with a walk cycle, idle sway and a wave
// =============================================

import * as THREE from 'three';
import { ROAD_HALF_WIDTH, SHOULDER_WIDTH, GRASS_WIDTH, PLAYER_START_Z, ANIM } from './constants.js';
import { roadPoint } from './roadpath.js';
import { roundedBox, lerp } from './rounded.js';

// Pedestrians are recycled around the player like the rest of the world: they
// live in a window ahead of / behind the bus and are moved back into view.
const PED_AHEAD = 220;
const PED_BEHIND = 60;

const PEDESTRIAN_HEIGHT = 1.1;

// Pastel outfits. `turban` men wear a coloured pagdi, `sari` women a long
// skirt and dupatta, which is how Rajasthani villagers read at a glance.
const PEDESTRIAN_VARIANTS = [
    { skin: 0xF2CDA8, top: 0xFF9AA2, bottom: 0x7E8FB5, turban: 0xFF8F6B },
    { skin: 0xDDB088, top: 0x9AD1FF, bottom: 0xF2EBDD, turban: 0xFFD166 },
    { skin: 0xB98A6E, top: 0x9BE8B5, bottom: 0x8A78B5, turban: 0xF06292 },
    { skin: 0xE2B48C, top: 0xFFD58A, bottom: 0xC94F7C, sari: 0xF06292 },
    { skin: 0xC99A78, top: 0xC9A8F5, bottom: 0xFFA94D, sari: 0x4DB6AC },
    { skin: 0xF2CDA8, top: 0xFFF1D6, bottom: 0xE85D75, sari: 0xFFB84D }
];

const mat = (color) => new THREE.MeshLambertMaterial({ color });

/** A limb that swings from a pivot at its top. */
function makeLimb(width, length, depth, color, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(roundedBox(width, length, depth, width * 0.4), mat(color));
    mesh.position.y = -length / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
}

/**
 * Creates a chunky toy pedestrian with articulated arms and legs.
 * @param {number} variant - Outfit index
 * @returns {THREE.Group} Pedestrian group
 */
export function createPedestrian(variant = 0) {
    const pedGroup = new THREE.Group();
    const c = PEDESTRIAN_VARIANTS[variant % PEDESTRIAN_VARIANTS.length];

    const headSize = 0.28;
    const bodyWidth = 0.36;
    const bodyHeight = 0.48;
    const bodyDepth = 0.22;
    const limbWidth = 0.12;
    const legLength = 0.4;

    // The torso group bobs and sways; legs stay planted at the hips
    const torso = new THREE.Group();
    torso.position.y = legLength;
    pedGroup.add(torso);

    const body = new THREE.Mesh(roundedBox(bodyWidth, bodyHeight, bodyDepth), mat(c.top));
    body.position.y = bodyHeight / 2;
    body.castShadow = true;
    torso.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(headSize * 0.58, 12, 10), mat(c.skin));
    head.position.y = bodyHeight + headSize * 0.55;
    head.castShadow = true;
    torso.add(head);

    if (c.turban) {
        const turban = new THREE.Mesh(new THREE.SphereGeometry(headSize * 0.66, 12, 8), mat(c.turban));
        turban.scale.set(1, 0.7, 1);
        turban.position.y = bodyHeight + headSize * 0.78;
        turban.castShadow = true;
        torso.add(turban);
    } else {
        // Dupatta draped over the head and shoulders
        const veil = new THREE.Mesh(new THREE.SphereGeometry(headSize * 0.64, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(c.sari));
        veil.position.y = bodyHeight + headSize * 0.6;
        torso.add(veil);
        const drape = new THREE.Mesh(roundedBox(bodyWidth * 1.1, bodyHeight * 0.3, bodyDepth * 1.2), mat(c.sari));
        drape.position.y = bodyHeight * 0.82;
        torso.add(drape);
    }

    // Arms swing from the shoulders
    const armL = makeLimb(limbWidth, 0.36, limbWidth, c.skin, -(bodyWidth / 2 + limbWidth / 2), bodyHeight * 0.92);
    const armR = makeLimb(limbWidth, 0.36, limbWidth, c.skin, bodyWidth / 2 + limbWidth / 2, bodyHeight * 0.92);
    torso.add(armL, armR);

    // Legs (or a swaying skirt for sari wearers)
    const legColor = c.sari ? c.skin : c.bottom;
    const legL = makeLimb(limbWidth, legLength, limbWidth, legColor, -bodyWidth * 0.24, legLength);
    const legR = makeLimb(limbWidth, legLength, limbWidth, legColor, bodyWidth * 0.24, legLength);
    pedGroup.add(legL, legR);

    if (c.sari) {
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(bodyWidth * 0.55, bodyWidth * 0.85, 0.46, 10), mat(c.sari));
        skirt.position.y = legLength + 0.02;
        skirt.castShadow = true;
        pedGroup.add(skirt);
    }

    pedGroup.userData = {
        walkSpeed: 1.5 + Math.random() * 1.0,
        walkRange: 5 + Math.random() * 5,
        startX: 0,
        startZ: 0,
        direction: Math.random() > 0.5 ? 1 : -1,
        walkPhase: Math.random() * Math.PI * 2,
        // Animation state
        parts: { torso, head, armL, armR, legL, legR },
        stride: Math.random() * Math.PI * 2,
        idleOffset: Math.random() * Math.PI * 2,
        moving: 1,
        waver: Math.random() < ANIM.WAVE_CHANCE * 3,
        waveBlend: 0,
        prevX: 0
    };

    return pedGroup;
}

/**
 * Poses a figure. `speed` > 0 walks, otherwise it idles with a sway; `wave`
 * (0..1) raises the right arm and swings it side to side.
 * @param {THREE.Group} figure - from createPedestrian
 * @param {number} time - seconds
 * @param {number} speed - 0..1 how much the figure is walking
 * @param {number} [wave] - 0..1
 */
export function poseFigure(figure, time, speed, wave = 0) {
    const d = figure.userData;
    const p = d.parts;
    if (!p) return;

    const swing = Math.sin(d.stride) * ANIM.WALK_SWING * speed;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.8;
    p.armR.rotation.x = swing * 0.8;

    // Walk bob (twice per stride) and idle sway when standing
    const bob = Math.abs(Math.sin(d.stride)) * 0.05 * speed;
    const sway = Math.sin(time * 1.6 + d.idleOffset) * (1 - speed);
    p.torso.position.y = 0.4 + bob + sway * 0.006;
    p.torso.rotation.z = sway * 0.04 + Math.sin(d.stride) * 0.04 * speed;
    p.head.rotation.y = Math.sin(time * 0.7 + d.idleOffset) * 0.25 * (1 - speed);

    if (wave > 0.01) {
        p.armR.rotation.x = lerp(p.armR.rotation.x, Math.PI * 0.95, wave);
        p.armR.rotation.z = Math.sin(time * 9) * 0.45 * wave;
    } else {
        p.armR.rotation.z = 0;
    }
}

/**
 * Creates and places pedestrians along road edges
 * @param {number} count - Number of pedestrians to create
 * @returns {Array<THREE.Group>} Array of pedestrian groups
 */
export function makePedestrians(count = 8) {
    const pedestrians = [];

    const sidewalkStartX = ROAD_HALF_WIDTH + SHOULDER_WIDTH + 1;
    const sidewalkEndX = sidewalkStartX + GRASS_WIDTH;

    for (let i = 0; i < count; i++) {
        const ped = createPedestrian(i % PEDESTRIAN_VARIANTS.length);

        const side = Math.random() > 0.5 ? 1 : -1;
        const baseX = side * (sidewalkStartX + Math.random() * (sidewalkEndX - sidewalkStartX));
        const baseZ = PLAYER_START_Z - 20 - Math.random() * (PED_AHEAD - 40);

        // startX is the distance from the road's centre line (the road bends)
        const at = roadPoint(baseZ, baseX);
        ped.position.set(at.x, 0, at.z);
        ped.userData.startX = baseX;
        ped.userData.startZ = baseZ;
        ped.userData.prevX = baseX;

        // Face walking direction
        ped.rotation.y = ped.userData.direction > 0 ? 0 : Math.PI;

        pedestrians.push(ped);
    }

    return pedestrians;
}

let pedClock = 0;

/**
 * Updates all pedestrians (walking back and forth, with a leg/arm swing).
 * Pedestrians that fall outside the window around the bus are moved back in
 * front of the player, so there are always people along the endless road.
 * People that walk wave when the bus passes close by.
 *
 * @param {Array<THREE.Group>} pedestrians - Array of pedestrian groups
 * @param {number} dt - Delta time in seconds
 * @param {THREE.Object3D} [bus] - Player bus, used to recycle the walkers
 */
export function updatePedestrians(pedestrians, dt, bus) {
    pedClock += dt;
    pedestrians.forEach(ped => {
        const data = ped.userData;

        // Walk back and forth along X axis (perpendicular to road)
        data.walkPhase += data.walkSpeed * dt * 0.5;
        const walkOffset = Math.sin(data.walkPhase) * data.walkRange * 0.5;

        const lateral = data.startX + walkOffset * data.direction;
        const at = roadPoint(data.startZ !== undefined ? data.startZ : ped.position.z, lateral);
        ped.position.x = at.x;
        ped.position.z = at.z;

        // Update facing direction based on movement (relative to the road)
        const currentDirection = Math.sin(data.walkPhase) > 0 ? 1 : -1;
        ped.rotation.y = (currentDirection > 0 ? 0 : Math.PI) + at.heading;

        // Animation: stride follows the real ground speed
        const moved = dt > 0 ? Math.abs(lateral - data.prevX) / dt : 0;
        data.prevX = lateral;
        data.stride += moved * dt * 5.5;
        const walking = Math.min(1, moved / 0.8);
        data.moving += (walking - data.moving) * Math.min(1, 8 * dt);

        // Wave at a passing bus
        let waveTarget = 0;
        if (bus && data.waver) {
            const dz = Math.abs(ped.position.z - bus.position.z);
            const dx = Math.abs(ped.position.x - bus.position.x);
            if (dz < 22 && dx < 30) waveTarget = 1;
        }
        data.waveBlend += (waveTarget - data.waveBlend) * Math.min(1, 6 * dt);
        poseFigure(ped, pedClock, data.moving, data.waveBlend);

        // Keep the walkers wrapped around the player on the endless road
        if (bus) {
            const behind = ped.position.z > bus.position.z + PED_BEHIND;
            const farAhead = ped.position.z < bus.position.z - PED_AHEAD;

            if (behind || farAhead) {
                ped.position.z = bus.position.z - 40 - Math.random() * (PED_AHEAD - 80);
                data.startZ = ped.position.z;
            }
        }
    });
}
