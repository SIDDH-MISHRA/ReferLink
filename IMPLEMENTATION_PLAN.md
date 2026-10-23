# ReferLink Implementation Plan

**Based on:** PRD.md (approved 24 Oct 2026) · **Stack:** plain HTML/CSS/JS, Supabase (Postgres), PostHog, Vercel

Items marked **✋ Siddh** are things only you can do, such as accounts and keys. Everything else is built by Claude.

---

## 1. Pages

| URL | File | What it does |
|---|---|---|
| `/` | `index.html` | Landing page with one button: **Create my referral link** |
| `/create` | `create.html` | Employee board form, followed by the "Save your links" screen |
| `/r/<slug>` | `board.html` | Public board where candidates submit a request |
| `/d/<secret>` | `dashboard.html` | Employee's private queue |
| `/s/<token>` | `status.html` | Candidate's private status page, with delete |
| `/privacy` | `privacy.html` | What we collect and who sees it, in plain words |

Each page is a plain HTML file. `vercel.json` maps the short URLs to the right file.
**Why:** No framework, so every file can be read and explained on its own.

---

## 2. Database tables

### `boards`
| Field | Notes |
|---|---|
| `id` | Random ID (uuid) |
| `slug` | Public link name, e.g. `priya-sharma-google-a3f9` |
| `dashboard_token_hash` | A **fingerprint** (SHA-256) of the secret dashboard token. The token itself is never stored. |
| `name`, `company`, `linkedin_url` | Required |
| `refers_for`, `note` | Optional, up to 200 characters each |
| `created_at` | Time |

### `requests`
| Field | Notes |
|---|---|
| `id`, `board_id` | `board_id` links the request to its board |
| `status_token_hash` | Fingerprint of the candidate's status token |
| `candidate_name`, `candidate_email`, `candidate_linkedin`, `job_ref`, `resume_url`, `why_fit` | The candidate's details. All of them are wiped when the candidate deletes the request. |
| `job_ref_norm` | The job ID or link in lowercase. Used to catch duplicates. |
| `status` | `pending`, `referred` or `declined` |
| `decline_reason` | `role_mismatch`, `experience`, `resume_link`, `job_closed` or `other` |
| `created_at`, `decided_at`, `updated_at`, `deleted_at` | `decided_at` is the **first** decision only, so the speed metric can't be gamed by changing a decision later |

**Delete keeps an anonymous row.** When a candidate deletes a request, every personal field is wiped. Only the board, status, reason and timestamps stay.
**Why:** The candidate's data is gone, but the metrics stay honest. Without this, a deleted request would silently drop out of the North Star.

---

## 3. Database functions (the only way in)

The browser can't read or write the tables directly. It can only call these 7 functions.

| Function | Needs | Can do |
|---|---|---|
| `create_board` | nothing | Create a board and return the public slug plus the secret dashboard token (shown once) |
| `get_public_board` | public slug | Read the board's public info: name, company, roles, note |
| `submit_request` | public slug | Create **one** request and return the candidate's status token (shown once) |
| `get_dashboard` | dashboard secret | Read **that board's** requests |
| `decide_request` | dashboard secret | Mark one of **that board's** requests as Referred or Declined |
| `get_request_status` | status token | Read **one** request's status |
| `delete_request` | status token | Wipe **one** request's personal data |

Anti-spam checks inside the functions:
1. **Honeypot:** a hidden "website" field. People can't see it, but bots fill it in. If it's filled, the request is rejected.
2. **Duplicates:** one open request per email, per job, per board. A declined request doesn't block a new one.
3. **Hourly limits:** at most 20 requests per board per hour, and at most 50 new boards per hour across the site.
4. Every field is checked again on the server, even though the form checks it first.

---

## 4. Security in plain words (for interviews)

1. **The database key in the browser is public by design.** Anyone can find it. So the key alone must not let anyone read anything.
2. **Row Level Security is on, with no rules that allow reading.** Using the public key to read the tables directly returns nothing.
3. **The only doors are 7 functions.** Each one checks a token and does exactly one job. Think of it as a bank counter: you never walk into the vault, and the clerk checks your slip.
4. **Three kinds of key, three levels of access:**
   - The public link can only *add* a request.
   - The dashboard secret can only manage *that one board*.
   - The status token can only see or delete *that one request*.
