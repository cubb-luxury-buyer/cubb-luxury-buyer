/* ============================================
   CUBB — Main JavaScript
   ============================================ */

'use strict';

/* --- Navbar scroll effect --- */
const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });
}

/* --- Mobile menu --- */
const hamburger = document.querySelector('.hamburger');
const mobileMenu = document.querySelector('.mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  });
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

/* --- Active nav link --- */
function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-links a, .mobile-menu a').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === path);
  });
}
setActiveNav();

/* --- FAQ Accordion --- */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

/* --- Type Toggle (Tas / Jam) --- */
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.form-fields-section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(target);
    if (section) section.classList.add('active');
  });
});

/* --- File Upload Preview --- */
function initUploadZone(zoneId, previewId) {
  const zone = document.getElementById(zoneId);
  const input = zone ? zone.querySelector('input[type="file"]') : null;
  const preview = document.getElementById(previewId);
  if (!zone || !input || !preview) return;

  function renderPreviews(files) {
    preview.innerHTML = '';
    Array.from(files).slice(0, 12).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'preview-thumb';
        img.alt = file.name;
        preview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  input.addEventListener('change', () => renderPreviews(input.files));

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const dt = e.dataTransfer;
    if (dt.files.length) {
      input.files = dt.files;
      renderPreviews(dt.files);
    }
  });
}

initUploadZone('upload-zone-main', 'preview-main');
initUploadZone('upload-zone-auth', 'preview-auth');

/* --- Hero Slideshow --- */
(function () {
  const slides = document.querySelectorAll('.hero-slide');
  const dots   = document.querySelectorAll('.slide-dot');
  if (!slides.length) return;

  let current  = 0;
  let timer    = null;
  const DELAY  = 4000;   // 4 detik
  const TOTAL  = slides.length;

  function goTo(index) {
    // Nonaktifkan slide & dot lama
    slides[current].classList.remove('active');
    slides[current].setAttribute('aria-hidden', 'true');
    dots[current].classList.remove('active');
    dots[current].setAttribute('aria-selected', 'false');

    // Aktifkan slide & dot baru
    current = (index + TOTAL) % TOTAL;
    slides[current].classList.add('active');
    slides[current].setAttribute('aria-hidden', 'false');
    dots[current].classList.add('active');
    dots[current].setAttribute('aria-selected', 'true');
  }

  function next() { goTo(current + 1); }

  function startTimer() {
    stopTimer();
    timer = setInterval(next, DELAY);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // Klik dot → langsung pindah slide, reset timer
  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      goTo(parseInt(dot.dataset.index, 10));
      startTimer(); // reset interval setelah klik manual
    });
  });

  // Pause saat mouse di atas slideshow, lanjut saat keluar
  var slideshowEl = document.querySelector('.hero-slideshow');
  if (slideshowEl) {
    slideshowEl.addEventListener('mouseenter', stopTimer);
    slideshowEl.addEventListener('mouseleave', startTimer);
    // Touch support: pause saat touch, resume setelah 6 detik
    slideshowEl.addEventListener('touchstart', function () {
      stopTimer();
      setTimeout(startTimer, 6000);
    }, { passive: true });
  }

  // Mulai slideshow
  startTimer();
}());
