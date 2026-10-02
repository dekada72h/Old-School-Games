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
        discs: [],
        buffered: null,
        particles: [],
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
        state.buffered = null;
        state.particles = [];
        state.discs = [{ r: 2, c: -1, used: false }, { r: 3, c: 4, used: false }];
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
        if (!state.running || state.paused) return;
        if (state.deathT > 0 || state.player.falling || state.winT > 0 || state.player.ride) return;
        // Buffer one input while mid-jump so the controls feel responsive
        if (state.player.jumpT > 0) { state.buffered = { dr, dc }; return; }
        const newR = state.player.r + dr;
        const newC = state.player.c + dc;
        // Escape disc?
        const disc = state.discs.find(d => !d.used && d.r === newR && d.c === newC);
        if (disc) {
            const np = tilePos(newR, newC);
            state.player.fromX = state.player.x;
            state.player.fromY = state.player.y;
            state.player.toX = np.x;
            state.player.toY = np.y - 8;
            state.player.jumpT = 0.32;
            state.player.disc = disc;
            blip(990, 0.08, 'triangle');
            return;
        }
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

        // Disc ride
        if (state.player.ride) {
            const rd = state.player.ride;
            rd.t += dt / 1.1;
            const k = Math.min(1, rd.t);
            const top = tilePos(0, 0);
            state.player.x = rd.fromX + (top.x - rd.fromX) * k;
            state.player.y = rd.fromY + (top.y - 8 - rd.fromY) * k - Math.sin(k * Math.PI) * 40;
            if (k >= 1) {
                state.player.ride = null;
                state.player.r = 0; state.player.c = 0;
                state.player.x = top.x; state.player.y = top.y - 8;
                state.snakeSpawnT = Math.max(state.snakeSpawnT, 3);
                blip(880, 0.1, 'triangle');
            }
            return;
        }

        // Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.age += dt;
            if (p.age >= p.life) { state.particles.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
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
                } else if (state.player.disc) {
                    // Land on the disc and ride it back to the top
                    const d = state.player.disc;
                    d.used = true;
                    state.player.disc = null;
                    state.player.ride = { t: 0, fromX: state.player.x, fromY: state.player.y };
                    // Snakes fall off when the disc lifts you away
                    for (const sn of state.snakes) {
                        state.score += 500;
                        for (let q = 0; q < 14; q++) state.particles.push({ x: sn.x, y: sn.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.7) * 260, age: 0, life: 0.7, color: COLORS.snake });
                    }
                    if (state.snakes.length) blip(1320, 0.2, 'square');
                    state.snakes = [];
                    updateHud();
                } else {
                    landOnCube();
                    if (state.buffered) { const b = state.buffered; state.buffered = null; jumpDir(b.dr, b.dc); }
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
        state.buffered = null;
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
    let bgGrad = null;
    const bgStars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 137) % W, y: (i * 79) % H, a: 0.2 + (i % 4) * 0.12 }));

    function render() {
        if (!bgGrad) {
            bgGrad = ctx.createLinearGradient(0, 0, 0, H);
            bgGrad.addColorStop(0, '#0d0828');
            bgGrad.addColorStop(1, '#030108');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
        for (const st of bgStars) {
            ctx.globalAlpha = st.a * (0.7 + 0.3 * Math.sin(state.animTime * 2 + st.x));
            ctx.fillStyle = '#fff';
            ctx.fillRect(st.x, st.y, 1.5, 1.5);
        }
        ctx.globalAlpha = 1;

        // Discs (behind cubes)
        for (const d of state.discs) if (!d.used) drawDisc(d);

        // Draw cubes back-to-front (top row first)
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c <= r; c++) {
                drawCube(r, c, state.cubes[r][c]);
            }
        }

        const snakesSorted = [...state.snakes].sort((a, b) => a.r - b.r);
        for (const s of snakesSorted) {
            if (state.player.r >= s.r) continue;
            drawSnake(s);
        }
        drawPlayer();
        for (const s of snakesSorted) {
            if (state.player.r < s.r) continue;
            drawSnake(s);
        }

        for (const p of state.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        }
        ctx.globalAlpha = 1;

        // Death text
        if (state.deathT > 0) {
            ctx.fillStyle = '#ff2e63';
            ctx.font = "bold 16px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
            ctx.fillText(state.deathReason, W / 2, H - 30);
            ctx.shadowBlur = 0;
        }

        for (let i = 0; i < state.lives - 1; i++) drawPlayerIcon(20 + i * 26, H - 24);

        if (state.winT > 0) {
            const a = Math.sin(state.animTime * 12) * 0.3 + 0.4;
            ctx.fillStyle = `rgba(255, 138, 60, ${a * (state.winT / 1.5)})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    function drawDisc(d) {
        const p = tilePos(d.r, d.c);
        const x = p.x, y = p.y + 4;
        const spin = state.animTime * 4;
        ctx.save();
        ctx.translate(x, y);
        ctx.shadowColor = '#ff66cc'; ctx.shadowBlur = 14;
        for (let i = 0; i < 6; i++) {
            const a0 = spin + (i / 6) * Math.PI * 2, a1 = spin + ((i + 1) / 6) * Math.PI * 2;
            ctx.fillStyle = `hsl(${(i * 60 + state.animTime * 120) % 360},90%,60%)`;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.ellipse(0, 0, 20, 9, 0, a0, a1);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function shadeHex(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
        return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }

    function drawCube(r, c, cube) {
        const p = tilePos(r, c);
        const x = p.x, y = p.y;
        const topColor = cube.state === 0 ? COLORS.cubeTop1 :
                          cube.state === 1 ? COLORS.cubeTop2 :
                          COLORS.cubeTop3;
        // Left face
        let g = ctx.createLinearGradient(x - TILE_W / 2, y, x, y + 40);
        g.addColorStop(0, shadeHex(COLORS.cubeLeft, 0.1)); g.addColorStop(1, shadeHex(COLORS.cubeLeft, -0.3));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - TILE_W / 2, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x, y + 14 + 26);
        ctx.lineTo(x - TILE_W / 2, y + 26);
        ctx.closePath();
        ctx.fill();
        // Right face
        g = ctx.createLinearGradient(x + TILE_W / 2, y, x, y + 40);
        g.addColorStop(0, shadeHex(COLORS.cubeRight, 0.05)); g.addColorStop(1, shadeHex(COLORS.cubeRight, -0.4));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x + TILE_W / 2, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x, y + 14 + 26);
        ctx.lineTo(x + TILE_W / 2, y + 26);
        ctx.closePath();
        ctx.fill();
        // Top face
        g = ctx.createLinearGradient(x, y - 14, x, y + 14);
        g.addColorStop(0, shadeHex(topColor, 0.35)); g.addColorStop(1, topColor);
        ctx.fillStyle = g;
        if (cube.state > 0) { ctx.shadowColor = topColor; ctx.shadowBlur = 8; }
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x + TILE_W / 2, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x - TILE_W / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(10,6,23,0.85)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // edges
        ctx.beginPath();
        ctx.moveTo(x - TILE_W / 2, y); ctx.lineTo(x - TILE_W / 2, y + 26); ctx.lineTo(x, y + 40); ctx.lineTo(x + TILE_W / 2, y + 26); ctx.lineTo(x + TILE_W / 2, y);
        ctx.moveTo(x, y + 14); ctx.lineTo(x, y + 40);
        ctx.stroke();
        // top-edge highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.moveTo(x - TILE_W / 2, y); ctx.lineTo(x, y - 14); ctx.lineTo(x + TILE_W / 2, y); ctx.stroke();
    }

    function shadowAt(x, y, r) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }

    function drawPlayer() {
        const p = state.player;
        if (state.deathT > 0 && !p.falling) ctx.globalAlpha = Math.max(0.2, state.deathT);
        // ground shadow on the cube top when standing
        if (!p.falling && p.jumpT <= 0 && !p.ride) shadowAt(p.x, p.y + 8, 13);
        ctx.save();
        ctx.shadowColor = COLORS.player; ctx.shadowBlur = 12;
        const g = ctx.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, 16);
        g.addColorStop(0, '#ffc08a'); g.addColorStop(1, COLORS.playerDark);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // feet
        ctx.fillStyle = '#7a2e0a';
        ctx.fillRect(p.x - 9, p.y + 11, 6, 4); ctx.fillRect(p.x + 3, p.y + 11, 6, 4);
        // snout
        ctx.fillStyle = COLORS.player;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 5, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a2e0a';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
        // eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(p.x - 5, p.y - 5, 4, 5, 0, 0, 7); ctx.ellipse(p.x + 5, p.y - 5, 4, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#0a0617';
        ctx.beginPath(); ctx.arc(p.x - 4, p.y - 4, 2, 0, 7); ctx.arc(p.x + 6, p.y - 4, 2, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawPlayerIcon(x, y) {
        ctx.fillStyle = COLORS.player;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x - 3, y - 2, 2, 0, 7); ctx.arc(x + 3, y - 2, 2, 0, 7); ctx.fill();
        ctx.fillStyle = COLORS.playerDark;
        ctx.fillRect(x - 3, y + 2, 6, 3);
    }

    function drawSnake(s) {
        if (s.jumpT <= 0) shadowAt(s.x, s.y + 8, 12);
        const bob = Math.sin(state.animTime * 8) * 1.5;
        ctx.save();
        ctx.shadowColor = COLORS.snake; ctx.shadowBlur = 12;
        const g = ctx.createRadialGradient(s.x - 5, s.y - 6 + bob, 2, s.x, s.y + bob, 16);
        g.addColorStop(0, '#ffb3e6'); g.addColorStop(1, COLORS.snakeDark);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y + bob, 14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // coils
        ctx.strokeStyle = 'rgba(60,20,110,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y + bob + 4, 10, 0.2, Math.PI - 0.2); ctx.stroke();
        // eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(s.x - 5, s.y - 5 + bob, 4, 4.5, 0, 0, 7); ctx.ellipse(s.x + 5, s.y - 5 + bob, 4, 4.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff2e63';
        ctx.beginPath(); ctx.arc(s.x - 4, s.y - 4 + bob, 2, 0, 7); ctx.arc(s.x + 6, s.y - 4 + bob, 2, 0, 7); ctx.fill();
        // angry brow
        ctx.strokeStyle = '#2a0a4a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x - 9, s.y - 11 + bob); ctx.lineTo(s.x - 2, s.y - 8 + bob); ctx.moveTo(s.x + 9, s.y - 11 + bob); ctx.lineTo(s.x + 2, s.y - 8 + bob); ctx.stroke();
        // crown spike
        ctx.fillStyle = COLORS.snakeDark;
        ctx.beginPath(); ctx.moveTo(s.x - 5, s.y - 12 + bob); ctx.lineTo(s.x, s.y - 20 + bob); ctx.lineTo(s.x + 5, s.y - 12 + bob); ctx.closePath(); ctx.fill();
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

    // ---------- Input ----------
    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') jumpDir(-1, 0);          // up-right
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') jumpDir(-1, -1);  // up-left
        else if (k === 'ArrowDown' || k === 's' || k === 'S') jumpDir(1, 0);    // down-left
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') jumpDir(1, 1);   // down-right
        else if (k === 'q' || k === 'Q' || k === '7') jumpDir(-1, -1);
        else if (k === 'e' || k === 'E' || k === '9') jumpDir(-1, 0);
        else if (k === 'z' || k === 'Z' || k === '1') jumpDir(1, 0);
        else if (k === 'c' || k === 'C' || k === '3') jumpDir(1, 1);
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
        ui.oTitle.classList.add('hidden');
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
