// Landing page "how it works" video: plays muted while on screen, pauses when scrolled away.
// People who prefer reduced motion see the still image and press Play themselves.
(function () {
  const video = document.getElementById('how-video');
  const toggle = document.getElementById('video-toggle');
  if (!video || !toggle) return;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let userPaused = calm;

  const label = () => { toggle.textContent = video.paused ? 'Play' : 'Pause'; };
  const play = () => { const p = video.play(); if (p && p.catch) p.catch(label); };

  toggle.addEventListener('click', () => {
    if (video.paused) { userPaused = false; play(); } else { userPaused = true; video.pause(); }
  });
  video.addEventListener('play', label);
  video.addEventListener('pause', label);
  label();

  // Only play while a good part of it is visible, so it never runs off-screen.
  // A quarter, not half: on short screens the video can be taller than the window.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !userPaused) play();
        else if (!e.isIntersecting) video.pause();
      });
    }, { threshold: 0.25 }).observe(video);
  } else if (!userPaused) {
    play();
  }
})();
