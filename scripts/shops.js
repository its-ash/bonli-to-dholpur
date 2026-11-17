// =============================================
// ROADSIDE DHABAS - pixel-art restaurants
// Every dhaba is a small eatery by the road: an open front, a striped awning,
// a painted signboard, a cooking counter and a dining area with table-mats,
// benches and people sitting down to eat.
//
// The buildings are recycled by the endless world (scripts/endless.js), so
// `createDhaba()` only builds one self-contained group at the origin.
// =============================================

import * as THREE from 'three';
import { roundedBox, registerAnimation, pastel, setHex } from './rounded.js';
import { ROAD_HALF_WIDTH, SHOULDER_WIDTH } from './constants.js';
import { createPedestrian, poseFigure } from './pedestrians.js';

// Tyre/ring shape; falls back to a fat disc where TorusGeometry is unavailable.
function ringGeo(r, tube) {
    if (THREE.TorusGeometry) return new THREE.TorusGeometry(r, tube, 8, 14);
    return new THREE.CylinderGeometry(r + tube, r + tube, tube * 2, 12);
}

// Pixel-art palettes: one entry per dhaba "flavour"
const DHABA_VARIANTS = [
    {
        wall: 0xE8D9B0, roof: 0xB23A2E, trim: 0x8B2500,
        awning: ['#E74C3C', '#FFFFFF'], sign: '#FFD700', ink: '#6D1B00',
        name: 'शेर सिंह ढाबा'
    },
    {
        wall: 0xD7C3A0, roof: 0x2C6E8A, trim: 0x143B4A,
        awning: ['#3498DB', '#F5F5F5'], sign: '#F5F5F5', ink: '#143B4A',
        name: 'हाईवे ढाबा'
    },
    {
        wall: 0xEADBC8, roof: 0x2E7D32, trim: 0x1B4A1E,
        awning: ['#2ECC71', '#FFF59D'], sign: '#FFB300', ink: '#3E2723',
        name: 'पंजाबी ढाबा'
    },
    {
        wall: 0xDCC9A8, roof: 0x8B4513, trim: 0x4A2408,
        awning: ['#F39C12', '#FFFFFF'], sign: '#FFFFFF', ink: '#8B2500',
        name: 'मालवा भोजनालय'
    }
];

// Colours for the people sitting at the tables
const DINER_SHIRTS = [0xE74C3C, 0x3498DB, 0x2ECC71, 0xF39C12, 0x9B59B6, 0xE91E63];
const DINER_SKINS = [0xE8C5A0, 0xD4A574, 0x8D6E63];

/**
 * Wraps text onto at most `maxLines` lines so the signboard stays legible.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines
 * @returns {Array<string>}
 */
function wrapText(ctx, text, maxWidth, maxLines = 2) {
    const words = text.split(' ');
    const lines = [];
    let line = '';

    const fits = (candidate) => ctx.measureText(candidate).width <= maxWidth;

    words.forEach(word => {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate) || !line) {
            line = candidate;
        } else {
            lines.push(line);
            line = word;
        }
    });
    if (line) lines.push(line);

    // Too many lines: merge the tail into the last allowed line
    if (lines.length > maxLines) {
        const head = lines.slice(0, maxLines - 1);
        head.push(lines.slice(maxLines - 1).join(' '));
        return head;
    }
    return lines;
}

/**
 * Draws a readable dhaba signboard.
 * Big, high-contrast Devanagari on a painted board: the text is drawn large
 * enough (and shrunk only until it fits) so it can actually be read from the
 * road, which is the whole point of a signboard.
 *
 * @param {string} text
 * @param {string} background
 * @param {string} ink
 * @returns {THREE.CanvasTexture}
 */
