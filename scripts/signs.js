// =============================================
// DISTANCE BOARDS
// Yellow Indian road signs by the shoulder telling the driver how far the next
// town is: बौंली, सवाई माधोपुर and धौलपुर.
//
// Readability is the whole point of these boards, so the sign face is a
// high-resolution canvas (512x160) with a large Devanagari font rather than the
// chunky low-res textures used for scenery. The 3D board is ~2.6m tall, which
// keeps the text comfortably legible from the road.
// =============================================

import * as THREE from 'three';
import { DISTANCE_BOARDS, DISTANCE_BOARD_X } from './constants.js';

const TEXT_FONT = '"Noto Sans Devanagari", "Kohinoor Devanagari", "Nirmala UI", sans-serif';

/**
 * Draws one readable distance board.
 *
 * Layout (left to right): a black-on-yellow arrow, the town name in big
 * Devanagari, and the distance with a "कि.मी." unit underneath.
 *
 * @param {string} name - Town name
 * @param {number} km - Distance in kilometres
 * @returns {THREE.CanvasTexture}
 */
export function createDistanceBoardTexture(name, km) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    // --- Yellow sign face with a black frame ---
    ctx.fillStyle = '#F5C400';
    ctx.fillRect(0, 0, 512, 160);

    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, 512, 8);
    ctx.fillRect(0, 152, 512, 8);
    ctx.fillRect(0, 0, 8, 160);
    ctx.fillRect(504, 0, 8, 160);

    // --- Blocky arrow pointing forward ---
    ctx.fillStyle = '#141414';
    ctx.fillRect(28, 72, 46, 16);
    ctx.beginPath();
    ctx.moveTo(74, 52);
    ctx.lineTo(108, 80);
    ctx.lineTo(74, 108);
    ctx.closePath();
    ctx.fill();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // --- Town name: as large as fits, in solid black ---
    const nameLeft = 124;
    const nameMaxWidth = 512 - nameLeft - 112;

    let nameSize = 92;
    ctx.font = `bold ${nameSize}px ${TEXT_FONT}`;
    while (nameSize > 24 && ctx.measureText(name).width > nameMaxWidth) {
        nameSize -= 2;
        ctx.font = `bold ${nameSize}px ${TEXT_FONT}`;
    }

    ctx.fillStyle = '#141414';
    ctx.fillText(name, nameLeft, 66);

    // --- Distance, right aligned, with its unit under it ---
    ctx.textAlign = 'right';

    let distanceSize = 84;
    const distanceText = String(Math.round(km));
    ctx.font = `bold ${distanceSize}px ${TEXT_FONT}`;
    while (distanceSize > 30 && ctx.measureText(distanceText).width > 96) {
        distanceSize -= 2;
        ctx.font = `bold ${distanceSize}px ${TEXT_FONT}`;
    }
    ctx.fillText(distanceText, 494, 62);

    ctx.font = `bold 26px ${TEXT_FONT}`;
    ctx.fillText('कि.मी.', 494, 122);

    const texture = new THREE.CanvasTexture(canvas);
    // Linear filtering keeps the large Devanagari glyphs smooth and readable
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Builds a complete distance board: two posts, the yellow sign face, and a
 * dark backing plate so the board is solid from behind.
 *
 * The board faces +Z, i.e. towards an approaching bus (which drives towards
 * -Z), so the driver reads it head on.
 *
 * @param {{name: string, km: number, side?: number}} board
 * @returns {THREE.Group}
 */
export function createDistanceBoard({ name, km, side = -1 }) {
    const group = new THREE.Group();

    const signWidth = 5.2;
    const signHeight = 1.62;
    const postHeight = 2.4;

    // --- Posts ---
    const postMaterial = new THREE.MeshLambertMaterial({ color: 0xBFBFBF, flatShading: true });
    [-1, 1].forEach(end => {
        const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, postHeight, 0.16),
            postMaterial
        );
        post.position.set(end * (signWidth / 2 - 0.5), postHeight / 2, 0);
        post.castShadow = true;
        group.add(post);
    });

    // --- Sign face (readable texture) ---
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(signWidth, signHeight),
        new THREE.MeshBasicMaterial({
            map: createDistanceBoardTexture(name, km),
            side: THREE.FrontSide
        })
    );
    face.position.set(0, postHeight + signHeight / 2 - 0.35, 0.06);
    group.add(face);

    // --- Backing plate (so the board is not a floating sprite from behind) ---
    const back = new THREE.Mesh(
        new THREE.BoxGeometry(signWidth + 0.1, signHeight + 0.1, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x2F2F2F, flatShading: true })
    );
    back.position.set(0, postHeight + signHeight / 2 - 0.35, 0);
    back.castShadow = true;
    group.add(back);

    // Push the face a hair in front of the backing plate so it never z-fights
    face.position.z = 0.06;

    // --- A slim support bar under the sign ---
    const bar = new THREE.Mesh(
        new THREE.BoxGeometry(signWidth, 0.1, 0.12),
        postMaterial
    );
    bar.position.set(0, postHeight - 0.3, 0);
    group.add(bar);

    group.userData.isDistanceBoard = true;
    group.userData.townName = name;
    group.userData.km = km;
    group.userData.side = side;
    group.userData.footprint = signWidth;

    return group;
}

/**
 * Builds every configured distance board (one of each town), already placed on
 * its side of the road.
 *
 * @returns {Array<THREE.Group>}
 */
export function createDistanceBoards() {
    return DISTANCE_BOARDS.map(config => {
        const board = createDistanceBoard(config);
        const side = config.side || -1;

        board.position.set(side * DISTANCE_BOARD_X, 0, 0);
        return board;
    });
}

/**
 * Names of the towns on the boards, in order.
 * @returns {Array<string>}
 */
export function distanceBoardNames() {
    return DISTANCE_BOARDS.map(board => board.name);
}
