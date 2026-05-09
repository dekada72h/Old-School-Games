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

    // Level (80 cols × 18 rows)
    // ' '=empty  '#'=ground top  '_'=underground  '='=platform
    // 'T'=tree (decorative, non-solid)
    // 'P'=player spawn  's'=soldier  't'=turret  'd'=drone  'r'=runner
    // 'm'=Machine pickup  'p'=sPread  'f'=Flame  'l'=Laser
    // 'B'=boss spawn
    const LEVEL = [
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                                                                                ',
        '                d                  d                  d                d        ',
        '                                                                                ',
        '       T  T  T          T  T              T   T          T  T          T   T   ',
        '                          t                                  t                  ',
        '         ===              ====              ====                ====            ',
        ' P  s     t   s     r        s     t   s    r    p    s   m  s         f    B  ',
        '################################################################################',
        '________________________________________________________________________________'
    ];

    const COLS = LEVEL[0].length;
    const LEVEL_W = COLS * TILE;
    const LEVEL_H = ROWS * TILE;

    const SOLID = new Set(['#', '_', '=']);
    const PLATFORM = new Set(['=']); // jump-through? for simplicity, treat as solid

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
            x, y: y + 8,
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

        // Jump (variable)
        if (state.keyJump && p.onGround && !p.prone) {
            p.vy = -440;
            p.onGround = false;
            p.jumpTimer = 0.2;
            blip(660, 0.06, 'square', 0.04);
            state.keyJump = false;
        } else {
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
        p.y += p.vy * dt;
        collideY(p);

        // Bound left to camera
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
            if (!isSolidAt(cc, cb)) {
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
            // Cull dead far behind
            if (e.x < state.camX - 80) continue;

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
                e.y += e.vy * dt;
                collideY(e);
                if (e.hitWallX) e.vx = -e.vx;
                // Edge avoidance
                if (e.onGround) {
                    const aheadX = e.x + Math.sign(e.vx) * (e.w / 2 + 4);
                    const belowR = Math.floor((e.y + e.h / 2 + 4) / TILE);
                    const aheadC = Math.floor(aheadX / TILE);
                    if (!isSolidAt(aheadC, belowR)) e.vx = -e.vx;
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
                e.y += e.vy * dt;
                collideY(e);
                if (e.onGround) {
                    const aheadX = e.x + Math.sign(e.vx) * (e.w / 2 + 4);
                    const belowR = Math.floor((e.y + e.h / 2 + 4) / TILE);
                    const aheadC = Math.floor(aheadX / TILE);
                    if (!isSolidAt(aheadC, belowR)) e.vx = -e.vx;
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
        updateHud();
        blip(220, 0.12, 'sawtooth', 0.05);
    }

    function killBoss() {
        state.boss.alive = false;
        ui.boss.textContent = 'DOWN';
        state.score += 5000;
        updateHud();
        // Big explosion
        for (let i = 0; i < 12; i++) {
            setTimeout(() => {
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
        if (!b.active && state.camX > b.x - W * 0.7) {
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
        // Lock camera at boss when activated
        if (state.boss && state.boss.active) {
            max = Math.min(max, state.boss.x - W * 0.55 + W);
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
        // Sky
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, COLORS.skyTop);
        grad.addColorStop(1, COLORS.skyBot);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Far hills (parallax 0.2)
        const px = -state.camX * 0.2;
        ctx.fillStyle = '#243818';
        for (let i = 0; i < 8; i++) {
            const x = (i * 240 + px) % LEVEL_W;
            const wrapped = x < -150 ? x + LEVEL_W : x;
            ctx.beginPath();
            ctx.moveTo(wrapped, H - 96);
            ctx.lineTo(wrapped + 80, H - 200);
            ctx.lineTo(wrapped + 160, H - 96);
            ctx.closePath();
            ctx.fill();
        }
        // Closer trees (parallax 0.4)
        const tx = -state.camX * 0.4;
        for (let i = 0; i < 16; i++) {
            const x = (i * 130 + tx) % LEVEL_W;
            const wrapped = x < -80 ? x + LEVEL_W : x;
            drawBgTree(wrapped + 30, H - 120);
        }

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

        // Bullets
        for (const b of state.bullets) drawBullet(b);
        for (const b of state.ebullets) drawEnemyBullet(b);

        // Particles
        for (const p of state.particles) drawParticle(p);

        ctx.restore();

        // Boss HP bar at top
        if (state.boss && state.boss.active && state.boss.alive) {
            const w = 240;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(W / 2 - w / 2, 16, w, 14);
            ctx.fillStyle = COLORS.bossEye;
            ctx.fillRect(W / 2 - w / 2 + 2, 18, (w - 4) * (state.boss.hp / state.boss.maxHp), 10);
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
        ctx.fillStyle = COLORS.treeShade;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 28, y + 36);
        ctx.lineTo(x + 28, y + 36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = COLORS.treeBark;
        ctx.fillRect(x - 3, y + 36, 6, 18);
    }
    function drawTreeTile(x, y) {
        // Foreground tree (within tile)
        ctx.fillStyle = COLORS.tree;
        ctx.beginPath();
        ctx.moveTo(x + TILE / 2, y - 8);
        ctx.lineTo(x - 4, y + TILE);
        ctx.lineTo(x + TILE + 4, y + TILE);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = COLORS.treeBark;
        ctx.fillRect(x + TILE / 2 - 2, y + TILE - 4, 4, 8);
    }

    function drawTile(t, x, y) {
        if (t === '#') {
            ctx.fillStyle = COLORS.groundBody;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = COLORS.groundTop;
            ctx.fillRect(x, y, TILE, 5);
            ctx.fillStyle = COLORS.groundEdge;
            ctx.fillRect(x, y + 5, TILE, 2);
            // grass tufts
            if (((x / TILE) | 0) % 4 === 0) {
                ctx.fillStyle = COLORS.groundTop;
                ctx.fillRect(x + 4, y - 2, 2, 3);
                ctx.fillRect(x + 8, y - 3, 2, 4);
                ctx.fillRect(x + 12, y - 2, 2, 3);
            }
        } else if (t === '_') {
            ctx.fillStyle = COLORS.groundBody;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = COLORS.groundDark;
            ctx.fillRect(x, y + TILE - 2, TILE, 2);
            ctx.fillRect(x + TILE - 2, y, 2, TILE);
        } else if (t === '=') {
            ctx.fillStyle = COLORS.platform;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = COLORS.platformEdge;
            ctx.fillRect(x, y, TILE, 4);
            ctx.fillRect(x, y + TILE - 4, TILE, 4);
            ctx.fillStyle = '#7a6a55';
            ctx.fillRect(x + 4, y + 8, 4, 4);
            ctx.fillRect(x + 14, y + 12, 4, 4);
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
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + h / 2 + 4, w / 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillStyle = COLORS.bossBody;
        ctx.fillRect(x - w / 2, y - h / 2 + 14, w, h - 14);
        // Head dome
        ctx.fillStyle = COLORS.bossPlate;
        ctx.beginPath();
        ctx.arc(x, y - h / 2 + 18, w / 2 - 4, Math.PI, 0);
        ctx.fill();
        // Plates
        ctx.fillStyle = COLORS.bossPlate;
        ctx.fillRect(x - w / 2, y - 8, w, 6);
        ctx.fillRect(x - w / 2, y + 16, w, 6);
        // Eye (weak point)
        const eyeFlash = b.alive && Math.sin(state.animTime * 4) > 0 ? 1 : 0.5;
        ctx.fillStyle = `rgba(255, 46, 99, ${eyeFlash})`;
        ctx.beginPath();
        ctx.arc(x, y - 6, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x, y - 6, 2, 0, Math.PI * 2);
        ctx.fill();
        // Side cannons
        ctx.fillStyle = COLORS.bossDanger;
        ctx.fillRect(x - w / 2 - 6, y + 4, 6, 10);
        ctx.fillRect(x + w / 2, y + 4, 6, 10);
        // Legs (4 mech legs)
        ctx.strokeStyle = COLORS.bossPlate;
        ctx.lineWidth = 4;
        for (let i = -2; i <= 2; i++) {
            if (i === 0) continue;
            ctx.beginPath();
            ctx.moveTo(x + i * 12, y + h / 2 - 8);
            ctx.lineTo(x + i * 18, y + h / 2 + 6);
            ctx.stroke();
        }
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
        if (b.kind === 'L') {
            // laser streak
            ctx.strokeStyle = COLORS.bullet;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
            ctx.stroke();
            ctx.strokeStyle = '#5fd0ff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
            ctx.stroke();
        } else if (b.kind === 'F') {
            ctx.fillStyle = '#ffd06b';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff7a3c';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff2e63';
            ctx.beginPath();
            ctx.arc(b.x, b.y, Math.max(1, b.size - 3), 0, Math.PI * 2);
            ctx.fill();
        } else if (b.kind === 'S') {
            ctx.fillStyle = '#ff66cc';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = COLORS.bullet;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawEnemyBullet(b) {
        ctx.fillStyle = '#ff7a3c';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd06b';
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1, b.size - 2), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawParticle(p) {
        if (p.kind === 'spark') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        } else if (p.kind === 'boom') {
            const sz = Math.max(1, p.life * 8);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---------- Game flow ----------
    function newGame() {
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