function createDhabaSignTexture(text, background, ink) {
    // 512x192 over a 5.4m board: enough texels that the Devanagari stays
    // crisp and legible from the road, not just up close.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    // Painted board with a thick border
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, 512, 12);
    ctx.fillRect(0, 180, 512, 12);
    ctx.fillRect(0, 0, 12, 192);
    ctx.fillRect(500, 0, 12, 192);

    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Start big and shrink only until the name fits on two lines
    let fontSize = 112;
    let lines = [text];
    const maxWidth = 456;

    while (fontSize > 36) {
        ctx.font = `bold ${fontSize}px "Noto Sans Devanagari", "Nirmala UI", sans-serif`;
        lines = wrapText(ctx, text, maxWidth, 2);
        const widest = Math.max(...lines.map(line => ctx.measureText(line).width));
        if (widest <= maxWidth && lines.length * fontSize * 1.15 <= 156) break;
        fontSize -= 4;
    }

    ctx.font = `bold ${fontSize}px "Noto Sans Devanagari", "Nirmala UI", sans-serif`;
    const lineHeight = fontSize * 1.15;
    const startY = 96 - (lineHeight * (lines.length - 1)) / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, 256, startY + i * lineHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Builds a diner sitting on a bench, seen from behind/side.
 * @param {Object} palette
 * @param {boolean} facingRoad - true when the diner sits facing the road
 * @returns {THREE.Group}
 */
function createDiner({ shirt, skin }, facingRoad) {
    const diner = new THREE.Group();

    const torso = new THREE.Mesh(
        roundedBox(0.32, 0.42, 0.2),
        new THREE.MeshLambertMaterial({ color: shirt })
    );
    torso.position.y = 0.66;
    torso.castShadow = true;
    diner.add(torso);

    const head = new THREE.Mesh(
        roundedBox(0.2, 0.2, 0.2),
        new THREE.MeshLambertMaterial({ color: skin })
    );
    head.position.y = 0.98;
    head.castShadow = true;
    diner.add(head);

    // Legs stick out towards the table
    const legs = new THREE.Mesh(
        roundedBox(0.28, 0.16, 0.34),
        new THREE.MeshLambertMaterial({ color: 0x2C3E50 })
    );
    legs.position.set(0, 0.44, 0.14);
    legs.castShadow = true;
    diner.add(legs);

    // Arms resting on the table
    const arms = new THREE.Mesh(
        roundedBox(0.36, 0.1, 0.26),
        new THREE.MeshLambertMaterial({ color: skin })
    );
    arms.position.set(0, 0.58, 0.16);
    diner.add(arms);

    // Plate on the table in front of them
    const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.03, 6),
        new THREE.MeshLambertMaterial({ color: 0xF2F2F2 })
    );
    plate.position.set(0, 0.56, 0.42);
    diner.add(plate);

    diner.userData.isDiner = true;
    if (!facingRoad) diner.rotation.y = Math.PI;
    return diner;
}

/**
 * Creates one roadside dhaba (restaurant) with a dining area and guests.
 * The origin is on the ground; `side` (-1 left of the road, +1 right) decides
 * which way the entrance, awning and signboard face.
 *
 * @param {number} side - -1 for the left of the road, +1 for the right
 * @param {number} variant - Index into DHABA_VARIANTS
 * @returns {THREE.Group}
 */
