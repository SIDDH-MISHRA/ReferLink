// /d/<secret>: the employee's requests as a table. Refer or decline from the row;
// click a row to read the full pitch, links and email underneath it.
(function () {
  const { rpc, track, h, icon, avatar, bindCopy, copyText, toast, timeAgo, formatDate, errorText, pathParam, DECLINE_REASONS } = window.RL;
  const $ = (id) => document.getElementById(id);
  const token = pathParam();

  let board = null;
  let requests = [];
  let filter = 'pending';
  let openId = null;    // row whose details are shown
  let reasonsId = null; // row showing the decline reasons

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
      $('greeting').textContent = 'Requests';
      $('board-meta').textContent = board.name + ' · ' + board.company;
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
  // Helpers
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
  // Quick check (simple rule, no AI): does the job link mention the employee's company?
  function mentionsCompany(url) {
    const key = board.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key.length >= 3 && url.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key);
  }
  const shown = () => requests.filter((r) => filter === 'all' || r.status === filter);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render() {
    const counts = { pending: 0, referred: 0, declined: 0, all: requests.length };
    requests.forEach((r) => { counts[r.status]++; });
    document.querySelectorAll('.seg button').forEach((b) => {
      b.querySelector('.count').textContent = counts[b.dataset.filter] || '';
      b.setAttribute('aria-selected', String(b.dataset.filter === filter));
    });

    const list = shown();
    $('rows').replaceChildren(...(list.length ? list.map(group) : [empty()]));
  }

  function empty() {
    const [title, text] = requests.length === 0
      ? ['No requests yet', 'Share your link on LinkedIn, or reply to referral DMs with it.']
      : filter === 'pending' ? ['All caught up', 'Every request has an answer.'] : ['Nothing here yet', 'Requests you answer will show up here.'];
    return h('div', { class: 'empty' }, h('h3', null, title), h('p', null, text));
  }

  function checks(r) {
    const out = [];
    if (isLink(r.job_ref)) {
      out.push(mentionsCompany(r.job_ref)
        ? h('span', { class: 'badge badge-ok', title: 'The job link mentions ' + board.company }, 'Job ✓')
        : h('span', { class: 'badge badge-pending', title: 'Job link is on ' + host(r.job_ref) }, 'Job link elsewhere'));
    } else {
      out.push(h('span', { class: 'badge badge-plain', title: 'A job ID, not a link' }, 'Job ID'));
    }
    out.push(resumeHost(r.resume_url)
      ? h('span', { class: 'badge badge-ok', title: 'Resume on ' + resumeHost(r.resume_url) }, 'Resume ✓')
      : h('span', { class: 'badge badge-plain', title: 'Resume on ' + host(r.resume_url) }, 'Resume link'));
    return h('div', { class: 'checks c-checks' }, ...out);
  }

  function group(r) {
    const open = r.id === openId;
    const row = h('div', {
      class: 'trow' + (open ? ' open' : ''), role: 'row', tabindex: '0', 'aria-expanded': String(open),
      onclick: () => { openId = open ? null : r.id; reasonsId = null; render(); },
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.click(); } },
    },
    h('div', { class: 'cell-who', role: 'cell' },
      avatar(r.candidate_name),
      h('div', { style: 'min-width:0' }, h('b', { class: 'ellip' }, r.candidate_name), h('div', { class: 'cell-sub ellip' }, r.candidate_email))),
    h('div', { class: 'c-role', role: 'cell' },
      isLink(r.job_ref) ? h('span', { class: 'ellip', style: 'display:block' }, host(r.job_ref)) : h('span', { class: 'mono' }, r.job_ref)),
    checks(r),
    h('div', { class: 'cell-why c-why', role: 'cell' }, r.why_fit),
    h('div', { class: 'cell-sub c-sent', role: 'cell' }, timeAgo(r.created_at)),
    r.status === 'pending' ? actions(r) : h('div', { class: 'c-status', role: 'cell', style: 'text-align:right' }, statusBadge(r)));

    return h('div', { class: 'tgroup' }, row, open || r.id === reasonsId ? details(r) : null);
  }

  function statusBadge(r) {
    return r.status === 'referred'
      ? h('span', { class: 'badge badge-referred' }, 'Referred' + (r.decided_at ? ' · ' + formatDate(r.decided_at).replace(/ \d{4}$/, '') : ''))
      : h('span', { class: 'badge badge-declined' }, 'Declined');
  }

  function actions(r) {
    return h('div', { class: 'cell-actions', role: 'cell' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: stop(() => decide(r, 'referred', null)) }, 'Refer'),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: stop(() => { reasonsId = r.id; openId = r.id; render(); }) }, 'Decline'));
  }

  function details(r) {
    const job = isLink(r.job_ref)
      ? h('span', null, link(r.job_ref, host(r.job_ref)), mentionsCompany(r.job_ref) ? h('span', { class: 'xs muted' }, ' · mentions ' + board.company) : null)
      : h('span', null, h('span', { class: 'mono' }, r.job_ref), copyButton(r.job_ref));

    const parts = [
      h('blockquote', { class: 'quote' }, r.why_fit),
      h('dl', { class: 'facts' },
        h('dt', null, 'Job'), h('dd', null, job),
        h('dt', null, 'Resume'), h('dd', null, link(r.resume_url, resumeHost(r.resume_url) || host(r.resume_url))),
        h('dt', null, 'LinkedIn'), h('dd', null, link(r.candidate_linkedin, 'View profile')),
        h('dt', null, 'Email'), h('dd', null, r.candidate_email, copyButton(r.candidate_email)),
        h('dt', null, 'Sent'), h('dd', null, timeAgo(r.created_at))),
    ];
    if (r.id === reasonsId) parts.push(reasons(r));
    if (r.status !== 'pending' && r.id !== reasonsId) {
      parts.push(h('div', { class: 'decided-line' },
        statusBadge(r),
        r.status === 'declined' ? DECLINE_REASONS[r.decline_reason].employee : 'You referred them',
        h('button', { class: 'text-btn', type: 'button', onclick: () => { reasonsId = null; renderChange(r); } }, 'Change')));
    }
    return h('div', { class: 'expand', id: 'x-' + r.id }, ...parts);
  }

  function renderChange(r) {
    const box = $('x-' + r.id).querySelector('.decided-line');
    box.replaceWith(h('div', { class: 'decided-line' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => decide(r, 'referred', null) }, 'Refer'),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { reasonsId = r.id; render(); } }, 'Decline'),
      h('button', { class: 'text-btn', type: 'button', onclick: () => render() }, 'Cancel')));
  }

  function reasons(r) {
    return h('div', { class: 'reasons' },
      h('p', null, 'Pick a reason. The candidate sees a kind version of it.'),
      h('div', { class: 'reason-list' },
        ...Object.keys(DECLINE_REASONS).map((key) =>
          h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => decide(r, 'declined', key) }, DECLINE_REASONS[key].employee)),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { reasonsId = null; render(); } }, 'Cancel')));
  }

  function link(url, label) {
    if (!isLink(url)) return document.createTextNode(url || '');
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label, ' ', icon('external'));
  }

  function copyButton(text) {
    return h('button', {
      class: 'copy-inline', type: 'button',
      onclick: async (e) => { if (await copyText(text)) { e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1500); } },
    }, 'Copy');
  }

  async function decide(r, decision, reason) {
    document.querySelectorAll('#rows button').forEach((b) => { b.disabled = true; });
    try {
      const res = await rpc('decide_request', { p_token: token, p_request_id: r.id, p_decision: decision, p_reason: reason });
      Object.assign(r, { status: res.status, decline_reason: res.decline_reason, decided_at: res.decided_at });
      track('decision_made', {
        board_id: board.board_id,
        type: res.status,
        reason: res.decline_reason,
        hours_to_decision: res.hours_to_decision,
        is_first_decision: res.is_first_decision,
      });
      toast(decision === 'referred'
        ? 'Referred. ' + r.candidate_name.split(/\s+/)[0] + ' can see it now.'
        : 'Declined. They\'ll see: "' + DECLINE_REASONS[reason].candidate + '"');
      reasonsId = null;
      if (openId === r.id) openId = null;
      render();
    } catch (err) {
      document.querySelectorAll('#rows button').forEach((b) => { b.disabled = false; });
      toast(err.code === 'not_found' ? 'This request was deleted by the candidate.' : errorText(err));
    }
  }

  document.querySelectorAll('.seg button').forEach((b) => {
    b.addEventListener('click', () => { filter = b.dataset.filter; openId = null; reasonsId = null; render(); });
  });
  $('refresh').addEventListener('click', () => load(true));

  load(false);
})();
