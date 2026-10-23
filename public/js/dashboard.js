// /d/<secret>: the employee's inbox. A list of requests on the left, the open one on the right.
// On phones the list and the open request take turns on screen.
(function () {
  const { rpc, track, h, icon, avatar, bindCopy, copyText, toast, timeAgo, formatDate, errorText, pathParam, DECLINE_REASONS } = window.RL;
  const $ = (id) => document.getElementById(id);
  const token = pathParam();
  const wide = window.matchMedia('(min-width: 860px)');

  let board = null;
  let requests = [];
  let filter = 'pending';
  let selectedId = null;

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
    return hst || 'Resume';
  }
  // Quick check (simple rule, no AI): does the job link mention the employee's company?
  function mentionsCompany(url) {
    const key = board.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key.length >= 3 && url.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key);
  }
  const jobLabel = (r) => (isLink(r.job_ref) ? host(r.job_ref) : r.job_ref);
  const shown = () => requests.filter((r) => filter === 'all' || r.status === filter);

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render() {
    const counts = { pending: 0, referred: 0, declined: 0, all: requests.length };
    requests.forEach((r) => { counts[r.status]++; });
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.querySelector('.count').textContent = counts[tab.dataset.filter] ? counts[tab.dataset.filter] : '';
      tab.setAttribute('aria-selected', String(tab.dataset.filter === filter));
    });

    const list = shown();
    if (!list.some((r) => r.id === selectedId)) selectedId = wide.matches && list[0] ? list[0].id : null;

    $('list').replaceChildren(...(list.length ? list.map(item) : [emptyList()]));
    renderDetail();
  }

  function emptyList() {
    const [title, text] = requests.length === 0
      ? ['No requests yet', 'Share your link on LinkedIn, or reply to referral DMs with it.']
      : filter === 'pending' ? ['All caught up', 'Every request has an answer.'] : ['Nothing here yet', 'Requests you answer will show up here.'];
    return h('div', { class: 'empty' }, h('h3', null, title), h('p', null, text));
  }

  function item(r) {
    return h('button', {
      class: 'item', type: 'button', role: 'listitem',
      'aria-current': String(r.id === selectedId),
      onclick: () => { selectedId = r.id; render(); $('inbox').classList.add('showing-detail'); if (!wide.matches) window.scrollTo(0, 0); },
    },
    h('span', { class: 'item-dot' + (r.status === 'pending' ? '' : ' read'), 'aria-hidden': 'true' }),
    h('span', { class: 'item-body' },
      h('span', { class: 'item-top' }, h('span', { class: 'item-name' }, r.candidate_name), h('span', { class: 'item-time' }, timeAgo(r.created_at))),
      h('span', { class: 'item-role', style: 'display:block' }, r.status === 'pending' ? jobLabel(r) : (r.status === 'referred' ? 'Referred · ' : 'Declined · ') + jobLabel(r)),
      h('span', { class: 'item-snip', style: 'display:block' }, r.why_fit)));
  }

  function renderDetail() {
    const r = requests.find((x) => x.id === selectedId);
    const detail = $('detail');
    if (!r) {
      $('inbox').classList.remove('showing-detail');
      detail.replaceChildren(h('div', { class: 'empty' },
        h('h3', null, shown().length ? 'Pick a request' : 'Nothing to read'),
        h('p', null, shown().length ? 'Choose a request on the left to read it.' : 'New requests will appear here.')));
      return;
    }

    const job = isLink(r.job_ref)
      ? h('span', null, h('a', { href: r.job_ref, target: '_blank', rel: 'noopener noreferrer' }, host(r.job_ref), ' ', icon('external')),
        mentionsCompany(r.job_ref) ? h('span', { class: 'xs muted' }, ' · mentions ' + board.company) : null)
      : h('span', null, h('span', { class: 'mono' }, r.job_ref), copyButton(r.job_ref));

    detail.replaceChildren(...[
      h('button', { class: 'text-btn back-btn', type: 'button', onclick: () => { $('inbox').classList.remove('showing-detail'); selectedId = null; render(); } }, icon('back'), 'All requests'),
      h('div', { class: 'detail-head' },
        avatar(r.candidate_name, 'lg'),
        h('div', null,
          h('h2', { class: 'detail-name' }, r.candidate_name),
          h('div', { class: 'small muted' }, 'Sent ' + timeAgo(r.created_at))),
        r.status === 'pending' ? actions(r) : null),
      h('blockquote', { class: 'quote', style: 'margin:22px 0' }, r.why_fit),
      h('dl', { class: 'facts' },
        h('dt', null, 'Job'), h('dd', null, job),
        h('dt', null, 'Resume'), h('dd', null, link(r.resume_url, resumeHost(r.resume_url))),
        h('dt', null, 'LinkedIn'), h('dd', null, link(r.candidate_linkedin, 'Profile')),
        h('dt', null, 'Email'), h('dd', null, r.candidate_email, copyButton(r.candidate_email))),
      r.status === 'pending' ? null : decided(r)].filter(Boolean));
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

  function actions(r) {
    return h('div', { class: 'detail-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => decide(r, 'referred', null) }, 'Refer'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => showReasons(r) }, 'Not this time'));
  }

  function showReasons(r) {
    const old = $('detail').querySelector('.reasons');
    if (old) return old.querySelector('button').focus();
    const box = h('div', { class: 'reasons' },
      h('p', null, 'Why not? The candidate sees a kind version of this.'),
      h('div', { class: 'reason-list' },
        ...Object.keys(DECLINE_REASONS).map((key) =>
          h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => decide(r, 'declined', key) }, DECLINE_REASONS[key].employee)),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => box.remove() }, 'Cancel')));
    $('detail').querySelector('.detail-head').after(box);
    box.querySelector('button').focus();
  }

  function decided(r) {
    const what = r.status === 'referred'
      ? 'You referred them'
      : DECLINE_REASONS[r.decline_reason].employee;
    return h('div', { class: 'decided' },
      h('span', null, h('span', { class: 'badge badge-' + r.status }, r.status === 'referred' ? 'Referred' : 'Declined'), ' ', what, r.decided_at ? ' · ' + formatDate(r.decided_at) : ''),
      h('button', { class: 'text-btn', type: 'button', onclick: (e) => e.target.closest('.decided').replaceWith(h('div', { style: 'margin-top:22px' }, actions(r))) }, 'Change'));
  }

  async function decide(r, decision, reason) {
    $('detail').querySelectorAll('button').forEach((b) => { b.disabled = true; });
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
      // Keep the answered request open so the employee sees the result; the list updates around it.
      const keep = r.id;
      render();
      if (!shown().some((x) => x.id === keep)) {
        selectedId = keep;
        $('list').replaceChildren(...(shown().length ? shown().map(item) : [emptyList()]));
        renderDetail();
        if (!wide.matches) $('inbox').classList.add('showing-detail');
      }
    } catch (err) {
      $('detail').querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(err.code === 'not_found' ? 'This request was deleted by the candidate.' : errorText(err));
    }
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => { filter = tab.dataset.filter; selectedId = null; render(); });
  });
  $('refresh').addEventListener('click', () => load(true));

  load(false);
})();
