/* ================================================================
   VECTOR STORM — modern Asteroids remake
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), lives: $('lives'), wave: $('wave'), best: $('best'),
        hsScore: $('hs-score'), hsWave: $('hs-wave'),
        finalScore: $('final-score'), finalWave: $('final-wave'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    const COLORS = {
        bg: '#050208',
        ship: '#9b6bff',
        thrust: '#ffd06b',
        bullet: '#ffffff',
        rock: '#cccccc',
        rockGlow: 'rgba(155, 107, 255, 0.3)',
        saucer: '#ff66cc',
        text: '#ffffff'
    };

    const state = {
        running: false, paused: false, gameover: false,
        score: 0, lives: 3, wave: 1,
        bestScore: 0, bestWave: 0,
        ship: null,
        bullets: [],
        rocks: [],
        saucers: [],
        particles: [],
        stars: [],
        nextLifeAt: 10000,
        saucerTimer: 18,
        keyL: false, keyR: false, keyT: false, keyHS: false,
        animTime: 0,
        respawnSafeT: 0
    };

    const KEY = 'osg.vector-storm.hs';
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
    function spawnStars() {
        state.stars = [];
        for (let i = 0; i < 80; i++) {
            state.stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() });
        }
    }

    function makeShip() {
        return {
            x: W / 2, y: H / 2,
            vx: 0, vy: 0,
            angle: -Math.PI / 2,
            radius: 12,
            alive: true,
            thrusting: false,
            fireCooldown: 0
        };
    }

    function makeRock(x, y, size) {
        const verts = [];
        const n = 8 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const r = 0.7 + Math.random() * 0.5;
            verts.push({ a, r });
        }
        const sizeRadius = size === 3 ? 40 : (size === 2 ? 24 : 14);
        const speed = 30 + (4 - size) * 30 + state.wave * 5;
        const dir = Math.random() * Math.PI * 2;
        return {
            x, y,
            vx: Math.cos(dir) * speed,
            vy: Math.sin(dir) * speed,
            radius: sizeRadius,
            size,
            verts,
            spin: (Math.random() - 0.5) * 1.5,
            angle: 0
        };
    }

    function spawnRocks(count) {
        for (let i = 0; i < count; i++) {
            // Spawn away from ship
            let x, y, dist;
            do {
                x = Math.random() * W;
                y = Math.random() * H;
                dist = state.ship ? Math.hypot(x - state.ship.x, y - state.ship.y) : Infinity;
            } while (dist < 120);
            state.rocks.push(makeRock(x, y, 3));
        }
    }

    function nextWave() {
        state.wave++;
        bump();
        const count = Math.min(10, 3 + Math.floor(state.wave / 1.5));
        spawnRocks(count);
        // Brief pause
        state.respawnSafeT = 1.5;
    }

    function newGame() {
        state.score = 0;
        state.lives = 3;
        state.wave = 1;
        state.gameover = false;
        state.ship = makeShip();
        state.bullets = [];
        state.rocks = [];
        state.saucers = [];
        state.particles = [];
        state.nextLifeAt = 10000;
        state.saucerTimer = 18;
        state.respawnSafeT = 2;
        spawnStars();
        spawnRocks(4);
        updateHud();
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.wave.textContent = state.wave;
    }

    function wrap(o) {
        if (o.x < 0) o.x += W;
        if (o.x > W) o.x -= W;
        if (o.y < 0) o.y += H;
        if (o.y > H) o.y -= H;
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;

        // Stars
        for (const s of state.stars) {
            s.x -= 6 * s.z * dt;
            if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
        }

        // Ship
        if (state.ship && state.ship.alive) {
            const sp = state.ship;
            const rotSpeed = 4;
            if (state.keyL) sp.angle -= rotSpeed * dt;
            if (state.keyR) sp.angle += rotSpeed * dt;

            sp.thrusting = state.keyT;
            if (sp.thrusting) {
                sp.vx += Math.cos(sp.angle) * 240 * dt;
                sp.vy += Math.sin(sp.angle) * 240 * dt;
                if (Math.random() < 0.5) {
                    state.particles.push({
                        x: sp.x - Math.cos(sp.angle) * 14,
                        y: sp.y - Math.sin(sp.angle) * 14,
                        vx: -Math.cos(sp.angle) * 80 + (Math.random() - 0.5) * 60,
                        vy: -Math.sin(sp.angle) * 80 + (Math.random() - 0.5) * 60,
                        age: 0, life: 0.3, color: COLORS.thrust, size: 2
                    });
                }
            }
            // Friction
            sp.vx *= 0.992;
            sp.vy *= 0.992;
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            wrap(sp);

            sp.fireCooldown = Math.max(0, sp.fireCooldown - dt);

            if (state.respawnSafeT > 0) state.respawnSafeT -= dt;
        }

        // Bullets
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            wrap(b);
            if (b.life <= 0) { state.bullets.splice(i, 1); continue; }
            // Hit rocks
            let hit = false;
            for (let j = state.rocks.length - 1; j >= 0; j--) {
                const r = state.rocks[j];
                if (Math.hypot(b.x - r.x, b.y - r.y) < r.radius) {
                    breakRock(j);
                    state.bullets.splice(i, 1);
                    hit = true;
                    break;
                }
            }
            if (hit) continue;
            // Hit saucer
            for (let j = state.saucers.length - 1; j >= 0; j--) {
                const s = state.saucers[j];
                if (Math.hypot(b.x - s.x, b.y - s.y) < s.radius) {
                    state.score += s.big ? 200 : 1000;
                    spawnExplosion(s.x, s.y, COLORS.saucer, 30);
                    state.saucers.splice(j, 1);
                    state.bullets.splice(i, 1);
                    blip(220, 0.2, 'sawtooth');
                    bump();
                    break;
                }
            }
        }

        // Rocks
        for (const r of state.rocks) {
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            r.angle += r.spin * dt;
            wrap(r);
        }

        // Saucers
        state.saucerTimer -= dt;
        if (state.saucerTimer <= 0 && state.saucers.length === 0 && state.rocks.length > 0) {
            state.saucerTimer = 25 + Math.random() * 15;
            const big = state.score < 5000 || Math.random() < 0.6;
            const dir = Math.random() < 0.5 ? 1 : -1;
            state.saucers.push({
                x: dir > 0 ? -20 : W + 20,
                y: 60 + Math.random() * (H - 120),
                vx: dir * (big ? 70 : 110),
                vy: 0,
                radius: big ? 16 : 10,
                big, fireT: 1.5,
                zigT: 0
            });
        }
        for (let i = state.saucers.length - 1; i >= 0; i--) {
            const s = state.saucers[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.zigT += dt;
            if (s.zigT > 0.5) {
                s.zigT = 0;
                s.vy = (Math.random() - 0.5) * 80;
            }
            s.fireT -= dt;
            if (s.fireT <= 0 && state.ship && state.ship.alive) {
                s.fireT = s.big ? 1.4 : 0.8;
                let angle;
                if (s.big) {
                    angle = Math.random() * Math.PI * 2;
                } else {
                    // Smart aim with slight inaccuracy
                    angle = Math.atan2(state.ship.y - s.y, state.ship.x - s.x);
                    angle += (Math.random() - 0.5) * 0.2;
                }
                state.bullets.push({
                    x: s.x, y: s.y,
                    vx: Math.cos(angle) * 320,
                    vy: Math.sin(angle) * 320,
                    life: 1.6, fromSaucer: true
                });
                blip(330, 0.05, 'sawtooth');
            }
            if (s.x < -30 || s.x > W + 30) state.saucers.splice(i, 1);
        }

        // Ship vs rocks/saucers/saucer-bullets
        if (state.ship && state.ship.alive && state.respawnSafeT <= 0) {
            for (const r of state.rocks) {
                if (Math.hypot(state.ship.x - r.x, state.ship.y - r.y) < r.radius + state.ship.radius - 4) {
                    shipDie();
                    break;
                }
            }
            for (const s of state.saucers) {
                if (Math.hypot(state.ship.x - s.x, state.ship.y - s.y) < s.radius + state.ship.radius - 2) {
                    shipDie();
                    break;
                }
            }
            for (let i = state.bullets.length - 1; i >= 0; i--) {
                const b = state.bullets[i];
                if (b.fromSaucer && state.ship && state.ship.alive &&
                    Math.hypot(b.x - state.ship.x, b.y - state.ship.y) < state.ship.radius) {
                    state.bullets.splice(i, 1);
                    shipDie();
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
            p.vx *= 0.97;
            p.vy *= 0.97;
        }

        // Wave clear
        if (state.rocks.length === 0 && !state.gameover) nextWave();

        // Extra life
        if (state.score >= state.nextLifeAt) {
            state.lives++;
            state.nextLifeAt += 10000;
            blip(660, 0.1); blip(880, 0.1, 'triangle'); blip(1320, 0.15);
        }
    }

    function breakRock(idx) {
        const r = state.rocks[idx];
        const points = r.size === 3 ? 20 : (r.size === 2 ? 50 : 100);
        state.score += points;
        spawnExplosion(r.x, r.y, COLORS.rock, 12 + r.size * 4);
        blip(440 - r.size * 60, 0.1, 'sawtooth', 0.06);
        if (r.size > 1) {
            for (let i = 0; i < 2; i++) state.rocks.push(makeRock(r.x, r.y, r.size - 1));
        }
        state.rocks.splice(idx, 1);
        bump();
    }

    function spawnExplosion(x, y, color, n = 16) {
        for (let i = 0; i < n; i++) {
            state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 320,
                vy: (Math.random() - 0.5) * 320,
                age: 0, life: 0.5 + Math.random() * 0.5,
                color, size: 2 + Math.random() * 2
            });
        }
    }

    function shipDie() {
        if (!state.ship.alive) return;
        state.ship.alive = false;
        spawnExplosion(state.ship.x, state.ship.y, COLORS.ship, 40);
        for (let i = 0; i < 5; i++) setTimeout(() => blip(220 - i * 30, 0.15, 'sawtooth'), i * 80);
        state.lives--;
        bump();
        if (state.lives <= 0) {
            state.gameover = true;
            state.running = false;
            ui.finalScore.textContent = state.score;
            ui.finalWave.textContent = state.wave;
            setTimeout(() => ui.oOver.classList.remove('hidden'), 1000);
        } else {
            setTimeout(() => {
                state.ship = makeShip();
                state.respawnSafeT = 2;
                updateHud();
            }, 1200);
        }
        updateHud();
    }

    function fire() {
        if (!state.ship || !state.ship.alive) return;
        if (state.ship.fireCooldown > 0) return;
        if (state.bullets.filter(b => !b.fromSaucer).length >= 4) return;
        const sp = state.ship;
        state.bullets.push({
            x: sp.x + Math.cos(sp.angle) * 14,
            y: sp.y + Math.sin(sp.angle) * 14,
            vx: Math.cos(sp.angle) * 520 + sp.vx,
            vy: Math.sin(sp.angle) * 520 + sp.vy,
            life: 0.9
        });
        sp.fireCooldown = 0.15;
        blip(880, 0.04, 'square');
    }

    function hyperspace() {
        if (!state.ship || !state.ship.alive) return;
        // Risky teleport — small chance of self-destruct
        spawnExplosion(state.ship.x, state.ship.y, '#ffffff', 12);
        state.ship.x = Math.random() * W;
        state.ship.y = Math.random() * H;
        state.ship.vx *= 0.3;
        state.ship.vy *= 0.3;
        if (Math.random() < 0.08) {
            shipDie();
        } else {
            state.respawnSafeT = 0.4;
            blip(660, 0.1, 'triangle');
        }
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Stars
        for (const s of state.stars) {
            ctx.fillStyle = `rgba(255,255,255,${0.2 + s.z * 0.6})`;
            ctx.fillRect(s.x, s.y, 1 + Math.floor(s.z * 1.5), 1 + Math.floor(s.z * 1.5));
        }

        // Rocks (vector outlines)
        ctx.strokeStyle = COLORS.rock;
        ctx.lineWidth = 1.8;
        for (const r of state.rocks) {
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(r.angle);
            ctx.beginPath();
            for (let i = 0; i < r.verts.length; i++) {
                const v = r.verts[i];
                const x = Math.cos(v.a) * r.radius * v.r;
                const y = Math.sin(v.a) * r.radius * v.r;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }

        // Saucers
        for (const s of state.saucers) {
            ctx.strokeStyle = COLORS.saucer;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const r = s.radius;
            ctx.moveTo(s.x - r, s.y);
            ctx.lineTo(s.x - r * 0.5, s.y - r * 0.4);
            ctx.lineTo(s.x + r * 0.5, s.y - r * 0.4);
            ctx.lineTo(s.x + r, s.y);
            ctx.lineTo(s.x + r * 0.6, s.y + r * 0.4);
            ctx.lineTo(s.x - r * 0.6, s.y + r * 0.4);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(s.x - r, s.y);
            ctx.lineTo(s.x + r, s.y);
            ctx.stroke();
        }

        // Bullets
        for (const b of state.bullets) {
            ctx.fillStyle = b.fromSaucer ? COLORS.saucer : COLORS.bullet;
            ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
        }

        // Ship
        if (state.ship && state.ship.alive) {
            const sp = state.ship;
            const blink = state.respawnSafeT > 0 && Math.floor(state.animTime * 8) % 2 === 0;
            if (!blink) {
                ctx.save();
                ctx.translate(sp.x, sp.y);
                ctx.rotate(sp.angle);
                ctx.strokeStyle = COLORS.ship;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(14, 0);
                ctx.lineTo(-10, -8);
                ctx.lineTo(-6, 0);
                ctx.lineTo(-10, 8);
                ctx.closePath();
                ctx.stroke();
                if (sp.thrusting && Math.random() < 0.5) {
                    ctx.strokeStyle = COLORS.thrust;
                    ctx.beginPath();
                    ctx.moveTo(-6, -3);
                    ctx.lineTo(-12, 0);
                    ctx.lineTo(-6, 3);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // Particles
        for (const p of state.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // Lives icons (top-left under HUD area would be canvas top)
        for (let i = 0; i < state.lives - 1; i++) {
            ctx.save();
            ctx.translate(20 + i * 22, 22);
            ctx.rotate(-Math.PI / 2);
            ctx.strokeStyle = COLORS.ship;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-6, -5);
            ctx.lineTo(-3, 0);
            ctx.lineTo(-6, 5);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }
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
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Shift'].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = true;
        else if (k === 'ArrowUp' || k === 'w' || k === 'W') state.keyT = true;
        else if (k === ' ') fire();
        else if (k === 'Shift') hyperspace();
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = false;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') state.keyT = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const press = (e) => { e.preventDefault();
            if (a === 'left') state.keyL = true;
            else if (a === 'right') state.keyR = true;
            else if (a === 'thrust') state.keyT = true;
            else if (a === 'fire') fire();
            else if (a === 'hyperspace') hyperspace();
            else if (a === 'pause') togglePause();
        };
        const release = () => {
            if (a === 'left') state.keyL = false;
            if (a === 'right') state.keyR = false;
            if (a === 'thrust') state.keyT = false;
        };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('touchend', release);
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
    state.running = false;
    requestAnimationFrame(loop);
})();
