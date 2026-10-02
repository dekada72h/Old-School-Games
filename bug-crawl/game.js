/* ================================================================
   BUG CRAWL — fan tribute inspired by Centipede
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
        finalScore: $('final-score'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    // 15 cols × 18 rows · 40 px tiles
    const COLS = 15, ROWS = 18;
    const TILE = 40;
    const PLAYER_ZONE_TOP = 13; // rows 13..17 (player zone)

    const COLORS = {
        bg: '#050208',
        mush1: '#36e3a4',
        mush2: '#1d9d6e',
        mushHurt: '#ffd06b',
        mushPoison: '#ff66cc',
        head: '#ffd06b',
        body: '#9b6bff',
        bodyDark: '#6644cc',
        spider: '#ff2e63',
        bullet: '#ffffff',
        player: '#5fd0ff',
        playerDark: '#2493cc'
    };

    const state = {
        running: false, paused: false, gameover: false,
        score: 0, lives: 3, wave: 1,
        bestScore: 0, bestWave: 0,
        mushrooms: {},   // key "c,r" → { hp: 4 }
        centipedes: [],  // each: array of {col,row,x,y,dir,goingDown}
        bullets: [],
        spider: null,
        player: null,
        spiderTimer: 8,
        animTime: 0,
        keyL: false, keyR: false, keyU: false, keyD: false, keyFire: false,
        fireCooldown: 0,
        deathT: 0,
        invuln: 0,
        flash: 0,
        particles: []
    };

    const KEY = 'osg.bug-crawl.hs';
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
    function spawnMushrooms() {
        state.mushrooms = {};
        const count = 35 + state.wave * 2;
        // Valid rows: 1..PLAYER_ZONE_TOP-3 inclusive (keep gap above the player zone).
        const rRange = PLAYER_ZONE_TOP - 3; // sample size
        for (let i = 0; i < count; i++) {
            const c = Math.floor(Math.random() * COLS);
            const r = Math.floor(Math.random() * rRange) + 1;
            state.mushrooms[`${c},${r}`] = { hp: 4 };
        }
    }

    const SP = 26;   // distance between centipede segments along the path

    function makeCentipede(n, x, y, dir, speed, entering) {
        const trail = [];
        // straight tail trailing behind the head (off-screen when entering)
        const tailLen = n * SP + 40;
        for (let d = 0; d <= tailLen; d += 3) trail.push({ x: x - dir * d, y });
        return { x, y, dir, goingDown: false, vertDir: 1, reachedBottom: false, targetY: y, n, trail, speed, hurtT: 0 };
    }

    function spawnCentipede() {
        state.centipedes = [];
        const length = Math.min(24, 10 + state.wave);
        state.centipedes.push(makeCentipede(length, TILE / 2 - 8, TILE / 2, 1, 110 + state.wave * 6));
        // from wave 2: lone fast heads wander in from the sides
        const solos = Math.min(4, state.wave - 1);
        for (let i = 0; i < solos; i++) {
            const dir = i % 2 ? -1 : 1;
            const row = 3 + i * 2;
            state.centipedes.push(makeCentipede(1, dir > 0 ? -30 - i * 60 : W + 30 + i * 60, row * TILE + TILE / 2, dir, 150 + state.wave * 6));
        }
    }

    function pathPositions(c) {
        const out = [{ x: c.x, y: c.y }];
        const t = c.trail;
        let need = SP, acc = 0;
        for (let k = 0; k < t.length - 1 && out.length < c.n; k++) {
            const a = t[k], b = t[k + 1];
            const len = Math.hypot(a.x - b.x, a.y - b.y);
            while (acc + len >= need && out.length < c.n) {
                const f = (need - acc) / (len || 1);
                out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
                need += SP;
            }
            acc += len;
        }
        while (out.length < c.n) { const l = t[t.length - 1]; out.push({ x: l.x, y: l.y }); }
        return out;
    }

    function mushAt(col, row) { return !!state.mushrooms[`${col},${row}`]; }

    function moveHead(c, dt) {
        let dist = c.speed * dt;
        let guard = 0;
        while (dist > 0.001 && guard++ < 8) {
            if (c.goingDown) {
                const dy = c.targetY - c.y;
                const mv = Math.min(Math.abs(dy), dist);
                c.y += Math.sign(dy) * mv; dist -= mv;
                if (Math.abs(c.targetY - c.y) < 0.01) { c.y = c.targetY; c.goingDown = false; }
                continue;
            }
            const entering = (c.dir > 0 && c.x < TILE / 2 - 0.01) || (c.dir < 0 && c.x > W - TILE / 2 + 0.01);
            if (entering) {
                const toEdge = c.dir > 0 ? (TILE / 2 - c.x) : (c.x - (W - TILE / 2));
                const mv = Math.min(dist, toEdge);
                c.x += c.dir * mv; dist -= mv;
                continue;
            }
            const col = Math.round((c.x - TILE / 2) / TILE);
            const cx = col * TILE + TILE / 2;
            const row = Math.round((c.y - TILE / 2) / TILE);
            let toNext;
            if (Math.abs(c.x - cx) < 0.01) {
                c.x = cx;
                const nc = col + c.dir;
                if (nc < 0 || nc >= COLS || mushAt(nc, row)) {
                    // drop one row and turn around
                    if (!c.reachedBottom && row >= ROWS - 1) { c.reachedBottom = true; c.vertDir = -1; }
                    else if (c.reachedBottom && row <= PLAYER_ZONE_TOP) c.vertDir = 1;
                    if (c.vertDir > 0 && row >= ROWS - 1) { c.vertDir = -1; c.reachedBottom = true; }
                    c.targetY = (row + c.vertDir) * TILE + TILE / 2;
                    c.goingDown = true;
                    c.dir = -c.dir;
                    continue;
                }
                toNext = TILE;
            } else {
                toNext = c.dir > 0 ? (cx > c.x ? cx - c.x : cx + TILE - c.x) : (cx < c.x ? c.x - cx : c.x - (cx - TILE));
            }
            const mv = Math.min(dist, toNext);
            c.x += c.dir * mv; dist -= mv;
        }
        // record trail
        const t0 = c.trail[0];
        t0.x = c.x; t0.y = c.y;
        const t1 = c.trail[1];
        if (!t1 || Math.hypot(t0.x - t1.x, t0.y - t1.y) >= 3) c.trail.unshift({ x: c.x, y: c.y });
        const cap = Math.ceil(c.n * SP / 3) + 14;
        if (c.trail.length > cap) c.trail.length = cap;
    }

    // Split centipede `c` at segment index `si` (that segment is destroyed)
    function splitCentipede(ci, si) {
        const c = state.centipedes[ci];
        const pos = pathPositions(c);
        const hitPos = pos[si];
        const out = [];
        if (si > 0) {
            const front = Object.assign({}, c, { n: si, trail: c.trail });
            out.push(front);
        }
        if (si < c.n - 1) {
            const p0 = pos[si + 1];
            // trail from p0 onwards (older points)
            const dist0 = (si + 1) * SP;
            let acc = 0, startK = c.trail.length - 1;
            for (let k = 0; k < c.trail.length - 1; k++) {
                const len = Math.hypot(c.trail[k].x - c.trail[k + 1].x, c.trail[k].y - c.trail[k + 1].y);
                if (acc + len >= dist0) { startK = k + 1; break; }
                acc += len;
            }
            const trail = [{ x: p0.x, y: p0.y }].concat(c.trail.slice(startK).map(q => ({ x: q.x, y: q.y })));
            // heading from older point to p0
            let hdx = 0, hdy = 0;
            for (let k = 1; k < trail.length; k++) {
                hdx = trail[0].x - trail[k].x; hdy = trail[0].y - trail[k].y;
                if (Math.hypot(hdx, hdy) > 4) break;
            }
            const rowC = Math.round((p0.y - TILE / 2) / TILE);
            const nh = Object.assign({}, c, { n: c.n - si - 1, x: p0.x, y: p0.y, trail });
            if (Math.abs(hdy) > Math.abs(hdx)) {
                nh.goingDown = true;
                nh.vertDir = hdy > 0 ? 1 : -1;
                nh.targetY = (Math.round((p0.y - TILE / 2) / TILE) + (hdy > 0 ? 1 : 0)) * TILE + TILE / 2;
                if (hdy < 0) nh.targetY = (Math.floor((p0.y - TILE / 2) / TILE)) * TILE + TILE / 2;
                nh.dir = c.dir;
            } else {
                nh.goingDown = false;
                nh.dir = hdx >= 0 ? 1 : -1;
                nh.y = rowC * TILE + TILE / 2;
            }
            out.push(nh);
        }
        state.centipedes.splice(ci, 1, ...out);
        return hitPos;
    }

    function spawnPlayer() {
        return {
            x: W / 2,
            y: H - 60,
            w: 28, h: 28,
            alive: true
        };
    }

    function newWave() {
        state.bullets = [];
        state.spider = null;
        state.spiderTimer = 8;
        spawnCentipede();
    }

    function newGame() {
        state.score = 0;
        state.lives = 3;
        state.wave = 1;
        state.gameover = false;
        spawnMushrooms();
        state.player = spawnPlayer();
        state.invuln = 1.5;
        state.particles = [];
        newWave();
        updateHud();
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.wave.textContent = state.wave;
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;

        if (state.deathT > 0) {
            state.deathT -= dt;
            if (state.deathT <= 0) onPlayerDeathDone();
            return;
        }

        // Player
        if (state.player.alive) {
            const sp = 240;
            if (state.keyL) state.player.x -= sp * dt;
            if (state.keyR) state.player.x += sp * dt;
            if (state.keyU) state.player.y -= sp * dt;
            if (state.keyD) state.player.y += sp * dt;
            state.player.x = Math.max(state.player.w / 2 + 8, Math.min(W - state.player.w / 2 - 8, state.player.x));
            state.player.y = Math.max(PLAYER_ZONE_TOP * TILE, Math.min(H - state.player.h / 2 - 10, state.player.y));

            state.fireCooldown -= dt;
            if (state.keyFire && state.fireCooldown <= 0) {
                state.bullets.push({ x: state.player.x, y: state.player.y - 14, vy: -700 });
                state.fireCooldown = 0.12;
                blip(880, 0.04, 'square');
            }
        }

        // Centipedes move first so bullets collide with current positions
        const cpos = [];
        for (const c of state.centipedes) { moveHead(c, dt); cpos.push(pathPositions(c)); }

        // Bullets (sub-stepped)
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            let consumed = false;
            const steps = Math.max(1, Math.ceil(Math.abs(b.vy) * dt / 10));
            for (let st = 0; st < steps && !consumed; st++) {
                b.y += b.vy * dt / steps;
                if (b.y < 0) { consumed = true; break; }

                const c = Math.floor(b.x / TILE);
                const r = Math.floor(b.y / TILE);
                const k = `${c},${r}`;
                if (state.mushrooms[k]) {
                    state.mushrooms[k].hp--;
                    if (state.mushrooms[k].hp <= 0) { delete state.mushrooms[k]; state.score += 5; burst(c * TILE + TILE / 2, r * TILE + TILE / 2, COLORS.mush1, 8); }
                    else state.score += 1;
                    blip(440, 0.04, 'square');
                    consumed = true; break;
                }

                for (let ci = 0; ci < state.centipedes.length && !consumed; ci++) {
                    const pos = cpos[ci];
                    for (let si = 0; si < pos.length; si++) {
                        if (Math.abs(pos[si].x - b.x) < 14 && Math.abs(pos[si].y - b.y) < 14) {
                            const hp = pos[si];
                            const mc = Math.max(0, Math.min(COLS - 1, Math.floor(hp.x / TILE)));
                            const mr = Math.max(0, Math.min(ROWS - 1, Math.floor(hp.y / TILE)));
                            if (mr < ROWS - 1) state.mushrooms[`${mc},${mr}`] = { hp: 4 };
                            state.score += si === 0 ? 100 : 10;
                            burst(hp.x, hp.y, si === 0 ? COLORS.head : COLORS.body, 10);
                            splitCentipede(ci, si);
                            // rebuild positions cache after the split
                            cpos.length = 0;
                            for (const cc of state.centipedes) cpos.push(pathPositions(cc));
                            blip(660, 0.06, 'square');
                            consumed = true;
                            break;
                        }
                    }
                }
                if (consumed) break;

                if (state.spider && Math.abs(state.spider.x - b.x) < 18 && Math.abs(state.spider.y - b.y) < 16) {
                    const dist = Math.hypot(state.spider.x - state.player.x, state.spider.y - state.player.y);
                    state.score += dist < 80 ? 900 : 300;
                    burst(state.spider.x, state.spider.y, COLORS.spider, 14);
                    blip(1320, 0.15, 'square');
                    blip(880, 0.1, 'triangle');
                    state.spider = null;
                    bump();
                    updateHud();
                    consumed = true;
                }
            }
            if (consumed) state.bullets.splice(i, 1);
        }

        // Centipede vs player
        if (state.player.alive && state.invuln <= 0) {
            for (let ci = 0; ci < state.centipedes.length; ci++) {
                for (const p of cpos[ci] || []) {
                    if (Math.abs(p.x - state.player.x) < 16 && Math.abs(p.y - state.player.y) < 16) { playerDie(); return; }
                }
            }
        }
        if (state.invuln > 0) state.invuln -= dt;

        // Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.age += dt;
            if (p.age >= p.life) { state.particles.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
        }

        // Spider
        state.spiderTimer -= dt;
        if (!state.spider && state.spiderTimer <= 0) {
            state.spiderTimer = 8 + Math.random() * 8;
            const dir = Math.random() < 0.5 ? 1 : -1;
            state.spider = {
                x: dir > 0 ? -20 : W + 20,
                y: PLAYER_ZONE_TOP * TILE + Math.random() * (H - PLAYER_ZONE_TOP * TILE - 40),
                vx: dir * (140 + state.wave * 8),
                vy: 0,
                zigT: 0
            };
        }
        if (state.spider) {
            const sp = state.spider;
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            sp.zigT += dt;
            if (sp.zigT > 0.4) {
                sp.zigT = 0;
                sp.vy = (Math.random() - 0.5) * 200;
            }
            sp.y = Math.max(PLAYER_ZONE_TOP * TILE, Math.min(H - 30, sp.y));
            // Eat mushrooms
            const c = Math.floor(sp.x / TILE), r = Math.floor(sp.y / TILE);
            if (Math.random() < 0.05) {
                const k = `${c},${r}`;
                if (state.mushrooms[k]) delete state.mushrooms[k];
            }
            // Hit player?
            if (state.player.alive && state.invuln <= 0 &&
                Math.abs(sp.x - state.player.x) < 18 &&
                Math.abs(sp.y - state.player.y) < 16) {
                playerDie();
                return;
            }
            if (sp.x < -30 || sp.x > W + 30) state.spider = null;
        }

        // Wave clear?
        if (state.centipedes.length === 0) {
            state.wave++;
            state.score += 200;
            bump();
            updateHud();
            // heal damaged mushrooms for a bonus, then start the next wave
            for (const k in state.mushrooms) {
                if (state.mushrooms[k].hp < 4) { state.mushrooms[k].hp = 4; state.score += 5; }
            }
            newWave();
            chord();
        }
    }

    function burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            state.particles.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, age: 0, life: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
        }
    }
    function chord() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'triangle'), i * 80)); }

    function playerDie() {
        if (!state.player.alive) return;
        state.player.alive = false;
        state.deathT = 1.5;
        for (let i = 0; i < 5; i++) setTimeout(() => blip(220 - i * 30, 0.2, 'sawtooth'), i * 80);
    }

    function onPlayerDeathDone() {
        state.lives--;
        bump();
        if (state.lives <= 0) {
            state.gameover = true;
            state.running = false;
            ui.finalScore.textContent = state.score;
            setTimeout(() => ui.oOver.classList.remove('hidden'), 300);
        } else {
            state.player = spawnPlayer();
            state.invuln = 2.2;
        }
        updateHud();
    }

    // ---------- Render ----------
    let bgGrad = null;
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, a: 0.1 + Math.random() * 0.4, s: Math.random() * 2 + 1 }));

    function render() {
        if (!bgGrad) {
            bgGrad = ctx.createLinearGradient(0, 0, 0, H);
            bgGrad.addColorStop(0, '#0d0820');
            bgGrad.addColorStop(1, '#050208');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
        for (const st of stars) {
            ctx.globalAlpha = st.a * (0.6 + 0.4 * Math.sin(state.animTime * st.s + st.x));
            ctx.fillStyle = '#fff';
            ctx.fillRect(st.x, st.y, 1.5, 1.5);
        }
        ctx.globalAlpha = 1;

        // Player zone tint
        const zg = ctx.createLinearGradient(0, PLAYER_ZONE_TOP * TILE, 0, H);
        zg.addColorStop(0, 'rgba(95,208,255,0.0)');
        zg.addColorStop(1, 'rgba(95,208,255,0.07)');
        ctx.fillStyle = zg;
        ctx.fillRect(0, PLAYER_ZONE_TOP * TILE, W, H - PLAYER_ZONE_TOP * TILE);

        // Faint grid
        ctx.strokeStyle = 'rgba(155,107,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * TILE + 0.5, 0); ctx.lineTo(x * TILE + 0.5, H); }
        for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * TILE + 0.5); ctx.lineTo(W, y * TILE + 0.5); }
        ctx.stroke();

        // Mushrooms
        for (const k in state.mushrooms) {
            const [c, r] = k.split(',').map(Number);
            const m = state.mushrooms[k];
            const cx = c * TILE + TILE / 2;
            const cy = r * TILE + TILE / 2 + 2;
            const color = m.hp === 4 ? COLORS.mush1 :
                          m.hp === 3 ? COLORS.mush2 :
                          m.hp === 2 ? COLORS.mushHurt :
                          COLORS.mushPoison;
            ctx.fillStyle = '#e9e4f5';
            roundRectP(cx - 4, cy, 8, 10, 2); ctx.fill();
            const cg = ctx.createRadialGradient(cx - 4, cy - 8, 2, cx, cy - 2, 15);
            cg.addColorStop(0, '#ffffff66');
            cg.addColorStop(0.3, color);
            cg.addColorStop(1, color);
            ctx.shadowColor = color; ctx.shadowBlur = 8;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 14, 12 * (0.45 + m.hp * 0.14), 0, Math.PI, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = cg;
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.arc(cx - 5, cy - 5, 2.2, 0, Math.PI * 2);
            ctx.arc(cx + 5, cy - 6, 1.7, 0, Math.PI * 2);
            ctx.arc(cx + 1, cy - 9, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Centipedes (tail first so heads overlap)
        for (const c of state.centipedes) {
            const pos = pathPositions(c);
            for (let i = pos.length - 1; i >= 0; i--) {
                const p = pos[i];
                if (p.x < -20 || p.x > W + 20) continue;
                const head = i === 0;
                const wob = Math.sin(state.animTime * 12 - i * 0.8);
                // legs
                ctx.strokeStyle = head ? '#c28a00' : '#4c33a3';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(p.x - 4, p.y - 8); ctx.lineTo(p.x - 6 - wob * 2, p.y - 15);
                ctx.moveTo(p.x + 4, p.y + 8); ctx.lineTo(p.x + 6 + wob * 2, p.y + 15);
                ctx.moveTo(p.x - 4, p.y + 8); ctx.lineTo(p.x - 6 + wob * 2, p.y + 15);
                ctx.moveTo(p.x + 4, p.y - 8); ctx.lineTo(p.x + 6 + wob * 2, p.y - 15);
                ctx.stroke();
                const col = head ? COLORS.head : COLORS.body;
                const g = ctx.createRadialGradient(p.x - 3, p.y - 4, 1, p.x, p.y, 13);
                g.addColorStop(0, head ? '#fff1b8' : '#c9b0ff');
                g.addColorStop(1, head ? '#d49a1f' : '#5a3bc4');
                ctx.shadowColor = col; ctx.shadowBlur = 8;
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                if (head) {
                    const d = c.dir;
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(p.x - 4 + d * 2, p.y - 3, 3.2, 0, 7); ctx.arc(p.x + 4 + d * 2, p.y - 3, 3.2, 0, 7); ctx.fill();
                    ctx.fillStyle = '#220';
                    ctx.beginPath(); ctx.arc(p.x - 4 + d * 3, p.y - 3, 1.5, 0, 7); ctx.arc(p.x + 4 + d * 3, p.y - 3, 1.5, 0, 7); ctx.fill();
                    // antennae
                    ctx.strokeStyle = '#ffd06b'; ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(p.x - 4, p.y - 10); ctx.lineTo(p.x - 8 + d * 2, p.y - 17);
                    ctx.moveTo(p.x + 4, p.y - 10); ctx.lineTo(p.x + 8 + d * 2, p.y - 17);
                    ctx.stroke();
                }
            }
        }

        // Spider
        if (state.spider) {
            const sp = state.spider;
            ctx.shadowColor = COLORS.spider; ctx.shadowBlur = 12;
            ctx.strokeStyle = COLORS.spider;
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
                const wob = Math.sin(state.animTime * 14 + i) * 4;
                ctx.beginPath();
                ctx.moveTo(sp.x - 8, sp.y); ctx.lineTo(sp.x - 18 - i * 2, sp.y - 8 + i * 6 + wob);
                ctx.moveTo(sp.x + 8, sp.y); ctx.lineTo(sp.x + 18 + i * 2, sp.y - 8 + i * 6 - wob);
                ctx.stroke();
            }
            const g = ctx.createRadialGradient(sp.x - 4, sp.y - 4, 1, sp.x, sp.y, 14);
            g.addColorStop(0, '#ff9ab0'); g.addColorStop(1, COLORS.spider);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 15, 11, 0, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.fillRect(sp.x - 6, sp.y - 4, 4, 4);
            ctx.fillRect(sp.x + 2, sp.y - 4, 4, 4);
        }

        // Bullets
        ctx.shadowColor = '#5fd0ff'; ctx.shadowBlur = 10;
        ctx.fillStyle = COLORS.bullet;
        for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y - 7, 3, 14);
        ctx.shadowBlur = 0;

        // Particles
        for (const p of state.particles) {
            ctx.globalAlpha = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // Player zone divider
        ctx.strokeStyle = 'rgba(95, 208, 255, 0.2)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, PLAYER_ZONE_TOP * TILE + 0.5);
        ctx.lineTo(W, PLAYER_ZONE_TOP * TILE + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        // Player
        if (state.player.alive) {
            const p = state.player;
            if (state.invuln > 0 && Math.floor(state.animTime * 12) % 2 === 0) ctx.globalAlpha = 0.35;
            ctx.shadowColor = COLORS.player; ctx.shadowBlur = 14;
            const g = ctx.createLinearGradient(p.x, p.y - 14, p.x, p.y + 12);
            g.addColorStop(0, '#bfeaff'); g.addColorStop(1, COLORS.playerDark);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 15);
            ctx.lineTo(p.x + 13, p.y + 11);
            ctx.lineTo(p.x + 5, p.y + 7);
            ctx.lineTo(p.x - 5, p.y + 7);
            ctx.lineTo(p.x - 13, p.y + 11);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.ellipse(p.x, p.y - 2, 2.5, 5, 0, 0, Math.PI * 2); ctx.fill();
            // thruster
            ctx.fillStyle = `rgba(255,180,60,${0.6 + Math.random() * 0.3})`;
            ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 8); ctx.lineTo(p.x, p.y + 14 + Math.random() * 4); ctx.lineTo(p.x + 4, p.y + 8); ctx.fill();
            ctx.globalAlpha = 1;
        } else {
            for (let i = 0; i < 10; i++) {
                ctx.fillStyle = i % 2 ? COLORS.player : '#ff2e63';
                ctx.fillRect(state.player.x - 16 + Math.random() * 32, state.player.y - 16 + Math.random() * 32, 4, 4);
            }
        }
    }

    function roundRectP(x, y, w, h, r) {
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
        if (state.running && !state.paused && !state.gameover) { step(dt); updateHud(); }
        else state.animTime += dt;
        render();
        requestAnimationFrame(loop);
    }

    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = true;
        else if (k === 'ArrowUp' || k === 'w' || k === 'W') state.keyU = true;
        else if (k === 'ArrowDown' || k === 's' || k === 'S') state.keyD = true;
        else if (k === ' ') state.keyFire = true;
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = false;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') state.keyU = false;
        if (k === 'ArrowDown' || k === 's' || k === 'S') state.keyD = false;
        if (k === ' ') state.keyFire = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const press = (e) => { e.preventDefault();
            if (a === 'left') state.keyL = true;
            else if (a === 'right') state.keyR = true;
            else if (a === 'up') state.keyU = true;
            else if (a === 'down') state.keyD = true;
            else if (a === 'fire') state.keyFire = true;
            else if (a === 'pause') togglePause();
        };
        const release = () => {
            if (a === 'left') state.keyL = false;
            if (a === 'right') state.keyR = false;
            if (a === 'up') state.keyU = false;
            if (a === 'down') state.keyD = false;
            if (a === 'fire') state.keyFire = false;
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
    state.player = spawnPlayer();
    state.running = false;
    requestAnimationFrame(loop);
})();
