// /s/<token>: the candidate sees the outcome of one request, and can delete it.
(function () {
  const { rpc, track, safeLink, bindCopy, mailtoHref, formatDate, errorText, toast, pathParam, DECLINE_REASONS } = window.RL;
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
        icon: '…', title: 'Pending',
        text: 'Waiting for ' + first + ' to review your request. Check back here later.',
      },
      referred: {
        icon: '✓', title: 'Referred ✓',
        text: first + ' has referred you at ' + s.company + '. Watch your email for messages from ' + s.company + "'s recruiting team.",
      },
      declined: {
        icon: '–', title: 'Not this time',
        text: s.decline_reason ? DECLINE_REASONS[s.decline_reason].candidate : 'Not this time.',
      },
    }[s.status];

    $('status-box').classList.add('status-' + s.status);
    $('status-icon').textContent = view.icon;
    $('status-title').textContent = view.title;
    $('status-text').textContent = view.text;

    // A broken resume link is fixable: offer a new request.
    if (s.status === 'declined' && s.decline_reason === 'resume_link') {
      $('retry').href = '/r/' + encodeURIComponent(s.board_slug);
      $('retry').classList.remove('hidden');
    }

    $('to').textContent = s.employee_name + ', ' + s.company;
    $('job').append(/^https?:\/\//i.test(s.job_ref) ? safeLink(s.job_ref, s.job_ref) : s.job_ref);
    $('sent').textContent = formatDate(s.created_at);
    if (s.decided_at && s.status !== 'pending') {
      $('answered').textContent = formatDate(s.decided_at);
      document.querySelectorAll('.decided-row').forEach((el) => el.classList.remove('hidden'));
    }

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
