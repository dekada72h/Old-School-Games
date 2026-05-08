/* ================================================================
   BLOCK DROP — modern Tetris remake
   Pure HTML5 canvas, vanilla JS.
   ================================================================ */

(() => {
    'use strict';

    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const holdCv = document.getElementById('hold');
    const holdCtx = holdCv.getContext('2d');
    const nextCv = document.getElementById('next');
    const nextCtx = nextCv.getContext('2d');
    const $ = (id) => document.getElementById(id);

    const ui = {
        score: $('score'),
        best: $('best'),
        pieces: $('pieces'),
        lines: $('lines'),
        level: $('level'),
        tetris: $('tetris'),
        hsScore: $('hs-score'),
        hsLines: $('hs-lines'),
        hsLevel: $('hs-level'),
        finalScore: $('final-score'),
        finalLines: $('final-lines'),
        oTitle: $('overlay-title'),
        oPause: $('overlay-pause'),
        oOver: $('overlay-gameover'),
        btnPlay: $('btn-play'),
        btnResume: $('btn-resume'),
        btnRetry: $('btn-retry')
    };

    // ---------- Constants ----------
    const COLS = 10;
    const ROWS = 20;
    const CELL = 30;
    const HIDDEN_ROWS = 2;

    const COLORS = {
        bg: '#050208',
        grid: 'rgba(95, 208, 255, 0.04)',
        ghost: 'rgba(255, 255, 255, 0.18)',
        I: '#5fd0ff',
        O: '#ffd06b',
        T: '#9b6bff',
        S: '#36e3a4',
        Z: '#ff2e63',
        J: '#5577ff',
        L: '#ff8a3c'
    };

    // Pieces: { rotations: [ [{x,y}, ...], ... ], color }
    const PIECES = {
        I: {
            color: COLORS.I,
            rotations: [
                [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:3,y:1}],
                [{x:2,y:0},{x:2,y:1},{x:2,y:2},{x:2,y:3}],
                [{x:0,y:2},{x:1,y:2},{x:2,y:2},{x:3,y:2}],
                [{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:1,y:3}]
            ],
            box: 4
        },
        O: {
            color: COLORS.O,
            rotations: [
                [{x:1,y:0},{x:2,y:0},{x:1,y:1},{x:2,y:1}],
                [{x:1,y:0},{x:2,y:0},{x:1,y:1},{x:2,y:1}],
                [{x:1,y:0},{x:2,y:0},{x:1,y:1},{x:2,y:1}],
                [{x:1,y:0},{x:2,y:0},{x:1,y:1},{x:2,y:1}]
            ],
            box: 4
        },
        T: {
            color: COLORS.T,
            rotations: [
                [{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}],
                [{x:1,y:0},{x:1,y:1},{x:2,y:1},{x:1,y:2}],
                [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:1,y:2}],
                [{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:1,y:2}]
            ],
            box: 3
        },
        S: {
            color: COLORS.S,
            rotations: [
                [{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:1,y:1}],
                [{x:1,y:0},{x:1,y:1},{x:2,y:1},{x:2,y:2}],
                [{x:1,y:1},{x:2,y:1},{x:0,y:2},{x:1,y:2}],
                [{x:0,y:0},{x:0,y:1},{x:1,y:1},{x:1,y:2}]
            ],
            box: 3
        },
        Z: {
            color: COLORS.Z,
            rotations: [
                [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:2,y:1}],
                [{x:2,y:0},{x:1,y:1},{x:2,y:1},{x:1,y:2}],
                [{x:0,y:1},{x:1,y:1},{x:1,y:2},{x:2,y:2}],
                [{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:0,y:2}]
            ],
            box: 3
        },
        J: {
            color: COLORS.J,
            rotations: [
                [{x:0,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}],
                [{x:1,y:0},{x:2,y:0},{x:1,y:1},{x:1,y:2}],
                [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:2,y:2}],
                [{x:1,y:0},{x:1,y:1},{x:0,y:2},{x:1,y:2}]
            ],
            box: 3
        },
        L: {
            color: COLORS.L,
            rotations: [
                [{x:2,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}],
                [{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:2,y:2}],
                [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:0,y:2}],
                [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:1,y:2}]
            ],
            box: 3
        }
    };

    const TYPES = ['I','O','T','S','Z','J','L'];

    // ---------- State ----------
    const state = {
        board: [],          // ROWS x COLS, null or color string
        active: null,       // { type, rot, x, y }
        next: [],           // queue of upcoming types
        hold: null,
        canHold: true,
        score: 0,
        bestScore: 0,
        lines: 0,
        bestLines: 0,
        level: 1,
        bestLevel: 0,
        pieces: 0,
        tetris: 0,          // count of 4-line clears
        running: false,
        paused: false,
        gameover: false,
        dropTimer: 0,
        clearAnim: null,    // { rows: [], t: 0 }
        shake: 0,
        animTime: 0,
        bag: [],
        softDrop: false,
        lastClearWasTetris: false  // for back-to-back bonus
    };

    function emptyBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    // ---------- Storage ----------
    const KEY = 'osg.block-drop.hs';
    function loadHS() {
        try {
            const r = localStorage.getItem(KEY);
            if (r) {
                const o = JSON.parse(r);
                state.bestScore = o.score || 0;
                state.bestLines = o.lines || 0;
                state.bestLevel = o.level || 0;
            }
        } catch {}
    }
    function saveHS() {
        try { localStorage.setItem(KEY, JSON.stringify({
            score: state.bestScore, lines: state.bestLines, level: state.bestLevel
        })); } catch {}
    }
    function bump() {
        let d = false;
        if (state.score > state.bestScore) { state.bestScore = state.score; d = true; }
        if (state.lines > state.bestLines) { state.bestLines = state.lines; d = true; }
        if (state.level > state.bestLevel) { state.bestLevel = state.level; d = true; }
        if (d) saveHS();
        renderHS();
    }
    function renderHS() {
        ui.best.textContent = state.bestScore;
        ui.hsScore.textContent = state.bestScore;
        ui.hsLines.textContent = state.bestLines;
        ui.hsLevel.textContent = state.bestLevel;
    }

    // ---------- Audio ----------
    let audio = null;
    function blip(freq, dur = 0.06, type = 'square', vol = 0.05) {
        try {
            if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') audio.resume();
            const o = audio.createOscillator();
            const g = audio.createGain();
            o.type = type; o.frequency.setValueAtTime(freq, audio.currentTime);
            g.gain.setValueAtTime(vol, audio.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
            o.connect(g).connect(audio.destination);
            o.start(); o.stop(audio.currentTime + dur);
        } catch {}
    }
    function chord(freqs, dur = 0.18, type = 'square', vol = 0.05) {
        freqs.forEach((f, i) => setTimeout(() => blip(f, dur, type, vol), i * 35));
    }

    // ---------- 7-bag ----------
    function refillBag() {
        const b = [...TYPES];
        for (let i = b.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [b[i], b[j]] = [b[j], b[i]];
        }
        state.bag.push(...b);
    }
    function nextType() {
        if (state.bag.length < 1) refillBag();
        return state.bag.shift();
    }
    function ensureNext() {
        while (state.next.length < 5) state.next.push(nextType());
    }

    // ---------- Spawn ----------
    function spawnActive(type) {
        const piece = PIECES[type];
        const startX = type === 'O' ? 4 : 3;
        const a = { type, rot: 0, x: startX, y: -1 };
        if (collides(a, 0, 0)) {
            state.gameover = true;
            state.running = false;
            bump();
            ui.finalScore.textContent = state.score;
            ui.finalLines.textContent = state.lines;
            for (let i = 0; i < 5; i++) setTimeout(() => blip(220 - i * 30, 0.12, 'sawtooth'), i * 80);
            setTimeout(() => ui.oOver.classList.remove('hidden'), 500);
        }
        state.active = a;
    }

    function getCells(piece) {
        const def = PIECES[piece.type];
        return def.rotations[piece.rot].map(c => ({ x: piece.x + c.x, y: piece.y + c.y }));
    }

    function collides(piece, dx, dy, dr = 0) {
        const def = PIECES[piece.type];
        const rot = (piece.rot + dr + 4) % 4;
        for (const c of def.rotations[rot]) {
            const x = piece.x + c.x + dx;
            const y = piece.y + c.y + dy;
            if (x < 0 || x >= COLS || y >= ROWS) return true;
            if (y >= 0 && state.board[y][x]) return true;
        }
        return false;
    }

    // ---------- Movement ----------
    function move(dx, dy) {
        if (!state.active) return false;
        if (collides(state.active, dx, dy)) return false;
        state.active.x += dx;
        state.active.y += dy;
        return true;
    }

    function rotate(dr) {
        if (!state.active || state.active.type === 'O') return;
        // Wall kicks: try original, then ±1, ±2 horizontally
        const kicks = [0, 1, -1, 2, -2];
        for (const k of kicks) {
            if (!collides(state.active, k, 0, dr)) {
                state.active.x += k;
                state.active.rot = (state.active.rot + dr + 4) % 4;
                blip(440, 0.04, 'square', 0.04);
                return;
            }
        }
    }

    function hardDrop() {
        if (!state.active) return;
        let cells = 0;
        while (move(0, 1)) cells++;
        state.score += cells * 2;
        lock();
        blip(140, 0.08, 'sawtooth', 0.06);
    }

    function softDrop() {
        if (move(0, 1)) state.score += 1;
    }

    function holdPiece() {
        if (!state.canHold || !state.active) return;
        const t = state.active.type;
        if (state.hold === null) {
            state.hold = t;
            ensureNext();
            spawnActive(state.next.shift());
        } else {
            const swap = state.hold;
            state.hold = t;
            spawnActive(swap);
        }
        state.canHold = false;
        blip(660, 0.06, 'triangle');
    }

    // ---------- Lock & clear ----------
    function lock() {
        const def = PIECES[state.active.type];
        const cells = getCells(state.active);
        // Top-out check (lock above board)
        let allAbove = cells.every(c => c.y < 0);
        if (allAbove) {
            state.gameover = true;
            state.running = false;
            bump();
            ui.finalScore.textContent = state.score;
            ui.finalLines.textContent = state.lines;
            setTimeout(() => ui.oOver.classList.remove('hidden'), 300);
            return;
        }
        for (const c of cells) {
            if (c.y >= 0 && c.y < ROWS) state.board[c.y][c.x] = def.color;
        }

        // Clear lines
        const fullRows = [];
        for (let r = 0; r < ROWS; r++) {
            if (state.board[r].every(cell => cell)) fullRows.push(r);
        }

        if (fullRows.length > 0) {
            state.clearAnim = { rows: fullRows, t: 0 };
            state.shake = Math.min(14, fullRows.length * 4);
            const isTetris = fullRows.length === 4;
            const points = [0, 100, 300, 500, 800][fullRows.length] * state.level;
            let bonus = 0;
            if (isTetris && state.lastClearWasTetris) bonus = points * 0.5;
            state.score += points + bonus;
            state.lines += fullRows.length;
            const newLevel = Math.floor(state.lines / 10) + 1;
            if (newLevel > state.level) {
                state.level = newLevel;
                chord([523, 659, 784, 1047], 0.12, 'square');
            }
            if (isTetris) {
                state.tetris++;
                chord([523, 784, 1047, 1568], 0.12);
            } else {
                blip(880, 0.1, 'square');
            }
            state.lastClearWasTetris = isTetris;
        } else {
            state.lastClearWasTetris = false;
        }

        state.pieces++;
        state.canHold = true;
        ensureNext();
        spawnActive(state.next.shift());
        bump();
        updateHud();
    }

    function commitClear() {
        if (!state.clearAnim) return;
        const rows = state.clearAnim.rows.sort((a, b) => a - b);
        for (const r of rows) state.board.splice(r, 1);
        for (let i = 0; i < rows.length; i++) state.board.unshift(Array(COLS).fill(null));
        state.clearAnim = null;
    }

    function updateHud() {
        ui.score.textContent = state.score;
        ui.lines.textContent = state.lines;
        ui.level.textContent = state.level;
        ui.tetris.textContent = state.tetris;
        ui.pieces.textContent = state.pieces;
    }

    // ---------- Loop ----------
    function fallSpeed() {
        // Classic Tetris: gravity in seconds-per-row, accelerating with level
        const lvl = state.level;
        const g = Math.max(0.05, Math.pow(0.8 - (lvl - 1) * 0.007, lvl - 1));
        return g;
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (state.running && !state.paused && !state.gameover) {
            state.animTime += dt;

            if (state.clearAnim) {
                state.clearAnim.t += dt;
                if (state.clearAnim.t > 0.35) commitClear();
            } else {
                const speed = state.softDrop ? Math.min(0.04, fallSpeed() * 0.1) : fallSpeed();
                state.dropTimer += dt;
                while (state.dropTimer >= speed) {
                    state.dropTimer -= speed;
                    if (state.active) {
                        if (collides(state.active, 0, 1)) {
                            lock();
                            break;
                        } else {
                            state.active.y += 1;
                        }
                    }
                }
            }

            if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
        }

        render();
        renderHold();
        renderNext();
        requestAnimationFrame(loop);
    }

    // ---------- Render ----------
    function render() {
        ctx.save();
        if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, cv.width, cv.height);

        // Grid
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= COLS; x++) {
            ctx.moveTo(x * CELL + 0.5, 0);
            ctx.lineTo(x * CELL + 0.5, cv.height);
        }
        for (let y = 0; y <= ROWS; y++) {
            ctx.moveTo(0, y * CELL + 0.5);
            ctx.lineTo(cv.width, y * CELL + 0.5);
        }
        ctx.stroke();

        // Settled board
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (state.board[r][c]) drawCell(c, r, state.board[r][c]);
            }
        }

        // Clear flash
        if (state.clearAnim) {
            const k = state.clearAnim.t / 0.35;
            ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
            for (const r of state.clearAnim.rows) ctx.fillRect(0, r * CELL, cv.width, CELL);
        }

        // Ghost
        if (state.active && !state.clearAnim) {
            const ghost = { ...state.active };
            while (!collides(ghost, 0, 1)) ghost.y++;
            for (const c of getCells(ghost)) {
                if (c.y < 0) continue;
                ctx.fillStyle = COLORS.ghost;
                ctx.fillRect(c.x * CELL + 2, c.y * CELL + 2, CELL - 4, CELL - 4);
            }
        }

        // Active piece
        if (state.active && !state.clearAnim) {
            const def = PIECES[state.active.type];
            for (const c of getCells(state.active)) {
                if (c.y < 0) continue;
                drawCell(c.x, c.y, def.color);
            }
        }

        ctx.restore();
    }

    function drawCell(x, y, color) {
        const px = x * CELL;
        const py = y * CELL;
        ctx.fillStyle = color;
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(px + 1, py + 1, CELL - 2, 4);
        ctx.fillRect(px + 1, py + 1, 4, CELL - 2);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + 1, py + CELL - 5, CELL - 2, 4);
        ctx.fillRect(px + CELL - 5, py + 1, 4, CELL - 2);
    }

    function renderHold() {
        const c = holdCtx;
        c.fillStyle = COLORS.bg;
        c.fillRect(0, 0, holdCv.width, holdCv.height);
        if (state.hold) drawMini(c, state.hold, holdCv.width, holdCv.height);
    }

    function renderNext() {
        const c = nextCtx;
        c.fillStyle = COLORS.bg;
        c.fillRect(0, 0, nextCv.width, nextCv.height);
        const slotH = 80;
        for (let i = 0; i < 4 && i < state.next.length; i++) {
            drawMini(c, state.next[i], nextCv.width, slotH, i * slotH);
        }
    }

    function drawMini(c, type, w, h, offsetY = 0) {
        const def = PIECES[type];
        const cells = def.rotations[0];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const cell of cells) {
            minX = Math.min(minX, cell.x); maxX = Math.max(maxX, cell.x);
            minY = Math.min(minY, cell.y); maxY = Math.max(maxY, cell.y);
        }
        const piecedW = maxX - minX + 1;
        const piecedH = maxY - minY + 1;
        const cell = Math.min((w - 16) / piecedW, (h - 16) / piecedH, 18);
        const offX = (w - piecedW * cell) / 2 - minX * cell;
        const offY = offsetY + (h - piecedH * cell) / 2 - minY * cell;
        for (const ce of cells) {
            const px = offX + ce.x * cell;
            const py = offY + ce.y * cell;
            c.fillStyle = def.color;
            c.fillRect(px + 1, py + 1, cell - 2, cell - 2);
            c.fillStyle = 'rgba(255,255,255,0.18)';
            c.fillRect(px + 1, py + 1, cell - 2, 3);
            c.fillStyle = 'rgba(0,0,0,0.3)';
            c.fillRect(px + 1, py + cell - 4, cell - 2, 3);
        }
    }

    // ---------- Setup ----------
    function newGame() {
        state.board = emptyBoard();
        state.score = 0;
        state.lines = 0;
        state.level = 1;
        state.pieces = 0;
        state.tetris = 0;
        state.bag = [];
        state.next = [];
        state.hold = null;
        state.canHold = true;
        state.gameover = false;
        state.dropTimer = 0;
        state.clearAnim = null;
        state.lastClearWasTetris = false;
        ensureNext();
        spawnActive(state.next.shift());
        updateHud();
    }

    // ---------- Input ----------
    let dasL = 0, dasR = 0;
    document.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        const k = e.key;
        if (e.repeat && k !== 'ArrowDown' && k !== 's' && k !== 'S') return;

        if (k === 'ArrowLeft' || k === 'a' || k === 'A') move(-1, 0);
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') move(1, 0);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') state.softDrop = true;
        else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') rotate(1);
        else if (k === 'z' || k === 'Z') rotate(-1);
        else if (k === ' ') hardDrop();
        else if (k === 'Shift' || k === 'c' || k === 'C') holdPiece();
        else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
        else if (k === 'r' || k === 'R') restart();
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') state.softDrop = false;
    });

    document.querySelectorAll('[data-touch]').forEach(b => {
        const a = b.dataset.touch;
        b.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (a === 'left') move(-1, 0);
            else if (a === 'right') move(1, 0);
            else if (a === 'down') state.softDrop = true;
            else if (a === 'rotate') rotate(1);
            else if (a === 'drop') hardDrop();
            else if (a === 'hold') holdPiece();
            else if (a === 'pause') togglePause();
        }, { passive: false });
        b.addEventListener('touchend', () => { if (a === 'down') state.softDrop = false; });
        b.addEventListener('mousedown', () => {
            if (a === 'left') move(-1, 0);
            else if (a === 'right') move(1, 0);
            else if (a === 'down') softDrop();
            else if (a === 'rotate') rotate(1);
            else if (a === 'drop') hardDrop();
            else if (a === 'hold') holdPiece();
            else if (a === 'pause') togglePause();
        });
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
        state.paused = false;
        last = performance.now();
    }

    ui.btnPlay.addEventListener('click', () => {
        ui.oTitle.classList.add('hidden');
        newGame();
        state.running = true;
        last = performance.now();
        blip(880, 0.1, 'square');
    });
    ui.btnResume.addEventListener('click', togglePause);
    ui.btnRetry.addEventListener('click', restart);

    // ---------- Boot ----------
    loadHS();
    renderHS();
    state.board = emptyBoard();
    ensureNext();
    spawnActive(state.next.shift());
    state.running = false;
    requestAnimationFrame(loop);
})();
