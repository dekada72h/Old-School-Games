/* ================================================================
   BRICK SMASH — a modern Breakout / Arkanoid remake
   Pure HTML5 canvas, vanilla JS, no dependencies.
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
        level: $('level'),
        best: $('best'),
        hsScore: $('hs-score'),
        hsLevel: $('hs-level'),
        finalScore: $('final-score'),
        winScore: $('win-score'),
        levelTitle: $('level-title'),
        levelTag: $('level-tag'),
        oTitle: $('overlay-title'),
        oPause: $('overlay-pause'),
        oLevel: $('overlay-level'),
        oOver: $('overlay-gameover'),
        oWin: $('overlay-victory'),
        btnPlay: $('btn-play'),
        btnResume: $('btn-resume'),
        btnRetry: $('btn-retry'),
        btnNew: $('btn-newgame')
    };

    // ---------- Constants ----------
    const COLS = 14;
    const ROWS = 10;
    const BRICK_W = (W - 60) / COLS;
    const BRICK_H = 22;
    const BRICK_TOP = 70;

    const PADDLE_Y = H - 50;
    const BASE_PADDLE_W = 110;
    const PADDLE_H = 14;

    const BASE_BALL_SPEED = 380;

    const COLORS = {
        bg: '#050208',
        wall: 'rgba(95, 208, 255, 0.2)',
        paddle: '#ff66cc',
        paddleHighlight: 'rgba(255,255,255,0.4)',
        ball: '#ffffff',
        ballTrail: 'rgba(255, 102, 204, 0.4)',
        bricks: ['#ff2e63', '#ffd06b', '#36e3a4', '#5fd0ff', '#9b6bff', '#ff66cc'],
        brickReinforced: '#888fa3',
        brickIndestructible: '#3a3f55'
    };

    // ---------- Levels ----------
    // 0=empty, 1-6=color, 7=2-hit reinforced, 9=indestructible
    const LEVELS = [
        // 1 — wall
        [
            '..............',
            '..............',
            '111111111111..',
            '..222222222222',
            '333333333333..',
            '..444444444444',
            '555555555555..',
            '..666666666666',
            '..............',
            '..............'
        ],
        // 2 — pyramid
        [
            '..............',
            '......11......',
            '.....1221.....',
            '....122221....',
            '...12333321...',
            '..1234443321..',
            '.123455553321.',
            '12345666653321',
            '..............',
            '..............'
        ],
        // 3 — checkerboard with reinforced
        [
            '..............',
            '7.7.7.7.7.7.7.',
            '.7.7.7.7.7.7.7',
            '7.7.7.7.7.7.7.',
            '.7.7.7.7.7.7.7',
            '11.22.33.44.55',
            '..6611..6611..',
            '..............',
            '..............',
            '..............'
        ],
        // 4 — fortress
        [
            '..............',
            '99..........99',
            '9.7777777777.9',
            '9.7666666667.9',
            '9.7611111167.9',
            '9.7611111167.9',
            '9.7666666667.9',
            '9.7777777777.9',
            '99..........99',
            '..............'
        ],
        // 5 — gauntlet
        [
            '11111111111111',
            '..............',
            '22222222222222',
            '..............',
            '7777..7..7777.',
            '..............',
            '33333333333333',
            '..............',
            '44444444444444',
            '55555555555555'
        ],
        // 6 — face
        [
            '...111111111..',
            '..1.........1.',
            '.1...22..22..1',
            '.1...........1',
            '.1...........1',
            '.1...3....3..1',
            '..1...3..3..1.',
            '..1...3333..1.',
            '...111111111..',
            '..............'
        ],
        // 7 — final boss
        [
            '99999999999999',
            '9.7777777777.9',
            '9.7111111117.9',
            '9.7155555517.9',
            '9.7156666517.9',
            '9.7156666517.9',
            '9.7155555517.9',
            '9.7111111117.9',
            '9.7777777777.9',
            '99999999999999'
        ]
    ];

    // ---------- State ----------
    const state = {
        running: false,
        paused: false,
        gameover: false,
        won: false,
        score: 0,
        lives: 3,
        level: 1,
        bestScore: 0,
        bestLevel: 0,

        paddle: { x: W / 2, w: BASE_PADDLE_W, lasers: 0 },
        balls: [],
        bricks: [],
        powerups: [],
        lasers: [],
        particles: [],
        slowTimer: 0,
        ballSpeed: BASE_BALL_SPEED,
        animTime: 0,

        keyL: false, keyR: false,
        mouseX: null
    };

    // ---------- Storage ----------
    const KEY = 'osg.brick-smash.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) { const o = JSON.parse(r); state.bestScore = o.score || 0; state.bestLevel = o.level || 0; }
        } catch {}
    }
    function saveHS() {
        try { localStorage.setItem(KEY, JSON.stringify({ score: state.bestScore, level: state.bestLevel })); } catch {}
    }
    function bumpHS() {
        let dirty = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; dirty = true; }
        if (state.level > state.bestLevel) { state.bestLevel = state.level; dirty = true; }
        if (dirty) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsLevel.textContent = state.bestLevel;
    }

    // ---------- Audio ----------
    let audio = null;
    function blip(freq, dur = 0.06, type = 'square', vol = 0.06) {
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
    function buildLevel(idx) {
        state.bricks = [];
        const layout = LEVELS[(idx - 1) % LEVELS.length];
        const offsetX = 30;
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                const ch = layout[r][c];
                if (ch === '.' || ch === '0') continue;
                const colorIdx = parseInt(ch, 10);
                const x = offsetX + c * BRICK_W;
                const y = BRICK_TOP + r * (BRICK_H + 4);
                state.bricks.push({
                    x, y, w: BRICK_W - 2, h: BRICK_H,
                    type: colorIdx,
                    hp: colorIdx === 7 ? 2 : (colorIdx === 9 ? Infinity : 1),
                    alive: true,
                    flash: 0
                });
            }
        }
    }

    function resetBallsAndPaddle(stick = true) {
        state.paddle.x = W / 2;
        state.paddle.w = BASE_PADDLE_W;
        state.paddle.lasers = 0;
        state.balls = [{
            x: state.paddle.x,
            y: PADDLE_Y - 10,
            vx: 0,
            vy: 0,
            r: 6,
            stuck: stick,
            trail: []
        }];
        state.powerups = [];
        state.lasers = [];
        state.slowTimer = 0;
        state.ballSpeed = BASE_BALL_SPEED + (state.level - 1) * 25;
    }

    function resetGame() {
        state.score = 0;
        state.lives = 3;
        state.level = 1;
        state.gameover = false;
        state.won = false;
        buildLevel(state.level);
        resetBallsAndPaddle(true);
        updateHud();
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.level.textContent = state.level;
    }

    // ---------- Update ----------
    function step(dt) {
        // Paddle
        const speed = 520;
        if (state.mouseX !== null) {
            // Smooth follow
            const target = Math.max(state.paddle.w / 2, Math.min(W - state.paddle.w / 2, state.mouseX));
            state.paddle.x += (target - state.paddle.x) * Math.min(1, dt * 18);
        } else {
            if (state.keyL) state.paddle.x -= speed * dt;
            if (state.keyR) state.paddle.x += speed * dt;
        }
        state.paddle.x = Math.max(state.paddle.w / 2, Math.min(W - state.paddle.w / 2, state.paddle.x));

        // Slow timer
        if (state.slowTimer > 0) state.slowTimer -= dt;
        const ballSpd = state.ballSpeed * (state.slowTimer > 0 ? 0.55 : 1);

        // Balls
        for (let i = state.balls.length - 1; i >= 0; i--) {
            const b = state.balls[i];
            if (b.stuck) {
                b.x = state.paddle.x;
                b.y = PADDLE_Y - 10;
                b.trail.length = 0;
                continue;
            }
            // Save trail
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 10) b.trail.shift();

            // Move
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            // Walls
            if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); blip(440, 0.04); }
            if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); blip(440, 0.04); }
            if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); blip(440, 0.04); }

            // Floor — lose ball
            if (b.y > H + 20) {
                state.balls.splice(i, 1);
                continue;
            }

            // Paddle
            if (b.vy > 0 &&
                b.y + b.r >= PADDLE_Y - PADDLE_H / 2 &&
                b.y - b.r <= PADDLE_Y + PADDLE_H / 2 &&
                b.x >= state.paddle.x - state.paddle.w / 2 - b.r &&
                b.x <= state.paddle.x + state.paddle.w / 2 + b.r) {
                const rel = (b.x - state.paddle.x) / (state.paddle.w / 2); // -1..1
                const angle = rel * (Math.PI / 3); // up to 60°
                const spd = Math.hypot(b.vx, b.vy);
                b.vx = spd * Math.sin(angle);
                b.vy = -Math.abs(spd * Math.cos(angle));
                b.y = PADDLE_Y - PADDLE_H / 2 - b.r;
                blip(660, 0.05, 'square');
            }

            // Bricks
            for (const br of state.bricks) {
                if (!br.alive) continue;
                if (b.x + b.r < br.x || b.x - b.r > br.x + br.w ||
                    b.y + b.r < br.y || b.y - b.r > br.y + br.h) continue;

                // Hit — figure side by overlap depth
                const overlapL = (b.x + b.r) - br.x;
                const overlapR = (br.x + br.w) - (b.x - b.r);
                const overlapT = (b.y + b.r) - br.y;
                const overlapB = (br.y + br.h) - (b.y - b.r);
                const min = Math.min(overlapL, overlapR, overlapT, overlapB);
                if (min === overlapL || min === overlapR) b.vx *= -1;
                else b.vy *= -1;

                hitBrick(br);
                blip(880 + br.type * 30, 0.06, 'square');
                break;
            }

            // Speed normalize
            const sp = Math.hypot(b.vx, b.vy);
            if (sp > 0 && Math.abs(sp - ballSpd) > 1) {
                b.vx = (b.vx / sp) * ballSpd;
                b.vy = (b.vy / sp) * ballSpd;
            }
        }

        // No balls left
        if (state.balls.length === 0 && state.running && !state.gameover) {
            state.lives--;
            updateHud();
            blip(140, 0.4, 'sawtooth', 0.08);
            if (state.lives <= 0) {
                gameOver();
            } else {
                resetBallsAndPaddle(true);
            }
        }

        // Powerups
        for (let i = state.powerups.length - 1; i >= 0; i--) {
            const p = state.powerups[i];
            p.y += 130 * dt;
            p.spin += dt * 4;
            if (p.y > H + 20) { state.powerups.splice(i, 1); continue; }
            // Catch?
            if (p.y + 12 >= PADDLE_Y - PADDLE_H / 2 &&
                p.x >= state.paddle.x - state.paddle.w / 2 - 12 &&
                p.x <= state.paddle.x + state.paddle.w / 2 + 12 &&
                p.y - 12 <= PADDLE_Y + PADDLE_H / 2) {
                applyPowerup(p.kind);
                state.powerups.splice(i, 1);
            }
        }

        // Lasers
        for (let i = state.lasers.length - 1; i >= 0; i--) {
            const l = state.lasers[i];
            l.y -= 600 * dt;
            if (l.y < 0) { state.lasers.splice(i, 1); continue; }
            for (const br of state.bricks) {
                if (!br.alive) continue;
                if (l.x >= br.x && l.x <= br.x + br.w && l.y <= br.y + br.h && l.y >= br.y) {
                    hitBrick(br);
                    state.lasers.splice(i, 1);
                    blip(1200, 0.04);
                    break;
                }
            }
        }

        // Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.age += dt;
            if (p.age >= p.life) { state.particles.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 600 * dt;
            p.vx *= 0.985;
        }

        // Bricks flash decay
        for (const br of state.bricks) if (br.flash > 0) br.flash -= dt * 6;

        // Win?
        if (state.bricks.every(b => !b.alive || b.type === 9) && !state.won && !state.gameover && state.running) {
            advance();
        }
    }

    function hitBrick(br) {
        if (br.type === 9) return; // indestructible
        if (br.type === 7) {
            br.hp--;
            br.flash = 1;
            if (br.hp <= 0) destroyBrick(br);
            else { state.score += 5; spawnParticles(br.x + br.w / 2, br.y + br.h / 2, COLORS.brickReinforced, 5); }
        } else {
            destroyBrick(br);
        }
        updateHud();
    }

    function destroyBrick(br) {
        br.alive = false;
        const points = br.type === 7 ? 30 : (br.type * 10);
        state.score += points;
        spawnParticles(br.x + br.w / 2, br.y + br.h / 2, COLORS.bricks[Math.max(0, br.type - 1)], 12);
        // Drop powerup?
        if (Math.random() < 0.12) {
            const kinds = ['multi', 'wide', 'laser', 'slow', 'life', 'curse'];
            const weights = [3, 4, 3, 3, 1, 2];
            const kind = pickWeighted(kinds, weights);
            state.powerups.push({
                x: br.x + br.w / 2,
                y: br.y + br.h / 2,
                kind, spin: 0
            });
        }
    }

    function pickWeighted(arr, w) {
        const total = w.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < arr.length; i++) {
            r -= w[i];
            if (r <= 0) return arr[i];
        }
        return arr[0];
    }

    function applyPowerup(kind) {
        if (kind === 'multi') {
            const seed = state.balls[0];
            if (seed) {
                for (let i = 0; i < 2; i++) {
                    const angle = Math.atan2(seed.vy, seed.vx) + (i ? 0.4 : -0.4);
                    const spd = Math.hypot(seed.vx, seed.vy) || state.ballSpeed;
                    state.balls.push({
                        x: seed.x, y: seed.y,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        r: 6, stuck: false, trail: []
                    });
                }
            }
            blip(880, 0.1); blip(1320, 0.1);
        } else if (kind === 'wide') {
            state.paddle.w = Math.min(220, state.paddle.w + 40);
            blip(880, 0.15);
        } else if (kind === 'laser') {
            state.paddle.lasers = 12;
            blip(440, 0.1, 'sawtooth');
        } else if (kind === 'slow') {
            state.slowTimer = 6;
            blip(330, 0.2, 'triangle');
        } else if (kind === 'life') {
            state.lives++;
            blip(660, 0.1); blip(880, 0.1); blip(1100, 0.15);
        } else if (kind === 'curse') {
            state.paddle.w = Math.max(60, state.paddle.w - 30);
            blip(220, 0.15, 'sawtooth');
        }
        updateHud();
    }

    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 320,
                vy: (Math.random() - 0.7) * 320,
                age: 0,
                life: 0.6 + Math.random() * 0.4,
                color,
                size: 2 + Math.random() * 3
            });
        }
    }

    function advance() {
        state.won = true;
        state.score += 1000 + state.lives * 200;
        bumpHS();
        if (state.level >= LEVELS.length) {
            // Won the game
            ui.winScore.textContent = state.score;
            ui.oWin.classList.remove('hidden');
            for (let i = 0; i < 8; i++) setTimeout(() => blip(440 + i * 80, 0.18, 'square'), i * 80);
            return;
        }
        state.level++;
        ui.levelTitle.textContent = `LEVEL ${state.level}`;
        ui.levelTag.textContent = state.level === LEVELS.length ? 'Final stage!' : 'Get ready...';
        ui.oLevel.classList.remove('hidden');
        setTimeout(() => {
            ui.oLevel.classList.add('hidden');
            buildLevel(state.level);
            resetBallsAndPaddle(true);
            state.won = false;
            updateHud();
        }, 1500);
    }

    function gameOver() {
        state.gameover = true;
        state.running = false;
        bumpHS();
        ui.finalScore.textContent = state.score;
        for (let i = 0; i < 5; i++) setTimeout(() => blip(220 - i * 30, 0.15, 'sawtooth'), i * 90);
        setTimeout(() => ui.oOver.classList.remove('hidden'), 600);
    }

    // ---------- Render ----------
    function render(dt) {
        state.animTime += dt;
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Subtle vertical stripes background
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = COLORS.wall;
        for (let x = 0; x < W; x += 40) ctx.fillRect(x, 0, 1, H);
        ctx.restore();

        // Bricks
        for (const br of state.bricks) {
            if (!br.alive) continue;
            const color = br.type === 9 ? COLORS.brickIndestructible :
                          br.type === 7 ? COLORS.brickReinforced :
                          COLORS.bricks[br.type - 1];
            ctx.fillStyle = color;
            ctx.fillRect(br.x, br.y, br.w, br.h);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(br.x, br.y, br.w, 3);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(br.x, br.y + br.h - 3, br.w, 3);
            if (br.flash > 0) {
                ctx.fillStyle = `rgba(255,255,255,${br.flash * 0.6})`;
                ctx.fillRect(br.x, br.y, br.w, br.h);
            }
            // 2-hit indicator
            if (br.type === 7 && br.hp === 1) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                for (let yy = 0; yy < br.h; yy += 4) {
                    ctx.fillRect(br.x + (yy % 8 ? 4 : 0), br.y + yy, br.w, 1);
                }
            }
        }

        // Paddle
        const pw = state.paddle.w;
        const px = state.paddle.x - pw / 2;
        const py = PADDLE_Y - PADDLE_H / 2;
        ctx.fillStyle = COLORS.paddle;
        roundRect(px, py, pw, PADDLE_H, 6); ctx.fill();
        ctx.fillStyle = COLORS.paddleHighlight;
        ctx.fillRect(px + 4, py + 2, pw - 8, 3);
        if (state.paddle.lasers > 0) {
            ctx.fillStyle = COLORS.bricks[1];
            ctx.fillRect(px + 6, py - 4, 4, 4);
            ctx.fillRect(px + pw - 10, py - 4, 4, 4);
        }

        // Lasers
        ctx.fillStyle = COLORS.bricks[1];
        for (const l of state.lasers) ctx.fillRect(l.x - 1.5, l.y, 3, 14);

        // Powerups
        for (const p of state.powerups) {
            const colors = { multi:'#36e3a4', wide:'#5fd0ff', laser:'#ffd06b', slow:'#9b6bff', life:'#ff66cc', curse:'#ff2e63' };
            const labels = { multi:'+', wide:'↔', laser:'L', slow:'S', life:'♥', curse:'×' };
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(1, Math.cos(p.spin) * 0.4 + 0.6);
            ctx.fillStyle = colors[p.kind];
            roundRect(-12, -12, 24, 24, 5); ctx.fill();
            ctx.fillStyle = '#0a0617';
            ctx.font = "bold 14px 'Press Start 2P', monospace";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(labels[p.kind], 0, 1);
            ctx.restore();
        }

        // Balls + trails
        for (const b of state.balls) {
            for (let i = 0; i < b.trail.length; i++) {
                const t = b.trail[i];
                const a = (i / b.trail.length) * 0.5;
                ctx.fillStyle = `rgba(255, 102, 204, ${a})`;
                ctx.beginPath();
                ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = COLORS.ball;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, 2, 0, Math.PI * 2); ctx.fill();
        }

        // Particles
        for (const p of state.particles) {
            const k = p.age / p.life;
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // Slow indicator
        if (state.slowTimer > 0) {
            ctx.fillStyle = `rgba(155, 107, 255, ${0.3 + Math.sin(state.animTime * 6) * 0.1})`;
            ctx.fillRect(0, 0, W, H);
        }
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

    // ---------- Loop ----------
    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover && !state.won) step(dt);
        render(dt);
        requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    document.addEventListener('keydown', (e) => {
        if (['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.keyL = true;
        else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keyR = true;
        else if (e.key === ' ') launchOrFire();
        else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
        else if (e.key === 'r' || e.key === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') state.keyL = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') state.keyR = false;
    });

    cv.addEventListener('mousemove', (e) => {
        const r = cv.getBoundingClientRect();
        state.mouseX = (e.clientX - r.left) * (W / r.width);
    });
    cv.addEventListener('mouseleave', () => { state.mouseX = null; });
    cv.addEventListener('click', () => launchOrFire());
    cv.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const r = cv.getBoundingClientRect();
            state.mouseX = (e.touches[0].clientX - r.left) * (W / r.width);
            e.preventDefault();
        }
    }, { passive: false });
    cv.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const r = cv.getBoundingClientRect();
            state.mouseX = (e.touches[0].clientX - r.left) * (W / r.width);
        }
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const press = (e) => {
            e.preventDefault();
            if (a === 'left') { state.keyL = true; state.mouseX = null; }
            else if (a === 'right') { state.keyR = true; state.mouseX = null; }
            else if (a === 'launch') launchOrFire();
            else if (a === 'pause') togglePause();
        };
        const release = () => { if (a === 'left') state.keyL = false; if (a === 'right') state.keyR = false; };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('touchend', release);
        b.addEventListener('mousedown', press);
        b.addEventListener('mouseup', release);
    });

    function launchOrFire() {
        // Fire lasers if available
        if (state.paddle.lasers > 0 && state.balls.every(b => !b.stuck)) {
            const px = state.paddle.x;
            state.lasers.push({ x: px - state.paddle.w / 2 + 8, y: PADDLE_Y - 14 });
            state.lasers.push({ x: px + state.paddle.w / 2 - 8, y: PADDLE_Y - 14 });
            state.paddle.lasers--;
            blip(990, 0.05, 'sawtooth');
            return;
        }
        // Launch any stuck ball
        for (const b of state.balls) {
            if (b.stuck) {
                const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                b.vx = Math.cos(angle) * state.ballSpeed;
                b.vy = Math.sin(angle) * state.ballSpeed;
                b.stuck = false;
                blip(880, 0.08);
            }
        }
    }

    function togglePause() {
        if (!state.running || state.gameover || state.won) return;
        state.paused = !state.paused;
        ui.oPause.classList.toggle('hidden', !state.paused);
        if (!state.paused) last = performance.now();
    }
    function restart() {
        ui.oOver.classList.add('hidden');
        ui.oWin.classList.add('hidden');
        ui.oPause.classList.add('hidden');
        ui.oLevel.classList.add('hidden');
        resetGame();
        state.running = true;
        state.paused = false;
        last = performance.now();
    }

    ui.btnPlay.addEventListener('click', () => {
        ui.oTitle.classList.add('hidden');
        resetGame();
        state.running = true;
        last = performance.now();
        blip(880, 0.1, 'square');
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);
    ui.btnNew.addEventListener('click', restart);

    // ---------- Boot ----------
    loadHS();
    renderHS();
    resetGame();
    state.running = false;
    requestAnimationFrame(loop);
})();
