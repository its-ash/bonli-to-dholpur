// =============================================
// LANDSCAPE - forests, ponds, lakes and mountains beside the endless road
// Everything sits well away from the carriageway and the roadside buildings,
// and is recycled along the road like the rest of the scenery:
//   - forests:   oval patches of pines, broadleaf trees and bushes
//   - ponds:     small ponds near the road with reeds, rocks and lily pads
//   - lakes:     large lakes with rocky shores, a wooden jetty and a moored boat
//   - mountains: rugged ranges coloured by height (forest, scrub, rock, snow)
// Water is built from overlapping ellipses so every shoreline is irregular.
// Trees that would stand in water are hidden whenever a lake or pond moves.
// Tunables live in LANDSCAPE in constants.js.
// =============================================

import * as THREE from 'three';
import { LANDSCAPE, PLAYER_START_Z } from './constants.js';
import { recycleBehind } from './endless.js';

const { FOREST, POND, LAKE, MOUNTAIN } = LANDSCAPE;

// Shore and water sit just above the ground; polygon offsets settle any overlap
const SHORE_Y = 0.06;
const WATER_Y = 0.1;

// Scale given to an instance that must not be seen (a tree standing in water)
const HIDDEN = 1e-4;

const PINE_COLORS = [0x1F3B26, 0x24452B, 0x2B4F30, 0x1A3322];
const BROADLEAF_COLORS = [0x3E6B2F, 0x4A7A35, 0x557F3A, 0x35602A, 0x6B8A3A];
const BUSH_COLORS = [0x2F5A2A, 0x3C6630, 0x4B6E2E];
const TRUNK_COLORS = [0x4A3728, 0x3E2E22, 0x5A4532];
const ROCK_COLORS = [0x7A7468, 0x6A655C, 0x8A8478, 0x5E5A52];
const REED_COLORS = [0x6B7F3A, 0x7F8A45, 0x5C6E33];
const LILY_COLORS = [0x3E7A3A, 0x4C8A3E, 0x356B33];
const MOUNTAIN_FOREST = 0x2F4A2A;
const MOUNTAIN_SCRUB = 0x5A6B3C;
const MOUNTAIN_ROCK = [0x6E655A, 0x7A7266, 0x625B52];
const MOUNTAIN_SNOW = 0xF2F4F7;

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Moves a geometry up so its base sits at y = 0 (no-op where unsupported).
 * @param {THREE.BufferGeometry} geometry
 * @param {number} y
 * @returns {THREE.BufferGeometry}
 */
function lift(geometry, y) {
    if (geometry.translate) geometry.translate(0, y, 0);
    return geometry;
}

/**
 * Deterministic noise in [-1, 1] for a vertex position, so duplicated seam
 * vertices of a mesh are always displaced the same way (no cracks).
 */
function hashNoise(x, y, z, seed) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.137) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
}

/**
 * A random point inside an ellipse with half-axes (a, b).
 * @returns {{x: number, z: number}}
 */
function pointInOval(a, b) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    return { x: Math.cos(angle) * a * r, z: Math.sin(angle) * b * r };
}

/**
 * True when (x, z) lies inside any water ellipse, grown by `margin`.
 * @param {number} x
 * @param {number} z
 * @param {Array<{x:number,z:number,rx:number,rz:number}>} water - World-space ellipses
 * @param {number} margin
 * @returns {boolean}
 */
export function isInWater(x, z, water, margin = 0) {
    return water.some(e => {
        const dx = (x - e.x) / (e.rx + margin);
        const dz = (z - e.z) / (e.rz + margin);
        return dx * dx + dz * dz < 1;
    });
}

/**
 * A tileable canvas texture of rippling water with depth patches and glints.
 * @returns {THREE.CanvasTexture}
 */
function createRippleTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2B5B78';
    ctx.fillRect(0, 0, size, size);

    // Each mark is drawn four times so it wraps across the tile edges
    const wrapped = (x, y, w, h) => {
        [0, -size].forEach(ox => [0, -size].forEach(oy => ctx.fillRect(x + ox, y + oy, w, h)));
    };

    for (let i = 0; i < 70; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(20, 60, 85, 0.35)' : 'rgba(70, 120, 150, 0.25)';
        wrapped(Math.random() * size, Math.random() * size, 6 + Math.random() * 20, 2 + Math.random() * 4);
    }
    ctx.fillStyle = 'rgba(205, 228, 242, 0.55)';
    for (let i = 0; i < 45; i++) {
        wrapped(Math.random() * size, Math.random() * size, 3 + Math.random() * 8, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * A rugged cone: the surface is pushed in and out with noise, and every vertex
 * is coloured by height - forested foothills, scrub, bare rock and, on the
 * tallest peaks, snow. The base sits at y = 0.
 *
 * @param {number} radius
 * @param {number} height
 * @param {boolean} snowy
 * @returns {THREE.BufferGeometry}
 */
function createMountainGeometry(radius, height, snowy) {
    const geometry = new THREE.ConeGeometry(radius, height, 14, 7, true);
    const position = geometry.attributes && geometry.attributes.position;
    if (!position) return geometry;

    const seed = Math.random() * 100;
    const round = (v) => Math.round(v * 100) / 100;
    const color = new THREE.Color();
    const colors = [];

    for (let i = 0; i < position.count; i++) {
        let x = position.getX(i);
        let y = position.getY(i);
        let z = position.getZ(i);
        const t = (y + height / 2) / height;   // 0 at the base, 1 at the summit
        const n = hashNoise(round(x), round(y), round(z), seed);

        // The base ring and summit stay put; the slopes become ridges and gullies
        if (t > 0.001 && t < 0.999) {
            const k = 1 + 0.22 * n;
            x *= k;
            z *= k;
            y += n * height * 0.05;
        }
        position.setXYZ(i, x, y, z);

        const level = t + n * 0.07;
        let hex = MOUNTAIN_FOREST;
        if (snowy && level > 0.72) hex = MOUNTAIN_SNOW;
        else if (level > 0.4) hex = MOUNTAIN_ROCK[Math.floor(((n + 1) / 2) * MOUNTAIN_ROCK.length) % MOUNTAIN_ROCK.length];
        else if (level > 0.15) hex = MOUNTAIN_SCRUB;
        color.set(hex);
        colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.translate(0, height / 2, 0);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Creates the landscape and returns a controller that recycles it around the bus.
 *
 * @param {{bus: THREE.Object3D, scene: THREE.Object3D}} options
 * @returns {{
 *   forests: Array<THREE.Group>, ponds: Array<THREE.Group>,
 *   lakes: Array<THREE.Group>, mountains: Array<THREE.Group>,
 *   update: (dt: number) => void,
 *   waterEllipses: () => Array<{x:number,z:number,rx:number,rz:number}>,
 *   getState: () => Object
 * }}
 */
export function createLandscape({ bus, scene }) {
    const startZ = PLAYER_START_Z;

    // --- Shared geometry and materials --------------------------------
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    const flat = (color = 0xFFFFFF) => new THREE.MeshLambertMaterial({ color, flatShading: true });

    const trunkGeometry = lift(new THREE.CylinderGeometry(0.16, 0.26, 2.6, 6), 1.3);
    const pineLowGeometry = lift(new THREE.ConeGeometry(1.9, 3.8, 8), 3.3);
    const pineHighGeometry = lift(new THREE.ConeGeometry(1.3, 3.2, 8), 5.2);
    const crownGeometry = lift(new THREE.IcosahedronGeometry(2.0, 1), 3.9);
    const bushGeometry = lift(new THREE.IcosahedronGeometry(0.9, 0), 0.55);
    const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
    const reedGeometry = lift(new THREE.BoxGeometry(0.07, 1.6, 0.07), 0.8);
    const lilyGeometry = new THREE.CircleGeometry(0.5, 8);
    const discGeometry = new THREE.CircleGeometry(1, 40);

    const trunkMaterial = flat();
    const pineMaterial = flat();
    const broadleafMaterial = flat();
    const bushMaterial = flat();
    const rockMaterial = flat();
    const reedMaterial = flat();
    const mountainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    const rippleTexture = createRippleTexture();
    // Overlapping ellipses each get their own polygon offset, so the upper one
    // always wins the depth test and the ripples never flicker
    const waterMaterials = [0, 1, 2].map(i => new THREE.MeshStandardMaterial({
        map: rippleTexture,
        roughness: 0.18,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2 - i,
        polygonOffsetUnits: -2 - i
    }));
    const shoreMaterial = new THREE.MeshLambertMaterial({
        color: 0xA89268,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });
    const lilyMaterial = new THREE.MeshLambertMaterial({
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6
    });

    // --- Instance helpers ------------------------------------------------
    function setInstance(mesh, index, x, y, z, sx, sy, sz, rotY = 0, tilt = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.x = tilt;
        dummy.rotation.y = rotY;
        dummy.rotation.z = 0;
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
    }

    function finishInstances(mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.computeBoundingSphere) mesh.computeBoundingSphere();
    }

    function paint(mesh, palette) {
        for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, tint.set(pick(palette)));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    function instanced(geometry, material, count, parent, shadows = true) {
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    // --- Water: ponds and lakes ---------------------------------------
    function createJetty() {
        const jetty = new THREE.Group();
        const wood = flat(0x7A5A3A);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 1.6), wood);
        deck.position.set(4.5, 0.55, 0);
        deck.castShadow = true;
        deck.receiveShadow = true;
        jetty.add(deck);
        [1, 4.5, 8].forEach(x => [-0.7, 0.7].forEach(z => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), wood);
            post.position.set(x, 0.3, z);
            jetty.add(post);
        }));
        return jetty;
    }

    function createBoat() {
        const boat = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 3.2), flat(0x8B5A2B));
        hull.position.y = 0.2;
        hull.castShadow = true;
        boat.add(hull);
        const inside = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 2.8), flat(0x5A3A1E));
        inside.position.y = 0.4;
        boat.add(inside);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.3), flat(0xA67C52));
        seat.position.y = 0.5;
        boat.add(seat);
        return boat;
    }

    /**
     * A pond or lake: overlapping water ellipses on a shore ring, plus rocks
     * and reeds, lily pads on ponds, and a jetty and boat on lakes.
     */
    function createWaterBody(kind, side) {
        const lake = kind === 'lake';
        const body = new THREE.Group();
        const shores = [];
        const waters = [];

        for (let i = 0; i < (lake ? 3 : 2); i++) {
            const shore = new THREE.Mesh(discGeometry, shoreMaterial);
            shore.rotation.x = -Math.PI / 2;
            shore.position.y = SHORE_Y;
            shore.receiveShadow = true;
            body.add(shore);
            shores.push(shore);

            const water = new THREE.Mesh(discGeometry, waterMaterials[i]);
            water.rotation.x = -Math.PI / 2;
            water.position.y = WATER_Y + i * 0.01;
            water.receiveShadow = true;
            body.add(water);
            waters.push(water);
        }

        const rocks = instanced(rockGeometry, rockMaterial, lake ? 14 : 6, body);
        const reeds = instanced(reedGeometry, reedMaterial, lake ? 18 : 24, body, false);
        paint(rocks, ROCK_COLORS);
        paint(reeds, REED_COLORS);

        let lilies = null;
        let jetty = null;
        let boat = null;
        if (lake) {
            jetty = createJetty();
            boat = createBoat();
            body.add(jetty);
            body.add(boat);
        } else {
            lilies = instanced(lilyGeometry, lilyMaterial, 7, body, false);
            paint(lilies, LILY_COLORS);
        }

        body.userData = { kind, side, shores, waters, rocks, reeds, lilies, jetty, boat, ellipses: [] };
        return body;
    }

    /** Gives a water body a new random outline and redistributes its shore details. */
    function shapeWater(body, cfg) {
        const data = body.userData;
        const base = rand(cfg.RADIUS_MIN, cfg.RADIUS_MAX);

        // Ellipse 0 is the main basin; the others are bays that break its outline
        data.ellipses = data.waters.map((_, i) => ({
            x: i === 0 ? 0 : rand(-0.45, 0.45) * base,
            z: i === 0 ? 0 : rand(-0.7, 0.7) * base,
            rx: base * rand(0.65, 1.0) * (i === 0 ? 1 : 0.7),
            rz: base * rand(0.9, 1.5) * (i === 0 ? 1 : 0.7)
        }));

        data.ellipses.forEach((e, i) => {
            data.waters[i].position.x = e.x;
            data.waters[i].position.z = e.z;
            data.waters[i].scale.set(e.rx, e.rz, 1);
            data.shores[i].position.x = e.x;
            data.shores[i].position.z = e.z;
            data.shores[i].scale.set(e.rx + LANDSCAPE.SHORE_WIDTH, e.rz + LANDSCAPE.SHORE_WIDTH, 1);
        });

        const rim = (e, angle, grow = 0) => ({
            x: e.x + (e.rx + grow) * Math.cos(angle),
            z: e.z + (e.rz + grow) * Math.sin(angle)
        });
        const main = data.ellipses[0];

        // Rocks scattered along the shore, half buried
        for (let i = 0; i < data.rocks.count; i++) {
            const p = rim(pick(data.ellipses), rand(0, Math.PI * 2), rand(-0.3, 1.8));
            const s = rand(0.35, data.kind === 'lake' ? 1.3 : 0.8);
            setInstance(data.rocks, i, p.x, 0.15, p.z, s * rand(0.8, 1.3), s * 0.7, s, rand(0, Math.PI * 2));
        }
        finishInstances(data.rocks);

        // Reeds grow in clumps in the shallows
        const clumps = [rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2)];
        for (let i = 0; i < data.reeds.count; i++) {
            const p = rim(main, clumps[i % clumps.length] + rand(-0.15, 0.15), rand(-0.8, 0.6));
            setInstance(data.reeds, i, p.x, 0, p.z, 1, rand(0.8, 1.5), 1, rand(0, Math.PI), rand(-0.15, 0.15));
        }
        finishInstances(data.reeds);

        if (data.lilies) {
            for (let i = 0; i < data.lilies.count; i++) {
                const p = pointInOval(main.rx * 0.7, main.rz * 0.7);
                const s = rand(0.6, 1.2);
                setInstance(data.lilies, i, main.x + p.x, WATER_Y + 0.04, main.z + p.z, s, s, s, 0, -Math.PI / 2);
            }
            finishInstances(data.lilies);
        }

        if (data.jetty) {
            // The jetty runs from the shore nearest the road out towards the middle
            const p = rim(main, data.side > 0 ? Math.PI : 0, 0.5);
            const dx = main.x - p.x;
            const dz = main.z - p.z;
            const length = Math.hypot(dx, dz) || 1;
            data.jetty.position.set(p.x, 0, p.z);
            data.jetty.rotation.y = Math.atan2(-dz, dx);

            // The boat is moored alongside the end of the jetty
            data.boat.position.set(
                p.x + (dx / length) * 8 - (dz / length) * 2.2,
                WATER_Y,
                p.z + (dz / length) * 8 + (dx / length) * 2.2
            );
            data.boat.rotation.y = data.jetty.rotation.y + Math.PI / 2 + 0.2;
        }
    }

    function placeWater(body, z) {
        const cfg = body.userData.kind === 'lake' ? LAKE : POND;
        body.position.set(body.userData.side * rand(cfg.X_MIN, cfg.X_MAX), 0, z);
        shapeWater(body, cfg);
    }

    // --- Forests ----------------------------------------------------------
    function createForestPatch(side) {
        const patch = new THREE.Group();
        const trunks = instanced(trunkGeometry, trunkMaterial, FOREST.PINES + FOREST.BROADLEAF, patch);
        const pineLow = instanced(pineLowGeometry, pineMaterial, FOREST.PINES, patch);
        const pineHigh = instanced(pineHighGeometry, pineMaterial, FOREST.PINES, patch);
        const crowns = instanced(crownGeometry, broadleafMaterial, FOREST.BROADLEAF, patch);
        const bushes = instanced(bushGeometry, bushMaterial, FOREST.BUSHES, patch);

        paint(trunks, TRUNK_COLORS);
        paint(crowns, BROADLEAF_COLORS);
        paint(bushes, BUSH_COLORS);
        // Both tiers of a pine share one shade of green
        for (let i = 0; i < FOREST.PINES; i++) {
            tint.set(pick(PINE_COLORS));
            pineLow.setColorAt(i, tint);
            pineHigh.setColorAt(i, tint);
        }
        [pineLow, pineHigh].forEach(mesh => { if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });

        patch.userData = { side, trunks, pineLow, pineHigh, crowns, bushes, trees: [], bushSpots: [] };
        return patch;
    }

    /** Scatters a fresh set of trees and bushes over the patch. */
    function seedForest(patch) {
        const data = patch.userData;
        data.trees = [];
        for (let i = 0; i < FOREST.PINES + FOREST.BROADLEAF; i++) {
            const pine = i < FOREST.PINES;
            const p = pointInOval(FOREST.HALF_WIDTH, FOREST.HALF_LENGTH);
            data.trees.push({
                type: pine ? 'pine' : 'broadleaf',
                x: p.x,
                z: p.z,
                s: pine ? rand(0.8, 1.6) : rand(0.8, 1.4),
                wide: rand(0.85, 1.25),
                rot: rand(0, Math.PI * 2),
                hidden: false
            });
        }
        data.bushSpots = [];
        for (let i = 0; i < FOREST.BUSHES; i++) {
            const p = pointInOval(FOREST.HALF_WIDTH * 1.1, FOREST.HALF_LENGTH * 1.1);
            data.bushSpots.push({ x: p.x, z: p.z, s: rand(0.6, 1.3), rot: rand(0, Math.PI * 2), hidden: false });
        }
    }

    /** Writes the instance matrices, hiding any tree or bush that stands in water. */
    function layoutForest(patch, water) {
        const data = patch.userData;
        const margin = LANDSCAPE.SHORE_WIDTH + LANDSCAPE.SHORE_MARGIN;
        let pine = 0;
        let broad = 0;

        data.trees.forEach((t, i) => {
            t.hidden = isInWater(patch.position.x + t.x, patch.position.z + t.z, water, margin);
            const s = t.hidden ? HIDDEN : t.s;
            setInstance(data.trunks, i, t.x, 0, t.z, s, s, s, t.rot);
            if (t.type === 'pine') {
                setInstance(data.pineLow, pine, t.x, 0, t.z, s, s, s, t.rot);
                setInstance(data.pineHigh, pine, t.x, 0, t.z, s, s, s, t.rot);
                pine += 1;
            } else {
                setInstance(data.crowns, broad, t.x, 0, t.z, s * t.wide, s, s * t.wide, t.rot);
                broad += 1;
            }
        });

        data.bushSpots.forEach((b, i) => {
            b.hidden = isInWater(patch.position.x + b.x, patch.position.z + b.z, water, margin);
            const s = b.hidden ? HIDDEN : b.s;
            setInstance(data.bushes, i, b.x, 0, b.z, s * 1.3, s, s * 1.3, b.rot);
        });

        [data.trunks, data.pineLow, data.pineHigh, data.crowns, data.bushes].forEach(finishInstances);
    }

    function placeForest(patch, z, water) {
        const side = patch.userData.side;
        patch.position.set(side * rand(FOREST.X_MIN, FOREST.X_MAX), 0, z);
        seedForest(patch);
        layoutForest(patch, water);
    }

    // --- Mountains ----------------------------------------------------------
    function createMountainRange(side) {
        const range = new THREE.Group();
        const peaks = [];
        for (let i = 0; i < MOUNTAIN.PEAKS; i++) {
            const height = rand(70, 170);
            const peak = new THREE.Mesh(createMountainGeometry(rand(55, 95), height, height > 115), mountainMaterial);
            range.add(peak);
            peaks.push(peak);
        }
        range.userData = { side, peaks };
        return range;
    }

    function placeMountainRange(range, z) {
        const { side, peaks } = range.userData;
        range.position.set(side * rand(MOUNTAIN.X_MIN, MOUNTAIN.X_MAX), 0, z);
        peaks.forEach((peak, i) => {
            const s = rand(0.85, 1.2);
            peak.position.set(rand(-30, 30), 0, (i - (peaks.length - 1) / 2) * rand(45, 70));
            peak.scale.set(s * rand(0.9, 1.25), s, s * rand(0.9, 1.25));
            peak.rotation.y = rand(0, Math.PI * 2);
        });
    }

    // --- Build and lay out the first stretch --------------------------------
    const alternate = (i) => (i % 2 === 0 ? -1 : 1);

    const ponds = Array.from({ length: POND.COUNT }, (_, i) => createWaterBody('pond', alternate(i)));
    const lakes = Array.from({ length: LAKE.COUNT }, (_, i) => createWaterBody('lake', -alternate(i)));
    const forests = Array.from({ length: FOREST.COUNT }, (_, i) => createForestPatch(alternate(i)));
    const mountains = Array.from({ length: MOUNTAIN.COUNT }, (_, i) => createMountainRange(alternate(i)));

    ponds.forEach((pond, i) => placeWater(pond, startZ - 80 - i * 110));
    lakes.forEach((lake, i) => placeWater(lake, startZ - 150 - i * 260));

    /** Every water ellipse in world space. */
    function waterEllipses() {
        return [...ponds, ...lakes].flatMap(body => body.userData.ellipses.map(e => ({
            x: body.position.x + e.x,
            z: body.position.z + e.z,
            rx: e.rx,
            rz: e.rz
        })));
    }

    const initialWater = waterEllipses();
    forests.forEach((patch, i) => placeForest(patch, startZ + 40 - i * 80, initialWater));
    mountains.forEach((range, i) => placeMountainRange(range, startZ + 250 - i * 100));

    [...ponds, ...lakes, ...forests, ...mountains].forEach(item => scene.add(item));

    // --- Per-frame update ---------------------------------------------------
    let time = 0;

    /**
     * Recycles everything that fell behind the bus, re-checks the forests
     * against any water that moved, and animates the water and boats.
     * @param {number} dt - Delta time in seconds
     */
    function update(dt) {
        const busZ = bus.position.z;
        time += dt;

        const waterMoved =
            recycleBehind(ponds, busZ, {
                behind: POND.BEHIND,
                gapFor: () => rand(POND.GAP_MIN, POND.GAP_MAX),
                place: placeWater
            }) +
            recycleBehind(lakes, busZ, {
                behind: LAKE.BEHIND,
                gapFor: () => rand(LAKE.GAP_MIN, LAKE.GAP_MAX),
                place: placeWater
            });

        const water = waterEllipses();
        recycleBehind(forests, busZ, {
            behind: FOREST.BEHIND,
            gapFor: () => rand(FOREST.GAP_MIN, FOREST.GAP_MAX),
            place: (patch, z) => placeForest(patch, z, water)
        });
        if (waterMoved > 0) forests.forEach(patch => layoutForest(patch, water));

        recycleBehind(mountains, busZ, {
            behind: MOUNTAIN.BEHIND,
            gapFor: () => rand(MOUNTAIN.GAP_MIN, MOUNTAIN.GAP_MAX),
            place: placeMountainRange
        });

        // Ripples drift slowly across the water; the boats bob on them
        rippleTexture.offset.x = (rippleTexture.offset.x + dt * 0.01) % 1;
        rippleTexture.offset.y = (rippleTexture.offset.y + dt * 0.006) % 1;
        lakes.forEach((lake, i) => {
            const boat = lake.userData.boat;
            boat.position.y = WATER_Y + Math.sin(time * 1.6 + i) * 0.05;
            boat.rotation.z = Math.sin(time * 1.3 + i) * 0.03;
        });
    }

    return {
        forests,
        ponds,
        lakes,
        mountains,
        update,
        waterEllipses,
        getState: () => ({
            forests: forests.length,
            ponds: ponds.length,
            lakes: lakes.length,
            mountainRanges: mountains.length,
            visibleTrees: forests.reduce((n, patch) => n + patch.userData.trees.filter(t => !t.hidden).length, 0)
        })
    };
}
