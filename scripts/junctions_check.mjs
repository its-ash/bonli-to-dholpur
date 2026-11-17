#!/usr/bin/env node
// Standalone checks for scripts/junctions.js (uses the stub THREE from smoke.mjs,
// so it works even when other modules are mid-edit). Run: node scripts/junctions_check.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const S = dirname(fileURLToPath(import.meta.url));
const smoke = readFileSync(join(S, 'smoke.mjs'), 'utf8');
const stub = smoke.match(/const THREE_STUB = `([\s\S]*?)`;\n/)[1];
const d = mkdtempSync(join(tmpdir(), 'junction-check-'));
writeFileSync(join(d, 'three-stub.mjs'), stub);
for (const f of ['constants.js', 'rounded.js', 'roadpath.js', 'junctions.js']) {
    writeFileSync(join(d, f), readFileSync(join(S, f), 'utf8')
        .replace(/from 'three'/g, "from './three-stub.mjs'")
        .replace(/from 'three\/addons\/[^']+'/g, "from './three-stub.mjs'"));
}
const load = (f) => import(pathToFileURL(join(d, f)).href);
const J = await load('junctions.js');
const R = await load('roadpath.js');
const C = await load('constants.js');
const T = await load('three-stub.mjs');

let failures = 0;
const check = (name, cond, detail = '') => {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`);
};

const before = R.STRAIGHT_ZONES.length;
J.registerJunctionZones();
J.registerJunctionZones();
check('junction zones registered once', R.STRAIGHT_ZONES.length - before === J.JUNCTION_DEFS.length,
    `${R.STRAIGHT_ZONES.length - before} zones`);

let worst = 0;
for (const def of J.JUNCTION_DEFS) {
    for (const dz of [0, 25, -25, 60]) worst = Math.max(worst, Math.abs(R.roadHeading(def.z + dz)));
}
check('road is straight at every junction (heading ~ 0)', worst < 0.001, `max ${worst.toExponential(2)}`);

const sig = J.JUNCTION_DEFS.find(j => j.signalized);
const seen = new Set();
for (let t = 0; t < 30; t += 0.5) seen.add(J.signalPhase(sig, 'highway', t));
check('signals cycle through red, amber and green', seen.has('red') && seen.has('amber') && seen.has('green'), [...seen].join(','));

let clash = false;
for (let t = 0; t < 60; t += 0.1) {
    if (J.signalPhase(sig, 'highway', t) !== 'red' && J.signalPhase(sig, 'cross', t) !== 'red') clash = true;
}
check('highway and cross traffic are never both released', !clash);

J.setSignalTime(0);
const probe = [J.signalStateAt(sig.stopLineZ + 30), J.signalStateAt(sig.stopLineZ - 5), J.signalStateAt(sig.stopLineZ + 500)];
check('signalStateAt: state on approach, null past the line and far away',
    ['red', 'amber', 'green'].includes(probe[0]) && probe[1] === null && probe[2] === null, probe.join(','));
const round = J.JUNCTION_DEFS.find(j => !j.signalized);
check('roundabouts have no signal', J.signalStateAt(round.stopLineZ + 30) === null);

const scene = new T.Scene();
const bus = new T.Group();
bus.position.set(-1.5, 0, C.PLAYER_START_Z);
bus.userData = { speed: 10 };
const jn = J.createJunctions({ scene, bus });
jn.update(0.016);
const builtNear = jn.list.filter(j => j.built).length;
check('only nearby junctions are built', builtNear >= 1 && builtNear < jn.list.length, `${builtNear}/${jn.list.length}`);

for (const j of jn.list) {
    bus.position.z = j.z + 20;
    jn.update(0.016);
    jn.update(0.5);
    jn.update(0.5);
}
check('every junction builds and animates', jn.list.every(j => j.built && j.group.children.length > 20));
check('getNearest finds the closest junction', jn.getNearest(sig.z + 3).id === sig.id);

const s2 = jn.list.find(j => j.signalized);
for (let t = 0; t < 30; t += 0.25) { J.setSignalTime(t); if (J.signalPhase(s2, 'highway') === 'red') break; }
bus.position.set(-1.5, 0, s2.stopLineZ + 11); jn.update(0.001);
bus.position.z = s2.stopLineZ + 8; jn.update(0.001);
bus.position.z = s2.stopLineZ + 3; jn.update(0.001);   // nose crosses the line
check('running a red light is counted', bus.userData.redLightRuns === 1 && jn.getViolations() === 1,
    `runs=${bus.userData.redLightRuns}`);

rmSync(d, { recursive: true, force: true });
console.log(failures === 0 ? 'ALL JUNCTION CHECKS PASSED' : `${failures} JUNCTION CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
