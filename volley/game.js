/* ================================================================
   VOLLEY — modern Pong remake
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        scoreP: $('score-p'), scoreC: $('score-c'),
        rally: $('rally'), best: $('best'),
        hsRally: $('hs-rally'), hsWins: $('hs-wins'),
        endTitle: $('end-title'), endTag: $('end-tag'),
        difficulty: $('difficulty'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'), oEnd: $('overlay-end'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'), btnRetry: $('btn-retry')
    };

    const PADDLE_W = 12, PADDLE_H = 90;
    const BALL_R = 9;
    const TARGET = 11;

    const DIFFICULTY = {
        easy:       { reaction: 0.20, accuracy: 0.7, speed: 360 },
        normal:     { reaction: 0.10, accuracy: 0.85, speed: 420 },
        hard:       { reaction: 0.04, accuracy: 0.95, speed: 480 },
        impossible: { reaction: 0.01, accuracy: 1.0,  speed: 520 }
    };

    const COLORS = {
        bg: '#050208',
        net: 'rgba(255,255,255,0.4)',
        paddle: '#ffffff',
        paddleP: '#5fd0ff',
        paddleC: '#ff66cc',
        ball: '#ffffff',
        trail: 'rgba(255,255,255,0.2)'
    };

    const state = {
        running: false, paused: false, ended: false,
        scoreP: 0, scoreC: 0,
        rally: 0, bestRally: 0, wins: 0,
        diff: 'normal',
        pY: H / 2, cY: H / 2,
        cTargetY: H / 2, cReact: 0,
        ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, trail: [] },
        keyU: false, keyD: false,
        mouseY: null,
        ballSpeed: DIFFICULTY.normal.speed,
        animTime: 0,
        flash: 0,
        sparks: [],
        serveT: 0
    };

    const KEY = 'osg.volley.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) { const o = JSON.parse(r); state.bestRally = o.rally || 0; state.wins = o.wins || 0; }
        } catch {}
    }
    function saveHS() { try { localStorage.setItem(KEY, JSON.stringify({ rally: state.bestRally, wins: state.wins })); } catch {} }
    function bump() {
        let d = false;
        if (state.rally > state.bestRally) { state.bestRally = state.rally; d = true; }
        if (d) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestRally;
        ui.hsRally.textContent = state.bestRally;
        ui.hsWins.textContent = state.wins;
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

    function reset(loserSide) {
        const cfg = DIFFICULTY[state.diff];
        state.ballSpeed = cfg.speed;
        state.ball.x = W / 2;
        state.ball.y = H / 2;
        const angle = (Math.random() - 0.5) * 0.5;
        const dir = loserSide === 'P' ? 1 : (loserSide === 'C' ? -1 : (Math.random() < 0.5 ? 1 : -1));
        state.ball.vx = Math.cos(angle) * state.ballSpeed * dir;
        state.ball.vy = Math.sin(angle) * state.ballSpeed;
        state.ball.trail = [];
        state.serveT = 0.7;
        state.rally = 0;
        ui.rally.textContent = 0;
    }

    function newMatch() {
        state.scoreP = 0;
        state.scoreC = 0;
        state.ended = false;
        state.diff = ui.difficulty.value;
        ui.scoreP.textContent = 0;
        ui.scoreC.textContent = 0;
        reset();
    }

    function step(dt) {
        state.animTime += dt;

        // Player paddle
        if (state.mouseY !== null) {
            state.pY += (state.mouseY - state.pY) * Math.min(1, dt * 16);
        } else {
            const sp = 480;
            if (state.keyU) state.pY -= sp * dt;
            if (state.keyD) state.pY += sp * dt;
        }
        state.pY = Math.max(PADDLE_H / 2 + 6, Math.min(H - PADDLE_H / 2 - 6, state.pY));

        // CPU paddle
        const cfg = DIFFICULTY[state.diff];
        state.cReact += dt;
        if (state.cReact >= cfg.reaction) {
            state.cReact = 0;
            // Predict where ball will hit CPU side, with some inaccuracy
            if (state.ball.vx > 0) {
                const t = (W - PADDLE_W - 12 - state.ball.x) / Math.max(1, state.ball.vx);
                let predY = state.ball.y + state.ball.vy * t;
                // Account for one bounce
                const bounceY = ((predY % (2 * H)) + 2 * H) % (2 * H);
                predY = bounceY > H ? 2 * H - bounceY : bounceY;
                const error = (1 - cfg.accuracy) * (Math.random() - 0.5) * H * 0.5;
                state.cTargetY = predY + error;
            } else {
                state.cTargetY = H / 2;
            }
        }
        const dy = state.cTargetY - state.cY;
        const cSp = 360;
        state.cY += Math.sign(dy) * Math.min(Math.abs(dy), cSp * dt);
        state.cY = Math.max(PADDLE_H / 2 + 6, Math.min(H - PADDLE_H / 2 - 6, state.cY));

        // Ball
        if (state.serveT > 0) {
            state.serveT -= dt;
            return;
        }

        state.ball.trail.push({ x: state.ball.x, y: state.ball.y });
        if (state.ball.trail.length > 14) state.ball.trail.shift();

        state.ball.x += state.ball.vx * dt;
        state.ball.y += state.ball.vy * dt;

        // Top/bottom walls
        if (state.ball.y - BALL_R < 0) { state.ball.y = BALL_R; state.ball.vy = Math.abs(state.ball.vy); blip(440, 0.04); spawnSparks(state.ball.x, 0); }
        if (state.ball.y + BALL_R > H) { state.ball.y = H - BALL_R; state.ball.vy = -Math.abs(state.ball.vy); blip(440, 0.04); spawnSparks(state.ball.x, H); }

        // Player paddle collision
        const px = 18;
        if (state.ball.vx < 0 &&
            state.ball.x - BALL_R < px + PADDLE_W &&
            state.ball.x - BALL_R > px - 4 &&
            state.ball.y > state.pY - PADDLE_H / 2 - BALL_R &&
            state.ball.y < state.pY + PADDLE_H / 2 + BALL_R) {
            const rel = (state.ball.y - state.pY) / (PADDLE_H / 2);
            const angle = rel * (Math.PI * 0.35);
            const sp = Math.hypot(state.ball.vx, state.ball.vy) * 1.04;
            state.ball.vx = Math.cos(angle) * sp;
            state.ball.vy = Math.sin(angle) * sp;
            state.ball.x = px + PADDLE_W + BALL_R + 1;
            state.rally++;
            ui.rally.textContent = state.rally;
            blip(660, 0.06, 'square');
            spawnSparks(state.ball.x, state.ball.y, 6, COLORS.paddleP);
        }

        // CPU paddle collision
        const cx = W - 18 - PADDLE_W;
        if (state.ball.vx > 0 &&
            state.ball.x + BALL_R > cx &&
            state.ball.x + BALL_R < cx + PADDLE_W + 4 &&
            state.ball.y > state.cY - PADDLE_H / 2 - BALL_R &&
            state.ball.y < state.cY + PADDLE_H / 2 + BALL_R) {
            const rel = (state.ball.y - state.cY) / (PADDLE_H / 2);
            const angle = Math.PI - rel * (Math.PI * 0.35);
            const sp = Math.hypot(state.ball.vx, state.ball.vy) * 1.04;
            state.ball.vx = Math.cos(angle) * sp;
            state.ball.vy = Math.sin(angle) * sp;
            state.ball.x = cx - BALL_R - 1;
            state.rally++;
            ui.rally.textContent = state.rally;
            blip(880, 0.06, 'square');
            spawnSparks(state.ball.x, state.ball.y, 6, COLORS.paddleC);
        }

        // Cap ball speed
        const sp = Math.hypot(state.ball.vx, state.ball.vy);
        const maxSp = state.ballSpeed * 2;
        if (sp > maxSp) {
            state.ball.vx = (state.ball.vx / sp) * maxSp;
            state.ball.vy = (state.ball.vy / sp) * maxSp;
        }

        // Score
        if (state.ball.x < -BALL_R) {
            state.scoreC++;
            ui.scoreC.textContent = state.scoreC;
            state.flash = 1.0;
            blip(180, 0.4, 'sawtooth', 0.06);
            bump();
            if (state.scoreC >= TARGET) endMatch(false);
            else reset('P');
        } else if (state.ball.x > W + BALL_R) {
            state.scoreP++;
            ui.scoreP.textContent = state.scoreP;
            state.flash = 1.0;
            for (let i = 0; i < 3; i++) setTimeout(() => blip(660 + i * 220, 0.1, 'square'), i * 60);
            bump();
            if (state.scoreP >= TARGET) endMatch(true);
            else reset('C');
        }

        // Sparks
        for (let i = state.sparks.length - 1; i >= 0; i--) {
            const s = state.sparks[i];
            s.age += dt;
            if (s.age >= s.life) { state.sparks.splice(i, 1); continue; }
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= 0.9;
            s.vy *= 0.9;
        }

        if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.5);
    }

    function spawnSparks(x, y, n = 8, color = '#fff') {
        for (let i = 0; i < n; i++) {
            state.sparks.push({
                x, y,
                vx: (Math.random() - 0.5) * 240,
                vy: (Math.random() - 0.5) * 240,
                age: 0, life: 0.4 + Math.random() * 0.3,
                color, size: 2 + Math.random() * 2
            });
        }
    }

    function endMatch(won) {
        state.ended = true;
        state.running = false;
        if (won) state.wins++;
        saveHS();
        renderHS();
        ui.endTitle.textContent = won ? 'YOU WIN!' : 'CPU WINS';
        ui.endTag.textContent = `${state.scoreP} - ${state.scoreC} · best rally: ${state.bestRally}`;
        setTimeout(() => ui.oEnd.classList.remove('hidden'), 600);
    }

    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Score flash
        if (state.flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.15})`;
            ctx.fillRect(0, 0, W, H);
        }

        // Net
        ctx.fillStyle = COLORS.net;
        for (let y = 0; y < H; y += 24) {
            ctx.fillRect(W / 2 - 2, y + 4, 4, 14);
        }

        // Big background scores
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.font = "bold 160px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(state.scoreP, W / 4, H / 2);
        ctx.fillText(state.scoreC, 3 * W / 4, H / 2);

        // Ball trail
        for (let i = 0; i < state.ball.trail.length; i++) {
            const t = state.ball.trail[i];
            const a = (i / state.ball.trail.length) * 0.5;
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillRect(t.x - 4, t.y - 4, 8, 8);
        }

        // Ball
        ctx.fillStyle = COLORS.ball;
        ctx.fillRect(state.ball.x - BALL_R, state.ball.y - BALL_R, BALL_R * 2, BALL_R * 2);

        // Paddles (with subtle accent)
        const px = 18;
        ctx.fillStyle = COLORS.paddle;
        ctx.fillRect(px, state.pY - PADDLE_H / 2, PADDLE_W, PADDLE_H);
        ctx.fillStyle = COLORS.paddleP;
        ctx.fillRect(px, state.pY - PADDLE_H / 2, 3, PADDLE_H);

        const cx = W - 18 - PADDLE_W;
        ctx.fillStyle = COLORS.paddle;
        ctx.fillRect(cx, state.cY - PADDLE_H / 2, PADDLE_W, PADDLE_H);
        ctx.fillStyle = COLORS.paddleC;
        ctx.fillRect(cx + PADDLE_W - 3, state.cY - PADDLE_H / 2, 3, PADDLE_H);

        // Sparks
        for (const s of state.sparks) {
            ctx.globalAlpha = 1 - s.age / s.life;
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        // Serve indicator
        if (state.serveT > 0 && state.running && !state.paused) {
            ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(state.animTime * 8) * 0.3})`;
            ctx.font = "16px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('READY', W / 2, H - 30);
        }
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.ended) step(dt);
        render();
        requestAnimationFrame(loop);
    }

    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') state.keyU = true;
        else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') state.keyD = true;
        else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
        else if (e.key === 'r' || e.key === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') state.keyU = false;
        else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') state.keyD = false;
    });

    cv.addEventListener('mousemove', (e) => {
        const r = cv.getBoundingClientRect();
        state.mouseY = (e.clientY - r.top) * (H / r.height);
    });
    cv.addEventListener('mouseleave', () => { state.mouseY = null; });
    cv.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const r = cv.getBoundingClientRect();
            state.mouseY = (e.touches[0].clientY - r.top) * (H / r.height);
            e.preventDefault();
        }
    }, { passive: false });
    cv.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const r = cv.getBoundingClientRect();
            state.mouseY = (e.touches[0].clientY - r.top) * (H / r.height);
        }
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const press = (e) => { e.preventDefault();
            if (a === 'up') { state.keyU = true; state.mouseY = null; }
            else if (a === 'down') { state.keyD = true; state.mouseY = null; }
            else if (a === 'pause') togglePause();
        };
        const release = () => { if (a === 'up') state.keyU = false; if (a === 'down') state.keyD = false; };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('touchend', release);
        b.addEventListener('mousedown', press);
        b.addEventListener('mouseup', release);
    });

    function togglePause() {
        if (!state.running || state.ended) return;
        state.paused = !state.paused;
        ui.oPause.classList.toggle('hidden', !state.paused);
        if (!state.paused) last = performance.now();
    }
    function restart() {
        ui.oEnd.classList.add('hidden');
        ui.oPause.classList.add('hidden');
        newMatch();
        state.running = true;
        last = performance.now();
    }

    ui.btnPlay.addEventListener('click', () => {
        ui.oTitle.classList.add('hidden');
        newMatch();
        state.running = true;
        last = performance.now();
        blip(880, 0.1);
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);

    loadHS();
    renderHS();
    state.running = false;
    requestAnimationFrame(loop);
})();
