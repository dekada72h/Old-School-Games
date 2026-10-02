/* Shared game-page nav script: fullscreen button, F shortcut, canvas fit-to-screen. */

(() => {
    const btn = document.querySelector('[data-fullscreen-toggle]');
    const target = document.querySelector('.game-frame');
    if (!btn || !target) return;
    const canvas = target.querySelector('canvas#game');

    const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

    const enter = () => {
        const fn = target.requestFullscreen || target.webkitRequestFullscreen;
        if (!fn) return;
        try {
            const p = fn.call(target);
            if (p && p.catch) p.catch(() => {});
        } catch (e) { /* unsupported */ }
    };
    const exit = () => {
        const fn = document.exitFullscreen || document.webkitExitFullscreen;
        if (!fn) return;
        try {
            const p = fn.call(document);
            if (p && p.catch) p.catch(() => {});
        } catch (e) { /* ignore */ }
    };
    const toggle = () => (isFs() ? exit() : enter());

    btn.addEventListener('click', () => {
        toggle();
        // Don't keep focus on the button, otherwise Space/Enter in the game would click it again
        btn.blur();
    });
    // Keyboard activation of the focused button must never fire while playing
    btn.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); btn.blur(); }
    });

    document.addEventListener('keydown', (e) => {
        if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
            toggle();
        }
    });

    // Scale the canvas up (keeping its aspect ratio) so fullscreen actually fills the screen
    const fit = () => {
        if (!canvas) return;
        if (!isFs()) { canvas.style.width = ''; canvas.style.height = ''; return; }
        // Height used by everything except the canvas itself (HUD, panels, ...).
        // Children that merely contain the canvas only count for what is *not* canvas.
        let others = 0;
        for (const el of target.children) {
            const cs = getComputedStyle(el);
            if (el === canvas || cs.position === 'absolute' || cs.display === 'none') continue;
            let h = el.getBoundingClientRect().height;
            if (el.contains(canvas)) h = Math.max(0, h - canvas.getBoundingClientRect().height);
            others += h + 14;
        }
        const availH = Math.max(120, window.innerHeight - others - 28);
        const availW = window.innerWidth - 24;
        const ratio = canvas.width / canvas.height;
        let w = Math.min(availW, availH * ratio);
        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = 'auto';
    };

    const sync = () => {
        const fs = isFs();
        btn.classList.toggle('is-fullscreen', fs);
        const lbl = btn.querySelector('.label');
        if (lbl) lbl.textContent = fs ? 'EXIT FS' : 'FULLSCREEN';
        fit();
        setTimeout(fit, 60);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    window.addEventListener('resize', fit);
})();
