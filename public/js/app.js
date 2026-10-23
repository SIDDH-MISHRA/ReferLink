// Shared code for every page: database calls, analytics, form checks and small helpers.
// Exposed as window.RL.
(function () {
  const cfg = window.REFERLINK_CONFIG || {};

  // ---------------------------------------------------------------------------
  // Database: every call goes to one of the 7 Supabase functions (RPC).
  // ---------------------------------------------------------------------------
  async function rpc(fn, args) {
    const headers = { 'Content-Type': 'application/json', apikey: cfg.supabaseKey };
    // Older Supabase "anon" keys are JWTs and also go in the Authorization header.
    if (/^eyJ/.test(cfg.supabaseKey || '')) headers.Authorization = 'Bearer ' + cfg.supabaseKey;

    let res;
    try {
      res = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers, body: JSON.stringify(args || {}),
      });
    } catch (e) {
      throw apiError('network');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!res.ok) throw apiError((data && data.message) || 'error');
    return data;
  }

  // Server errors are short codes like "invalid:email". Split into code + field.
  function apiError(message) {
    const [code, field] = String(message).split(':');
    const err = new Error(message);
    err.code = code;
    err.field = field || null;
    return err;
  }

  const GENERIC_ERRORS = {
    network: "Can't reach ReferLink. Check your internet and try again.",
    rate_limited: 'Too many requests right now. Please try again in an hour.',
    duplicate: "You've already sent a request for this job. Use your status link to check on it.",
  };
  function errorText(err) {
    return GENERIC_ERRORS[err && err.code] || 'Something went wrong. Please try again.';
  }

  // ---------------------------------------------------------------------------
  // Analytics (PostHog). Only explicit events, no autocapture, no recordings,
  // no personal data, and secret tokens are scrubbed out of URLs.
  // ---------------------------------------------------------------------------
  const queue = [];
  const events = []; // kept in memory so events can be checked during local testing
  let posthog = null;

  function scrub(value) {
    return typeof value === 'string' ? value.replace(/\/(d|s)\/[A-Za-z0-9]+/g, '/$1/[token]') : value;
  }
  function scrubAll(obj) {
    if (obj) Object.keys(obj).forEach((k) => { obj[k] = scrub(obj[k]); });
  }

  function initAnalytics() {
    if (!cfg.posthogKey) return;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = cfg.posthogHost.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
    s.onload = function () {
      if (!window.posthog || !window.posthog.init) return;
      window.posthog.init(cfg.posthogKey, {
        api_host: cfg.posthogHost,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        persistence: 'localStorage',
        person_profiles: 'identified_only',
        before_send: function (event) {
          if (event) { scrubAll(event.properties); scrubAll(event.$set); scrubAll(event.$set_once); }
          return event;
        },
        loaded: function (ph) {
          posthog = ph;
          queue.splice(0).forEach(function (e) { ph.capture(e[0], e[1]); });
        },
      });
    };
    document.head.appendChild(s);
  }

  function track(name, props) {
    const p = Object.assign({}, props, {
      $current_url: scrub(location.href),
      $pathname: scrub(location.pathname),
    });
    events.push([name, p]);
    if (cfg.dev) console.info('[event]', name, p);
    if (!cfg.posthogKey) return;
    if (posthog) posthog.capture(name, p);
    else queue.push([name, p]);
  }

  // ---------------------------------------------------------------------------
  // Checks. These mirror the checks inside the database functions.
  // ---------------------------------------------------------------------------
  const check = {
    url: (v) => v.length <= 500 && /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?([/?#]\S*)?$/i.test(v),
    linkedin: (v) => v.length <= 500 && /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/(in|pub)\/[^\s/?#]+/i.test(v),
    email: (v) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    jobRef: (v) => (/^https?:\/\//i.test(v) ? check.url(v) : v.length >= 3 && v.length <= 100 && /[0-9]/.test(v)),
  };

  // "linkedin.com/in/x" -> "https://linkedin.com/in/x". Leaves job IDs alone.
  function withHttps(v) {
    v = v.trim();
    if (!v || /^https?:\/\//i.test(v)) return v;
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(v) || /^(www\.)?[a-z0-9-]+\.(com|in|io|co|org|net|ai)(\/|$)/i.test(v)) {
      return 'https://' + v;
    }
    return v;
  }

  // Shows or clears an error under a form field.
  function setFieldError(input, message) {
    const field = input.closest('.field');
    let el = field.querySelector('.error-text');
    if (!message) {
      field.classList.remove('has-error');
      if (el) el.remove();
      input.removeAttribute('aria-invalid');
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'error-text';
      el.id = input.id + '-error';
      field.appendChild(el);
    }
    el.textContent = message;
    field.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', el.id);
  }

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  // Builds DOM safely. Text is always set as text, never as HTML.
  function h(tag, attrs) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(function ([k, v]) {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }

  // Only real http(s) links become clickable (blocks "javascript:" links).
  function safeLink(url, label) {
    if (!/^https?:\/\//i.test(url || '')) return document.createTextNode(label || url || '');
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label || url);
  }

  // ---------------------------------------------------------------------------
  // Icons: one SVG sprite, used as <svg class="icon"><use href="#i-name"/></svg>.
  // Line icons in the style of Lucide (ISC licence).
  // ---------------------------------------------------------------------------
  const ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'circle-minus': '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    external: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>',
    pen: '<path d="M12 20h9"/><path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86z"/>',
    tap: '<path d="M9 9V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M12 11.5V10a1.5 1.5 0 0 1 3 0v2"/><path d="M15 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L3.3 16.5a1.5 1.5 0 0 1 2.3-1.9L9 17"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  };

  function injectSprite() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    svg.innerHTML = Object.keys(ICONS).map((k) =>
      '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>').join('');
    document.body.prepend(svg);
  }

  function icon(name) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  // Coloured initials. The colour comes from the name, so it's stable per person,
  // and stays in the indigo-to-pink range of the theme.
  function avatar(name, size) {
    let hash = 0;
    for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) % 100;
    hash += 235;
    const el = h('div', { class: 'avatar' + (size ? ' avatar-' + size : ''), 'aria-hidden': 'true' }, initials(name));
    el.style.setProperty('--h', hash);
    return el;
  }

  // "Backend, Data" -> two chips
  function roleChips(text) {
    return (text || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((role) => h('span', { class: 'chip' }, role));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  function bindCopy(button, getText, onCopied) {
    const original = Array.from(button.childNodes).map((n) => n.cloneNode(true));
    button.addEventListener('click', async function () {
      const ok = await copyText(getText());
      // If copying is blocked, select the link next to the button so it can be copied by hand.
      const input = button.previousElementSibling;
      if (!ok && input && input.select) input.select();
      button.replaceChildren(icon(ok ? 'check' : 'info'), ok ? 'Copied' : 'Select and copy');
      setTimeout(function () { button.replaceChildren(...original.map((n) => n.cloneNode(true))); }, 2000);
      if (ok && onCopied) onCopied();
    });
  }

  // Opens the person's own email app with the link ready to send to themselves.
  function mailtoHref(subject, body) {
    return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function toast(message) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = h('div', { class: 'toast', role: 'status' }, icon('circle-check'), message);
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  function timeAgo(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    const days = Math.round(hours / 24);
    if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
    return formatDate(iso);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // The token or slug from URLs like /r/<slug>, /d/<token>, /s/<token>.
  function pathParam() {
    return decodeURIComponent(location.pathname.split('/')[2] || '');
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  // What the candidate sees for each decline reason (soft wording, agreed in the PRD).
  const DECLINE_REASONS = {
    role_mismatch: { employee: 'Role is outside what I refer for', candidate: 'This role is outside what I can refer for.' },
    experience: { employee: "Experience doesn't match", candidate: "Your experience doesn't match this role closely enough." },
    resume_link: { employee: "Resume link didn't open", candidate: "Your resume link didn't open. Check its sharing settings and request again." },
    job_closed: { employee: 'Job closed or not found', candidate: "I couldn't find this job, or it's closed." },
    other: { employee: 'Other', candidate: 'Not this time.' },
  };

  // ---------------------------------------------------------------------------
  // Theme: dark by default; the header toggle switches and remembers the choice
  // in this browser only.
  // ---------------------------------------------------------------------------
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('rl-theme', theme); } catch (e) { /* storage blocked: still works for this page */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#faf8ff' : '#0a0714';
  }
  function initThemeToggle() {
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const label = () => btn.setAttribute('aria-label',
        document.documentElement.dataset.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      label();
      btn.addEventListener('click', () => {
        setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
        label();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Motion helpers. All of them do nothing when the person prefers reduced motion.
  // ---------------------------------------------------------------------------
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Cursor spotlight on cards with class "spot" (CSS reads --mx / --my).
  function initSpotlight() {
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest && e.target.closest('.spot');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  // Depth parallax words: splits text into words that rise in one after another.
  function depthWords(el) {
    if (calm) return;
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const span = h('span', { class: 'dp-word', 'aria-hidden': 'true' }, part);
            span.style.setProperty('--i', i++);
            frag.append(span);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('scramble')) {
          walk(child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          child.classList.add('dp-word');
          child.style.setProperty('--i', i++);
        }
      });
    };
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
  }

  // Scramble text: random characters settle into the real text, left to right.
  function scramble(el, delay) {
    const target = el.dataset.text || el.textContent;
    el.dataset.text = target;
    if (calm) { el.textContent = target; return; }
    const chars = 'abcdefghijklmnopqrstuvwxyz#%&*+=?';
    const total = 22;
    let frame = 0;
    setTimeout(function tick() {
      const settled = Math.floor((frame / total) * target.length);
      el.textContent = target.split('').map((c, i) =>
        i < settled || c === ' ' ? c : chars[Math.floor(Math.random() * chars.length)]).join('');
      if (frame++ < total) setTimeout(tick, 38);
      else el.textContent = target;
    }, delay || 0);
  }

  // Sliding number: each digit is a 0–9 column that slides to the right place.
  function slideNumber(el, value) {
    const digits = String(value).split('');
    if (calm) { el.textContent = String(value); return; }
    if (!el.classList.contains('sn') || el.children.length !== digits.length) {
      el.classList.add('sn');
      el.setAttribute('aria-label', String(value));
      el.replaceChildren(...digits.map(() => {
        const col = h('span', { class: 'sn-col', 'aria-hidden': 'true' });
        for (let d = 0; d <= 9; d++) col.append(h('span', null, String(d)));
        col.style.transform = 'translateY(0)';
        return col;
      }));
      el.offsetHeight; // start from 0 so the first value also slides
    }
    el.setAttribute('aria-label', String(value));
    Array.from(el.children).forEach((col, i) => {
      col.style.transform = 'translateY(' + (-Number(digits[i]) * 1.2) + 'em)';
    });
  }

  // Background sparkle: over empty background only (never cards, nav, buttons or form
  // fields), a soft glow follows the mouse and small gradient sparkles twinkle out.
  // Colours come from the theme (--spark-a / --spark-b). Mouse only; off for reduced motion.
  function initBackgroundSparkle() {
    if (calm || !window.matchMedia('(pointer: fine)').matches) return;
    const glow = h('div', { class: 'bg-glow', 'aria-hidden': 'true' });
    const canvas = h('canvas', { class: 'bg-sparkle', 'aria-hidden': 'true' });
    document.body.prepend(glow, canvas);
    const ctx = canvas.getContext('2d');
    const sparks = [];
    const MAX = 70;
    let dpr = 1;
    let colors;
    let running = false;
    let last = 0;

    const hex = (v) => {
      const m = v.trim().match(/^#?([0-9a-f]{6})$/i);
      const n = parseInt(m ? m[1] : 'a855f7', 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      colors = [hex(s.getPropertyValue('--spark-a')), hex(s.getPropertyValue('--spark-b'))];
    };
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    readColors();
    resize();
    window.addEventListener('resize', resize);
    new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Things that count as "not background".
    const SOLID = '.card, .nav-pill, .cta-band, .preview, .btn, a, button, input, textarea, label, .copy-field, .toast';

    // A four-point star.
    function star(x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    }

    function frame(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = (now - s.born) / s.life; // 0 → 1
        if (age >= 1) { sparks.splice(i, 1); continue; }
        const twinkle = Math.sin(age * Math.PI); // grows then shrinks
        const c = colors[0].map((v, k) => Math.round(v + (colors[1][k] - v) * s.mix));
        ctx.fillStyle = 'rgba(' + c.join(',') + ',' + (0.9 * twinkle) + ')';
        ctx.shadowColor = 'rgba(' + c.join(',') + ',' + (0.8 * twinkle) + ')';
        ctx.shadowBlur = 10;
        star(s.x + s.vx * age * 30, s.y + s.vy * age * 30, s.size * (0.4 + twinkle));
      }
      if (sparks.length) requestAnimationFrame(frame);
      else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
    }

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const onBackground = !(e.target.closest && e.target.closest(SOLID));
      glow.classList.toggle('on', onBackground);
      if (!onBackground) return;
      glow.style.setProperty('--gx', e.clientX + 'px');
      glow.style.setProperty('--gy', e.clientY + 'px');
      const now = performance.now();
      if (now - last < 45 || sparks.length >= MAX) return; // a few sparkles, not a spray
      last = now;
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 26;
      sparks.push({
        x: e.clientX + Math.cos(angle) * dist,
        y: e.clientY + Math.sin(angle) * dist,
        vx: Math.cos(angle) * 0.6,
        vy: Math.sin(angle) * 0.6 - 0.4, // drift slightly upward
        size: 2.5 + Math.random() * 3.5,
        mix: Math.random(),
        born: now,
        life: 700 + Math.random() * 500,
      });
      if (!running) { running = true; requestAnimationFrame(frame); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => glow.classList.remove('on'));
  }

  // Fade elements with class "reveal" in as they scroll into view; scramble kickers once.
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || calm) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        entry.target.querySelectorAll('[data-scramble]').forEach((s) => scramble(s, 150));
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    items.forEach((el) => io.observe(el));
  }

  injectSprite();
  initThemeToggle();
  initSpotlight();
  initBackgroundSparkle();
  initReveal();
  document.querySelectorAll('[data-depth]').forEach(depthWords);
  document.querySelectorAll('[data-scramble-now]').forEach((el) => scramble(el, Number(el.dataset.scrambleNow) || 0));
  initAnalytics();

  window.RL = {
    cfg, rpc, errorText, track, events, check, withHttps, setFieldError,
    h, icon, avatar, roleChips, safeLink, slideNumber, scramble, depthWords, copyText, bindCopy, mailtoHref, toast, timeAgo, formatDate, pathParam, initials,
    DECLINE_REASONS,
  };
})();
