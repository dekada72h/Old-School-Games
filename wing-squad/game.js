/* ================================================================
   WING SQUAD — fan tribute inspired by Galaga
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), lives: $('lives'), stage: $('stage'), best: $('best'),
        hsScore: $('hs-score'), hsStage: $('hs-stage'),
        finalScore: $('final-score'), finalStage: $('final-stage'),
        stageTitle: $('stage-title'), stageTag: $('stage-tag'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'),
        oStage: $('overlay-stage'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    const COLORS = {
        bg: '#050208',
        player: '#5fd0ff',
        playerDark: '#2493cc',
        bullet: '#ffffff',
        enemyBullet: '#ff2e63',
        drone: '#36e3a4',
        fighter: '#ffd06b',
        flag: '#ff66cc',
        flagWing: '#9b6bff',
        thrust: '#ff2e63'
    };

    // Formation grid: 8 cols × 5 rows, centered top
    const FORM_COLS = 8, FORM_ROWS = 5;
    const FORM_OFFSET_X = (W - (FORM_COLS - 1) * 50) / 2;
    const FORM_OFFSET_Y = 70;

    const state = {
        running: false, paused: false, gameover: false,
        score: 0, lives: 3, stage: 1,
        bestScore: 0, bestStage: 0,
        player: null,
        enemies: [],
        bullets: [],     // player bullets
        eBullets: [],    // enemy bullets
        particles: [],
        stars: [],
        spawnQueue: [],
        spawnTimer: 0,
        formationOffset: 0,
        formationDir: 1,
        diveTimer: 3,
        animTime: 0,
        keyL: false, keyR: false, keyFire: false,
        fireCooldown: 0,
        deathT: 0,
        stageReadyT: 0,
        invuln: 0
    };

    const KEY = 'osg.wing-squad.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) { const o = JSON.parse(r); state.bestScore = o.score || 0; state.bestStage = o.stage || 0; }
        } catch {}
    }
    function saveHS() { try { localStorage.setItem(KEY, JSON.stringify({ score: state.bestScore, stage: state.bestStage })); } catch {} }
    function bump() {
        let d = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; d = true; }
        if (state.stage > state.bestStage) { state.bestStage = state.stage; d = true; }
        if (d) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsStage.textContent = state.bestStage;
    }

    let audio = null;
    function blip(f, dur = 0.04, type = 'square', vol = 0.05) {
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
    function spawnStars() {
        state.stars = [];
        for (let i = 0; i < 100; i++) {
            state.stars.push({ x: Math.random() * W, y: Math.random() * H, sp: 30 + Math.random() * 80, z: Math.random() });
        }
    }

    function getFormSlot(col, row) {
        return {
            x: FORM_OFFSET_X + col * 50 + state.formationOffset,
            y: FORM_OFFSET_Y + row * 42
        };
    }

    function buildFormation() {
        const list = [];
        // Type by row: top 1 = flagship, next 2 = fighter, bottom 2 = drone
        for (let r = 0; r < FORM_ROWS; r++) {
            for (let c = 0; c < FORM_COLS; c++) {
                let type, points;
                if (r === 0) { type = 'flag'; points = 150; }
                else if (r < 3) { type = 'fighter'; points = 80; }
                else { type = 'drone'; points = 50; }
                list.push({ formCol: c, formRow: r, type, basePoints: points });
            }
        }
        return list;
    }

    function startStage() {
        state.bullets = [];
        state.eBullets = [];
        state.enemies = [];
        state.particles = [];
        state.formationOffset = 0;
        state.formationDir = 1;
        state.diveTimer = 3;
        const formation = buildFormation();
        // Queue up spawns: each enemy enters in waves from top edges with curved path
        state.spawnQueue = formation.map((e, i) => ({
            ...e,
            spawnT: i * 0.08,
            sideEntry: i % 2 === 0 ? 'left' : 'right'
        }));
        state.spawnTimer = 0;
        state.stageReadyT = 1.5;
        ui.stageTitle.textContent = `STAGE ${state.stage}`;
        ui.stageTag.textContent = state.stage === 1 ? 'Get ready...' : 'They\'re back. Faster.';
        ui.oStage.classList.remove('hidden');
        setTimeout(() => ui.oStage.classList.add('hidden'), 1200);
    }

    function spawnPlayer() {
        return {
            x: W / 2,
            y: H - 60,
            w: 28, h: 28,
            alive: true
        };
    }

    function newGame() {
        state.score = 0;
        state.lives = 3;
        state.stage = 1;
        state.gameover = false;
        state.deathT = 0;
        state.fireCooldown = 0;
        state.bullets = [];
        state.enemyBullets = [];
        state.particles = [];
        state.player = spawnPlayer();
        state.invuln = 1.5;
        spawnStars();
        startStage();
        updateHud();
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.stage.textContent = state.stage;
    }

    // ---------- Update ----------
    function movePlayer(dt) {
        if (!state.player.alive) return;
        const sp = 320;
        if (state.keyL) state.player.x -= sp * dt;
        if (state.keyR) state.player.x += sp * dt;
        state.player.x = Math.max(state.player.w / 2 + 8, Math.min(W - state.player.w / 2 - 8, state.player.x));

        state.fireCooldown -= dt;
        if (state.keyFire && state.fireCooldown <= 0 && state.bullets.length < 3) {
            state.bullets.push({ x: state.player.x, y: state.player.y - 14, vy: -640 });
            state.fireCooldown = 0.16;
            blip(880, 0.04, 'square');
        }
    }

    function step(dt) {
        state.animTime += dt;

        if (state.deathT > 0) {
            state.deathT -= dt;
            if (state.deathT <= 0) onPlayerDeathDone();
            return;
        }

        // Stars
        for (const s of state.stars) {
            s.y += s.sp * dt;
            if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
        }

        // Hold gameplay during the "STAGE N" overlay so enemies don't spawn/attack
        // before the player can see them.
        if (state.invuln > 0) state.invuln -= dt;
        if (state.stageReadyT > 0) {
            state.stageReadyT -= dt;
            movePlayer(dt);
            // bullets keep flying so the ship feels alive during the intro
            for (let i = state.bullets.length - 1; i >= 0; i--) { state.bullets[i].y += state.bullets[i].vy * dt; if (state.bullets[i].y < 0) state.bullets.splice(i, 1); }
            return;
        }

        // Spawn from queue
        state.spawnTimer += dt;
        while (state.spawnQueue.length && state.spawnQueue[0].spawnT <= state.spawnTimer) {
            const cfg = state.spawnQueue.shift();
            const slot = getFormSlot(cfg.formCol, cfg.formRow);
            const startX = cfg.sideEntry === 'left' ? -30 : W + 30;
            const startY = -30 + Math.random() * 80;
            state.enemies.push({
                ...cfg,
                x: startX, y: startY,
                state: 'entering',
                pathT: 0,
                pathFrom: { x: startX, y: startY },
                pathTo: { x: slot.x, y: slot.y },
                control: { x: cfg.sideEntry === 'left' ? W * 0.3 : W * 0.7, y: 250 + Math.random() * 80 },
                divePathT: 0,
                fireT: 2 + Math.random() * 4,
                angle: 0,
                alive: true
            });
        }

        // Formation sway
        state.formationOffset += state.formationDir * 25 * dt;
        if (state.formationOffset > 30) state.formationDir = -1;
        if (state.formationOffset < -30) state.formationDir = 1;

        // Enemies
        const allInFormation = state.spawnQueue.length === 0 &&
            state.enemies.every(e => e.state !== 'entering');
        if (allInFormation) {
            state.diveTimer -= dt;
            if (state.diveTimer <= 0 && state.player.alive) {
                state.diveTimer = Math.max(0.7, 2.5 - state.stage * 0.15);
                // Pick 1-3 enemies to dive
                const inForm = state.enemies.filter(e => e.state === 'formation');
                if (inForm.length > 0) {
                    const count = Math.min(inForm.length, 1 + Math.floor(Math.random() * 3));
                    for (let i = 0; i < count; i++) {
                        const e = inForm[Math.floor(Math.random() * inForm.length)];
                        if (e.state === 'formation') {
                            e.state = 'diving';
                            e.diveStart = { x: e.x, y: e.y };
                            e.diveTarget = {
                                x: state.player.x + (Math.random() - 0.5) * 200,
                                y: H + 60
                            };
                            e.diveControl = {
                                x: e.x + (Math.random() - 0.5) * 200,
                                y: H * 0.6
                            };
                            e.divePathT = 0;
                        }
                    }
                }
            }
        }

        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            if (e.state === 'entering') {
                e.pathT += dt * 1.5;
                if (e.pathT >= 1) {
                    e.state = 'formation';
                    e.pathT = 1;
                }
                const k = e.pathT;
                // Quadratic bezier
                const f = e.pathFrom, t = e.pathTo, c = e.control;
                e.x = (1 - k) * (1 - k) * f.x + 2 * (1 - k) * k * c.x + k * k * t.x;
                e.y = (1 - k) * (1 - k) * f.y + 2 * (1 - k) * k * c.y + k * k * t.y;
                const nx = 2 * (1 - k) * (c.x - f.x) + 2 * k * (t.x - c.x);
                const ny = 2 * (1 - k) * (c.y - f.y) + 2 * k * (t.y - c.y);
                e.angle = Math.atan2(ny, nx) - Math.PI / 2;
            } else if (e.state === 'formation') {
                const slot = getFormSlot(e.formCol, e.formRow);
                e.x = slot.x;
                e.y = slot.y + Math.sin(state.animTime * 2 + e.formCol) * 2;
                e.angle = Math.PI; // facing down

                // Random fire
                e.fireT -= dt;
                if (e.fireT <= 0 && state.player.alive) {
                    e.fireT = 4 + Math.random() * 6;
                    if (Math.random() < 0.3) {
                        const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
                        state.eBullets.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280 });
                    }
                }
            } else if (e.state === 'diving') {
                e.divePathT += dt * 0.8;
                if (e.divePathT >= 1) {
                    // Wrap around to top
                    e.x = e.diveTarget.x; e.y = -30;
                    e.state = 'returning';
                    e.pathT = 0;
                    e.pathFrom = { x: e.x, y: e.y };
                    const slot = getFormSlot(e.formCol, e.formRow);
                    e.pathTo = { x: slot.x, y: slot.y };
                    e.control = { x: e.pathTo.x, y: 200 };
                } else {
                    const k = e.divePathT;
                    const f = e.diveStart, t = e.diveTarget, c = e.diveControl;
                    e.x = (1 - k) * (1 - k) * f.x + 2 * (1 - k) * k * c.x + k * k * t.x;
                    e.y = (1 - k) * (1 - k) * f.y + 2 * (1 - k) * k * c.y + k * k * t.y;
                    const nx = 2 * (1 - k) * (c.x - f.x) + 2 * k * (t.x - c.x);
                    const ny = 2 * (1 - k) * (c.y - f.y) + 2 * k * (t.y - c.y);
                    e.angle = Math.atan2(ny, nx) - Math.PI / 2;

                    // Drop bullets while diving
                    if (Math.random() < 0.02) {
                        state.eBullets.push({ x: e.x, y: e.y, vx: 0, vy: 280 });
                    }
                }
            } else if (e.state === 'returning') {
                e.pathT += dt * 1.2;
                if (e.pathT >= 1) {
                    e.state = 'formation';
                    e.pathT = 1;
                } else {
                    const k = e.pathT;
                    const f = e.pathFrom, t = e.pathTo, c = e.control;
                    e.x = (1 - k) * (1 - k) * f.x + 2 * (1 - k) * k * c.x + k * k * t.x;
                    e.y = (1 - k) * (1 - k) * f.y + 2 * (1 - k) * k * c.y + k * k * t.y;
                    const nx = 2 * (1 - k) * (c.x - f.x) + 2 * k * (t.x - c.x);
                    const ny = 2 * (1 - k) * (c.y - f.y) + 2 * k * (t.y - c.y);
                    e.angle = Math.atan2(ny, nx) - Math.PI / 2;
                }
            }

            // Collision with player
            if (state.player.alive && state.invuln <= 0 && e.state !== 'entering' &&
                Math.hypot(e.x - state.player.x, e.y - state.player.y) < 22) {
                playerDie();
                return;
            }
        }

        movePlayer(dt);

        // Player bullets
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            const prevY = b.y;
            b.y += b.vy * dt;
            if (b.y < 0) { state.bullets.splice(i, 1); continue; }
            const yLo = Math.min(prevY, b.y) - 16, yHi = Math.max(prevY, b.y) + 16;
            for (let j = state.enemies.length - 1; j >= 0; j--) {
                const e = state.enemies[j];
                if (e.state === 'entering') continue;
                if (Math.abs(e.x - b.x) < 16 && e.y > yLo && e.y < yHi) {
                    const points = e.basePoints * (e.state === 'diving' ? 2 : 1);
                    state.score += points;
                    spawnExplosion(e.x, e.y, e.type === 'flag' ? COLORS.flag : (e.type === 'fighter' ? COLORS.fighter : COLORS.drone));
                    state.enemies.splice(j, 1);
                    state.bullets.splice(i, 1);
                    blip(660 + Math.random() * 200, 0.08, 'square');
                    bump();
                    break;
                }
            }
        }

        // Enemy bullets
        for (let i = state.eBullets.length - 1; i >= 0; i--) {
            const b = state.eBullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.y > H || b.x < 0 || b.x > W) { state.eBullets.splice(i, 1); continue; }
            if (state.player.alive && state.invuln <= 0 && Math.hypot(b.x - state.player.x, b.y - state.player.y) < 16) {
                state.eBullets.splice(i, 1);
                playerDie();
                return;
            }
        }

        // Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.age += dt;
            if (p.age >= p.life) { state.particles.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.94;
            p.vy *= 0.94;
        }

        // Stage clear?
        if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
            state.stage++;
            bump();
            startStage();
        }
    }

    function spawnExplosion(x, y, color) {
        for (let i = 0; i < 16; i++) {
            state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 280,
                vy: (Math.random() - 0.5) * 280,
                age: 0, life: 0.5 + Math.random() * 0.4,
                color, size: 2 + Math.random() * 2
            });
        }
    }

    function playerDie() {
        if (!state.player.alive) return;
        state.player.alive = false;
        state.deathT = 1.4;
        spawnExplosion(state.player.x, state.player.y, COLORS.player);
        for (let i = 0; i < 5; i++) setTimeout(() => blip(220 - i * 30, 0.18, 'sawtooth'), i * 80);
    }

    function onPlayerDeathDone() {
        state.lives--;
        bump();
        if (state.lives <= 0) {
            state.gameover = true;
            state.running = false;
            ui.finalScore.textContent = state.score;
            ui.finalStage.textContent = state.stage;
            setTimeout(() => ui.oOver.classList.remove('hidden'), 300);
        } else {
            state.player = spawnPlayer();
            state.invuln = 2.2;
        }
        updateHud();
    }

    // ---------- Render ----------
    let bgGrad = null;
    function render() {
        if (!bgGrad) {
            bgGrad = ctx.createLinearGradient(0, 0, 0, H);
            bgGrad.addColorStop(0, '#0a0524');
            bgGrad.addColorStop(1, '#030109');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
        const neb = ctx.createRadialGradient(W * 0.75, H * 0.3, 10, W * 0.75, H * 0.3, 280);
        neb.addColorStop(0, 'rgba(155,107,255,0.12)'); neb.addColorStop(1, 'rgba(155,107,255,0)');
        ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
        const neb2 = ctx.createRadialGradient(W * 0.15, H * 0.7, 10, W * 0.15, H * 0.7, 240);
        neb2.addColorStop(0, 'rgba(95,208,255,0.09)'); neb2.addColorStop(1, 'rgba(95,208,255,0)');
        ctx.fillStyle = neb2; ctx.fillRect(0, 0, W, H);

        // Stars (parallax streaks)
        for (const s of state.stars) {
            ctx.globalAlpha = 0.3 + s.z * 0.7;
            ctx.fillStyle = '#fff';
            const len = 1 + s.z * 4;
            ctx.fillRect(s.x, s.y, 1 + Math.floor(s.z * 1.5), len);
        }
        ctx.globalAlpha = 1;

        // Enemies
        for (const e of state.enemies) {
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.angle);
            drawEnemy(e.type, e);
            ctx.restore();
        }

        // Player bullets
        ctx.shadowColor = '#5fd0ff'; ctx.shadowBlur = 10;
        ctx.fillStyle = COLORS.bullet;
        for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y - 8, 3, 16);
        // Enemy bullets
        ctx.shadowColor = COLORS.enemyBullet;
        ctx.fillStyle = COLORS.enemyBullet;
        for (const b of state.eBullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
        ctx.shadowBlur = 0;

        // Particles
        for (const p of state.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // Player
        if (state.player.alive) {
            if (!(state.invuln > 0 && Math.floor(state.animTime * 14) % 2 === 0)) drawShip(state.player.x, state.player.y, 1, true);
        }

        // Lives
        for (let i = 0; i < state.lives - 1; i++) drawShip(20 + i * 26, H - 16, 0.55, false);
    }

    function drawShip(x, y, sc, flame) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(sc, sc);
        if (flame) {
            const fl = 8 + Math.sin(state.animTime * 40) * 3;
            const fg = ctx.createLinearGradient(0, 8, 0, 8 + fl + 6);
            fg.addColorStop(0, 'rgba(255,220,120,0.95)');
            fg.addColorStop(1, 'rgba(255,46,99,0)');
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(0, 8 + fl + 6); ctx.lineTo(4, 8); ctx.fill();
        }
        ctx.shadowColor = COLORS.player; ctx.shadowBlur = 14;
        const g = ctx.createLinearGradient(0, -14, 0, 12);
        g.addColorStop(0, '#d8f4ff');
        g.addColorStop(1, COLORS.playerDark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(4, -4);
        ctx.lineTo(15, 10);
        ctx.lineTo(15, 13);
        ctx.lineTo(6, 9);
        ctx.lineTo(-6, 9);
        ctx.lineTo(-15, 13);
        ctx.lineTo(-15, 10);
        ctx.lineTo(-4, -4);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff2e63';
        ctx.fillRect(-15, 9, 3, 4);
        ctx.fillRect(12, 9, 3, 4);
        ctx.fillStyle = 'rgba(10,6,23,0.85)';
        ctx.beginPath(); ctx.ellipse(0, -2, 2.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawEnemy(type, e) {
        const flap = Math.sin(state.animTime * 12 + (e.formCol || 0)) * 0.25;
        ctx.shadowBlur = 10;
        if (type === 'flag') {
            ctx.shadowColor = COLORS.flag;
            ctx.fillStyle = COLORS.flagWing;
            ctx.save(); ctx.rotate(flap); ctx.beginPath(); ctx.ellipse(-15, 0, 7, 13, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            ctx.save(); ctx.rotate(-flap); ctx.beginPath(); ctx.ellipse(15, 0, 7, 13, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 15);
            g.addColorStop(0, '#ffc2ea'); g.addColorStop(1, COLORS.flag);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(-4, 3, 3, 0, 7); ctx.arc(4, 3, 3, 0, 7); ctx.fill();
            ctx.fillStyle = '#220018';
            ctx.beginPath(); ctx.arc(-4, 4, 1.4, 0, 7); ctx.arc(4, 4, 1.4, 0, 7); ctx.fill();
            ctx.strokeStyle = COLORS.flag; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-3, -13); ctx.lineTo(-6, -19); ctx.moveTo(3, -13); ctx.lineTo(6, -19); ctx.stroke();
        } else if (type === 'fighter') {
            ctx.shadowColor = COLORS.fighter;
            const g = ctx.createLinearGradient(0, -14, 0, 10);
            g.addColorStop(0, '#fff0b8'); g.addColorStop(1, '#d49a1f');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(-13 - flap * 6, 4);
            ctx.lineTo(-8, 11);
            ctx.lineTo(0, 7);
            ctx.lineTo(8, 11);
            ctx.lineTo(13 + flap * 6, 4);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#3a2700';
            ctx.beginPath(); ctx.ellipse(0, -3, 3, 5, 0, 0, 7); ctx.fill();
            ctx.fillStyle = '#ff2e63';
            ctx.fillRect(-2, -6, 4, 2);
        } else {
            ctx.shadowColor = COLORS.drone;
            const g = ctx.createLinearGradient(0, -10, 0, 9);
            g.addColorStop(0, '#9dffd9'); g.addColorStop(1, '#1d9d6e');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, -11);
            ctx.lineTo(-11 - flap * 4, -1);
            ctx.lineTo(-6, 9);
            ctx.lineTo(6, 9);
            ctx.lineTo(11 + flap * 4, -1);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#03251a';
            ctx.fillRect(-4, -4, 3, 4); ctx.fillRect(1, -4, 3, 4);
        }
        ctx.shadowBlur = 0;
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover) { step(dt); updateHud(); }
        else state.animTime += dt;
        render();
        requestAnimationFrame(loop);
    }

    document.addEventListener('keydown', (e) => {
        if (['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = true;
        else if (k === ' ') state.keyFire = true;
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = false;
        if (k === ' ') state.keyFire = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        let touchActive = false;
        const press = (e) => { e.preventDefault();
            if (e.type === 'touchstart') touchActive = true;
            if (e.type === 'mousedown' && touchActive) return;
            if (a === 'left') state.keyL = true;
            else if (a === 'right') state.keyR = true;
            else if (a === 'fire') state.keyFire = true;
            else if (a === 'pause') togglePause();
        };
        const release = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.type === 'touchend') {
                setTimeout(() => { touchActive = false; }, 400);
            }
            if (a === 'left') state.keyL = false;
            if (a === 'right') state.keyR = false;
            if (a === 'fire') state.keyFire = false;
        };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('touchend', release, { passive: false });
        b.addEventListener('touchcancel', release, { passive: false });
        b.addEventListener('mousedown', press);
        b.addEventListener('mouseup', release);
        b.addEventListener('mouseleave', release);
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
        ui.oStage.classList.add('hidden');
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
    spawnStars();
    state.player = spawnPlayer();
    state.running = false;
    requestAnimationFrame(loop);
})();
