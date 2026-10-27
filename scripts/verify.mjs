#!/usr/bin/env node
// =============================================
// VERIFICATION SCRIPT
// Reads index.html, extracts module script, checks syntax,
// and asserts minimum system requirements.
// =============================================

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const INDEX_HTML = 'index.html';
const SCRIPTS_DIR = 'scripts';

// Expected minimum counts
const REQUIREMENTS = {
    keydownInput: 1,
    updateCamera: 1,
    aiCarFactory: 3,      // >=3 cars created
    pedestrians: 5,       // >=5 pedestrians
    placedTrees: 10,      // >=10 trees
    collisionFunction: 1,
    busCreation: 1,
    roadCreation: 1,
    treeCreation: 1,
    lightingSetup: 1,
    rendererSetup: 1,
};

function log(message, type = 'info') {
    const prefix = type === 'error' ? '❌' : type === 'pass' ? '✅' : type === 'warn' ? '⚠️' : '📋';
    console.log(`${prefix} ${message}`);
}

function extractModuleScript(htmlContent) {
    // Find the script type="module" tag
    const moduleScriptRegex = /<script type="module">([\s\S]*?)<\/script>/;
    const match = htmlContent.match(moduleScriptRegex);
    
    if (match) {
        return match[1].trim();
    }
    
    // Check for external module script
    const externalScriptRegex = /<script type="module" src="([^"]+)"><\/script>/;
    const extMatch = htmlContent.match(externalScriptRegex);
    if (extMatch) {
        const scriptPath = extMatch[1];
        try {
            return readFileSync(scriptPath, 'utf-8');
        } catch (e) {
            return null;
        }
    }
    
    return null;
}

function checkSyntax(scriptContent) {
    // Write to temp file and run node --check
    const tempDir = mkdtempSync(join(tmpdir(), 'verify-'));
    const tempFile = join(tempDir, 'temp.mjs');
    
    try {
        writeFileSync(tempFile, scriptContent);
        const result = spawnSync('node', ['--check', tempFile], { 
            encoding: 'utf-8',
            timeout: 10000
        });
        
        rmSync(tempDir, { recursive: true, force: true });
        
        if (result.status === 0) {
            return { pass: true, output: result.stdout };
        } else {
            return { pass: false, output: result.stderr || result.stdout };
        }
    } catch (e) {
        rmSync(tempDir, { recursive: true, force: true });
        return { pass: false, output: e.message };
    }
}

function countOccurrences(content, patterns) {
    const counts = {};
    for (const [key, pattern] of Object.entries(patterns)) {
        const regex = new RegExp(pattern, 'g');
        const matches = content.match(regex);
        counts[key] = matches ? matches.length : 0;
    }
    return counts;
}