export function createDhaba(side = 1, variant = 0) {
    const dhaba = new THREE.Group();
    const base = DHABA_VARIANTS[((variant % DHABA_VARIANTS.length) + DHABA_VARIANTS.length) % DHABA_VARIANTS.length];
    // Soft candy pastel version of the variant's colours
    const colors = { ...base, wall: pastel(base.wall, 0.4), roof: pastel(base.roof, 0.5), trim: pastel(base.trim, 0.45) };

    const alongZ = 9 + Math.random() * 2;    // frontage along the road
    const alongX = 4.5 + Math.random() * 1;  // depth away from the road
    const height = 2.6 + Math.random() * 0.7;

    // Entrance faces the road, i.e. towards -side * X
    const front = -side;

    // --- Paved forecourt, so the diners are clearly off the road ---
    const forecourt = new THREE.Mesh(
        roundedBox(alongX + 8, 0.08, alongZ + 6),
        new THREE.MeshLambertMaterial({ color: 0xC8C0AE })
    );
    forecourt.position.set(front * 3.2, 0.04, 0);
    forecourt.receiveShadow = true;
    dhaba.add(forecourt);

    // --- Main wall block ---
    const walls = new THREE.Mesh(
        roundedBox(alongX, height, alongZ),
        new THREE.MeshLambertMaterial({ color: colors.wall })
    );
    walls.position.y = height / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    dhaba.add(walls);

    // --- Painted trim strip along the bottom of the wall ---
    const trim = new THREE.Mesh(
        roundedBox(0.08, 0.5, alongZ * 0.98),
        new THREE.MeshLambertMaterial({ color: colors.trim })
    );
    trim.position.set(front * (alongX / 2 + 0.02), 0.25, 0);
    dhaba.add(trim);

    // --- Roof slab with an overhang ---
    const roof = new THREE.Mesh(
        roundedBox(alongX + 1.6, 0.35, alongZ + 0.8),
        new THREE.MeshLambertMaterial({ color: colors.roof })
    );
    roof.position.set(front * 0.4, height + 0.15, 0);
    roof.castShadow = true;
    dhaba.add(roof);

    // --- Striped awning over the front terrace ---
    const stripeCount = 10;
    const stripeZ = alongZ / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
        const stripe = new THREE.Mesh(
            roundedBox(2.6, 0.12, stripeZ),
            new THREE.MeshLambertMaterial({
                color: colors.awning[i % colors.awning.length]
            })
        );
        stripe.position.set(
            front * (alongX / 2 + 1.0),
            height - 0.15,
            -alongZ / 2 + stripeZ / 2 + i * stripeZ
        );
        stripe.castShadow = true;
        dhaba.add(stripe);
    }

    // Awning support posts
    [-1, 1].forEach(end => {
        const post = new THREE.Mesh(
            roundedBox(0.12, height - 0.3, 0.12),
            new THREE.MeshLambertMaterial({ color: colors.trim })
        );
        post.position.set(front * (alongX / 2 + 2.2), (height - 0.3) / 2, end * (alongZ / 2 - 0.4));
        post.castShadow = true;
        dhaba.add(post);
    });

    // --- Signboard above the awning, facing the road ---
    // Big and high-contrast so the name is readable from the carriageway.
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(5.4, 2.0),
        new THREE.MeshBasicMaterial({
            map: createDhabaSignTexture(colors.name, colors.sign, colors.ink)
        })
    );
    sign.position.set(front * (alongX / 2 + 0.06), height + 0.7, 0);
    sign.rotation.y = front * Math.PI / 2;
    dhaba.add(sign);

    // Back of the sign so it is not invisible from the far lane
    const signBack = new THREE.Mesh(
        new THREE.PlaneGeometry(5.4, 2.0),
        new THREE.MeshLambertMaterial({ color: colors.roof })
    );
    signBack.position.copy(sign.position);
    signBack.rotation.y = sign.rotation.y + Math.PI;
    dhaba.add(signBack);

    // --- Open kitchen counter facing the terrace ---
    const counter = new THREE.Mesh(
        roundedBox(1.0, 1.0, alongZ * 0.45),
        new THREE.MeshLambertMaterial({ color: 0x8B5A2B })
    );
    counter.position.set(front * (alongX / 2 + 0.5), 0.5, -alongZ * 0.22);
    counter.castShadow = true;
    dhaba.add(counter);

    // Two big cooking pots on the counter (chai / dal)
    [-0.9, 0.9].forEach(offset => {
        const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.22, 0.3, 6),
            new THREE.MeshLambertMaterial({ color: 0x9AA0A6 })
        );
        pot.position.set(front * (alongX / 2 + 0.5), 1.15, -alongZ * 0.22 + offset);
        pot.castShadow = true;
        dhaba.add(pot);
    });

    // --- Dining area: a long table with benches along the road side ---
    const terraceZ = alongZ * 0.28;

    const table = new THREE.Mesh(
        roundedBox(1.5, 0.1, 3.4),
        new THREE.MeshLambertMaterial({ color: 0xC9A227 })
    );
    table.position.set(front * (alongX / 2 + 1.8), 0.7, terraceZ);
    table.castShadow = true;
    table.receiveShadow = true;
    dhaba.add(table);

    // Table legs
    [-1.4, 1.4].forEach(offset => {
        const leg = new THREE.Mesh(
            roundedBox(1.3, 0.7, 0.12),
            new THREE.MeshLambertMaterial({ color: 0x6B4423 })
        );
        leg.position.set(front * (alongX / 2 + 1.8), 0.35, terraceZ + offset);
        dhaba.add(leg);
    });

    // Benches on both sides of the table
    [-1, 1].forEach(benchSide => {
        const bench = new THREE.Mesh(
            roundedBox(0.55, 0.42, 3.1),
            new THREE.MeshLambertMaterial({ color: 0x8B5A2B })
        );
        bench.position.set(
            front * (alongX / 2 + 1.8) + benchSide * 1.0,
            0.21,
            terraceZ
        );
        bench.castShadow = true;
        dhaba.add(bench);
    });

    // --- People sitting and eating at the table ---
    const diners = [];
    const dinerCount = 3 + Math.floor(Math.random() * 2); // 3-4 guests
    for (let i = 0; i < dinerCount; i++) {
        const benchSide = i % 2 === 0 ? -1 : 1;
        const diner = createDiner(
            {
                shirt: DINER_SHIRTS[(variant + i) % DINER_SHIRTS.length],
                skin: DINER_SKINS[(variant + i) % DINER_SKINS.length]
            },
            // The guest on the road side faces the road, the other one faces back
            benchSide !== side
        );
        diner.position.set(
            front * (alongX / 2 + 1.8) + benchSide * 1.0,
            0.42,
            terraceZ - 1.0 + i * 0.66
        );
        diner.rotation.y = benchSide > 0 ? Math.PI / 2 : -Math.PI / 2;
        dhaba.add(diner);
        diners.push(diner);
    }

    // --- A parked scooter-style crate stack beside the counter ---
    const crateMaterial = new THREE.MeshLambertMaterial({ color: 0xB08C58 });
    for (let i = 0; i < 2; i++) {
        const crate = new THREE.Mesh(roundedBox(0.7, 0.7, 0.7), crateMaterial);
        crate.position.set(front * (alongX / 2 + 0.6), 0.35 + i * 0.7, alongZ * 0.42);
        crate.castShadow = true;
        dhaba.add(crate);
    }

    // Idle animation: diners nod while eating, the signboard sways in the breeze
    const signPhase = Math.random() * 6;
    registerAnimation(dhaba, (t) => {
        sign.rotation.z = Math.sin(t * 1.4 + signPhase) * 0.015;
        signBack.rotation.z = -sign.rotation.z;
        diners.forEach((d, i) => { d.position.y = 0.42 + Math.max(0, Math.sin(t * 3 + i * 1.9)) * 0.015; });
    });

    dhaba.userData.width = alongX;
    dhaba.userData.length = alongZ;
    dhaba.userData.height = height;
    dhaba.userData.shopName = colors.name;
    dhaba.userData.isDhaba = true;
    dhaba.userData.diners = diners;
    dhaba.userData.side = side;
    // Signboard text, so the readable name is available outside the texture
    dhaba.userData.signText = colors.name;
    // How far the building reaches away from the road (used for placement)
    dhaba.userData.buildingDepth = alongX;
    dhaba.userData.terraceDepth = 7;

    return dhaba;
}

