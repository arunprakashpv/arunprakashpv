/* ═══════════════════════════════════════════════════
   SRE PORTFOLIO — Script
   Black & White monochrome particle network
   ═══════════════════════════════════════════════════ */

// ─── Animated Starfield Background ───
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let stars = [];

function resizeCanvas() {
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
    const count = Math.min(200, Math.floor((canvas.width * canvas.height) / 5000));
    for (let i = 0; i < count; i++) {
        stars.push(new Star());
    }
}
initStars();

function animateStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => { s.update(); s.draw(); });
    requestAnimationFrame(animateStars);
}
animateStars();


// Typing effect removed due to hero restructure.

// ─── ScrollSpy ───
const sidebarLinks = document.querySelectorAll('.sidebar-links a');

window.addEventListener('scroll', () => {
    let current = '';
    document.querySelectorAll('section').forEach(section => {
        const top = section.offsetTop;
        if (scrollY >= top - 300) {
            current = section.getAttribute('id');
        }
    });
    sidebarLinks.forEach(a => {
        a.classList.remove('active');
        if (a.getAttribute('href') === `#${current}`) {
            a.classList.add('active');
        }
    });
});


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
        'aws.webp',
        'azure.jpeg',
        'gcp.jpg',
        'linux.jpeg',
        'opmanager-nexus.webp',
        'windows.png'
    ];

    // Build the track HTML
    let trackHTML = '<div class="tools-scroll-track">';
    localLogos.forEach(logo => {
        // If the image fails to load (because you haven't placed it in the folder yet), it completely removes itself!
        const name = logo.split('.')[0].replace(/-/g, ' ');
        trackHTML += `<img src="assets/site_scroll/${logo}" alt="${name}" title="${name}" onerror="this.remove()">`;
    });
    trackHTML += '</div>';

    // Inject two identical tracks for the infinite marquee loop
    scrollContainer.innerHTML = trackHTML + trackHTML;
}