5. **Tokens can't be guessed.** Each is 64 random characters, which is more combinations than there are atoms on Earth.
6. **We store fingerprints, not tokens.** If the database leaked, the stored values couldn't be turned back into working links. This is the same idea as storing password hashes.
7. **Links don't leak.** A `no-referrer` policy stops private URLs from being sent to LinkedIn or Google Drive when someone clicks a link on the dashboard. Private pages also tell search engines not to index them.
8. **Analytics gets no personal data.** No names, emails or links are sent. Secret tokens are scrubbed from page URLs before anything goes to PostHog.
9. **Candidate text is shown as plain text, never as code.** This blocks script injection (XSS) through the "Why you fit" box.

---

## 5. Analytics events

| Event | When | Properties |
|---|---|---|
| `board_created` | Board saved | `board_id`, `has_refers_for`, `has_note` |
| `public_link_copied` | Copy public link or LinkedIn text | `where` (save screen / dashboard), `what` |
| `request_form_viewed` | Public board opens | `board_id` |
| `request_form_started` | First typing in the form | `board_id` |
| `request_form_step_viewed` | Each of the 5 question screens opens | `board_id`, `step`, `step_name` |
| `request_form_blocked` | A step or submit stopped by a check | `board_id`, `fields`, `source` (browser / server), `step` |
| `request_submitted` | Request saved | `board_id`, `job_ref_type` (link / id) |
| `dashboard_viewed` | Dashboard opens | `board_id`, `pending_count`, `total_count` |
| `decision_made` | Referred or Declined | `board_id`, `type`, `reason`, `hours_to_decision`, `is_first_decision` |
| `status_page_viewed` | Status page opens | `status` |

`board_id` is a random ID, not a name. It lets us group events by board without identifying anyone.

---

## 6. Time-boxed build (about 10 hours)

| Block | Time | Slice | Done when |
|---|---|---|---|
| 1 | 0:00–1:00 | Setup: folders, plan, local test database | The local server runs |
| 2 | 1:00–2:30 | Database: tables, security, 7 functions, automated tests | All SQL tests pass |
| 3 | 2:30–3:45 | Board creation and save screen | A board can be created and both links work |
| 4 | 3:45–5:15 | Candidate form, checks and status link | A request can be submitted, and bad input is blocked with a clear message |
| 5 | 5:15–6:45 | Dashboard: list, filters, Referred / Decline | Decisions save and show up for the candidate |
| 6 | 6:45–7:30 | Status page and delete | A candidate sees the outcome and can delete |
| 7 | 7:30–8:15 | Analytics | Events fire, with no personal data |
| 8 | 8:15–10:00 | Polish, deploy, test on desktop and phone | Every flow works on the live URL |

---

## 7. Deployment steps

1. **✋ Siddh: Supabase.** Create a free account and a new project (Mumbai region is closest).
2. **✋ Siddh: Run the database file.** Open the SQL Editor, paste all of `supabase/schema.sql` and click Run.
3. **✋ Siddh: Share 2 values.** From Project Settings → API, copy the **Project URL** and the **publishable (anon) key**. Both are safe to make public. Never share the `service_role` or secret key.
4. **✋ Siddh: PostHog.** Create a free account (US or EU cloud) and copy the **Project API key**. In project settings, turn on **"Discard client IP data"**.
5. Claude puts the 3 values into `public/js/config.js`.
6. **✋ Siddh: GitHub.** Create a **private** repo called `referlink`. Claude pushes the code.
7. **✋ Siddh: Vercel.** Import the repo. No build settings are needed, since `vercel.json` handles everything.
8. Claude puts the live domain into the link-preview tags, then tests every flow on desktop and phone.

---

## 8. How to run it locally (no accounts needed)

```bash
cd dev && npm install && npm start
```

Then open http://localhost:3000. The local server runs a real Postgres database inside Node (PGlite) and loads the same `supabase/schema.sql` file. Local testing therefore exercises the exact SQL that goes live.
**Why:** It lets us build and test everything before any accounts exist. It's only a test tool and is never deployed.
