/* ================================================================
   STAR DEFENDER — modern Space Invaders remake
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'),
        lives: $('lives'),
        wave: $('wave'),
        best: $('best'),
        hsScore: $('hs-score'),
        hsWave: $('hs-wave'),
        finalScore: $('final-score'),
        waveTitle: $('wave-title'),
        waveTag: $('wave-tag'),
        oTitle: $('overlay-title'),
        oPause: $('overlay-pause'),
        oWave: $('overlay-wave'),
        oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'),
        btnResume: $('btn-resume'),
        btnRetry: $('btn-retry')
    };

    const COLORS = {
        bg: '#050208',
        player: '#5fd0ff',
        playerBullet: '#ffffff',
        enemyBullet: '#ff2e63',
        ufo: '#ff2e63',
        e1: '#ff66cc',
        e2: '#5fd0ff',
        e3: '#36e3a4',
        bunker: '#36e3a4',
        star: 'rgba(255,255,255,0.5)'
    };

    // 8x8 sprite bitmaps
    const SPR = {
        e1: [
            [0,0,1,0,0,0,1,0],
            [0,0,0,1,1,1,0,0],
            [0,0,1,1,1,1,1,0],
            [0,1,1,0,1,1,0,1],
            [0,1,1,1,1,1,1,1],
            [0,0,1,0,0,1,0,0],
            [0,1,0,1,1,0,1,0],
            [1,0,1,0,0,1,0,1]
        ],
        e1b: [
            [0,0,1,0,0,0,1,0],
            [1,0,0,1,1,1,0,1],
            [1,0,1,1,1,1,1,1],
            [1,1,1,0,1,1,0,1],
            [1,1,1,1,1,1,1,1],
            [0,0,1,0,0,1,0,0],
            [0,0,1,0,0,1,0,0],
            [0,0,1,0,0,1,0,0]
        ],
        e2: [
            [0,0,0,1,1,0,0,0],
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,0,1,1,0,1,0],
            [1,0,0,0,0,0,0,1],
            [0,1,0,0,0,0,1,0]
        ],
        e2b: [
            [0,0,0,1,1,0,0,0],
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1],
            [1,0,1,0,0,1,0,1],
            [0,1,0,0,0,0,1,0],
            [1,0,0,0,0,0,0,1]
        ],
        e3: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,1,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1],
            [0,0,1,0,0,1,0,0],
            [0,1,0,1,1,0,1,0],
            [1,0,1,0,0,1,0,1]
        ],
        e3b: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,1,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,0,0,0,0,1,0],
            [1,0,0,0,0,0,0,1],
            [0,1,0,0,0,0,1,0]
        ],
        ufo: [
            [0,0,0,1,1,1,1,1,1,0,0,0],
            [0,1,1,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,0,1,1,0,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1],
            [0,0,1,0,0,1,1,0,0,1,0,0]
        ],
        player: [
            [0,0,0,0,0,1,0,0,0,0,0],
            [0,0,0,0,1,1,1,0,0,0,0],
            [0,0,0,0,1,1,1,0,0,0,0],
            [1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1]
        ]
    };

    // ---------- State ----------
    const state = {
        running: false,
        paused: false,
        gameover: false,
        score: 0,
        lives: 3,
        wave: 1,
        bestScore: 0,
        bestWave: 0,

        player: { x: W / 2, y: H - 50, w: 44, h: 24, vx: 0, alive: true, deathT: 0 },
        playerBullets: [],
        invaders: [],
        invaderBullets: [],
        bunkers: [],
        ufo: null,
        particles: [],
        stars: [],

        moveDir: 1,
        moveTimer: 0,
        moveInterval: 0.5,
        spriteFrame: 0,
        descend: 0,
        ufoTimer: 0,
        shake: 0,
        animTime: 0,
        keyL: false, keyR: false, keyFire: false,
        fireCooldown: 0,
        respawnTimer: 0
    };

    // ---------- Storage ----------
    const KEY = 'osg.star-defender.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) { const o = JSON.parse(r); state.bestScore = o.score || 0; state.bestWave = o.wave || 0; }
        } catch {}
    }
    function saveHS() { try { localStorage.setItem(KEY, JSON.stringify({ score: state.bestScore, wave: state.bestWave })); } catch {} }
    function bump() {
        let d = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; d = true; }
        if (state.wave > state.bestWave) { state.bestWave = state.wave; d = true; }
        if (d) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsWave.textContent = state.bestWave;
    }

    // ---------- Audio ----------
    let audio = null;
    function blip(freq, dur = 0.05, type = 'square', vol = 0.05) {
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

    // ---------- Setup ----------
    function spawnStars() {
        state.stars = [];
        for (let i = 0; i < 90; i++) {
            state.stars.push({
                x: Math.random() * W,
                y: Math.random() * H,
                sp: 8 + Math.random() * 22,
                z: Math.random()
            });
        }
    }

    function spawnInvaders() {
        state.invaders = [];
        const cols = 11;
        const rows = 5;
        const startX = 60;
        const startY = 70 + Math.min(40, (state.wave - 1) * 8);
        const stepX = 40;
        const stepY = 36;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const type = r === 0 ? 1 : (r < 3 ? 2 : 3);
                const points = type === 1 ? 30 : (type === 2 ? 20 : 10);
                state.invaders.push({
                    x: startX + c * stepX,
                    y: startY + r * stepY,
                    w: type === 1 ? 22 : (type === 2 ? 26 : 30),
                    h: 22,
                    type, points,
                    alive: true,
                    col: c, row: r
                });
            }
        }
    }

    function spawnBunkers() {
        state.bunkers = [];
        // 4 bunkers, each 8x6 grid of pixels
        const bunkerCount = 4;
        const bunkerW = 60;
        const spacing = (W - bunkerCount * bunkerW) / (bunkerCount + 1);
        for (let b = 0; b < bunkerCount; b++) {
            const baseX = spacing + b * (bunkerW + spacing);
            const baseY = H - 130;
            const grid = [];
            const gridW = 12;
            const gridH = 8;
            const px = bunkerW / gridW;
            for (let y = 0; y < gridH; y++) {
                grid.push([]);
                for (let x = 0; x < gridW; x++) {
                    let on = 1;
                    // Notch the inner-bottom for player to peek through
                    if (y >= 5 && x >= 4 && x <= 7) on = 0;
                    // Round outer corners
                    if ((x === 0 || x === gridW - 1) && y === 0) on = 0;
                    if ((x === 0) && y === 1) on = 0;
                    if ((x === gridW - 1) && y === 1) on = 0;
                    grid[y].push(on);
                }
            }
            state.bunkers.push({ x: baseX, y: baseY, px, grid, gridW, gridH });
        }
    }

    function resetGame() {
        state.score = 0;
        state.lives = 3;
        state.wave = 1;
        state.gameover = false;
        state.player = { x: W / 2, y: H - 50, w: 44, h: 24, alive: true, deathT: 0 };
        state.playerBullets = [];
        state.invaderBullets = [];
        state.particles = [];
        state.ufo = null;
        state.ufoTimer = 8 + Math.random() * 10;
        state.moveInterval = 0.6;
        spawnInvaders();
        spawnBunkers();
        spawnStars();
        updateHud();
    }

    function startWave() {
        spawnInvaders();
        state.invaderBullets = [];
        state.moveInterval = Math.max(0.06, 0.6 - (state.wave - 1) * 0.05);
        ui.waveTitle.textContent = `WAVE ${state.wave}`;
        ui.waveTag.textContent = state.wave === 1 ? 'Incoming...' : 'They\'re back. And meaner.';
        ui.oWave.classList.remove('hidden');
        setTimeout(() => ui.oWave.classList.add('hidden'), 1500);
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.wave.textContent = state.wave;
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;

        // Stars
        for (const s of state.stars) {
            s.y += s.sp * dt;
            if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        }

        // Player
        if (state.player.alive) {
            const moveSpd = 280;
            if (state.keyL) state.player.x -= moveSpd * dt;
            if (state.keyR) state.player.x += moveSpd * dt;
            state.player.x = Math.max(state.player.w / 2 + 10, Math.min(W - state.player.w / 2 - 10, state.player.x));

            state.fireCooldown -= dt;
            if (state.keyFire && state.fireCooldown <= 0 && state.playerBullets.length < 3) {
                state.playerBullets.push({ x: state.player.x, y: state.player.y - 14, vy: -650 });
                state.fireCooldown = 0.25;
                blip(880, 0.06, 'square');
            }
        } else if (state.player.deathT > 0) {
            state.player.deathT -= dt;
            if (state.player.deathT <= 0) {
                if (state.lives > 0) {
                    state.player.alive = true;
                    state.player.x = W / 2;
                } else {
                    gameOver();
                }
            }
        }

        // Player bullets
        for (let i = state.playerBullets.length - 1; i >= 0; i--) {
            const b = state.playerBullets[i];
            b.y += b.vy * dt;
            if (b.y < -10) { state.playerBullets.splice(i, 1); continue; }
            // hit invader
            let hit = false;
            for (const inv of state.invaders) {
                if (!inv.alive) continue;
                if (b.x >= inv.x - inv.w / 2 && b.x <= inv.x + inv.w / 2 &&
                    b.y >= inv.y - inv.h / 2 && b.y <= inv.y + inv.h / 2) {
                    inv.alive = false;
                    state.score += inv.points;
                    spawnExplosion(inv.x, inv.y, COLORS['e' + inv.type], 14);
                    state.playerBullets.splice(i, 1);
                    blip(440 + inv.type * 100, 0.1, 'square');
                    hit = true;
                    break;
                }
            }
            if (hit) continue;

            // hit UFO
            if (state.ufo && b.x >= state.ufo.x - state.ufo.w / 2 && b.x <= state.ufo.x + state.ufo.w / 2 &&
                b.y >= state.ufo.y - state.ufo.h / 2 && b.y <= state.ufo.y + state.ufo.h / 2) {
                const points = [100, 150, 200, 300][Math.floor(Math.random() * 4)];
                state.score += points;
                spawnExplosion(state.ufo.x, state.ufo.y, COLORS.ufo, 24);
                state.ufo = null;
                state.playerBullets.splice(i, 1);
                blip(1200, 0.2, 'square'); blip(1600, 0.15, 'triangle');
                state.shake = 8;
                continue;
            }

            // hit bunker
            if (hitBunker(b.x, b.y)) {
                state.playerBullets.splice(i, 1);
                continue;
            }
        }

        // Invader move
        const aliveInv = state.invaders.filter(i => i.alive);
        const remainingFrac = aliveInv.length / 55;
        const interval = Math.max(0.06, state.moveInterval * (0.2 + remainingFrac * 0.9));
        state.moveTimer += dt;
        if (state.moveTimer >= interval && aliveInv.length > 0) {
            state.moveTimer = 0;
            state.spriteFrame ^= 1;
            let drop = false;
            // Edge check
            for (const inv of aliveInv) {
                if (state.moveDir > 0 && inv.x + inv.w / 2 + 14 > W) { drop = true; break; }
                if (state.moveDir < 0 && inv.x - inv.w / 2 - 14 < 0) { drop = true; break; }
            }
            if (drop) {
                state.moveDir *= -1;
                for (const inv of state.invaders) inv.y += 16;
            } else {
                for (const inv of state.invaders) inv.x += 14 * state.moveDir;
            }
            blip(80 + state.spriteFrame * 30, 0.04, 'sawtooth', 0.04);

            // Reach player?
            for (const inv of aliveInv) {
                if (inv.y + inv.h / 2 >= state.player.y - state.player.h / 2) {
                    gameOver();
                    return;
                }
            }
        }

        // Invader fire
        if (aliveInv.length > 0 && Math.random() < 0.012 + state.wave * 0.002) {
            // pick random column's bottom invader
            const cols = {};
            for (const inv of aliveInv) {
                if (!cols[inv.col] || cols[inv.col].y < inv.y) cols[inv.col] = inv;
            }
            const colKeys = Object.keys(cols);
            const shooter = cols[colKeys[Math.floor(Math.random() * colKeys.length)]];
            if (shooter) {
                state.invaderBullets.push({ x: shooter.x, y: shooter.y + 12, vy: 220 + state.wave * 12 });
            }
        }

        // Invader bullets
        for (let i = state.invaderBullets.length - 1; i >= 0; i--) {
            const b = state.invaderBullets[i];
            b.y += b.vy * dt;
            if (b.y > H + 10) { state.invaderBullets.splice(i, 1); continue; }
            // hit player
            if (state.player.alive &&
                b.x >= state.player.x - state.player.w / 2 && b.x <= state.player.x + state.player.w / 2 &&
                b.y >= state.player.y - state.player.h / 2 && b.y <= state.player.y + state.player.h / 2) {
                state.invaderBullets.splice(i, 1);
                playerHit();
                continue;
            }
            // hit bunker
            if (hitBunker(b.x, b.y)) { state.invaderBullets.splice(i, 1); continue; }
        }

        // UFO
        state.ufoTimer -= dt;
        if (!state.ufo && state.ufoTimer <= 0) {
            state.ufoTimer = 12 + Math.random() * 16;
            const dir = Math.random() < 0.5 ? 1 : -1;
            state.ufo = {
                x: dir === 1 ? -40 : W + 40,
                y: 40,
                w: 36, h: 16,
                vx: dir * 110
            };
        }
        if (state.ufo) {
            state.ufo.x += state.ufo.vx * dt;
            if (state.ufo.x < -50 || state.ufo.x > W + 50) state.ufo = null;
        }

        // Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.age += dt;
            if (p.age >= p.life) { state.particles.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.92;
            p.vy *= 0.92;
        }

        // Wave complete?
        if (aliveInv.length === 0 && state.player.alive) {
            state.wave++;
            bump();
            startWave();
        }

        // Shake decay
        if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    }

    function hitBunker(x, y) {
        for (const bk of state.bunkers) {
            if (x < bk.x || x > bk.x + bk.gridW * bk.px ||
                y < bk.y || y > bk.y + bk.gridH * bk.px) continue;
            const cx = Math.floor((x - bk.x) / bk.px);
            const cy = Math.floor((y - bk.y) / bk.px);
            if (bk.grid[cy] && bk.grid[cy][cx]) {
                // Damage radius
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (Math.random() < 0.4) continue;
                        const nx = cx + dx, ny = cy + dy;
                        if (bk.grid[ny] && bk.grid[ny][nx]) bk.grid[ny][nx] = 0;
                    }
                }
                return true;
            }
        }
        return false;
    }

    function playerHit() {
        state.lives--;
        state.player.alive = false;
        state.player.deathT = 1.2;
        spawnExplosion(state.player.x, state.player.y, COLORS.player, 24);
        state.shake = 14;
        for (let i = 0; i < 4; i++) setTimeout(() => blip(220 - i * 30, 0.15, 'sawtooth'), i * 70);
        bump();
    }

    function spawnExplosion(x, y, color, n = 16) {
        for (let i = 0; i < n; i++) {
            state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 360,
                vy: (Math.random() - 0.5) * 360,
                age: 0,
                life: 0.4 + Math.random() * 0.5,
                color,
                size: 2 + Math.random() * 3
            });
        }
    }

    function gameOver() {
        state.gameover = true;
        state.running = false;
        bump();
        ui.finalScore.textContent = state.score;
        setTimeout(() => ui.oOver.classList.remove('hidden'), 700);
    }

    // ---------- Render ----------
    function drawSprite(spr, x, y, scale, color) {
        ctx.fillStyle = color;
        for (let r = 0; r < spr.length; r++) {
            for (let c = 0; c < spr[r].length; c++) {
                if (spr[r][c]) ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
            }
        }
    }

    function render(dt) {
        ctx.save();
        if (state.shake > 0) {
            ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        }

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Stars
        for (const s of state.stars) {
            ctx.globalAlpha = 0.3 + s.z * 0.7;
            ctx.fillStyle = COLORS.star;
            ctx.fillRect(s.x, s.y, 1 + Math.floor(s.z * 1.5), 1 + Math.floor(s.z * 1.5));
        }
        ctx.globalAlpha = 1;

        // Bunkers
        ctx.fillStyle = COLORS.bunker;
        for (const bk of state.bunkers) {
            for (let y = 0; y < bk.gridH; y++) {
                for (let x = 0; x < bk.gridW; x++) {
                    if (bk.grid[y][x]) ctx.fillRect(bk.x + x * bk.px, bk.y + y * bk.px, bk.px, bk.px);
                }
            }
        }

        // Invaders
        for (const inv of state.invaders) {
            if (!inv.alive) continue;
            const sprName = 'e' + inv.type + (state.spriteFrame ? 'b' : '');
            const spr = SPR[sprName];
            const scale = inv.type === 1 ? 2.6 : (inv.type === 2 ? 3 : 3.4);
            drawSprite(spr, inv.x - (spr[0].length * scale) / 2, inv.y - (spr.length * scale) / 2, scale, COLORS['e' + inv.type]);
        }

        // UFO
        if (state.ufo) drawSprite(SPR.ufo, state.ufo.x - 18, state.ufo.y - 8, 3, COLORS.ufo);

        // Player
        if (state.player.alive) {
            drawSprite(SPR.player, state.player.x - 16, state.player.y - 12, 3, COLORS.player);
        } else if (state.player.deathT > 0) {
            // Glitchy death
            for (let i = 0; i < 6; i++) {
                ctx.fillStyle = i % 2 ? COLORS.player : COLORS.enemyBullet;
                ctx.fillRect(state.player.x - 22 + Math.random() * 44, state.player.y - 12 + Math.random() * 24, 3, 3);
            }
        }

        // Bullets
        ctx.fillStyle = COLORS.playerBullet;
        for (const b of state.playerBullets) ctx.fillRect(b.x - 1.5, b.y, 3, 14);
        ctx.fillStyle = COLORS.enemyBullet;
        for (const b of state.invaderBullets) {
            const wig = Math.sin((b.y + state.animTime * 12) * 0.3) * 2;
            ctx.fillRect(b.x - 1.5 + wig, b.y - 7, 3, 14);
        }

        // Particles
        for (const p of state.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // Floor line
        ctx.strokeStyle = 'rgba(54, 227, 164, 0.4)';
        ctx.beginPath();
        ctx.moveTo(0, H - 22);
        ctx.lineTo(W, H - 22);
        ctx.stroke();

        // Lives icons (bottom-left)
        for (let i = 0; i < state.lives; i++) {
            drawSprite(SPR.player, 12 + i * 36, H - 18, 2, COLORS.player);
        }

        ctx.restore();
    }

    // ---------- Loop ----------
    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover) step(dt);
        render(dt);
        requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    document.addEventListener('keydown', (e) => {
        if (['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.keyL = true;
        else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keyR = true;
        else if (e.key === ' ') state.keyFire = true;
        else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
        else if (e.key === 'r' || e.key === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.keyL = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keyR = false;
        if (e.key === ' ') state.keyFire = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const press = (e) => { e.preventDefault();
            if (a === 'left') state.keyL = true;
            else if (a === 'right') state.keyR = true;
            else if (a === 'fire') state.keyFire = true;
            else if (a === 'pause') togglePause();
        };
        const release = (e) => { e.preventDefault();
            if (a === 'left') state.keyL = false;
            if (a === 'right') state.keyR = false;
            if (a === 'fire') state.keyFire = false;
        };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('touchend', release, { passive: false });
        b.addEventListener('mousedown', press);
        b.addEventListener('mouseup', release);
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
        ui.oWave.classList.add('hidden');
        resetGame();
        state.running = true;
        state.paused = false;
        last = performance.now();
        startWave();
    }

    ui.btnPlay.addEventListener('click', () => {
        ui.oTitle.classList.add('hidden');
        resetGame();
        state.running = true;
        last = performance.now();
        startWave();
        blip(880, 0.1, 'square');
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);

    // ---------- Boot ----------
    loadHS();
    renderHS();
    resetGame();
    state.running = false;
    requestAnimationFrame(loop);
})();
