// /d/<secret>: the employee works their queue. One tap to refer, two to decline.
(function () {
  const { rpc, track, h, icon, avatar, slideNumber, depthWords, bindCopy, copyText, toast, timeAgo, formatDate, errorText, pathParam, DECLINE_REASONS } = window.RL;
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
      $('greeting').replaceChildren('Hi ', h('span', { class: 'serif grad-text' }, board.name.split(/\s+/)[0]));
      depthWords($('greeting'));
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
  // Quick checks: simple rules, no AI. Helps the employee judge at a glance.
  // ---------------------------------------------------------------------------
  const isLink = (v) => /^https?:\/\//i.test(v || '');
  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function resumeHost(url) {
    const hst = host(url);
    if (/(^|\.)(drive|docs)\.google\.com$/.test(hst)) return 'Google Drive';
    if (/(^|\.)dropbox\.com$/.test(hst)) return 'Dropbox';
    if (/(^|\.)(onedrive\.live\.com|1drv\.ms|sharepoint\.com)$/.test(hst)) return 'OneDrive';
    if (/(^|\.)notion\.(so|site)$/.test(hst)) return 'Notion';
    return null;
  }
  function jobMentionsCompany(url) {
    const key = board.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key.length >= 3 && url.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key);
  }

  // One row of links. A green icon means the quick check passed:
  // the job link mentions the company, the resume is on a known host.
  function linksRow(r) {
    let job;
    if (isLink(r.job_ref)) {
      const mentions = jobMentionsCompany(r.job_ref);
      job = linkChip(r.job_ref, 'briefcase', mentions ? board.company + ' job' : host(r.job_ref), mentions,
        mentions ? 'Job link mentions ' + board.company : 'Job link on ' + host(r.job_ref));
    } else {
      job = copyChip('briefcase', r.job_ref, 'Job ID only. Tap to copy');
    }
    const where = resumeHost(r.resume_url);
    return h('div', { class: 'req-links' },
      job,
      linkChip(r.resume_url, 'file', where ? 'Resume · ' + where : 'Resume', !!where, where ? 'Resume on ' + where : 'Resume on ' + host(r.resume_url)),
      linkChip(r.candidate_linkedin, 'user', 'LinkedIn', true, 'LinkedIn profile'),
      copyChip('mail', r.candidate_email, 'Tap to copy email'));
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const BADGE = {
    pending: ['clock', 'Pending'],
    referred: ['check', 'Referred'],
    declined: ['circle-minus', 'Declined'],
  };

  function updateCounts() {
    const counts = { pending: 0, referred: 0, declined: 0, all: requests.length };
    requests.forEach((r) => { counts[r.status]++; });
    document.querySelectorAll('.filter').forEach((tab) => {
      slideNumber(tab.querySelector('b'), counts[tab.dataset.filter]);
      tab.setAttribute('aria-selected', String(tab.dataset.filter === filter));
    });
  }

  function render() {
    updateCounts();
    const shown = requests.filter((r) => filter === 'all' || r.status === filter);
    $('list').replaceChildren(...shown.map(card));

    $('empty').classList.toggle('hidden', shown.length > 0);
    if (!shown.length) {
      const [title, text] = requests.length === 0
        ? ['No requests yet', 'Share your public link on LinkedIn, or reply to referral DMs with it. New requests show up here.']
        : filter === 'pending' ? ['All caught up', 'Every request has an answer. Nice work.'] : ['Nothing here yet', 'Requests you decide on will show up here.'];
      $('empty-title').textContent = title;
      $('empty-text').textContent = text;
    }
  }

  function card(r) {
    const el = h('article', { class: 'card req spot', id: 'req-' + r.id });
    fillCard(el, r);
    return el;
  }

  function linkChip(url, iconName, label, good, title) {
    if (!isLink(url)) return null;
    return h('a', { class: 'link-chip' + (good ? ' good' : ''), href: url, target: '_blank', rel: 'noopener noreferrer', title },
      icon(iconName), h('span', null, label), icon('external'));
  }

  function copyChip(iconName, text, title) {
    const label = h('span', null, text);
    const btn = h('button', { class: 'link-chip', type: 'button', title }, icon(iconName), label, icon('copy'));
    btn.addEventListener('click', async () => {
      if (!(await copyText(text))) return;
      label.textContent = 'Copied';
      setTimeout(() => { label.textContent = text; }, 1500);
    });
    return btn;
  }

  function fillCard(el, r) {
    const [badgeIcon, badgeText] = BADGE[r.status];
    el.replaceChildren(
      h('div', { class: 'req-head' },
        avatar(r.candidate_name, 'sm'),
        h('div', { class: 'req-who' },
          h('div', { class: 'req-name' }, r.candidate_name),
          h('div', { class: 'req-time' }, timeAgo(r.created_at))),
        h('span', { class: 'badge badge-' + r.status }, icon(badgeIcon), badgeText)),
      h('p', { class: 'why' }, r.why_fit),
      linksRow(r),
      r.status === 'pending' ? actions(el, r) : decided(el, r)
    );
  }

  function actions(el, r) {
    return h('div', { class: 'req-actions' },
      h('button', { class: 'btn btn-success', type: 'button', onclick: () => decide(el, r, 'referred', null) }, icon('check'), 'Referred'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => el.lastChild.replaceWith(reasons(el, r)) }, 'Decline'));
  }

  function reasons(el, r) {
    return h('div', { class: 'reasons-wrap' },
      h('p', { class: 'xs muted', style: 'margin:0 0 10px;font-weight:500' }, 'Pick a reason. The candidate sees a kind version of it.'),
      h('div', { class: 'reasons' },
        ...Object.keys(DECLINE_REASONS).map((key) =>
          h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => decide(el, r, 'declined', key) }, DECLINE_REASONS[key].employee))),
      h('button', { class: 'text-btn', type: 'button', style: 'margin-top:10px', onclick: () => fillCard(el, r) }, icon('x'), 'Cancel'));
  }

  function decided(el, r) {
    const what = r.status === 'referred' ? 'You referred them' : 'Declined: ' + DECLINE_REASONS[r.decline_reason].employee;
    return h('div', { class: 'decided' },
      h('span', null, icon(r.status === 'referred' ? 'circle-check' : 'circle-minus'), what + (r.decided_at ? ' · ' + formatDate(r.decided_at) : '')),
      h('button', { class: 'text-btn', type: 'button', onclick: () => el.lastChild.replaceWith(actions(el, r)) }, icon('pen'), 'Change'));
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

  document.querySelectorAll('.filter').forEach((tab) => {
    tab.addEventListener('click', () => { filter = tab.dataset.filter; render(); });
  });
  $('refresh').addEventListener('click', () => load(true));

  load(false);
})();
