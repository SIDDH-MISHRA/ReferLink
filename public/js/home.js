// Homepage inbox card. New visitors see example data that leads to /create.
// If this browser remembers an employee's dashboard, the card shows their real
// latest requests and opens their dashboard when clicked.
(function () {
  const { rpc, h, avatar, timeAgo, slideNumber, savedDashboard, track } = window.RL;
  const $ = (id) => document.getElementById(id);
  const card = $('home-inbox');
  if (!card) return;

  const isLink = (v) => /^https?:\/\//i.test(v || '');
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const BADGE = {
    pending: ['badge-pending', 'Pending'],
    referred: ['badge-ok', 'Referred'],
    declined: ['badge-plain', 'Declined'],
  };

  function row(r) {
    const [cls, label] = BADGE[r.status];
    return h('div', { class: 'prow' },
      h('span', { class: 'who' }, avatar(r.candidate_name, 'sm'),
        h('span', { class: 'ellip' }, h('b', null, r.candidate_name), h('span', { class: 'muted' }, timeAgo(r.created_at)))),
      h('span', { class: 'muted ellip' }, isLink(r.job_ref) ? host(r.job_ref) : h('span', { class: 'mono' }, r.job_ref)),
      h('span', { class: 'badge ' + cls }, label));
  }

  async function showLive(saved) {
    let data;
    try {
      data = await rpc('get_dashboard', { p_token: saved.token });
    } catch (err) {
      // The saved link no longer works: forget it and keep the example.
      if (err.code === 'not_found') savedDashboard.clear();
      return;
    }
    const first = data.board.name.split(/\s+/)[0];
    const pending = data.requests.filter((r) => r.status === 'pending').length;
    const latest = data.requests.slice(0, 3);

    card.href = '/d/' + saved.token;
    card.setAttribute('aria-label', 'Your inbox: ' + pending + ' pending. Open your dashboard.');
    $('inbox-title').textContent = 'Your requests';
    $('inbox-note').replaceChildren(h('span', { class: 'live-dot', 'aria-hidden': 'true' }), ' Live');
    slideNumber($('inbox-count'), pending);
    $('inbox-rows').replaceChildren(...(latest.length
      ? latest.map(row)
      : [h('div', { class: 'prow' }, h('span', { class: 'muted' }, 'No requests yet. Share your link to get your first one.'))]));
    $('cta-title').textContent = 'Open your inbox';
    $('cta-sub').textContent = pending ? pending + ' waiting for you, ' + first : 'All caught up, ' + first;
    card.addEventListener('click', () => track('home_inbox_opened', { board_id: data.board.board_id, pending_count: pending }));
  }

  const saved = savedDashboard.get();
  if (saved && saved.token) showLive(saved);
  else slideNumber($('inbox-count'), 2);
})();
