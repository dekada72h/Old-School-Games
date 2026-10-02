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
        topReached: false,
        hammer: null,
        hammerT: 0,
        particles: [],
        throwT: 0
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
        state.hammer = { idx: 2, x: 300, taken: false };
        state.hammerT = 0;
        state.particles = [];
        state.throwT = 0;
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

    // Swept landing test: did something's "feet" cross a platform surface this frame?
    // Only platforms with index < belowIdx are considered (idx 0 is the lowest girder).
    function landing(x, prevFeet, feet, belowIdx) {
        let best = null;
        const lim = belowIdx === undefined ? PLATFORMS.length : belowIdx;
        for (let i = 0; i < lim; i++) {
            const py = platformY(PLATFORMS[i], x);
            if (prevFeet <= py + 3 && feet >= py - 0.01) {
                if (!best || py < best.y) best = { y: py, idx: i };
            }
        }
        return best;
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
        const climbSp = 100;
        const gravity = 1100;

        // Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const q = state.particles[i];
            q.age += dt;
            if (q.age >= q.life) { state.particles.splice(i, 1); continue; }
            q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt;
        }
        if (state.throwT > 0) state.throwT -= dt;
        if (state.hammerT > 0) state.hammerT -= dt;

        // Ladder check — is player at a ladder?
        let nearLadder = null;
        for (const lad of state.ladders) {
            if (Math.abs(p.x - lad.x) < 12 && p.y >= lad.yTop - 20 && p.y <= lad.yBot + 20) {
                nearLadder = lad;
                break;
            }
        }

        const prevFeet = p.y + 14;
        if (p.onLadder) {
            const dy = (state.keyD ? 1 : 0) - (state.keyU ? 1 : 0);
            p.y += dy * climbSp * dt;
            p.x = p.ladder.x;
            p.climbAnim = (p.climbAnim || 0) + Math.abs(dy) * dt * 8;
            if (dy < 0 && p.y <= p.ladder.yTop - 14) {
                p.onLadder = false;
                p.y = p.ladder.yTop - 14;
                p.vy = 0;
                const idx = p.ladder.upperIdx;
                if (idx > state.currentPlatformIdx) {
                    state.score += 200;
                    state.currentPlatformIdx = idx;
                    blip(880, 0.1);
                }
            } else if (dy > 0 && p.y >= p.ladder.yBot - 14) {
                p.onLadder = false;
                p.y = p.ladder.yBot - 14;
                p.vy = 0;
            }
        } else {
            if (state.keyL) { p.x -= moveSp * dt; p.facing = -1; }
            if (state.keyR) { p.x += moveSp * dt; p.facing = 1; }

            // Grab a ladder (not while swinging the hammer)
            if ((state.keyU || state.keyD) && nearLadder && p.onGround && state.hammerT <= 0) {
                if (state.keyU && p.y > nearLadder.yTop - 12) {
                    p.onLadder = true; p.ladder = nearLadder; p.vy = 0; p.jumping = false; p.x = nearLadder.x;
                } else if (state.keyD && p.y < nearLadder.yBot - 16) {
                    p.onLadder = true; p.ladder = nearLadder; p.vy = 0; p.jumping = false; p.x = nearLadder.x;
                }
            }

            if (!p.onLadder) {
                // Jump
                if (state.keyJump && p.onGround) {
                    p.vy = -380;
                    p.jumping = true;
                    p.onGround = false;
                    state.keyJump = false;
                    blip(660, 0.1, 'square');
                }
                // Gravity + landing (swept)
                p.vy += gravity * dt;
                p.y += p.vy * dt;
                const hit = landing(p.x, prevFeet, p.y + 14);
                if (hit && p.vy >= 0) {
                    p.y = hit.y - 14;
                    p.vy = 0;
                    p.onGround = true;
                    p.jumping = false;
                    if (hit.idx > state.currentPlatformIdx) {
                        state.score += 200;
                        state.currentPlatformIdx = hit.idx;
                        blip(880, 0.1);
                    }
                } else {
                    p.onGround = false;
                    // safety net: never fall out of the world
                    if (p.y > H + 40) { playerDie(); return; }
                }
            }
        }

        // Hammer pickup
        if (state.hammer && !state.hammer.taken) {
            const h = state.hammer;
            const hy = platformY(PLATFORMS[h.idx], h.x) - 14;
            if (Math.abs(p.x - h.x) < 18 && Math.abs(p.y - hy) < 22) {
                h.taken = true;
                state.hammerT = 8;
                p.onLadder = false;
                blip(523, 0.1, 'triangle'); blip(784, 0.12, 'triangle');
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
            state.spawnTimer = Math.max(1.3, 3.6 - state.level * 0.3);
            const startIdx = PLATFORMS.length - 2;
            const startX = 70;
            state.barrels.push({
                x: startX,
                y: platformY(PLATFORMS[startIdx], startX) - 12,
                vx: 105 + state.level * 8,
                vy: 0,
                platformIdx: startIdx,
                falling: false,
                spin: 0,
                id: Math.random()
            });
            state.throwT = 0.5;
            blip(220, 0.1, 'sawtooth');
        }

        // Barrels
        for (let i = state.barrels.length - 1; i >= 0; i--) {
            const b = state.barrels[i];
            const platform = PLATFORMS[b.platformIdx];
            const prevBottom = b.y + 12;
            if (!b.falling) {
                // Always roll downhill (flat girders keep their heading)
                const slope = platform.slope;
                const speed = Math.abs(b.vx);
                if (slope > 0) b.vx = speed; else if (slope < 0) b.vx = -speed;
                b.x += b.vx * dt;
                b.y = platformY(platform, b.x) - 12;
                b.spin += b.vx * dt * 0.08;
                // Off the end of the girder → fall to the next one down
                if (b.x < 12 || b.x > W - 12) {
                    b.falling = true;
                    b.x = Math.max(12, Math.min(W - 12, b.x));
                    b.vy = 40;
                }
                // Occasionally dive down a ladder
                if (!b.falling) {
                    for (const lad of state.ladders) {
                        if (lad.upperIdx === b.platformIdx && Math.abs(b.x - lad.x) < 6 && Math.random() < 0.04) {
                            b.falling = true; b.vy = 40; b.x = lad.x;
                            break;
                        }
                    }
                }
            } else {
                b.vy += 800 * dt;
                b.y += b.vy * dt;
                b.spin += dt * 8;
                const hit = landing(b.x, b.y - b.vy * dt + 12 - 0, b.y + 12, b.platformIdx);
                if (hit) {
                    b.y = hit.y - 12;
                    b.vy = 0;
                    b.platformIdx = hit.idx;
                    b.falling = false;
                    const sl = PLATFORMS[hit.idx].slope;
                    const speed = Math.abs(b.vx) || (105 + state.level * 8);
                    if (sl > 0) b.vx = speed;
                    else if (sl < 0) b.vx = -speed;
                    else b.vx = b.x < W / 2 ? speed : -speed;
                }
                if (b.y > H + 30) { state.barrels.splice(i, 1); continue; }
            }

            // Collision with the player
            if (state.deathT === 0 && state.winT === 0) {
                const dx = b.x - p.x, dy = b.y - (p.y + 4);
                if (Math.hypot(dx, dy) < 18) {
                    if (state.hammerT > 0) {
                        // Smash!
                        state.score += 300;
                        for (let q = 0; q < 16; q++) state.particles.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.9) * 300, age: 0, life: 0.6, color: q % 2 ? COLORS.barrel : '#ffd06b' });
                        state.barrels.splice(i, 1);
                        blip(180, 0.1, 'square'); blip(900, 0.08, 'triangle');
                        continue;
                    }
                    // Mid-air pass-over
                    const passingOver = p.jumping && (b.y - p.y) >= 8;
                    if (!passingOver) { playerDie(); return; }
                }
                // Jump-over bonus
                if (p.jumping && Math.abs(b.x - p.x) < 14 && b.y - p.y > 8 && !p.jumpedBarrels.has(b.id)) {
                    p.jumpedBarrels.add(b.id);
                    state.score += 100;
                    state.particles.push({ x: p.x, y: p.y - 20, vx: 0, vy: -40, age: 0, life: 0.7, color: '#5fffd8', text: '100' });
                    blip(1320, 0.08);
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
            state.hammerT = 0;
            if (state.hammer) state.hammer.taken = false;
        }
        updateHud();
    }

    // ---------- Render ----------
    let bgCanvas = null;
    function buildBg() {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0c0620'); grad.addColorStop(1, '#1a0a1c');
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
        // skyline silhouettes
        g.fillStyle = 'rgba(70,30,80,0.35)';
        for (let i = 0; i < 14; i++) {
            const bw = 30 + (i * 37) % 40, bh = 80 + (i * 61) % 180;
            g.fillRect(i * 42, H - bh, bw, bh);
        }
        g.fillStyle = 'rgba(255,208,107,0.18)';
        for (let i = 0; i < 90; i++) g.fillRect((i * 53) % W, H - 20 - ((i * 97) % 240), 2, 3);
        return c;
    }

    function render() {
        if (!bgCanvas) bgCanvas = buildBg();
        ctx.drawImage(bgCanvas, 0, 0);

        // Ladders
        for (const lad of state.ladders) {
            const g = ctx.createLinearGradient(lad.x - 9, 0, lad.x + 9, 0);
            g.addColorStop(0, '#6b4400'); g.addColorStop(0.5, '#ffd06b'); g.addColorStop(1, '#6b4400');
            ctx.strokeStyle = g;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(lad.x - 8, lad.yTop); ctx.lineTo(lad.x - 8, lad.yBot);
            ctx.moveTo(lad.x + 8, lad.yTop); ctx.lineTo(lad.x + 8, lad.yBot);
            ctx.stroke();
            ctx.fillStyle = COLORS.ladder;
            for (let y = lad.yTop + 8; y < lad.yBot - 2; y += 12) ctx.fillRect(lad.x - 9, y, 18, 3);
        }

        // Platforms (steel girders)
        PLATFORMS.forEach((p, idx) => {
            const y1 = platformY(p, 0), y2 = platformY(p, W);
            const g = ctx.createLinearGradient(0, Math.min(y1, y2), 0, Math.max(y1, y2) + 14);
            g.addColorStop(0, '#ff9a5a'); g.addColorStop(0.5, COLORS.girder); g.addColorStop(1, COLORS.girderDark);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, y1); ctx.lineTo(W, y2); ctx.lineTo(W, y2 + 14); ctx.lineTo(0, y1 + 14);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(W, y2); ctx.lineTo(W, y2 + 2); ctx.lineTo(0, y1 + 2); ctx.fill();
            // truss
            ctx.strokeStyle = 'rgba(90,30,0,0.55)'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x < W; x += 28) {
                const ya = platformY(p, x) + 2, yb = platformY(p, x + 14) + 12, yc = platformY(p, x + 28) + 2;
                ctx.moveTo(x, ya); ctx.lineTo(x + 14, yb); ctx.lineTo(x + 28, yc);
            }
            ctx.stroke();
            ctx.fillStyle = '#ffe2b8';
            for (let x = 14; x < W; x += 28) ctx.fillRect(x - 1, platformY(p, x) + 1, 2, 2);
        });

        // Boss ape
        drawApe(80, platformY(PLATFORMS[PLATFORMS.length - 1], 80));

        // Princess
        drawPrincess(W - 100, platformY(PLATFORMS[PLATFORMS.length - 1], W - 100));

        // Hammer pickup
        if (state.hammer && !state.hammer.taken) {
            const h = state.hammer;
            const hy = platformY(PLATFORMS[h.idx], h.x);
            const bob = Math.sin(state.animTime * 4) * 2;
            ctx.save();
            ctx.translate(h.x, hy - 14 + bob);
            ctx.shadowColor = '#ffd06b'; ctx.shadowBlur = 12;
            ctx.fillStyle = '#a36b2e'; ctx.fillRect(-2, -2, 4, 16);
            ctx.fillStyle = '#c0c4d0'; ctx.fillRect(-9, -10, 18, 10);
            ctx.restore();
        }

        // Barrels
        for (const b of state.barrels) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(2, 12, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.rotate(b.spin);
            const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, 13);
            g.addColorStop(0, '#e89a52'); g.addColorStop(1, '#8a4a18');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = COLORS.barrelBand; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
            ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill();
            ctx.restore();
        }

        // Player
        if (state.deathT === 0) drawPlayer(state.player);
        else {
            const pl = state.player;
            for (let i = 0; i < 6; i++) {
                ctx.fillStyle = i % 2 ? COLORS.player : COLORS.playerCap;
                const ang = (i / 6) * Math.PI * 2 + state.animTime * 6;
                ctx.fillRect(pl.x + Math.cos(ang) * 20, pl.y + Math.sin(ang) * 20, 5, 5);
            }
        }

        // Particles
        for (const q of state.particles) {
            ctx.globalAlpha = 1 - q.age / q.life;
            if (q.text) {
                ctx.fillStyle = q.color; ctx.font = "bold 10px 'Press Start 2P', monospace"; ctx.textAlign = 'center';
                ctx.fillText(q.text, q.x, q.y);
            } else {
                ctx.fillStyle = q.color; ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
            }
        }
        ctx.globalAlpha = 1;

        // Hammer timer
        if (state.hammerT > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(W / 2 - 50, 10, 100, 8);
            ctx.fillStyle = '#ffd06b'; ctx.fillRect(W / 2 - 50, 10, 100 * state.hammerT / 8, 8);
        }

        // Lives icons
        for (let i = 0; i < state.lives - 1; i++) {
            ctx.fillStyle = COLORS.player;
            ctx.fillRect(20 + i * 20, H - 18, 8, 12);
            ctx.fillStyle = COLORS.playerCap;
            ctx.fillRect(20 + i * 20 - 1, H - 22, 10, 4);
        }
    }

    function drawApe(x, baseY) {
        const throwing = state.throwT > 0;
        const bob = Math.sin(state.animTime * 3) * 1.5;
        ctx.save();
        ctx.translate(x, baseY);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, 1, 34, 6, 0, 0, Math.PI * 2); ctx.fill();
        // body
        const g = ctx.createRadialGradient(-6, -34 + bob, 4, 0, -28 + bob, 34);
        g.addColorStop(0, '#b891ff'); g.addColorStop(1, COLORS.apeDark);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -26 + bob, 30, 26, 0, 0, Math.PI * 2); ctx.fill();
        // chest
        ctx.fillStyle = '#d9c0a0';
        ctx.beginPath(); ctx.ellipse(0, -22 + bob, 16, 16, 0, 0, Math.PI * 2); ctx.fill();
        // arms
        ctx.strokeStyle = COLORS.apeDark; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-24, -34 + bob); ctx.lineTo(-34, -12 + bob);
        ctx.moveTo(24, -34 + bob); ctx.lineTo(throwing ? 44 : 34, throwing ? -44 + bob : -12 + bob);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // head
        ctx.fillStyle = COLORS.ape;
        ctx.beginPath(); ctx.arc(0, -56 + bob, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8cfae';
        ctx.beginPath(); ctx.ellipse(0, -52 + bob, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-9, -64 + bob, 7, 6); ctx.fillRect(2, -64 + bob, 7, 6);
        ctx.fillStyle = '#ff2e63';
        ctx.fillRect(-6, -62 + bob, 3, 3); ctx.fillRect(4, -62 + bob, 3, 3);
        ctx.strokeStyle = '#2a1050'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-11, -68 + bob); ctx.lineTo(-2, -64 + bob); ctx.moveTo(11, -68 + bob); ctx.lineTo(2, -64 + bob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, -48 + bob); ctx.lineTo(5, -48 + bob); ctx.stroke();
        ctx.restore();
    }

    function drawPrincess(x, baseY) {
        const sway = Math.sin(state.animTime * 3) * 1.5;
        ctx.save();
        ctx.translate(x, baseY);
        ctx.fillStyle = COLORS.princess;
        ctx.beginPath(); ctx.moveTo(-5, -22); ctx.lineTo(5, -22); ctx.lineTo(12 + sway, 0); ctx.lineTo(-12 + sway, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd6b3'; ctx.beginPath(); ctx.arc(0, -28, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.princessHair;
        ctx.beginPath(); ctx.arc(0, -31, 7, Math.PI, 0); ctx.fill();
        ctx.fillRect(-7, -31, 3, 12); ctx.fillRect(4, -31, 3, 12);
        if (Math.floor(state.animTime * 2) % 2 === 0) {
            ctx.fillStyle = '#fff';
            ctx.font = "bold 10px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.fillText('HELP!', 0, -46);
        }
        ctx.restore();
    }

    function drawPlayer(p) {
        const walking = (state.keyL || state.keyR) && p.onGround && !p.onLadder;
        const swing = walking ? Math.sin(state.animTime * 14) * 3 : 0;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(0, 14, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        if (p.onLadder) {
            const sw = Math.sin((p.climbAnim || 0)) * 3;
            ctx.fillStyle = '#2a6fd0'; ctx.fillRect(-7, -4, 14, 14);
            ctx.fillStyle = '#ffd6b3'; ctx.fillRect(-9, -8 + sw, 4, 5); ctx.fillRect(5, -8 - sw, 4, 5);
            ctx.fillStyle = '#ffd6b3'; ctx.fillRect(-6, -14, 12, 10);
            ctx.fillStyle = COLORS.playerCap; ctx.fillRect(-7, -17, 14, 5);
            ctx.fillStyle = '#4a2a10'; ctx.fillRect(-6, 10, 5, 5 + sw); ctx.fillRect(1, 10, 5, 5 - sw);
        } else {
            ctx.scale(p.facing, 1);
            // legs
            ctx.fillStyle = '#2a4fb0';
            ctx.fillRect(-7, 8, 5, 6 + swing * 0.5); ctx.fillRect(2, 8, 5, 6 - swing * 0.5);
            ctx.fillStyle = '#4a2a10';
            ctx.fillRect(-8, 13 + swing * 0.5, 7, 3); ctx.fillRect(2, 13 - swing * 0.5, 7, 3);
            // torso
            ctx.fillStyle = COLORS.playerCap; ctx.fillRect(-8, -4, 16, 8);
            ctx.fillStyle = '#2a6fd0'; ctx.fillRect(-7, 0, 14, 10);
            ctx.fillStyle = '#ffd06b'; ctx.fillRect(-4, 2, 2, 2); ctx.fillRect(2, 2, 2, 2);
            // head
            ctx.fillStyle = '#ffd6b3'; ctx.fillRect(-6, -14, 12, 11);
            ctx.fillStyle = '#3a2410'; ctx.fillRect(-6, -8, 12, 2);
            ctx.fillStyle = '#0a0617'; ctx.fillRect(2, -11, 2, 3);
            // cap
            ctx.fillStyle = COLORS.playerCap; ctx.fillRect(-7, -17, 14, 5); ctx.fillRect(1, -14, 9, 2);
            // arms / hammer
            if (state.hammerT > 0) {
                const sw = Math.sin(state.animTime * 16);
                ctx.fillStyle = '#ffd6b3'; ctx.fillRect(5, -6, 5, 4);
                ctx.save(); ctx.translate(8, -4); ctx.rotate(-0.9 + sw * 0.9);
                ctx.fillStyle = '#a36b2e'; ctx.fillRect(-2, -20, 4, 22);
                ctx.fillStyle = '#c0c4d0'; ctx.fillRect(-9, -28, 18, 10);
                ctx.restore();
            } else if (!p.onGround) {
                ctx.fillStyle = '#ffd6b3'; ctx.fillRect(5, -12, 4, 6);
            } else {
                ctx.fillStyle = '#ffd6b3'; ctx.fillRect(5, -2 - swing * 0.3, 4, 5);
            }
        }
        ctx.restore();
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover) step(dt);
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
        ui.oTitle.classList.add('hidden');
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
