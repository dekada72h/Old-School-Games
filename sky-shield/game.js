/* ================================================================
   SKY SHIELD — fan tribute inspired by Missile Command
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), cities: $('cities'), wave: $('wave'), best: $('best'),
        hsScore: $('hs-score'), hsWave: $('hs-wave'),
        finalScore: $('final-score'),
        waveTitle: $('wave-title'), waveTag: $('wave-tag'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'),
        oWave: $('overlay-wave'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    const COLORS = {
        bg: '#050208',
        ground: '#3a2700',
        groundEdge: '#5a3d10',
        city: '#5fd0ff',
        cityWindow: '#ffd06b',
        battery: '#ffd06b',
        batteryDead: '#444',
        playerMissile: '#36e3a4',
        playerTrail: 'rgba(54, 227, 164, 0.4)',
        enemyMissile: '#ff2e63',
        enemyTrail: 'rgba(255, 46, 99, 0.4)',
        explosion: ['#ffd06b', '#ff7a3c', '#ff2e63'],
        crosshair: '#ffd06b',
        mirv: '#ff66cc'
    };

    const BATTERY_X = [80, W / 2, W - 80];
    const GROUND_Y = H - 50;
    const CITY_POSITIONS = [180, 240, 300, W - 300, W - 240, W - 180];

    const state = {
        running: false, paused: false, gameover: false,
        score: 0, wave: 1,
        bestScore: 0, bestWave: 0,
        cities: [],
        batteries: [],
        playerMissiles: [],
        enemyMissiles: [],
        explosions: [],
        crosshair: { x: W / 2, y: H / 2 },
        chainCount: 0,
        chainTimer: 0,
        animTime: 0,
        waveIncoming: [],     // pre-spawned ICBM data
        waveSpawnTimer: 0,
        waveDone: false,
        endingWaveT: 0,
        cityCount: 6
    };

    const KEY = 'osg.sky-shield.hs';
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
    function newGame() {
        state.score = 0;
        state.wave = 1;
        state.gameover = false;
        state.cities = CITY_POSITIONS.map(x => ({ x, alive: true }));
        state.batteries = BATTERY_X.map(x => ({ x, y: GROUND_Y - 18, ammo: 10, alive: true }));
        state.cityCount = 6;
        startWave();
        updateHud();
    }

    function startWave() {
        state.playerMissiles = [];
        state.enemyMissiles = [];
        state.explosions = [];
        state.waveIncoming = [];
        const count = 10 + state.wave * 4;
        const speed = 30 + state.wave * 6;
        for (let i = 0; i < count; i++) {
            const isMirv = state.wave >= 3 && Math.random() < 0.15 + state.wave * 0.02;
            state.waveIncoming.push({
                t: Math.random() * (8 + state.wave * 0.5),
                speed: speed + Math.random() * 30,
                isMirv
            });
        }
        state.waveIncoming.sort((a, b) => a.t - b.t);
        for (const b of state.batteries) {
            if (b.alive) b.ammo = 10;
        }
        state.waveSpawnTimer = 0;
        state.waveDone = false;
        state.endingWaveT = 0;
        ui.waveTitle.textContent = `WAVE ${state.wave}`;
        ui.waveTag.textContent = state.wave === 1 ? 'Incoming...' : (state.wave >= 3 ? 'MIRV detected!' : 'Faster now.');
        ui.oWave.classList.remove('hidden');
        setTimeout(() => ui.oWave.classList.add('hidden'), 1200);
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.cities.textContent = state.cityCount;
        ui.wave.textContent = state.wave;
    }

    function spawnICBM(x = null, y = null, speed = null, isMirv = false) {
        const startX = x !== null ? x : Math.random() * W;
        const startY = y !== null ? y : 0;
        // Pick a target — alive city or alive battery
        const targets = [...state.cities.filter(c => c.alive).map(c => ({ x: c.x, y: GROUND_Y })),
                         ...state.batteries.filter(b => b.alive).map(b => ({ x: b.x, y: b.y }))];
        if (targets.length === 0) return;
        const target = targets[Math.floor(Math.random() * targets.length)];
        const dx = target.x - startX;
        const dy = target.y - startY;
        const len = Math.hypot(dx, dy);
        const sp = speed || 50;
        state.enemyMissiles.push({
            x: startX, y: startY,
            startX, startY,
            tx: target.x, ty: target.y,
            vx: (dx / len) * sp,
            vy: (dy / len) * sp,
            trail: [],
            isMirv,
            mirvFired: false,
            mirvTrigger: 0.3 + Math.random() * 0.3
        });
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;

        // Spawn ICBMs
        state.waveSpawnTimer += dt;
        while (state.waveIncoming.length && state.waveIncoming[0].t <= state.waveSpawnTimer) {
            const cfg = state.waveIncoming.shift();
            spawnICBM(null, 0, cfg.speed, cfg.isMirv);
        }

        // Player missiles
        for (let i = state.playerMissiles.length - 1; i >= 0; i--) {
            const m = state.playerMissiles[i];
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            m.trail.push({ x: m.x, y: m.y });
            if (m.trail.length > 30) m.trail.shift();
            // Reached target
            const dx = m.tx - m.x, dy = m.ty - m.y;
            if (dx * dx + dy * dy < 36 || m.y < 0) {
                state.explosions.push({
                    x: m.tx, y: m.ty, r: 0,
                    maxR: 60, age: 0, life: 0.9,
                    fromPlayer: true
                });
                state.playerMissiles.splice(i, 1);
                blip(660, 0.1, 'square');
            }
        }

        // Enemy missiles
        for (let i = state.enemyMissiles.length - 1; i >= 0; i--) {
            const m = state.enemyMissiles[i];
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            m.trail.push({ x: m.x, y: m.y });
            if (m.trail.length > 50) m.trail.shift();

            // MIRV: split into 3 mid-flight
            if (m.isMirv && !m.mirvFired) {
                const totalDist = Math.hypot(m.tx - m.startX, m.ty - m.startY);
                const traveled = Math.hypot(m.x - m.startX, m.y - m.startY);
                if (traveled / totalDist > m.mirvTrigger) {
                    m.mirvFired = true;
                    for (let j = 0; j < 2; j++) {
                        const angle = Math.atan2(m.vy, m.vx) + (j === 0 ? -0.5 : 0.5);
                        const sp = Math.hypot(m.vx, m.vy);
                        state.enemyMissiles.push({
                            x: m.x, y: m.y,
                            startX: m.x, startY: m.y,
                            tx: m.x + Math.cos(angle) * 800,
                            ty: GROUND_Y,
                            vx: Math.cos(angle) * sp,
                            vy: Math.sin(angle) * sp,
                            trail: [], isMirv: false, mirvFired: true
                        });
                    }
                    blip(220, 0.06, 'sawtooth');
                }
            }

            // Reached ground or off-screen
            if (m.y >= GROUND_Y) {
                // Damage closest target
                const closeCity = state.cities.find(c => c.alive && Math.abs(c.x - m.x) < 22);
                const closeBat = state.batteries.find(b => b.alive && Math.abs(b.x - m.x) < 28);
                if (closeCity) {
                    closeCity.alive = false;
                    state.cityCount--;
                    state.explosions.push({ x: m.x, y: m.y, r: 0, maxR: 50, age: 0, life: 1.0 });
                    for (let k = 0; k < 4; k++) setTimeout(() => blip(220 - k * 40, 0.15, 'sawtooth'), k * 60);
                    updateHud();
                } else if (closeBat) {
                    closeBat.alive = false;
                    state.explosions.push({ x: m.x, y: m.y, r: 0, maxR: 60, age: 0, life: 1.0 });
                    for (let k = 0; k < 4; k++) setTimeout(() => blip(180 - k * 30, 0.15, 'sawtooth'), k * 60);
                } else {
                    state.explosions.push({ x: m.x, y: GROUND_Y, r: 0, maxR: 30, age: 0, life: 0.6 });
                    blip(180, 0.1, 'sawtooth');
                }
                state.enemyMissiles.splice(i, 1);
            }
        }

        // Explosions
        for (let i = state.explosions.length - 1; i >= 0; i--) {
            const e = state.explosions[i];
            e.age += dt;
            if (e.age >= e.life) { state.explosions.splice(i, 1); continue; }
            const k = e.age / e.life;
            e.r = e.maxR * Math.sin(k * Math.PI);

            // Catch enemy missiles in explosion
            if (e.fromPlayer) {
                for (let j = state.enemyMissiles.length - 1; j >= 0; j--) {
                    const en = state.enemyMissiles[j];
                    if (Math.hypot(en.x - e.x, en.y - e.y) < e.r) {
                        // Trigger chain bomb
                        state.explosions.push({ x: en.x, y: en.y, r: 0, maxR: 50, age: 0, life: 0.7, fromPlayer: true });
                        state.enemyMissiles.splice(j, 1);
                        const baseScore = 25 * state.wave;
                        const chainBonus = Math.pow(2, state.chainCount);
                        state.score += baseScore * chainBonus;
                        state.chainCount++;
                        state.chainTimer = 0.4;
                        blip(880 + state.chainCount * 100, 0.06, 'square');
                        bump();
                        updateHud();
                    }
                }
            }
        }

        if (state.chainTimer > 0) {
            state.chainTimer -= dt;
            if (state.chainTimer <= 0) state.chainCount = 0;
        }

        // Wave complete?
        if (!state.waveDone && state.waveIncoming.length === 0 && state.enemyMissiles.length === 0) {
            state.waveDone = true;
            state.endingWaveT = 1.5;
            // Bonus
            for (const b of state.batteries) {
                if (b.alive) {
                    state.score += b.ammo * 5 * state.wave;
                }
            }
            for (const c of state.cities) {
                if (c.alive) state.score += 100 * state.wave;
            }
            updateHud();
            bump();
        }
        if (state.waveDone) {
            state.endingWaveT -= dt;
            if (state.endingWaveT <= 0) {
                state.wave++;
                bump();
                // Restore one city every 2 waves
                if (state.wave % 2 === 0 && state.cityCount < 6) {
                    const dead = state.cities.find(c => !c.alive);
                    if (dead) { dead.alive = true; state.cityCount++; updateHud(); }
                }
                // Restore destroyed batteries
                for (const b of state.batteries) b.alive = true;
                if (state.cityCount === 0) {
                    endGame();
                } else {
                    startWave();
                }
            }
        }

        if (state.cityCount === 0 && !state.gameover) endGame();
    }

    function endGame() {
        state.gameover = true;
        state.running = false;
        bump();
        ui.finalScore.textContent = state.score;
        setTimeout(() => ui.oOver.classList.remove('hidden'), 800);
    }

    function fireMissile(targetX, targetY, batteryIdx = null) {
        // Pick battery
        let batt;
        if (batteryIdx !== null) {
            batt = state.batteries[batteryIdx];
            if (!batt || !batt.alive || batt.ammo <= 0) return;
        } else {
            // Closest alive battery with ammo
            let best = null, bestDist = Infinity;
            for (const b of state.batteries) {
                if (!b.alive || b.ammo <= 0) continue;
                const d = Math.abs(b.x - targetX);
                if (d < bestDist) { bestDist = d; best = b; }
            }
            if (!best) return;
            batt = best;
        }
        batt.ammo--;
        const dx = targetX - batt.x, dy = targetY - batt.y;
        const len = Math.hypot(dx, dy);
        const sp = 600;
        state.playerMissiles.push({
            x: batt.x, y: batt.y,
            tx: targetX, ty: targetY,
            vx: (dx / len) * sp,
            vy: (dy / len) * sp,
            trail: []
        });
        blip(440, 0.05, 'square');
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Stars
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let i = 0; i < 50; i++) {
            const x = (i * 137 + state.animTime * 5) % W;
            const y = (i * 71) % (GROUND_Y - 100);
            ctx.fillRect(x, y, 1, 1);
        }

        // Ground
        ctx.fillStyle = COLORS.ground;
        ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
        ctx.fillStyle = COLORS.groundEdge;
        ctx.fillRect(0, GROUND_Y, W, 3);

        // Cities
        for (const c of state.cities) {
            if (!c.alive) {
                // Rubble
                ctx.fillStyle = '#2a1a0a';
                ctx.fillRect(c.x - 18, GROUND_Y - 4, 36, 4);
                continue;
            }
            ctx.fillStyle = COLORS.city;
            // Skyline
            ctx.fillRect(c.x - 16, GROUND_Y - 18, 8, 18);
            ctx.fillRect(c.x - 6, GROUND_Y - 24, 6, 24);
            ctx.fillRect(c.x + 2, GROUND_Y - 14, 6, 14);
            ctx.fillRect(c.x + 10, GROUND_Y - 20, 6, 20);
            // Windows
            ctx.fillStyle = COLORS.cityWindow;
            ctx.fillRect(c.x - 14, GROUND_Y - 14, 2, 2);
            ctx.fillRect(c.x - 4, GROUND_Y - 20, 2, 2);
            ctx.fillRect(c.x - 4, GROUND_Y - 12, 2, 2);
            ctx.fillRect(c.x + 4, GROUND_Y - 10, 2, 2);
            ctx.fillRect(c.x + 12, GROUND_Y - 16, 2, 2);
            ctx.fillRect(c.x + 12, GROUND_Y - 8, 2, 2);
        }

        // Batteries
        for (const b of state.batteries) {
            if (b.alive) {
                ctx.fillStyle = COLORS.battery;
                ctx.beginPath();
                ctx.moveTo(b.x - 18, GROUND_Y);
                ctx.lineTo(b.x - 12, b.y);
                ctx.lineTo(b.x + 12, b.y);
                ctx.lineTo(b.x + 18, GROUND_Y);
                ctx.closePath();
                ctx.fill();
                // Ammo dots
                ctx.fillStyle = '#fff';
                for (let i = 0; i < b.ammo; i++) {
                    const ax = b.x - 8 + (i % 5) * 4;
                    const ay = b.y - 4 + Math.floor(i / 5) * 4;
                    ctx.fillRect(ax, ay, 3, 3);
                }
            } else {
                ctx.fillStyle = COLORS.batteryDead;
                ctx.fillRect(b.x - 16, GROUND_Y - 4, 32, 4);
            }
        }

        // Enemy missile trails + heads
        for (const m of state.enemyMissiles) {
            ctx.strokeStyle = m.isMirv ? COLORS.mirv : COLORS.enemyTrail;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < m.trail.length; i++) {
                const t = m.trail[i];
                if (i === 0) ctx.moveTo(t.x, t.y);
                else ctx.lineTo(t.x, t.y);
            }
            ctx.stroke();
            ctx.fillStyle = m.isMirv ? COLORS.mirv : COLORS.enemyMissile;
            ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
        }

        // Player missile trails + heads
        for (const m of state.playerMissiles) {
            ctx.strokeStyle = COLORS.playerTrail;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < m.trail.length; i++) {
                const t = m.trail[i];
                if (i === 0) ctx.moveTo(t.x, t.y);
                else ctx.lineTo(t.x, t.y);
            }
            ctx.stroke();
            ctx.fillStyle = COLORS.playerMissile;
            ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
        }

        // Explosions
        for (const e of state.explosions) {
            const k = e.age / e.life;
            ctx.globalAlpha = 1 - k;
            const colors = COLORS.explosion;
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = colors[i];
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r * (1 - i * 0.3), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        // Crosshair
        ctx.strokeStyle = COLORS.crosshair;
        ctx.lineWidth = 1.5;
        const c = state.crosshair;
        ctx.beginPath();
        ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x - 4, c.y);
        ctx.moveTo(c.x + 4, c.y); ctx.lineTo(c.x + 10, c.y);
        ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y - 4);
        ctx.moveTo(c.x, c.y + 4); ctx.lineTo(c.x, c.y + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2, 0, Math.PI * 2);
        ctx.fill();

        // Chain indicator
        if (state.chainCount > 1) {
            ctx.fillStyle = COLORS.crosshair;
            ctx.font = "bold 18px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(`x${state.chainCount}`, W / 2, 40);
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
    cv.addEventListener('mousemove', (e) => {
        const r = cv.getBoundingClientRect();
        state.crosshair.x = (e.clientX - r.left) * (W / r.width);
        state.crosshair.y = (e.clientY - r.top) * (H / r.height);
    });
    cv.addEventListener('click', (e) => {
        if (!state.running || state.paused || state.gameover) return;
        const r = cv.getBoundingClientRect();
        const x = (e.clientX - r.left) * (W / r.width);
        const y = (e.clientY - r.top) * (H / r.height);
        fireMissile(x, y);
    });

    cv.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const r = cv.getBoundingClientRect();
            state.crosshair.x = (e.touches[0].clientX - r.left) * (W / r.width);
            state.crosshair.y = (e.touches[0].clientY - r.top) * (H / r.height);
            fireMissile(state.crosshair.x, state.crosshair.y);
            e.preventDefault();
        }
    }, { passive: false });
    cv.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const r = cv.getBoundingClientRect();
            state.crosshair.x = (e.touches[0].clientX - r.left) * (W / r.width);
            state.crosshair.y = (e.touches[0].clientY - r.top) * (H / r.height);
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'a' || e.key === 'A') fireMissile(state.crosshair.x, state.crosshair.y, 0);
        else if (e.key === 's' || e.key === 'S') fireMissile(state.crosshair.x, state.crosshair.y, 1);
        else if (e.key === 'd' || e.key === 'D') fireMissile(state.crosshair.x, state.crosshair.y, 2);
        else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
        else if (e.key === 'r' || e.key === 'R') restart();
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        b.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (a === 'left') fireMissile(state.crosshair.x, state.crosshair.y, 0);
            else if (a === 'mid') fireMissile(state.crosshair.x, state.crosshair.y, 1);
            else if (a === 'right') fireMissile(state.crosshair.x, state.crosshair.y, 2);
            else if (a === 'pause') togglePause();
        }, { passive: false });
        b.addEventListener('mousedown', (e) => {
            if (a === 'left') fireMissile(state.crosshair.x, state.crosshair.y, 0);
            else if (a === 'mid') fireMissile(state.crosshair.x, state.crosshair.y, 1);
            else if (a === 'right') fireMissile(state.crosshair.x, state.crosshair.y, 2);
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
        ui.oWave.classList.add('hidden');
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
    state.cities = CITY_POSITIONS.map(x => ({ x, alive: true }));
    state.batteries = BATTERY_X.map(x => ({ x, y: GROUND_Y - 18, ammo: 10, alive: true }));
    state.running = false;
    requestAnimationFrame(loop);
})();
