/* ═══════════════════════════════════════════════════
   SRE PORTFOLIO — Script
   Black & White monochrome particle network
   ═══════════════════════════════════════════════════ */

// ─── Analytics: fire a named event to GA4 + Clarity ───
function trackEvent(name, params = {}) {
    // Google Analytics 4
    if (typeof window.gtag === 'function') {
        window.gtag('event', name, params);
    }
    // Microsoft Clarity (custom tag) — no-op until Clarity is loaded
    if (typeof window.clarity === 'function') {
        window.clarity('event', name);
    }
}
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (!el) return;
    trackEvent(el.getAttribute('data-track'), {
        link_url: el.getAttribute('href') || '',
        link_text: (el.textContent || '').trim().slice(0, 60)
    });
});

// ─── Always land on the hero section on reload ───
// Standard approach: disable the browser's automatic scroll restoration and
// only reset once early. Do NOT keep retrying — that fights the user if they
// swipe right after load and makes the scroll feel sticky.
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
(function landOnHero() {
    const html = document.documentElement;
    let userHasScrolled = false;
    const markScrolled = () => { userHasScrolled = true; };
    window.addEventListener('wheel', markScrolled, { passive: true, once: true });
    window.addEventListener('touchstart', markScrolled, { passive: true, once: true });
    window.addEventListener('keydown', markScrolled, { once: true });

    function reset() {
        if (userHasScrolled) return;
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        const prev = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        html.style.scrollBehavior = prev;
    }
    reset();
    document.addEventListener('DOMContentLoaded', reset, { once: true });
    window.addEventListener('load', reset, { once: true });
})();

// ─── Animated Starfield Background ───
const canvas = document.getElementById('bg-canvas');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobileViewport = window.innerWidth <= 768;
// On mobile / reduced-motion, skip the canvas entirely — the animation loop
// and per-frame draws are the biggest source of stutter on low-end phones.
const skipCanvas = prefersReducedMotion || isMobileViewport;
if (skipCanvas && canvas) { canvas.style.display = 'none'; }
const ctx = skipCanvas ? null : canvas.getContext('2d');
let stars = [];

function resizeCanvas() {
    if (skipCanvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); initStars(); });

class Star {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.2 + 0.2;
        this.speedY = (Math.random() - 0.5) * 0.15; // Slow drift
        this.speedX = (Math.random() - 0.5) * 0.15;
        this.opacity = Math.random();
        this.fadeDir = Math.random() > 0.5 ? 1 : -1;
        this.fadeSpeed = Math.random() * 0.01 + 0.002;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;

        // Twinkling effect
        this.opacity += this.fadeSpeed * this.fadeDir;
        if (this.opacity >= 1 || this.opacity <= 0.1) {
            this.fadeDir *= -1;
        }

        // Wrap around
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
    }
    draw() {
        ctx.fillStyle = `rgba(156, 163, 175, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initStars() {
    stars = [];
    if (skipCanvas) return;
    const count = Math.min(200, Math.floor((canvas.width * canvas.height) / 5000));
    for (let i = 0; i < count; i++) {
        stars.push(new Star());
    }
}
initStars();

function animateStars() {
    if (skipCanvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => { s.update(); s.draw(); });
    requestAnimationFrame(animateStars);
}
animateStars();


// Typing effect removed due to hero restructure.

// ─── ScrollSpy (rAF-throttled, cached sections) ───
const sidebarLinks = document.querySelectorAll('.sidebar-links a');
const spySections = [...document.querySelectorAll('section[id]')];
let spyTicking = false;
function runScrollSpy() {
    let current = '';
    for (const section of spySections) {
        if (window.scrollY >= section.offsetTop - 300) current = section.id;
    }
    sidebarLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#${current}`);
    });
    spyTicking = false;
}
window.addEventListener('scroll', () => {
    if (!spyTicking) {
        requestAnimationFrame(runScrollSpy);
        spyTicking = true;
    }
}, { passive: true });


