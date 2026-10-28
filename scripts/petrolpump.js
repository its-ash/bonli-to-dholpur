// =============================================
// PETROL PUMPS - Indian highway filling stations
// Each pump has a branded canopy with a readable signboard on both faces, a
// lit pump island with two dispensers, cashier kiosk and an air/water stand.
// They are recycled along the endless road by scripts/endless.js.
// =============================================

import * as THREE from 'three';
import { roundedBox } from './rounded.js';

const SIGN_FONT = '"Noto Sans Devanagari", "Nirmala UI", sans-serif';

// Brand palettes, loosely inspired by Indian fuel retailers
const PUMP_VARIANTS = [
    {
        name: 'पेट्रोल पंप',
        canopy: 0xF5C400,      // yellow
        trim: 0x1B4A8C,        // blue
        board: '#124E8C',
        ink: '#FFFFFF',
        accent: '#FFD700'
    },
    {
        name: 'इंडियन ऑयल',
        canopy: 0x1B5E20,      // green
        trim: 0xF5C400,
        board: '#1B5E20',
        ink: '#FFFFFF',
        accent: '#FFD700'
    },
    {
        name: 'भारत पेट्रोलियम',
        canopy: 0x1565C0,      // blue
        trim: 0xFFFFFF,
        board: '#0D3B66',
        ink: '#FFD700',
        accent: '#FFFFFF'
    }
];

/**
 * Draws a pump signboard: the brand name big enough to read from the road.
 *
 * @param {string} name - Station name in Devanagari
 * @param {string} board - Board colour
 * @param {string} ink - Text colour
 * @param {string} accent - Accent colour for the bottom stripe
 * @returns {THREE.CanvasTexture}
 */
export function createPetrolPumpSignTexture(name, board, ink, accent) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = board;
    ctx.fillRect(0, 0, 512, 128);

    // Accent stripes top and bottom
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillRect(0, 118, 512, 10);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;

    // Shrink only until the name fits comfortably
    const maxWidth = 476;
    let size = 72;
    ctx.font = `bold ${size}px ${SIGN_FONT}`;
    while (size > 20 && ctx.measureText(name).width > maxWidth) {
        size -= 2;
        ctx.font = `bold ${size}px ${SIGN_FONT}`;
    }

    ctx.font = `bold ${size}px ${SIGN_FONT}`;
    ctx.fillText(name, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * A fuel dispenser: body, display panel and a hanging hose arm.
 * @param {number} trim - Accent colour
 * @returns {THREE.Group}
 */
function createDispenser(trim) {
    const dispenser = new THREE.Group();

    const body = new THREE.Mesh(
        roundedBox(0.7, 1.7, 0.5),
        new THREE.MeshLambertMaterial({ color: 0xE8E8E8 })
    );
    body.position.y = 0.95;
    body.castShadow = true;
    dispenser.add(body);

    // Branded side panel
    const panel = new THREE.Mesh(
        roundedBox(0.74, 0.45, 0.54),
        new THREE.MeshLambertMaterial({ color: trim })
    );
    panel.position.y = 1.55;
    dispenser.add(panel);

    // Display window (lit, so it stands out day and night)
    const display = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.28),
        new THREE.MeshBasicMaterial({ color: 0x0B0B0B })
    );
    display.position.set(0, 1.15, 0.26);
    dispenser.add(display);

    // Base plinth
    const base = new THREE.Mesh(
        roundedBox(1.0, 0.2, 0.8),
        new THREE.MeshLambertMaterial({ color: 0x9AA0A6 })
    );
    base.position.y = 0.1;
    dispenser.add(base);

    // Hose arm reaching over the car
    const arm = new THREE.Mesh(
        roundedBox(0.08, 0.08, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x2F2F2F })
    );
    arm.position.set(0, 1.72, 0.55);
    dispenser.add(arm);

    dispenser.userData.isDispenser = true;
    return dispenser;
}

/**
 * Creates one petrol pump (filling station).
 *
 * `side` decides which side of the road it stands on and which way the pumps
 * face, so the canopy always opens towards the carriageway.
 *
 * @param {number} side - -1 (left of the road) or +1 (right)
 * @param {number} variant - Index into PUMP_VARIANTS
 * @returns {THREE.Group}
 */
