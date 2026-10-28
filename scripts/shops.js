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
import { roundedBox } from './rounded.js';

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
    const colors = DHABA_VARIANTS[((variant % DHABA_VARIANTS.length) + DHABA_VARIANTS.length) % DHABA_VARIANTS.length];

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
