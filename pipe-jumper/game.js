/* ================================================================
   PIPE JUMPER — fan tribute inspired by Super Mario Bros.
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), coins: $('coins'), world: $('world'),
        lives: $('lives'), best: $('best'),
        hsScore: $('hs-score'), hsCoins: $('hs-coins'),
        finalScore: $('final-score'), winScore: $('win-score'),
        levelTitle: $('level-title'), levelTag: $('level-tag'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'),
        oLevel: $('overlay-level'), oWin: $('overlay-win'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'),
        btnRetry: $('btn-retry'), btnNext: $('btn-next')
    };

    const TILE = 24;
    const COLS_VIEW = W / TILE;   // 32
    const ROWS = H / TILE;        // 18

    // ---------- Level layout (each row is exactly LEVEL_W chars wide) ----------
    // ' ' = empty   '#' = ground top   '_' = ground under
    // 'B' = brick   '?' = ?-block coin   'M' = ?-block mushroom   'U' = used block
    // '[' ']' = pipe top-left/right   '{' '}' = pipe body-left/right
    // '=' = solid stair block   'F' = flagpole   'C' = castle decoration
    // 'g' = goomba spawn   'k' = koopa spawn   'c' = floating coin
    // 'P' = player spawn
    const LEVEL = [
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '             ?B?M?            B?B                  ?B?       ?B?M               ',
        '                                                                                ',
        '                                                                                ',
        '                                              [{                F               ',
        '                       g            g    g    ]}    cc           F              ',
        '                                                    ]}      ==    F             ',
        '         c    g    =        ===   = [{              ]}    ====    F             ',
        ' P    c c c =====  ===  k  ====   = ]}     g    g   ]}  ====== c  F          C  ',
        '################   ###############   #############     ##############     ######',
        '________________   _______________   _____________     ______________     ______'
    ];

    const COLS = LEVEL[0].length;
    const LEVEL_W = COLS * TILE;
    const LEVEL_H = ROWS * TILE;

    // Tile classification helpers
    const SOLID = new Set(['#', '_', 'B', '?', 'M', 'U', '[', ']', '{', '}', '=', 'C']);
    const BREAKABLE = new Set(['B']);
    const HITTABLE = new Set(['?', 'M', 'B']);

    const COLORS = {
        skyTop: '#5fc6ff', skyBot: '#9fe2ff',
        groundTop: '#1d9d6e', groundEdge: '#0d6b4a',
        groundBody: '#7a4a23', groundDark: '#5a3617',
        brick: '#c9722e', brickDark: '#8a4a18',
        qblock: '#ffd06b', qblockDark: '#a36b00', qblockUsed: '#7a5a3a',
        pipe: '#1d9d6e', pipeDark: '#0d6b4a', pipeRim: '#36e3a4',
        stair: '#c9a47a', stairDark: '#8a6a45',
        coin: '#ffd06b', coinShine: '#fff5c0',
        flagPole: '#cccccc', flagCloth: '#36e3a4',
        castle: '#9b6bff', castleDark: '#6644cc',
        playerBody: '#ff2e63', playerSkin: '#ffd6b3', playerOveralls: '#3a7bd5',
        playerShoe: '#5a2410', playerCap: '#ff2e63',
        goomba: '#8b5a3c', goombaDark: '#5a3617', goombaFoot: '#3a1f0a',
        koopa: '#36e3a4', koopaShell: '#1d9d6e', koopaShellEdge: '#a36b00',
        mushroomCap: '#ff2e63', mushroomSpot: '#fff5c0', mushroomStem: '#ffd6b3'
    };

    const state = {
        running: false, paused: false, gameover: false, won: false,
        score: 0, lives: 3, coinsCollected: 0,
        bestScore: 0, bestCoins: 0,
        tiles: [],
        player: null,
        enemies: [],
        coins: [],          // floating coins as entities
        powerups: [],       // mushrooms, etc
        particles: [],
        bumpedTiles: [],    // tiles being bumped (animation)
        flagPos: null,
        flagDescent: 0,
        camX: 0,
        animTime: 0,
        deathT: 0,
        winT: 0,
        keyL: false, keyR: false, keyD: false, keyJump: false, keyRun: false,
        jumpHeld: false,
        jumpBuffer: 0,
        // Konami / cheat?
    };

    // ---------- High score ----------
    const KEY = 'osg.pipe-jumper.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) { const o = JSON.parse(r); state.bestScore = o.score || 0; state.bestCoins = o.coins || 0; }
        } catch {}
    }
    function saveHS() {
        try { localStorage.setItem(KEY, JSON.stringify({ score: state.bestScore, coins: state.bestCoins })); } catch {}
    }
    function bumpHS() {
        let d = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; d = true; }
        if (state.coinsCollected > state.bestCoins) { state.bestCoins = state.coinsCollected; d = true; }
        if (d) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsCoins.textContent = state.bestCoins;
    }

    // ---------- Audio ----------
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

    // ---------- Level parse ----------
    function parseLevel() {
        const tiles = [];
        const enemies = [];
        const coins = [];
        let playerStart = { x: 60, y: 200 };
        let flag = null;
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            const src = LEVEL[r] || '';
            for (let c = 0; c < COLS; c++) {
                const ch = src[c] || ' ';
                if (ch === 'g') {
                    enemies.push(makeGoomba(c * TILE + TILE / 2, r * TILE + TILE - 22 / 2));
                    row.push(' ');
                } else if (ch === 'k') {
                    enemies.push(makeKoopa(c * TILE + TILE / 2, r * TILE + TILE - 32 / 2));
                    row.push(' ');
                } else if (ch === 'c') {
                    coins.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, taken: false, anim: Math.random() * 6 });
                    row.push(' ');
                } else if (ch === 'P') {
                    playerStart = { x: c * TILE + TILE / 2, y: r * TILE + TILE - 11 };
                    row.push(' ');
                } else if (ch === 'F') {
                    if (!flag) flag = { x: c * TILE + TILE / 2, yTop: r * TILE };
                    row.push('F');
                } else {
                    row.push(ch);
                }
            }
            tiles.push(row);
        }
        state.tiles = tiles;
        state.enemies = enemies;
        state.coins = coins;
        state.powerups = [];
        state.particles = [];
        state.bumpedTiles = [];
        state.flagPos = flag;
        state.flagDescent = 0;
        return playerStart;
    }

    // ---------- Player ----------
    function makePlayer(x, y) {
        return {
            x, y,
            vx: 0, vy: 0,
            w: 16, h: 22,
            big: false,
            facing: 1,
            onGround: false,
            jumpTimer: 0,
            invuln: 0,
            walkAnim: 0,
            shrinkAnim: 0,
            growAnim: 0
        };
    }

    function setBig(p, big) {
        if (p.big === big) return;
        const oldH = p.h;
        p.big = big;
        p.h = big ? 42 : 22;
        // Keep feet anchored: center moves up by half the height delta when growing
        p.y -= (p.h - oldH) / 2;
        if (big) { p.growAnim = 0.4; blip(880, 0.15, 'square', 0.07); }
        else { p.shrinkAnim = 0.6; p.invuln = 1.4; blip(220, 0.25, 'sawtooth', 0.07); }
    }

    // ---------- Enemies ----------
    function makeGoomba(x, y) {
        return { kind: 'goomba', x, y, vx: -45, vy: 0, w: 18, h: 20, dead: 0, squashed: 0, alive: true };
    }
    function makeKoopa(x, y) {
        return { kind: 'koopa', x, y, vx: -45, vy: 0, w: 18, h: 30, shell: false, sliding: false, dead: 0, alive: true };
    }
    function makeMushroom(x, y) {
        return { kind: 'mushroom', x, y, vx: 60, vy: 0, w: 18, h: 18, emerging: 0.6 };
    }

    // ---------- Tile sampling ----------
    function tileAt(c, r) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return ' ';
        return state.tiles[r][c];
    }
    function isSolidAt(c, r) {
        return SOLID.has(tileAt(c, r));
    }

    // Resolve box vs tiles on X axis (after applying x movement)
    function collideX(e) {
        const left = Math.floor(e.x - e.w / 2);
        const right = Math.floor(e.x + e.w / 2 - 0.001);
        const top = Math.floor(e.y - e.h / 2);
        const bot = Math.floor(e.y + e.h / 2 - 0.001);
        if (e.vx > 0) {
            const c = Math.floor((e.x + e.w / 2) / TILE);
            for (let r = Math.floor(top / TILE); r <= Math.floor(bot / TILE); r++) {
                if (isSolidAt(c, r)) {
                    e.x = c * TILE - e.w / 2 - 0.01;
                    e.hitWallX = true;
                    e.vx = 0;
                    return;
                }
            }
        } else if (e.vx < 0) {
            const c = Math.floor((e.x - e.w / 2) / TILE);
            for (let r = Math.floor(top / TILE); r <= Math.floor(bot / TILE); r++) {
                if (isSolidAt(c, r)) {
                    e.x = (c + 1) * TILE + e.w / 2 + 0.01;
                    e.hitWallX = true;
                    e.vx = 0;
                    return;
                }
            }
        }
    }

    // Resolve box vs tiles on Y axis
    function collideY(e, isPlayer = false) {
        e.onGround = false;
        if (e.vy > 0) {
            const r = Math.floor((e.y + e.h / 2) / TILE);
            const cl = Math.floor((e.x - e.w / 2 + 1) / TILE);
            const cr = Math.floor((e.x + e.w / 2 - 1) / TILE);
            for (let c = cl; c <= cr; c++) {
                if (isSolidAt(c, r)) {
                    e.y = r * TILE - e.h / 2 - 0.01;
                    e.vy = 0;
                    e.onGround = true;
                    return;
                }
            }
        } else if (e.vy < 0) {
            const r = Math.floor((e.y - e.h / 2) / TILE);
            const cl = Math.floor((e.x - e.w / 2 + 1) / TILE);
            const cr = Math.floor((e.x + e.w / 2 - 1) / TILE);
            for (let c = cl; c <= cr; c++) {
                if (isSolidAt(c, r)) {
                    e.y = (r + 1) * TILE + e.h / 2 + 0.01;
                    e.vy = 0;
                    if (isPlayer) hitBlockFromBelow(c, r);
                    return;
                }
            }
        }
    }

    function hitBlockFromBelow(c, r) {
        const t = tileAt(c, r);
        if (!HITTABLE.has(t)) return;
        // Bump animation
        state.bumpedTiles.push({ c, r, t: 0 });
        if (t === '?' || t === 'M') {
            // Spawn coin or mushroom
            if (t === 'M') {
                state.powerups.push(makeMushroom(c * TILE + TILE / 2, r * TILE - 4));
                blip(660, 0.2, 'square', 0.06);
            } else {
                spawnPopCoin(c * TILE + TILE / 2, r * TILE);
                blip(1320, 0.08);
            }
            state.tiles[r][c] = 'U';
        } else if (t === 'B') {
            if (state.player.big) {
                // Break
                state.tiles[r][c] = ' ';
                spawnBrickShards(c * TILE + TILE / 2, r * TILE + TILE / 2);
                state.score += 50;
                blip(180, 0.18, 'sawtooth', 0.07);
            } else {
                blip(220, 0.05, 'square', 0.05);
            }
        }
    }

    function spawnPopCoin(x, y) {
        state.particles.push({
            kind: 'popcoin', x, y, vy: -260, life: 0.8
        });
        state.coinsCollected++;
        state.score += 200;
        if (state.coinsCollected % 100 === 0) state.lives++;
        updateHud();
    }

    function spawnBrickShards(x, y) {
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + Math.random() * 0.4;
            state.particles.push({
                kind: 'shard', x, y,
                vx: Math.cos(ang) * 100 + (Math.random() - 0.5) * 60,
                vy: Math.sin(ang) * 100 - 200,
                life: 1
            });
        }
    }

    function spawnScorePop(x, y, txt) {
        state.particles.push({ kind: 'score', x, y, vy: -50, life: 0.8, txt });
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;

        if (state.deathT > 0) {
            state.deathT -= dt;
            const p = state.player;
            p.vy += 1300 * dt;
            p.y += p.vy * dt;
            if (state.deathT <= 0) onDeathDone();
            return;
        }

        if (state.winT > 0) {
            state.winT -= dt;
            // Slide flag down
            state.flagDescent = Math.min(1, state.flagDescent + dt * 1.2);
            const p = state.player;
            // Slide player along pole then walk to castle
            if (state.flagDescent < 1) {
                p.y += 60 * dt;
            } else {
                p.x += 100 * dt;
                p.vy += 1300 * dt;
                p.y += p.vy * dt;
                collideY(p, false);
            }
            if (state.winT <= 0) {
                state.running = false;
                state.won = true;
                ui.winScore.textContent = state.score;
                bumpHS();
                ui.oWin.classList.remove('hidden');
            }
            return;
        }

        updatePlayer(dt);
        updateEnemies(dt);
        updatePowerups(dt);
        updateCoins(dt);
        updateParticles(dt);
        updateBumpedTiles(dt);
        updateCamera();

        // Check flag
        if (state.flagPos && !state.won) {
            const p = state.player;
            const dx = Math.abs(p.x - state.flagPos.x);
            if (dx < 14 && p.y > state.flagPos.yTop - 20) {
                triggerWin();
            }
        }

        // Death pit
        if (state.player.y > LEVEL_H + 60) {
            playerDie();
        }
    }

    function updatePlayer(dt) {
        const p = state.player;
        const accel = 700;
        const decel = 600;
        const maxWalk = 130;
        const maxRun = 220;
        const maxV = state.keyRun ? maxRun : maxWalk;
        const gravity = 1300;

        // Horizontal
        let dir = 0;
        if (state.keyL) dir = -1;
        if (state.keyR) dir = 1;
        if (dir !== 0) {
            p.vx += accel * dir * dt;
            p.vx = Math.max(-maxV, Math.min(maxV, p.vx));
            p.facing = dir;
        } else {
            // Friction
            if (p.vx > 0) p.vx = Math.max(0, p.vx - decel * dt);
            else if (p.vx < 0) p.vx = Math.min(0, p.vx + decel * dt);
        }

        // Variable jump
        if (state.keyJump && p.onGround) {
            p.vy = -460;
            p.onGround = false;
            p.jumpTimer = 0.22;
            blip(880, 0.08, 'square', 0.05);
            state.keyJump = false;
        } else {
            state.keyJump = false;
        }
        if (state.jumpHeld && p.jumpTimer > 0 && p.vy < 0) {
            // Hold = sustain. Already initialized; just keep gravity reduced.
            p.jumpTimer -= dt;
        } else if (p.vy < 0 && !state.jumpHeld) {
            // Cut jump short
            p.vy = Math.max(p.vy, -160);
            p.jumpTimer = 0;
        } else {
            p.jumpTimer = 0;
        }

        p.vy += gravity * dt;
        if (p.vy > 700) p.vy = 700;

        // Move + collide
        p.hitWallX = false;
        p.x += p.vx * dt;
        collideX(p);
        p.y += p.vy * dt;
        collideY(p, true);

        // Bound left
        if (p.x < state.camX + p.w / 2) p.x = state.camX + p.w / 2;

        // Animation
        if (Math.abs(p.vx) > 5 && p.onGround) p.walkAnim += dt * (4 + Math.abs(p.vx) * 0.04);

        if (p.invuln > 0) p.invuln -= dt;
        if (p.shrinkAnim > 0) p.shrinkAnim -= dt;
        if (p.growAnim > 0) p.growAnim -= dt;

        // Enemy collision
        if (p.invuln <= 0) {
            for (const e of state.enemies) {
                if (!e.alive) continue;
                if (overlap(p, e)) handleEnemyTouch(e);
            }
            for (const m of state.powerups) {
                if (m.kind !== 'mushroom') continue;
                if (m.emerging > 0) continue;
                if (overlap(p, m)) {
                    m.alive = false;
                    state.powerups.splice(state.powerups.indexOf(m), 1);
                    setBig(p, true);
                    state.score += 1000;
                    spawnScorePop(m.x, m.y, '1000');
                    updateHud();
                    break;
                }
            }
        }

        // Floating coins
        for (let i = state.coins.length - 1; i >= 0; i--) {
            const c = state.coins[i];
            if (c.taken) continue;
            if (Math.abs(p.x - c.x) < 14 && Math.abs(p.y - c.y) < 18) {
                c.taken = true;
                state.coins.splice(i, 1);
                spawnPopCoin(c.x, c.y);
            }
        }
    }

    function overlap(a, b) {
        return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
    }

    function handleEnemyTouch(e) {
        const p = state.player;
        // Stomp = player coming down and is above enemy center
        const stomping = p.vy > 50 && (p.y + p.h / 2 - 6) < (e.y - e.h / 4);
        if (e.kind === 'goomba') {
            if (stomping) {
                e.squashed = 0.4;
                e.alive = false;
                p.vy = -300;
                state.score += 100;
                spawnScorePop(e.x, e.y - 10, '100');
                blip(440, 0.08, 'square', 0.06);
            } else {
                playerHit();
            }
        } else if (e.kind === 'koopa') {
            if (e.shell && !e.sliding) {
                // Kick the shell
                e.sliding = true;
                e.vx = (p.x < e.x ? 280 : -280);
                p.vy = -260;
                state.score += 100;
                spawnScorePop(e.x, e.y - 10, '100');
                blip(660, 0.06, 'square', 0.06);
            } else if (stomping) {
                if (!e.shell) {
                    e.shell = true;
                    e.h = 20;
                    e.vx = 0;
                    p.vy = -300;
                    state.score += 100;
                    spawnScorePop(e.x, e.y - 10, '100');
                    blip(440, 0.08, 'square', 0.06);
                } else {
                    // Stomp moving shell to stop it
                    if (e.sliding) {
                        e.sliding = false;
                        e.vx = 0;
                        p.vy = -260;
                    }
                }
            } else {
                playerHit();
            }
        }
    }

    function playerHit() {
        const p = state.player;
        if (p.big) {
            setBig(p, false);
        } else {
            playerDie();
        }
    }

    function playerDie() {
        if (state.deathT > 0) return;
        const p = state.player;
        state.deathT = 1.6;
        p.vy = -380;
        p.vx = 0;
        for (let i = 0; i < 4; i++) setTimeout(() => blip(220 - i * 30, 0.18, 'sawtooth'), i * 80);
    }

    function onDeathDone() {
        state.lives--;
        bumpHS();
        if (state.lives <= 0) {
            state.gameover = true;
            state.running = false;
            ui.finalScore.textContent = state.score;
            setTimeout(() => ui.oOver.classList.remove('hidden'), 200);
        } else {
            // Respawn
            const start = parseLevel();
            state.player = makePlayer(start.x, start.y);
            state.camX = 0;
            updateHud();
        }
    }

    function triggerWin() {
        if (state.winT > 0) return;
        state.winT = 3.2;
        state.score += 5000;
        spawnScorePop(state.flagPos.x, state.flagPos.yTop - 10, '5000');
        const p = state.player;
        p.x = state.flagPos.x - 6;
        p.vx = 0; p.vy = 0;
        p.facing = -1;
        for (let i = 0; i < 6; i++) setTimeout(() => blip(440 + i * 100, 0.1), i * 100);
    }

    function updateEnemies(dt) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            if (!e.alive) {
                if (e.squashed > 0) {
                    e.squashed -= dt;
                    if (e.squashed <= 0) state.enemies.splice(i, 1);
                } else if (e.dead) {
                    e.dead -= dt;
                    e.vy += 1300 * dt;
                    e.y += e.vy * dt;
                    if (e.dead <= 0 || e.y > LEVEL_H + 40) state.enemies.splice(i, 1);
                } else {
                    state.enemies.splice(i, 1);
                }
                continue;
            }
            // Skip update if far off screen (right side culling for unspawned enemies)
            if (e.x > state.camX + W + 60) continue;

            e.vy += 1300 * dt;
            if (e.vy > 700) e.vy = 700;

            e.hitWallX = false;
            e.x += e.vx * dt;
            collideX(e);
            e.y += e.vy * dt;
            collideY(e);

            // Reverse on wall
            if (e.hitWallX) {
                e.vx = -e.vx || (e.kind === 'koopa' ? -45 : -45);
            }

            // Check if at platform edge — turn around
            if (e.onGround && !(e.kind === 'koopa' && e.sliding)) {
                const aheadX = e.x + Math.sign(e.vx) * (e.w / 2 + 2);
                const belowR = Math.floor((e.y + e.h / 2 + 4) / TILE);
                const aheadC = Math.floor(aheadX / TILE);
                if (!isSolidAt(aheadC, belowR)) {
                    e.vx = -e.vx;
                }
            }

            // Out of world
            if (e.y > LEVEL_H + 40) { state.enemies.splice(i, 1); continue; }

            // Sliding shell vs other enemies
            if (e.kind === 'koopa' && e.sliding) {
                for (const o of state.enemies) {
                    if (o === e || !o.alive) continue;
                    if (overlap(e, o)) {
                        o.alive = false;
                        o.dead = 0.9;
                        o.vy = -250;
                        state.score += 400;
                        spawnScorePop(o.x, o.y - 10, '400');
                        blip(660, 0.1, 'square', 0.06);
                    }
                }
            }
        }
    }

    function updatePowerups(dt) {
        for (let i = state.powerups.length - 1; i >= 0; i--) {
            const m = state.powerups[i];
            if (m.emerging > 0) {
                m.emerging -= dt;
                m.y -= 26 * dt;
                continue;
            }
            m.vy += 1300 * dt;
            if (m.vy > 600) m.vy = 600;
            m.hitWallX = false;
            m.x += m.vx * dt;
            collideX(m);
            m.y += m.vy * dt;
            collideY(m);
            if (m.hitWallX) m.vx = -m.vx;
            if (m.y > LEVEL_H + 40) state.powerups.splice(i, 1);
        }
    }

    function updateCoins(dt) {
        for (const c of state.coins) c.anim += dt * 6;
    }

    function updateParticles(dt) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.life -= dt;
            if (p.kind === 'shard') {
                p.vy += 900 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
            } else if (p.kind === 'popcoin') {
                p.vy += 1200 * dt;
                p.y += p.vy * dt;
            } else if (p.kind === 'score') {
                p.y += p.vy * dt;
                p.vy += 80 * dt;
            }
            if (p.life <= 0) state.particles.splice(i, 1);
        }
    }

    function updateBumpedTiles(dt) {
        for (let i = state.bumpedTiles.length - 1; i >= 0; i--) {
            state.bumpedTiles[i].t += dt * 9;
            if (state.bumpedTiles[i].t > Math.PI) state.bumpedTiles.splice(i, 1);
        }
    }

    function updateCamera() {
        const target = state.player.x - W * 0.4;
        state.camX = Math.max(0, Math.min(LEVEL_W - W, target));
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.coins.textContent = state.coinsCollected;
        ui.lives.textContent = state.lives;
    }

    // ---------- Render ----------
    function render() {
        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, COLORS.skyTop);
        grad.addColorStop(1, COLORS.skyBot);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Background hills (parallax 0.3)
        const px = -state.camX * 0.3;
        ctx.fillStyle = '#3a9050';
        for (let i = 0; i < 6; i++) {
            const x = (i * 280 + px) % (LEVEL_W);
            const wrapped = x < -200 ? x + LEVEL_W : x;
            ctx.beginPath();
            ctx.arc(wrapped + 100, H - 96, 80, Math.PI, 0);
            ctx.fill();
        }
        // Bushes (parallax 0.5)
        const bx = -state.camX * 0.5;
        ctx.fillStyle = '#1d9d6e';
        for (let i = 0; i < 8; i++) {
            const x = (i * 220 + bx) % LEVEL_W;
            const wrapped = x < -100 ? x + LEVEL_W : x;
            ctx.beginPath();
            ctx.arc(wrapped + 30, H - 96, 18, Math.PI, 0);
            ctx.arc(wrapped + 50, H - 96, 24, Math.PI, 0);
            ctx.arc(wrapped + 75, H - 96, 18, Math.PI, 0);
            ctx.fill();
        }
        // Clouds (parallax 0.2)
        const cx = -state.camX * 0.2;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const cloudPos = [[100, 50], [320, 80], [560, 40], [820, 70], [1100, 60], [1380, 50], [1620, 80]];
        for (const [x, y] of cloudPos) {
            const xx = (x + cx) % LEVEL_W;
            const wrapped = xx < -50 ? xx + LEVEL_W : xx;
            drawCloud(wrapped, y);
        }

        // Camera transform
        ctx.save();
        ctx.translate(-Math.round(state.camX), 0);

        // Tiles in view
        const cMin = Math.max(0, Math.floor(state.camX / TILE) - 1);
        const cMax = Math.min(COLS - 1, Math.ceil((state.camX + W) / TILE) + 1);
        for (let r = 0; r < ROWS; r++) {
            for (let c = cMin; c <= cMax; c++) {
                const t = state.tiles[r][c];
                if (t === ' ') continue;
                let bumpY = 0;
                for (const b of state.bumpedTiles) {
                    if (b.c === c && b.r === r) bumpY = -Math.sin(b.t) * 8;
                }
                drawTile(t, c * TILE, r * TILE + bumpY);
            }
        }

        // Floating coins
        for (const co of state.coins) {
            if (co.taken) continue;
            drawCoin(co.x, co.y, co.anim);
        }

        // Powerups (mushrooms)
        for (const m of state.powerups) {
            if (m.kind === 'mushroom') drawMushroom(m.x, m.y);
        }

        // Enemies
        for (const e of state.enemies) {
            if (e.kind === 'goomba') drawGoomba(e);
            else if (e.kind === 'koopa') drawKoopa(e);
        }

        // Player
        drawPlayer(state.player);

        // Particles
        for (const p of state.particles) {
            if (p.kind === 'shard') {
                ctx.fillStyle = COLORS.brick;
                ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
            } else if (p.kind === 'popcoin') {
                drawCoin(p.x, p.y, state.animTime * 8);
            } else if (p.kind === 'score') {
                ctx.fillStyle = '#fff';
                ctx.font = "bold 10px 'Press Start 2P', monospace";
                ctx.textAlign = 'center';
                ctx.fillText(p.txt, p.x, p.y);
            }
        }

        ctx.restore();

        // HUD overlay (small power indicator?)
        // Camera-locked indicators not needed; HUD is below canvas in DOM
    }

    function drawCloud(x, y) {
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.arc(x + 16, y - 4, 16, 0, Math.PI * 2);
        ctx.arc(x + 34, y, 14, 0, Math.PI * 2);
        ctx.arc(x + 22, y + 6, 12, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawTile(t, x, y) {
        switch (t) {
            case '#': // Ground top
                ctx.fillStyle = COLORS.groundBody;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.groundTop;
                ctx.fillRect(x, y, TILE, 6);
                ctx.fillStyle = COLORS.groundEdge;
                ctx.fillRect(x, y + 6, TILE, 2);
                ctx.fillStyle = COLORS.groundDark;
                ctx.fillRect(x, y + TILE - 2, TILE, 2);
                ctx.fillRect(x + TILE - 2, y + 8, 2, TILE - 8);
                break;
            case '_': // Underground
                ctx.fillStyle = COLORS.groundBody;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.groundDark;
                ctx.fillRect(x, y, TILE, 2);
                ctx.fillRect(x, y + TILE - 2, TILE, 2);
                ctx.fillRect(x + TILE - 2, y, 2, TILE);
                break;
            case 'B':
                ctx.fillStyle = COLORS.brick;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.brickDark;
                ctx.fillRect(x, y, TILE, 2);
                ctx.fillRect(x, y + 11, TILE, 2);
                ctx.fillRect(x, y + TILE - 2, TILE, 2);
                ctx.fillRect(x + 7, y + 2, 2, 9);
                ctx.fillRect(x + 16, y + 2, 2, 9);
                ctx.fillRect(x + 4, y + 13, 2, 9);
                ctx.fillRect(x + 14, y + 13, 2, 9);
                break;
            case '?':
            case 'M': {
                const t2 = state.animTime * 4;
                const flash = (Math.floor(t2) % 2) ? 1 : 0.85;
                ctx.fillStyle = COLORS.qblock;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.qblockDark;
                ctx.fillRect(x, y, TILE, 2);
                ctx.fillRect(x, y + TILE - 2, TILE, 2);
                ctx.fillRect(x, y, 2, TILE);
                ctx.fillRect(x + TILE - 2, y, 2, TILE);
                ctx.fillStyle = `rgba(0,0,0,${0.6 * flash})`;
                ctx.font = "bold 16px 'Press Start 2P', monospace";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', x + TILE / 2, y + TILE / 2 + 1);
                break;
            }
            case 'U':
                ctx.fillStyle = COLORS.qblockUsed;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.qblockDark;
                ctx.fillRect(x, y, TILE, 2);
                ctx.fillRect(x, y + TILE - 2, TILE, 2);
                ctx.fillRect(x, y, 2, TILE);
                ctx.fillRect(x + TILE - 2, y, 2, TILE);
                break;
            case '[': // pipe top-left
                ctx.fillStyle = COLORS.pipe;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.pipeDark;
                ctx.fillRect(x, y + TILE - 4, TILE, 4);
                ctx.fillRect(x, y, 4, TILE);
                ctx.fillStyle = COLORS.pipeRim;
                ctx.fillRect(x, y, TILE - 1, 6);
                ctx.fillRect(x - 3, y, TILE + 3, 4);
                ctx.fillStyle = COLORS.pipeDark;
                ctx.fillRect(x - 3, y, TILE + 3, 2);
                break;
            case ']': // pipe top-right
                ctx.fillStyle = COLORS.pipe;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.pipeDark;
                ctx.fillRect(x, y + TILE - 4, TILE, 4);
                ctx.fillRect(x + TILE - 4, y, 4, TILE);
                ctx.fillStyle = COLORS.pipeRim;
                ctx.fillRect(x + 1, y, TILE - 1, 6);
                ctx.fillRect(x, y, TILE + 3, 4);
                ctx.fillStyle = COLORS.pipeDark;
                ctx.fillRect(x, y, TILE + 3, 2);
                break;
            case '{': // pipe body left
                ctx.fillStyle = COLORS.pipe;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.pipeDark;
                ctx.fillRect(x, y, 4, TILE);
                ctx.fillStyle = COLORS.pipeRim;
                ctx.fillRect(x + 4, y, 4, TILE);
                break;
            case '}': // pipe body right
                ctx.fillStyle = COLORS.pipe;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.pipeDark;
                ctx.fillRect(x + TILE - 4, y, 4, TILE);
                ctx.fillStyle = COLORS.pipeRim;
                ctx.fillRect(x + 8, y, 4, TILE);
                break;
            case '=':
                ctx.fillStyle = COLORS.stair;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.stairDark;
                ctx.fillRect(x, y, TILE, 2);
                ctx.fillRect(x, y + TILE - 2, TILE, 2);
                ctx.fillRect(x + TILE - 3, y, 3, TILE);
                break;
            case 'F':
                // Flag pole (just a thin column)
                ctx.fillStyle = COLORS.flagPole;
                ctx.fillRect(x + TILE / 2 - 2, y, 4, TILE);
                if (y < (state.flagPos ? state.flagPos.yTop + 8 : 9999)) {
                    // ball on top of pole
                    ctx.beginPath();
                    ctx.fillStyle = COLORS.flagCloth;
                    ctx.arc(x + TILE / 2, y - 2, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            case 'C':
                ctx.fillStyle = COLORS.castle;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.fillStyle = COLORS.castleDark;
                // crenellations
                ctx.fillRect(x, y, 6, 4);
                ctx.fillRect(x + 9, y, 6, 4);
                ctx.fillRect(x + 18, y, 6, 4);
                ctx.fillRect(x, y + TILE - 2, TILE, 2);
                break;
        }
    }

    function drawFlagCloth() {
        // Draw flag cloth that descends with state.flagDescent
        if (!state.flagPos) return;
        const fx = state.flagPos.x;
        const yTop = state.flagPos.yTop + 6;
        const yBot = state.flagPos.yTop + 4 * TILE - 24;
        const cy = yTop + (yBot - yTop) * state.flagDescent;
        ctx.fillStyle = COLORS.flagCloth;
        ctx.beginPath();
        ctx.moveTo(fx + 2, cy);
        ctx.lineTo(fx + 16, cy + 7);
        ctx.lineTo(fx + 2, cy + 14);
        ctx.closePath();
        ctx.fill();
    }

    function drawCoin(x, y, anim) {
        const w = Math.max(2, Math.abs(Math.cos(anim)) * 12);
        ctx.fillStyle = COLORS.coin;
        ctx.fillRect(x - w / 2, y - 8, w, 16);
        ctx.fillStyle = COLORS.coinShine;
        ctx.fillRect(x - w / 4, y - 6, Math.max(1, w / 6), 12);
    }

    function drawMushroom(x, y) {
        // cap
        ctx.fillStyle = COLORS.mushroomCap;
        ctx.beginPath();
        ctx.arc(x, y - 1, 11, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x - 11, y - 1, 22, 4);
        // spots
        ctx.fillStyle = COLORS.mushroomSpot;
        ctx.beginPath();
        ctx.arc(x - 5, y - 3, 2.5, 0, Math.PI * 2);
        ctx.arc(x + 5, y - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // stem
        ctx.fillStyle = COLORS.mushroomStem;
        ctx.fillRect(x - 7, y + 3, 14, 6);
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 4, y + 5, 2, 2);
        ctx.fillRect(x + 2, y + 5, 2, 2);
    }

    function drawGoomba(e) {
        const x = e.x, y = e.y;
        if (e.squashed > 0) {
            ctx.fillStyle = COLORS.goomba;
            ctx.fillRect(x - 9, y + 4, 18, 6);
            ctx.fillStyle = COLORS.goombaDark;
            ctx.fillRect(x - 9, y + 8, 18, 2);
            return;
        }
        // body (mushroom-like)
        ctx.fillStyle = COLORS.goomba;
        ctx.beginPath();
        ctx.arc(x, y - 2, 9, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x - 9, y - 2, 18, 6);
        // dark underside
        ctx.fillStyle = COLORS.goombaDark;
        ctx.fillRect(x - 9, y + 2, 18, 2);
        // feet (animate based on x position for movement feel)
        const footSwing = Math.sin(state.animTime * 8) > 0 ? 1 : -1;
        ctx.fillStyle = COLORS.goombaFoot;
        ctx.fillRect(x - 8, y + 4, 6, 5 + footSwing);
        ctx.fillRect(x + 2, y + 4, 6, 5 - footSwing);
        // eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 5, y - 4, 3, 4);
        ctx.fillRect(x + 2, y - 4, 3, 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 4 + (e.vx > 0 ? 1 : -1), y - 3, 1.5, 2.5);
        ctx.fillRect(x + 3 + (e.vx > 0 ? 1 : -1), y - 3, 1.5, 2.5);
        // eyebrows
        ctx.fillStyle = COLORS.goombaDark;
        ctx.fillRect(x - 6, y - 6, 4, 2);
        ctx.fillRect(x + 2, y - 6, 4, 2);
    }

    function drawKoopa(e) {
        const x = e.x, y = e.y;
        if (e.shell) {
            // Shell only
            ctx.fillStyle = COLORS.koopaShell;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = COLORS.koopa;
            ctx.fillRect(x - 10, y + 6, 20, 4);
            ctx.fillStyle = COLORS.koopaShellEdge;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = COLORS.koopaShellEdge;
            ctx.stroke();
            // Spin lines if sliding
            if (e.sliding) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                const t = state.animTime * 18;
                for (let i = 0; i < 3; i++) {
                    const a = t + i * Math.PI * 2 / 3;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
                    ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
                    ctx.stroke();
                }
            }
            return;
        }
        // Body shell
        ctx.fillStyle = COLORS.koopaShell;
        ctx.beginPath();
        ctx.arc(x, y - 4, 10, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x - 10, y - 4, 20, 12);
        ctx.fillStyle = COLORS.koopaShellEdge;
        ctx.fillRect(x - 10, y + 6, 20, 3);
        // head
        ctx.fillStyle = COLORS.koopa;
        const hx = e.vx > 0 ? x + 7 : x - 9;
        ctx.fillRect(hx, y - 12, 8, 8);
        // beak
        ctx.fillStyle = COLORS.qblockDark;
        ctx.fillRect(hx + (e.vx > 0 ? 7 : -3), y - 9, 3, 3);
        // eye
        ctx.fillStyle = '#fff';
        ctx.fillRect(hx + 2, y - 10, 3, 3);
        ctx.fillStyle = '#000';
        ctx.fillRect(hx + 3 + (e.vx > 0 ? 0.5 : -0.5), y - 9, 1.5, 2);
        // feet
        ctx.fillStyle = '#ffd06b';
        const footAlt = Math.sin(state.animTime * 8) > 0 ? 1 : 0;
        ctx.fillRect(x - 8, y + 9, 6, 5 + footAlt);
        ctx.fillRect(x + 2, y + 9, 6, 6 - footAlt);
    }

    function drawPlayer(p) {
        const flash = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
        if (flash) return;
        const x = p.x, y = p.y;
        const big = p.big;
        const h = p.h;
        const w = p.w;
        // walk frame
        const moving = Math.abs(p.vx) > 5 && p.onGround;
        const air = !p.onGround;
        const skid = moving && Math.sign(p.vx) !== p.facing && Math.abs(p.vx) > 50;
        const facing = p.facing;
        const fx = facing > 0 ? 1 : -1;

        // shoes / feet (bottom)
        const feetY = y + h / 2 - 3;
        // legs walking offsets
        const swing = Math.sin(p.walkAnim) * (moving ? 1.5 : 0);
        const legY = y + h / 2 - 8;

        // overalls (covers from waist down + straps)
        const oTop = big ? y - h / 2 + 18 : y - h / 2 + 10;
        const oH = big ? h - 22 : h - 12;

        // body width
        ctx.save();
        ctx.translate(x, 0);
        ctx.scale(fx, 1);

        // legs/shoes
        ctx.fillStyle = COLORS.playerShoe;
        if (air) {
            ctx.fillRect(-w / 2 + 1, feetY - 2, 6, 5);
            ctx.fillRect(w / 2 - 7, feetY - 2, 6, 5);
        } else {
            ctx.fillRect(-w / 2 + 1 + swing, feetY - 2, 6, 5);
            ctx.fillRect(w / 2 - 7 - swing, feetY - 2, 6, 5);
        }

        // overalls (body)
        ctx.fillStyle = COLORS.playerOveralls;
        ctx.fillRect(-w / 2, oTop, w, oH);
        // straps
        ctx.fillStyle = COLORS.playerOveralls;
        ctx.fillRect(-5, oTop - 4, 3, 5);
        ctx.fillRect(2, oTop - 4, 3, 5);
        // overalls buttons
        ctx.fillStyle = COLORS.qblock;
        ctx.fillRect(-5, oTop, 2, 2);
        ctx.fillRect(3, oTop, 2, 2);

        // shirt (red, between cap and overalls)
        ctx.fillStyle = COLORS.playerBody;
        ctx.fillRect(-w / 2, oTop - (big ? 8 : 6), w, big ? 8 : 6);
        // arms
        if (skid) {
            ctx.fillRect(-w / 2 - 3, oTop - 2, 4, 6);
            ctx.fillRect(w / 2 - 1, oTop - 2, 4, 6);
        } else {
            ctx.fillRect(-w / 2 - 2, oTop, 3, 7);
            ctx.fillRect(w / 2 - 1, oTop, 3, 7);
        }

        // head
        const headH = big ? 10 : 9;
        const headY = y - h / 2 + (big ? 8 : 1);
        ctx.fillStyle = COLORS.playerSkin;
        ctx.fillRect(-6, headY, 12, headH);
        // mustache
        ctx.fillStyle = '#3a1f0a';
        ctx.fillRect(-4, headY + headH - 3, 8, 2);
        // nose
        ctx.fillRect(2, headY + headH - 5, 3, 3);
        // eye
        ctx.fillStyle = '#000';
        ctx.fillRect(0, headY + 3, 2, 3);

        // cap
        ctx.fillStyle = COLORS.playerCap;
        ctx.fillRect(-7, headY - 4, 14, 4);
        ctx.fillRect(2, headY - 2, 6, 3);
        // cap badge
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, headY - 3, 4, 2);

        ctx.restore();
    }

    // ---------- Game flow ----------
    function newGame() {
        state.score = 0;
        state.coinsCollected = 0;
        state.lives = 3;
        state.gameover = false;
        state.won = false;
        const start = parseLevel();
        state.player = makePlayer(start.x, start.y);
        state.camX = 0;
        state.deathT = 0;
        state.winT = 0;
        ui.levelTitle.textContent = 'WORLD 1-1';
        ui.levelTag.textContent = 'Let\'s-a go!';
        ui.oLevel.classList.remove('hidden');
        setTimeout(() => ui.oLevel.classList.add('hidden'), 1300);
        updateHud();
    }

    function restart() {
        ui.oOver.classList.add('hidden');
        ui.oWin.classList.add('hidden');
        ui.oPause.classList.add('hidden');
        ui.oLevel.classList.add('hidden');
        newGame();
        state.running = true;
        last = performance.now();
    }

    function togglePause() {
        if (!state.running || state.gameover || state.won) return;
        state.paused = !state.paused;
        ui.oPause.classList.toggle('hidden', !state.paused);
        if (!state.paused) last = performance.now();
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state.running && !state.paused && !state.gameover) step(dt);
        render();
        // Flag cloth (drawn outside camera transform was wrong; redraw here over the scene)
        if (state.flagPos && state.flagDescent > 0) {
            ctx.save();
            ctx.translate(-Math.round(state.camX), 0);
            drawFlagCloth();
            ctx.restore();
        }
        requestAnimationFrame(loop);
    }

    // ---------- Input ----------
    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = true;
        else if (k === 'ArrowDown' || k === 's' || k === 'S') state.keyD = true;
        else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'z' || k === 'Z') {
            if (!state.jumpHeld) state.keyJump = true;
            state.jumpHeld = true;
        }
        else if (k === 'Shift') state.keyRun = true;
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = false;
        if (k === 'ArrowDown' || k === 's' || k === 'S') state.keyD = false;
        if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'z' || k === 'Z') state.jumpHeld = false;
        if (k === 'Shift') state.keyRun = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const press = (e) => {
            e.preventDefault();
            if (a === 'left') state.keyL = true;
            else if (a === 'right') state.keyR = true;
            else if (a === 'down') state.keyD = true;
            else if (a === 'jump') { state.keyJump = true; state.jumpHeld = true; }
            else if (a === 'run') state.keyRun = true;
            else if (a === 'pause') togglePause();
        };
        const release = (e) => {
            if (a === 'left') state.keyL = false;
            if (a === 'right') state.keyR = false;
            if (a === 'down') state.keyD = false;
            if (a === 'jump') state.jumpHeld = false;
            if (a === 'run') state.keyRun = false;
        };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('touchend', release);
        b.addEventListener('mousedown', press);
        b.addEventListener('mouseup', release);
        b.addEventListener('mouseleave', release);
    });

    ui.btnPlay.addEventListener('click', () => {
        ui.oTitle.classList.add('hidden');
        newGame();
        state.running = true;
        last = performance.now();
        blip(880, 0.1);
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);
    ui.btnNext.addEventListener('click', restart);

    // Initial preview render
    loadHS();
    renderHS();
    parseLevel();
    state.player = makePlayer(60, 360);
    state.running = false;
    requestAnimationFrame(loop);
})();