function verifyRequirements(scriptContent, allScriptContents) {
    const results = {};
    
    // Combine all script contents for cross-file checks
    const allContent = Object.values(allScriptContents).join('\n');
    
    // Define patterns to search for (presence checks)
    const patterns = {
        keydownInput: /addEventListener\(['"]keydown['"]/,
        updateCamera: /updateCamera|createCameraController/,
        collisionFunction: /updateBusPhysics/,
        busCreation: /createBus/,
        roadCreation: /createRoad/,
        lightingSetup: /createLighting/,
        rendererSetup: /WebGLRenderer/,
        musicPlayback: /createMusicPlayer/,
        musicControls: /music-next|next\(\)/,
        endlessRoad: /createEndlessWorld/,
        roadSegments: /createRoadSegmentTexture/,
        dhabaRestaurants: /createDhaba/,
        petrolPumps: /createPetrolPump/,
        busStand: /createBusStand/,
        distanceBoards: /createDistanceBoard/,
        fourLanes: /LANE_LEFT_OUTER|LANES_FORWARD/,
        mobileSingleButton: /setHudMobileMode|isHudMobileLayout/,
        mobileCameraZoom: /zoomForViewport|CAMERA_MOBILE_ZOOM/,
        autopilot: /createAutopilot/,
        autoButton: /auto-button/,
        touchControls: /createTouchControls/,
    };
    
    log(`Checking presence of required systems:`);
    for (const [key, pattern] of Object.entries(patterns)) {
        const found = pattern.test(allContent);
        const status = found ? 'pass' : 'warn';
        log(`  ${key}: ${found ? 'FOUND' : 'MISSING'}`, status);
        results[key] = found;
    }
    
    // Check actual constant values from constants.js
    const constantsContent = allScriptContents['constants.js'] || '';
    
    // Extract TREE_COUNT_PER_SIDE
    const treeCountMatch = constantsContent.match(/TREE_COUNT_PER_SIDE\s*=\s*(\d+)/);
    const treeCountPerSide = treeCountMatch ? parseInt(treeCountMatch[1]) : 0;
    const totalTrees = treeCountPerSide * 2; // both sides
    log(`  placedTrees: ${totalTrees} trees (${treeCountPerSide} per side * 2) (required: 10)`, totalTrees >= 10 ? 'pass' : 'warn');
    results.placedTrees = totalTrees >= 10;
    
    // Extract SAME_DIRECTION_CAR_COUNT + ONCOMING_CAR_COUNT
    const sameDirMatch = constantsContent.match(/SAME_DIRECTION_CAR_COUNT\s*=\s*(\d+)/);
    const oncomingMatch = constantsContent.match(/ONCOMING_CAR_COUNT\s*=\s*(\d+)/);
    const sameDirCount = sameDirMatch ? parseInt(sameDirMatch[1]) : 0;
    const oncomingCount = oncomingMatch ? parseInt(oncomingMatch[1]) : 0;
    const totalCars = sameDirCount + oncomingCount;
    log(`  aiCarFactory: ${totalCars} cars (${sameDirCount} same-dir + ${oncomingCount} oncoming) (required: 3)`, totalCars >= 3 ? 'pass' : 'warn');
    results.aiCarFactory = totalCars >= 3;
    
    // Extract pedestrian count from makePedestrians default
    const pedContent = allScriptContents['pedestrians.js'] || '';
    const pedCountMatch = pedContent.match(/makePedestrians\s*\(\s*count\s*=\s*(\d+)/);
    const pedCount = pedCountMatch ? parseInt(pedCountMatch[1]) : 0;
    // Also check call site in main.js
    const mainContent = allScriptContents['main.js'] || '';
    const callMatch = mainContent.match(/makePedestrians\s*\(\s*(\d+)/);
    const actualPedCount = callMatch ? parseInt(callMatch[1]) : pedCount;
    log(`  pedestrians: ${actualPedCount} pedestrians (required: 5)`, actualPedCount >= 5 ? 'pass' : 'warn');
    results.pedestrians = actualPedCount >= 5;
    
    // Check that all required functions exist
    const functionChecks = {
        createTree: /export function createTree/,
        createRoadsideTree: /export function createRoadsideTree/,
        createCar: /export function createCar/,
        makeAICars: /export function makeAICars/,
        updateAICars: /export function updateAICars/,
        createPedestrian: /export function createPedestrian/,
        makePedestrians: /export function makePedestrians/,
        updatePedestrians: /export function updatePedestrians/,
        createBus: /export function createBus/,
        updateBusPhysics: /export function updateBusPhysics/,
        createCameraController: /export function createCameraController/,
        zoomForViewport: /export function zoomForViewport/,
        setHudMobileMode: /export function setHudMobileMode/,
        isHudMobileLayout: /export function isHudMobileLayout/,
        followGroundAndSky: /export function followGroundAndSky/,
        initInput: /export function initInput/,
        getKeys: /export function getKeys/,
        createHUD: /export function createHUD/,
        updateHUD: /export function updateHUD/,
        createSkyDome: /export function createSkyDome/,
        createLighting: /export function createLighting/,
        createGround: /export function createGround/,
        createEndlessWorld: /export function createEndlessWorld/,
        createRoadSegmentTexture: /export function createRoadSegmentTexture/,
        createMusicPlayer: /export function createMusicPlayer/,
        createMusicUI: /export function createMusicUI/,
        createDhaba: /export function createDhaba/,
        createPetrolPump: /export function createPetrolPump/,
        createBusStand: /export function createBusStand/,
        createDistanceBoard: /export function createDistanceBoard/,
        createJourney: /export function createJourney/,
        createAutopilot: /export function createAutopilot/,
        createTouchControls: /export function createTouchControls/,
        isTouchDevice: /export function isTouchDevice/,
        setKey: /export function setKey/,
        setSteer: /export function setSteer/,
        createBusSim: /export function createBusSim/,
    };
    
    log(`\nChecking exported functions:`);
    for (const [funcName, pattern] of Object.entries(functionChecks)) {
        const found = pattern.test(allContent);
        const status = found ? 'pass' : 'warn';
        log(`  ${funcName}: ${found ? 'EXPORTED' : 'MISSING'}`, status);
        results[funcName] = found;
    }
    
    return results;
}

function main() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   Bus Driving Game - Verification       ║');
    console.log('╚══════════════════════════════════════════╝\n');
    
    // 1. Read index.html
    log('Reading index.html...');
    let htmlContent;
    try {
        htmlContent = readFileSync(INDEX_HTML, 'utf-8');
    } catch (e) {
        log(`Failed to read ${INDEX_HTML}: ${e.message}`, 'error');
        process.exit(1);
    }
    log('index.html read successfully');
    
    // 2. Read all script files
    log('Reading script modules...');
    const scriptFiles = [
        'constants.js',
        'utils.js',
        'environment.js',
        'shops.js',
        'petrolpump.js',
        'busstand.js',
        'signs.js',
        'endless.js',
        'vehicles.js',
        'collision.js',
        'input.js',
        'camera.js',
        'physics.js',
        'journey.js',
        'autopilot.js',
        'bussim.js',
        'touch.js',
        'pedestrians.js',
        'hud.js',
        'music.js',
        'main.js'
    ];
    
    const allScriptContents = {};
    for (const file of scriptFiles) {
        try {
            const content = readFileSync(join(SCRIPTS_DIR, file), 'utf-8');
            allScriptContents[file] = content;
            log(`  ${file}: ${content.length} chars`);
        } catch (e) {
            log(`Failed to read ${file}: ${e.message}`, 'error');
            process.exit(1);
        }
    }
    
    // 3. Check syntax of main entry point
    log('\nChecking syntax (node --check)...');
    const mainScript = allScriptContents['main.js'];
    const syntaxResult = checkSyntax(mainScript);
    
    if (syntaxResult.pass) {
        log('Syntax check PASSED', 'pass');
    } else {
        log('Syntax check FAILED', 'error');
        log(syntaxResult.output, 'error');
        process.exit(1);
    }
    
    // 4. Verify requirements
    log('\nVerifying system requirements...');
    const results = verifyRequirements(mainScript, allScriptContents);
    
    // 5. Summary
    console.log('\n══════════════════════════════════════════');
    const allPassed = Object.values(results).every(r => r === true);
    
    if (allPassed) {
        log('ALL CHECKS PASSED ✅', 'pass');
        console.log('══════════════════════════════════════════');
        process.exit(0);
    } else {
        log('SOME CHECKS FAILED ❌', 'error');
        console.log('══════════════════════════════════════════');
        process.exit(1);
    }
}

main();