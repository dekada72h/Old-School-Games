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
    const ROW_RIVER_TOP = 1, ROW_RIVER_BOTTOM = 6;
    const ROW_MEDIAN = 7;
    const ROW_ROAD_TOP = 8, ROW_ROAD_BOTTOM = 12;
    const ROW_START = 13;

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
        frog: { col: 7, row: ROW_START, x: 0, y: 0, jumpT: 0, fromX: 0, fromY: 0, dir: 'up' },
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

    function newLevel() {
        state.goals = [false, false, false, false, false];
        state.frog = { col: 7, row: ROW_START, x: 0, y: 0, jumpT: 0, fromX: 0, fromY: 0, dir: 'up' };
        updateFrogPx();
        state.time = Math.max(20, 32 - state.level);
        buildLanes();
        ui.levelTitle.textContent = `LEVEL ${state.level}`;
        ui.levelTag.textContent = state.level === 1 ? 'Hop to it...' : 'They\'re going faster now.';
        ui.oLevel.classList.remove('hidden');
        setTimeout(() => ui.oLevel.classList.add('hidden'), 1300);
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
                    // Hit by car?
                    for (const item of lane.items) {
                        if (state.frog.x >= item.x - state.frog.w / 2 - item.w / 2 + item.w / 2 - 4 &&
                            state.frog.x <= item.x + item.w + 4) {
                            // Use simpler AABB — use x in [item.x, item.x + item.w]
                            if (state.frog.x >= item.x + 4 && state.frog.x <= item.x + item.w - 4) {
                                die('Splat');
                                return;
                            }
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
                    setTimeout(() => newLevel(), 1500);
                    state.winT = 1.5;
                }
                return;
            } else if (state.frog.row === ROW_RIVER_TOP) {
                // Top river bank (just water decor — same as river hazard if not on log)
                // Actually treat row 1 as still a hazard? Let's treat it same as goal area edge
                die('Drowned');
                return;
            }
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
        if (dy < 0) state.score += 10;
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
        state.frog = { col: 7, row: ROW_START, x: 0, y: 0, jumpT: 0, fromX: 0, fromY: 0, dir: 'up' };
        updateFrogPx();
        state.winT = 0;
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Goal row (water bank)
        for (let c = 0; c < COLS; c++) {
            const padCols = [1, 4, 7, 10, 13];
            const padIdx = padCols.indexOf(c);
            const x = c * TILE, y = 0;
            if (padIdx !== -1) {
                // Pad
                ctx.fillStyle = state.goals[padIdx] ? COLORS.padFrog : COLORS.pad;
                ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fillRect(x + 4, y + 4, TILE - 8, 4);
                if (state.goals[padIdx]) {
                    drawFrog(x + TILE / 2, y + TILE / 2, 'up', 0.7);
                }
            } else {
                ctx.fillStyle = COLORS.grassDark;
                ctx.fillRect(x, y, TILE, TILE);
            }
        }

        // River
        for (let r = ROW_RIVER_TOP; r <= ROW_RIVER_BOTTOM; r++) {
            const y = r * TILE;
            ctx.fillStyle = COLORS.water;
            ctx.fillRect(0, y, W, TILE);
            // Ripple lines
            ctx.strokeStyle = COLORS.waterRipple;
            ctx.lineWidth = 1;
            for (let c = 0; c < COLS; c++) {
                const off = (state.animTime * 12 + c * 13) % TILE;
                ctx.beginPath();
                ctx.arc(c * TILE + off, y + 12, 4, 0, Math.PI);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(c * TILE + (off + 18) % TILE, y + 28, 3, 0, Math.PI);
                ctx.stroke();
            }
        }

        // Median
        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(0, ROW_MEDIAN * TILE, W, TILE);
        ctx.fillStyle = COLORS.grassDark;
        for (let c = 0; c < COLS; c++) {
            ctx.fillRect(c * TILE + (c % 3 === 0 ? 6 : 22), ROW_MEDIAN * TILE + 14, 4, 4);
        }

        // Road
        for (let r = ROW_ROAD_TOP; r <= ROW_ROAD_BOTTOM; r++) {
            ctx.fillStyle = COLORS.road;
            ctx.fillRect(0, r * TILE, W, TILE);
        }
        // Lane dividers (between road rows, not at top/bottom)
        ctx.fillStyle = COLORS.roadLine;
        for (let r = ROW_ROAD_TOP; r < ROW_ROAD_BOTTOM; r++) {
            const y = (r + 1) * TILE - 1;
            for (let x = 0; x < W; x += 30) {
                ctx.fillRect(x, y, 16, 2);
            }
        }

        // Start row
        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(0, ROW_START * TILE, W, TILE);

        // Lane items
        for (const lane of state.lanes) {
            const y = lane.row * TILE;
            for (const item of lane.items) {
                drawLaneItem(item, y);
            }
        }

        // Frog
        if (state.deadT <= 0) {
            drawFrog(state.frog.x, state.frog.y, state.frog.dir, 1);
        } else {
            // Death squish/explosion
            const k = 1 - state.deadT / 0.9;
            ctx.globalAlpha = 1 - k * 0.6;
            drawFrog(state.frog.x, state.frog.y, state.frog.dir, 1 + k * 0.4);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ff2e63';
            ctx.font = "bold 14px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(state.deadReason, state.frog.x, state.frog.y - 26);
        }

        // Lives icons
        for (let i = 0; i < state.lives - 1; i++) {
            drawFrog(16 + i * 22, H - 14, 'up', 0.5);
        }
    }

    function drawLaneItem(item, y) {
        if (item.kind === 'log' || item.kind === 'log2') {
            ctx.fillStyle = COLORS.log;
            roundRect(item.x, y + 4, item.w, TILE - 8, 8);
            ctx.fill();
            ctx.fillStyle = COLORS.logDark;
            for (let i = 8; i < item.w - 8; i += 12) {
                ctx.fillRect(item.x + i, y + 8, 2, TILE - 16);
            }
            // Cap rings
            ctx.fillStyle = COLORS.logDark;
            ctx.beginPath();
            ctx.arc(item.x + 6, y + TILE / 2, 8, 0, Math.PI * 2);
            ctx.arc(item.x + item.w - 6, y + TILE / 2, 8, 0, Math.PI * 2);
            ctx.fill();
        } else if (item.kind === 'turtle') {
            const submerged = isTurtleSubmerged(item);
            const flashing = item.diveT > 4 && item.diveT < 5;
            const turtleCount = Math.max(2, Math.round(item.w / 36));
            const segW = item.w / turtleCount;
            for (let i = 0; i < turtleCount; i++) {
                const cx = item.x + i * segW + segW / 2;
                const cy = y + TILE / 2;
                if (submerged) continue;
                ctx.globalAlpha = flashing && Math.floor(state.animTime * 6) % 2 === 0 ? 0.4 : 1;
                ctx.fillStyle = COLORS.turtleShell;
                ctx.beginPath();
                ctx.arc(cx, cy, segW / 2 - 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = COLORS.turtle;
                ctx.beginPath();
                ctx.arc(cx, cy, segW / 2 - 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = COLORS.turtleShell;
                ctx.fillRect(cx - 2, cy - 2, 4, 4);
                // Head
                ctx.fillStyle = COLORS.turtle;
                const headDir = item.x + i * segW > 0 ? 1 : 1; // always show on lane.dir side
                ctx.fillRect(cx + segW / 2 - 6, cy - 3, 6, 6);
                ctx.globalAlpha = 1;
            }
        } else {
            // Vehicle
            const colorMap = { car: COLORS.car, car2: COLORS.car2, truck: COLORS.truck, truck2: COLORS.truck2 };
            ctx.fillStyle = colorMap[item.kind];
            roundRect(item.x, y + 4, item.w, TILE - 8, 5);
            ctx.fill();
            // Window
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(item.x + 8, y + 10, item.w * 0.5, TILE - 20);
            // Lights
            ctx.fillStyle = '#ffd06b';
            ctx.fillRect(item.x + item.w - 4, y + 6, 3, 4);
            ctx.fillRect(item.x + item.w - 4, y + TILE - 10, 3, 4);
            ctx.fillStyle = '#ff2e63';
            ctx.fillRect(item.x + 1, y + 6, 3, 4);
            ctx.fillRect(item.x + 1, y + TILE - 10, 3, 4);
        }
    }

    function drawFrog(x, y, dir, scale = 1) {
        ctx.save();
        ctx.translate(x, y);
        const angles = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
        ctx.rotate(angles[dir] || 0);
        ctx.scale(scale, scale);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 14, 14, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = COLORS.frog;
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.frogDark;
        ctx.beginPath();
        ctx.ellipse(0, 4, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs
        ctx.fillStyle = COLORS.frog;
        ctx.fillRect(-12, 6, 4, 8);
        ctx.fillRect(8, 6, 4, 8);
        ctx.fillRect(-13, 12, 5, 3);
        ctx.fillRect(8, 12, 5, 3);

        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-5, -7, 4, 0, Math.PI * 2);
        ctx.arc(5, -7, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0617';
        ctx.beginPath();
        ctx.arc(-5, -7, 2, 0, Math.PI * 2);
        ctx.arc(5, -7, 2, 0, Math.PI * 2);
        ctx.fill();

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
        if (e.touches.length === 1) ts = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    });
    cv.addEventListener('touchend', (e) => {
        if (!ts) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - ts.x, dy = t.clientY - ts.y;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) tryJump(dx > 0 ? 1 : -1, 0);
        else tryJump(0, dy > 0 ? 1 : -1);
        ts = null;
    });

    function togglePause() {
        if (!state.running || state.gameover) return;
        state.paused = !state.paused;
        ui.oPause.classList.toggle('hidden', !state.paused);
        if (!state.paused) last = performance.now();
    }
    function restart() {
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