/**
 * Rough footprint of a dhaba including its terrace, used by the endless world
 * to keep neighbouring buildings from overlapping.
 * @returns {number}
 */
export function dhabaZoneLength() {
    return 9 + 2 + 14; // frontage + jitter + breathing room
}

/**
 * Names of every dhaba flavour, so the UI/tests can list them
 * @returns {Array<string>}
 */
export function dhabaNames() {
    return DHABA_VARIANTS.map(variant => variant.name);
}

// =============================================
// RAJASTHANI VILLAGE CLUSTER
// A toy-style village strip: chai tadi, kirana, paan shop, sabzi cart, mobile
// recharge, tyre puncture shop, a dhaba corner with charpais, a small temple,
// a hand pump, mud houses with flat roofs, grazing cows/goats and villagers.
// Everything animates through the registry in rounded.js (ticked by
// updateBusPhysics), so no extra wiring is needed in main.js.
// =============================================

const VILLAGE_FONT = '"Noto Sans Devanagari", "Nirmala UI", sans-serif';
const BUNTING = [0xFF8FA8, 0xFFD166, 0x9AD1FF, 0x9BE8B5, 0xC9A8F5];

const lam = (color) => new THREE.MeshLambertMaterial({ color });

function makeBox(w, h, d, color, x, y, z, parent) {
    const m = new THREE.Mesh(roundedBox(w, h, d), lam(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    if (parent) parent.add(m);
    return m;
}

/** Small painted label board texture. */
function labelTexture(text, bg, ink) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 246, 86);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 54;
    ctx.font = `bold ${size}px ${VILLAGE_FONT}`;
    while (size > 20 && ctx.measureText(text).width > 220) {
        size -= 3;
        ctx.font = `bold ${size}px ${VILLAGE_FONT}`;
    }
    ctx.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function labelBoard(text, bg, ink, w = 2.6, h = 0.98) {
    return new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: labelTexture(text, bg, ink) })
    );
}