export function createPetrolPump(side = 1, variant = 0) {
    const pump = new THREE.Group();
    const colors = PUMP_VARIANTS[((variant % PUMP_VARIANTS.length) + PUMP_VARIANTS.length) % PUMP_VARIANTS.length];

    const forecourtZ = 26;   // forecourt length along the road
    const forecourtX = 13;   // how far it reaches away from the road
    const canopyHeight = 5.2;

    // Pumps sit back from the asphalt, with the forecourt opening towards it
    const front = -side;

    // --- Concrete forecourt ---
    const forecourt = new THREE.Mesh(
        roundedBox(forecourtX, 0.2, forecourtZ),
        new THREE.MeshLambertMaterial({ color: 0xC2C2C2 })
    );
    forecourt.position.set(0, 0.1, 0);
    forecourt.receiveShadow = true;
    pump.add(forecourt);

    // Yellow-and-black edge marking so the entrance reads clearly
    const edge = new THREE.Mesh(
        roundedBox(0.3, 0.24, forecourtZ),
        new THREE.MeshLambertMaterial({ color: 0xF5C400 })
    );
    edge.position.set(front * (forecourtX / 2 - 0.15), 0.12, 0);
    pump.add(edge);

    // --- Canopy over the forecourt ---
    const canopy = new THREE.Mesh(
        roundedBox(forecourtX - 1, 0.5, forecourtZ - 2),
        new THREE.MeshLambertMaterial({ color: colors.canopy })
    );
    canopy.position.y = canopyHeight;
    canopy.castShadow = true;
    pump.add(canopy);

    // Trim band under the canopy edge
    const band = new THREE.Mesh(
        roundedBox(forecourtX - 0.6, 0.45, forecourtZ - 1.6),
        new THREE.MeshLambertMaterial({ color: colors.trim })
    );
    band.position.y = canopyHeight - 0.4;
    pump.add(band);

    // Canopy columns
    [-1, 1].forEach(endX => {
        [-1, 1].forEach(endZ => {
            const column = new THREE.Mesh(
                roundedBox(0.4, canopyHeight, 0.4),
                new THREE.MeshLambertMaterial({ color: 0xDEDEDE })
            );
            column.position.set(
                endX * (forecourtX / 2 - 1.4),
                canopyHeight / 2,
                endZ * (forecourtZ / 2 - 2.2)
            );
            column.castShadow = true;
            pump.add(column);
        });
    });

    // --- Pump island with two dispensers ---
    const island = new THREE.Mesh(
        roundedBox(1.6, 0.3, 7),
        new THREE.MeshLambertMaterial({ color: 0xB0B0B0 })
    );
    island.position.set(front * 2.2, 0.25, 0);
    island.receiveShadow = true;
    pump.add(island);

    const dispensers = [];
    [-2.1, 2.1].forEach(offsetZ => {
        const dispenser = createDispenser(colors.trim);
        dispenser.position.set(front * 2.2, 0.4, offsetZ);
        dispenser.rotation.y = front * Math.PI / 2;
        pump.add(dispenser);
        dispensers.push(dispenser);
    });

    // --- Readable signboard on BOTH faces of the canopy ---
    const signTexture = createPetrolPumpSignTexture(colors.name, colors.board, colors.ink, colors.accent);
    const signFront = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 2.0),
        new THREE.MeshBasicMaterial({ map: signTexture })
    );
    signFront.position.set(0, canopyHeight + 1.2, front * (forecourtZ / 2 - 0.4));
    signFront.rotation.y = front > 0 ? 0 : Math.PI;
    pump.add(signFront);

    // The back face gets its own plane so the sign is never mirrored
    const signBack = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 2.0),
        new THREE.MeshBasicMaterial({ map: signTexture })
    );
    signBack.position.set(0, canopyHeight + 1.2, -front * (forecourtZ / 2 - 0.4));
    signBack.rotation.y = front > 0 ? Math.PI : 0;
    pump.add(signBack);

    // Sign frame, so it is solid from the side
    const signFrame = new THREE.Mesh(
        roundedBox(8.2, 2.2, 0.18),
        new THREE.MeshLambertMaterial({ color: colors.trim })
    );
    signFrame.position.set(0, canopyHeight + 1.2, 0);
    pump.add(signFrame);

    // --- Cashier kiosk at the back ---
    const kioskHeight = 2.9;
    const kiosk = new THREE.Mesh(
        roundedBox(3, kioskHeight, 4),
        new THREE.MeshLambertMaterial({ color: 0xF0F0F0 })
    );
    kiosk.position.set(-front * (forecourtX / 2 - 2.2), kioskHeight / 2, 0);
    kiosk.castShadow = true;
    kiosk.receiveShadow = true;
    pump.add(kiosk);

    const kioskRoof = new THREE.Mesh(
        roundedBox(3.5, 0.3, 4.5),
        new THREE.MeshLambertMaterial({ color: colors.canopy })
    );
    kioskRoof.position.set(-front * (forecourtX / 2 - 2.2), kioskHeight + 0.15, 0);
    pump.add(kioskRoof);

    // --- Air / water stand beside the island ---
    const airStand = new THREE.Group();
    const airBody = new THREE.Mesh(
        roundedBox(0.5, 1.1, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x2E7D32 })
    );
    airBody.position.y = 0.55;
    airBody.castShadow = true;
    airStand.add(airBody);
    airStand.position.set(front * (forecourtX / 2 - 2.5), 0.2, forecourtZ / 2 - 5);
    pump.add(airStand);

    pump.userData.isPetrolPump = true;
    pump.userData.stationName = colors.name;
    pump.userData.dispensers = dispensers;
    pump.userData.side = side;
    pump.userData.length = forecourtZ;
    pump.userData.width = forecourtX;

    return pump;
}

/**
 * Names of the configured pump brands.
 * @returns {Array<string>}
 */
export function petrolPumpNames() {
    return PUMP_VARIANTS.map(variant => variant.name);
}
