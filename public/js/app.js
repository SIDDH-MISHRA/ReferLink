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
    const label = button.textContent;
    button.addEventListener('click', async function () {
      const ok = await copyText(getText());
      // If copying is blocked, select the link next to the button so it can be copied by hand.
      const input = button.previousElementSibling;
      if (!ok && input && input.select) input.select();
      button.textContent = ok ? 'Copied ✓' : 'Select and copy';
      setTimeout(function () { button.textContent = label; }, 2000);
      if (ok && onCopied) onCopied();
    });
  }

  // Opens the person's own email app with the link ready to send to themselves.
  function mailtoHref(subject, body) {
    return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function toast(message) {
    const el = h('div', { class: 'toast', role: 'status' }, message);
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

  initAnalytics();

  window.RL = {
    cfg, rpc, errorText, track, events, check, withHttps, setFieldError,
    h, safeLink, copyText, bindCopy, mailtoHref, toast, timeAgo, formatDate, pathParam, initials,
    DECLINE_REASONS,
  };
})();