/** A stall that faces +Z; kind selects its wares. Returns the group. */
function createStall(kind, anim) {
    const g = new THREE.Group();
    const cfg = {
        chai: { name: 'चाय', wall: 0xFFE2B8, awn: 0xFF9AA2, sign: '#FFF1D6', ink: '#B5483A' },
        kirana: { name: 'किराना स्टोर', wall: 0xCDEBD3, awn: 0x7FD6B8, sign: '#FFFBE6', ink: '#2E7D5B' },
        paan: { name: 'पान शॉप', wall: 0xE3D3F5, awn: 0xC9A8F5, sign: '#FFFFFF', ink: '#6A3FA0' },
        recharge: { name: 'मोबाइल रिचार्ज', wall: 0xCFE6FA, awn: 0x7FB8F0, sign: '#FFFFFF', ink: '#1F5FA8' },
        tyre: { name: 'पंचर की दुकान', wall: 0xFFF1B0, awn: 0xFFB84D, sign: '#FFFFFF', ink: '#A85A00' }
    }[kind];

    makeBox(3.6, 2.4, 2.6, cfg.wall, 0, 1.2, -0.4, g).receiveShadow = true;
    makeBox(4.1, 0.2, 3.2, 0xFFF3DF, 0, 2.5, -0.2, g);                       // flat roof
    const awning = makeBox(4.0, 0.12, 1.5, cfg.awn, 0, 2.15, 1.25, g);       // candy awning
    awning.rotation.x = 0.18;
    makeBox(0.12, 2.1, 0.12, 0xB98A6E, -1.85, 1.05, 1.9, g);
    makeBox(0.12, 2.1, 0.12, 0xB98A6E, 1.85, 1.05, 1.9, g);
    makeBox(3.0, 0.8, 0.8, 0xB98A6E, 0, 0.4, 1.0, g);                        // counter

    const board = labelBoard(cfg.name, cfg.sign, cfg.ink);
    board.position.set(0, 3.1, 1.3);
    g.add(board);

    if (kind === 'chai') {
        const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.34, 10), lam(0xC9CFD6));
        kettle.position.set(-0.7, 1.0, 1.0);
        g.add(kettle);
        const steam = [];
        for (let i = 0; i < 3; i++) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6),
                new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 }));
            s.userData.phase = i / 3;
            g.add(s);
            steam.push(s);
        }
        anim.push((t) => steam.forEach(s => {
            const k = (t * 0.6 + s.userData.phase) % 1;
            s.position.set(-0.7 + Math.sin(k * 6) * 0.08, 1.25 + k * 0.9, 1.0);
            s.scale.setScalar(0.7 + k * 1.4);
            s.material.opacity = 0.5 * (1 - k);
        }));
    } else if (kind === 'kirana') {
        const jars = [0xFF9AA2, 0xFFD166, 0x9BE8B5, 0x9AD1FF, 0xC9A8F5];
        jars.forEach((c, i) => {
            const j = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), lam(c));
            j.position.set(-1.2 + i * 0.6, 1.0, 1.0);
            g.add(j);
            const j2 = new THREE.Mesh(j.geometry, j.material);
            j2.position.y = 1.6;
            j2.position.z = 0.8;
            g.add(j2);
        });
    } else if (kind === 'paan') {
        for (let i = 0; i < 6; i++) {
            const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(i % 2 ? 0xFFB84D : 0xFF8FA8));
            c.position.set(-1.0 + i * 0.4, 2.0, 1.95);
            g.add(c);
            c.userData.i = i;
            anim.push((t) => { c.position.y = 2.0 - Math.abs(Math.sin(t * 1.5 + i)) * 0.04; });
        }
    } else if (kind === 'recharge') {
        const phone = makeBox(0.5, 0.9, 0.08, 0x6A7A8C, 1.5, 2.0, 1.55, g);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x9AF0FF });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.7), glowMat);
        screen.position.set(0, 0, 0.05);
        phone.add(screen);
        anim.push((t) => setHex(glowMat, Math.sin(t * 3) > 0 ? 0x9AF0FF : 0xFFE08A));
    } else if (kind === 'tyre') {
        for (let i = 0; i < 3; i++) {
            const tyre = new THREE.Mesh(ringGeo(0.34, 0.14), lam(0x6B6F82));
            tyre.position.set(-1.0 + i * 0.1, 0.18 + i * 0.28, 2.2);
            tyre.rotation.x = Math.PI / 2;
            g.add(tyre);
        }
        const wheel = new THREE.Mesh(ringGeo(0.4, 0.12), lam(0x6B6F82));
        wheel.position.set(1.2, 1.4, 1.95);
        g.add(wheel);
        anim.push((t) => { wheel.rotation.z = t * 1.2; });
    }
    return g;
}

