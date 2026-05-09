/* Bomb Blitz - modern Bomberman remake
 * Pure HTML5 canvas, vanilla JS, no dependencies. */

(() => {
  'use strict';

  // -------- Configuration --------
  const TILE = 52;
  // Visible viewport (canvas size, in tiles).
  const VIEW_COLS = 17;
  const VIEW_ROWS = 13;
  const W = VIEW_COLS * TILE;
  const H = VIEW_ROWS * TILE;
  // Full level map. The camera scrolls across this with the player.
  // Bonus stages override these to a single-screen size in nextLevel().
  const FULL_MAP_COLS = 50;
  const FULL_MAP_ROWS = 200;
  // The current map dimensions (variable: bonus stages shrink it).
  let COLS = FULL_MAP_COLS;
  let ROWS = FULL_MAP_ROWS;
  // Convenience accessors (in pixels)
  const mapW = () => COLS * TILE;
  const mapH = () => ROWS * TILE;

  const TILE_EMPTY      = 0;
  const TILE_HARD       = 1;
  const TILE_SOFT       = 2;
  const TILE_REINFORCED = 3;   // takes two hits; degrades to TILE_SOFT on first hit

  const DIR = {
    UP:    { x:  0, y: -1, name: 'up' },
    DOWN:  { x:  0, y:  1, name: 'down' },
    LEFT:  { x: -1, y:  0, name: 'left' },
    RIGHT: { x:  1, y:  0, name: 'right' },
    NONE:  { x:  0, y:  0, name: 'none' },
  };

  const POWERUPS = [
    { id: 'fire',   color: '#ff4d2e', label: 'F', weight: 18 },
    { id: 'bomb',   color: '#2d2d3a', label: 'B', weight: 18 },
    { id: 'speed',  color: '#6dd3ff', label: 'S', weight: 14 },
    { id: 'shield', color: '#6affb1', label: 'D', weight: 8  },
    { id: 'ghost',  color: '#b993ff', label: 'G', weight: 6  },
    { id: 'kick',   color: '#ffce3a', label: 'K', weight: 8  },
    { id: 'remote', color: '#ff6ad5', label: 'R', weight: 5  },
    { id: 'time',   color: '#38e1c4', label: 'T', weight: 6  },
    { id: 'mega',   color: '#ff2e63', label: 'M', weight: 4  },
    { id: 'life',   color: '#ff9bb3', label: '+', weight: 3  },
  ];
  const POWERUP_TOTAL = POWERUPS.reduce((s, p) => s + p.weight, 0);

  // Enemy archetypes:
  //  walker  - slow, picks random direction at intersections (classic "Balloom")
  //  liner   - walks straight lines until blocked, then turns (classic "Onil/Dahl")
  //  runner  - fast walker with quicker retargets (classic "Minvo/Pass")
  //  phaser  - can move through soft walls (classic "Pontan/Ovapi")
  //  chaser  - hunts the player using simple gradient
  //  smart   - hunts via BFS pathfinding; the most dangerous regular
  //  boss*   - large, takes multiple hits, distinct behaviors per type

  const TOTAL_STAGES = 100;
  const BONUS_EVERY = 3;   // stages 3, 6, 9, 12, ... are bonus rounds
  const BOSS_EVERY  = 5;   // every 5th stage is a boss
  const EXTRA_LIFE_EVERY = 25000;  // +1 life each time score crosses this threshold

  // Procedurally generate the stage table. Boss takes priority over bonus when both align.
  function buildStageTable() {
    const themes = ['forest', 'desert', 'cave', 'volcano', 'void'];
    const bossTypes = ['boss_brute', 'boss_swarm', 'boss_phantom', 'boss_titan', 'boss_overlord'];
    const bossTags = {
      boss_brute:    'BOSS: Brute',
      boss_swarm:    'BOSS: Swarm Mother',
      boss_phantom:  'BOSS: Phantom',
      boss_titan:    'BOSS: Titan',
      boss_overlord: 'BOSS: Overlord',
    };
    const stages = [];
    let bossIdx = 0;
    for (let i = 1; i <= TOTAL_STAGES; i++) {
      // Themes cycle so we keep visual variety across all 50 stages
      const theme = themes[Math.floor((i - 1) / 5) % themes.length];
      const isBoss = i % BOSS_EVERY === 0;
      const isBonus = !isBoss && i % BONUS_EVERY === 0;
      if (isBonus) {
        stages.push({ num: i, kind: 'bonus', tag: 'BONUS! Bomb everything that moves', theme });
        continue;
      }
      if (isBoss) {
        // Cycle through boss types so all 10 boss stages mix it up
        const type = bossTypes[bossIdx % bossTypes.length];
        bossIdx++;
        // Boss always comes with a few minions matching the difficulty band
        const minions = pickMinionsForStage(i);
        stages.push({ num: i, kind: 'boss', bossType: type, enemies: { [type]: 1, ...minions }, tag: bossTags[type], theme });
        continue;
      }
      // Regular stage with rising difficulty
      stages.push({ num: i, kind: 'regular', enemies: pickEnemiesForStage(i), tag: pickTagForStage(i), theme });
    }
    return stages;
  }

  function pickEnemiesForStage(stageNum) {
    // Strict rule: every regular stage has at least one MORE monster than the previous one
    // until we hit the map cap. Composition shifts toward harder types as stages climb.
    // The big 50x200 map has plenty of room, so we scale total enemies way up.
    const cap = 80;
    const total = Math.min(cap, 14 + stageNum * 2); // stage 1 -> 16, stage 30 -> 74, then capped
    // Type "tiers" become available with each stage band
    let walker = 0, liner = 0, runner = 0, chaser = 0, phaser = 0, smart = 0;
    let remaining = total;
    // Always at least one walker so brand-new players have something readable
    if (stageNum <= 2) { walker = remaining; remaining = 0; }
    else {
      // Allocate harder types from the top; each tier scales with stageNum
      smart  = Math.max(0, Math.min(remaining, Math.floor((stageNum - 9)  / 4))); remaining -= smart;
      phaser = Math.max(0, Math.min(remaining, Math.floor((stageNum - 7)  / 3))); remaining -= phaser;
      chaser = Math.max(0, Math.min(remaining, Math.floor((stageNum - 5)  / 2))); remaining -= chaser;
      runner = Math.max(0, Math.min(remaining, Math.floor((stageNum - 3)  / 1))); remaining -= runner;
      liner  = Math.max(0, Math.min(remaining, Math.floor((stageNum - 1)  / 1))); remaining -= liner;
      walker = Math.max(0, remaining);
    }
    const out = {};
    if (walker) out.walker = walker;
    if (liner)  out.liner  = liner;
    if (runner) out.runner = runner;
    if (chaser) out.chaser = chaser;
    if (phaser) out.phaser = phaser;
    if (smart)  out.smart  = smart;
    return out;
  }

  // Continuous speed multiplier so each stage is a touch quicker than the last.
  // Starts at 1.0 and grows ~1% per stage, capped at 1.6x.
  function enemySpeedScale(stageNum) {
    return Math.min(1.6, 1 + (stageNum - 1) * 0.01);
  }

  function pickMinionsForStage(stageNum) {
    if (stageNum <= 5)  return { walker: 2, liner: 1 };
    if (stageNum <= 10) return { runner: 2, chaser: 1 };
    if (stageNum <= 15) return { runner: 2, phaser: 2 };
    if (stageNum <= 20) return { phaser: 2, chaser: 2, smart: 1 };
    if (stageNum <= 30) return { phaser: 2, chaser: 2, smart: 2 };
    if (stageNum <= 40) return { phaser: 3, chaser: 3, smart: 2 };
    return { phaser: 3, chaser: 3, smart: 3 };
  }

  function pickTagForStage(stageNum) {
    const tags = [
      'Easy does it', 'Watch the lanes', 'Pick up the pace', 'They are looking now',
      "Walls won't save you", 'Full press', 'Brains and brawn', 'No safe corners',
      'Cornered animals', 'The deep dark', 'Hold your nerve', 'Heat rising',
      'Last quiet moment', 'It only gets worse', 'Survive', 'Outnumbered',
      'Push through', 'No mercy', 'Endgame approaches', 'Almost there',
    ];
    return tags[(stageNum - 1) % tags.length];
  }

  const LEVELS = buildStageTable();

  // Per-theme color palette used by the renderer
  const THEMES = {
    forest:  { floorTop: '#1a3a2a', floorBot: '#0a1d18', hardA: '#3a5b48', hardB: '#172a1f', soft: '#a86b3b', accent: '#7be3a4' },
    desert:  { floorTop: '#3a2f1a', floorBot: '#1d150a', hardA: '#75603b', hardB: '#3b2a18', soft: '#c98a4b', accent: '#ffd06b' },
    cave:    { floorTop: '#1a1f30', floorBot: '#0a0d18', hardA: '#3d4a6e', hardB: '#161c34', soft: '#8a6f55', accent: '#9bb7ff' },
    volcano: { floorTop: '#3a1715', floorBot: '#15080a', hardA: '#6b2a26', hardB: '#2c0e0d', soft: '#c95a30', accent: '#ff7a4a' },
    void:    { floorTop: '#1a0a2e', floorBot: '#070418', hardA: '#4a2a78', hardB: '#1a0d36', soft: '#7a3aaa', accent: '#d086ff' },
  };
  const DEFAULT_THEME = THEMES.forest;

  // -------- Canvas + DOM --------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const ui = {
    level:   document.getElementById('level'),
    score:   document.getElementById('score'),
    lives:   document.getElementById('lives'),
    time:    document.getElementById('time'),
    best:    document.getElementById('best'),
    powers:  document.getElementById('powers'),
    overlayTitle:    document.getElementById('overlay-title'),
    overlayPause:    document.getElementById('overlay-pause'),
    overlayLevel:    document.getElementById('overlay-level'),
    overlayGameOver: document.getElementById('overlay-gameover'),
    overlayVictory:  document.getElementById('overlay-victory'),
    levelTitle: document.getElementById('level-title'),
    levelTag:   document.getElementById('level-tag'),
    finalScore: document.getElementById('final-score'),
    winScore:   document.getElementById('win-score'),
    btnPlay:    document.getElementById('btn-play'),
    btnResume:  document.getElementById('btn-resume'),
    btnRetry:   document.getElementById('btn-retry'),
    btnNewGame: document.getElementById('btn-newgame'),
  };

  // -------- Sound (simple Web Audio synth) --------
  const Audio = (() => {
    let actx = null;
    let muted = false;
    const ensure = () => {
      if (!actx) {
        try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { return null; }
      }
      return actx;
    };
    const beep = (freq, dur, type = 'square', vol = 0.05, slide = 0) => {
      if (muted) return;
      const a = ensure();
      if (!a) return;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    };
    const noise = (dur, vol = 0.08) => {
      if (muted) return;
      const a = ensure();
      if (!a) return;
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const g = a.createGain();
      g.gain.value = vol;
      src.connect(g); g.connect(a.destination);
      src.start();
    };
    return {
      bombPlace:  () => beep(380, 0.08, 'square', 0.04, -120),
      bombTick:   () => beep(900, 0.03, 'triangle', 0.02),
      explode:    () => { noise(0.35, 0.10); beep(110, 0.25, 'sawtooth', 0.05, -60); },
      pickup:     () => { beep(660, 0.06, 'square', 0.04); setTimeout(() => beep(990, 0.08, 'square', 0.04), 60); },
      hurt:       () => { beep(220, 0.18, 'sawtooth', 0.08, -100); },
      enemyDeath: () => { beep(140, 0.20, 'square', 0.05, 200); },
      win:        () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'square', 0.05), i * 110)); },
      lose:       () => { [392, 311, 247, 196].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.06), i * 160)); },
      shield:     () => beep(1200, 0.12, 'triangle', 0.05, -400),
      ghost:      () => beep(540, 0.30, 'sine', 0.04, -200),
      toggle:     () => { muted = !muted; },
      isMuted:    () => muted,
    };
  })();

  // -------- Game state --------
  const game = {
    grid:      [],   // 2D array of TILE_*
    powerups:  [],   // { x, y, type, anim }
    door:      null, // { x, y, anim, revealed }  -- hidden exit door
    bombs:     [],   // { x, y, fuse, power, owner, kicked: {dx,dy}, isMega }
    explosions: [],  // { x, y, life, max, kind }
    particles: [],   // { x, y, vx, vy, life, max, color, size }
    floats:    [],   // floating score text
    enemies:   [],
    player:    null,
    level:     0,
    score:     0,
    timeLeft:  180,  // seconds
    state:     'title',   // 'title' | 'playing' | 'paused' | 'levelintro' | 'gameover' | 'victory' | 'leveldone' | 'bonus'
    lastTs:    0,
    elapsed:   0,
    timeWarp:  0,    // seconds remaining where enemies move slowly
    shake:     0,
    levelStartedAt: 0,
    theme:     DEFAULT_THEME,
    stageKind: 'regular', // 'regular' | 'bonus' | 'boss'
    combo:        0,      // current kill streak
    comboExpire:  0,      // seconds until combo resets
    nextLifeAt:   EXTRA_LIFE_EVERY,
    bossActive:   false,
    bonusKills:   0,
    bonusTimeLeft: 0,
    cameraX:      0,
    cameraY:      0,
    // run stats
    runKills:     0,        // total monsters killed this game
    runStage:     0,        // highest stage reached this game
    // best-of stats persisted to localStorage
    best: {
      score: 0,
      kills: 0,
      stage: 0,
    },
  };

  // Load saved best stats
  try {
    const raw = localStorage.getItem('bombblitz.best.v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        game.best.score = Math.max(0, parsed.score | 0);
        game.best.kills = Math.max(0, parsed.kills | 0);
        game.best.stage = Math.max(0, parsed.stage | 0);
      }
    } else {
      // Migrate the v1 single-best key if present
      const old = parseInt(localStorage.getItem('bombblitz.best') || '0', 10);
      if (Number.isFinite(old) && old > 0) game.best.score = old;
    }
  } catch (e) { /* localStorage may be blocked */ }

  const keys = new Set();
  const keyJustPressed = new Set();

  // -------- Input --------
  const KEY_MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    Space: 'bomb', ShiftLeft: 'detonate', ShiftRight: 'detonate',
    KeyP: 'pause', KeyM: 'mute', KeyR: 'restart',
    Enter: 'confirm',
  };

  window.addEventListener('keydown', e => {
    const k = KEY_MAP[e.code];
    if (!k) return;
    if (['up','down','left','right','bomb'].includes(k)) e.preventDefault();
    if (!keys.has(k)) keyJustPressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', e => {
    const k = KEY_MAP[e.code];
    if (!k) return;
    keys.delete(k);
  });

  // Touch controls — wire each button so press = key down, release = key up.
  // Allows multitouch (move + bomb at the same time).
  document.querySelectorAll('[data-touch]').forEach(btn => {
    const action = btn.getAttribute('data-touch');
    const press = (ev) => {
      ev.preventDefault();
      if (!keys.has(action)) keyJustPressed.add(action);
      keys.add(action);
    };
    const release = (ev) => {
      ev.preventDefault();
      keys.delete(action);
    };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend',   release, { passive: false });
    btn.addEventListener('touchcancel',release, { passive: false });
    btn.addEventListener('mousedown',  press);
    btn.addEventListener('mouseup',    release);
    btn.addEventListener('mouseleave', release);
  });

  // Prevent browser pinch/scroll while playing on canvas
  ['touchstart','touchmove','touchend','gesturestart'].forEach(ev =>
    canvas.addEventListener(ev, e => e.preventDefault(), { passive: false }));

  // -------- Helpers --------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand  = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const inGrid = (cx, cy) => cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
  const tileAt = (cx, cy) => inGrid(cx, cy) ? game.grid[cy][cx] : TILE_HARD;
  const setTile = (cx, cy, v) => { if (inGrid(cx, cy)) game.grid[cy][cx] = v; };

  const cellCenter = (cx, cy) => ({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 });

  const bombAt = (cx, cy) => game.bombs.find(b => b.x === cx && b.y === cy);
  const powerupAt = (cx, cy) => game.powerups.find(p => p.x === cx && p.y === cy);
  const explosionAt = (cx, cy) => game.explosions.find(e => e.x === cx && e.y === cy);

  function rollPowerup() {
    let r = Math.random() * POWERUP_TOTAL;
    for (const p of POWERUPS) {
      r -= p.weight;
      if (r <= 0) return p.id;
    }
    return 'fire';
  }

  // -------- Level generation --------
  function buildLevel(levelIdx) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE_EMPTY));

    // Borders + interior pillar pattern
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) grid[y][x] = TILE_HARD;
        else if (x % 2 === 0 && y % 2 === 0) grid[y][x] = TILE_HARD;
      }
    }

    // Spawn safe zone (top-left L) and exits for enemies (corners)
    const safe = new Set([
      '1,1','2,1','1,2',
      `${COLS-2},${ROWS-2}`, `${COLS-3},${ROWS-2}`, `${COLS-2},${ROWS-3}`,
      `1,${ROWS-2}`, `2,${ROWS-2}`, `1,${ROWS-3}`,
      `${COLS-2},1`, `${COLS-3},1`, `${COLS-2},2`,
    ]);

    // Soft walls — denser at higher levels, capped so the board stays navigable
    const density = Math.min(0.78, 0.55 + levelIdx * 0.015);
    // Reinforced bricks (2-hit) start showing up around stage 50 and grow in share.
    const stageNum = levelIdx + 1;
    const reinforcedShare = stageNum < 50 ? 0 : Math.min(0.45, (stageNum - 50) * 0.012 + 0.08);
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (grid[y][x] !== TILE_EMPTY) continue;
        if (safe.has(`${x},${y}`)) continue;
        if (Math.random() < density) {
          grid[y][x] = (reinforcedShare > 0 && Math.random() < reinforcedShare) ? TILE_REINFORCED : TILE_SOFT;
        }
      }
    }

    // Hide power-ups in some soft walls
    const softs = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (grid[y][x] === TILE_SOFT) softs.push({ x, y });
    softs.sort(() => Math.random() - 0.5);

    // Exactly one random powerup per level, hidden under a random brick.
    const powerups = [];
    if (softs.length > 0) {
      const pick = softs[0];
      powerups.push({ x: pick.x, y: pick.y, type: rollPowerup(), anim: Math.random() * Math.PI * 2, hidden: true });
    }

    // Hide an exit door under a random brick — anywhere on the map, even
    // close to spawn. You still have to clear every monster before stepping
    // onto it (the door won't accept you while anything's still alive).
    // Bombing the door (instead of stepping on it) spawns a penalty wave.
    let door = null;
    const occupied = new Set(powerups.map(p => `${p.x},${p.y}`));
    const candidates = softs.filter(s => !occupied.has(`${s.x},${s.y}`));
    if (candidates.length) {
      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      door = { x: choice.x, y: choice.y, anim: 0, revealed: false };
    }

    return { grid, powerups, door };
  }

  // -------- Entities --------
  function makePlayer() {
    const c = cellCenter(1, 1);
    return {
      x: c.x, y: c.y,
      r: TILE * 0.32,
      facing: 'down',
      moveAnim: 0,
      speed: 130,             // px/sec
      maxBombs: 1,
      bombsActive: 0,
      bombPower: 1,
      // powerups
      shield: false,
      ghost: false,           // wall-pass: stays until you die
      kick: false,
      remote: false,
      mega: false,
      // status
      alive: true,
      iframes: 0,             // invulnerability seconds
      lives: game.player ? game.player.lives : 3,
    };
  }

  function spawnEnemies(spec) {
    const out = [];
    const occupied = new Set(['1,1','2,1','1,2']);
    const candidates = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        // open and at least 4 tiles from spawn
        if (game.grid[y][x] !== TILE_EMPTY) continue;
        if (Math.abs(x - 1) + Math.abs(y - 1) < 5) continue;
        if (occupied.has(`${x},${y}`)) continue;
        candidates.push({ x, y });
      }
    }
    candidates.sort(() => Math.random() - 0.5);

    const flatten = [];
    for (const [type, n] of Object.entries(spec)) for (let i = 0; i < n; i++) flatten.push(type);

    for (const type of flatten) {
      const cell = candidates.pop();
      if (!cell) break;
      const c = cellCenter(cell.x, cell.y);
      const def = ENEMY_DEFS[type] || ENEMY_DEFS.walker;
      const speedScale = enemySpeedScale(game.level || 1);
      out.push({
        type,
        x: c.x, y: c.y,
        r: def.r,
        speed: def.speed * speedScale,
        dir: pickDir(),
        retargetIn: rand(0.4, 1.2),
        alive: true,
        deathAnim: 0,
        anim: Math.random() * Math.PI * 2,
        score: def.score,
        color: def.color,
        canPhase: !!def.canPhase,
        hp: def.hp || 1,
        maxHp: def.hp || 1,
        hitFlash: 0,
        isBoss: !!def.isBoss,
        bossKind: def.bossKind || null,
        // boss state
        spawnCooldown: 4 + Math.random() * 3,
      });
    }
    return out;
  }

  // Score values follow the classic Bomberman ladder (Balloom 100 ... Pontan 8000)
  const ENEMY_DEFS = {
    walker:        { r: TILE * 0.30, speed: 50,  score: 100,  color: '#ff6699', canPhase: false },
    liner:         { r: TILE * 0.30, speed: 65,  score: 200,  color: '#ffd06b', canPhase: false },
    runner:        { r: TILE * 0.28, speed: 110, score: 400,  color: '#36e3a4', canPhase: false },
    chaser:        { r: TILE * 0.30, speed: 80,  score: 800,  color: '#9b6bff', canPhase: false },
    phaser:        { r: TILE * 0.28, speed: 60,  score: 2000, color: '#b993ff', canPhase: true  },
    smart:         { r: TILE * 0.30, speed: 75,  score: 4000, color: '#5fd0ff', canPhase: false },
    // Bosses
    boss_brute:    { r: TILE * 0.46, speed: 80,  score: 5000,  color: '#ff2e63', canPhase: true,  hp: 3, isBoss: true, bossKind: 'brute' },
    boss_swarm:    { r: TILE * 0.42, speed: 70,  score: 6000,  color: '#ff7a4a', canPhase: false, hp: 4, isBoss: true, bossKind: 'swarm' },
    boss_phantom:  { r: TILE * 0.40, speed: 105, score: 7000,  color: '#b993ff', canPhase: true,  hp: 4, isBoss: true, bossKind: 'phantom' },
    boss_titan:    { r: TILE * 0.50, speed: 65,  score: 8000,  color: '#ffd06b', canPhase: false, hp: 6, isBoss: true, bossKind: 'titan' },
    boss_overlord: { r: TILE * 0.48, speed: 95,  score: 10000, color: '#d086ff', canPhase: true,  hp: 7, isBoss: true, bossKind: 'overlord' },
  };

  const SCORE_BRICK    = 10;
  const SCORE_POWERUP  = 200;     // picking up a power-up
  const SCORE_TIME_PER = 50;      // per remaining second on stage clear
  const SCORE_LIFE_PER = 1000;    // per remaining life on stage clear
  const SCORE_NO_DEATH = 2000;    // bonus for clearing a stage without dying
  const SCORE_BONUS_KILL_MUL = 2; // bonus stage kills are worth x2

  function pickDir() {
    const opts = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    return opts[Math.floor(Math.random() * 4)];
  }

  // Penalty wave: classic Bomberman would spawn a swarm of immortal "ghost"
  // monsters when you bombed the door or a powerup. We spawn extra enemies
  // (capped) of a tier based on the current stage so it stings without
  // being unrecoverable.
  function spawnPenaltyWave(reason, cx, cy) {
    if (game.stageKind === 'bonus') return;     // no penalties during the bonus stage
    const aliveCount = game.enemies.filter(e => e.alive && !e.isBoss).length;
    if (aliveCount >= 14) return;               // hard cap so it stays playable
    const stage = game.level || 1;
    const pool = stage < 5  ? ['walker']
              : stage < 10 ? ['liner', 'runner']
              : stage < 20 ? ['runner', 'chaser']
              : stage < 35 ? ['chaser', 'phaser']
              :              ['phaser', 'smart'];
    const count = (reason === 'door') ? 3 : 1;

    const candidates = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (tileAt(x, y) !== TILE_EMPTY) continue;
        if (bombAt(x, y)) continue;
        // Don't spawn right next to the player
        const dx = x - Math.floor(game.player.x / TILE);
        const dy = y - Math.floor(game.player.y / TILE);
        if (Math.abs(dx) + Math.abs(dy) < 4) continue;
        candidates.push({ x, y });
      }
    }
    candidates.sort(() => Math.random() - 0.5);

    const speedScale = enemySpeedScale(stage);
    for (let i = 0; i < count && candidates.length; i++) {
      const cell = candidates.pop();
      const type = pool[Math.floor(Math.random() * pool.length)];
      const def = ENEMY_DEFS[type];
      const c = cellCenter(cell.x, cell.y);
      game.enemies.push({
        type,
        x: c.x, y: c.y, r: def.r, speed: def.speed * speedScale,
        dir: pickDir(), retargetIn: rand(0.4, 1.2),
        alive: true, deathAnim: 0, anim: Math.random() * Math.PI * 2,
        score: def.score, color: def.color,
        canPhase: !!def.canPhase, hp: def.hp || 1, maxHp: def.hp || 1,
        hitFlash: 0, isBoss: false, bossKind: null, spawnCooldown: 0,
      });
    }

    // Visual + audio cue at the trigger tile
    const c = cellCenter(cx, cy);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      game.particles.push({
        x: c.x, y: c.y,
        vx: Math.cos(a) * 180, vy: Math.sin(a) * 180,
        life: 0.6, max: 0.6,
        color: reason === 'door' ? '#ff2e63' : '#ff7a4a',
        size: 3,
      });
    }
    game.floats.push({ x: c.x, y: c.y - 12, text: reason === 'door' ? 'DOOR HIT! +MONSTERS' : 'POWERUP LOST! +MONSTER', life: 1.4, max: 1.4, color: '#ff7a7a' });
    Audio.hurt();
  }

  function spawnBossMinions(boss) {
    // Different bosses spawn different minion swarms when their cooldown ticks
    const kindMap = {
      brute:    'walker',
      swarm:    'walker',
      phantom:  'phaser',
      titan:    'liner',
      overlord: 'chaser',
    };
    const minion = kindMap[boss.bossKind] || 'walker';
    const def = ENEMY_DEFS[minion];
    if (!def) return;
    // Hard cap so the screen doesn't drown in mobs
    const aliveOthers = game.enemies.filter(e => e.alive && !e.isBoss).length;
    if (aliveOthers >= 8) return;
    const count = boss.bossKind === 'swarm' ? 3 : (boss.bossKind === 'overlord' ? 2 : 1);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const cx = clamp(Math.floor((boss.x + Math.cos(ang) * TILE * 1.5) / TILE), 1, COLS - 2);
      const cy = clamp(Math.floor((boss.y + Math.sin(ang) * TILE * 1.5) / TILE), 1, ROWS - 2);
      const t = tileAt(cx, cy);
      if (t !== TILE_EMPTY || bombAt(cx, cy)) continue;
      const c = cellCenter(cx, cy);
      const speedScale = enemySpeedScale(game.level || 1);
      game.enemies.push({
        type: minion,
        x: c.x, y: c.y, r: def.r, speed: def.speed * speedScale,
        dir: pickDir(), retargetIn: rand(0.4, 1.2),
        alive: true, deathAnim: 0, anim: Math.random() * Math.PI * 2,
        score: def.score, color: def.color,
        canPhase: !!def.canPhase, hp: def.hp || 1, maxHp: def.hp || 1,
        hitFlash: 0, isBoss: false, bossKind: null, spawnCooldown: 0,
      });
    }
    // brief shockwave visual
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      game.particles.push({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
        life: 0.4, max: 0.4,
        color: boss.color, size: 3,
      });
    }
  }

  // -------- Movement --------
  // Returns true if moving entity from x,y to nx,ny would collide with solid tile/bomb.
  function isBlockedForEntity(nx, ny, entity, opts = {}) {
    const r = entity.r * 0.92;
    const corners = [
      [nx - r, ny - r],
      [nx + r, ny - r],
      [nx - r, ny + r],
      [nx + r, ny + r],
    ];
    for (const [px, py] of corners) {
      const cx = Math.floor(px / TILE);
      const cy = Math.floor(py / TILE);
      const t = tileAt(cx, cy);
      if (t === TILE_HARD) return true;
      if (t === TILE_SOFT || t === TILE_REINFORCED) {
        if (opts.ghost) continue;
        return true;
      }
      const b = bombAt(cx, cy);
      if (b) {
        // Let the entity pass through any bomb its body currently overlaps,
        // so the player can walk off of a freshly-placed bomb without getting
        // stuck the moment their center crosses the tile boundary.
        if (opts.bombPassThroughIds && opts.bombPassThroughIds.has(b._id)) continue;
        return true;
      }
    }
    return false;
  }

  function tryMove(entity, dx, dy, dt, opts = {}) {
    if (dx === 0 && dy === 0) return;
    // Move axis by axis to allow sliding along walls.
    const stepX = dx * entity.speed * dt;
    const stepY = dy * entity.speed * dt;
    if (stepX !== 0) {
      if (!isBlockedForEntity(entity.x + stepX, entity.y, entity, opts)) entity.x += stepX;
      else {
        // try grid-snap nudge so player can squeeze through corridors
        const snapY = Math.round(entity.y / TILE) * TILE + TILE / 2;
        const dySnap = clamp(snapY - entity.y, -entity.speed * dt, entity.speed * dt);
        if (dySnap !== 0 && !isBlockedForEntity(entity.x + stepX, entity.y + dySnap, entity, opts)) {
          entity.x += stepX;
          entity.y += dySnap;
        }
      }
    }
    if (stepY !== 0) {
      if (!isBlockedForEntity(entity.x, entity.y + stepY, entity, opts)) entity.y += stepY;
      else {
        const snapX = Math.round(entity.x / TILE) * TILE + TILE / 2;
        const dxSnap = clamp(snapX - entity.x, -entity.speed * dt, entity.speed * dt);
        if (dxSnap !== 0 && !isBlockedForEntity(entity.x + dxSnap, entity.y + stepY, entity, opts)) {
          entity.x += dxSnap;
          entity.y += stepY;
        }
      }
    }
  }

  // -------- Bombs / Explosions --------
  let bombIdSeq = 1;

  function placeBomb() {
    const p = game.player;
    if (!p.alive) return;
    if (p.bombsActive >= p.maxBombs) return;
    const cx = Math.floor(p.x / TILE);
    const cy = Math.floor(p.y / TILE);
    if (bombAt(cx, cy)) return;
    const bomb = {
      _id: bombIdSeq++,
      x: cx, y: cy,
      fuse: p.remote ? 6.0 : 2.6,
      max: p.remote ? 6.0 : 2.6,
      power: p.bombPower,
      isMega: p.mega,
      owner: p,
      kicked: null,
      remote: p.remote,
    };
    game.bombs.push(bomb);
    p.bombsActive++;
    Audio.bombPlace();
  }

  function detonateRemote() {
    const owned = game.bombs.filter(b => b.remote && b.owner === game.player && b.fuse > 0.05);
    for (const b of owned) b.fuse = 0.05;
  }

  function explodeBomb(bomb) {
    bomb.fuse = -1;
    if (bomb.owner) bomb.owner.bombsActive = Math.max(0, bomb.owner.bombsActive - 1);

    const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    if (bomb.isMega) {
      dirs.push({ x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 });
    }

    addExplosion(bomb.x, bomb.y, 'center');

    for (const d of dirs) {
      for (let i = 1; i <= bomb.power; i++) {
        const nx = bomb.x + d.x * i;
        const ny = bomb.y + d.y * i;
        const t = tileAt(nx, ny);
        if (t === TILE_HARD) break;
        if (t === TILE_REINFORCED) {
          // Degrade to a normal brick on first hit; blast still stops here.
          setTile(nx, ny, TILE_SOFT);
          addExplosion(nx, ny, 'brick');
          addScore(SCORE_BRICK, nx, ny);
          break;
        }
        if (t === TILE_SOFT) {
          setTile(nx, ny, TILE_EMPTY);
          addExplosion(nx, ny, 'brick');
          // reveal hidden powerup if any
          const pu = powerupAt(nx, ny);
          if (pu && pu.hidden) pu.hidden = false;
          // reveal exit door if it was hiding here
          if (game.door && game.door.x === nx && game.door.y === ny && !game.door.revealed) {
            game.door.revealed = true;
          }
          addScore(SCORE_BRICK, nx, ny);
          break;
        }
        // chain detonate other bombs
        const b2 = bombAt(nx, ny);
        if (b2 && b2.fuse > 0.04) {
          b2.fuse = 0.04;
        }
        // destroy powerup that's exposed and in the path -> punishment swarm
        const pu = powerupAt(nx, ny);
        if (pu && !pu.hidden) {
          game.powerups = game.powerups.filter(p => p !== pu);
          addScore(-5, nx, ny);
          spawnPenaltyWave('powerup', nx, ny);
        }
        // hitting the revealed door also spawns a bigger penalty wave
        if (game.door && game.door.revealed && game.door.x === nx && game.door.y === ny) {
          spawnPenaltyWave('door', nx, ny);
        }
        addExplosion(nx, ny, d.x !== 0 ? 'horizontal' : 'vertical');
      }
    }

    Audio.explode();
    game.shake = Math.min(0.4, game.shake + 0.18);
    spawnExplosionParticles(bomb.x, bomb.y, bomb.power);
  }

  function addExplosion(cx, cy, kind) {
    // Merge: extend life if there is already an explosion here
    const existing = explosionAt(cx, cy);
    const max = 0.45;
    if (existing) { existing.life = Math.max(existing.life, max); existing.kind = 'center'; return; }
    game.explosions.push({ x: cx, y: cy, life: max, max, kind });
  }

  function spawnExplosionParticles(cx, cy, power) {
    const cc = cellCenter(cx, cy);
    const n = 14 + power * 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 220);
      game.particles.push({
        x: cc.x, y: cc.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.7),
        max: 0.7,
        color: ['#ffce3a', '#ff7a2e', '#ff3b3b', '#ffffff'][irand(0, 3)],
        size: rand(2, 4.5),
      });
    }
  }

  function addScore(amount, cx, cy, opts = {}) {
    let final = amount;
    if (opts.kill) {
      // combo multiplier on kills: 2 in a row = x1.5, 3 = x2, 5+ = x3
      game.combo += 1;
      game.comboExpire = 2.0;
      const mul = game.combo >= 5 ? 3 : game.combo >= 3 ? 2 : game.combo >= 2 ? 1.5 : 1;
      final = Math.round(amount * mul);
      if (mul > 1 && cx !== undefined) {
        const c = cellCenter(cx, cy);
        game.floats.push({ x: c.x, y: c.y - 14, text: `COMBO x${mul} (${game.combo})`, life: 1.1, max: 1.1, color: '#6dd3ff' });
      }
    }
    game.score += final;
    if (cx !== undefined) {
      const c = cellCenter(cx, cy);
      game.floats.push({ x: c.x, y: c.y, text: (final > 0 ? '+' : '') + final, life: 0.9, max: 0.9, color: final > 0 ? '#ffce3a' : '#ff7a7a' });
    }
    ui.score.textContent = game.score;
    // Extra life threshold(s)
    while (game.score >= game.nextLifeAt) {
      game.player.lives = Math.min(9, game.player.lives + 1);
      ui.lives.textContent = game.player.lives;
      const c = cellCenter(Math.floor(game.player.x / TILE), Math.floor(game.player.y / TILE));
      game.floats.push({ x: c.x, y: c.y - 30, text: '1UP!', life: 1.4, max: 1.4, color: '#ff9bb3' });
      Audio.pickup();
      game.nextLifeAt += EXTRA_LIFE_EVERY;
    }
    // Best score (live update; durable persist happens at end-of-run)
    if (game.score > game.best.score) {
      game.best.score = game.score;
      ui.best.textContent = game.best.score;
    }
  }

  function persistBest() {
    // Update each best-of category and write all three to disk
    if (game.score > game.best.score) game.best.score = game.score;
    if (game.runKills > game.best.kills) game.best.kills = game.runKills;
    if (game.runStage > game.best.stage) game.best.stage = game.runStage;
    try {
      localStorage.setItem('bombblitz.best.v2', JSON.stringify(game.best));
    } catch (e) {}
    refreshHighScoreList();
  }

  function refreshHighScoreList() {
    const el = document.getElementById('hs-list');
    if (!el) return;
    el.innerHTML = `
      <li><span class="hs-cat">POINTS</span><span class="hs-val">${game.best.score.toLocaleString()}</span></li>
      <li><span class="hs-cat">MONSTERS KILLED</span><span class="hs-val">${game.best.kills.toLocaleString()}</span></li>
      <li><span class="hs-cat">HIGHEST STAGE</span><span class="hs-val">${game.best.stage}</span></li>
    `;
  }

  // -------- Powerups --------
  function applyPowerup(type) {
    const p = game.player;
    let tag = type.toUpperCase();
    switch (type) {
      case 'fire':   p.bombPower = Math.min(8, p.bombPower + 1); break;
      case 'bomb':   p.maxBombs  = Math.min(8, p.maxBombs + 1); break;
      case 'speed':  p.speed     = Math.min(220, p.speed + 18); break;
      case 'shield': p.shield = true; Audio.shield(); break;
      case 'ghost':  p.ghost = true; Audio.ghost(); break;
      case 'kick':   p.kick = true; break;
      case 'remote': p.remote = true; break;
      case 'time':   game.timeWarp = 6.0; break;
      case 'mega':   p.mega = true; break;
      case 'life':   p.lives = Math.min(9, p.lives + 1); ui.lives.textContent = p.lives; break;
    }
    addScore(SCORE_POWERUP, Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    Audio.pickup();
    refreshPowerHUD();
  }

  function refreshPowerHUD() {
    const p = game.player;
    const tags = [];
    if (p.bombPower > 1) tags.push('Fx' + p.bombPower);
    if (p.maxBombs > 1)  tags.push('Bx' + p.maxBombs);
    if (p.speed > 130)   tags.push('S+');
    if (p.shield)        tags.push('SHIELD');
    if (p.ghost)         tags.push('WALL-PASS');
    if (p.kick)          tags.push('KICK');
    if (p.remote)        tags.push('REMOTE');
    if (p.mega)          tags.push('MEGA');
    if (game.timeWarp > 0) tags.push('TIME ' + game.timeWarp.toFixed(1));
    ui.powers.textContent = tags.length ? tags.join(' ') : '—';
  }

  // -------- Enemy AI --------
  function updateEnemy(en, dt) {
    if (!en.alive) {
      en.deathAnim -= dt;
      return;
    }
    en.anim += dt * 6;
    en.retargetIn -= dt;
    if (en.hitFlash > 0) en.hitFlash = Math.max(0, en.hitFlash - dt);

    const cx = Math.floor(en.x / TILE);
    const cy = Math.floor(en.y / TILE);

    // Caught in explosion?
    if (explosionAt(cx, cy) && en._lastExplosionTile !== `${cx},${cy}`) {
      en._lastExplosionTile = `${cx},${cy}`;
      en.hp -= 1;
      en.hitFlash = 0.25;
      if (en.hp <= 0) {
        en.alive = false;
        en.deathAnim = 0.55;
        const base = en.score * (game.stageKind === 'bonus' ? SCORE_BONUS_KILL_MUL : 1);
        addScore(base, cx, cy, { kill: true });
        game.runKills += 1;
        if (game.stageKind === 'bonus') game.bonusKills += 1;
        Audio.enemyDeath();
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2;
          game.particles.push({
            x: en.x, y: en.y,
            vx: Math.cos(a) * rand(60, 220),
            vy: Math.sin(a) * rand(60, 220),
            life: rand(0.3, 0.8), max: 0.8,
            color: en.color, size: rand(2, 4),
          });
        }
        return;
      } else {
        // Boss survived a hit: knock back a tile and stagger.
        Audio.hurt();
        en.retargetIn = 0.5;
      }
    }
    if (!explosionAt(cx, cy)) en._lastExplosionTile = null;

    // Re-pick direction at intersections / when blocked.
    // Probe a full body-radius ahead so we detect the wall *before* clipping it,
    // and also retarget when stuck mid-tile (otherwise an enemy that walks
    // face-first into a wall freezes forever, because the original logic only
    // retargeted near a cell center).
    const centerDist = Math.hypot(en.x - (cx * TILE + TILE / 2), en.y - (cy * TILE + TILE / 2));
    const probe = en.r + 2;
    const aheadBlocked = isBlockedForEntity(en.x + en.dir.x * probe, en.y + en.dir.y * probe, en, { ghost: en.canPhase });

    if (centerDist < 4 || aheadBlocked) {
      const danger = isOnBombFusePath(cx, cy);
      if (danger || en.retargetIn <= 0 || aheadBlocked) {
        // If we were stuck against a wall, snap back to the cell center first
        // so the new direction has clean grid alignment.
        if (aheadBlocked && centerDist > 4) {
          en.x = cx * TILE + TILE / 2;
          en.y = cy * TILE + TILE / 2;
        }
        en.dir = chooseEnemyDir(en, cx, cy, danger);
        // Liners commit longer to the direction they pick to feel like they "walk straight".
        en.retargetIn = en.type === 'liner' ? rand(2.0, 3.5) : rand(0.5, 1.4);
      }
    }

    let speedMul = 1;
    if (game.timeWarp > 0) speedMul = 0.45;
    const wasSpeed = en.speed;
    en.speed = wasSpeed * speedMul;
    tryMove(en, en.dir.x, en.dir.y, dt, { ghost: en.canPhase });
    en.speed = wasSpeed;

    // Boss-only behaviour: periodically summon minions. Different boss kinds
    // summon different things to keep encounters varied.
    if (en.isBoss) {
      en.spawnCooldown -= dt;
      if (en.spawnCooldown <= 0) {
        en.spawnCooldown = (en.bossKind === 'overlord') ? 6 : 9;
        spawnBossMinions(en);
      }
    }

    // Touched player?
    if (game.player.alive && game.player.iframes <= 0) {
      const dx = en.x - game.player.x;
      const dy = en.y - game.player.y;
      if (Math.hypot(dx, dy) < en.r + game.player.r * 0.85) {
        damagePlayer();
      }
    }
  }

  function chooseEnemyDir(en, cx, cy, danger) {
    const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    dirs.sort(() => Math.random() - 0.5);

    let preferred = null;

    // Liners want to keep their current direction whenever it's still clear
    if (en.type === 'liner' && en.dir && (en.dir.x !== 0 || en.dir.y !== 0)) {
      if (canStepInto(cx + en.dir.x, cy + en.dir.y, en, danger)) preferred = en.dir;
    }

    // Chaser / smart / boss aim at the player
    const isBoss = typeof en.type === 'string' && en.type.startsWith('boss');
    if (!preferred && (en.type === 'chaser' || en.type === 'smart' || isBoss)) {
      const px = Math.floor(game.player.x / TILE);
      const py = Math.floor(game.player.y / TILE);
      const useBfs = (en.type === 'smart' || isBoss);
      const d = useBfs ? bfsNextStep(cx, cy, px, py, en.canPhase) : null;
      if (d) preferred = d;
      else {
        const dx = px - cx, dy = py - cy;
        if (Math.abs(dx) > Math.abs(dy)) preferred = dx > 0 ? DIR.RIGHT : dx < 0 ? DIR.LEFT : null;
        else if (dy !== 0) preferred = dy > 0 ? DIR.DOWN : DIR.UP;
      }
    }

    const ordered = preferred ? [preferred, ...dirs.filter(d => d !== preferred)] : dirs;

    for (const d of ordered) {
      if (canStepInto(cx + d.x, cy + d.y, en, danger)) return d;
    }
    // last resort: even into danger
    for (const d of ordered) {
      if (canStepInto(cx + d.x, cy + d.y, en, false)) return d;
    }
    return DIR.NONE;
  }

  function canStepInto(nx, ny, en, avoidDanger) {
    if (!inGrid(nx, ny)) return false;
    const t = tileAt(nx, ny);
    if (t === TILE_HARD) return false;
    if ((t === TILE_SOFT || t === TILE_REINFORCED) && !en.canPhase) return false;
    if (bombAt(nx, ny)) return false;
    if (avoidDanger && isOnBombFusePath(nx, ny)) return false;
    return true;
  }

  function isOnBombFusePath(cx, cy) {
    for (const b of game.bombs) {
      if (b.fuse > 1.4) continue;
      if (b.x === cx && b.y === cy) return true;
      const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
      for (const d of dirs) {
        for (let i = 1; i <= b.power; i++) {
          const nx = b.x + d.x * i, ny = b.y + d.y * i;
          const t = tileAt(nx, ny);
          if (t === TILE_HARD) break;
          if (nx === cx && ny === cy) return true;
          if (t === TILE_SOFT) break;
        }
      }
    }
    return false;
  }

  // BFS next-step direction from (sx,sy) toward (tx,ty). If canPhase is true,
  // soft walls are traversable (used by phaser-class enemies and the boss).
  function bfsNextStep(sx, sy, tx, ty, canPhase = false) {
    if (sx === tx && sy === ty) return null;
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    visited[sy][sx] = { from: null, dir: null };
    const q = [[sx, sy]];
    const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    let found = false;
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) { found = true; break; }
      for (const d of dirs) {
        const nx = x + d.x, ny = y + d.y;
        if (!inGrid(nx, ny) || visited[ny][nx]) continue;
        const t = tileAt(nx, ny);
        if (t === TILE_HARD) continue;
        if ((t === TILE_SOFT || t === TILE_REINFORCED) && !canPhase) continue;
        if (bombAt(nx, ny)) continue;
        visited[ny][nx] = { from: [x, y], dir: d };
        q.push([nx, ny]);
      }
    }
    if (!found) return null;
    let cur = [tx, ty], dir = null;
    while (cur && (cur[0] !== sx || cur[1] !== sy)) {
      const v = visited[cur[1]][cur[0]];
      dir = v.dir;
      cur = v.from;
    }
    return dir;
  }

  // -------- Player damage / death --------
  function damagePlayer() {
    const p = game.player;
    if (!p.alive || p.iframes > 0) return;
    if (p.shield) {
      p.shield = false;
      p.iframes = 1.4;
      Audio.shield();
      refreshPowerHUD();
      return;
    }
    p.alive = false;
    // Bonus stages don't cost a life — you just get sent back to the start.
    if (game.stageKind !== 'bonus') {
      p.lives -= 1;
      game._diedThisStage = true;
    }
    Audio.hurt();
    game.shake = Math.max(game.shake, 0.35);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      game.particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * rand(80, 200),
        vy: Math.sin(a) * rand(80, 200),
        life: rand(0.4, 0.9), max: 0.9,
        color: '#ffd06b', size: rand(2, 4.5),
      });
    }
    if (game._respawnTimer) clearTimeout(game._respawnTimer);
    game._respawnTimer = setTimeout(() => {
      game._respawnTimer = null;
      // Bail if a new game has replaced the player in the meantime.
      if (game.player !== p) return;
      if (p.lives <= 0) endGame(false);
      else respawnPlayer();
    }, 1200);
  }

  function respawnPlayer() {
    const old = game.player;
    const c = cellCenter(1, 1);
    game.player = {
      ...old,
      x: c.x, y: c.y,
      facing: 'down',
      moveAnim: 0,
      alive: true,
      iframes: 2.5,
      bombsActive: 0,
      // Wall-pass is a per-life ability — clear it on death.
      ghost: false,
    };
    ui.lives.textContent = game.player.lives;
    refreshPowerHUD();
  }

  // -------- Update loop --------
  function update(dt) {
    game.elapsed += dt;
    game.shake = Math.max(0, game.shake - dt * 1.4);

    if (game.state !== 'playing') return;

    // Time
    game.timeLeft -= dt;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      if (game.stageKind === 'bonus') {
        // Bonus stage just ends when the clock runs out — handled below.
      } else {
        damagePlayer();
        game.timeLeft = 60; // grace window to keep playing after a timeout death
      }
    }
    ui.time.textContent = formatTime(game.timeLeft);

    if (game.timeWarp > 0) {
      game.timeWarp = Math.max(0, game.timeWarp - dt);
      refreshPowerHUD();
    }

    const p = game.player;
    if (p.alive) {
      if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);

      // Movement
      let dx = 0, dy = 0;
      if (keys.has('left'))  dx -= 1;
      if (keys.has('right')) dx += 1;
      if (keys.has('up'))    dy -= 1;
      if (keys.has('down'))  dy += 1;
      if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

      if (dx !== 0 || dy !== 0) {
        p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        p.moveAnim += dt * 9;
      }

      // Find every bomb the player's body currently overlaps so they can step
      // off of any of them. Without this, the player gets stuck the moment
      // their center crosses out of a freshly-placed bomb's tile but the rest
      // of their body is still on top of it.
      const cx = Math.floor(p.x / TILE);
      const cy = Math.floor(p.y / TILE);
      const passThroughIds = new Set();
      const rr = p.r * 0.92;
      const probe = [
        [p.x - rr, p.y - rr],
        [p.x + rr, p.y - rr],
        [p.x - rr, p.y + rr],
        [p.x + rr, p.y + rr],
        [p.x, p.y],
      ];
      for (const [px, py] of probe) {
        const b = bombAt(Math.floor(px / TILE), Math.floor(py / TILE));
        if (b) passThroughIds.add(b._id);
      }

      tryMove(p, dx, dy, dt, {
        ghost: p.ghost,
        bombPassThroughIds: passThroughIds,
      });

      // Kick: try to push a bomb in front of the player when walking into it
      if (p.kick && (dx !== 0 || dy !== 0)) {
        const fx = (dx !== 0 ? Math.sign(dx) : 0);
        const fy = (dy !== 0 ? Math.sign(dy) : 0);
        const ahead = bombAt(cx + fx, cy + fy);
        if (ahead && !ahead.kicked) {
          ahead.kicked = { dx: fx, dy: fy, vel: 220 };
        }
      }

      // Pickups
      const onCx = Math.floor(p.x / TILE);
      const onCy = Math.floor(p.y / TILE);
      const pu = powerupAt(onCx, onCy);
      if (pu && !pu.hidden) {
        applyPowerup(pu.type);
        game.powerups = game.powerups.filter(x => x !== pu);
      }

      // Player standing in explosion?
      if (explosionAt(onCx, onCy) && p.iframes <= 0) damagePlayer();
    }

    // Bombs
    for (const b of game.bombs) {
      b.fuse -= dt;
      // Handle kicked motion (slide one tile at a time until hitting something)
      if (b.kicked) {
        b._kickCool = (b._kickCool || 0) + dt;
        if (b._kickCool >= 0.08) {
          b._kickCool = 0;
          const nx = b.x + b.kicked.dx, ny = b.y + b.kicked.dy;
          const blocked = tileAt(nx, ny) !== TILE_EMPTY || bombAt(nx, ny);
          if (blocked) b.kicked = null;
          else { b.x = nx; b.y = ny; }
        }
      }
    }
    // Detonate ready bombs
    for (const b of game.bombs) if (b.fuse <= 0 && b.fuse > -1) explodeBomb(b);
    game.bombs = game.bombs.filter(b => b.fuse > -1);

    // Explosions
    for (const e of game.explosions) e.life -= dt;
    game.explosions = game.explosions.filter(e => e.life > 0);

    // Enemies
    for (const en of game.enemies) updateEnemy(en, dt);
    game.enemies = game.enemies.filter(e => e.alive || e.deathAnim > 0);

    // Particles
    for (const pa of game.particles) {
      pa.life -= dt;
      pa.x += pa.vx * dt;
      pa.y += pa.vy * dt;
      pa.vx *= 0.92;
      pa.vy *= 0.92;
    }
    game.particles = game.particles.filter(p => p.life > 0);

    for (const f of game.floats) {
      f.life -= dt;
      f.y -= 30 * dt;
    }
    game.floats = game.floats.filter(f => f.life > 0);

    // Powerup animations
    for (const pu of game.powerups) pu.anim += dt * 3;

    // Decay combo when no kills happen for a while
    if (game.combo > 0) {
      game.comboExpire -= dt;
      if (game.comboExpire <= 0) game.combo = 0;
    }

    // Bonus stages end on the timer; regular/boss end when monsters are dead
    if (game.stageKind === 'bonus') {
      if (game.timeLeft <= 0 || game.enemies.filter(e => e.alive).length === 0) {
        const allKilled = game.enemies.filter(e => e.alive).length === 0;
        const bonus = game.bonusKills * 100 + (allKilled ? 5000 : 0);
        addScore(bonus);
        Audio.win();
        game.state = 'leveldone';
        setTimeout(() => nextLevel(), 1400);
      }
      return;
    }

    // Regular / boss stages: kill everything, THEN walk onto the exit door.
    const aliveEnemies = game.enemies.filter(e => e.alive).length;
    if (aliveEnemies === 0 && game.state === 'playing') {
      // First time we hit zero enemies, prompt the player to find the door.
      if (!game._exitPromptShown) {
        game._exitPromptShown = true;
        const target = game.door
          ? `Find the exit door (it's hidden under a brick)!`
          : `Stage clear!`;
        const c = cellCenter(Math.floor(game.player.x / TILE), Math.floor(game.player.y / TILE));
        game.floats.push({ x: c.x, y: c.y - 24, text: target, life: 2.4, max: 2.4, color: '#6dd3ff' });
      }
      // Walk onto the (revealed) door to actually clear the stage.
      const px = Math.floor(game.player.x / TILE);
      const py = Math.floor(game.player.y / TILE);
      const onDoor = game.door && game.door.revealed && game.door.x === px && game.door.y === py;
      // No-door stages (shouldn't happen normally) auto-advance.
      const noDoor = !game.door;
      if (onDoor || noDoor) {
        const timeBonus  = Math.floor(game.timeLeft) * SCORE_TIME_PER;
        const livesBonus = game.player.lives * SCORE_LIFE_PER;
        const noDeath    = game._diedThisStage ? 0 : SCORE_NO_DEATH;
        addScore(timeBonus + livesBonus + noDeath);
        Audio.win();
        game.state = 'leveldone';
        setTimeout(() => nextLevel(), 1400);
      }
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  }

  // -------- Rendering --------
  function render() {
    // shake offset (screen space)
    let ox = 0, oy = 0;
    if (game.shake > 0) {
      ox = (Math.random() - 0.5) * game.shake * 14;
      oy = (Math.random() - 0.5) * game.shake * 14;
    }

    // Smooth camera follow, clamped to map bounds.
    const targetX = clamp((game.player ? game.player.x : W/2) - W / 2, 0, Math.max(0, mapW() - W));
    const targetY = clamp((game.player ? game.player.y : H/2) - H / 2, 0, Math.max(0, mapH() - H));
    if (!game._cameraInitialized) {
      game.cameraX = targetX;
      game.cameraY = targetY;
      game._cameraInitialized = true;
    } else {
      game.cameraX += (targetX - game.cameraX) * 0.18;
      game.cameraY += (targetY - game.cameraY) * 0.18;
    }
    const camX = Math.round(game.cameraX);
    const camY = Math.round(game.cameraY);

    ctx.save();
    ctx.translate(ox, oy);

    // Floor (screen-space solid + cheap parallax dots)
    drawFloor();

    // Apply camera transform for everything that lives in world space
    ctx.save();
    ctx.translate(-camX, -camY);

    // Compute visible tile range so we don't loop the entire 50x200 map.
    const startX = Math.max(0, Math.floor(camX / TILE));
    const endX   = Math.min(COLS, Math.ceil((camX + W) / TILE) + 1);
    const startY = Math.max(0, Math.floor(camY / TILE));
    const endY   = Math.min(ROWS, Math.ceil((camY + H) / TILE) + 1);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        // subtle checker tint
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.018)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
        const t = game.grid[y][x];
        if (t === TILE_HARD) drawHardWall(x, y);
        else if (t === TILE_REINFORCED) drawReinforcedWall(x, y);
        else if (t === TILE_SOFT) drawSoftWall(x, y);
      }
    }

    // exit door (revealed)
    if (game.door && game.door.revealed) drawDoor(game.door);

    // powerups (revealed) - visibility cull
    for (const pu of game.powerups) {
      if (pu.hidden) continue;
      if (pu.x < startX - 1 || pu.x > endX + 1) continue;
      if (pu.y < startY - 1 || pu.y > endY + 1) continue;
      drawPowerup(pu);
    }

    // bombs
    for (const b of game.bombs) drawBomb(b);

    // explosions
    for (const e of game.explosions) drawExplosion(e);

    // enemies (visibility cull)
    for (const en of game.enemies) {
      const ex = Math.floor(en.x / TILE);
      const ey = Math.floor(en.y / TILE);
      if (ex < startX - 1 || ex > endX + 1) continue;
      if (ey < startY - 1 || ey > endY + 1) continue;
      drawEnemy(en);
    }

    // player
    if (game.player) drawPlayer(game.player);

    // particles
    for (const pa of game.particles) {
      ctx.globalAlpha = clamp(pa.life / pa.max, 0, 1);
      ctx.fillStyle = pa.color;
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, pa.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // floats
    for (const f of game.floats) {
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // End world-space transform
    ctx.restore();

    // Door beacon (screen-space arrow pointing toward the exit)
    if (game.door && game.door.revealed) drawDoorBeacon(game.door, camX, camY);

    // Mini-map (screen-space)
    drawMinimap(camX, camY);

    // vignette
    const grd = ctx.createRadialGradient(W/2, H/2, H * 0.4, W/2, H/2, H * 0.85);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  }

  function drawFloor() {
    // Screen-space solid gradient. The per-tile checker tint is drawn inside
    // the visible-tile loop so we only paint what's actually on screen.
    const theme = game.theme || DEFAULT_THEME;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.floorTop);
    g.addColorStop(1, theme.floorBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawDoorBeacon(door, camX, camY) {
    // If the door is on screen, no beacon needed.
    const dx_world = door.x * TILE + TILE / 2;
    const dy_world = door.y * TILE + TILE / 2;
    if (dx_world >= camX && dx_world <= camX + W && dy_world >= camY && dy_world <= camY + H) return;
    // Draw a small arrow on the screen edge pointing toward the door.
    const playerCx = (game.player ? game.player.x : camX + W/2) - camX;
    const playerCy = (game.player ? game.player.y : camY + H/2) - camY;
    const targetX = dx_world - camX;
    const targetY = dy_world - camY;
    const dx = targetX - playerCx;
    const dy = targetY - playerCy;
    const ang = Math.atan2(dy, dx);
    // clamp to a margin inside the canvas
    const m = 36;
    const px = clamp(playerCx + Math.cos(ang) * 9999, m, W - m);
    const py = clamp(playerCy + Math.sin(ang) * 9999, m, H - m);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.shadowColor = '#6dd3ff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#6dd3ff';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, 9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, -9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
    // small "EXIT" label
    ctx.fillStyle = 'rgba(109, 211, 255, 0.95)';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', px, py + 22);
  }

  function drawMinimap(camX, camY) {
    if (!game.player) return;
    if (game.stageKind === 'bonus') return;   // tiny map; skip
    // Small map in the top-right corner. Tiles are 1px each so 50x200 fits 50x200 px.
    const padding = 8;
    const mapPxW = COLS;     // 1 px per tile
    const mapPxH = Math.min(ROWS, 110);  // cap so it doesn't dominate the screen
    const mx = W - mapPxW - padding;
    const my = padding;
    // background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(mx - 2, my - 2, mapPxW + 4, mapPxH + 4);
    // tiles (sample down if rows > mapPxH)
    const yStep = ROWS / mapPxH;
    for (let py = 0; py < mapPxH; py++) {
      const row = Math.floor(py * yStep);
      for (let px = 0; px < mapPxW; px++) {
        const t = game.grid[row][px];
        if (t === TILE_HARD)        ctx.fillStyle = 'rgba(180, 195, 230, 0.5)';
        else if (t === TILE_SOFT)   ctx.fillStyle = 'rgba(200, 130, 80, 0.4)';
        else if (t === TILE_REINFORCED) ctx.fillStyle = 'rgba(120, 90, 70, 0.55)';
        else continue;
        ctx.fillRect(mx + px, my + py, 1, 1);
      }
    }
    // player dot
    const px_dot = mx + Math.floor(game.player.x / TILE);
    const py_dot = my + Math.floor((game.player.y / TILE) / yStep);
    ctx.fillStyle = '#9be0ff';
    ctx.fillRect(px_dot - 1, py_dot - 1, 3, 3);
    // door dot (only if revealed)
    if (game.door && game.door.revealed) {
      const dx_dot = mx + game.door.x;
      const dy_dot = my + Math.floor(game.door.y / yStep);
      ctx.fillStyle = '#6dd3ff';
      ctx.fillRect(dx_dot - 1, dy_dot - 1, 3, 3);
    }
    // viewport rectangle
    ctx.strokeStyle = 'rgba(255, 206, 58, 0.6)';
    ctx.lineWidth = 1;
    const vx = mx + Math.floor(camX / TILE);
    const vy = my + Math.floor((camY / TILE) / yStep);
    const vw = Math.ceil(W / TILE);
    const vh = Math.max(2, Math.ceil((H / TILE) / yStep));
    ctx.strokeRect(vx, vy, vw, vh);
  }

  function drawHardWall(cx, cy) {
    const x = cx * TILE, y = cy * TILE;
    const theme = game.theme || DEFAULT_THEME;
    const g = ctx.createLinearGradient(x, y, x, y + TILE);
    g.addColorStop(0, theme.hardA);
    g.addColorStop(0.5, mix(theme.hardA, theme.hardB, 0.5));
    g.addColorStop(1, theme.hardB);
    ctx.fillStyle = g;
    roundRect(x + 2, y + 2, TILE - 4, TILE - 4, 6, true, false);
    // bevel highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + TILE - 6);
    ctx.lineTo(x + 4, y + 4);
    ctx.lineTo(x + TILE - 6, y + 4);
    ctx.stroke();
    // shadow edge
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(x + TILE - 4, y + 6);
    ctx.lineTo(x + TILE - 4, y + TILE - 4);
    ctx.lineTo(x + 6, y + TILE - 4);
    ctx.stroke();
    // rivet
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawSoftWall(cx, cy) {
    const x = cx * TILE, y = cy * TILE;
    const theme = game.theme || DEFAULT_THEME;
    const top = theme.soft;
    const bot = mix(theme.soft, '#000000', 0.55);
    const g = ctx.createLinearGradient(x, y, x, y + TILE);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 4, true, false);
    // brick lines
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1;
    const inner = { x: x + 4, y: y + 4, w: TILE - 8, h: TILE - 8 };
    ctx.beginPath();
    // horizontal lines
    ctx.moveTo(inner.x, inner.y + inner.h * 0.33);
    ctx.lineTo(inner.x + inner.w, inner.y + inner.h * 0.33);
    ctx.moveTo(inner.x, inner.y + inner.h * 0.66);
    ctx.lineTo(inner.x + inner.w, inner.y + inner.h * 0.66);
    // staggered vertical
    ctx.moveTo(inner.x + inner.w * 0.5, inner.y);
    ctx.lineTo(inner.x + inner.w * 0.5, inner.y + inner.h * 0.33);
    ctx.moveTo(inner.x + inner.w * 0.25, inner.y + inner.h * 0.33);
    ctx.lineTo(inner.x + inner.w * 0.25, inner.y + inner.h * 0.66);
    ctx.moveTo(inner.x + inner.w * 0.75, inner.y + inner.h * 0.33);
    ctx.lineTo(inner.x + inner.w * 0.75, inner.y + inner.h * 0.66);
    ctx.moveTo(inner.x + inner.w * 0.5, inner.y + inner.h * 0.66);
    ctx.lineTo(inner.x + inner.w * 0.5, inner.y + inner.h);
    ctx.stroke();
    // top highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(inner.x + inner.w, inner.y);
    ctx.stroke();
  }

  function drawBomb(b) {
    const c = cellCenter(b.x, b.y);
    const t = (b.max - b.fuse) / b.max;
    const pulse = 1 + Math.sin(game.elapsed * (10 + 30 * t)) * 0.06 * (0.5 + t);
    const r = TILE * 0.32 * pulse;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    const g = ctx.createRadialGradient(c.x - r * 0.4, c.y - r * 0.4, r * 0.2, c.x, c.y, r);
    g.addColorStop(0, '#5e6a82');
    g.addColorStop(1, b.isMega ? '#3a0a14' : '#0e0f17');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(c.x - r * 0.4, c.y - r * 0.4, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // glow if remote ready
    if (b.remote) {
      ctx.strokeStyle = 'rgba(255,106,213,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 3 + Math.sin(game.elapsed * 6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // mega ring
    if (b.isMega) {
      ctx.strokeStyle = 'rgba(255,46,99,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // fuse
    const fuseY = c.y - r;
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, fuseY);
    ctx.quadraticCurveTo(c.x + 6, fuseY - 6, c.x + 8, fuseY - 10);
    ctx.stroke();
    // spark
    const spark = (Math.sin(game.elapsed * 18) + 1) * 2 + 2;
    const sparkColor = b.fuse < 0.6 ? '#ff3b3b' : (b.fuse < 1.4 ? '#ff9b3a' : '#ffce3a');
    ctx.fillStyle = sparkColor;
    ctx.shadowColor = sparkColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(c.x + 8, fuseY - 10, spark, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawExplosion(e) {
    const c = cellCenter(e.x, e.y);
    const t = e.life / e.max;
    const r = TILE * 0.5 * (1 - Math.pow(1 - t, 2));
    // outer glow
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, TILE * 0.55);
    g.addColorStop(0, `rgba(255, 240, 180, ${0.85 * t})`);
    g.addColorStop(0.4, `rgba(255, 130, 30, ${0.7 * t})`);
    g.addColorStop(1, 'rgba(255, 30, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(e.x * TILE - 4, e.y * TILE - 4, TILE + 8, TILE + 8);
    // hot core
    ctx.fillStyle = `rgba(255, 255, 240, ${0.7 * t})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDoor(door) {
    door.anim += 0.05;
    const x = door.x * TILE, y = door.y * TILE;
    const cx = x + TILE / 2, cy = y + TILE / 2;
    // archway
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(x + 8, y + 6, TILE - 16, TILE - 8, 8, true, false);
    // glowing portal
    const r = TILE * 0.32 * (1 + Math.sin(door.anim) * 0.05);
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#6dd3ff');
    grad.addColorStop(1, 'rgba(40, 80, 200, 0.05)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // chevron arrow
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 4);
    ctx.lineTo(cx, cy - 4);
    ctx.lineTo(cx + 6, cy + 4);
    ctx.stroke();
  }

  function drawReinforcedWall(cx, cy) {
    const x = cx * TILE, y = cy * TILE;
    const theme = game.theme || DEFAULT_THEME;
    const top = mix(theme.soft, '#000000', 0.30);
    const bot = mix(theme.soft, '#000000', 0.75);
    const g = ctx.createLinearGradient(x, y, x, y + TILE);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 4, true, false);
    // metallic plate look: rivets at corners + diagonal cross
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + TILE - 7, y + TILE - 7);
    ctx.moveTo(x + TILE - 7, y + 7); ctx.lineTo(x + 7, y + TILE - 7);
    ctx.stroke();
    ctx.fillStyle = theme.accent;
    [[x+8,y+8],[x+TILE-8,y+8],[x+8,y+TILE-8],[x+TILE-8,y+TILE-8]].forEach(([px,py]) => {
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawPowerup(pu) {
    const c = cellCenter(pu.x, pu.y);
    const def = POWERUPS.find(p => p.id === pu.type);
    const float = Math.sin(pu.anim) * 3;
    // glow
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(c.x, c.y + float, TILE * 0.30, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // ring
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y + float, TILE * 0.30, 0, Math.PI * 2);
    ctx.stroke();
    // letter
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, c.x, c.y + float + 1);
  }

  function drawPlayer(p) {
    if (!p.alive) return;
    const flicker = p.iframes > 0 && Math.floor(game.elapsed * 14) % 2 === 0;
    if (flicker) ctx.globalAlpha = 0.4;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.r * 0.9, p.r * 0.95, p.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // ghost effect
    if (p.ghost) ctx.globalAlpha *= 0.7;

    // body
    const bob = Math.sin(p.moveAnim) * 1.5;
    const cy = p.y + bob;
    const grad = ctx.createRadialGradient(p.x - p.r * 0.4, cy - p.r * 0.4, 4, p.x, cy, p.r);
    grad.addColorStop(0, '#9be0ff');
    grad.addColorStop(1, '#1f6dd6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, cy, p.r, 0, Math.PI * 2);
    ctx.fill();

    // helmet stripe
    ctx.fillStyle = '#ffce3a';
    ctx.beginPath();
    ctx.arc(p.x, cy - p.r * 0.05, p.r * 0.95, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(p.x + p.r * 0.55, cy - p.r * 0.05);
    ctx.closePath();
    ctx.fill();

    // visor (face)
    const fx = p.facing === 'left' ? -p.r * 0.18 : p.facing === 'right' ? p.r * 0.18 : 0;
    const fy = p.facing === 'up' ? -p.r * 0.15 : p.facing === 'down' ? p.r * 0.10 : 0;
    ctx.fillStyle = '#0c1430';
    ctx.beginPath();
    ctx.ellipse(p.x + fx, cy + fy + 2, p.r * 0.55, p.r * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
    // visor shine
    ctx.fillStyle = 'rgba(180, 230, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(p.x + fx - p.r * 0.2, cy + fy + 1, p.r * 0.18, p.r * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();

    // shield aura
    if (p.shield) {
      ctx.strokeStyle = 'rgba(106,255,177,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, cy, p.r + 4 + Math.sin(game.elapsed * 6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.ghost) {
      ctx.strokeStyle = 'rgba(185,147,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, cy, p.r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  function drawEnemy(en) {
    const t = en.alive ? 1 : Math.max(0, en.deathAnim / 0.55);
    if (t <= 0) return;
    const wobble = Math.sin(en.anim) * 2;
    // shadow
    ctx.fillStyle = `rgba(0,0,0,${0.35 * t})`;
    ctx.beginPath();
    ctx.ellipse(en.x, en.y + en.r * 0.9, en.r * 0.9, en.r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = t;

    // body
    const g = ctx.createRadialGradient(en.x - en.r * 0.4, en.y - en.r * 0.4, 3, en.x, en.y, en.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.05, en.color);
    g.addColorStop(1, '#1a0a30');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(en.x, en.y + wobble * 0.5, en.r, 0, Math.PI * 2);
    ctx.fill();

    // spikes for chaser/smart
    if (en.type === 'chaser' || en.type === 'smart') {
      ctx.fillStyle = en.color;
      const spikes = en.type === 'smart' ? 6 : 4;
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2 + en.anim * 0.3;
        const sx = en.x + Math.cos(a) * en.r * 1.05;
        const sy = en.y + wobble * 0.5 + Math.sin(a) * en.r * 1.05;
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // eyes
    const dirVec = en.dir || DIR.DOWN;
    const ex = dirVec.x * 3;
    const ey = dirVec.y * 3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(en.x - en.r * 0.35, en.y - en.r * 0.05, 4, 0, Math.PI * 2);
    ctx.arc(en.x + en.r * 0.35, en.y - en.r * 0.05, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a0f';
    ctx.beginPath();
    ctx.arc(en.x - en.r * 0.35 + ex, en.y - en.r * 0.05 + ey, 2, 0, Math.PI * 2);
    ctx.arc(en.x + en.r * 0.35 + ex, en.y - en.r * 0.05 + ey, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    const v = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(A[0] + (B[0] - A[0]) * t);
    const g = Math.round(A[1] + (B[1] - A[1]) * t);
    const bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // -------- Game flow --------
  function startNewGame() {
    if (game._respawnTimer) { clearTimeout(game._respawnTimer); game._respawnTimer = null; }
    game.score = 0;
    game.level = 0;
    game.runKills = 0;
    game.runStage = 0;
    game.nextLifeAt = EXTRA_LIFE_EVERY;
    ui.score.textContent = '0';
    if (ui.best) ui.best.textContent = game.best.score;
    game.player = makePlayer();
    game.player.lives = 3;
    ui.lives.textContent = '3';
    nextLevel();
  }

  function nextLevel() {
    game.level += 1;
    if (game.level > LEVELS.length) {
      ui.winScore.textContent = game.score;
      hideAllOverlays();
      ui.overlayVictory.classList.remove('hidden');
      game.state = 'victory';
      persistBest();
      return;
    }
    const cfg = LEVELS[game.level - 1];
    game.stageKind = cfg.kind;
    game.theme = THEMES[cfg.theme] || DEFAULT_THEME;

    // Bonus rounds use a single-screen map so the 30-second timer is fair.
    // Regular and boss stages use the full 50x200 scrolling map.
    if (cfg.kind === 'bonus') {
      COLS = VIEW_COLS;
      ROWS = VIEW_ROWS;
    } else {
      COLS = FULL_MAP_COLS;
      ROWS = FULL_MAP_ROWS;
    }

    let built;
    if (cfg.kind === 'bonus') {
      built = buildBonusLevel(game.level - 1);
    } else {
      built = buildLevel(game.level - 1);
    }

    game.grid = built.grid;
    game.powerups = built.powerups;
    game.door = built.door || null;
    game.bombs = [];
    game._cameraInitialized = false;
    game.cameraX = 0;
    game.cameraY = 0;
    game.explosions = [];
    game.particles = [];
    game.floats = [];
    game.timeWarp = 0;
    game.shake = 0;
    game.combo = 0;
    game.bonusKills = 0;
    game._diedThisStage = false;
    game._exitPromptShown = false;
    game.bossActive = (cfg.kind === 'boss');
    game.levelStartedAt = game.elapsed;

    // Bonus rounds get a 30s sprint; regular/boss get a generous clock since
    // the playfield is now 50x200 and you need time to traverse it.
    game.timeLeft = (cfg.kind === 'bonus') ? 30 : (480 + 20 * (game.level - 1));
    if (cfg.kind === 'boss') game.timeLeft += 120;

    // Player keeps powerups (including wall-pass) across stages.
    // Wall-pass only resets when the player actually dies.
    const old = game.player || makePlayer();
    const c = cellCenter(1, 1);
    game.player = {
      ...old,
      x: c.x, y: c.y,
      facing: 'down',
      moveAnim: 0,
      alive: true,
      iframes: 2.0,
      bombsActive: 0,
    };

    if (cfg.kind === 'bonus') {
      // Bonus stage spawns a swarm of weak walkers worth 100 each (+ x2 multiplier).
      game.enemies = spawnBonusSwarm();
    } else {
      game.enemies = spawnEnemies(cfg.enemies);
    }

    if (game.level > game.runStage) game.runStage = game.level;

    ui.level.textContent = game.level;
    ui.time.textContent = formatTime(game.timeLeft);
    ui.lives.textContent = game.player.lives;
    ui.score.textContent = game.score;
    ui.best.textContent = game.best.score;
    refreshPowerHUD();

    // intro overlay
    if (cfg.kind === 'bonus') {
      ui.levelTitle.textContent = `BONUS STAGE`;
      ui.levelTag.textContent = '30 seconds — bomb every monster you can!';
    } else if (cfg.kind === 'boss') {
      ui.levelTitle.textContent = `STAGE ${game.level} — ${cfg.tag.replace('BOSS: ','')}`;
      ui.levelTag.textContent = 'Boss fight! Hit them more than once.';
    } else {
      ui.levelTitle.textContent = `STAGE ${game.level}`;
      ui.levelTag.textContent = cfg.tag;
    }
    hideAllOverlays();
    ui.overlayLevel.classList.remove('hidden');
    game.state = 'levelintro';
    setTimeout(() => {
      hideAllOverlays();
      game.state = 'playing';
    }, 1700);
  }

  // -------- Bonus level layout --------
  // Open arena with sparse pillars and no soft walls — pure target practice.
  function buildBonusLevel(_levelIdx) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE_EMPTY));
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) grid[y][x] = TILE_HARD;
        else if (x % 2 === 0 && y % 2 === 0) grid[y][x] = TILE_HARD;
      }
    }
    return { grid, powerups: [] };
  }

  function spawnBonusSwarm() {
    const out = [];
    const candidates = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (game.grid[y][x] !== TILE_EMPTY) continue;
        if (Math.abs(x - 1) + Math.abs(y - 1) < 4) continue;
        candidates.push({ x, y });
      }
    }
    candidates.sort(() => Math.random() - 0.5);
    const N = Math.min(candidates.length, 14);
    for (let i = 0; i < N; i++) {
      const cell = candidates[i];
      const c = cellCenter(cell.x, cell.y);
      const def = ENEMY_DEFS.walker;
      out.push({
        type: 'walker',
        x: c.x, y: c.y, r: def.r, speed: 60,
        dir: pickDir(), retargetIn: rand(0.4, 1.2),
        alive: true, deathAnim: 0, anim: Math.random() * Math.PI * 2,
        score: 100, color: '#ffd06b',
        canPhase: false, hp: 1, maxHp: 1, hitFlash: 0, isBoss: false, bossKind: null,
      });
    }
    return out;
  }

  function endGame(won) {
    game.state = won ? 'victory' : 'gameover';
    persistBest();
    hideAllOverlays();
    if (won) {
      ui.winScore.textContent = game.score;
      ui.overlayVictory.classList.remove('hidden');
      Audio.win();
    } else {
      ui.finalScore.textContent = game.score;
      ui.overlayGameOver.classList.remove('hidden');
      Audio.lose();
    }
  }

  function hideAllOverlays() {
    ui.overlayTitle.classList.add('hidden');
    ui.overlayPause.classList.add('hidden');
    ui.overlayLevel.classList.add('hidden');
    ui.overlayGameOver.classList.add('hidden');
    ui.overlayVictory.classList.add('hidden');
  }

  function togglePause() {
    if (game.state === 'playing') {
      game.state = 'paused';
      ui.overlayPause.classList.remove('hidden');
    } else if (game.state === 'paused') {
      game.state = 'playing';
      ui.overlayPause.classList.add('hidden');
    }
  }

  // -------- Buttons --------
  ui.btnPlay.addEventListener('click', () => { hideAllOverlays(); startNewGame(); });
  ui.btnResume.addEventListener('click', () => togglePause());
  ui.btnRetry.addEventListener('click', () => { hideAllOverlays(); startNewGame(); });
  ui.btnNewGame.addEventListener('click', () => { hideAllOverlays(); startNewGame(); });

  // -------- Per-frame key actions --------
  function handleJustPressed() {
    if (keyJustPressed.has('pause') && (game.state === 'playing' || game.state === 'paused')) togglePause();
    if (keyJustPressed.has('mute')) Audio.toggle();
    if (keyJustPressed.has('restart') && (game.state === 'playing' || game.state === 'paused')) {
      game.level -= 1; nextLevel();
    }
    if (game.state === 'playing') {
      if (keyJustPressed.has('bomb')) placeBomb();
      if (keyJustPressed.has('detonate') && game.player.remote) detonateRemote();
    }
    if (game.state === 'title' && keyJustPressed.has('confirm')) {
      hideAllOverlays(); startNewGame();
    }
    keyJustPressed.clear();
  }

  // -------- Main loop --------
  function frame(ts) {
    if (!game.lastTs) game.lastTs = ts;
    const dt = Math.min(0.05, (ts - game.lastTs) / 1000);
    game.lastTs = ts;

    handleJustPressed();
    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  // Bootstrap a tiny empty grid so render() works on the title screen.
  // We use viewport-sized dims here so the title screen looks fine before any
  // level kicks in; nextLevel() will resize the grid for real gameplay.
  COLS = VIEW_COLS;
  ROWS = VIEW_ROWS;
  game.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE_EMPTY));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) game.grid[y][x] = TILE_HARD;
    else if (x % 2 === 0 && y % 2 === 0) game.grid[y][x] = TILE_HARD;
  }
  if (ui.best) ui.best.textContent = game.best.score;
  refreshHighScoreList();

  requestAnimationFrame(frame);
})();
