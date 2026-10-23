// /d/<secret>: the employee works their queue. One tap to refer, two to decline.
(function () {
  const { rpc, track, h, safeLink, bindCopy, copyText, toast, timeAgo, formatDate, errorText, pathParam, DECLINE_REASONS } = window.RL;
  const $ = (id) => document.getElementById(id);
  const token = pathParam();

  let board = null;
  let requests = [];
  let filter = 'pending';

  function show(id) {
    ['loading', 'not-found', 'load-error', 'app'].forEach((x) => $(x).classList.toggle('hidden', x !== id));
  }

  async function load(isRefresh) {
    let data;
    try {
      data = await rpc('get_dashboard', { p_token: token });
    } catch (err) {
      if (isRefresh) return toast(errorText(err));
      if (err.code === 'not_found' || !token) return show('not-found');
      $('load-error-text').textContent = errorText(err);
      return show('load-error');
    }
    board = data.board;
    requests = data.requests;

    if (!isRefresh) {
      const publicLink = location.origin + '/r/' + board.slug;
      $('greeting').textContent = 'Hi ' + board.name.split(/\s+/)[0];
      $('board-meta').textContent = 'Your referral inbox · ' + board.company;
      $('public-link').value = publicLink;
      bindCopy($('copy-public'), () => publicLink, () => track('public_link_copied', { where: 'dashboard', what: 'link', board_id: board.board_id }));
      $('refresh').classList.remove('hidden');
      show('app');
      track('dashboard_viewed', {
        board_id: board.board_id,
        pending_count: requests.filter((r) => r.status === 'pending').length,
        total_count: requests.length,
      });
    } else {
      toast('Up to date');
    }
    render();
  }

  // ---------------------------------------------------------------------------
  // Quick-check line: simple rules, no AI. Helps the employee judge at a glance.
  // ---------------------------------------------------------------------------
  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function resumeHost(url) {
    const hst = host(url);
    if (/(^|\.)(drive|docs)\.google\.com$/.test(hst)) return 'Google Drive';
    if (/(^|\.)dropbox\.com$/.test(hst)) return 'Dropbox';
    if (/(^|\.)(onedrive\.live\.com|1drv\.ms|sharepoint\.com)$/.test(hst)) return 'OneDrive';
    if (/(^|\.)notion\.(so|site)$/.test(hst)) return 'Notion';
    return hst || 'link';
  }
  function quickCheck(r) {
    const parts = [];
    if (/^https?:\/\//i.test(r.job_ref)) {
      const key = board.company.toLowerCase().replace(/[^a-z0-9]/g, '');
      const flat = r.job_ref.toLowerCase().replace(/[^a-z0-9]/g, '');
      parts.push(key.length >= 3 && flat.includes(key) ? 'Job link mentions ' + board.company : 'Job link on ' + host(r.job_ref));
    } else {
      parts.push('Job ID only');
    }
    parts.push('Resume on ' + resumeHost(r.resume_url));
    parts.push('LinkedIn ✓');
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const STATUS_LABEL = { pending: 'Pending', referred: 'Referred ✓', declined: 'Declined' };

  // Tab labels with counts, e.g. "Pending (3)".
  function updateCounts() {
    const counts = { pending: 0, referred: 0, declined: 0, all: requests.length };
    requests.forEach((r) => { counts[r.status]++; });
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.textContent = tab.textContent.replace(/\s*\(\d+\)$/, '') + ' (' + counts[tab.dataset.filter] + ')';
      tab.setAttribute('aria-selected', String(tab.dataset.filter === filter));
    });
  }

  function render() {
    updateCounts();
    const list = $('list');
    list.replaceChildren();
    const shown = requests.filter((r) => filter === 'all' || r.status === filter);
    shown.forEach((r) => list.append(card(r)));

    const empty = $('empty');
    empty.classList.toggle('hidden', shown.length > 0);
    if (!shown.length) {
      empty.textContent = requests.length === 0
        ? 'No requests yet. Share your public link on LinkedIn to get your first one.'
        : filter === 'pending' ? 'All caught up. No pending requests.' : 'Nothing here yet.';
    }
  }

  function card(r) {
    const el = h('article', { class: 'card req', id: 'req-' + r.id });
    fillCard(el, r);
    return el;
  }

  function fillCard(el, r) {
    const job = /^https?:\/\//i.test(r.job_ref)
      ? safeLink(r.job_ref, host(r.job_ref) + ' ↗')
      : h('span', null, r.job_ref, ' ', copyButton(r.job_ref, 'Copy'));

    el.replaceChildren(
      h('div', { class: 'req-head' },
        h('div', null,
          h('div', { class: 'req-name' }, r.candidate_name),
          h('div', { class: 'req-time' }, timeAgo(r.created_at))),
        r.status !== 'pending' ? h('span', { class: 'pill pill-' + r.status }, STATUS_LABEL[r.status]) : null),
      h('div', { class: 'quick' }, quickCheck(r)),
      h('div', { class: 'why' }, r.why_fit),
      h('dl', { class: 'facts' },
        h('dt', null, 'Job'), h('dd', null, job),
        h('dt', null, 'Email'), h('dd', null, r.candidate_email, ' ', copyButton(r.candidate_email, 'Copy')),
        h('dt', null, 'Links'), h('dd', null, safeLink(r.candidate_linkedin, 'LinkedIn ↗'), '  ·  ', safeLink(r.resume_url, 'Resume ↗'))),
      r.status === 'pending' ? actions(el, r) : decided(el, r)
    );
  }

  function copyButton(text, label) {
    return h('button', {
      class: 'btn-link small', type: 'button',
      onclick: async (e) => { if (await copyText(text)) { e.target.textContent = 'Copied ✓'; setTimeout(() => { e.target.textContent = label; }, 1500); } },
    }, label);
  }

  function actions(el, r) {
    return h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-ok', type: 'button', onclick: () => decide(el, r, 'referred', null) }, 'Referred ✓'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => el.lastChild.replaceWith(reasons(el, r)) }, 'Decline'));
  }

  function reasons(el, r) {
    return h('div', null,
      h('p', { class: 'small muted', style: 'margin:0 0 8px' }, 'Pick a reason. The candidate sees a polite version.'),
      h('div', { class: 'reasons' },
        ...Object.keys(DECLINE_REASONS).map((key) =>
          h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => decide(el, r, 'declined', key) }, DECLINE_REASONS[key].employee)),
        h('button', { class: 'btn-link small', type: 'button', style: 'justify-self:start;margin-top:4px', onclick: () => fillCard(el, r) }, 'Cancel')));
  }

  function decided(el, r) {
    const what = r.status === 'referred'
      ? 'Referred'
      : 'Declined · ' + DECLINE_REASONS[r.decline_reason].employee;
    return h('div', { class: 'decided' },
      h('span', null, what + (r.decided_at ? ' · ' + formatDate(r.decided_at) : '')),
      h('button', { class: 'btn-link small', type: 'button', onclick: () => el.lastChild.replaceWith(actions(el, r)) }, 'Change'));
  }

  async function decide(el, r, decision, reason) {
    el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const res = await rpc('decide_request', {
        p_token: token, p_request_id: r.id, p_decision: decision, p_reason: reason,
      });
      Object.assign(r, { status: res.status, decline_reason: res.decline_reason, decided_at: res.decided_at });
      track('decision_made', {
        board_id: board.board_id,
        type: res.status,
        reason: res.decline_reason,
        hours_to_decision: res.hours_to_decision,
        is_first_decision: res.is_first_decision,
      });
      fillCard(el, r); // the card stays in place until the next filter change
      updateCounts();
      toast(decision === 'referred'
        ? 'Marked as referred. ' + r.candidate_name.split(/\s+/)[0] + ' can see it now.'
        : 'Declined. They\'ll see: "' + DECLINE_REASONS[reason].candidate + '"');
    } catch (err) {
      el.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(err.code === 'not_found' ? 'This request was deleted by the candidate.' : errorText(err));
    }
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => { filter = tab.dataset.filter; render(); });
  });
  $('refresh').addEventListener('click', () => load(true));

  load(false);
})();