function createSabziCart(anim) {
    const g = new THREE.Group();
    makeBox(2.0, 0.15, 1.1, 0xE0B07A, 0, 0.8, 0, g);
    const veg = [0xFF8F6B, 0x9BE8B5, 0xFFD166, 0xFF8FA8, 0xB6E88C, 0xC9A8F5];
    veg.forEach((c, i) => {
        const v = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lam(c));
        v.position.set(-0.7 + (i % 3) * 0.7, 1.0, -0.25 + Math.floor(i / 3) * 0.5);
        g.add(v);
    });
    const wheels = [-1, 1].map(s => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 12), lam(0x8B6B4A));
        w.rotation.z = Math.PI / 2;
        w.position.set(s * 1.0, 0.4, 0.2);
        g.add(w);
        return w;
    });
    // Umbrella
    const pole = makeBox(0.06, 1.6, 0.06, 0xB98A6E, 0, 1.7, -0.4, g);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 12), lam(0xFF9AA2));
    canopy.position.set(0, 2.6, -0.4);
    g.add(canopy);
    anim.push((t) => { canopy.rotation.y = t * 0.3; pole.rotation.z = Math.sin(t * 1.2) * 0.01; });
    void wheels;
    return g;
}

function createMudHouse(w, d, h, color) {
    const g = new THREE.Group();
    makeBox(w, h, d, color, 0, h / 2, 0, g).receiveShadow = true;
    makeBox(w + 0.3, 0.22, d + 0.3, 0xF3E2C8, 0, h + 0.1, 0, g);                 // flat roof slab
    makeBox(w + 0.4, 0.3, 0.2, 0xE8CFA6, 0, h + 0.35, d / 2 + 0.05, g);         // parapet front
    makeBox(0.9, 1.5, 0.12, 0xFF8FA8, 0, 0.75, d / 2 + 0.02, g);                // painted door
    makeBox(0.7, 0.6, 0.1, 0x9AD1FF, w * 0.3, h * 0.65, d / 2 + 0.02, g);      // shutter window
    return g;
}

function createTemple(anim) {
    const g = new THREE.Group();
    makeBox(3.6, 0.4, 3.6, 0xF3E9DC, 0, 0.2, 0, g);
    makeBox(2.4, 1.6, 2.4, 0xFFE0E6, 0, 1.2, 0, g);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 4), lam(0xFFB3C1));
    spire.position.y = 3.2;
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = true;
    g.add(spire);
    const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lam(0xFFD166));
    kalash.position.y = 4.55;
    g.add(kalash);
    makeBox(0.08, 1.4, 0.08, 0xB98A6E, 0.9, 4.6, 0.9, g);
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xFF8F6B, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 4, 1), flagMat);
    flag.position.set(0.9, 5.0, 1.3);
    flag.rotation.y = Math.PI / 2;
    g.add(flag);
    anim.push((t) => { flag.rotation.y = Math.PI / 2 + Math.sin(t * 6) * 0.3; flag.scale.x = 0.92 + Math.sin(t * 9) * 0.08; });
    return g;
}

