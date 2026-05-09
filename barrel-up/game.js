/* ================================================================
   BARREL UP — fan tribute inspired by Donkey Kong
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

    const COLORS = {
        bg: '#050208',
        girder: '#ff7a3c',
        girderDark: '#c9531c',
        ladder: '#ffd06b',
        ladderRail: '#a36b00',
        barrel: '#c9722e',
        barrelBand: '#5a3d1a',
        player: '#5fd0ff',
        playerCap: '#ff2e63',
        ape: '#9b6bff',
        apeDark: '#6644cc',
        princess: '#ff66cc',
        princessHair: '#ffd06b'
    };

    // Platforms (girders) — y position + slope (-1 = right-down, 1 = left-down)
    // y1 < y2 means platform tilts (downhill direction)
    // Stored as: { x1, y1, x2, y2, leftBound, rightBound }
    // For simplicity, all platforms span full width but at slight angle
    const PLATFORMS = [
        // Bottom (player start)
        { y: H - 40, slope: 0, leftLad: null, rightLad: 460 },
        { y: H - 160, slope: -0.07, leftLad: 100, rightLad: null },
        { y: H - 280, slope: 0.07, leftLad: null, rightLad: 460 },
        { y: H - 400, slope: -0.07, leftLad: 100, rightLad: null },
        { y: H - 520, slope: 0.07, leftLad: null, rightLad: 460 },
        // Top (princess)
        { y: H - 640, slope: 0, leftLad: null, rightLad: null }
    ];

    function platformY(p, x) {
        // Linear slope around midpoint
        return p.y + (x - W / 2) * p.slope;
    }

    function isOnPlatform(x, y, p, tolerance = 4) {
        const py = platformY(p, x);
        return y >= py - tolerance && y <= py + tolerance;
    }

    // Ladders — connect platform i to platform i+1 at column x
    function buildLadders() {
        const lads = [];
        for (let i = 0; i < PLATFORMS.length - 1; i++) {
            const lower = PLATFORMS[i];
            const upper = PLATFORMS[i + 1];
            // Ladder is at lower's leftLad or rightLad
            const x = lower.rightLad !== null ? lower.rightLad : lower.leftLad;
            if (x === null) continue;
            lads.push({
                x,
                yTop: platformY(upper, x),
                yBot: platformY(lower, x),
                lowerIdx: i,
                upperIdx: i + 1
            });
        }
        return lads;
    }

    const state = {
        running: false, paused: false, gameover: false,
        score: 0, lives: 3, level: 1,
        bestScore: 0, bestLevel: 0,
        ladders: [],
        player: null,
        barrels: [],
        spawnTimer: 0,
        animTime: 0,
        keyL: false, keyR: false, keyU: false, keyD: false, keyJump: false,
        deathT: 0,
        winT: 0,
        currentPlatformIdx: 0,
        topReached: false
    };

    const KEY = 'osg.barrel-up.hs';
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

    // ---------- Setup ----------
    function spawnPlayer() {
        return {
            x: 60,
            y: platformY(PLATFORMS[0], 60) - 14,
            vy: 0,
            w: 18, h: 28,
            facing: 1,
            onGround: true,
            onLadder: false,
            ladder: null,
            jumping: false,
            jumpedBarrels: new Set()
        };
    }

    function newLevel() {
        state.ladders = buildLadders();
        state.player = spawnPlayer();
        state.barrels = [];
        state.spawnTimer = 1.5;
        state.currentPlatformIdx = 0;
        state.topReached = false;
        ui.levelTitle.textContent = `LEVEL ${state.level}`;
        ui.levelTag.textContent = state.level === 1 ? 'Get climbing!' : 'More barrels. Watch out.';
        ui.oLevel.classList.remove('hidden');
        setTimeout(() => ui.oLevel.classList.add('hidden'), 1300);
    }

    function newGame() {
        state.score = 0;
        state.lives = 3;
        state.level = 1;
        state.gameover = false;
        newLevel();
        updateHud();
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.level.textContent = state.level;
    }

    function findPlatformAt(x, y) {
        let best = -1;
        for (let i = PLATFORMS.length - 1; i >= 0; i--) {
            const py = platformY(PLATFORMS[i], x);
            if (y <= py + 4 && y >= py - 60) { best = i; break; }
        }
        return best;
    }

    function platformBelowY(x, y) {
        // Returns the y of the closest platform below the player
        for (let i = 0; i < PLATFORMS.length; i++) {
            const py = platformY(PLATFORMS[i], x);
            if (py >= y - 2) return { y: py, idx: i };
        }
        return null;
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

        const p = state.player;
        const moveSp = 130;
        const climbSp = 110;
        const gravity = 1100;

        // Ladder check — is player on a ladder?
        let nearLadder = null;
        for (const lad of state.ladders) {
            if (Math.abs(p.x - lad.x) < 14 && p.y >= lad.yTop - 20 && p.y <= lad.yBot + 20) {
                nearLadder = lad;
                break;
            }
        }

        if (p.onLadder) {
            // Climbing
            if (state.keyU) p.y -= climbSp * dt;
            if (state.keyD) p.y += climbSp * dt;
            // Snap x to ladder
            p.x = p.ladder.x;
            // Exit ladder at top/bottom
            if (p.y <= p.ladder.yTop - 2) {
                p.onLadder = false;
                p.y = p.ladder.yTop - 14;
                // Score for reaching new platform
                const idx = p.ladder.upperIdx;
                if (idx > state.currentPlatformIdx) {
                    state.score += 200;
                    state.currentPlatformIdx = idx;
                    blip(880, 0.1);
                }
            }
            if (p.y >= p.ladder.yBot - 14) {
                p.onLadder = false;
                p.y = p.ladder.yBot - 14;
            }
            if ((state.keyL || state.keyR) && p.y < p.ladder.yBot - 14 && p.y > p.ladder.yTop) {
                // Ignore — must be at platform level to leave
            }
        } else {
            // On ground or in air
            if (state.keyL) { p.x -= moveSp * dt; p.facing = -1; }
            if (state.keyR) { p.x += moveSp * dt; p.facing = 1; }

            // Get on ladder
            if ((state.keyU || state.keyD) && nearLadder) {
                if (state.keyU && p.y > nearLadder.yTop + 4) {
                    p.onLadder = true;
                    p.ladder = nearLadder;
                    p.vy = 0;
                    p.jumping = false;
                } else if (state.keyD && p.y < nearLadder.yBot - 16) {
                    p.onLadder = true;
                    p.ladder = nearLadder;
                    p.vy = 0;
                    p.jumping = false;
                }
            }

            // Gravity
            p.vy += gravity * dt;
            p.y += p.vy * dt;

            // Land on platform
            const next = platformBelowY(p.x, p.y - 14);
            if (next && p.vy > 0 && p.y >= next.y - 14 - 1) {
                p.y = next.y - 14;
                p.vy = 0;
                p.onGround = true;
                p.jumping = false;
                if (next.idx > state.currentPlatformIdx) {
                    state.score += 200;
                    state.currentPlatformIdx = next.idx;
                    blip(880, 0.1);
                }
            } else {
                p.onGround = false;
            }

            // Jump
            if (state.keyJump && p.onGround && !p.jumping) {
                p.vy = -380;
                p.jumping = true;
                state.keyJump = false;
                blip(660, 0.1, 'square');
            }
        }

        // Bounds
        p.x = Math.max(20, Math.min(W - 20, p.x));

        // Win condition: reach top platform
        if (state.currentPlatformIdx === PLATFORMS.length - 1 && !state.topReached) {
            state.topReached = true;
            state.score += 5000;
            state.winT = 2;
            bump();
            for (let i = 0; i < 8; i++) setTimeout(() => blip(440 + i * 80, 0.1), i * 70);
            return;
        }

        // Spawn barrels
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
            state.spawnTimer = Math.max(1.2, 3.5 - state.level * 0.3);
            // Barrel starts at top platform (idx = PLATFORMS.length - 2 to give one platform of margin)
            const startP = PLATFORMS[PLATFORMS.length - 2];
            const startX = 80;
            state.barrels.push({
                x: startX,
                y: platformY(startP, startX) - 12,
                vx: 100 + state.level * 8,
                vy: 0,
                platformIdx: PLATFORMS.length - 2,
                falling: false,
                spin: 0,
                id: Math.random()
            });
            blip(220, 0.1, 'sawtooth');
        }

        // Barrels
        for (let i = state.barrels.length - 1; i >= 0; i--) {
            const b = state.barrels[i];
            const platform = PLATFORMS[b.platformIdx];
            if (!b.falling) {
                // Roll along platform
                b.x += b.vx * dt;
                b.y = platformY(platform, b.x) - 12;
                b.spin += b.vx * dt * 0.04;
                // Reverse direction at boundary platform's slope-end (rolls toward downhill side)
                const slope = platform.slope;
                if (Math.sign(b.vx) !== Math.sign(slope) && slope !== 0) {
                    b.vx = -b.vx;
                }
                // Off platform edge → fall
                if (b.x < 10 || b.x > W - 10) {
                    b.falling = true;
                    b.x = Math.max(15, Math.min(W - 15, b.x));
                }
                // Fall down ladder occasionally (random)
                for (const lad of state.ladders) {
                    if (lad.lowerIdx === b.platformIdx - 1 && Math.abs(b.x - lad.x) < 12 && Math.random() < 0.02) {
                        b.falling = true;
                        b.targetIdx = b.platformIdx - 1;
                        break;
                    }
                }
            } else {
                b.vy += 800 * dt;
                b.y += b.vy * dt;
                b.spin += dt * 8;
                // Land on a platform below?
                const next = platformBelowY(b.x, b.y - 12);
                if (next && b.vy > 0 && b.y >= next.y - 12 - 1) {
                    b.y = next.y - 12;
                    b.vy = 0;
                    b.platformIdx = next.idx;
                    b.falling = false;
                    // Direction follows the slope's downhill side; on flat platforms keep heading
                    // away from the wall the barrel just bounced off (or rightward by default).
                    const slope = PLATFORMS[next.idx].slope;
                    const speed = Math.abs(b.vx) || (100 + state.level * 8);
                    if (slope > 0) b.vx = -speed;
                    else if (slope < 0) b.vx = speed;
                    else b.vx = b.x < W / 2 ? speed : -speed;
                }
                if (b.y > H + 30) state.barrels.splice(i, 1);
            }
            // Collision with player
            if (state.deathT === 0 && state.winT === 0) {
                if (Math.hypot(b.x - p.x, b.y - p.y + 8) < 16) {
                    // Mid-air pass-over: barrel below player AND player's feet are above barrel
                    // top by a margin. Works for both ascending and descending arcs.
                    const passingOver = p.jumping && (b.y - p.y) >= 6;
                    if (!passingOver) {
                        playerDie();
                        return;
                    }
                }
                // Score for jumping over a barrel: when player y is above barrel y while in jump
                if (p.jumping && Math.abs(b.x - p.x) < 14 && b.y - p.y > 8 && !p.jumpedBarrels.has(b.id)) {
                    p.jumpedBarrels.add(b.id);
                    state.score += 100;
                    blip(1320, 0.08);
                    updateHud();
                }
            }
        }

        updateHud();
    }

    function playerDie() {
        if (state.deathT > 0) return;
        state.deathT = 1.2;
        for (let i = 0; i < 4; i++) setTimeout(() => blip(220 - i * 30, 0.18, 'sawtooth'), i * 80);
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
            state.player = spawnPlayer();
            state.barrels = [];
            state.spawnTimer = 1.5;
            state.currentPlatformIdx = 0;
        }
        updateHud();
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        // Stars (very faint)
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        for (let i = 0; i < 30; i++) {
            const x = (i * 73) % W;
            const y = (i * 41) % H;
            ctx.fillRect(x, y, 1, 1);
        }

        // Ladders
        for (const lad of state.ladders) {
            ctx.strokeStyle = COLORS.ladderRail;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(lad.x - 8, lad.yTop);
            ctx.lineTo(lad.x - 8, lad.yBot);
            ctx.moveTo(lad.x + 8, lad.yTop);
            ctx.lineTo(lad.x + 8, lad.yBot);
            ctx.stroke();
            // Rungs
            ctx.fillStyle = COLORS.ladder;
            for (let y = lad.yTop + 6; y < lad.yBot; y += 12) {
                ctx.fillRect(lad.x - 10, y, 20, 3);
            }
        }

        // Platforms
        for (const p of PLATFORMS) {
            ctx.fillStyle = COLORS.girder;
            const y1 = platformY(p, 0);
            const y2 = platformY(p, W);
            ctx.beginPath();
            ctx.moveTo(0, y1);
            ctx.lineTo(W, y2);
            ctx.lineTo(W, y2 + 10);
            ctx.lineTo(0, y1 + 10);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = COLORS.girderDark;
            // Rivets
            for (let x = 20; x < W; x += 40) {
                const yy = platformY(p, x);
                ctx.fillRect(x - 1, yy + 4, 2, 2);
            }
        }

        // Boss ape (decorative top-left)
        const apeY = platformY(PLATFORMS[PLATFORMS.length - 1], 80);
        ctx.fillStyle = COLORS.ape;
        ctx.beginPath();
        ctx.arc(80, apeY - 30, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.apeDark;
        ctx.beginPath();
        ctx.arc(80, apeY - 26, 18, 0, Math.PI);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(72, apeY - 36, 3, 4);
        ctx.fillRect(85, apeY - 36, 3, 4);
        ctx.fillStyle = '#ff2e63';
        ctx.fillRect(73, apeY - 35, 1.5, 2);
        ctx.fillRect(86, apeY - 35, 1.5, 2);

        // Princess (decorative top-right area)
        const princessX = W - 100;
        const princessY = platformY(PLATFORMS[PLATFORMS.length - 1], princessX);
        ctx.fillStyle = COLORS.princess;
        ctx.fillRect(princessX - 8, princessY - 22, 16, 22);
        ctx.fillStyle = '#fff';
        ctx.fillRect(princessX - 5, princessY - 28, 10, 8);
        ctx.fillStyle = COLORS.princessHair;
        ctx.fillRect(princessX - 7, princessY - 30, 14, 5);
        ctx.fillStyle = '#ff66cc';
        // Help! text bubble
        if (Math.floor(state.animTime * 2) % 2 === 0) {
            ctx.fillStyle = '#fff';
            ctx.font = "bold 10px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.fillText('HELP!', princessX, princessY - 40);
        }

        // Barrels
        for (const b of state.barrels) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.spin);
            ctx.fillStyle = COLORS.barrel;
            ctx.fillRect(-12, -10, 24, 20);
            ctx.fillStyle = COLORS.barrelBand;
            ctx.fillRect(-12, -8, 24, 2);
            ctx.fillRect(-12, 0, 24, 2);
            ctx.fillRect(-12, 6, 24, 2);
            ctx.restore();
        }

        // Player
        if (state.deathT === 0) {
            const p = state.player;
            // Body
            ctx.fillStyle = COLORS.player;
            ctx.fillRect(p.x - 8, p.y - 4, 16, 14);
            // Head
            ctx.fillStyle = '#ffd6b3';
            ctx.fillRect(p.x - 6, p.y - 14, 12, 10);
            // Cap
            ctx.fillStyle = COLORS.playerCap;
            ctx.fillRect(p.x - 7, p.y - 16, 14, 4);
            ctx.fillRect(p.x - 7 + (p.facing > 0 ? 4 : -4), p.y - 14, 6, 2);
            // Legs
            ctx.fillStyle = '#5fd0ff';
            const legSwing = state.keyL || state.keyR ? Math.sin(state.animTime * 12) * 2 : 0;
            ctx.fillRect(p.x - 7, p.y + 10, 4, 6 + legSwing);
            ctx.fillRect(p.x + 3, p.y + 10, 4, 6 - legSwing);
        } else {
            // Death stars
            for (let i = 0; i < 5; i++) {
                ctx.fillStyle = i % 2 ? COLORS.player : COLORS.playerCap;
                const ang = (i / 5) * Math.PI * 2 + state.animTime * 6;
                const r = 18;
                ctx.fillRect(state.player.x + Math.cos(ang) * r, state.player.y + Math.sin(ang) * r, 4, 4);
            }
        }

        // Lives icons
        for (let i = 0; i < state.lives - 1; i++) {
            ctx.fillStyle = COLORS.player;
            ctx.fillRect(20 + i * 20, H - 18, 8, 12);
            ctx.fillStyle = COLORS.playerCap;
            ctx.fillRect(20 + i * 20 - 1, H - 22, 10, 3);
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
        else if (k === ' ') state.keyJump = true;
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = false;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') state.keyU = false;
        if (k === 'ArrowDown' || k === 's' || k === 'S') state.keyD = false;
        if (k === ' ') state.keyJump = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        let touchActive = false;
        const press = (e) => { e.preventDefault();
            if (e.type === 'touchstart') touchActive = true;
            // Suppress mousedown that follows a touch (ghost click on mobile).
            if (e.type === 'mousedown' && touchActive) return;
            if (a === 'left') state.keyL = true;
            else if (a === 'right') state.keyR = true;
            else if (a === 'up') state.keyU = true;
            else if (a === 'down') state.keyD = true;
            else if (a === 'jump') state.keyJump = true;
            else if (a === 'pause') togglePause();
        };
        const release = (e) => {
            if (e && e.type === 'touchend') {
                // Re-arm mouse fallback after a short delay so a real mouse click still works.
                setTimeout(() => { touchActive = false; }, 400);
            }
            if (a === 'left') state.keyL = false;
            if (a === 'right') state.keyR = false;
            if (a === 'up') state.keyU = false;
            if (a === 'down') state.keyD = false;
            if (a === 'jump') state.keyJump = false;
        };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('touchend', release);
        b.addEventListener('touchcancel', release);
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
    state.ladders = buildLadders();
    state.player = spawnPlayer();
    state.running = false;
    requestAnimationFrame(loop);
})();
