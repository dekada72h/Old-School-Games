/* ================================================================
   SLITHER — a modern Snake remake
   Pure HTML5 canvas, vanilla JS, no dependencies.
   ================================================================ */

(() => {
    'use strict';

    // ---------- DOM ----------
    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'),
        length: $('length'),
        speed: $('speed'),
        best: $('best'),
        hsScore: $('hs-score'),
        hsLength: $('hs-length'),
        finalScore: $('final-score'),
        wrapToggle: $('wrap-toggle'),
        overlayTitle: $('overlay-title'),
        overlayPause: $('overlay-pause'),
        overlayGameover: $('overlay-gameover'),
        btnPlay: $('btn-play'),
        btnResume: $('btn-resume'),
        btnRetry: $('btn-retry')
    };

    // ---------- Constants ----------
    const COLS = 24;
    const ROWS = 24;
    const CELL = Math.floor(cv.width / COLS); // 25 px
    const BASE_SPEED = 7;           // moves per second at speed level 1
    const MAX_SPEED = 18;
    const SPEED_PER_LEVEL = 0.6;
    const FOOD_PER_LEVEL = 5;       // grow this many before speed bumps

    const COLORS = {
        bg:        '#050208',
        grid:      'rgba(54, 227, 164, 0.04)',
        snake:     '#36e3a4',
        snakeDark: '#1d9d6e',
        head:      '#7df5c7',
        food:      '#ff2e63',
        foodGlow:  'rgba(255, 46, 99, 0.5)',
        gold:      '#ffd06b',
        wall:      'rgba(95, 208, 255, 0.3)'
    };

    // ---------- State ----------
    const state = {
        snake: [],          // [{x,y}], head first
        dir: { x: 1, y: 0 },
        nextDir: { x: 1, y: 0 },
        queue: [],
        food: null,
        gold: null,         // bonus food, occasional
        wrap: true,
        running: false,
        paused: false,
        gameover: false,
        score: 0,
        eaten: 0,
        speed: 1,
        moveAccum: 0,
        boost: false,
        stamina: 1,         // 0..1
        particles: [],
        animTime: 0,
        bestScore: 0,
        bestLength: 0,
        goldTimer: 0
    };

    // ---------- Storage ----------
    const STORAGE_KEY = 'osg.slither.hs';
    function loadHS() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const o = JSON.parse(raw);
            state.bestScore = o.score || 0;
            state.bestLength = o.length || 0;
        } catch {}
    }
    function saveHS() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                score: state.bestScore, length: state.bestLength
            }));
        } catch {}
    }
    function updateHS() {
        let dirty = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; dirty = true; }
        if (state.snake.length > state.bestLength) { state.bestLength = state.snake.length; dirty = true; }
        if (dirty) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsLength.textContent = state.bestLength;
    }

    // ---------- Audio (Web Audio blip, no asset) ----------
    let audio = null;
    function blip(freq, dur = 0.07, type = 'square', vol = 0.07) {
        try {
            if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') audio.resume();
            const o = audio.createOscillator();
            const g = audio.createGain();
            o.type = type;
            o.frequency.setValueAtTime(freq, audio.currentTime);
            g.gain.setValueAtTime(vol, audio.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
            o.connect(g).connect(audio.destination);
            o.start();
            o.stop(audio.currentTime + dur);
        } catch {}
    }

    // ---------- Game ----------
    function reset() {
        state.snake = [
            { x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }
        ];
        state.dir = { x: 1, y: 0 };
        state.nextDir = { x: 1, y: 0 };
        state.queue = [];
        state.score = 0;
        state.eaten = 0;
        state.speed = 1;
        state.moveAccum = 0;
        state.gameover = false;
        state.particles = [];
        state.boost = false;
        state.stamina = 1;
        state.gold = null;
        state.goldTimer = 0;
        spawnFood();
        updateHud();
    }

    function spawnFood() {
        if (state.snake.length >= COLS * ROWS - 1) { state.food = { x: -5, y: -5, t: 0 }; return; }
        let x, y, ok;
        do {
            x = Math.floor(Math.random() * COLS);
            y = Math.floor(Math.random() * ROWS);
            ok = !state.snake.some(s => s.x === x && s.y === y) &&
                 !(state.gold && state.gold.x === x && state.gold.y === y);
        } while (!ok);
        state.food = { x, y, t: 0 };
    }

    function maybeSpawnGold() {
        if (state.gold || state.snake.length >= COLS * ROWS - 3) return;
        let x, y, ok;
        let tries = 0;
        do {
            x = Math.floor(Math.random() * COLS);
            y = Math.floor(Math.random() * ROWS);
            ok = !state.snake.some(s => s.x === x && s.y === y) &&
                 !(state.food && state.food.x === x && state.food.y === y);
            if (++tries > 50) return;
        } while (!ok);
        state.gold = { x, y, life: 6.0 };
    }

    function step() {
        // Apply queued direction (if not 180°)
        if (state.queue.length) {
            const nd = state.queue.shift();
            if (!(nd.x === -state.dir.x && nd.y === -state.dir.y)) state.dir = nd;
        }

        const head = state.snake[0];
        let nx = head.x + state.dir.x;
        let ny = head.y + state.dir.y;

        if (state.wrap) {
            nx = (nx + COLS) % COLS;
            ny = (ny + ROWS) % ROWS;
        } else if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
            return die();
        }

        // Self-collision (the tail tip moves out unless we are about to grow)
        const growing = (state.food.x === nx && state.food.y === ny) ||
                        (state.gold && state.gold.x === nx && state.gold.y === ny);
        const limit = growing ? state.snake.length : state.snake.length - 1;
        for (let i = 0; i < limit; i++) {
            if (state.snake[i].x === nx && state.snake[i].y === ny) return die();
        }

        const newHead = { x: nx, y: ny };
        state.snake.unshift(newHead);

        // Eat?
        let grew = false;
        if (state.food.x === nx && state.food.y === ny) {
            state.score += 10;
            state.eaten++;
            spawnFood();
            grew = true;
            spawnParticles(nx, ny, COLORS.food);
            blip(660, 0.08, 'square');
            // Speed bump
            const tier = 1 + Math.floor(state.eaten / FOOD_PER_LEVEL);
            if (tier > state.speed) {
                state.speed = tier;
                blip(880, 0.1, 'triangle');
            }
        } else if (state.gold && state.gold.x === nx && state.gold.y === ny) {
            state.score += 50;
            state.gold = null;
            grew = true;
            spawnParticles(nx, ny, COLORS.gold);
            blip(1320, 0.18, 'square');
            blip(1760, 0.12, 'triangle', 0.05);
        } else {
            state.snake.pop();
        }

        if (state.boost) state.stamina = Math.max(0, state.stamina - 0.04);
        if (!state.boost) state.stamina = Math.min(1, state.stamina + 0.005);

        updateHud();
        return grew;
    }

    function die() {
        state.gameover = true;
        state.running = false;
        spawnParticles(state.snake[0].x, state.snake[0].y, COLORS.snake, 30);
        for (let i = 0; i < 6; i++) {
            setTimeout(() => blip(220 - i * 25, 0.12, 'sawtooth'), i * 70);
        }
        updateHS();
        ui.finalScore.textContent = state.score;
        setTimeout(() => ui.overlayGameover.classList.remove('hidden'), 600);
    }

    function spawnParticles(gx, gy, color, count = 12) {
        for (let i = 0; i < count; i++) {
            state.particles.push({
                x: gx * CELL + CELL / 2,
                y: gy * CELL + CELL / 2,
                vx: (Math.random() - 0.5) * 280,
                vy: (Math.random() - 0.5) * 280,
                life: 0.5 + Math.random() * 0.4,
                age: 0,
                color,
                size: 2 + Math.random() * 3
            });
        }
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.length.textContent = state.snake.length;
        ui.speed.textContent = state.speed;
    }

    // ---------- Render ----------
    function render(dt) {
        state.animTime += dt;

        // Background: checkerboard on a soft vignette
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, cv.width, cv.height);
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if ((x + y) & 1) {
                    ctx.fillStyle = 'rgba(54, 227, 164, 0.035)';
                    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
                }
            }
        }
        const vg = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.width * 0.25, cv.width / 2, cv.height / 2, cv.width * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, cv.width, cv.height);

        // Wall border (when wrap off)
        if (!state.wrap) {
            ctx.strokeStyle = COLORS.wall;
            ctx.lineWidth = 3;
            ctx.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3);
        }

        // Food (pulsing)
        if (state.food) {
            const fx = state.food.x * CELL + CELL / 2;
            const fy = state.food.y * CELL + CELL / 2;
            const pulse = 1 + Math.sin(state.animTime * 6) * 0.15;
            // glow
            const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, CELL * 1.2);
            grad.addColorStop(0, COLORS.foodGlow);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(fx - CELL * 1.2, fy - CELL * 1.2, CELL * 2.4, CELL * 2.4);
            // apple body + shine + leaf
            const rr = (CELL / 2 - 3) * pulse;
            const ag = ctx.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, rr + 2);
            ag.addColorStop(0, '#ff8aa5');
            ag.addColorStop(1, COLORS.food);
            ctx.fillStyle = ag;
            ctx.beginPath();
            ctx.arc(fx, fy + 1, rr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#36e3a4';
            ctx.beginPath();
            ctx.ellipse(fx + 4, fy - rr + 1, 4, 2, -0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.arc(fx - rr * 0.35, fy - rr * 0.2, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Gold bonus
        if (state.gold) {
            const gx = state.gold.x * CELL + CELL / 2;
            const gy = state.gold.y * CELL + CELL / 2;
            const flicker = state.gold.life < 2 ? (Math.sin(state.animTime * 14) * 0.5 + 0.5) : 1;
            ctx.globalAlpha = flicker;
            // star shape
            ctx.fillStyle = COLORS.gold;
            const r1 = CELL / 2 - 3;
            const r2 = r1 / 2;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const r = i % 2 === 0 ? r1 : r2;
                const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                const px = gx + Math.cos(a) * r;
                const py = gy + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Snake: connected rounded segments with a head-to-tail gradient
        ctx.shadowColor = 'rgba(54,227,164,0.55)';
        ctx.shadowBlur = 12;
        const n = state.snake.length;
        const col = (i) => {
            const t = n > 1 ? i / (n - 1) : 0;
            const r = Math.round(125 + (29 - 125) * t), g = Math.round(245 + (157 - 245) * t), bl = Math.round(199 + (110 - 199) * t);
            return `rgb(${r},${g},${bl})`;
        };
        for (let i = n - 1; i >= 0; i--) {
            const seg = state.snake[i];
            const x = seg.x * CELL, y = seg.y * CELL;
            const inset = i === 0 ? 1.5 : 3 + Math.min(2, i / n * 2);
            ctx.fillStyle = col(i);
            // connector to the next segment toward the tail
            const nx = state.snake[i + 1];
            if (nx && Math.abs(nx.x - seg.x) + Math.abs(nx.y - seg.y) === 1) {
                const mx = Math.min(seg.x, nx.x) * CELL, my = Math.min(seg.y, nx.y) * CELL;
                const w = nx.x !== seg.x ? CELL * 2 : CELL, h = nx.y !== seg.y ? CELL * 2 : CELL;
                ctx.fillRect(mx + (nx.x !== seg.x ? CELL / 2 : inset), my + (nx.y !== seg.y ? CELL / 2 : inset),
                    nx.x !== seg.x ? CELL : CELL - inset * 2, nx.y !== seg.y ? CELL : CELL - inset * 2);
            }
            roundRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2, 6);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        // scale highlights
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 1; i < n; i += 2) {
            const seg = state.snake[i];
            ctx.beginPath();
            ctx.arc(seg.x * CELL + CELL / 2, seg.y * CELL + CELL / 2 - 2, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        // head: eyes
        {
            const h = state.snake[0];
            const cx = h.x * CELL + CELL / 2, cy = h.y * CELL + CELL / 2;
            const dx = state.dir.x, dy = state.dir.y;
            for (const sgn of [-1, 1]) {
                const ex = cx + dx * 4 - dy * 5 * sgn * -1 * -1, ey = cy + dy * 4 + dx * 5 * sgn;
                const exx = cx + dx * 4 + dy * 5 * sgn, eyy = cy + dy * 4 - dx * 5 * sgn;
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(exx, eyy, 3.4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#0a0617';
                ctx.beginPath(); ctx.arc(exx + dx * 1.2, eyy + dy * 1.2, 1.7, 0, Math.PI * 2); ctx.fill();
            }
            // tongue flicker
            if (Math.floor(state.animTime * 3) % 3 === 0) {
                ctx.strokeStyle = '#ff2e63'; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(cx + dx * 10, cy + dy * 10);
                ctx.lineTo(cx + dx * 15, cy + dy * 15);
                ctx.stroke();
            }
        }

        // Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.age += dt;
            const k = p.age / p.life;
            if (k >= 1) { state.particles.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.92;
            p.vy *= 0.92;
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // Stamina bar (top-left, subtle)
        if (state.stamina < 1 || state.boost) {
            const w = 80;
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(10, 10, w, 6);
            ctx.fillStyle = state.boost ? COLORS.food : COLORS.snake;
            ctx.fillRect(10, 10, w * state.stamina, 6);
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

        if (state.running && !state.paused && !state.gameover) {
            // Speed: base + level + boost
            let movesPerSec = BASE_SPEED + (state.speed - 1) * SPEED_PER_LEVEL;
            if (state.boost && state.stamina > 0) movesPerSec *= 1.7;
            movesPerSec = Math.min(MAX_SPEED, movesPerSec);
            const period = 1 / movesPerSec;

            state.moveAccum += dt;
            while (state.moveAccum >= period) {
                state.moveAccum -= period;
                step();
                if (state.gameover) break;
            }
            // Gold lifetime ticks against wall-clock time, not snake-step count.
            if (state.gold) {
                state.gold.life -= dt;
                if (state.gold.life <= 0) state.gold = null;
            }
            state.goldTimer += dt;
            if (state.goldTimer > 6) {
                state.goldTimer = 0;
                if (!state.gold && Math.random() < 0.4) maybeSpawnGold();
            }
        }

        render(dt);
        requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    function setDir(x, y) {
        if (!state.running || state.paused) return;
        // validate against the last queued direction so quick double-taps work
        const ref = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
        if ((ref.x === -x && ref.y === -y) || (ref.x === x && ref.y === y)) return;
        if (state.queue.length < 3) state.queue.push({ x, y });
    }
    document.addEventListener('keydown', (e) => {
        const k = e.key;
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
        if (k === 'ArrowUp' || k === 'w' || k === 'W') setDir(0, -1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') setDir(0, 1);
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') setDir(-1, 0);
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') setDir(1, 0);
        else if (k === ' ') {
            if (!state.running && !ui.overlayTitle.classList.contains('hidden')) restart();
            else if (state.gameover) restart();
            else state.boost = true;
        }
        else if (k === 'Enter' && (state.gameover || !state.running)) restart();
        else if (k === 'p' || k === 'P') togglePause();
        else if (k === 'r' || k === 'R') restart();
        else if (k === 'Escape') togglePause();
    });
    document.addEventListener('keyup', (e) => { if (e.key === ' ') state.boost = false; });
    window.addEventListener('blur', () => { state.boost = false; });

    // Touch
    document.querySelectorAll('[data-touch]').forEach(b => {
        const action = b.dataset.touch;
        const press = (e) => {
            e.preventDefault();
            if (action === 'up') setDir(0, -1);
            else if (action === 'down') setDir(0, 1);
            else if (action === 'left') setDir(-1, 0);
            else if (action === 'right') setDir(1, 0);
            else if (action === 'pause') togglePause();
        };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('mousedown', press);
    });

    // Swipe on canvas
    let touchStart = null;
    cv.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    cv.addEventListener('touchend', (e) => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
        else setDir(0, dy > 0 ? 1 : -1);
        touchStart = null;
    }, { passive: true });

    // Buttons
    ui.btnPlay.addEventListener('click', () => {
        state.wrap = ui.wrapToggle.checked;
        ui.overlayTitle.classList.add('hidden');
        state.running = true;
        last = performance.now();
        blip(880, 0.1, 'square');
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);

    function togglePause() {
        if (!state.running || state.gameover) return;
        state.paused = !state.paused;
        ui.overlayPause.classList.toggle('hidden', !state.paused);
        if (!state.paused) last = performance.now();
    }
    function restart() {
        state.wrap = ui.wrapToggle.checked;
        ui.overlayTitle.classList.add('hidden');
        ui.overlayGameover.classList.add('hidden');
        ui.overlayPause.classList.add('hidden');
        reset();
        state.running = true;
        state.paused = false;
        last = performance.now();
    }

    // ---------- Boot ----------
    loadHS();
    renderHS();
    reset();
    state.running = false;
    requestAnimationFrame(loop);
})();
