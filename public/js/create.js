// /create: the employee creates a board, then saves their two links.
(function () {
  const { rpc, track, check, withHttps, setFieldError, bindCopy, mailtoHref, errorText, avatar, roleChips } = window.RL;
  const $ = (id) => document.getElementById(id);

  const form = $('create-form');
  const formError = $('form-error');
  const button = form.querySelector('button[type="submit"]');
  const inputs = {
    name: $('name'),
    company: $('company'),
    linkedin_url: $('linkedin'),
    refers_for: $('refers_for'),
    note: $('note'),
  };

  const MESSAGES = {
    name: 'Enter your full name.',
    company: 'Enter the company you work at.',
    linkedin_url: 'Paste your LinkedIn profile link, like linkedin.com/in/your-name.',
    refers_for: 'Keep this under 200 characters.',
    note: 'Keep your note under 200 characters.',
  };

  inputs.note.addEventListener('input', function () {
    $('note-counter').textContent = inputs.note.value.length + ' / 200';
  });
  Object.values(inputs).forEach((input) => input.addEventListener('input', () => setFieldError(input, null)));

  // Live preview of the public board, updated as the employee types (desktop only).
  function updatePreview() {
    const name = inputs.name.value.trim();
    const roles = inputs.refers_for.value.trim();
    const note = inputs.note.value.trim();
    const av = avatar(name || '?', 'lg');
    av.id = 'pv-avatar';
    $('pv-avatar').replaceWith(av);
    $('pv-name').textContent = name || 'Your name';
    $('pv-company').textContent = inputs.company.value.trim() || 'Company';
    $('pv-roles').replaceChildren(...roleChips(roles));
    $('pv-roles-wrap').classList.toggle('hidden', !roles);
    $('pv-note').textContent = note;
    $('pv-note').classList.toggle('hidden', !note);
  }
  $('create-form').addEventListener('input', updatePreview);
  updatePreview();

  function validate(v) {
    const bad = [];
    if (v.name.length < 2 || v.name.length > 80) bad.push('name');
    if (v.company.length < 2 || v.company.length > 80) bad.push('company');
    if (!check.linkedin(v.linkedin_url)) bad.push('linkedin_url');
    if (v.refers_for.length > 200) bad.push('refers_for');
    if (v.note.length > 200) bad.push('note');
    return bad;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    formError.classList.add('hidden');
    inputs.linkedin_url.value = withHttps(inputs.linkedin_url.value);

    const v = {};
    Object.keys(inputs).forEach((k) => { v[k] = inputs[k].value.trim(); });

    const bad = validate(v);
    Object.keys(inputs).forEach((k) => setFieldError(inputs[k], bad.includes(k) ? MESSAGES[k] : null));
    if (bad.length) {
      inputs[bad[0]].focus();
      return;
    }

    const label = Array.from(button.childNodes).map((n) => n.cloneNode(true));
    button.disabled = true;
    button.textContent = 'Creating…';
    try {
      const res = await rpc('create_board', {
        p_name: v.name,
        p_company: v.company,
        p_linkedin_url: v.linkedin_url,
        p_refers_for: v.refers_for,
        p_note: v.note,
        p_website: $('website').value,
      });
      track('board_created', { board_id: res.board_id, has_refers_for: !!v.refers_for, has_note: !!v.note });
      showLinks(res, v.company);
    } catch (err) {
      if (err.code === 'invalid' && inputs[err.field]) {
        setFieldError(inputs[err.field], MESSAGES[err.field]);
        inputs[err.field].focus();
      } else {
        formError.textContent = errorText(err);
        formError.classList.remove('hidden');
      }
    } finally {
      button.disabled = false;
      button.replaceChildren(...label);
    }
  });

  function showLinks(res, company) {
    const publicLink = location.origin + '/r/' + res.slug;
    const dashboardLink = location.origin + '/d/' + res.dashboard_token;
    const line = 'Want a referral from me at ' + company + '? Send a request here: ' + publicLink;

    // Warn before leaving until the private link has been saved somewhere.
    let saved = false;
    const markSaved = () => { saved = true; };
    window.addEventListener('beforeunload', function (e) {
      if (!saved) { e.preventDefault(); e.returnValue = ''; }
    });

    $('public-link').value = publicLink;
    $('dashboard-link').value = dashboardLink;
    $('linkedin-line').textContent = line;

    bindCopy($('copy-public'), () => publicLink, () => track('public_link_copied', { where: 'save_screen', what: 'link', board_id: res.board_id }));
    bindCopy($('copy-line'), () => line, () => track('public_link_copied', { where: 'save_screen', what: 'linkedin_text', board_id: res.board_id }));
    bindCopy($('copy-dashboard'), () => dashboardLink, markSaved);

    const email = $('email-dashboard');
    email.href = mailtoHref(
      'My ReferLink dashboard (keep private)',
      'My private ReferLink dashboard:\n' + dashboardLink +
      '\n\nAnyone with this link can manage my referral requests. Do not share it.' +
      '\n\nMy public link to share:\n' + publicLink
    );
    email.addEventListener('click', markSaved);

    const open = $('open-dashboard');
    open.href = dashboardLink;
    open.addEventListener('click', markSaved);

    $('form-view').classList.add('hidden');
    $('done-view').classList.remove('hidden');
    window.scrollTo(0, 0);
  }
})();
