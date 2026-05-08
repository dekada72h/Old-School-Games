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
        deathT: 0
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
        for (let i = 0; i < count; i++) {
            const c = Math.floor(Math.random() * COLS);
            const r = Math.floor(Math.random() * (ROWS - 4)) + 1; // not in player zone
            if (r >= PLAYER_ZONE_TOP - 2) continue;
            state.mushrooms[`${c},${r}`] = { hp: 4 };
        }
    }

    function spawnCentipede() {
        state.centipedes = [];
        const length = 10 + state.wave;
        const seg = [];
        for (let i = 0; i < length; i++) {
            seg.push({
                col: i % COLS,
                row: 0,
                x: (i % COLS) * TILE + TILE / 2,
                y: TILE / 2 - i * 6,
                dir: 1,
                goingDown: true,
                isHead: i === 0
            });
        }
        state.centipedes.push(seg);
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

        // Bullets
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            b.y += b.vy * dt;
            if (b.y < 0) { state.bullets.splice(i, 1); continue; }

            // Hit mushroom?
            const c = Math.floor(b.x / TILE);
            const r = Math.floor(b.y / TILE);
            const k = `${c},${r}`;
            if (state.mushrooms[k]) {
                state.mushrooms[k].hp--;
                if (state.mushrooms[k].hp <= 0) {
                    delete state.mushrooms[k];
                    state.score += 5;
                } else {
                    state.score += 1;
                }
                state.bullets.splice(i, 1);
                blip(440, 0.04, 'square');
                continue;
            }

            // Hit centipede segment?
            let hit = false;
            for (let ci = 0; ci < state.centipedes.length; ci++) {
                const cent = state.centipedes[ci];
                for (let si = 0; si < cent.length; si++) {
                    const s = cent[si];
                    if (Math.abs(s.x - b.x) < 14 && Math.abs(s.y - b.y) < 14) {
                        // Add mushroom at its position
                        state.mushrooms[`${s.col},${s.row}`] = { hp: 4 };
                        state.score += s.isHead ? 100 : 10;
                        // Split centipede at this point
                        const before = cent.slice(0, si);
                        const after = cent.slice(si + 1);
                        if (before.length) {
                            // Last seg of "before" becomes head
                            before[before.length - 1].isHead = true;
                        }
                        if (after.length) {
                            after[0].isHead = true;
                            // Reverse direction so it doesn't tail through where head was
                            for (const a of after) a.dir = -a.dir;
                        }
                        // Replace
                        const newCents = [];
                        if (before.length) newCents.push(before);
                        if (after.length) newCents.push(after);
                        state.centipedes.splice(ci, 1, ...newCents);
                        state.bullets.splice(i, 1);
                        blip(660, 0.06, 'square');
                        hit = true;
                        break;
                    }
                }
                if (hit) break;
            }
            if (hit) continue;

            // Hit spider?
            if (state.spider && Math.abs(state.spider.x - b.x) < 18 && Math.abs(state.spider.y - b.y) < 16) {
                const dist = Math.hypot(state.spider.x - state.player.x, state.spider.y - state.player.y);
                state.score += dist < 80 ? 900 : 300;
                blip(1320, 0.15, 'square');
                blip(880, 0.1, 'triangle');
                state.spider = null;
                state.bullets.splice(i, 1);
                bump();
            }
        }

        // Centipedes
        const cSpeed = 100 + state.wave * 8;
        for (const cent of state.centipedes) {
            for (const s of cent) {
                if (s.goingDown) {
                    s.y += cSpeed * dt;
                    const tr = Math.floor(s.y / TILE);
                    if (tr > s.row) {
                        s.row = tr;
                        s.goingDown = false;
                    }
                } else {
                    s.x += s.dir * cSpeed * dt;
                    s.col = Math.floor(s.x / TILE);
                    // Check wall or mushroom
                    if (s.x < 12 || s.x > W - 12 ||
                        state.mushrooms[`${s.col + s.dir},${s.row}`]) {
                        s.dir = -s.dir;
                        s.goingDown = true;
                        s.y = (s.row * TILE) + 8;
                    }
                }
                // Reached bottom = wrap to top of player zone (and stay) — classic Centipede
                if (s.row >= ROWS - 1) {
                    s.row = ROWS - 2;
                }
                // Hit player?
                if (state.player.alive &&
                    Math.abs(s.x - state.player.x) < 16 &&
                    Math.abs(s.y - state.player.y) < 16) {
                    playerDie();
                    return;
                }
            }
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
            if (state.player.alive &&
                Math.abs(sp.x - state.player.x) < 18 &&
                Math.abs(sp.y - state.player.y) < 16) {
                playerDie();
                return;
            }
            if (sp.x < -30 || sp.x > W + 30) state.spider = null;
        }

        // Wave clear?
        if (state.centipedes.every(c => c.length === 0) || state.centipedes.length === 0) {
            state.wave++;
            bump();
            newWave();
        }
    }

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
        }
        updateHud();
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Faint grid in mushroom zone
        ctx.strokeStyle = 'rgba(155,107,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= COLS; x++) {
            ctx.moveTo(x * TILE + 0.5, 0);
            ctx.lineTo(x * TILE + 0.5, H);
        }
        for (let y = 0; y <= ROWS; y++) {
            ctx.moveTo(0, y * TILE + 0.5);
            ctx.lineTo(W, y * TILE + 0.5);
        }
        ctx.stroke();

        // Mushrooms
        for (const k in state.mushrooms) {
            const [c, r] = k.split(',').map(Number);
            const m = state.mushrooms[k];
            const cx = c * TILE + TILE / 2;
            const cy = r * TILE + TILE / 2;
            const color = m.hp === 4 ? COLORS.mush1 :
                          m.hp === 3 ? COLORS.mush2 :
                          m.hp === 2 ? COLORS.mushHurt :
                          COLORS.mushPoison;
            // Stem
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - 4, cy + 2, 8, 8);
            // Cap
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(cx, cy, 12, Math.PI, Math.PI * 2);
            ctx.fill();
            // Spots
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.arc(cx - 4, cy - 4, 2, 0, Math.PI * 2);
            ctx.arc(cx + 5, cy - 5, 1.5, 0, Math.PI * 2);
            ctx.arc(cx + 1, cy - 8, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Centipedes
        for (const cent of state.centipedes) {
            for (let i = cent.length - 1; i >= 0; i--) {
                const s = cent[i];
                ctx.fillStyle = s.isHead ? COLORS.head : COLORS.body;
                ctx.beginPath();
                ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = s.isHead ? '#3a2700' : COLORS.bodyDark;
                ctx.beginPath();
                ctx.arc(s.x, s.y + 3, 12, 0, Math.PI);
                ctx.fill();
                if (s.isHead) {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(s.x - 5 + s.dir * 3, s.y - 4, 2, 2);
                    ctx.fillRect(s.x + 3 + s.dir * 3, s.y - 4, 2, 2);
                }
                // Legs (decorative)
                ctx.strokeStyle = s.isHead ? '#a36b00' : COLORS.bodyDark;
                ctx.lineWidth = 1.5;
                const wob = Math.sin(state.animTime * 8 + i) * 2;
                ctx.beginPath();
                ctx.moveTo(s.x - 12, s.y); ctx.lineTo(s.x - 16, s.y + 4 + wob);
                ctx.moveTo(s.x + 12, s.y); ctx.lineTo(s.x + 16, s.y + 4 - wob);
                ctx.stroke();
            }
        }

        // Spider
        if (state.spider) {
            const sp = state.spider;
            ctx.fillStyle = COLORS.spider;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
            ctx.fill();
            // Legs
            ctx.strokeStyle = COLORS.spider;
            ctx.lineWidth = 1.8;
            for (let i = 0; i < 4; i++) {
                const wob = Math.sin(state.animTime * 12 + i) * 4;
                ctx.beginPath();
                ctx.moveTo(sp.x - 14 + i * 2, sp.y);
                ctx.lineTo(sp.x - 18 - i * 2, sp.y + 8 + wob);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(sp.x + 14 - i * 2, sp.y);
                ctx.lineTo(sp.x + 18 + i * 2, sp.y + 8 - wob);
                ctx.stroke();
            }
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.fillRect(sp.x - 5, sp.y - 4, 3, 3);
            ctx.fillRect(sp.x + 2, sp.y - 4, 3, 3);
        }

        // Bullets
        ctx.fillStyle = COLORS.bullet;
        for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y - 6, 3, 12);

        // Player zone divider
        ctx.strokeStyle = 'rgba(95, 208, 255, 0.15)';
        ctx.beginPath();
        ctx.moveTo(0, PLAYER_ZONE_TOP * TILE + 0.5);
        ctx.lineTo(W, PLAYER_ZONE_TOP * TILE + 0.5);
        ctx.stroke();

        // Player
        if (state.player.alive) {
            const p = state.player;
            ctx.fillStyle = COLORS.player;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 14);
            ctx.lineTo(p.x - 12, p.y + 10);
            ctx.lineTo(p.x + 12, p.y + 10);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = COLORS.playerDark;
            ctx.fillRect(p.x - 12, p.y + 8, 24, 4);
            // Cockpit
            ctx.fillStyle = '#fff';
            ctx.fillRect(p.x - 2, p.y - 6, 4, 4);
        } else {
            // Death flash
            for (let i = 0; i < 8; i++) {
                ctx.fillStyle = i % 2 ? COLORS.player : '#ff2e63';
                ctx.fillRect(state.player.x - 14 + Math.random() * 28, state.player.y - 14 + Math.random() * 28, 4, 4);
            }
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
