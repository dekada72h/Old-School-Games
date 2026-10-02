/* ================================================================
   CODE STRIKE — fan tribute inspired by Contra (Konami 1987)
   Pure HTML5 canvas, vanilla JS.
   The Konami code grants 30 lives.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'), lives: $('lives'), weapon: $('weapon'),
        boss: $('boss'), best: $('best'),
        hsScore: $('hs-score'), hsWeapon: $('hs-weapon'),
        finalScore: $('final-score'), winScore: $('win-score'),
        levelTitle: $('level-title'), levelTag: $('level-tag'),
        oTitle: $('overlay-title'), oPause: $('overlay-pause'),
        oLevel: $('overlay-level'), oWin: $('overlay-win'), oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'), btnResume: $('btn-resume'),
        btnRetry: $('btn-retry'), btnNext: $('btn-next')
    };

    const TILE = 24;
    const ROWS = H / TILE;        // 18

    // Level (generated: 150 cols x 18 rows, always rectangular)
    // ' '=empty  '#'=ground top  '_'=underground  '='=one-way platform (jump up through, drop with DOWN+JUMP)
    // 'T'=tree (decorative)  'P'=player spawn  's'=soldier  't'=turret  'd'=drone  'r'=runner
    // 'm'=Machine pickup  'p'=sPread  'f'=Flame  'l'=Laser  'B'=boss spawn
    // Jump apex is ~85 px (3.5 tiles): row 13 platforms are one hop from the ground, row 12 needs a second.
    const LEVEL = (() => {
        const R = 18, C = 150, GROUND = 16;
        const g = Array.from({ length: R }, () => Array(C).fill(' '));
        const put = (c, r, ch) => { if (c >= 0 && c < C && r >= 0 && r < R) g[r][c] = ch; };
        const run = (c, r, n, ch = '=') => { for (let i = 0; i < n; i++) put(c + i, r, ch); };

        const pits = [[44, 46], [88, 91], [117, 119]];
        for (let c = 0; c < C; c++) {
            if (pits.some(([a, b]) => c >= a && c <= b)) continue;
            put(c, GROUND, '#'); put(c, GROUND + 1, '_');
        }
        // decorative trees
        for (let c = 6; c < C - 8; c += 7 + (c % 3)) put(c, 12, 'T');

        // one-way platforms
        run(26, 13, 5); run(32, 12, 4);
        run(52, 13, 6); run(58, 12, 4);
        run(70, 13, 4);
        run(78, 13, 6); run(84, 12, 4);
        run(97, 13, 5); run(103, 12, 5);
        run(122, 13, 5); run(128, 12, 4);

        // pickups
        put(10, 15, 'm'); put(36, 15, 'p'); put(66, 15, 'l'); put(100, 15, 'f'); put(126, 15, 'p');
        // enemies — ground soldiers
        [16, 22, 30, 40, 49, 56, 63, 74, 82, 94, 99, 108, 113, 122, 130, 134].forEach(c => put(c, 15, 's'));
        // runners that ambush
        [34, 60, 86, 106, 125, 138].forEach(c => put(c, 15, 'r'));
        // turrets (ground + on platforms)
        [20, 53, 71, 80, 111, 132].forEach(c => put(c, 15, 't'));
        put(28, 12, 't'); put(60, 11, 't'); put(86, 11, 't'); put(105, 11, 't'); put(130, 11, 't');
        // soldiers on platforms
        put(33, 11, 's'); put(55, 12, 's'); put(124, 12, 's');
        // drones
        [24, 48, 66, 92, 116, 128].forEach((c, i) => put(c + 8, 9 + (i % 3), 'd'));

        put(2, 15, 'P');
        put(146, 15, 'B');
        return g.map(r => r.join(''));
    })();

    const COLS = LEVEL[0].length;
    const LEVEL_W = COLS * TILE;
    const LEVEL_H = ROWS * TILE;

    const SOLID = new Set(['#', '_']);
    const ONEWAY = new Set(['=']);   // can be jumped through from below / dropped through with DOWN+JUMP

    const COLORS = {
        skyTop: '#3a4a2a', skyBot: '#1a2a14',
        groundTop: '#5a8a3a', groundEdge: '#2a4a1a',
        groundBody: '#3a5a25', groundDark: '#1f3015',
        platform: '#5a4a3a', platformEdge: '#3a2f25',
        tree: '#1a3015', treeShade: '#0d1f0a',
        treeBark: '#3a2510',
        playerBody: '#5fd0ff', playerHead: '#ffd6b3', playerHair: '#3a1f10',
        playerPants: '#3a4a2a', playerBoot: '#1a1a1a', playerGun: '#c0c0c0',
        soldier: '#9b6bff', soldierHead: '#ffd6b3', soldierGun: '#c0c0c0',
        turret: '#c0c0c0', turretBase: '#5a5a5a', turretBarrel: '#1a1a1a',
        drone: '#ff66cc', droneCenter: '#9b3370',
        runner: '#ff7a3c', runnerEye: '#ffd06b',
        bossBody: '#9b6bff', bossPlate: '#5a3a8a', bossEye: '#ff2e63', bossDanger: '#ff7a3c',
        bullet: '#ffd06b',
        enemyBullet: '#ff7a3c',
        capsule: '#ffd06b', capsuleEdge: '#a36b00'
    };

    const WEAPONS = {
        M: { name: 'MACHINE', rate: 0.10, color: '#ffd06b', fire: fireMachine },
        S: { name: 'SPREAD',  rate: 0.28, color: '#ff66cc', fire: fireSpread },
        F: { name: 'FLAME',   rate: 0.36, color: '#ff7a3c', fire: fireFlame },
        L: { name: 'LASER',   rate: 0.16, color: '#5fd0ff', fire: fireLaser }
    };

    const state = {
        running: false, paused: false, gameover: false, won: false,
        score: 0, lives: 3,
        weapon: 'M',
        bestScore: 0, bestWeapon: 'M',
        tiles: [],
        player: null,
        enemies: [],
        bullets: [],
        ebullets: [],
        pickups: [],
        particles: [],
        boss: null,
        camX: 0,
        animTime: 0,
        deathT: 0,
        winT: 0,
        keyL: false, keyR: false, keyU: false, keyD: false,
        keyJump: false, jumpHeld: false,
        keyShoot: false, shootCooldown: 0,
        konamiBuf: [],
        konamiActivated: false,
        flashTime: 0,
        muzzleT: 0,
        notifTime: 0, notifText: ''
    };

    const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

    // ---------- High score ----------
    const KEY = 'osg.code-strike.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) { const o = JSON.parse(r); state.bestScore = o.score || 0; state.bestWeapon = o.weapon || 'M'; }
        } catch {}
    }
    function saveHS() {
        try { localStorage.setItem(KEY, JSON.stringify({ score: state.bestScore, weapon: state.bestWeapon })); } catch {}
    }
    function bumpHS() {
        let d = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; state.bestWeapon = state.weapon; d = true; }
        if (d) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsWeapon.textContent = state.bestWeapon;
    }

    // ---------- Audio ----------
    let audio = null;
    function blip(f, dur = 0.05, type = 'square', vol = 0.04) {
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
        const pickups = [];
        let playerStart = { x: 60, y: 360 };
        let boss = null;
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            const src = LEVEL[r] || '';
            for (let c = 0; c < COLS; c++) {
                const ch = src[c] || ' ';
                const wx = c * TILE + TILE / 2;
                const wy = r * TILE + TILE / 2;
                if (ch === 's') {
                    enemies.push(makeSoldier(wx, wy));
                    row.push(' ');
                } else if (ch === 't') {
                    enemies.push(makeTurret(wx, wy));
                    row.push(' ');
                } else if (ch === 'd') {
                    enemies.push(makeDrone(wx, wy));
                    row.push(' ');
                } else if (ch === 'r') {
                    enemies.push(makeRunner(wx, wy));
                    row.push(' ');
                } else if (ch === 'm' || ch === 'p' || ch === 'f' || ch === 'l') {
                    const map = { m: 'M', p: 'S', f: 'F', l: 'L' };
                    pickups.push({ x: wx, y: wy + 4, w: 18, h: 18, kind: map[ch], anim: 0 });
                    row.push(' ');
                } else if (ch === 'P') {
                    playerStart = { x: wx, y: wy + 4 };
                    row.push(' ');
                } else if (ch === 'B') {
                    boss = makeBoss(wx, wy);
                    row.push(' ');
                } else if (ch === 'T') {
                    row.push('T');
                } else {
                    row.push(ch);
                }
            }
            tiles.push(row);
        }
        state.tiles = tiles;
        state.enemies = enemies;
        state.pickups = pickups;
        state.bullets = [];
        state.ebullets = [];
        state.particles = [];
        state.boss = boss;
        return playerStart;
    }

    // ---------- Entities ----------
    function makePlayer(x, y) {
        return {
            kind: 'player',
            x, y, vx: 0, vy: 0,
            w: 14, h: 30, baseH: 30, proneH: 14,
            facing: 1,
            onGround: false,
            jumpTimer: 0,
            invuln: 0,
            walkAnim: 0,
            prone: false
        };
    }
    function makeSoldier(x, y) {
        return { kind: 'soldier', x, y, vx: -55, vy: 0, w: 16, h: 26, hp: 1, alive: true, fireT: 0.8 + Math.random() * 0.8, facing: -1 };
    }
    function makeTurret(x, y) {
        return { kind: 'turret', x, y: y - 4, vx: 0, vy: 0, w: 22, h: 18, hp: 2, alive: true, fireT: 1.0, aim: 0 };
    }
    function makeDrone(x, y) {
        return { kind: 'drone', x, y, vx: -70, vy: 0, w: 20, h: 14, hp: 1, alive: true, fireT: 1.2, baseY: y, t: 0, gravity: false };
    }
    function makeRunner(x, y) {
        return { kind: 'runner', x, y, vx: 0, vy: 0, w: 14, h: 22, hp: 1, alive: true, facing: -1, charge: 0 };
    }
    function makeBoss(x, y) {
        return {
            kind: 'boss',
            x, y: 16 * TILE - 40,
            w: 64, h: 80,
            hp: 25, maxHp: 25,
            alive: true, active: false,
            fireT: 1.5,
            phase: 0,
            shake: 0
        };
    }

    // ---------- Tile / collision ----------
    function tileAt(c, r) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return ' ';
        return state.tiles[r][c];
    }
    function isSolidAt(c, r) { return SOLID.has(tileAt(c, r)); }
    function isOneWayAt(c, r) { return ONEWAY.has(tileAt(c, r)); }

    function collideX(e) {
        const top = Math.floor((e.y - e.h / 2));
        const bot = Math.floor((e.y + e.h / 2 - 0.001));
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
    function collideY(e) {
        e.onGround = false;
        if (e.vy >= 0) {
            const r = Math.floor((e.y + e.h / 2) / TILE);
            const cl = Math.floor((e.x - e.w / 2 + 1) / TILE);
            const cr = Math.floor((e.x + e.w / 2 - 1) / TILE);
            for (let c = cl; c <= cr; c++) {
                const oneWayHit = isOneWayAt(c, r) && !(e.dropT > 0) &&
                    (e.prevBottom === undefined || e.prevBottom <= r * TILE + 4);
                if (isSolidAt(c, r) || oneWayHit) {
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
                    return;
                }
            }
        }
    }

    function overlap(a, b) {
        return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
    }

    // ---------- Aim & shooting ----------
    function getAim(p) {
        if (p.prone) return { dx: p.facing, dy: 0 };
        let ax = 0, ay = 0;
        if (state.keyL) ax -= 1;
        if (state.keyR) ax += 1;
        if (state.keyU) ay -= 1;
        if (state.keyD && !p.onGround) ay += 1;
        if (ax === 0 && ay === 0) ax = p.facing;
        const len = Math.hypot(ax, ay) || 1;
        return { dx: ax / len, dy: ay / len };
    }

    function gunPos(p, aim) {
        // Gun extends from chest in aim direction
        const cy = p.prone ? p.y - 2 : p.y - 4;
        return { x: p.x + aim.dx * 12, y: cy + aim.dy * 12 };
    }

    function tryShoot() {
        if (state.shootCooldown > 0) return;
        const W = WEAPONS[state.weapon];
        const aim = getAim(state.player);
        const gp = gunPos(state.player, aim);
        W.fire(gp.x, gp.y, aim);
        state.shootCooldown = W.rate;
        state.muzzleT = 0.06;
        state.muzzle = { x: gp.x, y: gp.y, a: Math.atan2(aim.dy, aim.dx), color: W.color };
        blip(state.weapon === 'L' ? 1320 : (state.weapon === 'F' ? 220 : 880), 0.05, state.weapon === 'F' ? 'sawtooth' : 'square', 0.04);
    }

    function fireMachine(x, y, aim) {
        state.bullets.push({ x, y, vx: aim.dx * 540, vy: aim.dy * 540, life: 0.9, dmg: 1, kind: 'M', size: 3 });
    }
    function fireSpread(x, y, aim) {
        const baseAng = Math.atan2(aim.dy, aim.dx);
        for (let i = -2; i <= 2; i++) {
            const a = baseAng + i * 0.18;
            state.bullets.push({ x, y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 0.9, dmg: 1, kind: 'S', size: 3 });
        }
    }
    function fireFlame(x, y, aim) {
        const a = Math.atan2(aim.dy, aim.dx);
        for (let i = 0; i < 3; i++) {
            const off = (i - 1) * 0.06;
            state.bullets.push({
                x, y,
                vx: Math.cos(a + off) * 280, vy: Math.sin(a + off) * 280,
                life: 0.7, dmg: 2, kind: 'F', size: 6 + i * 2,
                grow: true
            });
        }
    }
    function fireLaser(x, y, aim) {
        state.bullets.push({ x, y, vx: aim.dx * 820, vy: aim.dy * 820, life: 0.7, dmg: 1, kind: 'L', size: 2, pierce: true, hitSet: new Set() });
    }

    // ---------- Update ----------
    function step(dt) {
        state.animTime += dt;
        if (state.muzzleT > 0) state.muzzleT -= dt;
        if (state.flashTime > 0) state.flashTime -= dt;
        if (state.notifTime > 0) state.notifTime -= dt;

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
            updateBullets(dt);
            updateParticles(dt);
            if (state.boss) state.boss.shake = Math.random() * 6;
            if (state.winT <= 0) {
                state.running = false;
                state.won = true;
                bumpHS();
                ui.winScore.textContent = state.score;
                ui.oWin.classList.remove('hidden');
            }
            return;
        }

        updatePlayer(dt);
        updateEnemies(dt);
        updateBullets(dt);
        updateEnemyBullets(dt);
        updatePickups(dt);
        updateParticles(dt);
        updateBoss(dt);
        updateCamera();

        if (state.player.y > LEVEL_H + 60) playerDie();
    }

    function updatePlayer(dt) {
        const p = state.player;
        const speed = 160;
        const proneSpeed = 60;
        const gravity = 1300;

        // Prone toggle (down on ground)
        const wantProne = state.keyD && p.onGround;
        if (wantProne && !p.prone) {
            p.prone = true;
            p.h = p.proneH;
            p.y += (p.baseH - p.proneH) / 2;
        } else if (!wantProne && p.prone) {
            p.prone = false;
            p.h = p.baseH;
            p.y -= (p.baseH - p.proneH) / 2;
        }

        // Horizontal
        let dir = 0;
        if (state.keyL) dir = -1;
        if (state.keyR) dir = 1;
        if (dir !== 0) {
            p.facing = dir;
            p.vx = dir * (p.prone ? proneSpeed : speed);
        } else {
            p.vx = 0;
        }

        // Jump (variable). Only consume the buffered keyJump when we actually launch —
        // otherwise pressing space mid-air triggers an unwanted hop the moment the player lands.
        // DOWN + JUMP while standing on a platform: drop through it
        if (state.keyJump && state.keyD && p.onGround && !p.prone) {
            const belowC = Math.floor(p.x / TILE), belowR = Math.floor((p.y + p.h / 2 + 2) / TILE);
            if (isOneWayAt(belowC, belowR)) {
                p.dropT = 0.28; p.onGround = false; p.vy = 120; state.keyJump = false;
            }
        }
        if (state.keyJump && p.onGround && !p.prone) {
            p.vy = -470;
            p.onGround = false;
            p.jumpTimer = 0.2;
            blip(660, 0.06, 'square', 0.04);
            state.keyJump = false;
        } else if (!state.jumpHeld) {
            state.keyJump = false;
        }
        if (state.jumpHeld && p.jumpTimer > 0 && p.vy < 0) {
            p.jumpTimer -= dt;
        } else if (p.vy < 0 && !state.jumpHeld) {
            p.vy = Math.max(p.vy, -180);
            p.jumpTimer = 0;
        } else {
            p.jumpTimer = 0;
        }

        p.vy += gravity * dt;
        if (p.vy > 700) p.vy = 700;

        p.hitWallX = false;
        p.x += p.vx * dt;
        collideX(p);
        p.prevBottom = p.y + p.h / 2;
        p.y += p.vy * dt;
        collideY(p);
        if (p.dropT > 0) p.dropT -= dt;

        // Bound left to camera / right to the boss arena
        if (state.boss && state.boss.alive && state.boss.active) {
            p.x = Math.min(p.x, state.boss.x - state.boss.w / 2 - 40);
        }
        if (p.x < state.camX + p.w / 2) p.x = state.camX + p.w / 2;

        // Walk anim
        if (Math.abs(p.vx) > 5 && p.onGround) p.walkAnim += dt * 10;

        // Invuln tick
        if (p.invuln > 0) p.invuln -= dt;

        // Shoot
        if (state.shootCooldown > 0) state.shootCooldown -= dt;
        if (state.keyShoot) tryShoot();

        // Pickup collision
        for (let i = state.pickups.length - 1; i >= 0; i--) {
            const k = state.pickups[i];
            k.anim += dt * 6;
            // Drop pickup on ground if it's floating
            const cb = Math.floor((k.y + k.h / 2 + 2) / TILE);
            const cc = Math.floor(k.x / TILE);
            if (!isSolidAt(cc, cb) && !isOneWayAt(cc, cb)) {
                k.y += 200 * dt;
            }
            if (overlap(p, k)) {
                state.weapon = k.kind;
                ui.weapon.textContent = k.kind;
                blip(990, 0.12, 'square', 0.05);
                state.pickups.splice(i, 1);
                showNotif(k.kind === 'M' ? 'MACHINE' : k.kind === 'S' ? 'SPREAD' : k.kind === 'F' ? 'FLAME' : 'LASER');
            }
        }

        // Enemy/boss collision
        if (p.invuln <= 0) {
            for (const e of state.enemies) {
                if (!e.alive) continue;
                if (overlap(p, e)) { playerHit(); break; }
            }
            if (state.boss && state.boss.alive && state.boss.active) {
                if (overlap(p, state.boss)) playerHit();
            }
        }
    }

    function updateEnemies(dt) {
        const p = state.player;
        for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            if (!e.alive) {
                state.enemies.splice(i, 1);
                continue;
            }

            // Cull off-screen right (don't activate until player gets close)
            if (e.x > state.camX + W + 80) continue;
            // Remove enemies far behind the camera so they don't accumulate forever.
            if (e.x < state.camX - 80) {
                state.enemies.splice(i, 1);
                continue;
            }

            if (e.kind === 'soldier' || e.kind === 'runner') {
                e.vy += 1300 * dt;
                if (e.vy > 700) e.vy = 700;
            }

            if (e.kind === 'soldier') {
                // Walk left, occasionally jump or shoot
                e.facing = e.vx < 0 ? -1 : (e.vx > 0 ? 1 : e.facing || -1);
                e.fireT -= dt;
                if (e.fireT <= 0 && Math.abs(e.x - p.x) < 360 && Math.abs(e.y - p.y) < 240) {
                    fireEnemyAimed(e.x + e.facing * 8, e.y - 4, p.x, p.y);
                    e.fireT = 1.1 + Math.random() * 0.6;
                }
                e.hitWallX = false;
                e.x += e.vx * dt;
                collideX(e);
                e.prevBottom = e.y + e.h / 2;
                e.y += e.vy * dt;
                collideY(e);
                if (e.hitWallX) e.vx = -e.vx;
                // Edge avoidance
                if (e.onGround) {
                    const aheadX = e.x + Math.sign(e.vx) * (e.w / 2 + 4);
                    const belowR = Math.floor((e.y + e.h / 2 + 4) / TILE);
                    const aheadC = Math.floor(aheadX / TILE);
                    if (!isSolidAt(aheadC, belowR) && !isOneWayAt(aheadC, belowR)) e.vx = -e.vx;
                }
            } else if (e.kind === 'runner') {
                // Charge at player when nearby
                if (e.charge === 0 && Math.abs(e.x - p.x) < 280) e.charge = 1;
                if (e.charge) {
                    e.vx = (p.x < e.x ? -200 : 200);
                    e.facing = Math.sign(e.vx);
                }
                e.x += e.vx * dt;
                collideX(e);
                e.prevBottom = e.y + e.h / 2;
                e.y += e.vy * dt;
                collideY(e);
                if (e.onGround) {
                    const aheadX = e.x + Math.sign(e.vx) * (e.w / 2 + 4);
                    const belowR = Math.floor((e.y + e.h / 2 + 4) / TILE);
                    const aheadC = Math.floor(aheadX / TILE);
                    if (!isSolidAt(aheadC, belowR) && !isOneWayAt(aheadC, belowR)) e.vx = -e.vx;
                }
            } else if (e.kind === 'turret') {
                // Stay put, rotate to aim, shoot
                const dx = p.x - e.x, dy = p.y - 4 - e.y;
                e.aim = Math.atan2(dy, dx);
                e.fireT -= dt;
                if (e.fireT <= 0 && Math.abs(dx) < 380) {
                    const len = Math.hypot(dx, dy) || 1;
                    fireEnemyDir(e.x + Math.cos(e.aim) * 14, e.y + Math.sin(e.aim) * 14, dx / len, dy / len, 220);
                    e.fireT = 1.0 + Math.random() * 0.5;
                }
            } else if (e.kind === 'drone') {
                // Sine wave horizontal flight
                e.t += dt;
                e.x += e.vx * dt;
                e.y = e.baseY + Math.sin(e.t * 2.2) * 18;
                e.fireT -= dt;
                if (e.fireT <= 0 && Math.abs(e.x - p.x) < 60) {
                    fireEnemyDir(e.x, e.y + 8, 0, 1, 220);
                    e.fireT = 0.9 + Math.random() * 0.5;
                }
                if (e.x < state.camX - 40) state.enemies.splice(i, 1);
            }
        }
    }

    function fireEnemyAimed(sx, sy, tx, ty) {
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        fireEnemyDir(sx, sy, dx / len, dy / len, 220);
    }
    function fireEnemyDir(x, y, dx, dy, speed = 220) {
        state.ebullets.push({ x, y, vx: dx * speed, vy: dy * speed, life: 3, size: 4 });
        blip(330, 0.04, 'square', 0.03);
    }

    function updateBullets(dt) {
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            b.life -= dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.grow) b.size += 14 * dt;
            // Off-screen / dead
            if (b.life <= 0 || b.x < state.camX - 30 || b.x > state.camX + W + 30 || b.y < -30 || b.y > LEVEL_H + 30) {
                state.bullets.splice(i, 1);
                continue;
            }
            // Hit terrain
            const c = Math.floor(b.x / TILE), r = Math.floor(b.y / TILE);
            if (isSolidAt(c, r)) {
                if (!b.pierce) {
                    spawnSpark(b.x, b.y);
                    state.bullets.splice(i, 1);
                    continue;
                }
            }
            // Hit enemies
            let hit = false;
            for (const e of state.enemies) {
                if (!e.alive) continue;
                if (b.pierce && b.hitSet && b.hitSet.has(e)) continue;
                const dx = b.x - e.x, dy = b.y - e.y;
                if (Math.abs(dx) < (e.w / 2 + b.size) && Math.abs(dy) < (e.h / 2 + b.size)) {
                    e.hp -= b.dmg;
                    spawnSpark(b.x, b.y);
                    if (b.pierce) { b.hitSet.add(e); hit = false; }
                    else hit = true;
                    if (e.hp <= 0) killEnemy(e);
                    if (hit) break;
                }
            }
            if (state.boss && state.boss.alive && state.boss.active) {
                const dx = b.x - state.boss.x, dy = b.y - state.boss.y;
                if (Math.abs(dx) < state.boss.w / 2 + b.size && Math.abs(dy) < state.boss.h / 2 + b.size) {
                    if (!b.pierce || !b.hitSet.has(state.boss)) {
                        state.boss.hp -= b.dmg;
                        spawnSpark(b.x, b.y);
                        state.boss.shake = 4;
                        ui.boss.textContent = state.boss.hp + '/' + state.boss.maxHp;
                        if (state.boss.hp <= 0) killBoss();
                        if (b.pierce) b.hitSet.add(state.boss);
                        else hit = true;
                    }
                }
            }
            if (hit) state.bullets.splice(i, 1);
        }
    }

    function updateEnemyBullets(dt) {
        const p = state.player;
        for (let i = state.ebullets.length - 1; i >= 0; i--) {
            const b = state.ebullets[i];
            b.life -= dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.life <= 0 || b.x < state.camX - 30 || b.x > state.camX + W + 30 || b.y < -30 || b.y > LEVEL_H + 30) {
                state.ebullets.splice(i, 1);
                continue;
            }
            // Hit terrain (enemy bullets stop on terrain too)
            const c = Math.floor(b.x / TILE), r = Math.floor(b.y / TILE);
            if (isSolidAt(c, r)) {
                spawnSpark(b.x, b.y);
                state.ebullets.splice(i, 1);
                continue;
            }
            // Hit player
            if (p.invuln <= 0 && state.deathT === 0 &&
                Math.abs(b.x - p.x) < (p.w / 2 + b.size) &&
                Math.abs(b.y - p.y) < (p.h / 2 + b.size)) {
                state.ebullets.splice(i, 1);
                playerHit();
            }
        }
    }

    function killEnemy(e) {
        e.alive = false;
        spawnExplosion(e.x, e.y);
        let pts = 100;
        if (e.kind === 'turret') pts = 200;
        if (e.kind === 'drone') pts = 200;
        state.score += pts;
        if (Math.floor((state.score - pts) / 10000) < Math.floor(state.score / 10000)) { state.lives++; showNotif('1UP!'); }
        updateHud();
        blip(220, 0.12, 'sawtooth', 0.05);
    }

    function killBoss() {
        state.boss.alive = false;
        ui.boss.textContent = 'DOWN';
        state.score += 5000;
        updateHud();
        const runId = state.runId;
        // Big explosion — bail if the user restarts mid-explosion so we don't
        // mutate a fresh boss/state.
        for (let i = 0; i < 12; i++) {
            setTimeout(() => {
                if (state.runId !== runId || !state.boss) return;
                spawnExplosion(state.boss.x + (Math.random() - 0.5) * 60, state.boss.y + (Math.random() - 0.5) * 70);
                blip(110 + Math.random() * 200, 0.18, 'sawtooth', 0.06);
            }, i * 80);
        }
        state.winT = 1.6;
    }

    function spawnSpark(x, y) {
        for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            state.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.25 });
        }
    }
    function spawnExplosion(x, y) {
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 60 + Math.random() * 140;
            state.particles.push({ kind: 'boom', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, color: i % 2 ? '#ff7a3c' : '#ffd06b' });
        }
    }

    function updateParticles(dt) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 200 * dt;
            if (p.life <= 0) state.particles.splice(i, 1);
        }
    }

    function updatePickups(dt) {
        // Animation handled in updatePlayer when checking collision
    }

    function updateBoss(dt) {
        const b = state.boss;
        if (!b || !b.alive) return;
        // Activate when player reaches it
        if (!b.active && state.player.x > b.x - 460) {
            b.active = true;
            ui.boss.textContent = b.hp + '/' + b.maxHp;
            showNotif('BOSS!');
            blip(110, 0.6, 'sawtooth', 0.07);
        }
        if (!b.active) return;

        b.shake = Math.max(0, b.shake - dt * 14);

        b.fireT -= dt;
        if (b.fireT <= 0) {
            // Fire ring/spread of bullets
            const phase = b.hp / b.maxHp;
            const count = phase > 0.6 ? 5 : (phase > 0.3 ? 7 : 9);
            const spread = phase > 0.6 ? 0.35 : 0.5;
            const baseA = Math.atan2(state.player.y - b.y, state.player.x - b.x);
            for (let i = 0; i < count; i++) {
                const a = baseA + (i - (count - 1) / 2) * spread;
                fireEnemyDir(b.x + Math.cos(a) * 32, b.y + Math.sin(a) * 32, Math.cos(a), Math.sin(a), 200);
            }
            b.fireT = phase > 0.4 ? 1.4 : 0.9;
        }
    }

    function updateCamera() {
        const target = state.player.x - W * 0.4;
        let max = LEVEL_W - W;
        // Lock camera at boss when activated — keep boss roughly on the right side of the screen.
        if (state.boss && state.boss.active) {
            max = Math.min(max, state.boss.x - W * 0.62);
        }
        state.camX = Math.max(0, Math.min(max, target));
    }

    function playerHit() {
        const p = state.player;
        if (p.invuln > 0) return;
        playerDie();
    }

    function playerDie() {
        if (state.deathT > 0) return;
        const p = state.player;
        state.deathT = 1.4;
        p.vy = -380;
        p.vx = (Math.random() - 0.5) * 120;
        spawnExplosion(p.x, p.y);
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
            // Respawn at left of screen, keep weapon and score
            state.player = makePlayer(state.camX + 40, 360);
            state.player.invuln = 1.5;
            state.ebullets = [];
            updateHud();
        }
    }

    function showNotif(text) {
        state.notifTime = 1.6;
        state.notifText = text;
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lives.textContent = state.lives;
        ui.weapon.textContent = state.weapon;
        if (state.boss && state.boss.active && state.boss.alive) {
            ui.boss.textContent = state.boss.hp + '/' + state.boss.maxHp;
        } else if (state.boss && !state.boss.alive) {
            ui.boss.textContent = 'DOWN';
        } else {
            ui.boss.textContent = '--';
        }
    }

    // ---------- Render ----------
    function render() {
        // Dusk jungle sky
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#16233a');
        grad.addColorStop(0.55, '#35506a');
        grad.addColorStop(1, '#6b5a4a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        // moon
        const moon = ctx.createRadialGradient(W - 120, 70, 4, W - 120, 70, 90);
        moon.addColorStop(0, 'rgba(255,250,225,0.95)'); moon.addColorStop(0.22, 'rgba(255,248,215,0.45)'); moon.addColorStop(1, 'rgba(255,248,215,0)');
        ctx.fillStyle = moon; ctx.fillRect(W - 220, 0, 220, 170);
        ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(W - 120, 70, 14, 0, Math.PI * 2); ctx.fill();

        // Far mountains (parallax 0.12)
        const mx = -state.camX * 0.12;
        ctx.fillStyle = '#243049';
        for (let i = 0; i < Math.ceil((LEVEL_W * 0.12 + W) / 240) + 2; i++) {
            const x = i * 240 + mx;
            if (x < -260 || x > W + 20) continue;
            ctx.beginPath();
            ctx.moveTo(x, H - 96);
            ctx.lineTo(x + 90, H - 96 - 150 - (i % 3) * 26);
            ctx.lineTo(x + 240, H - 96);
            ctx.closePath(); ctx.fill();
        }
        // Mid hills (parallax 0.25)
        const hx = -state.camX * 0.25;
        ctx.fillStyle = '#1b2f2a';
        for (let i = 0; i < Math.ceil((LEVEL_W * 0.25 + W) / 200) + 2; i++) {
            const x = i * 200 + hx;
            if (x < -200 || x > W + 20) continue;
            ctx.beginPath(); ctx.arc(x + 100, H - 90, 90 + (i % 3) * 14, Math.PI, 0); ctx.fill();
        }
        // Closer trees (parallax 0.45)
        const tx = -state.camX * 0.45;
        for (let i = 0; i < Math.ceil((LEVEL_W * 0.45 + W) / 130) + 2; i++) {
            const x = i * 130 + tx;
            if (x < -80 || x > W + 80) continue;
            drawBgTree(x + 30, H - 130 + ((i * 7) % 3) * 6);
        }
        // ground mist
        const mist = ctx.createLinearGradient(0, H - 140, 0, H - 40);
        mist.addColorStop(0, 'rgba(160,190,200,0)'); mist.addColorStop(1, 'rgba(160,190,200,0.14)');
        ctx.fillStyle = mist; ctx.fillRect(0, H - 140, W, 100);

        // Camera transform
        ctx.save();
        const shake = state.flashTime > 0 ? Math.sin(state.flashTime * 50) * 4 : 0;
        ctx.translate(-Math.round(state.camX) + shake, 0);

        // Tiles
        const cMin = Math.max(0, Math.floor(state.camX / TILE) - 1);
        const cMax = Math.min(COLS - 1, Math.ceil((state.camX + W) / TILE) + 1);
        // Draw trees first (background layer)
        for (let r = 0; r < ROWS; r++) {
            for (let c = cMin; c <= cMax; c++) {
                if (state.tiles[r][c] === 'T') drawTreeTile(c * TILE, r * TILE);
            }
        }
        // Then solid tiles
        for (let r = 0; r < ROWS; r++) {
            for (let c = cMin; c <= cMax; c++) {
                const t = state.tiles[r][c];
                if (t === ' ' || t === 'T') continue;
                drawTile(t, c * TILE, r * TILE);
            }
        }

        // Pickups
        for (const k of state.pickups) drawPickup(k);

        // Boss
        if (state.boss) drawBoss(state.boss);

        // Enemies
        for (const e of state.enemies) drawEnemy(e);

        // Player
        if (state.deathT === 0 || state.deathT > 0) drawPlayer(state.player);

        // Muzzle flash
        if (state.muzzleT > 0 && state.muzzle) {
            const m = state.muzzle;
            ctx.save();
            ctx.translate(m.x, m.y); ctx.rotate(m.a);
            ctx.shadowColor = m.color; ctx.shadowBlur = 14;
            ctx.fillStyle = '#fff6c8';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -5); ctx.lineTo(22, 0); ctx.lineTo(14, 5); ctx.closePath(); ctx.fill();
            ctx.restore();
        }

        // Bullets
        for (const b of state.bullets) drawBullet(b);
        for (const b of state.ebullets) drawEnemyBullet(b);

        // Particles
        for (const p of state.particles) drawParticle(p);

        ctx.restore();

        // Boss HP bar at top
        if (state.boss && state.boss.active && state.boss.alive) {
            const w = 240;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(W / 2 - w / 2 - 2, 14, w + 4, 18);
            const bg2 = ctx.createLinearGradient(0, 18, 0, 28);
            bg2.addColorStop(0, '#ff7a8f'); bg2.addColorStop(1, '#c0123a');
            ctx.fillStyle = bg2;
            ctx.fillRect(W / 2 - w / 2 + 2, 18, (w - 4) * (state.boss.hp / state.boss.maxHp), 10);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
            ctx.strokeRect(W / 2 - w / 2 - 1.5, 14.5, w + 3, 17);
            ctx.font = "bold 9px 'Press Start 2P', monospace";
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('BOSS', W / 2, 23);
        }

        // Notif
        if (state.notifTime > 0) {
            const a = Math.min(1, state.notifTime * 1.2);
            ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`;
            ctx.fillRect(W / 2 - 120, H / 2 - 40, 240, 36);
            ctx.font = "bold 14px 'Press Start 2P', monospace";
            ctx.fillStyle = `rgba(255, 208, 107, ${a})`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(state.notifText, W / 2, H / 2 - 22);
        }

        // Konami flash
        if (state.flashTime > 0) {
            const a = state.flashTime / 0.6;
            ctx.fillStyle = `rgba(95, 208, 255, ${a * 0.3})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    function drawBgTree(x, y) {
        ctx.fillStyle = COLORS.treeBark;
        ctx.fillRect(x - 3, y + 30, 6, 28);
        // layered pine/palm crown
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i === 0 ? '#12261a' : (i === 1 ? '#173020' : '#1c3a26');
            ctx.beginPath();
            ctx.moveTo(x, y - 10 + i * 14);
            ctx.lineTo(x - 30 + i * 4, y + 22 + i * 12);
            ctx.lineTo(x + 30 - i * 4, y + 22 + i * 12);
            ctx.closePath(); ctx.fill();
        }
    }
    function drawTreeTile(x, y) {
        // Foreground jungle bush/tree (decorative, non-solid)
        ctx.fillStyle = COLORS.treeBark;
        ctx.fillRect(x + TILE / 2 - 2, y + 4, 4, TILE + 8);
        const g = ctx.createRadialGradient(x + TILE / 2, y - 6, 2, x + TILE / 2, y, 26);
        g.addColorStop(0, '#2e6a3a'); g.addColorStop(1, '#173a22');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y - 2, 20, 14, 0, 0, Math.PI * 2);
        ctx.ellipse(x + TILE / 2 - 12, y + 6, 12, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(x + TILE / 2 + 12, y + 6, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawTile(t, x, y) {
        if (t === '#') {
            ctx.fillStyle = COLORS.groundBody;
            ctx.fillRect(x, y, TILE, TILE);
            const gg = ctx.createLinearGradient(0, y, 0, y + 8);
            gg.addColorStop(0, '#78b04a'); gg.addColorStop(1, COLORS.groundTop);
            ctx.fillStyle = gg;
            ctx.fillRect(x, y, TILE, 6);
            ctx.fillStyle = COLORS.groundEdge;
            ctx.fillRect(x, y + 6, TILE, 2);
            ctx.fillStyle = '#8ed05a';
            for (let i = 1; i < TILE; i += 5) ctx.fillRect(x + i, y - 2 - ((x / TILE + i) % 3), 2, 3);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(x + 5, y + 14, 4, 3); ctx.fillRect(x + 15, y + 18, 3, 3);
        } else if (t === '_') {
            ctx.fillStyle = COLORS.groundBody;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = COLORS.groundDark;
            ctx.fillRect(x, y + TILE - 2, TILE, 2);
            ctx.fillRect(x + TILE - 2, y, 2, TILE);
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fillRect(x + 4, y + 6, 4, 3); ctx.fillRect(x + 14, y + 12, 4, 3);
        } else if (t === '=') {
            // one-way steel catwalk
            const pg = ctx.createLinearGradient(0, y, 0, y + 10);
            pg.addColorStop(0, '#9aa7b2'); pg.addColorStop(1, '#4a5560');
            ctx.fillStyle = pg;
            ctx.fillRect(x, y, TILE, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillRect(x, y, TILE, 2);
            ctx.fillStyle = '#2a3038';
            ctx.fillRect(x, y + 8, TILE, 2);
            ctx.strokeStyle = 'rgba(40,48,56,0.8)'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y + 10); ctx.lineTo(x + TILE / 2, y + 18); ctx.lineTo(x + TILE, y + 10);
            ctx.stroke();
            ctx.fillStyle = '#d0dae4';
            ctx.fillRect(x + 3, y + 3, 2, 2); ctx.fillRect(x + TILE - 5, y + 3, 2, 2);
        }
    }

    function drawPickup(k) {
        const x = k.x, y = k.y + Math.sin(k.anim) * 2;
        // Capsule
        ctx.fillStyle = COLORS.capsule;
        ctx.fillRect(x - 9, y - 7, 18, 14);
        ctx.fillStyle = COLORS.capsuleEdge;
        ctx.fillRect(x - 9, y - 7, 18, 2);
        ctx.fillRect(x - 9, y + 5, 18, 2);
        ctx.fillRect(x - 9, y - 7, 2, 14);
        ctx.fillRect(x + 7, y - 7, 2, 14);
        // Letter
        ctx.fillStyle = '#3a1f0a';
        ctx.font = "bold 10px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(k.kind, x, y + 1);
    }

    function drawEnemy(e) {
        if (!e.alive) return;
        const x = e.x, y = e.y;
        if (e.kind === 'soldier') {
            ctx.save();
            ctx.translate(x, 0);
            ctx.scale(e.facing < 0 ? -1 : 1, 1);
            // legs
            ctx.fillStyle = COLORS.soldier;
            ctx.fillRect(-6, y - 5, 5, 10);
            ctx.fillRect(1, y - 5, 5, 10);
            // body
            ctx.fillStyle = COLORS.soldier;
            ctx.fillRect(-6, y - 13, 12, 8);
            // gun
            ctx.fillStyle = COLORS.soldierGun;
            ctx.fillRect(4, y - 10, 10, 2);
            // head
            ctx.fillStyle = COLORS.soldierHead;
            ctx.fillRect(-4, y - 22, 8, 8);
            // helmet
            ctx.fillStyle = '#1f3015';
            ctx.fillRect(-5, y - 24, 10, 4);
            ctx.restore();
        } else if (e.kind === 'turret') {
            ctx.fillStyle = COLORS.turretBase;
            ctx.fillRect(x - 11, y + 4, 22, 6);
            ctx.fillStyle = COLORS.turret;
            ctx.beginPath();
            ctx.arc(x, y + 2, 9, 0, Math.PI * 2);
            ctx.fill();
            // barrel
            ctx.save();
            ctx.translate(x, y + 2);
            ctx.rotate(e.aim || 0);
            ctx.fillStyle = COLORS.turretBarrel;
            ctx.fillRect(0, -2, 16, 4);
            ctx.restore();
            // hp dot
            if (e.hp < 2) {
                ctx.fillStyle = COLORS.bossEye;
                ctx.fillRect(x - 1, y - 1, 2, 2);
            }
        } else if (e.kind === 'drone') {
            ctx.fillStyle = COLORS.drone;
            ctx.beginPath();
            ctx.ellipse(x, y, 11, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = COLORS.droneCenter;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            // rotor lines
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            const rotor = Math.sin(state.animTime * 50) * 8;
            ctx.beginPath();
            ctx.moveTo(x - 11, y - 3);
            ctx.lineTo(x - 11 + rotor, y - 5);
            ctx.moveTo(x + 11, y - 3);
            ctx.lineTo(x + 11 - rotor, y - 5);
            ctx.stroke();
        } else if (e.kind === 'runner') {
            ctx.save();
            ctx.translate(x, 0);
            ctx.scale(e.facing < 0 ? -1 : 1, 1);
            ctx.fillStyle = COLORS.runner;
            // legs
            const swing = Math.sin(state.animTime * 16) * 3;
            ctx.fillRect(-5, y - 4, 4, 8 + swing);
            ctx.fillRect(1, y - 4, 4, 8 - swing);
            // body
            ctx.fillRect(-5, y - 14, 10, 10);
            // head
            ctx.fillStyle = '#3a1f10';
            ctx.fillRect(-4, y - 22, 8, 8);
            // eye
            ctx.fillStyle = COLORS.runnerEye;
            ctx.fillRect(0, y - 20, 3, 2);
            // claws
            ctx.fillStyle = COLORS.runner;
            ctx.fillRect(5, y - 12, 4, 2);
            ctx.fillRect(5, y - 8, 4, 2);
            ctx.restore();
        }
    }

    function drawBoss(b) {
        if (!b.alive && state.winT === 0) return;
        const x = b.x + (Math.random() - 0.5) * b.shake;
        const y = b.y + (Math.random() - 0.5) * b.shake;
        const w = b.w, h = b.h;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y + h / 2 + 2, w / 2 + 8, 6, 0, 0, Math.PI * 2); ctx.fill();

        // mech legs
        ctx.strokeStyle = '#3a2a5a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        const step = Math.sin(state.animTime * 3) * 3;
        for (const i of [-2, -1, 1, 2]) {
            ctx.beginPath();
            ctx.moveTo(x + i * 12, y + h / 2 - 12);
            ctx.lineTo(x + i * 20 + (i > 0 ? step : -step), y + h / 2 - 2);
            ctx.stroke();
        }
        ctx.lineCap = 'butt';

        // body
        const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        g.addColorStop(0, '#6a46b8'); g.addColorStop(0.5, '#b08cff'); g.addColorStop(1, '#5a3a9a');
        ctx.fillStyle = g;
        ctx.fillRect(x - w / 2, y - h / 2 + 14, w, h - 26);
        // head dome
        const hg = ctx.createRadialGradient(x - 8, y - h / 2 + 6, 4, x, y - h / 2 + 18, w / 2);
        hg.addColorStop(0, '#9a78e0'); hg.addColorStop(1, COLORS.bossPlate);
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(x, y - h / 2 + 18, w / 2 - 2, Math.PI, 0); ctx.fill();
        // armor plates + rivets
        ctx.fillStyle = COLORS.bossPlate;
        ctx.fillRect(x - w / 2, y - 8, w, 7);
        ctx.fillRect(x - w / 2, y + 16, w, 7);
        ctx.fillStyle = '#d8c8ff';
        for (let i = -3; i <= 3; i++) { ctx.fillRect(x + i * 9 - 1, y - 6, 2, 2); ctx.fillRect(x + i * 9 - 1, y + 18, 2, 2); }
        // weak-point eye
        const eyeFlash = b.alive ? 0.65 + 0.35 * Math.sin(state.animTime * 6) : 0.4;
        ctx.shadowColor = '#ff2e63'; ctx.shadowBlur = 16 * eyeFlash;
        ctx.fillStyle = `rgba(255, 46, 99, ${eyeFlash})`;
        ctx.beginPath(); ctx.arc(x, y - 6, 10, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 6, 5, 0, Math.PI * 2); ctx.fill();
        const ang = Math.atan2(state.player.y - y, state.player.x - x);
        ctx.fillStyle = '#220010'; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * 2, y - 6 + Math.sin(ang) * 2, 2.5, 0, Math.PI * 2); ctx.fill();
        // side cannons
        ctx.fillStyle = COLORS.bossDanger;
        ctx.fillRect(x - w / 2 - 8, y + 2, 8, 12);
        ctx.fillRect(x + w / 2, y + 2, 8, 12);
        ctx.fillStyle = '#ffd06b';
        ctx.fillRect(x - w / 2 - 8, y + 2, 8, 2); ctx.fillRect(x + w / 2, y + 2, 8, 2);
    }

    function drawPlayer(p) {
        const flash = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0;
        if (flash) return;
        const aim = getAim(p);
        const angle = Math.atan2(aim.dy, aim.dx);
        const x = p.x, y = p.y;

        ctx.save();
        ctx.translate(x, 0);
        const fx = p.facing > 0 ? 1 : -1;
        ctx.scale(fx, 1);

        if (p.prone) {
            // Lying body
            ctx.fillStyle = COLORS.playerPants;
            ctx.fillRect(-12, y - 4, 18, 8);
            ctx.fillStyle = COLORS.playerBody;
            ctx.fillRect(-2, y - 4, 14, 6);
            // head
            ctx.fillStyle = COLORS.playerHead;
            ctx.fillRect(8, y - 6, 6, 6);
            // gun
            ctx.fillStyle = COLORS.playerGun;
            ctx.fillRect(13, y - 3, 9, 2);
        } else {
            // legs
            const swing = Math.sin(p.walkAnim) * (Math.abs(p.vx) > 5 && p.onGround ? 3 : 0);
            const air = !p.onGround;
            ctx.fillStyle = COLORS.playerPants;
            if (air) {
                ctx.fillRect(-6, y + 3, 4, 9);
                ctx.fillRect(2, y + 3, 4, 9);
            } else {
                ctx.fillRect(-6 + swing, y + 3, 4, 10);
                ctx.fillRect(2 - swing, y + 3, 4, 10);
            }
            // boots
            ctx.fillStyle = COLORS.playerBoot;
            ctx.fillRect(-7 + swing, y + 12, 5, 3);
            ctx.fillRect(2 - swing, y + 12, 5, 3);
            // body (vest)
            ctx.fillStyle = COLORS.playerBody;
            ctx.fillRect(-6, y - 7, 12, 11);
            ctx.fillStyle = COLORS.playerPants;
            ctx.fillRect(-5, y - 5, 3, 5); // strap
            // head
            ctx.fillStyle = COLORS.playerHead;
            ctx.fillRect(-4, y - 16, 9, 9);
            // hair / bandana
            ctx.fillStyle = COLORS.playerHair;
            ctx.fillRect(-5, y - 18, 11, 4);
            ctx.fillStyle = COLORS.playerBody;
            ctx.fillRect(-5, y - 16, 11, 2);
            // eye
            ctx.fillStyle = '#000';
            ctx.fillRect(2, y - 12, 2, 2);
        }
        ctx.restore();

        // Gun arm (drawn separately, not mirrored — uses true world coords)
        if (!p.prone) {
            ctx.save();
            // anchor near chest
            const cx = x;
            const cy = y - 4;
            const armLen = 12;
            const tipX = cx + Math.cos(angle) * armLen;
            const tipY = cy + Math.sin(angle) * armLen;
            ctx.strokeStyle = COLORS.playerHead;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx + p.facing * 2, cy);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            // gun
            ctx.save();
            ctx.translate(tipX, tipY);
            ctx.rotate(angle);
            ctx.fillStyle = COLORS.playerGun;
            ctx.fillRect(0, -1.5, 8, 3);
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(0, -2.5, 3, 5);
            ctx.restore();
            ctx.restore();
        }
    }

    function drawBullet(b) {
        ctx.save();
        if (b.kind === 'L') {
            ctx.shadowColor = '#5fd0ff'; ctx.shadowBlur = 12;
            ctx.strokeStyle = '#d8f6ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
            ctx.stroke();
            ctx.strokeStyle = '#5fd0ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 0.06, b.y - b.vy * 0.06);
            ctx.stroke();
        } else if (b.kind === 'F') {
            const k = Math.max(0, Math.min(1, b.life / 0.7));
            const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size + 4);
            g.addColorStop(0, `rgba(255,240,170,${0.9 * k + 0.1})`);
            g.addColorStop(0.5, `rgba(255,122,60,${0.8 * k})`);
            g.addColorStop(1, 'rgba(255,46,99,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size + 4, 0, Math.PI * 2); ctx.fill();
        } else if (b.kind === 'S') {
            ctx.shadowColor = '#ff66cc'; ctx.shadowBlur = 10;
            ctx.fillStyle = '#ffd0ee';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ff66cc';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size - 1, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.shadowColor = COLORS.bullet; ctx.shadowBlur = 8;
            ctx.strokeStyle = 'rgba(255,208,107,0.5)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); ctx.stroke();
            ctx.fillStyle = '#fff3c4';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    function drawEnemyBullet(b) {
        ctx.save();
        ctx.shadowColor = '#ff7a3c'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff7a3c';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff1b0';
        ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(1, b.size - 2), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function drawParticle(p) {
        if (p.kind === 'spark') {
            ctx.globalAlpha = Math.min(1, p.life * 5);
            ctx.fillStyle = '#fff6c0';
            ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
            ctx.globalAlpha = 1;
        } else if (p.kind === 'boom') {
            const sz = Math.max(1, p.life * 12);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
            g.addColorStop(0, 'rgba(255,255,220,0.95)');
            g.addColorStop(0.5, p.color);
            g.addColorStop(1, 'rgba(255,60,40,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill();
        }
    }

    // ---------- Game flow ----------
    function newGame() {
        state.runId = (state.runId || 0) + 1;
        state.score = 0;
        state.lives = state.konamiActivated ? 30 : 3;
        state.weapon = 'M';
        state.gameover = false;
        state.won = false;
        const start = parseLevel();
        state.player = makePlayer(start.x, start.y);
        state.camX = 0;
        state.deathT = 0;
        state.winT = 0;
        ui.levelTitle.textContent = 'MISSION 1';
        ui.levelTag.textContent = state.konamiActivated ? '30 lives. Push it.' : 'Push to the bunker.';
        ui.oLevel.classList.remove('hidden');
        setTimeout(() => ui.oLevel.classList.add('hidden'), 1300);
        updateHud();
    }
    function restart() {
        ui.oTitle.classList.add('hidden');
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
        if (state.running && !state.paused && !state.gameover) { step(dt); updateHud(); }
        else state.animTime += dt;
        render();
        requestAnimationFrame(loop);
    }

    // ---------- Input + Konami ----------
    function pushKonami(key) {
        state.konamiBuf.push(key);
        if (state.konamiBuf.length > KONAMI.length) state.konamiBuf.shift();
        if (state.konamiBuf.length === KONAMI.length) {
            let match = true;
            for (let i = 0; i < KONAMI.length; i++) {
                if (state.konamiBuf[i] !== KONAMI[i]) { match = false; break; }
            }
            if (match) {
                state.konamiActivated = true;
                state.lives = 30;
                state.flashTime = 0.6;
                showNotif('30 LIVES!');
                updateHud();
                for (let i = 0; i < 5; i++) setTimeout(() => blip(440 + i * 110, 0.1), i * 80);
                state.konamiBuf = [];
            }
        }
    }

    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        const k = e.key;
        // Track for Konami (don't lowercase arrows)
        const tracked = (k === 'b' || k === 'a' || k === 'B' || k === 'A')
            ? k.toLowerCase()
            : k;
        if (KONAMI.includes(tracked)) pushKonami(tracked);

        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = true;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = true;
        else if (k === 'ArrowUp' || k === 'w' || k === 'W') state.keyU = true;
        else if (k === 'ArrowDown' || k === 's' || k === 'S') state.keyD = true;
        if (k === ' ' || k === 'k' || k === 'K') {
            if (!state.jumpHeld) state.keyJump = true;
            state.jumpHeld = true;
        }
        if (k === 'j' || k === 'J' || k === 'x' || k === 'X' || k === 'z' || k === 'Z') state.keyShoot = true;
        if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        if (k === 'r' || k === 'R') restart();
    });
    window.addEventListener('blur', () => { state.keyL = state.keyR = state.keyU = state.keyD = state.keyShoot = state.jumpHeld = false; });
    document.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') state.keyL = false;
        if (k === 'ArrowRight' || k === 'd' || k === 'D') state.keyR = false;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') state.keyU = false;
        if (k === 'ArrowDown' || k === 's' || k === 'S') state.keyD = false;
        if (k === ' ' || k === 'k' || k === 'K') state.jumpHeld = false;
        if (k === 'j' || k === 'J' || k === 'x' || k === 'X' || k === 'z' || k === 'Z') state.keyShoot = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        const press = (e) => {
            e.preventDefault();
            if (a === 'left') state.keyL = true;
            else if (a === 'right') state.keyR = true;
            else if (a === 'up') state.keyU = true;
            else if (a === 'down') state.keyD = true;
            else if (a === 'jump') { state.keyJump = true; state.jumpHeld = true; }
            else if (a === 'shoot') state.keyShoot = true;
            else if (a === 'pause') togglePause();
        };
        const release = (e) => {
            if (a === 'left') state.keyL = false;
            if (a === 'right') state.keyR = false;
            if (a === 'up') state.keyU = false;
            if (a === 'down') state.keyD = false;
            if (a === 'jump') state.jumpHeld = false;
            if (a === 'shoot') state.keyShoot = false;
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

    loadHS();
    renderHS();
    parseLevel();
    state.player = makePlayer(60, 360);
    state.running = false;
    requestAnimationFrame(loop);
})();