// ─── Smooth Scroll for Nav ───
sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            if (window.innerWidth <= 1024) {
                document.getElementById('sidebar').classList.remove('open');
                document.getElementById('mobileToggle').classList.remove('open');
            }
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});


// ─── Mobile Toggle ───
const mobileToggle = document.getElementById('mobileToggle');
mobileToggle.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    mobileToggle.classList.toggle('open');
});


// ─── Scroll Affordances (hero hint + back-to-top FAB) ───
const scrollHint = document.getElementById('scrollHint');
const backToTop = document.getElementById('backToTop');

function updateScrollAffordances() {
    const y = window.scrollY;
    if (scrollHint) scrollHint.classList.toggle('hidden', y > 40);
    if (backToTop) backToTop.classList.toggle('visible', y > window.innerHeight * 0.6);
}
window.addEventListener('scroll', updateScrollAffordances, { passive: true });
updateScrollAffordances();

if (scrollHint) {
    scrollHint.addEventListener('click', () => {
        const next = document.getElementById('about');
        if (next) next.scrollIntoView({ behavior: 'smooth' });
    });
}
if (backToTop) {
    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}


// ─── Scroll Reveal ───
const scrollElements = document.querySelectorAll('.animate-on-scroll');
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            scrollObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

scrollElements.forEach(el => scrollObserver.observe(el));


// ─── Animated Skill Bars ───
const skillObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const fills = entry.target.querySelectorAll('.skill-fill');
            fills.forEach((fill, i) => {
                setTimeout(() => {
                    fill.style.width = fill.dataset.width + '%';
                }, i * 150);
            });
            skillObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.3 });

document.querySelectorAll('.skill-group').forEach(group => skillObserver.observe(group));

document.querySelectorAll('.skill-group').forEach(group => skillObserver.observe(group));

// ─── Dynamic Tools Scroll ───
const scrollContainer = document.getElementById('dynamic-tools-scroll');
if (scrollContainer) {
    // List of logo files you drop into the assets/site_scroll folder
    // Add the exact filenames here when you download new logos!
    const localLogos = [
        'aws.png',
        'azure.png',
        'gcp.png',
        'linux.png',
        'OpManager Nexus_with ME_Black.png',
        'windows_server.svg',
        'python.png',
        'Directory-logo-lockup.png',
        'Catalyst-logo-lockup.png',
        'Creator-logo-lockup.png',
        'Sites-logo-lockup.png',
        'RPA-logo-lockup.png',
        'MCP-logo-lockup.png',
        'git.png',
        'ManageEngine Endpoint Central.png',
        'Identity360_with ME_Black.png',
        'Apache Tomcat.png',
        'Gemini.png',
        'Claude.png',
        'Github.png'
    ];

    // Build the track HTML
    let trackHTML = '<div class="tools-scroll-track">';
    localLogos.forEach(logo => {
        // If the image fails to load (because you haven't placed it in the folder yet), it completely removes itself!
        const name = logo.split('.')[0].replace(/-/g, ' ');
        // eager loading + fixed dimensions so the track width is stable from first paint (no marquee jerk as images resolve)
        trackHTML += `<img src="assets/site_scroll/${logo}" alt="${name}" title="${name}" width="100" height="28" loading="eager" decoding="async" onerror="this.remove()">`;
    });
    trackHTML += '</div>';

    // Inject two identical tracks for the infinite marquee loop
    scrollContainer.innerHTML = trackHTML + trackHTML;

    // Pause the marquee animation when the hero section is off-screen —
    // no CPU spent animating something the user can't see.
    const hero = document.getElementById('hero');
    if (hero && 'IntersectionObserver' in window) {
        const marqueeObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                scrollContainer.classList.toggle('marquee-paused', !entry.isIntersecting);
            });
        }, { threshold: 0 });
        marqueeObserver.observe(hero);
    }
}
