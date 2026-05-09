/* ================================================================
   CUBE HOP — fan tribute inspired by Q*bert
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), lives: $('lives'), level: $('level'), best: $('best'),
        hsScore: $('hs-score'), hsLevel: $('hs-level'),
        finalScore: $('final-score'),
        levelTitle: $('level-title'), levelTag: $('level-tag'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'),
        oLevel: $('overlay-level'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    // ---------- Pyramid ----------
    const ROWS = 7;
    const TILE_W = 60;     // half-width of cube top
    const TILE_H = 50;     // vertical step between rows
    const TOP_X = W / 2;
    const TOP_Y = 80;

    const COLORS = {
        bg: '#050208',
        cubeTop1: '#5fd0ff',
        cubeTop2: '#ffd06b',
        cubeTop3: '#ff8a3c',
        cubeLeft: '#9b6bff',
        cubeRight: '#6644cc',
        cubeOutline: '#0a0617',
        player: '#ff8a3c',
        playerDark: '#c9531c',
        snake: '#ff66cc',
        snakeDark: '#9b6bff'
    };

    // ---------- State ----------
    const state = {
        running: false, paused: false, gameover: false,
        score: 0, lives: 3, level: 1,
        bestScore: 0, bestLevel: 0,
        cubes: [],            // Array of arrays — cubes[r][c] = { state: 0/1/2 }
        targetState: 1,       // For level 1 = 1 hop. Higher levels = 2 hops.
        cubesNeeded: 2,       // visits per cube
        player: null,
        snakes: [],
        snakeSpawnT: 4,
        animTime: 0,
        deathT: 0,
        deathReason: '',
        winT: 0
    };

    const KEY = 'osg.cube-hop.hs';
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

    // ---------- Math ----------
    function tilePos(r, c) {
        const x = TOP_X + (c - r / 2) * TILE_W;
        const y = TOP_Y + r * TILE_H;
        return { x, y };
    }

    function isValidTile(r, c) {
        return r >= 0 && r < ROWS && c >= 0 && c <= r;
    }

    // ---------- Setup ----------
    function buildPyramid() {
        state.cubes = [];
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            for (let c = 0; c <= r; c++) {
                row.push({ state: 0 });
            }
            state.cubes.push(row);
        }
    }

    function newLevel() {
        buildPyramid();
        state.targetState = state.level <= 2 ? 1 : 2;
        state.player = {
            r: 0, c: 0,
            x: tilePos(0, 0).x,
            y: tilePos(0, 0).y - 8,
            jumpT: 0, fromX: 0, fromY: 0, toX: 0, toY: 0,
            falling: false, fallY: 0
        };
        state.snakes = [];
        state.snakeSpawnT = Math.max(2, 6 - state.level * 0.5);
        state.winT = 0;
        ui.levelTitle.textContent = `LEVEL ${state.level}`;
        ui.levelTag.textContent = state.level === 1 ? 'Flip them all.' :
            (state.targetState === 2 ? 'Two hops per cube now!' : 'Faster snakes.');
        ui.oLevel.classList.remove('hidden');
        setTimeout(() => ui.oLevel.classList.add('hidden'), 1300);
        updateHud();
    }

    function newGame() {
        state.runId = (state.runId || 0) + 1;
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
    }

    // ---------- Movement ----------
    function jumpDir(dr, dc) {
        if (state.player.jumpT > 0 || state.deathT > 0 || state.player.falling || state.winT > 0) return;
        const newR = state.player.r + dr;
        const newC = state.player.c + dc;
        // Off-pyramid?
        if (!isValidTile(newR, newC)) {
            // Jump and fall off
            state.player.falling = true;
            state.player.fromX = state.player.x;
            state.player.fromY = state.player.y;
            // Pretend target is where they'd have landed
            const fakeX = TOP_X + (newC - newR / 2) * TILE_W;
            const fakeY = TOP_Y + newR * TILE_H - 8;
            state.player.toX = fakeX;
            state.player.toY = fakeY;
            state.player.jumpT = 0.4;
            blip(220, 0.4, 'sawtooth');
            return;
        }
        const np = tilePos(newR, newC);
        state.player.fromX = state.player.x;
        state.player.fromY = state.player.y;
        state.player.r = newR;
        state.player.c = newC;
        state.player.toX = np.x;
        state.player.toY = np.y - 8;
        state.player.jumpT = 0.32;
        blip(660, 0.05, 'square');
    }

    function landOnCube() {
        const cube = state.cubes[state.player.r][state.player.c];
        if (cube.state < state.targetState) {
            cube.state++;
            state.score += 25;
            updateHud();
            if (allCubesFlipped()) {
                state.score += 1000 + state.lives * 100;
                state.winT = 1.5;
                bump();
                const runId = state.runId;
                for (let i = 0; i < 8; i++) setTimeout(() => {
                    if (state.runId !== runId) return;
                    blip(440 + i * 80, 0.1, 'square');
                }, i * 60);
            }
        }
    }

    function allCubesFlipped() {
        for (const row of state.cubes) {
            for (const cube of row) {
                if (cube.state < state.targetState) return false;
            }
        }
        return true;
    }

    // ---------- Snake AI ----------
    function spawnSnake() {
        // Spawn at top of pyramid
        state.snakes.push({
            r: 0, c: 0,
            x: tilePos(0, 0).x,
            y: tilePos(0, 0).y - 8,
            jumpT: 0, fromX: 0, fromY: 0, toX: 0, toY: 0,
            falling: false,
            actT: 0.6,
            type: 'coily'
        });
    }

    function snakeAct(s) {
        if (state.player.falling || state.deathT > 0) return;
        const dr = state.player.r - s.r;
        const dc = state.player.c - s.c;
        const opts = [];
        // Snake can move in 4 diagonals
        if (isValidTile(s.r + 1, s.c)) opts.push({ dr: 1, dc: 0 });
        if (isValidTile(s.r + 1, s.c + 1)) opts.push({ dr: 1, dc: 1 });
        if (isValidTile(s.r - 1, s.c - 1)) opts.push({ dr: -1, dc: -1 });
        if (isValidTile(s.r - 1, s.c)) opts.push({ dr: -1, dc: 0 });
        if (opts.length === 0) return;
        // Pick option that minimizes Manhattan distance to player
        opts.sort((a, b) => {
            const da = Math.abs(s.r + a.dr - state.player.r) + Math.abs(s.c + a.dc - state.player.c);
            const db = Math.abs(s.r + b.dr - state.player.r) + Math.abs(s.c + b.dc - state.player.c);
            return da - db;
        });
        const choice = opts[0];
        s.fromX = s.x; s.fromY = s.y;
        s.r += choice.dr;
        s.c += choice.dc;
        const np = tilePos(s.r, s.c);
        s.toX = np.x; s.toY = np.y - 8;
        s.jumpT = 0.4;
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;

        if (state.deathT > 0) {
            state.deathT -= dt;
            if (state.deathT <= 0) onDeathDone();
            return;
        }

        if (state.winT > 0) {
            state.winT -= dt;
            if (state.winT <= 0) {
                state.level++;
                bump();
                newLevel();
            }
            return;
        }

        // Player jump animation
        if (state.player.jumpT > 0) {
            state.player.jumpT -= dt;
            const tot = state.player.falling ? 0.4 : 0.32;
            const k = Math.max(0, 1 - state.player.jumpT / tot);
            state.player.x = state.player.fromX + (state.player.toX - state.player.fromX) * k;
            const eased = k - 0.5;
            const arc = -1 * (1 - 4 * eased * eased) * 30; // arc up
            state.player.y = state.player.fromY + (state.player.toY - state.player.fromY) * k + arc;
            if (state.player.jumpT <= 0) {
                state.player.x = state.player.toX;
                state.player.y = state.player.toY;
                if (state.player.falling) {
                    // Continue falling off-screen
                    state.player.fallY = 0;
                } else {
                    landOnCube();
                }
            }
        } else if (state.player.falling) {
            state.player.fallY += 600 * dt;
            state.player.y += 600 * dt;
            if (state.player.y > H + 30) die('Fell off');
        }

        // Snakes
        state.snakeSpawnT -= dt;
        if (state.snakeSpawnT <= 0 && state.snakes.length < 1 + Math.floor(state.level / 2)) {
            spawnSnake();
            state.snakeSpawnT = 8 + Math.random() * 4;
        }
        for (const s of state.snakes) {
            if (s.jumpT > 0) {
                s.jumpT -= dt;
                const tot = 0.4;
                const k = Math.max(0, 1 - s.jumpT / tot);
                s.x = s.fromX + (s.toX - s.fromX) * k;
                const eased = k - 0.5;
                const arc = -1 * (1 - 4 * eased * eased) * 26;
                s.y = s.fromY + (s.toY - s.fromY) * k + arc;
                if (s.jumpT <= 0) { s.x = s.toX; s.y = s.toY; }
            } else {
                s.actT -= dt;
                if (s.actT <= 0) {
                    s.actT = Math.max(0.3, 0.7 - state.level * 0.05);
                    snakeAct(s);
                }
            }
            // Player collision
            if (!state.player.falling &&
                Math.hypot(s.x - state.player.x, s.y - state.player.y) < 22) {
                die('Bitten!');
                return;
            }
        }
    }

    function die(reason) {
        if (state.deathT > 0) return;
        state.deathT = 1.0;
        state.deathReason = reason;
        const runId = state.runId;
        for (let i = 0; i < 4; i++) setTimeout(() => {
            if (state.runId !== runId) return;
            blip(220 - i * 30, 0.15, 'sawtooth');
        }, i * 80);
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
            state.player = {
                r: 0, c: 0,
                x: tilePos(0, 0).x, y: tilePos(0, 0).y - 8,
                jumpT: 0, fromX: 0, fromY: 0, toX: 0, toY: 0,
                falling: false, fallY: 0
            };
            state.snakes = [];
            state.snakeSpawnT = 4;
        }
        updateHud();
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Stars
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let i = 0; i < 40; i++) {
            const x = (i * 137) % W;
            const y = (i * 79) % H;
            ctx.fillRect(x, y, 1, 1);
        }

        // Draw cubes back-to-front (top row first)
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c <= r; c++) {
                drawCube(r, c, state.cubes[r][c]);
            }
        }

        // Snakes (sort by row to draw back-to-front)
        const snakesSorted = [...state.snakes].sort((a, b) => a.r - b.r);
        for (const s of snakesSorted) {
            // Only draw snakes ahead of player based on row
            if (state.player.r >= s.r) continue;
            drawSnake(s);
        }

        // Player
        drawPlayer();

        // Snakes after player (in front)
        for (const s of snakesSorted) {
            if (state.player.r < s.r) continue;
            drawSnake(s);
        }

        // Death text
        if (state.deathT > 0) {
            ctx.fillStyle = '#ff2e63';
            ctx.font = "bold 16px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(state.deathReason, W / 2, H - 30);
        }

        // Lives icons
        for (let i = 0; i < state.lives - 1; i++) {
            drawPlayerIcon(20 + i * 26, H - 24);
        }

        // Win flash
        if (state.winT > 0) {
            const a = Math.sin(state.animTime * 12) * 0.3 + 0.4;
            ctx.fillStyle = `rgba(255, 138, 60, ${a * (state.winT / 1.5)})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    function drawCube(r, c, cube) {
        const p = tilePos(r, c);
        const x = p.x, y = p.y;
        // Top face (diamond)
        const topColor = cube.state === 0 ? COLORS.cubeTop1 :
                          cube.state === 1 ? COLORS.cubeTop2 :
                          COLORS.cubeTop3;
        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x + TILE_W / 2, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x - TILE_W / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = COLORS.cubeOutline;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Left face
        ctx.fillStyle = COLORS.cubeLeft;
        ctx.beginPath();
        ctx.moveTo(x - TILE_W / 2, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x, y + 14 + 26);
        ctx.lineTo(x - TILE_W / 2, y + 26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right face
        ctx.fillStyle = COLORS.cubeRight;
        ctx.beginPath();
        ctx.moveTo(x + TILE_W / 2, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x, y + 14 + 26);
        ctx.lineTo(x + TILE_W / 2, y + 26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    function drawPlayer() {
        const p = state.player;
        // Body
        ctx.fillStyle = COLORS.player;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.playerDark;
        ctx.beginPath();
        ctx.arc(p.x, p.y + 4, 14, 0, Math.PI);
        ctx.fill();
        // Snout
        ctx.fillStyle = COLORS.player;
        ctx.fillRect(p.x - 4, p.y + 2, 8, 6);
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x - 7, p.y - 6, 5, 4);
        ctx.fillRect(p.x + 2, p.y - 6, 5, 4);
        ctx.fillStyle = '#0a0617';
        ctx.fillRect(p.x - 5, p.y - 5, 2, 2);
        ctx.fillRect(p.x + 4, p.y - 5, 2, 2);
    }

    function drawPlayerIcon(x, y) {
        ctx.fillStyle = COLORS.player;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 3, y - 3, 2, 2);
        ctx.fillRect(x + 1, y - 3, 2, 2);
    }

    function drawSnake(s) {
        // Body (sphere)
        ctx.fillStyle = COLORS.snake;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.snakeDark;
        ctx.beginPath();
        ctx.arc(s.x, s.y + 4, 14, 0, Math.PI);
        ctx.fill();
        // Eyes (angry)
        ctx.fillStyle = '#fff';
        ctx.fillRect(s.x - 7, s.y - 6, 5, 4);
        ctx.fillRect(s.x + 2, s.y - 6, 5, 4);
        ctx.fillStyle = '#ff2e63';
        ctx.fillRect(s.x - 5, s.y - 5, 2, 2);
        ctx.fillRect(s.x + 4, s.y - 5, 2, 2);
        // Crown spike
        ctx.fillStyle = COLORS.snakeDark;
        ctx.beginPath();
        ctx.moveTo(s.x - 4, s.y - 12);
        ctx.lineTo(s.x, s.y - 18);
        ctx.lineTo(s.x + 4, s.y - 12);
        ctx.closePath();
        ctx.fill();
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover) step(dt);
        render();
        requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') jumpDir(-1, 0);          // up-right
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') jumpDir(-1, -1);  // up-left
        else if (k === 'ArrowDown' || k === 's' || k === 'S') jumpDir(1, 0);    // down-left
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') jumpDir(1, 1);   // down-right
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        b.addEventListener('touchstart', (e) => { e.preventDefault();
            if (a === 'ur') jumpDir(-1, 0);
            else if (a === 'ul') jumpDir(-1, -1);
            else if (a === 'dl') jumpDir(1, 0);
            else if (a === 'dr') jumpDir(1, 1);
            else if (a === 'pause') togglePause();
        }, { passive: false });
        b.addEventListener('mousedown', () => {
            if (a === 'ur') jumpDir(-1, 0);
            else if (a === 'ul') jumpDir(-1, -1);
            else if (a === 'dl') jumpDir(1, 0);
            else if (a === 'dr') jumpDir(1, 1);
            else if (a === 'pause') togglePause();
        });
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
    buildPyramid();
    state.player = { r: 0, c: 0, x: tilePos(0,0).x, y: tilePos(0,0).y - 8, jumpT: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, falling: false, fallY: 0 };
    state.running = false;
    requestAnimationFrame(loop);
})();
