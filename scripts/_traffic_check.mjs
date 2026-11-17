import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const S = dirname(fileURLToPath(import.meta.url));
const smoke = readFileSync(join(S, 'smoke.mjs'), 'utf-8');
const m = smoke.match(/const THREE_STUB = `([\s\S]*?)\n`;/);
const stub = /class BufferGeometry\b/.test(m[1])
    ? m[1]
    : m[1] + '\nexport class BufferGeometry { constructor(){ this.parameters = {}; } }\n';
const dir = mkdtempSync(join(tmpdir(), 'traffic-'));
writeFileSync(join(dir, 'three-stub.mjs'), stub);
for (const f of ['constants.js', 'rounded.js', 'utils.js', 'roadpath.js', 'collision.js', 'traffic_models.js', 'vehicles.js']) {
    writeFileSync(join(dir, f), readFileSync(join(S, f), 'utf-8')
        .replace(/from 'three'/g, "from './three-stub.mjs'")
        .replace(/from 'three\/addons\/[^']+'/g, "from './three-stub.mjs'"));
}
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : noop)), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const imp = f => import(pathToFileURL(join(dir, f)).href);
const C = await imp('constants.js');
const V = await imp('vehicles.js');
const R = await imp('roadpath.js');
const M = await imp('traffic_models.js');
const THREE = await imp('three-stub.mjs');

let fails = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) fails++; };

const cars = V.makeAICars();
const kinds = {};
cars.forEach(c => { kinds[c.userData.kind] = (kinds[c.userData.kind] || 0) + 1; });
console.log(kinds);
check('all six types built', ['car', 'auto', 'bike', 'bicycle', 'truck', 'tractor'].every(k => kinds[k] > 0));
check('every vehicle has box sizes', cars.every(c => c.userData.length > 1 && c.userData.width > 0.4));
check('all car styles build', M.CAR_STYLES.every((s, i) => { const g = V.createCar('#FFFFFF', i, i % 2 === 0); return g.userData.length > 2; }));

const bus = new THREE.Group();
bus.position.set(R.roadCenterX(500) + C.LANE_LEFT, 0, 500);
bus.userData = { speed: 15, width: 2.5, length: 10 };
let bad = 0, maxLat = 0;
const per = {};
for (let f = 0; f < 60 * 120; f++) {
    bus.position.z -= 15 / 60;
    bus.position.x = R.roadCenterX(bus.position.z) + C.LANE_LEFT;
    V.updateAICars(cars, 1 / 60, bus);
    for (const c of cars) {
        const p = c.position;
        if (![p.x, p.y, p.z, c.rotation.y].every(Number.isFinite)) bad++;
        const lat = Math.abs(R.lateralOffset(p.x, p.z));
        maxLat = Math.max(maxLat, lat);
        per[c.userData.kind] = Math.max(per[c.userData.kind] || 0, lat);
    }
}
console.log('max lateral per kind', per);
check('no NaN', bad === 0, `bad=${bad}`);
check('within road bounds', maxLat < C.ROAD_HALF_WIDTH, `maxLat=${maxLat.toFixed(2)} half=${C.ROAD_HALF_WIDTH}`);
check('traffic stays near bus', cars.every(c => Math.abs(c.position.z - bus.position.z) < 500));
check('wheels spun', cars.every(c => c.userData.wheels.some(w => w.rotation.x !== 0)));
const Col = await imp('collision.js');
for (const k of ['car', 'auto', 'bike', 'bicycle', 'truck', 'tractor']) {
    const v = cars.find(c => c.userData.kind === k);
    const b = new THREE.Group();
    b.userData = { speed: 15, width: 2.5, length: 10 };
    v.position.set(0.5, 0, -4);
    let ok = true;
    for (let i = 0; i < 30; i++) {
        Col.resolveVehicleImpact(b, v, { react: false });
        if (![b.position.x, b.position.z, v.position.x, v.position.z].every(Number.isFinite)) ok = false;
    }
    const d = Math.hypot(v.position.x - b.position.x, v.position.z - b.position.z);
    check('bus collision ' + k, ok && d > 2, `d=${d.toFixed(1)} bus=${b.position.x.toFixed(2)},${b.position.z.toFixed(2)}`);
}
process.exit(fails ? 1 : 0);
