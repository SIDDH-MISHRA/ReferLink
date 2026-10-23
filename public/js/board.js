// /r/<slug>: a candidate reads the employee's board and sends a request.
(function () {
  const { rpc, track, check, withHttps, setFieldError, bindCopy, mailtoHref, errorText, safeLink, initials, pathParam } = window.RL;
  const $ = (id) => document.getElementById(id);
  const slug = pathParam();
  let board = null;

  const inputs = {
    name: $('name'),
    email: $('email'),
    linkedin_url: $('linkedin'),
    job_ref: $('job_ref'),
    resume_url: $('resume'),
    why_fit: $('why'),
    consent: $('consent'),
  };

  const MESSAGES = {
    name: 'Enter your full name.',
    email: 'Enter a valid email, like name@gmail.com.',
    linkedin_url: 'Paste your LinkedIn profile link, like linkedin.com/in/your-name.',
    job_ref: 'Paste the job link, or a job ID with numbers in it (like JR-104523).',
    resume_url: 'Paste a link to your resume, like a Google Drive link.',
    why_fit: 'Write at least 20 characters, and at most 300.',
    consent: 'Tick this box so we can share your request.',
  };

  function show(id) {
    ['loading', 'not-found', 'load-error', 'form-view', 'done-view'].forEach((x) => $(x).classList.toggle('hidden', x !== id));
  }

  async function load() {
    try {
      board = await rpc('get_public_board', { p_slug: slug });
    } catch (err) {
      if (err.code === 'not_found' || !slug) return show('not-found');
      $('load-error-text').textContent = errorText(err);
      return show('load-error');
    }
    const first = board.name.split(/\s+/)[0];
    document.title = 'Request a referral from ' + board.name + ' · ReferLink';
    $('avatar').textContent = initials(board.name);
    $('employee-name').textContent = board.name;
    $('employee-company').textContent = board.company;
    document.querySelectorAll('.employee-first').forEach((el) => { el.textContent = first; });
    if (board.refers_for) {
      $('refers-for').append(Object.assign(document.createElement('strong'), { textContent: 'Refers for: ' }), board.refers_for);
    } else {
      $('refers-for').classList.add('hidden');
    }
    if (board.note) {
      $('employee-note').textContent = board.note;
      $('employee-note').classList.remove('hidden');
    }
    $('employee-linkedin').append(safeLink(board.linkedin_url, 'View ' + first + "'s LinkedIn profile ↗"));
    show('form-view');
    track('request_form_viewed', { board_id: board.board_id });
  }

  // request_form_started: the first time the candidate types anything.
  let started = false;
  $('request-form').addEventListener('input', function () {
    if (started || !board) return;
    started = true;
    track('request_form_started', { board_id: board.board_id });
  });

  inputs.why_fit.addEventListener('input', function () {
    const n = inputs.why_fit.value.trim().length;
    $('why-counter').textContent = n + ' / 300';
    $('why-counter').classList.toggle('over', n > 300);
  });
  Object.values(inputs).forEach((input) => {
    input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => setFieldError(input, null));
  });

  function validate(v) {
    const bad = [];
    if (v.name.length < 2 || v.name.length > 80) bad.push('name');
    if (!check.email(v.email)) bad.push('email');
    if (!check.linkedin(v.linkedin_url)) bad.push('linkedin_url');
    if (!check.jobRef(v.job_ref)) bad.push('job_ref');
    if (!check.url(v.resume_url)) bad.push('resume_url');
    if (v.why_fit.length < 20 || v.why_fit.length > 300) bad.push('why_fit');
    if (!v.consent) bad.push('consent');
    return bad;
  }

  $('request-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const formError = $('form-error');
    const button = this.querySelector('button[type="submit"]');
    formError.classList.add('hidden');

    // Add https:// to links typed without it.
    inputs.linkedin_url.value = withHttps(inputs.linkedin_url.value);
    inputs.resume_url.value = withHttps(inputs.resume_url.value);
    inputs.job_ref.value = withHttps(inputs.job_ref.value);

    const v = {
      name: inputs.name.value.trim(),
      email: inputs.email.value.trim(),
      linkedin_url: inputs.linkedin_url.value.trim(),
      job_ref: inputs.job_ref.value.trim(),
      resume_url: inputs.resume_url.value.trim(),
      why_fit: inputs.why_fit.value.trim(),
      consent: inputs.consent.checked,
    };

    const bad = validate(v);
    Object.keys(inputs).forEach((k) => setFieldError(inputs[k], bad.includes(k) ? MESSAGES[k] : null));
    if (bad.length) {
      inputs[bad[0]].focus();
      track('request_form_blocked', { board_id: board.board_id, fields: bad, source: 'browser' });
      return;
    }

    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const res = await rpc('submit_request', {
        p_slug: slug,
        p_name: v.name,
        p_email: v.email,
        p_linkedin_url: v.linkedin_url,
        p_job_ref: v.job_ref,
        p_resume_url: v.resume_url,
        p_why_fit: v.why_fit,
        p_consent: v.consent,
        p_website: $('website').value,
      });
      track('request_submitted', { board_id: board.board_id, job_ref_type: /^https?:\/\//i.test(v.job_ref) ? 'link' : 'id' });
      showDone(res.status_token);
    } catch (err) {
      if (err.code === 'invalid' && inputs[err.field]) {
        setFieldError(inputs[err.field], MESSAGES[err.field]);
        inputs[err.field].focus();
        track('request_form_blocked', { board_id: board.board_id, fields: [err.field], source: 'server' });
      } else {
        formError.textContent = errorText(err);
        formError.classList.remove('hidden');
        formError.scrollIntoView({ block: 'center' });
        if (err.code === 'duplicate' || err.code === 'rate_limited') {
          track('request_form_blocked', { board_id: board.board_id, fields: [], source: 'server', reason: err.code });
        }
      }
    } finally {
      button.disabled = false;
      button.textContent = 'Send request';
    }
  });

  function showDone(token) {
    const link = location.origin + '/s/' + token;
    $('status-link').value = link;
    bindCopy($('copy-status'), () => link);
    $('email-status').href = mailtoHref(
      'My referral request to ' + board.name + ' (' + board.company + ')',
      'Check the status of my referral request here:\n' + link + '\n\nKeep this link private.'
    );
    $('open-status').href = link;
    show('done-view');
    window.scrollTo(0, 0);
  }

  load();
})();
