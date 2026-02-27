// ──────────────────────────────────────────
// Nav scroll effect
// ──────────────────────────────────────────
const nav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ──────────────────────────────────────────
// Product tabs
// ──────────────────────────────────────────
function showTab(tab) {
  document.getElementById('tab-verdura').style.display   = tab === 'verdura'   ? 'grid' : 'none';
  document.getElementById('tab-dietetica').style.display = tab === 'dietetica' ? 'grid' : 'none';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
}

// ──────────────────────────────────────────
// Scroll reveal
// ──────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      e.target.querySelectorAll('.reveal').forEach((child, i) => {
        setTimeout(() => child.classList.add('visible'), i * 80);
      });
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
