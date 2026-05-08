/* ================================================================
   PELLET CHASE — modern Pac-Man remake
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), lives: $('lives'), level: $('level'), best: $('best'),
        hsScore: $('hs-score'), hsLevel: $('hs-level'),
        finalScore: $('final-score'),
        readyTitle: $('ready-title'), readyTag: $('ready-tag'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'),
        oReady: $('overlay-ready'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    // ---------- Maze ----------
    // 19 cols × 21 rows · TILE=32 px → 608×672 (canvas 608×704 leaves 32 px header for live HUD)
    const MAZE_RAW = [
        '###################',
        '#........#........#',
        '#o##.###.#.###.##o#',
        '#.................#',
        '#.##.#.#####.#.##.#',
        '#....#...#...#....#',
        '####.### # ###.####',
        '####.#       #.####',
        '####.# ##-## #.####',
        '    .  #   #  .    ',
        '####.# ##### #.####',
        '####.#       #.####',
        '####.# ##### #.####',
        '#........#........#',
        '#.##.###.#.###.##.#',
        '#o..#.........#..o#',
        '###.#.#.###.#.#.###',
        '#.....#..#..#.....#',
        '#.###.##.#.##.###.#',
        '#.................#',
        '###################'
    ];

    const COLS = 19, ROWS = 21;
    const TILE = 32;
    const MAZE_OFFSET_Y = 32; // space at top for live HUD inside canvas

    // Tile codes
    const T_PATH = 0, T_WALL = 1, T_PELLET = 2, T_POWER = 3, T_GATE = 4, T_PEN = 5;

    // ---------- State ----------
    const state = {
        running: false, paused: false, gameover: false,
        score: 0, bestScore: 0,
        lives: 3, level: 1, bestLevel: 0,
        maze: [],            // ROWS x COLS of tile codes
        pelletsLeft: 0,
        pacman: null,
        ghosts: [],
        mode: 'scatter',     // scatter | chase | frightened
        modeTimer: 0,
        modeIndex: 0,
        chaseChain: 0,       // for ghost-eating combo
        animTime: 0,
        ready: true,
        deathT: 0,
        readyT: 0,
        scoreFlashes: []     // {x,y,text,t}
    };

    const COLORS = {
        bg: '#050208',
        wall: '#5fd0ff',
        wallGlow: 'rgba(95, 208, 255, 0.4)',
        pellet: '#ffe6b3',
        power: '#ffd06b',
        pacman: '#ffd06b',
        gate: '#ff66cc',
        ghosts: ['#ff2e63', '#ff66cc', '#5fd0ff', '#ffd06b'],
        frightened: '#3357ff',
        frightenedFlash: '#ffffff',
        eyes: '#ffffff',
        text: '#ffffff'
    };

    // Mode timing per "phase" (loosely Pac-Man arcade): scatter 7, chase 20, scatter 7, chase 20, scatter 5, chase 20, scatter 5, chase ∞
    const MODE_PHASES = [
        { mode: 'scatter', dur: 7 },
        { mode: 'chase',   dur: 20 },
        { mode: 'scatter', dur: 7 },
        { mode: 'chase',   dur: 20 },
        { mode: 'scatter', dur: 5 },
        { mode: 'chase',   dur: 20 },
        { mode: 'scatter', dur: 5 },
        { mode: 'chase',   dur: Infinity }
    ];

    const FRIGHTENED_DURATION = 6;

    // ---------- Storage ----------
    const KEY = 'osg.pellet-chase.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) {
                const o = JSON.parse(r);
                state.bestScore = o.score || 0;
                state.bestLevel = o.level || 0;
            }
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

    // ---------- Audio ----------
    let audio = null;
    function blip(freq, dur = 0.06, type = 'square', vol = 0.05) {
        try {
            if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') audio.resume();
            const o = audio.createOscillator();
            const g = audio.createGain();
            o.type = type; o.frequency.setValueAtTime(freq, audio.currentTime);
            g.gain.setValueAtTime(vol, audio.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
            o.connect(g).connect(audio.destination);
            o.start(); o.stop(audio.currentTime + dur);
        } catch {}
    }
    function chord(freqs, gap = 70, dur = 0.12, type = 'square') {
        freqs.forEach((f, i) => setTimeout(() => blip(f, dur, type), i * gap));
    }

    // ---------- Setup ----------
    function buildMaze() {
        state.maze = [];
        state.pelletsLeft = 0;
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            for (let c = 0; c < COLS; c++) {
                const ch = MAZE_RAW[r][c];
                if (ch === '#') row.push(T_WALL);
                else if (ch === '.') { row.push(T_PELLET); state.pelletsLeft++; }
                else if (ch === 'o') { row.push(T_POWER); state.pelletsLeft++; }
                else if (ch === '-') row.push(T_GATE);
                else row.push(T_PATH);
            }
            state.maze.push(row);
        }
    }

    function tileAt(c, r) {
        if (r < 0 || r >= ROWS) return T_WALL;
        if (c < 0 || c >= COLS) return T_PATH; // tunnel sides treat as path
        return state.maze[r][c];
    }

    function isPassable(c, r, allowGate = false, isGhostInPen = false) {
        // tunnel: if c < 0 or c >= COLS only on the tunnel row
        if (r === 9 && (c < 0 || c >= COLS)) return true;
        const t = tileAt(c, r);
        if (t === T_WALL) return false;
        if (t === T_GATE) return allowGate;
        return true;
    }

    // Wrap c around for tunnel
    function wrapC(c) {
        if (c < 0) return COLS - 1;
        if (c >= COLS) return 0;
        return c;
    }

    function tileToPx(c, r) {
        return { x: c * TILE + TILE / 2, y: r * TILE + MAZE_OFFSET_Y + TILE / 2 };
    }

    function pxToTile(x, y) {
        return { c: Math.floor(x / TILE), r: Math.floor((y - MAZE_OFFSET_Y) / TILE) };
    }

    // ---------- Entities ----------
    function spawnPacman() {
        const startC = 9, startR = 15;
        const p = tileToPx(startC, startR);
        return {
            x: p.x, y: p.y,
            dir: { x: -1, y: 0 },
            nextDir: { x: -1, y: 0 },
            speed: 95,        // px/sec
            mouth: 0,
            alive: true
        };
    }

    function spawnGhosts() {
        // Pen positions:
        // Blinky outside on top of gate; others inside pen
        const cfg = [
            { name: 'Blinky', col: 9,  row: 7,  color: COLORS.ghosts[0], scatter: { c: 17, r: 0 }, exitDelay: 0 },
            { name: 'Pinky',  col: 9,  row: 9,  color: COLORS.ghosts[1], scatter: { c: 1,  r: 0 }, exitDelay: 1 },
            { name: 'Inky',   col: 8,  row: 9,  color: COLORS.ghosts[2], scatter: { c: 17, r: 20 }, exitDelay: 4 },
            { name: 'Clyde',  col: 10, row: 9,  color: COLORS.ghosts[3], scatter: { c: 1,  r: 20 }, exitDelay: 8 }
        ];
        return cfg.map(g => {
            const p = tileToPx(g.col, g.row);
            return {
                ...g,
                x: p.x, y: p.y,
                dir: { x: 0, y: -1 },
                speed: 80,
                state: g.exitDelay === 0 ? 'roam' : 'pen',
                exitTimer: g.exitDelay,
                eatenTimer: 0
            };
        });
    }

    function newLevel() {
        buildMaze();
        state.pacman = spawnPacman();
        state.ghosts = spawnGhosts();
        state.modeIndex = 0;
        state.mode = MODE_PHASES[0].mode;
        state.modeTimer = MODE_PHASES[0].dur;
        state.chaseChain = 0;
        state.scoreFlashes = [];
        showReady('READY?', 'Get set...');
    }

    function newGame() {
        state.score = 0;
        state.lives = 3;
        state.level = 1;
        state.gameover = false;
        newLevel();
        updateHud();
    }

    function showReady(title, tag) {
        state.ready = true;
        state.readyT = 1.5;
        ui.readyTitle.textContent = title;
        ui.readyTag.textContent = tag;
        ui.oReady.classList.remove('hidden');
    }

    function hideReady() {
        ui.oReady.classList.add('hidden');
        state.ready = false;
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.level.textContent = state.level;
    }

    // ---------- Movement ----------
    function tryDir(p, d) {
        // Check if entity at center of its current tile can turn
        const c = Math.round((p.x - TILE / 2) / TILE);
        const r = Math.round((p.y - MAZE_OFFSET_Y - TILE / 2) / TILE);
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2 + MAZE_OFFSET_Y;
        // Allow direction change only when close to tile center
        if (Math.abs(p.x - cx) > 4 || Math.abs(p.y - cy) > 4) return false;
        if (!isPassable(c + d.x, r + d.y)) return false;
        // Snap to center
        p.x = cx; p.y = cy;
        p.dir = d;
        return true;
    }

    function step(dt) {
        if (state.deathT > 0) {
            state.deathT -= dt;
            if (state.deathT <= 0) onPacmanDeathDone();
            return;
        }
        if (!state.ready) {
            // Pacman
            const pac = state.pacman;
            if (pac.alive) {
                // Try to apply queued direction
                tryDir(pac, pac.nextDir);

                // Move
                let nx = pac.x + pac.dir.x * pac.speed * dt;
                let ny = pac.y + pac.dir.y * pac.speed * dt;

                // Look-ahead tile
                const lookC = Math.floor((nx + Math.sign(pac.dir.x) * (TILE / 2 - 1)) / TILE);
                const lookR = Math.floor((ny + Math.sign(pac.dir.y) * (TILE / 2 - 1) - MAZE_OFFSET_Y) / TILE);
                if (!isPassable(lookC, lookR)) {
                    // Snap to center if trying to walk into wall
                    const cur = pxToTile(pac.x, pac.y);
                    const cx = cur.c * TILE + TILE / 2;
                    const cy = cur.r * TILE + TILE / 2 + MAZE_OFFSET_Y;
                    if (pac.dir.x !== 0) nx = cx;
                    else ny = cy;
                    pac.dir = { x: 0, y: 0 };
                }

                // Tunnel wrap
                if (nx < -TILE / 2) nx = COLS * TILE + TILE / 2 - 1;
                if (nx > COLS * TILE + TILE / 2) nx = -TILE / 2 + 1;

                pac.x = nx; pac.y = ny;
                pac.mouth += dt * 14;

                // Eat?
                const cur = pxToTile(pac.x, pac.y);
                if (cur.c >= 0 && cur.c < COLS && cur.r >= 0 && cur.r < ROWS) {
                    const t = state.maze[cur.r][cur.c];
                    if (t === T_PELLET) {
                        state.maze[cur.r][cur.c] = T_PATH;
                        state.pelletsLeft--;
                        state.score += 10;
                        blip(660, 0.04);
                    } else if (t === T_POWER) {
                        state.maze[cur.r][cur.c] = T_PATH;
                        state.pelletsLeft--;
                        state.score += 50;
                        triggerFrightened();
                        blip(880, 0.1, 'square');
                        blip(1320, 0.1, 'triangle');
                    }
                }

                // Win level?
                if (state.pelletsLeft === 0) {
                    state.level++;
                    state.score += 1000;
                    bump();
                    chord([523, 659, 784, 1047, 1568], 100, 0.15);
                    setTimeout(() => newLevel(), 1500);
                    return;
                }
            }

            // Ghosts
            for (const g of state.ghosts) updateGhost(g, dt);
            checkGhostCollisions();

            // Mode timer
            if (state.mode !== 'frightened' && MODE_PHASES[state.modeIndex].dur !== Infinity) {
                state.modeTimer -= dt;
                if (state.modeTimer <= 0) {
                    state.modeIndex++;
                    const ph = MODE_PHASES[state.modeIndex];
                    state.mode = ph.mode;
                    state.modeTimer = ph.dur;
                    // Reverse ghost direction at mode change (classic behavior)
                    for (const g of state.ghosts) {
                        if (g.state === 'roam') g.dir = { x: -g.dir.x, y: -g.dir.y };
                    }
                }
            } else if (state.mode === 'frightened') {
                state.modeTimer -= dt;
                if (state.modeTimer <= 0) {
                    // Restore previous mode
                    state.mode = MODE_PHASES[state.modeIndex].mode;
                    state.modeTimer = MODE_PHASES[state.modeIndex].dur;
                    state.chaseChain = 0;
                }
            }
        }

        // Score flashes decay
        for (let i = state.scoreFlashes.length - 1; i >= 0; i--) {
            state.scoreFlashes[i].t -= dt;
            if (state.scoreFlashes[i].t <= 0) state.scoreFlashes.splice(i, 1);
        }

        if (state.ready && state.readyT > 0) {
            state.readyT -= dt;
            if (state.readyT <= 0) hideReady();
        }
    }

    function triggerFrightened() {
        state.mode = 'frightened';
        state.modeTimer = Math.max(2, FRIGHTENED_DURATION - (state.level - 1) * 0.5);
        state.chaseChain = 0;
        for (const g of state.ghosts) {
            if (g.state === 'roam') {
                g.state = 'frightened';
                g.dir = { x: -g.dir.x, y: -g.dir.y };
            }
        }
    }

    function updateGhost(g, dt) {
        if (g.state === 'pen') {
            // Bounce up/down inside pen, then exit
            g.exitTimer -= dt;
            // Bob
            const baseY = tileToPx(g.col, g.row).y;
            g.y = baseY + Math.sin(state.animTime * 3 + g.exitDelay) * 6;
            if (g.exitTimer <= 0) {
                g.state = 'leaving';
                const target = tileToPx(9, 8); // gate position
                g.targetExit = target;
            }
        } else if (g.state === 'leaving') {
            // Move toward gate, then up out of pen
            const t = g.targetExit;
            const dx = t.x - g.x, dy = t.y - g.y;
            const dist = Math.hypot(dx, dy);
            const sp = 60;
            if (dist < 2) {
                g.state = 'roam';
                g.dir = { x: 0, y: -1 };
                g.x = t.x; g.y = t.y;
            } else {
                g.x += (dx / dist) * sp * dt;
                g.y += (dy / dist) * sp * dt;
            }
        } else if (g.state === 'eaten') {
            // Return to pen center
            const t = tileToPx(9, 9);
            const dx = t.x - g.x, dy = t.y - g.y;
            const dist = Math.hypot(dx, dy);
            const sp = 220;
            if (dist < 4) {
                g.state = 'pen';
                g.exitTimer = 1.5;
            } else {
                g.x += (dx / dist) * sp * dt;
                g.y += (dy / dist) * sp * dt;
            }
        } else {
            // 'roam' or 'frightened'
            const target = ghostTarget(g);
            const speed = g.state === 'frightened' ? 50 : g.speed * (1 + (state.level - 1) * 0.05);

            // Try to choose direction at intersection (when at tile center)
            const c = Math.round((g.x - TILE / 2) / TILE);
            const r = Math.round((g.y - MAZE_OFFSET_Y - TILE / 2) / TILE);
            const cx = c * TILE + TILE / 2;
            const cy = r * TILE + MAZE_OFFSET_Y + TILE / 2;
            if (Math.abs(g.x - cx) < 2 && Math.abs(g.y - cy) < 2) {
                g.x = cx; g.y = cy;
                // pick direction
                const opts = [];
                const dirs = [
                    { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }
                ];
                for (const d of dirs) {
                    if (d.x === -g.dir.x && d.y === -g.dir.y) continue; // no reverse
                    const nc = c + d.x, nr = r + d.y;
                    // tunnel wrap
                    const wc = wrapC(nc);
                    if (!isPassable(wc, nr)) continue;
                    // Compute distance to target
                    const tc = wc, tr = nr;
                    const dist = Math.hypot(tc - target.c, tr - target.r);
                    opts.push({ d, dist });
                }
                if (opts.length === 0) {
                    g.dir = { x: -g.dir.x, y: -g.dir.y }; // dead end → reverse
                } else if (g.state === 'frightened') {
                    g.dir = opts[Math.floor(Math.random() * opts.length)].d;
                } else {
                    opts.sort((a, b) => a.dist - b.dist);
                    g.dir = opts[0].d;
                }
            }

            g.x += g.dir.x * speed * dt;
            g.y += g.dir.y * speed * dt;
            // Tunnel wrap
            if (g.x < -TILE / 2) g.x = COLS * TILE + TILE / 2 - 1;
            if (g.x > COLS * TILE + TILE / 2) g.x = -TILE / 2 + 1;
        }
    }

    function ghostTarget(g) {
        const pac = state.pacman;
        const pc = pxToTile(pac.x, pac.y);
        if (state.mode === 'scatter') return { c: g.scatter.c, r: g.scatter.r };
        if (state.mode === 'frightened') {
            // already random in updateGhost
            return { c: pc.c, r: pc.r };
        }
        // chase
        if (g.name === 'Blinky') return { c: pc.c, r: pc.r };
        if (g.name === 'Pinky')  return { c: pc.c + pac.dir.x * 4, r: pc.r + pac.dir.y * 4 };
        if (g.name === 'Inky') {
            // 2-tiles ahead pivot, mirrored from Blinky
            const blinky = state.ghosts.find(x => x.name === 'Blinky');
            const bt = pxToTile(blinky.x, blinky.y);
            const pivot = { c: pc.c + pac.dir.x * 2, r: pc.r + pac.dir.y * 2 };
            return { c: pivot.c * 2 - bt.c, r: pivot.r * 2 - bt.r };
        }
        if (g.name === 'Clyde') {
            const dist = Math.hypot(pc.c - Math.round((g.x - TILE / 2) / TILE),
                                    pc.r - Math.round((g.y - MAZE_OFFSET_Y - TILE / 2) / TILE));
            if (dist < 8) return { c: g.scatter.c, r: g.scatter.r };
            return { c: pc.c, r: pc.r };
        }
        return { c: pc.c, r: pc.r };
    }

    function checkGhostCollisions() {
        const pac = state.pacman;
        if (!pac.alive) return;
        for (const g of state.ghosts) {
            if (g.state === 'pen' || g.state === 'eaten') continue;
            const dx = g.x - pac.x, dy = g.y - pac.y;
            if (dx * dx + dy * dy < (TILE * 0.55) * (TILE * 0.55)) {
                if (g.state === 'frightened') {
                    g.state = 'eaten';
                    state.chaseChain = Math.min(4, state.chaseChain + 1);
                    const points = [200, 400, 800, 1600][state.chaseChain - 1];
                    state.score += points;
                    state.scoreFlashes.push({ x: g.x, y: g.y, text: '+' + points, t: 1.0 });
                    chord([880, 1320, 1760], 60, 0.1, 'triangle');
                } else {
                    pacmanHit();
                    return;
                }
            }
        }
    }

    function pacmanHit() {
        state.pacman.alive = false;
        state.deathT = 1.6;
        for (let i = 0; i < 5; i++) setTimeout(() => blip(440 - i * 50, 0.15, 'sawtooth'), i * 90);
    }

    function onPacmanDeathDone() {
        state.lives--;
        bump();
        if (state.lives <= 0) {
            state.gameover = true;
            state.running = false;
            ui.finalScore.textContent = state.score;
            setTimeout(() => ui.oOver.classList.remove('hidden'), 400);
        } else {
            // Reset positions
            state.pacman = spawnPacman();
            state.ghosts = spawnGhosts();
            state.modeIndex = 0;
            state.mode = MODE_PHASES[0].mode;
            state.modeTimer = MODE_PHASES[0].dur;
            showReady('READY?', `${state.lives} lives left`);
            updateHud();
        }
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, cv.width, cv.height);

        // Maze
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const t = state.maze[r][c];
                const px = c * TILE;
                const py = r * TILE + MAZE_OFFSET_Y;
                if (t === T_WALL) drawWallTile(c, r, px, py);
                else if (t === T_PELLET) {
                    ctx.fillStyle = COLORS.pellet;
                    ctx.fillRect(px + TILE / 2 - 2, py + TILE / 2 - 2, 4, 4);
                } else if (t === T_POWER) {
                    const blink = Math.sin(state.animTime * 6) * 0.5 + 0.5;
                    if (blink > 0.3) {
                        ctx.fillStyle = COLORS.power;
                        ctx.shadowColor = COLORS.power;
                        ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.arc(px + TILE / 2, py + TILE / 2, 6, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    }
                } else if (t === T_GATE) {
                    ctx.fillStyle = COLORS.gate;
                    ctx.fillRect(px + 2, py + TILE / 2 - 2, TILE - 4, 4);
                }
            }
        }

        // Score flashes
        for (const f of state.scoreFlashes) {
            ctx.globalAlpha = Math.min(1, f.t);
            ctx.fillStyle = COLORS.power;
            ctx.font = "bold 14px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(f.text, f.x, f.y - (1 - f.t) * 24);
        }
        ctx.globalAlpha = 1;

        // Ghosts
        for (const g of state.ghosts) drawGhost(g);

        // Pacman
        drawPacman(state.pacman);
    }

    function drawWallTile(c, r, x, y) {
        // Glowy line wall
        ctx.fillStyle = '#0a1530';
        ctx.fillRect(x, y, TILE, TILE);
        // Determine which sides of the tile are NOT walls (i.e. a path) → draw a glowing edge there
        const dirs = [
            { dx: 0,  dy: -1, x1: x, y1: y, x2: x + TILE, y2: y },
            { dx: 0,  dy:  1, x1: x, y1: y + TILE, x2: x + TILE, y2: y + TILE },
            { dx: -1, dy:  0, x1: x, y1: y, x2: x, y2: y + TILE },
            { dx: 1,  dy:  0, x1: x + TILE, y1: y, x2: x + TILE, y2: y + TILE }
        ];
        ctx.strokeStyle = COLORS.wall;
        ctx.lineWidth = 2;
        ctx.shadowColor = COLORS.wallGlow;
        ctx.shadowBlur = 6;
        for (const d of dirs) {
            const nc = c + d.dx, nr = r + d.dy;
            if (tileAt(nc, nr) !== T_WALL) {
                ctx.beginPath();
                ctx.moveTo(d.x1, d.y1);
                ctx.lineTo(d.x2, d.y2);
                ctx.stroke();
            }
        }
        ctx.shadowBlur = 0;
    }

    function drawPacman(p) {
        if (!p) return;
        if (state.deathT > 0) {
            // Death animation: shrinking pie
            const k = 1 - state.deathT / 1.6;
            ctx.fillStyle = COLORS.pacman;
            ctx.beginPath();
            const angle = k * Math.PI;
            ctx.moveTo(p.x, p.y);
            ctx.arc(p.x, p.y, TILE * 0.4, -Math.PI / 2 + angle, -Math.PI / 2 - angle, true);
            ctx.closePath();
            ctx.fill();
            return;
        }
        const r = TILE * 0.45;
        const open = Math.abs(Math.sin(p.mouth)) * 0.45;
        let ang;
        if (p.dir.x > 0) ang = 0;
        else if (p.dir.x < 0) ang = Math.PI;
        else if (p.dir.y < 0) ang = -Math.PI / 2;
        else if (p.dir.y > 0) ang = Math.PI / 2;
        else ang = 0;

        ctx.fillStyle = COLORS.pacman;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, r, ang + open, ang - open + Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }

    function drawGhost(g) {
        const r = TILE * 0.42;
        let body;
        if (g.state === 'eaten') body = null;
        else if (g.state === 'frightened') {
            const flashing = state.modeTimer < 2;
            body = flashing && Math.floor(state.animTime * 8) % 2 === 0 ? COLORS.frightenedFlash : COLORS.frightened;
        } else body = g.color;

        if (body) {
            ctx.fillStyle = body;
            // Top dome
            ctx.beginPath();
            ctx.arc(g.x, g.y - 2, r, Math.PI, 0, false);
            // Bottom skirt zigzag
            const baseY = g.y + r - 2;
            const dx = r;
            ctx.lineTo(g.x + dx, baseY);
            ctx.lineTo(g.x + dx * 0.66, baseY - 5);
            ctx.lineTo(g.x + dx * 0.33, baseY);
            ctx.lineTo(g.x, baseY - 5);
            ctx.lineTo(g.x - dx * 0.33, baseY);
            ctx.lineTo(g.x - dx * 0.66, baseY - 5);
            ctx.lineTo(g.x - dx, baseY);
            ctx.closePath();
            ctx.fill();
        }

        // Eyes
        const eyeR = 4;
        const eyeOffsetX = 5;
        const eyeOffsetY = -3;
        let pupilX = 0, pupilY = 0;
        if (g.dir.x !== 0 || g.dir.y !== 0) {
            pupilX = g.dir.x * 2;
            pupilY = g.dir.y * 2;
        }
        if (g.state === 'frightened' && body) {
            // Scared face
            ctx.fillStyle = '#fff';
            ctx.fillRect(g.x - 7, g.y - 3, 3, 3);
            ctx.fillRect(g.x + 4, g.y - 3, 3, 3);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(g.x - 8, g.y + 4);
            ctx.lineTo(g.x - 4, g.y + 2);
            ctx.lineTo(g.x, g.y + 4);
            ctx.lineTo(g.x + 4, g.y + 2);
            ctx.lineTo(g.x + 8, g.y + 4);
            ctx.stroke();
        } else {
            ctx.fillStyle = COLORS.eyes;
            ctx.beginPath();
            ctx.arc(g.x - eyeOffsetX, g.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
            ctx.arc(g.x + eyeOffsetX, g.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0a0617';
            ctx.beginPath();
            ctx.arc(g.x - eyeOffsetX + pupilX, g.y + eyeOffsetY + pupilY, 2, 0, Math.PI * 2);
            ctx.arc(g.x + eyeOffsetX + pupilX, g.y + eyeOffsetY + pupilY, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---------- Loop ----------
    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover) {
            state.animTime += dt;
            step(dt);
            updateHud();
        }
        render();
        requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    function setDir(x, y) {
        if (!state.pacman) return;
        state.pacman.nextDir = { x, y };
    }
    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') setDir(0, -1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') setDir(0, 1);
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') setDir(-1, 0);
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') setDir(1, 0);
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        b.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (a === 'up') setDir(0, -1);
            else if (a === 'down') setDir(0, 1);
            else if (a === 'left') setDir(-1, 0);
            else if (a === 'right') setDir(1, 0);
            else if (a === 'pause') togglePause();
        }, { passive: false });
        b.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (a === 'up') setDir(0, -1);
            else if (a === 'down') setDir(0, 1);
            else if (a === 'left') setDir(-1, 0);
            else if (a === 'right') setDir(1, 0);
            else if (a === 'pause') togglePause();
        });
    });

    // Swipe
    let ts = null;
    cv.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) ts = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    cv.addEventListener('touchend', (e) => {
        if (!ts) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - ts.x, dy = t.clientY - ts.y;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
        else setDir(0, dy > 0 ? 1 : -1);
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
        ui.oReady.classList.add('hidden');
        newGame();
        state.running = true;
        last = performance.now();
    }

    ui.btnPlay.addEventListener('click', () => {
        ui.oTitle.classList.add('hidden');
        newGame();
        state.running = true;
        last = performance.now();
        blip(880, 0.1, 'square');
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);

    // ---------- Boot ----------
    loadHS();
    renderHS();
    buildMaze();
    state.pacman = spawnPacman();
    state.ghosts = spawnGhosts();
    state.running = false;
    requestAnimationFrame(loop);
})();
