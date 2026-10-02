/* ================================================================
   LANE HOPPER — modern Frogger remake
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), lives: $('lives'), level: $('level'),
        time: $('time'), best: $('best'),
        hsScore: $('hs-score'), hsLevel: $('hs-level'),
        finalScore: $('final-score'),
        levelTitle: $('level-title'), levelTag: $('level-tag'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'),
        oLevel: $('overlay-level'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    // 15 cols x 14 rows · 40 px tiles → 600x560
    const TILE = 40;
    const COLS = 15;
    const ROWS = 14;

    // Layout (top → bottom)
    // Row 0:  goals (5 pads at cols 1, 4, 7, 10, 13)
    // Row 1:  river bank (water decor)
    // Row 2-6: river lanes
    // Row 7:  median (grass)
    // Row 8-12: road lanes
    // Row 13: start safe (grass + sidewalk)
    const ROW_GOAL = 0;
    const ROW_GOAL_BANK = 1;
    const ROW_RIVER_TOP = 2, ROW_RIVER_BOTTOM = 6;
    const ROW_MEDIAN = 7;
    const ROW_ROAD_TOP = 8, ROW_ROAD_BOTTOM = 12;
    const ROW_START = 13;
    const FROG_W = 24;

    const COLORS = {
        bg: '#050208',
        grass: '#1f5e3c',
        grassDark: '#15422a',
        road: '#1a1a22',
        roadLine: '#ffd06b',
        water: '#0a3a5e',
        waterRipple: '#1a5a8e',
        log: '#9b6a2e',
        logDark: '#5a3d1a',
        turtle: '#36e3a4',
        turtleShell: '#1d9d6e',
        frog: '#36e3a4',
        frogDark: '#1d9d6e',
        car: '#ff2e63',
        car2: '#5fd0ff',
        truck: '#ffd06b',
        truck2: '#ff66cc',
        pad: '#3a8c5e',
        padFrog: '#36e3a4'
    };

    // Lanes (each is on a specific row, with a direction (-1/+1) and a list of vehicles/logs)
    const state = {
        running: false, paused: false, gameover: false,
        score: 0, lives: 3, level: 1, time: 30,
        bestScore: 0, bestLevel: 0,
        frog: { col: 7, row: ROW_START, x: 0, y: 0, jumpT: 0, fromX: 0, fromY: 0, dir: 'up', bestRow: ROW_START },
        lanes: [],
        goals: [false, false, false, false, false],
        animTime: 0,
        deadT: 0,
        deadReason: '',
        winT: 0
    };

    const KEY = 'osg.lane-hopper.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) { const o = JSON.parse(r); state.bestScore = o.score || 0; state.bestLevel = o.level || 0; }
        } catch {}
    }
    function saveHS() { try { localStorage.setItem(KEY, JSON.stringify({ score: state.bestScore, level: state.bestLevel })); } catch {} }
    function bump() {
        let d = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; d = true; }
        if (state.level > state.bestLevel) { state.bestLevel = state.level; d = true; }
        if (d) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsLevel.textContent = state.bestLevel;
    }

    let audio = null;
    function blip(f, dur = 0.05, type = 'square', vol = 0.05) {
        try {
            if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') audio.resume();
            const o = audio.createOscillator();
            const g = audio.createGain();
            o.type = type; o.frequency.setValueAtTime(f, audio.currentTime);
            g.gain.setValueAtTime(vol, audio.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
            o.connect(g).connect(audio.destination);
            o.start(); o.stop(audio.currentTime + dur);
        } catch {}
    }

    // ---------- Setup ----------
    function buildLanes() {
        state.lanes = [];
        const lvl = state.level;
        const speedMul = 1 + (lvl - 1) * 0.15;

        // Road lanes (rows 8-12), alternating direction
        const roadCfg = [
            { row: 8,  dir:  1, kind: 'truck',  count: 2, gap: 280, sp: 70  * speedMul, w: 90 },
            { row: 9,  dir: -1, kind: 'car',    count: 3, gap: 200, sp: 110 * speedMul, w: 50 },
            { row: 10, dir:  1, kind: 'car2',   count: 3, gap: 220, sp: 130 * speedMul, w: 50 },
            { row: 11, dir: -1, kind: 'truck2', count: 2, gap: 320, sp: 80  * speedMul, w: 100 },
            { row: 12, dir:  1, kind: 'car',    count: 4, gap: 160, sp: 90  * speedMul, w: 50 }
        ];
        for (const c of roadCfg) {
            const items = [];
            for (let i = 0; i < c.count; i++) {
                items.push({ x: i * c.gap, w: c.w, h: TILE - 8, kind: c.kind });
            }
            state.lanes.push({ ...c, items, type: 'road' });
        }

        // River lanes (rows 2-6)
        const riverCfg = [
            { row: 2, dir:  1, kind: 'log',    count: 3, gap: 200, sp: 50  * speedMul, w: 130 },
            { row: 3, dir: -1, kind: 'turtle', count: 3, gap: 160, sp: 70  * speedMul, w: 110 },
            { row: 4, dir:  1, kind: 'log',    count: 2, gap: 260, sp: 80  * speedMul, w: 170 },
            { row: 5, dir: -1, kind: 'turtle', count: 4, gap: 130, sp: 60  * speedMul, w: 80  },
            { row: 6, dir:  1, kind: 'log',    count: 3, gap: 220, sp: 65  * speedMul, w: 140 }
        ];
        for (const c of riverCfg) {
            const items = [];
            for (let i = 0; i < c.count; i++) {
                const item = { x: i * c.gap + (c.dir > 0 ? 0 : 100), w: c.w, h: TILE - 8, kind: c.kind };
                if (c.kind === 'turtle') item.diveT = -2 - Math.random() * 4; // dive cycle offset
                items.push(item);
            }
            state.lanes.push({ ...c, items, type: 'river' });
        }
    }

    function updateFrogPx() {
        state.frog.x = state.frog.col * TILE + TILE / 2;
        state.frog.y = state.frog.row * TILE + TILE / 2;
    }

    let levelOverlayTimer = null;
    let nextLevelTimer = null;
    function newLevel() {
        state.goals = [false, false, false, false, false];
        state.frog = { col: 7, row: ROW_START, x: 0, y: 0, jumpT: 0, fromX: 0, fromY: 0, dir: 'up', bestRow: ROW_START };
        updateFrogPx();
        state.time = Math.max(20, 32 - state.level);
        buildLanes();
        ui.levelTitle.textContent = `LEVEL ${state.level}`;
        ui.levelTag.textContent = state.level === 1 ? 'Hop to it...' : 'They\'re going faster now.';
        ui.oLevel.classList.remove('hidden');
        if (levelOverlayTimer) clearTimeout(levelOverlayTimer);
        levelOverlayTimer = setTimeout(() => { ui.oLevel.classList.add('hidden'); levelOverlayTimer = null; }, 1300);
        updateHud();
    }

    function newGame() {
        state.score = 0;
        state.lives = 3;
        state.level = 1;
        state.gameover = false;
        newLevel();
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.level.textContent = state.level;
        ui.time.textContent = Math.ceil(state.time);
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;

        if (state.deadT > 0) {
            state.deadT -= dt;
            if (state.deadT <= 0) onDeathDone();
            return;
        }

        if (state.winT > 0) {
            state.winT -= dt;
            if (state.winT <= 0) {
                resetFrogToStart();
                state.time = Math.max(20, 32 - state.level);
            }
            return;
        }

        // Time
        state.time -= dt;
        if (state.time <= 0) {
            die('Out of time');
            return;
        }
        updateHud();

        // Frog jump animation
        if (state.frog.jumpT > 0) {
            state.frog.jumpT -= dt;
            const k = 1 - Math.max(0, state.frog.jumpT) / 0.12;
            const eased = k * (2 - k);
            const tx = state.frog.col * TILE + TILE / 2;
            const ty = state.frog.row * TILE + TILE / 2;
            state.frog.x = state.frog.fromX + (tx - state.frog.fromX) * eased;
            state.frog.y = state.frog.fromY + (ty - state.frog.fromY) * eased;
            if (state.frog.jumpT <= 0) {
                state.frog.x = tx;
                state.frog.y = ty;
            }
        } else {
            updateFrogPx();
        }

        // Lanes update
        for (const lane of state.lanes) {
            for (const item of lane.items) {
                item.x += lane.dir * lane.sp * dt;
                // Wrap around
                const totalW = COLS * TILE;
                if (lane.dir > 0 && item.x > totalW + 50) item.x -= totalW + 200;
                if (lane.dir < 0 && item.x + item.w < -50) item.x += totalW + 200;
                if (item.kind === 'turtle') {
                    item.diveT += dt;
                    if (item.diveT > 8) item.diveT = -3 - Math.random() * 2;
                }
            }
        }

        // Frog vs lane logic — only check if not mid-jump
        if (state.frog.jumpT <= 0) {
            // Find lane at frog's row
            const lane = state.lanes.find(l => l.row === state.frog.row);
            if (lane) {
                if (lane.type === 'road') {
                    // Hit by car? AABB between frog rect and item rect
                    for (const item of lane.items) {
                        if (state.frog.x + FROG_W / 2 > item.x + 2 &&
                            state.frog.x - FROG_W / 2 < item.x + item.w - 2) {
                            die('Splat');
                            return;
                        }
                    }
                } else if (lane.type === 'river') {
                    // Must be on a log/non-diving turtle
                    let onItem = null;
                    for (const item of lane.items) {
                        if (item.kind === 'turtle' && isTurtleSubmerged(item)) continue;
                        if (state.frog.x >= item.x + 4 && state.frog.x <= item.x + item.w - 4) {
                            onItem = item;
                            break;
                        }
                    }
                    if (!onItem) {
                        die('Drowned');
                        return;
                    } else {
                        // Drift with the platform
                        state.frog.x += lane.dir * lane.sp * dt;
                        // Compute back to col
                        const newCol = (state.frog.x - TILE / 2) / TILE;
                        state.frog.col = Math.round(newCol);
                        if (state.frog.x < 0 || state.frog.x > W) {
                            die('Carried off');
                            return;
                        }
                    }
                }
            } else if (state.frog.row === ROW_GOAL) {
                // Did the frog land on a goal pad?
                const pads = [1, 4, 7, 10, 13];
                const padIdx = pads.indexOf(state.frog.col);
                if (padIdx === -1 || state.goals[padIdx]) {
                    die('Missed pad');
                    return;
                }
                state.goals[padIdx] = true;
                state.score += 50 + Math.ceil(state.time) * 10;
                state.winT = 0.6;
                blip(660, 0.1); blip(880, 0.1); blip(1100, 0.15);
                bump();
                if (state.goals.every(g => g)) {
                    state.score += 1000;
                    state.level++;
                    bump();
                    if (nextLevelTimer) clearTimeout(nextLevelTimer);
                    nextLevelTimer = setTimeout(() => { nextLevelTimer = null; newLevel(); }, 1500);
                    state.winT = 1.5;
                }
                return;
            }
            // Row 1 (ROW_GOAL_BANK) and row 7 (ROW_MEDIAN) are safe pass-through tiles.
        }
    }

    function isTurtleSubmerged(item) {
        // Submerged for 2s every 8s
        return item.diveT > 5 && item.diveT < 7;
    }

    function tryJump(dx, dy) {
        if (state.frog.jumpT > 0 || state.deadT > 0 || state.winT > 0) return;
        const newCol = state.frog.col + dx;
        const newRow = state.frog.row + dy;
        if (newCol < 0 || newCol >= COLS) return;
        if (newRow < 0 || newRow > ROW_START) return;
        state.frog.fromX = state.frog.x;
        state.frog.fromY = state.frog.y;
        state.frog.col = newCol;
        state.frog.row = newRow;
        state.frog.jumpT = 0.12;
        if (dx > 0) state.frog.dir = 'right';
        else if (dx < 0) state.frog.dir = 'left';
        else if (dy < 0) state.frog.dir = 'up';
        else state.frog.dir = 'down';
        if (newRow < state.frog.bestRow) { state.frog.bestRow = newRow; state.score += 10; }
        updateHud();
        blip(440 + Math.random() * 80, 0.05, 'square');
    }

    function die(reason) {
        if (state.deadT > 0) return;
        state.deadT = 0.9;
        state.deadReason = reason;
        for (let i = 0; i < 4; i++) setTimeout(() => blip(220 - i * 25, 0.12, 'sawtooth'), i * 70);
    }

    function onDeathDone() {
        state.lives--;
        bump();
        if (state.lives <= 0) {
            state.gameover = true;
            state.running = false;
            ui.finalScore.textContent = state.score;
            setTimeout(() => ui.oOver.classList.remove('hidden'), 300);
        } else {
            resetFrogToStart();
            state.time = Math.max(20, 32 - state.level);
        }
        updateHud();
    }

    function resetFrogToStart() {
        state.frog = { col: 7, row: ROW_START, x: 0, y: 0, jumpT: 0, fromX: 0, fromY: 0, dir: 'up', bestRow: ROW_START };
        updateFrogPx();
        state.winT = 0;
    }

    // ---------- Render ----------
    let bgCanvas = null;
    function buildBackground() {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = COLORS.bg; g.fillRect(0, 0, W, H);

        // Goal row: dark water + hedge
        let gr = g.createLinearGradient(0, 0, 0, TILE);
        gr.addColorStop(0, '#0e3d28'); gr.addColorStop(1, '#0a2a1b');
        g.fillStyle = gr; g.fillRect(0, 0, W, TILE);
        // hedge bumps between pads
        for (let col = 0; col < COLS; col++) {
            if ([1, 4, 7, 10, 13].includes(col)) continue;
            g.fillStyle = '#1d6b44';
            g.beginPath(); g.arc(col * TILE + TILE / 2, TILE / 2 + 2, 15, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#2a8a58';
            g.beginPath(); g.arc(col * TILE + TILE / 2 - 4, TILE / 2 - 3, 6, 0, Math.PI * 2); g.fill();
        }

        // Grass strips (bank, median, start)
        const grass = (row) => {
            const y = row * TILE;
            const gg = g.createLinearGradient(0, y, 0, y + TILE);
            gg.addColorStop(0, '#2a7a4d'); gg.addColorStop(1, '#1b5a37');
            g.fillStyle = gg; g.fillRect(0, y, W, TILE);
            g.fillStyle = 'rgba(255,255,255,0.06)';
            for (let c = 0; c < COLS * 2; c++) {
                const x = c * 20 + ((c * 7 + row * 5) % 9);
                g.fillRect(x, y + 6 + ((c * 13) % 24), 2, 7);
            }
        };
        grass(ROW_GOAL_BANK); grass(ROW_MEDIAN); grass(ROW_START);

        // Road
        for (let r = ROW_ROAD_TOP; r <= ROW_ROAD_BOTTOM; r++) {
            const y = r * TILE;
            const rg = g.createLinearGradient(0, y, 0, y + TILE);
            rg.addColorStop(0, '#22222c'); rg.addColorStop(1, '#17171f');
            g.fillStyle = rg; g.fillRect(0, y, W, TILE);
        }
        g.fillStyle = 'rgba(255,255,255,0.025)';
        for (let i = 0; i < 180; i++) g.fillRect((i * 97) % W, ROW_ROAD_TOP * TILE + ((i * 53) % (5 * TILE)), 2, 2);
        g.fillStyle = COLORS.roadLine;
        for (let r = ROW_ROAD_TOP; r < ROW_ROAD_BOTTOM; r++) {
            const y = (r + 1) * TILE - 1;
            for (let x = 0; x < W; x += 30) g.fillRect(x, y, 16, 2);
        }
        // curbs
        g.fillStyle = '#c9c9d6';
        g.fillRect(0, ROW_ROAD_TOP * TILE - 2, W, 2);
        g.fillRect(0, (ROW_ROAD_BOTTOM + 1) * TILE, W, 2);
        return c;
    }

    function render() {
        if (!bgCanvas) bgCanvas = buildBackground();
        ctx.drawImage(bgCanvas, 0, 0);

        // Goal pads (lily pads)
        const padCols = [1, 4, 7, 10, 13];
        for (let i = 0; i < padCols.length; i++) {
            const cx = padCols[i] * TILE + TILE / 2, cy = TILE / 2;
            ctx.fillStyle = '#0a3a5e';
            ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = state.goals[i] ? '#3fd08b' : '#3a8c5e';
            ctx.beginPath(); ctx.arc(cx, cy, 15, 0.3, Math.PI * 2 - 0.3); ctx.lineTo(cx, cy); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath(); ctx.arc(cx - 4, cy - 4, 6, 0, Math.PI * 2); ctx.fill();
            if (state.goals[i]) drawFrog(cx, cy, 'down', 0.75);
            else if (Math.floor(state.animTime + i) % 3 === 0) { ctx.fillStyle = '#ff9ad5'; ctx.beginPath(); ctx.arc(cx + 6, cy + 5, 3, 0, 7); ctx.fill(); }
        }

        // River (animated)
        for (let r = ROW_RIVER_TOP; r <= ROW_RIVER_BOTTOM; r++) {
            const y = r * TILE;
            const wg = ctx.createLinearGradient(0, y, 0, y + TILE);
            wg.addColorStop(0, '#0d4a78'); wg.addColorStop(1, '#093356');
            ctx.fillStyle = wg;
            ctx.fillRect(0, y, W, TILE);
            ctx.strokeStyle = 'rgba(140,210,255,0.28)';
            ctx.lineWidth = 1.3;
            const dir = (r % 2 === 0) ? 1 : -1;
            for (let c = -1; c < COLS; c++) {
                const off = ((state.animTime * 14 * dir + c * 41 + r * 17) % TILE + TILE) % TILE;
                ctx.beginPath(); ctx.arc(c * TILE + off, y + 12, 5, 0.1, Math.PI - 0.1); ctx.stroke();
                ctx.beginPath(); ctx.arc(c * TILE + (off + 20) % TILE, y + 29, 4, 0.1, Math.PI - 0.1); ctx.stroke();
            }
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, ROW_RIVER_TOP * TILE, W, 3);

        // Lane items
        for (const lane of state.lanes) {
            const y = lane.row * TILE;
            for (const item of lane.items) drawLaneItem(item, y, lane);
        }

        // Frog
        if (state.deadT <= 0) {
            const hop = state.frog.jumpT > 0 ? Math.sin((1 - state.frog.jumpT / 0.12) * Math.PI) * 5 : 0;
            drawFrog(state.frog.x, state.frog.y - hop, state.frog.dir, 1 + hop * 0.03);
        } else {
            const k = 1 - state.deadT / 0.9;
            ctx.globalAlpha = 1 - k * 0.6;
            drawFrog(state.frog.x, state.frog.y, state.frog.dir, 1 + k * 0.4);
            ctx.globalAlpha = 1;
            // X eyes + reason
            ctx.fillStyle = '#ff2e63';
            ctx.font = "bold 12px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
            ctx.fillText(state.deadReason, Math.max(70, Math.min(W - 70, state.frog.x)), state.frog.y - 28);
            ctx.shadowBlur = 0;
        }

        // Timer bar
        const tMax = Math.max(20, 32 - state.level);
        const tf = Math.max(0, state.time / tMax);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(W - 142, H - 16, 130, 8);
        ctx.fillStyle = tf > 0.3 ? '#36e3a4' : '#ff2e63';
        ctx.fillRect(W - 142, H - 16, 130 * tf, 8);

        // Lives icons
        for (let i = 0; i < state.lives - 1; i++) drawFrog(16 + i * 22, H - 14, 'up', 0.5);
    }

    function drawLaneItem(item, y, lane) {
        const dir = lane ? lane.dir : 1;
        if (item.kind === 'log' || item.kind === 'log2') {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            roundRect(item.x + 2, y + 8, item.w, TILE - 8, 9); ctx.fill();
            const g = ctx.createLinearGradient(0, y + 4, 0, y + TILE - 4);
            g.addColorStop(0, '#c08a45'); g.addColorStop(0.5, '#9b6a2e'); g.addColorStop(1, '#6e4a1f');
            ctx.fillStyle = g;
            roundRect(item.x, y + 4, item.w, TILE - 8, 9); ctx.fill();
            ctx.strokeStyle = 'rgba(60,35,10,0.6)'; ctx.lineWidth = 1.2;
            for (let i = 14; i < item.w - 14; i += 18) {
                ctx.beginPath(); ctx.moveTo(item.x + i, y + 9); ctx.quadraticCurveTo(item.x + i + 6, y + TILE / 2, item.x + i, y + TILE - 9); ctx.stroke();
            }
            // end rings
            for (const ex of [item.x + 7, item.x + item.w - 7]) {
                ctx.fillStyle = '#d9a766';
                ctx.beginPath(); ctx.ellipse(ex, y + TILE / 2, 5, 12, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#7a5223'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.ellipse(ex, y + TILE / 2, 2.5, 6, 0, 0, Math.PI * 2); ctx.stroke();
            }
        } else if (item.kind === 'turtle') {
            const submerged = isTurtleSubmerged(item);
            const flashing = item.diveT > 4 && item.diveT < 5;
            const turtleCount = Math.max(2, Math.round(item.w / 36));
            const segW = item.w / turtleCount;
            for (let i = 0; i < turtleCount; i++) {
                const cx = item.x + i * segW + segW / 2;
                const cy = y + TILE / 2;
                if (submerged) {
                    ctx.fillStyle = 'rgba(54,227,164,0.12)';
                    ctx.beginPath(); ctx.arc(cx, cy, segW / 2 - 4, 0, Math.PI * 2); ctx.fill();
                    continue;
                }
                ctx.globalAlpha = flashing && Math.floor(state.animTime * 6) % 2 === 0 ? 0.4 : 1;
                const hx = cx + dir * (segW / 2 - 3);
                ctx.fillStyle = '#2fbf8a';
                ctx.beginPath(); ctx.arc(hx, cy, 5, 0, Math.PI * 2); ctx.fill();
                // flippers
                const fl = Math.sin(state.animTime * 6 + i) * 3;
                ctx.fillRect(cx - 5, cy - segW / 2 + 1 + fl * 0.3, 5, 4);
                ctx.fillRect(cx - 5, cy + segW / 2 - 5 - fl * 0.3, 5, 4);
                const sg = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, segW / 2);
                sg.addColorStop(0, '#4be8b0'); sg.addColorStop(1, '#17795a');
                ctx.fillStyle = sg;
                ctx.beginPath(); ctx.arc(cx, cy, segW / 2 - 4, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(0,50,35,0.55)'; ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(cx, cy, segW / 4, 0, Math.PI * 2);
                ctx.moveTo(cx - segW / 2 + 5, cy); ctx.lineTo(cx + segW / 2 - 5, cy);
                ctx.moveTo(cx, cy - segW / 2 + 5); ctx.lineTo(cx, cy + segW / 2 - 5);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        } else {
            drawVehicle(item, y, dir);
        }
    }

    function drawVehicle(item, y, dir) {
        const colorMap = { car: COLORS.car, car2: COLORS.car2, truck: COLORS.truck, truck2: COLORS.truck2 };
        const col = colorMap[item.kind];
        const isTruck = item.kind.startsWith('truck');
        const x = item.x, w = item.w, h = TILE - 8, top = y + 4;
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(x + 2, top + 4, w, h, 6); ctx.fill();
        // wheels
        ctx.fillStyle = '#0a0a10';
        const wheelXs = isTruck ? [x + 10, x + w * 0.45, x + w - 14] : [x + 9, x + w - 17];
        for (const wx of wheelXs) { ctx.fillRect(wx, top - 2, 8, 4); ctx.fillRect(wx, top + h - 2, 8, 4); }
        // body
        const g = ctx.createLinearGradient(0, top, 0, top + h);
        g.addColorStop(0, lighten(col, 0.3)); g.addColorStop(0.5, col); g.addColorStop(1, lighten(col, -0.35));
        ctx.fillStyle = g;
        roundRect(x, top, w, h, 6); ctx.fill();
        // cabin / windows relative to heading
        const front = dir > 0 ? x + w : x;
        ctx.fillStyle = 'rgba(15,20,40,0.78)';
        if (isTruck) {
            const cabW = 24;
            const cx0 = dir > 0 ? x + w - cabW - 2 : x + 2;
            roundRect(cx0, top + 4, cabW, h - 8, 4); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(dir > 0 ? x + 6 : x + cabW + 6, top + 5, w - cabW - 14, h - 10);
        } else {
            const cx0 = x + w * 0.28;
            roundRect(cx0, top + 4, w * 0.44, h - 8, 4); ctx.fill();
        }
        // lights: headlights at front, tail lights at back
        const fx = dir > 0 ? x + w - 4 : x + 1;
        const bx = dir > 0 ? x + 1 : x + w - 4;
        ctx.shadowColor = '#ffe9a0'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#fff2b0';
        ctx.fillRect(fx, top + 3, 3, 5); ctx.fillRect(fx, top + h - 8, 3, 5);
        ctx.shadowColor = '#ff2e63';
        ctx.fillStyle = '#ff3a5c';
        ctx.fillRect(bx, top + 3, 3, 5); ctx.fillRect(bx, top + h - 8, 3, 5);
        ctx.shadowBlur = 0;
        // headlight beam
        const bg = ctx.createLinearGradient(front, 0, front + dir * 26, 0);
        bg.addColorStop(0, 'rgba(255,240,170,0.22)'); bg.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(dir > 0 ? front : front - 26, top + 2, 26, h - 4);
    }

    function lighten(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
        return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }

    function drawFrog(x, y, dir, scale = 1) {
        ctx.save();
        ctx.translate(x, y);
        const angles = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
        ctx.rotate(angles[dir] || 0);
        ctx.scale(scale, scale);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, 14, 14, 4, 0, 0, Math.PI * 2); ctx.fill();

        // back legs
        ctx.fillStyle = COLORS.frogDark;
        ctx.beginPath(); ctx.ellipse(-12, 8, 4, 8, 0.3, 0, Math.PI * 2); ctx.ellipse(12, 8, 4, 8, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.frog;
        ctx.fillRect(-16, 12, 8, 3); ctx.fillRect(8, 12, 8, 3);
        // front legs
        ctx.fillRect(-14, -4, 5, 3); ctx.fillRect(9, -4, 5, 3);

        // body
        const g = ctx.createRadialGradient(-3, -4, 2, 0, 0, 14);
        g.addColorStop(0, '#8dffd0'); g.addColorStop(1, COLORS.frogDark);
        ctx.shadowColor = COLORS.frog; ctx.shadowBlur = 8;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 1, 12, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        // spots
        ctx.fillStyle = 'rgba(10,80,50,0.45)';
        ctx.beginPath(); ctx.arc(-4, 6, 2.2, 0, 7); ctx.arc(4, 4, 2, 0, 7); ctx.arc(0, 9, 1.8, 0, 7); ctx.fill();

        // eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-5.5, -8, 4.2, 0, 7); ctx.arc(5.5, -8, 4.2, 0, 7); ctx.fill();
        ctx.fillStyle = '#0a0617';
        ctx.beginPath(); ctx.arc(-5.5, -8.5, 2, 0, 7); ctx.arc(5.5, -8.5, 2, 0, 7); ctx.fill();

        ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover) step(dt);
        else state.animTime += dt;
        render();
        requestAnimationFrame(loop);
    }

    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') tryJump(0, -1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') tryJump(0, 1);
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') tryJump(-1, 0);
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') tryJump(1, 0);
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        b.addEventListener('touchstart', (e) => { e.preventDefault();
            if (a === 'up') tryJump(0, -1);
            else if (a === 'down') tryJump(0, 1);
            else if (a === 'left') tryJump(-1, 0);
            else if (a === 'right') tryJump(1, 0);
            else if (a === 'pause') togglePause();
        }, { passive: false });
        b.addEventListener('mousedown', (e) => { e.preventDefault();
            if (a === 'up') tryJump(0, -1);
            else if (a === 'down') tryJump(0, 1);
            else if (a === 'left') tryJump(-1, 0);
            else if (a === 'right') tryJump(1, 0);
            else if (a === 'pause') togglePause();
        });
    });

    let ts = null;
    cv.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length === 1) ts = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });
    cv.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (!ts) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - ts.x, dy = t.clientY - ts.y;
        ts = null;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) tryJump(dx > 0 ? 1 : -1, 0);
        else tryJump(0, dy > 0 ? 1 : -1);
    }, { passive: false });

    function togglePause() {
        if (!state.running || state.gameover) return;
        state.paused = !state.paused;
        ui.oPause.classList.toggle('hidden', !state.paused);
        if (!state.paused) last = performance.now();
    }
    function restart() {
        ui.oTitle.classList.add('hidden');
        if (nextLevelTimer) { clearTimeout(nextLevelTimer); nextLevelTimer = null; }
        if (levelOverlayTimer) { clearTimeout(levelOverlayTimer); levelOverlayTimer = null; }
        ui.oOver.classList.add('hidden');
        ui.oPause.classList.add('hidden');
        ui.oLevel.classList.add('hidden');
        newGame();
        state.running = true;
        last = performance.now();
    }

    ui.btnPlay.addEventListener('click', () => {
        ui.oTitle.classList.add('hidden');
        newGame();
        state.running = true;
        last = performance.now();
        blip(880, 0.1);
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);

    loadHS();
    renderHS();
    buildLanes();
    updateFrogPx();
    state.running = false;
    requestAnimationFrame(loop);
})();
