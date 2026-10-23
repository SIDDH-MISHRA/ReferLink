// Landing page "how it works" demo: four scenes that play like a short video.
// Built from HTML so it stays sharp at any size and costs almost nothing to load.
// People who prefer reduced motion get the same scenes without autoplay.
(function () {
  const root = document.getElementById('demo');
  if (!root) return;
  const scenes = Array.from(root.querySelectorAll('.scene'));
  const tabs = Array.from(root.querySelectorAll('.demo-steps button'));
  const toggle = document.getElementById('demo-toggle');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 5000; // ms per scene
  let current = 0;
  let playing = !calm;
  let started = 0;
  let elapsed = 0;
  let timers = [];

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  // Types text into an element one character at a time.
  function type(el, delay) {
    const text = el.dataset.type;
    el.textContent = '';
    if (calm) { el.textContent = text; return; }
    text.split('').forEach((ch, i) => later(() => { el.textContent += ch; }, delay + i * 70));
  }

  // Sets each scene's small animations going.
  function animate(scene) {
    scene.querySelectorAll('[data-type]').forEach((el) => type(el, 400));
    scene.querySelectorAll('[data-grow]').forEach((el) => {
      el.style.width = '40%';
      later(() => { el.style.width = el.dataset.grow; }, 1800);
    });
    scene.querySelectorAll('[data-flash]').forEach((el) => {
      el.textContent = 'Copy';
      later(() => { el.textContent = 'Copied ✓'; }, 2600);
    });
    scene.querySelectorAll('[data-arrive]').forEach((el) => {
      el.classList.remove('slide-in');
      void el.offsetWidth; // restart the animation
      el.classList.add('slide-in');
    });
    scene.querySelectorAll('[data-pulse]').forEach((el) => {
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    });
    scene.querySelectorAll('[data-reveal]').forEach((el) => {
      el.style.opacity = calm ? '1' : '0';
      el.style.transform = calm ? 'none' : 'translateY(8px)';
      el.style.transition = 'opacity .5s ease, transform .5s ease';
      later(() => { el.style.opacity = '1'; el.style.transform = 'none'; }, 1600);
    });
  }

  function show(i) {
    clear();
    current = (i + scenes.length) % scenes.length;
    scenes.forEach((s, n) => s.classList.toggle('on', n === current));
    tabs.forEach((t, n) => {
      t.classList.toggle('on', n === current);
      t.setAttribute('aria-selected', String(n === current));
      t.querySelector('i').style.width = n < current ? '100%' : '0%';
    });
    animate(scenes[current]);
    started = performance.now();
    elapsed = 0;
  }

  // Progress bar for the current scene, and moving on when it's full.
  function tick(now) {
    if (playing) {
      elapsed = now - started;
      const bar = tabs[current].querySelector('i');
      bar.style.width = Math.min(100, (elapsed / DURATION) * 100) + '%';
      if (elapsed >= DURATION) show(current + 1);
    }
    requestAnimationFrame(tick);
  }

  tabs.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.go))));
  toggle.addEventListener('click', () => {
    playing = !playing;
    if (playing) started = performance.now() - elapsed;
    toggle.textContent = playing ? 'Pause' : 'Play';
  });
  toggle.textContent = playing ? 'Pause' : 'Play';

  // Only start when the demo scrolls into view.
  show(0);
  if (!calm && 'IntersectionObserver' in window) {
    playing = false;
    toggle.textContent = 'Play';
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        playing = true;
        toggle.textContent = 'Pause';
        show(0);
      }
    }, { threshold: 0.4 });
    io.observe(root);
  }
  requestAnimationFrame(tick);
})();
