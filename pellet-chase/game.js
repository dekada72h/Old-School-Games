/* ================================================================
   PELLET CHASE — modern Pac-Man remake
   Pure HTML5 canvas, vanilla JS.
   Grid-based movement: entities travel center-to-center and decide
   their direction exactly at tile centers (no pixel-window turning).
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
    // 19 cols x 21 rows, TILE=32 -> 608x672, plus 32px strip on top for the in-canvas HUD
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
    const OFF = 32;           // top strip height
    const TUNNEL_ROW = 9;
    const EPS = 1e-3;

    const T_PATH = 0, T_WALL = 1, T_PELLET = 2, T_POWER = 3, T_GATE = 4;

    // ---------- State ----------
    const state = {
        running: false, paused: false, gameover: false,
        score: 0, bestScore: 0,
        lives: 3, level: 1, bestLevel: 0,
        maze: [],
        pelletsLeft: 0, pelletsEaten: 0,
        pacman: null,
        ghosts: [],
        mode: 'scatter',      // scatter | chase (frightened is tracked by frightT)
        modeTimer: 0,
        modeIndex: 0,
        frightT: 0,
        chaseChain: 0,
        animTime: 0,
        ready: true,
        readyT: 0,
        deathT: 0,
        clearT: 0,
        fruit: null,          // {t, kind}
        fruitsSpawned: 0,
        waka: 0,
        scoreFlashes: []
    };

    const COLORS = {
        bg: '#050208',
        wall: '#5fd0ff',
        wallFlash: '#ffffff',
        pellet: '#ffe6b3',
        power: '#ffd06b',
        pacman: '#ffd84a',
        gate: '#ff66cc',
        ghosts: ['#ff2e63', '#ff9ad5', '#5fd0ff', '#ffb347'],
        frightened: '#2a4bff',
        frightenedFlash: '#ffffff'
    };

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

    const DIRS = [
        { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }
    ];
    const ZERO = { x: 0, y: 0 };

    const FRUITS = [
        { name: 'cherry', pts: 100 }, { name: 'strawberry', pts: 300 },
        { name: 'orange', pts: 500 }, { name: 'apple', pts: 700 },
        { name: 'melon', pts: 1000 }
    ];

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

    // ---------- Maze helpers ----------
    function buildMaze() {
        state.maze = [];
        state.pelletsLeft = 0;
        state.pelletsEaten = 0;
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

    function staticTile(c, r) {
        // used for wall drawing (independent of eaten pellets)
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return T_PATH;
        return MAZE_RAW[r][c] === '#' ? T_WALL : T_PATH;
    }

    function tileAt(c, r) {
        if (r < 0 || r >= ROWS) return T_WALL;
        if (c < 0 || c >= COLS) return r === TUNNEL_ROW ? T_PATH : T_WALL;
        return state.maze[r][c];
    }

    function isPassable(c, r) {
        const t = tileAt(c, r);
        return t !== T_WALL && t !== T_GATE;
    }

    function cx(c) { return c * TILE + TILE / 2; }
    function cy(r) { return r * TILE + OFF + TILE / 2; }

    function tileOf(e) {
        return { c: Math.round((e.x - TILE / 2) / TILE), r: Math.round((e.y - OFF - TILE / 2) / TILE) };
    }

    function atCenter(e) {
        const kx = (e.x - TILE / 2) / TILE, ky = (e.y - OFF - TILE / 2) / TILE;
        return Math.abs(kx - Math.round(kx)) < EPS && Math.abs(ky - Math.round(ky)) < EPS;
    }

    /**
     * Move an entity `dist` pixels along its direction. At every tile centre
     * `decide(e, c, r)` is invoked and may change e.dir. Handles the tunnel wrap.
     */
    function advance(e, dist, decide) {
        let guard = 0;
        while (dist > EPS && guard++ < 12) {
            if (atCenter(e)) {
                const t = tileOf(e);
                e.x = cx(t.c); e.y = cy(t.r);
                if (t.c <= -1 && e.dir.x < 0) { e.x = cx(COLS); continue; }
                if (t.c >= COLS && e.dir.x > 0) { e.x = cx(-1); continue; }
                decide(e, t.c, t.r);
                if (e.dir.x === 0 && e.dir.y === 0) return;
                if (!isPassable(t.c + e.dir.x, t.r + e.dir.y)) { e.dir = ZERO; return; }
            }
            let toNext;
            if (e.dir.x !== 0) {
                const k = (e.x - TILE / 2) / TILE;
                const tk = e.dir.x > 0 ? Math.floor(k + EPS) + 1 : Math.ceil(k - EPS) - 1;
                toNext = Math.abs(tk * TILE + TILE / 2 - e.x);
            } else {
                const k = (e.y - OFF - TILE / 2) / TILE;
                const tk = e.dir.y > 0 ? Math.floor(k + EPS) + 1 : Math.ceil(k - EPS) - 1;
                toNext = Math.abs(tk * TILE + OFF + TILE / 2 - e.y);
            }
            const s = Math.min(dist, toNext);
            e.x += e.dir.x * s; e.y += e.dir.y * s;
            dist -= s;
            if (s >= toNext - EPS) {
                const t = tileOf(e);
                e.x = cx(t.c); e.y = cy(t.r);
            }
        }
    }

    // ---------- Entities ----------
    function spawnPacman() {
        return {
            x: cx(9), y: cy(15),
            dir: { x: -1, y: 0 },
            nextDir: { x: -1, y: 0 },
            speed: 112,
            mouth: 0,
            moving: false,
            alive: true
        };
    }

    function spawnGhosts() {
        const cfg = [
            { name: 'Blinky', col: 9,  row: 7, color: COLORS.ghosts[0], scatter: { c: 17, r: 0 },  exitDelay: 0 },
            { name: 'Pinky',  col: 9,  row: 9, color: COLORS.ghosts[1], scatter: { c: 1,  r: 0 },  exitDelay: 2 },
            { name: 'Inky',   col: 8,  row: 9, color: COLORS.ghosts[2], scatter: { c: 17, r: 20 }, exitDelay: 5 },
            { name: 'Clyde',  col: 10, row: 9, color: COLORS.ghosts[3], scatter: { c: 1,  r: 20 }, exitDelay: 9 }
        ];
        return cfg.map(g => ({
            ...g,
            x: cx(g.col), y: cy(g.row),
            dir: g.exitDelay === 0 ? { x: -1, y: 0 } : ZERO,
            state: g.exitDelay === 0 ? 'roam' : 'pen',
            exitTimer: g.exitDelay,
            wobble: Math.random() * 6
        }));
    }

    function resetActors() {
        state.pacman = spawnPacman();
        state.ghosts = spawnGhosts();
        state.modeIndex = 0;
        state.mode = MODE_PHASES[0].mode;
        state.modeTimer = MODE_PHASES[0].dur;
        state.frightT = 0;
        state.chaseChain = 0;
        state.fruit = null;
        state.scoreFlashes = [];
    }

    function newLevel() {
        buildMaze();
        state.fruitsSpawned = 0;
        resetActors();
        state.clearT = 0;
        showReady('READY?', 'Level ' + state.level);
    }

    function newGame() {
        state.score = 0;
        state.lives = 3;
        state.level = 1;
        state.gameover = false;
        state.deathT = 0;
        newLevel();
        updateHud();
    }

    function showReady(title, tag) {
        state.ready = true;
        state.readyT = 1.6;
        state.readyTitle = title;
        state.readyTag = tag;
    }

    function hideReady() {
        state.ready = false;
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.level.textContent = state.level;
    }

    function addScore(n) {
        const before = state.score;
        state.score += n;
        if (Math.floor(before / 10000) < Math.floor(state.score / 10000) && state.lives < 5) {
            state.lives++;
            chord([784, 988, 1175, 1568], 80, 0.12, 'triangle');
        }
    }

    // ---------- Simulation ----------
    function pacDecide(p, c, r) {
        const n = p.nextDir;
        if ((n.x || n.y) && isPassable(c + n.x, r + n.y)) p.dir = n;
        else if (!(p.dir.x || p.dir.y) || !isPassable(c + p.dir.x, r + p.dir.y)) p.dir = ZERO;
    }

    function ghostSpeed(g) {
        if (g.state === 'eaten') return 230;
        const lv = Math.min(state.level - 1, 8);
        if (g.state === 'frightened') return 58;
        const t = tileOf(g);
        const tunnel = t.r === TUNNEL_ROW && (t.c < 4 || t.c > COLS - 5);
        return (92 + lv * 3) * (tunnel ? 0.6 : 1);
    }

    function ghostDecide(g, c, r) {
        if (g.state === 'eaten' && c === 9 && r === 7) {
            g.state = 'entering';
            g.dir = ZERO;
            return;
        }
        const target = g.state === 'eaten' ? { c: 9, r: 7 } : ghostTarget(g);
        const opts = [];
        for (const d of DIRS) {
            if (d.x === -g.dir.x && d.y === -g.dir.y && (g.dir.x || g.dir.y)) continue;
            if (!isPassable(c + d.x, r + d.y)) continue;
            // ghosts may not turn up into the two "no-up" spots above the pen in chase (classic) — skipped for simplicity
            const dist = Math.hypot(c + d.x - target.c, r + d.y - target.r);
            opts.push({ d, dist });
        }
        if (opts.length === 0) {
            g.dir = { x: -g.dir.x, y: -g.dir.y };
        } else if (g.state === 'frightened') {
            g.dir = opts[Math.floor(Math.random() * opts.length)].d;
        } else {
            let best = opts[0];
            for (const o of opts) if (o.dist < best.dist - 1e-9) best = o;
            g.dir = best.d;
        }
    }

    function updateGhost(g, dt) {
        const gx = cx(9);
        if (g.state === 'pen') {
            g.exitTimer -= dt;
            const baseY = cy(9);
            g.y = baseY + Math.sin(state.animTime * 5 + g.wobble) * 5;
            if (g.exitTimer <= 0) g.state = 'leaving';
        } else if (g.state === 'leaving') {
            const sp = 70 * dt;
            const baseY = cy(9);
            if (Math.abs(g.y - baseY) > 0.5 && Math.abs(g.x - gx) > 0.5) {
                g.y += Math.sign(baseY - g.y) * Math.min(sp, Math.abs(baseY - g.y));
            } else if (Math.abs(g.x - gx) > 0.5) {
                g.x += Math.sign(gx - g.x) * Math.min(sp, Math.abs(gx - g.x));
            } else {
                g.x = gx;
                g.y -= sp;
                if (g.y <= cy(7)) {
                    g.y = cy(7);
                    g.state = state.frightT > 0 ? 'frightened' : 'roam';
                    g.dir = { x: Math.random() < 0.5 ? -1 : 1, y: 0 };
                }
            }
        } else if (g.state === 'entering') {
            const ty = cy(9);
            g.y += 150 * dt;
            if (g.y >= ty) {
                g.y = ty; g.x = gx;
                g.state = 'pen';
                g.exitTimer = 1.2;
            }
        } else {
            advance(g, ghostSpeed(g) * dt, ghostDecide);
        }
    }

    function ghostTarget(g) {
        const pac = state.pacman;
        const pc = tileOf(pac);
        if (state.mode === 'scatter') return g.scatter;
        if (g.name === 'Blinky') return pc;
        if (g.name === 'Pinky')  return { c: pc.c + pac.dir.x * 4, r: pc.r + pac.dir.y * 4 };
        if (g.name === 'Inky') {
            const blinky = state.ghosts.find(x => x.name === 'Blinky');
            const bt = tileOf(blinky);
            const pv = { c: pc.c + pac.dir.x * 2, r: pc.r + pac.dir.y * 2 };
            return { c: pv.c * 2 - bt.c, r: pv.r * 2 - bt.r };
        }
        const gt = tileOf(g);
        const dist = Math.hypot(pc.c - gt.c, pc.r - gt.r);
        return dist < 8 ? g.scatter : pc;
    }

    function triggerFrightened() {
        state.frightT = Math.max(2.5, 7 - (state.level - 1) * 0.6);
        state.chaseChain = 0;
        for (const g of state.ghosts) {
            if (g.state === 'roam') {
                g.state = 'frightened';
                g.dir = { x: -g.dir.x, y: -g.dir.y };
            }
        }
    }

    function checkGhostCollisions() {
        const pac = state.pacman;
        if (!pac.alive) return;
        for (const g of state.ghosts) {
            if (g.state !== 'roam' && g.state !== 'frightened') continue;
            const dx = g.x - pac.x, dy = g.y - pac.y;
            if (dx * dx + dy * dy < (TILE * 0.58) * (TILE * 0.58)) {
                if (g.state === 'frightened') {
                    g.state = 'eaten';
                    state.chaseChain = Math.min(4, state.chaseChain + 1);
                    const points = [200, 400, 800, 1600][state.chaseChain - 1];
                    addScore(points);
                    state.scoreFlashes.push({ x: g.x, y: g.y, text: '' + points, t: 1.0 });
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
        state.deathT = 1.8;
        for (let i = 0; i < 6; i++) setTimeout(() => blip(520 - i * 60, 0.14, 'sawtooth'), i * 110);
    }

    function onPacmanDeathDone() {
        state.lives--;
        bump();
        if (state.lives <= 0) {
            state.gameover = true;
            state.running = false;
            ui.finalScore.textContent = state.score;
            ui.oOver.classList.remove('hidden');
        } else {
            resetActors();
            showReady('READY?', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left`);
        }
        updateHud();
    }

    function eatAt(p) {
        const t = tileOf(p);
        if (t.c < 0 || t.c >= COLS || t.r < 0 || t.r >= ROWS) return;
        const tile = state.maze[t.r][t.c];
        if (tile === T_PELLET) {
            state.maze[t.r][t.c] = T_PATH;
            state.pelletsLeft--; state.pelletsEaten++;
            addScore(10);
            state.waka ^= 1;
            blip(state.waka ? 520 : 700, 0.045, 'triangle', 0.06);
        } else if (tile === T_POWER) {
            state.maze[t.r][t.c] = T_PATH;
            state.pelletsLeft--; state.pelletsEaten++;
            addScore(50);
            triggerFrightened();
            blip(220, 0.12, 'sawtooth', 0.06);
            blip(880, 0.12, 'square');
        } else {
            return;
        }
        if ((state.pelletsEaten === 60 && state.fruitsSpawned < 1) || (state.pelletsEaten === 140 && state.fruitsSpawned < 2)) {
            state.fruitsSpawned++;
            state.fruit = { t: 10, kind: Math.min(FRUITS.length - 1, Math.floor((state.level - 1) / 2) % FRUITS.length) };
        }
    }

    function step(dt) {
        // Score pop-ups always decay
        for (let i = state.scoreFlashes.length - 1; i >= 0; i--) {
            state.scoreFlashes[i].t -= dt;
            if (state.scoreFlashes[i].t <= 0) state.scoreFlashes.splice(i, 1);
        }

        if (state.deathT > 0) {
            state.deathT -= dt;
            if (state.deathT <= 0) onPacmanDeathDone();
            return;
        }
        if (state.clearT > 0) {
            state.clearT -= dt;
            if (state.clearT <= 0) { state.level++; bump(); newLevel(); updateHud(); }
            return;
        }
        if (state.ready) {
            state.readyT -= dt;
            if (state.readyT <= 0) hideReady();
            return;
        }

        const pac = state.pacman;
        // Instant reversal is allowed anywhere in a corridor
        const nd = pac.nextDir;
        if ((pac.dir.x || pac.dir.y) && nd.x === -pac.dir.x && nd.y === -pac.dir.y && (nd.x || nd.y)) {
            pac.dir = nd;
        }
        const px0 = pac.x, py0 = pac.y;
        advance(pac, pac.speed * dt, pacDecide);
        pac.moving = pac.x !== px0 || pac.y !== py0;
        if (pac.moving) pac.mouth += dt * 16;
        eatAt(pac);

        if (state.fruit) {
            state.fruit.t -= dt;
            if (Math.hypot(pac.x - cx(9), pac.y - cy(11)) < TILE * 0.6) {
                const f = FRUITS[state.fruit.kind];
                addScore(f.pts);
                state.scoreFlashes.push({ x: cx(9), y: cy(11), text: '' + f.pts, t: 1.2 });
                chord([988, 1319], 70, 0.1, 'triangle');
                state.fruit = null;
            } else if (state.fruit.t <= 0) state.fruit = null;
        }

        if (state.pelletsLeft === 0) {
            state.clearT = 2.0;
            bump();
            chord([523, 659, 784, 1047, 1568], 100, 0.15);
            return;
        }

        for (const g of state.ghosts) updateGhost(g, dt);
        checkGhostCollisions();

        // Scatter/chase schedule (paused while frightened)
        if (state.frightT > 0) {
            state.frightT -= dt;
            if (state.frightT <= 0) {
                state.frightT = 0;
                state.chaseChain = 0;
                for (const g of state.ghosts) if (g.state === 'frightened') g.state = 'roam';
            }
        } else if (MODE_PHASES[state.modeIndex].dur !== Infinity) {
            state.modeTimer -= dt;
            if (state.modeTimer <= 0) {
                state.modeIndex++;
                const ph = MODE_PHASES[state.modeIndex];
                state.mode = ph.mode;
                state.modeTimer = ph.dur;
                for (const g of state.ghosts) {
                    if (g.state === 'roam') g.dir = { x: -g.dir.x, y: -g.dir.y };
                }
            }
        }
    }

    // ---------- Rendering ----------
    const wallCache = {};
    function buildWallCanvas(color) {
        const c = document.createElement('canvas');
        c.width = cv.width; c.height = cv.height;
        const g = c.getContext('2d');
        // fills
        for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
            if (staticTile(col, r) !== T_WALL) continue;
            g.fillStyle = '#081330';
            g.fillRect(col * TILE, r * TILE + OFF, TILE, TILE);
        }
        // exposed edges: glow pass + crisp pass
        const edges = [];
        for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
            if (staticTile(col, r) !== T_WALL) continue;
            const x = col * TILE, y = r * TILE + OFF;
            if (staticTile(col, r - 1) !== T_WALL) edges.push([x, y + 1, x + TILE, y + 1]);
            if (staticTile(col, r + 1) !== T_WALL) edges.push([x, y + TILE - 1, x + TILE, y + TILE - 1]);
            if (staticTile(col - 1, r) !== T_WALL) edges.push([x + 1, y, x + 1, y + TILE]);
            if (staticTile(col + 1, r) !== T_WALL) edges.push([x + TILE - 1, y, x + TILE - 1, y + TILE]);
        }
        g.lineCap = 'round';
        const pass = (w, a, blur) => {
            g.strokeStyle = color; g.globalAlpha = a; g.lineWidth = w;
            g.shadowColor = color; g.shadowBlur = blur;
            g.beginPath();
            for (const e of edges) { g.moveTo(e[0], e[1]); g.lineTo(e[2], e[3]); }
            g.stroke();
        };
        pass(5, 0.35, 14);
        pass(2, 1, 6);
        g.globalAlpha = 1; g.shadowBlur = 0;
        return c;
    }
    function wallCanvas(flash) {
        const key = flash ? 'f' : 'n';
        if (!wallCache[key]) wallCache[key] = buildWallCanvas(flash ? COLORS.wallFlash : COLORS.wall);
        return wallCache[key];
    }

    let bgGrad = null;

    function render() {
        if (!bgGrad) {
            bgGrad = ctx.createRadialGradient(cv.width / 2, cv.height / 2, 60, cv.width / 2, cv.height / 2, cv.height * 0.75);
            bgGrad.addColorStop(0, '#0b0620');
            bgGrad.addColorStop(1, '#030107');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, cv.width, cv.height);

        const flash = state.clearT > 0 && Math.floor(state.clearT * 5) % 2 === 0;
        ctx.drawImage(wallCanvas(flash), 0, 0);

        // Ghost-pen gate
        ctx.fillStyle = COLORS.gate;
        ctx.shadowColor = COLORS.gate; ctx.shadowBlur = 8;
        ctx.fillRect(9 * TILE + 2, 8 * TILE + OFF + TILE / 2 - 2, TILE - 4, 4);
        ctx.shadowBlur = 0;

        // Pellets
        const pulse = 0.65 + 0.35 * Math.sin(state.animTime * 8);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const t = state.maze[r] && state.maze[r][c];
                if (t === T_PELLET) {
                    ctx.fillStyle = COLORS.pellet;
                    ctx.beginPath();
                    ctx.arc(cx(c), cy(r), 3, 0, Math.PI * 2);
                    ctx.fill();
                } else if (t === T_POWER) {
                    ctx.fillStyle = COLORS.power;
                    ctx.shadowColor = COLORS.power; ctx.shadowBlur = 16 * pulse;
                    ctx.beginPath();
                    ctx.arc(cx(c), cy(r), 5 + 3 * pulse, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
        }

        if (state.fruit) drawFruit(cx(9), cy(11), state.fruit.kind, state.fruit.t < 3 && Math.floor(state.animTime * 8) % 2 === 0);

        if (state.clearT <= 0) {
            for (const g of state.ghosts) drawGhost(g);
            drawPacman(state.pacman);
        } else {
            drawPacman(state.pacman);
        }

        // Score pop-ups
        ctx.textAlign = 'center';
        ctx.font = "bold 13px 'Press Start 2P', monospace";
        for (const f of state.scoreFlashes) {
            ctx.globalAlpha = Math.min(1, f.t * 1.5);
            ctx.fillStyle = '#5fffd8';
            ctx.fillText(f.text, f.x, f.y - (1 - f.t) * 20);
        }
        ctx.globalAlpha = 1;

        if (state.ready && state.running) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd06b';
            ctx.shadowColor = '#ffd06b'; ctx.shadowBlur = 12;
            ctx.font = "16px 'Press Start 2P', monospace";
            ctx.fillText(state.readyTitle || 'READY?', cv.width / 2, cy(11) + 6);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#94a3b8';
            ctx.font = "9px 'Press Start 2P', monospace";
            ctx.fillText(state.readyTag || '', cv.width / 2, cy(12) + 4);
        }

        drawStrip();
    }

    function drawStrip() {
        ctx.fillStyle = '#05030f';
        ctx.fillRect(0, 0, cv.width, OFF);
        ctx.strokeStyle = 'rgba(95,208,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, OFF - 0.5); ctx.lineTo(cv.width, OFF - 0.5); ctx.stroke();
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('1UP', 14, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(state.score).padStart(6, '0'), 56, 16);
        // lives
        for (let i = 0; i < Math.max(0, state.lives - 1); i++) {
            ctx.fillStyle = COLORS.pacman;
            ctx.beginPath();
            const x = 230 + i * 24;
            ctx.moveTo(x, 16);
            ctx.arc(x, 16, 8, 0.7, Math.PI * 2 - 0.7);
            ctx.closePath(); ctx.fill();
        }
        // fruit history
        const n = Math.min(5, state.level);
        for (let i = 0; i < n; i++) {
            const k = Math.min(FRUITS.length - 1, Math.floor((state.level - n + i) / 2) % FRUITS.length);
            drawFruit(cv.width - 20 - i * 24, 16, Math.max(0, k), false, 0.6);
        }
        ctx.textBaseline = 'alphabetic';
    }

    function drawFruit(x, y, kind, hidden, scale = 1) {
        if (hidden) return;
        ctx.save();
        ctx.translate(x, y); ctx.scale(scale, scale);
        const f = FRUITS[kind].name;
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
        if (f === 'cherry') {
            ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-5, 3); ctx.quadraticCurveTo(-2, -9, 5, -11); ctx.moveTo(5, 4); ctx.quadraticCurveTo(5, -6, 5, -11); ctx.stroke();
            ctx.fillStyle = '#ff2e63';
            ctx.beginPath(); ctx.arc(-6, 6, 6, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(6, 7, 6, 0, 7); ctx.fill();
        } else if (f === 'strawberry') {
            ctx.fillStyle = '#ff3b5c';
            ctx.beginPath(); ctx.moveTo(-9, -4); ctx.quadraticCurveTo(0, -10, 9, -4); ctx.quadraticCurveTo(7, 9, 0, 11); ctx.quadraticCurveTo(-7, 9, -9, -4); ctx.fill();
            ctx.fillStyle = '#4caf50'; ctx.fillRect(-6, -8, 12, 4);
            ctx.fillStyle = '#ffe6b3'; ctx.fillRect(-4, 0, 2, 2); ctx.fillRect(2, 2, 2, 2); ctx.fillRect(-1, 6, 2, 2);
        } else if (f === 'orange') {
            ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.arc(0, 2, 9, 0, 7); ctx.fill();
            ctx.fillStyle = '#4caf50'; ctx.fillRect(-1, -9, 3, 5);
        } else if (f === 'apple') {
            ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(-3.5, 2, 7, 0, 7); ctx.arc(3.5, 2, 7, 0, 7); ctx.fill();
            ctx.fillStyle = '#4caf50'; ctx.fillRect(0, -9, 2, 5);
        } else {
            ctx.fillStyle = '#7bd389'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 9, 0, 0, 7); ctx.fill();
            ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 4); ctx.moveTo(-6, 6); ctx.lineTo(6, -2); ctx.stroke();
        }
        ctx.restore();
    }

    function drawPacman(p) {
        if (!p) return;
        const R = TILE * 0.46;
        ctx.save();
        ctx.shadowColor = 'rgba(255,216,74,0.7)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = COLORS.pacman;
        if (state.deathT > 0) {
            const k = Math.min(1, 1 - state.deathT / 1.8);
            const a = k * Math.PI * 0.98;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.arc(p.x, p.y, R, -Math.PI / 2 + a, -Math.PI / 2 - a + Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            return;
        }
        const open = p.moving || !state.running ? Math.abs(Math.sin(p.mouth)) * 0.5 + 0.03 : 0.25;
        let ang = 0;
        if (p.dir.x < 0) ang = Math.PI;
        else if (p.dir.y < 0) ang = -Math.PI / 2;
        else if (p.dir.y > 0) ang = Math.PI / 2;
        else if (p.nextDir.x < 0) ang = Math.PI;
        const grad = ctx.createRadialGradient(p.x - 4, p.y - 5, 2, p.x, p.y, R);
        grad.addColorStop(0, '#fff2a0');
        grad.addColorStop(1, COLORS.pacman);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, R, ang + open, ang - open + Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawGhost(g) {
        const r = TILE * 0.44;
        const frightened = g.state === 'frightened';
        const eaten = g.state === 'eaten' || g.state === 'entering';
        const flashing = frightened && state.frightT < 2 && Math.floor(state.animTime * 8) % 2 === 0;
        let body = null;
        if (!eaten) body = frightened ? (flashing ? COLORS.frightenedFlash : COLORS.frightened) : g.color;

        if (body) {
            ctx.save();
            ctx.shadowColor = body; ctx.shadowBlur = 10;
            const grad = ctx.createLinearGradient(0, g.y - r, 0, g.y + r);
            grad.addColorStop(0, body);
            grad.addColorStop(1, shade(body, -0.35));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(g.x, g.y - 2, r, Math.PI, 0, false);
            const baseY = g.y + r - 2;
            const phase = Math.floor(state.animTime * 7 + g.wobble) % 2;
            ctx.lineTo(g.x + r, baseY);
            for (let i = 0; i < 6; i++) {
                const x = g.x + r - (i + 1) * (r * 2 / 6);
                const up = (i + phase) % 2 === 0;
                ctx.lineTo(x + r / 6 * 0, up ? baseY - 5 : baseY);
            }
            ctx.lineTo(g.x - r, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        if (frightened && body) {
            ctx.fillStyle = flashing ? '#ff2e63' : '#ffe6b3';
            ctx.fillRect(g.x - 7, g.y - 5, 4, 4);
            ctx.fillRect(g.x + 3, g.y - 5, 4, 4);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(g.x - 9, g.y + 6);
            for (let i = 0; i < 6; i++) ctx.lineTo(g.x - 9 + (i + 1) * 3, g.y + (i % 2 === 0 ? 3 : 6));
            ctx.stroke();
        } else {
            const ex = 5.5, ey = -3, eyeR = 4.6;
            let px = 0, py = 0;
            const d = g.dir.x || g.dir.y ? g.dir : ZERO;
            px = d.x * 2; py = d.y * 2;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(g.x - ex, g.y + ey, eyeR, eyeR * 1.15, 0, 0, Math.PI * 2);
            ctx.ellipse(g.x + ex, g.y + ey, eyeR, eyeR * 1.15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#10205a';
            ctx.beginPath();
            ctx.arc(g.x - ex + px, g.y + ey + py, 2.3, 0, Math.PI * 2);
            ctx.arc(g.x + ex + px, g.y + ey + py, 2.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
        return `rgb(${f(r)},${f(g)},${f(b)})`;
    }

    // ---------- Loop ----------
    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        state.animTime += dt;
        if (state.running && !state.paused && !state.gameover) {
            step(dt);
            updateHud();
        } else if (!state.running && state.pacman) {
            state.pacman.mouth += dt * 8;   // idle chomp on title screen
        }
        render();
        requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    function setDir(x, y) {
        if (!state.pacman) return;
        state.pacman.nextDir = { x, y };
    }
    function startGame() {
        ui.oTitle.classList.add('hidden');
        ui.oOver.classList.add('hidden');
        ui.oPause.classList.add('hidden');
        state.paused = false;
        newGame();
        state.running = true;
        last = performance.now();
        blip(880, 0.1, 'square');
    }
    document.addEventListener('keydown', (e) => {
        const k = e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
        if (!state.running && !state.gameover && (k === 'Enter' || k === ' ')) { startGame(); return; }
        if (state.gameover && (k === 'Enter' || k === ' ')) { startGame(); return; }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') setDir(0, -1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') setDir(0, 1);
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') setDir(-1, 0);
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') setDir(1, 0);
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') startGame();
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const act = (e) => {
            e.preventDefault();
            if (a === 'up') setDir(0, -1);
            else if (a === 'down') setDir(0, 1);
            else if (a === 'left') setDir(-1, 0);
            else if (a === 'right') setDir(1, 0);
            else if (a === 'pause') togglePause();
        };
        b.addEventListener('touchstart', act, { passive: false });
        b.addEventListener('mousedown', act);
    });

    // Swipe
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
        if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
        else setDir(0, dy > 0 ? 1 : -1);
    }, { passive: false });

    function togglePause() {
        if (!state.running || state.gameover) return;
        state.paused = !state.paused;
        ui.oPause.classList.toggle('hidden', !state.paused);
        if (!state.paused) last = performance.now();
    }

    ui.btnPlay.addEventListener('click', startGame);
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', startGame);

    // ---------- Boot ----------
    loadHS();
    renderHS();
    buildMaze();
    state.pacman = spawnPacman();
    state.ghosts = spawnGhosts();
    state.running = false;
    requestAnimationFrame(loop);

    // Test hook (harmless in production)
    window.__pellet = { state, advance, pacDecide, tileOf };
})();