function createHandPump(anim) {
    const g = new THREE.Group();
    makeBox(0.9, 0.4, 0.9, 0xD9D4CC, 0, 0.2, 0, g);
    makeBox(0.2, 1.2, 0.2, 0x7FB8F0, 0, 1.0, 0, g);
    const handle = new THREE.Group();
    handle.position.set(0, 1.5, 0);
    makeBox(1.0, 0.1, 0.12, 0xFF8F6B, 0.3, 0, 0, handle);
    g.add(handle);
    makeBox(0.1, 0.1, 0.5, 0x7FB8F0, 0, 1.0, 0.3, g);
    anim.push((t) => { handle.rotation.z = Math.sin(t * 2.2) * 0.25; });
    return g;
}

function createCharpai(villager) {
    const g = new THREE.Group();
    makeBox(1.0, 0.1, 2.0, 0xFFC2A0, 0, 0.45, 0, g);
    makeBox(0.84, 0.04, 1.84, 0xFFF1D6, 0, 0.52, 0, g);
    [[-0.45, -0.9], [0.45, -0.9], [-0.45, 0.9], [0.45, 0.9]].forEach(([x, z]) => makeBox(0.1, 0.45, 0.1, 0xB98A6E, x, 0.22, z, g));
    if (villager) g.add(villager);
    return g;
}

function createAnimal(kind, anim) {
    const g = new THREE.Group();
    const cow = kind === 'cow';
    const bodyColor = cow ? 0xFFF6EA : 0xE8D2B8;
    const len = cow ? 1.7 : 1.0;
    const h = cow ? 0.8 : 0.5;
    makeBox(0.7 * (cow ? 1 : 0.7), h, len, bodyColor, 0, h + 0.4, 0, g);
    if (cow) makeBox(0.72, 0.4, 0.6, 0xFFB38A, 0, h + 0.55, 0.3, g);          // pastel patch
    const head = new THREE.Group();
    head.position.set(0, h + 0.7, -len / 2);
    makeBox(0.4, 0.4, 0.5, bodyColor, 0, 0, -0.2, head);
    makeBox(0.18, 0.12, 0.08, 0xFFB3C1, 0, -0.1, -0.48, head);                  // nose
    if (cow) [-1, 1].forEach(s => makeBox(0.06, 0.2, 0.06, 0xFFF1D6, s * 0.17, 0.28, -0.1, head));
    g.add(head);
    const legH = h * 0.7;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
        makeBox(0.14, legH, 0.14, 0xD9C3A8, sx * 0.22, legH / 2, sz * len * 0.38, g));
    const tail = new THREE.Group();
    tail.position.set(0, h + 0.8, len / 2);
    makeBox(0.07, 0.5, 0.07, bodyColor, 0, -0.25, 0.05, tail);
    g.add(tail);
    const phase = Math.random() * 6;
    anim.push((t) => {
        head.rotation.x = 0.3 + Math.sin(t * 0.8 + phase) * 0.35;   // grazing nods
        tail.rotation.z = Math.sin(t * 3 + phase) * 0.4;
    });
    return g;
}

/**
 * Builds one Rajasthani village strip, ready to place at a route stop.
 *
 * The group origin is on the road centre line (x = 0), ground level, so the
 * caller only sets `position.z` (and adds it to the scene). Buildings are laid
 * out along roughly 70 units of road.
 *
 * @param {string} [name] - Village name painted on the entrance board
 * @param {Object} [options]
 * @param {number} [options.side=1] - +1 village on the right of the road, -1 left
 * @returns {THREE.Group} userData: {isVillage, villageName, length, side, villagers, update(t, dt)}
 */
