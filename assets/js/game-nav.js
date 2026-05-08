/* Shared game-page nav script: handles fullscreen button + keyboard ESC. */

(() => {
    const btn = document.querySelector('[data-fullscreen-toggle]');
    const target = document.querySelector('.game-frame');
    if (!btn || !target) return;

    const enter = () => {
        const fn = target.requestFullscreen || target.webkitRequestFullscreen;
        if (fn) fn.call(target).catch(() => {});
    };
    const exit = () => {
        const fn = document.exitFullscreen || document.webkitExitFullscreen;
        if (fn) fn.call(document);
    };

    btn.addEventListener('click', () => {
        const isFs = document.fullscreenElement || document.webkitFullscreenElement;
        isFs ? exit() : enter();
    });

    const sync = () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        btn.classList.toggle('is-fullscreen', isFs);
        const lbl = btn.querySelector('.label');
        if (lbl) lbl.textContent = isFs ? 'EXIT FS' : 'FULLSCREEN';
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
})();
