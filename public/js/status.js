// /s/<token>: the candidate sees the outcome of one request, and can delete it.
(function () {
  const { rpc, track, h, safeLink, bindCopy, mailtoHref, formatDate, errorText, toast, pathParam, DECLINE_REASONS } = window.RL;
  const $ = (id) => document.getElementById(id);
  const token = pathParam();

  function show(id) {
    ['loading', 'not-found', 'load-error', 'deleted', 'app'].forEach((x) => $(x).classList.toggle('hidden', x !== id));
  }

  async function load() {
    let s;
    try {
      s = await rpc('get_request_status', { p_token: token });
    } catch (err) {
      if (err.code === 'not_found' || !token) return show('not-found');
      $('load-error-text').textContent = errorText(err);
      return show('load-error');
    }

    const first = s.employee_name.split(/\s+/)[0];
    const view = {
      pending: {
        word: 'Pending', title: 'Waiting for ' + first,
        text: first + " hasn't answered yet. Check back here any time.",
        step: 'Waiting for an answer',
      },
      referred: {
        word: 'Referred', title: 'You were referred',
        text: first + ' has referred you at ' + s.company + '. Watch your email for messages from ' + s.company + "'s recruiting team.",
        step: 'Referred',
      },
      declined: {
        word: 'Not this time', title: 'Not this time',
        text: s.decline_reason ? DECLINE_REASONS[s.decline_reason].candidate : 'Not this time.',
        step: 'Not this time',
      },
    }[s.status];

    $('status-box').classList.add('status-' + s.status);
    $('status-word').textContent = view.word;
    $('status-title').textContent = view.title;
    $('status-text').textContent = view.text;

    // The employee's own words, if they wrote a note when declining. Shown as plain text.
    if (s.status === 'declined' && s.decline_note) {
      if (s.decline_reason === 'other') $('status-text').textContent = first + " couldn't refer you this time.";
      $('status-note-who').textContent = 'A note from ' + first;
      $('status-note-text').textContent = s.decline_note;
      $('status-note').classList.remove('hidden');
    }

    // A broken resume link is fixable: offer a new request.
    if (s.status === 'declined' && s.decline_reason === 'resume_link') {
      $('retry').href = '/r/' + encodeURIComponent(s.board_slug);
      $('retry').classList.remove('hidden');
    }

    const answered = s.status !== 'pending';
    const step = (done, title, sub) =>
      h('li', { class: done ? 'tl-done' : '' },
        h('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
        h('div', null, h('div', { class: 'tl-title' }, title), h('div', { class: 'tl-sub' }, sub)));
    $('timeline').replaceChildren(
      step(true, 'Sent to ' + s.employee_name, s.company + ' · ' + formatDate(s.created_at)),
      step(answered, view.step, answered && s.decided_at ? formatDate(s.decided_at) : 'You can check this page any time'));

    $('job').append(/^https?:\/\//i.test(s.job_ref) ? safeLink(s.job_ref, s.job_ref) : s.job_ref);

    const link = location.origin + '/s/' + token;
    $('status-link').value = link;
    bindCopy($('copy-status'), () => link);
    $('email-status').href = mailtoHref(
      'My referral request to ' + s.employee_name + ' (' + s.company + ')',
      'Check the status of my referral request here:\n' + link + '\n\nKeep this link private.'
    );

    show('app');
    track('status_page_viewed', { status: s.status });
  }

  $('delete').addEventListener('click', async function () {
    if (!confirm('Delete your request? Your details will be removed for good, and the employee will no longer see it.')) return;
    this.disabled = true;
    try {
      await rpc('delete_request', { p_token: token });
      show('deleted');
    } catch (err) {
      this.disabled = false;
      toast(errorText(err));
    }
  });

  load();
})();