export function createVillageCluster(name = 'गाँव', { side = 1 } = {}) {
    const village = new THREE.Group();
    const anim = [];
    const face = -side * Math.PI / 2;           // local +Z faces the road
    const roadEdge = ROAD_HALF_WIDTH + SHOULDER_WIDTH;
    const xAt = (d) => side * (roadEdge + d);

    const place = (obj, d, z, rotY = face) => {
        obj.position.set(xAt(d), 0, z);
        obj.rotation.y = rotY;
        village.add(obj);
        return obj;
    };

    // Dusty forecourt strip
    const ground = new THREE.Mesh(roundedBox(30, 0.06, 74), lam(0xF3E0BC));
    ground.position.set(xAt(16), 0.03, 0);
    ground.receiveShadow = true;
    village.add(ground);

    // Front row of shops facing the road
    ['chai', 'kirana', 'paan', 'recharge', 'tyre'].forEach((kind, i) => {
        place(createStall(kind, anim), 7, -28 + i * 11);
    });
    place(createSabziCart(anim), 4.2, 29);

    // Dhaba corner: charpais with villagers sitting and chatting
    const charpaiVillagers = [];
    [-6, 4, 14].forEach((z, i) => {
        const sitter = createPedestrian(i % 2 ? 1 : 3);
        sitter.position.set(0, 0.45, 0);
        sitter.scale.setScalar(0.9);
        sitter.userData.stride = 0;
        sitter.userData.moving = 0;
        charpaiVillagers.push(sitter);
        place(createCharpai(sitter), 15, z - 18 + 8, Math.PI / 2);
    });

    // Mud houses with flat roofs (second row)
    const houseColors = [0xF0D5AE, 0xF5C9A8, 0xE8DDB8, 0xF2C7C0];
    [-26, -12, 4, 20].forEach((z, i) => {
        place(createMudHouse(4 + (i % 2), 3.6, 2.6 + (i % 3) * 0.3, houseColors[i]), 24, z);
    });

    // Temple and hand pump
    place(createTemple(anim), 17, -33, face);
    place(createHandPump(anim), 6, 20.5, face);

    // Animals near the road
    [['cow', 4.2, -18], ['cow', 5.0, 8], ['goat', 3.8, 12], ['goat', 4.6, 14], ['goat', 3.6, -2]].forEach(([kind, d, z]) => {
        place(createAnimal(kind, anim), d, z, Math.PI * (0.5 + Math.random() * 0.2) * (side > 0 ? 1 : -1));
    });

    // Villagers standing about: idle sway, a couple wave at the bus
    const villagers = [];
    [[8.5, -24, 0], [9, -13, 3], [9, -2, 1], [8.5, 9, 4], [12, 24, 5], [10, 31, 2]].forEach(([d, z, v], i) => {
        const p = createPedestrian(v);
        p.userData.moving = 0;
        p.userData.waver = i % 2 === 0;
        place(p, d, z, face + (Math.random() - 0.5) * 0.6);
        villagers.push(p);
    });

    // Entrance board with the village name, on two posts
    const board = labelBoard(name, '#FFF6EA', '#C2556E', 5.2, 1.9);
    board.position.set(xAt(2.4), 3.6, -37);
    board.rotation.y = face;
    village.add(board);
    [-1.8, 1.8].forEach(o => makeBox(0.18, 3.2, 0.18, 0xB98A6E, xAt(2.4), 1.6, -37 + o, village));

    // Bunting strung along the shop row, fluttering
    const flags = [];
    for (let i = 0; i < 18; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 3), new THREE.MeshLambertMaterial({ color: BUNTING[i % BUNTING.length] }));
        f.rotation.x = Math.PI;
        f.position.set(xAt(3.4), 3.7 - Math.sin((i / 17) * Math.PI) * 0.4, -34 + i * 4);
        f.userData.i = i;
        village.add(f);
        flags.push(f);
    }
    [-34, 0, 34].forEach(z => makeBox(0.14, 4.4, 0.14, 0xB98A6E, xAt(3.4), 2.2, z, village));
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 68), lam(0x8B6B4A));
    wire.position.set(xAt(3.4), 3.95, 0);
    village.add(wire);

    const clock = { t: 0 };
    const update = (t, dt) => {
        clock.t = t;
        anim.forEach(fn => fn(t, dt));
        flags.forEach(f => { f.rotation.z = Math.sin(t * 5 + f.userData.i * 0.7) * 0.25; });
        villagers.forEach(p => {
            const d = p.userData;
            d.waveBlend += ((d.waver ? 0.6 + Math.sin(t * 0.5 + d.idleOffset) * 0.5 : 0) - d.waveBlend) * Math.min(1, 4 * dt);
            poseFigure(p, t, 0, THREE.MathUtils.clamp(d.waveBlend, 0, 1));
        });
        charpaiVillagers.forEach(p => poseFigure(p, t, 0, 0));
    };
    registerAnimation(village, update);

    village.userData.isVillage = true;
    village.userData.villageName = name;
    village.userData.length = 74;
    village.userData.side = side;
    village.userData.villagers = villagers;
    village.userData.update = update;
    return village;
}
