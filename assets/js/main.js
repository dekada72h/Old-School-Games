/* ================================================================
   OLD SCHOOL GAMES — landing-page interactivity
   - Animated star field (canvas)
   - Sticky-nav blur on scroll
   - Counter-up stats
   - Reveal-on-scroll
   - 3D card tilt
   - Konami code easter egg
   - Click "blip" sound (Web Audio, no asset)
   ================================================================ */

(() => {
    'use strict';

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Year ----------
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();

    // ---------- Star field ----------
    const canvas = document.getElementById('starfield');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let stars = [];
        let shooters = [];
        let w = 0, h = 0;
        let dpr = Math.min(window.devicePixelRatio || 1, 2);

        function resize() {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = canvas.clientWidth = window.innerWidth;
            h = canvas.clientHeight = window.innerHeight;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            initStars();
        }

        function initStars() {
            const target = Math.floor((w * h) / 8000);
            stars = Array.from({ length: target }, () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                z: Math.random() * 0.7 + 0.3,
                tw: Math.random() * Math.PI * 2,
                hue: Math.random() < 0.85 ? null
                    : ['#ff2e63', '#5fd0ff', '#ffd06b', '#9b6bff'][Math.floor(Math.random() * 4)]
            }));
        }

        function spawnShooter() {
            const angle = (Math.PI / 4) + (Math.random() * Math.PI / 4);
            shooters.push({
                x: Math.random() * w * 0.7,
                y: -10,
                vx: Math.cos(angle) * (8 + Math.random() * 6),
                vy: Math.sin(angle) * (8 + Math.random() * 6),
                trail: [],
                life: 60 + Math.random() * 30
            });
        }

        let mx = 0, my = 0, tx = 0, ty = 0;
        window.addEventListener('mousemove', e => {
            tx = (e.clientX / w - 0.5) * 12;
            ty = (e.clientY / h - 0.5) * 12;
        }, { passive: true });

        let frame = 0;
        function tick() {
            frame++;
            mx += (tx - mx) * 0.05;
            my += (ty - my) * 0.05;

            ctx.clearRect(0, 0, w, h);

            // Stars
            for (const s of stars) {
                const tw = Math.sin(s.tw + frame * 0.03 * s.z) * 0.5 + 0.5;
                const alpha = 0.25 + tw * 0.7 * s.z;
                const r = s.z * 1.4 + tw * 0.6;
                const x = s.x + mx * s.z;
                const y = s.y + my * s.z;

                if (s.hue) {
                    ctx.fillStyle = s.hue;
                    ctx.globalAlpha = alpha * 0.9;
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = alpha;
                }
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // Shooting stars
            if (!reduced && Math.random() < 0.005) spawnShooter();
            ctx.globalAlpha = 1;
            for (let i = shooters.length - 1; i >= 0; i--) {
                const s = shooters[i];
                s.x += s.vx;
                s.y += s.vy;
                s.life--;
                s.trail.push({ x: s.x, y: s.y });
                if (s.trail.length > 12) s.trail.shift();

                ctx.lineCap = 'round';
                for (let j = 1; j < s.trail.length; j++) {
                    const p0 = s.trail[j - 1];
                    const p1 = s.trail[j];
                    ctx.strokeStyle = `rgba(255,255,255,${j / s.trail.length})`;
                    ctx.lineWidth = (j / s.trail.length) * 2.5;
                    ctx.beginPath();
                    ctx.moveTo(p0.x, p0.y);
                    ctx.lineTo(p1.x, p1.y);
                    ctx.stroke();
                }
                if (s.life <= 0 || s.x > w + 60 || s.y > h + 60) shooters.splice(i, 1);
            }
            ctx.globalAlpha = 1;

            requestAnimationFrame(tick);
        }

        resize();
        window.addEventListener('resize', resize);
        if (!reduced) tick();
        else {
            // Static draw for reduced motion
            for (const s of stars) {
                ctx.fillStyle = s.hue || '#ffffff';
                ctx.globalAlpha = 0.4 * s.z;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.z * 1.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ---------- Sticky nav blur ----------
    const nav = document.getElementById('nav');
    if (nav) {
        const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 30);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // ---------- Counter-up ----------
    const counters = document.querySelectorAll('[data-counter]');
    if (counters.length && 'IntersectionObserver' in window) {
        const counted = new WeakSet();
        const co = new IntersectionObserver(entries => {
            for (const e of entries) {
                if (e.isIntersecting && !counted.has(e.target)) {
                    counted.add(e.target);
                    const el = e.target;
                    const target = parseInt(el.dataset.counter, 10) || 0;
                    const dur = 1200;
                    const start = performance.now();
                    const tick = (t) => {
                        const k = Math.min(1, (t - start) / dur);
                        const eased = 1 - Math.pow(1 - k, 3);
                        el.textContent = Math.round(target * eased).toString();
                        if (k < 1) requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                }
            }
        }, { threshold: 0.5 });
        counters.forEach(c => co.observe(c));
    }

    // ---------- Reveal on scroll ----------
    const revealEls = document.querySelectorAll(
        '.game-card, .feature-card, .featured-banner, .section-title, .section-eyebrow, .section-sub, .stat'
    );
    revealEls.forEach(el => el.classList.add('reveal'));
    if ('IntersectionObserver' in window) {
        const ro = new IntersectionObserver(entries => {
            entries.forEach((e, i) => {
                if (e.isIntersecting) {
                    setTimeout(() => e.target.classList.add('is-visible'), i * 60);
                    ro.unobserve(e.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
        revealEls.forEach(el => ro.observe(el));
    } else {
        revealEls.forEach(el => el.classList.add('is-visible'));
    }

    // ---------- 3D tilt on cards ----------
    if (!reduced && window.matchMedia('(hover: hover)').matches) {
        document.querySelectorAll('[data-tilt]').forEach(card => {
            let raf = 0;
            card.addEventListener('mousemove', (e) => {
                const r = card.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width;
                const py = (e.clientY - r.top) / r.height;
                const rx = (py - 0.5) * -8;
                const ry = (px - 0.5) * 10;
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
                });
            });
            card.addEventListener('mouseleave', () => {
                cancelAnimationFrame(raf);
                card.style.transform = '';
            });
        });
    }

    // ---------- Click blip (Web Audio, no asset) ----------
    let audioCtx = null;
    function blip(freq = 880, dur = 0.06, type = 'square') {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + dur);
        } catch { /* ignore */ }
    }

    document.querySelectorAll('.btn-primary, .btn-ghost, .game-card--live').forEach(btn => {
        btn.addEventListener('mouseenter', () => blip(660, 0.04, 'square'));
        btn.addEventListener('click', () => blip(880, 0.08, 'square'));
    });

    // ---------- Konami code easter egg ----------
    const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let kIdx = 0;
    const kOverlay = document.getElementById('konami-overlay');
    const kClose = document.getElementById('konami-close');

    document.addEventListener('keydown', (e) => {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (key === KONAMI[kIdx]) {
            kIdx++;
            if (kIdx === KONAMI.length) {
                kIdx = 0;
                triggerKonami();
            }
        } else {
            kIdx = key === KONAMI[0] ? 1 : 0;
        }
    });

    function triggerKonami() {
        if (!kOverlay) return;
        kOverlay.classList.remove('hidden');
        // Play a little victory arpeggio
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'square'), i * 80));
        // Confetti pixels
        spawnPixelConfetti();
    }

    if (kClose) kClose.addEventListener('click', () => kOverlay.classList.add('hidden'));
    if (kOverlay) kOverlay.addEventListener('click', (e) => {
        if (e.target === kOverlay) kOverlay.classList.add('hidden');
    });

    function spawnPixelConfetti() {
        const colors = ['#ff2e63','#5fd0ff','#36e3a4','#ffd06b','#9b6bff','#ff66cc'];
        for (let i = 0; i < 80; i++) {
            const p = document.createElement('div');
            p.style.cssText = `
                position:fixed; top:-12px; left:${Math.random()*100}vw;
                width:8px; height:8px; background:${colors[i%colors.length]};
                z-index:200; pointer-events:none;
                box-shadow:0 0 6px ${colors[i%colors.length]};
                transform: rotate(${Math.random()*360}deg);
            `;
            document.body.appendChild(p);
            const dur = 2000 + Math.random() * 1800;
            const drift = (Math.random() - 0.5) * 200;
            p.animate([
                { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
                { transform: `translate(${drift}px, ${window.innerHeight + 40}px) rotate(${360 + Math.random()*720}deg)`, opacity: 0.2 }
            ], { duration: dur, easing: 'cubic-bezier(0.55, 0.08, 0.36, 1)' }).onfinish = () => p.remove();
        }
    }

    // ---------- Smooth-scroll for # links (with offset for sticky nav) ----------
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const id = a.getAttribute('href');
            if (id.length < 2) return;
            const target = document.querySelector(id);
            if (!target) return;
            e.preventDefault();
            const top = target.getBoundingClientRect().top + window.scrollY - 64;
            window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
        });
    });

    // ---------- Subtle hero title glitch ----------
    if (!reduced) {
        const title = document.querySelector('.hero-title');
        if (title) {
            const trigger = () => {
                title.style.setProperty('--gx1', `${(Math.random()-0.5)*4}px`);
                title.style.setProperty('--gx2', `${(Math.random()-0.5)*4}px`);
                title.style.animation = 'glitch-pulse 0.6s steps(6)';
                setTimeout(() => { title.style.animation = ''; }, 700);
            };
            // Random interval, between 6–14s
            const loop = () => {
                trigger();
                setTimeout(loop, 6000 + Math.random() * 8000);
            };
            setTimeout(loop, 4000);
        }
    }

})();
